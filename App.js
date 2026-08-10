import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useRef } from 'react'
import { ActivityIndicator, AppState, View, Text } from 'react-native'
import { AuthProvider, useAuth } from './src/context/AuthContext'
import LoginScreen from './src/screens/LoginScreen'
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen'
import SignUpScreen from './src/screens/SignUpScreen'
import HomeScreen from './src/screens/HomeScreen'
import NewProjectScreen from './src/screens/NewProjectScreen'
import ProjectDetailScreen from './src/screens/ProjectDetailScreen'
import SellProjectScreen from './src/screens/SellProjectScreen'
import CalculatorScreen from './src/screens/CalculatorScreen'
import TradeUpGoalsScreen from './src/screens/TradeUpGoalsScreen'
import AnalyticsScreen from './src/screens/AnalyticsScreen'
import SettingsScreen from './src/screens/SettingsScreen'
import ProScreen from './src/screens/ProScreen'
import DeleteAccountScreen from './src/screens/DeleteAccountScreen'
import OnboardingScreen from './src/screens/OnboardingScreen'
import { captureEvent, flushAnalytics, isAnalyticsReady } from './src/lib/analytics'
import { normalizeScreenName } from './src/lib/analyticsModel'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

function AnalyticsLifecycle({ onReady }) {
  const { analyticsReady } = useAuth()
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') captureEvent('app_opened')
      else if (state === 'background') flushAnalytics()
    })
    return () => subscription.remove()
  }, [])
  useEffect(() => {
    if (!analyticsReady || !isAnalyticsReady()) return
    captureEvent('app_opened')
    onReady()
  }, [analyticsReady, onReady])
  return null
}

function TabIcon({ emoji, focused }) {
  return <Text style={{ fontSize: focused ? 22 : 20, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
}

function HomeTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#E8E4DE',
          height: 84,
          paddingBottom: 28,
          paddingTop: 10,
        },
        tabBarActiveTintColor: '#C8402F',
        tabBarInactiveTintColor: '#A8A49E',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen name="Projects" component={HomeScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🔧" focused={focused} />, tabBarLabel: 'Projects' }} />
      <Tab.Screen name="Calculator" component={CalculatorScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🧮" focused={focused} />, tabBarLabel: 'Calculator' }} />
      <Tab.Screen name="Goals" component={TradeUpGoalsScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🎯" focused={focused} />, tabBarLabel: 'Goals' }} />
      <Tab.Screen name="Analytics" component={AnalyticsScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} />, tabBarLabel: 'Analytics' }} />
      <Tab.Screen name="Settings" component={SettingsScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="⚙️" focused={focused} />, tabBarLabel: 'Settings' }} />
    </Tab.Navigator>
  )
}

function RootNavigator() {
  const { user, loading, needsOnboarding, refreshProfile } = useAuth()

  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAF7' }}>
      <ActivityIndicator size="large" color="#C8402F" />
    </View>
  )

  if (!user) return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen}
        options={{ headerShown: true, title: 'Create Account', headerTintColor: '#C8402F', headerBackTitle: 'Back', headerStyle: { backgroundColor: '#FAFAF7' } }} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen}
        options={{ headerShown: true, title: 'Reset Password', headerTintColor: '#C8402F', headerBackTitle: 'Back', headerStyle: { backgroundColor: '#FAFAF7' } }} />
    </Stack.Navigator>
  )

  if (needsOnboarding) return (
    <OnboardingScreen onComplete={refreshProfile} />
  )

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={HomeTabs} />
      <Stack.Screen name="NewProject" component={NewProjectScreen} />
      <Stack.Screen name="ProjectDetail" component={ProjectDetailScreen} />
      <Stack.Screen name="SellProject" component={SellProjectScreen} />
      <Stack.Screen name="Pro" component={ProScreen} options={{ headerShown: true, title: 'SideFlip Pro', headerTintColor: '#C8402F', headerStyle: { backgroundColor: '#FAFAF7' } }} />
      <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  )
}

export default function App() {
  const navigationRef = useRef(null)
  const lastScreenRef = useRef(null)
  function trackScreen() {
    if (!isAnalyticsReady()) return
    const routeName = navigationRef.current?.getCurrentRoute()?.name
    const screen = normalizeScreenName(routeName)
    if (screen === lastScreenRef.current) return
    lastScreenRef.current = screen
    captureEvent('screen_viewed', { screen })
    if (screen === 'analytics') captureEvent('analytics_viewed', { screen })
  }
  function trackFirstReadyScreen() {
    lastScreenRef.current = null
    trackScreen()
  }
  return (
    <NavigationContainer ref={navigationRef} onReady={trackScreen} onStateChange={trackScreen}>
      <AuthProvider>
        <AnalyticsLifecycle onReady={trackFirstReadyScreen} />
        <StatusBar style="dark" />
        <RootNavigator />
      </AuthProvider>
    </NavigationContainer>
  )
}
