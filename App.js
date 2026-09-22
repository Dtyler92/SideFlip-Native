import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { StatusBar } from 'expo-status-bar'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, ActivityIndicator, Alert, AppState, Platform, View, Text } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SafeAreaProvider, initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context'
import { AuthProvider, useAuth } from './src/context/AuthContext'
import LoginScreen from './src/screens/LoginScreen'
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen'
import SignUpScreen from './src/screens/SignUpScreen'
import HomeScreen from './src/screens/HomeScreen'
import NewProjectScreen from './src/screens/NewProjectScreen'
import ProjectDetailScreen from './src/screens/ProjectDetailScreen'
import SellProjectScreen from './src/screens/SellProjectScreen'
import AnalyzeScreen from './src/screens/AnalyzeScreen'
import TradeUpGoalsScreen from './src/screens/TradeUpGoalsScreen'
import GoalCreateScreen from './src/screens/GoalCreateScreen'
import AnalyticsScreen from './src/screens/AnalyticsScreen'
import MyStuffScreen from './src/screens/MyStuffScreen'
import MyStuffCreateScreen from './src/screens/MyStuffCreateScreen'
import MyStuffDetailScreen from './src/screens/MyStuffDetailScreen'
import SettingsScreen from './src/screens/SettingsScreen'
import ProScreen from './src/screens/ProScreen'
import DeleteAccountScreen from './src/screens/DeleteAccountScreen'
import OnboardingScreen from './src/screens/OnboardingScreen'
import TutorialOverlay from './src/components/TutorialOverlay'
import { captureEvent, flushAnalytics, isAnalyticsReady } from './src/lib/analytics'
import { normalizeScreenName } from './src/lib/analyticsModel'
import { advanceTutorial, getTutorialPrompt, hasCompletedTutorial, markTutorialCompleted } from './src/lib/tutorialModel'
import { getTutorialContentAccessibilityProps } from './src/lib/tutorialAccessibility'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()
const ANDROID_NAV_COMFORT = 10
const TutorialModeContext = createContext(false)

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

function TutorialScreenContent({ children }) {
  const tutorialActive = useContext(TutorialModeContext)
  const { accessibilityElementsHidden, importantForAccessibility } = getTutorialContentAccessibilityProps(tutorialActive)
  return (
    <View
      style={{ flex: 1 }}
      accessibilityElementsHidden={accessibilityElementsHidden}
      importantForAccessibility={importantForAccessibility}
    >
      {children}
    </View>
  )
}

function tutorialScreenLayout({ children }) {
  return <TutorialScreenContent>{children}</TutorialScreenContent>
}

function HomeTabs({ navigation, route, tutorialMode, onTutorialComplete }) {
  const insets = useSafeAreaInsets()
  const navComfort = Platform.OS === 'android' ? ANDROID_NAV_COMFORT : 0
  const tabBarHeight = 56 + insets.bottom + navComfort
  const mode = tutorialMode || route?.params?.tutorialMode || null
  const tutorialSession = route?.params?.tutorialSession
  const [tutorialStep, setTutorialStep] = useState(0)
  const [tutorialSaving, setTutorialSaving] = useState(false)

  useEffect(() => {
    if (mode) setTutorialStep(0)
  }, [mode, tutorialSession])

  function handleTutorialTabPress(routeName, event) {
    if (!mode) return
    const result = advanceTutorial(tutorialStep, routeName)
    if (!result.accepted) {
      event.preventDefault()
      const expected = getTutorialPrompt(tutorialStep).expected
      if (expected) AccessibilityInfo.announceForAccessibility(`Continue the walkthrough with the ${expected.label} tab.`)
      return
    }
    setTutorialStep(result.nextStepIndex)
  }

  async function closeTutorial() {
    if (tutorialSaving) return
    if (mode === 'replay') {
      navigation.setParams({ tutorialMode: undefined, tutorialSession: undefined })
      return
    }
    if (mode !== 'first-run') return
    setTutorialSaving(true)
    try {
      await markTutorialCompleted(AsyncStorage)
      onTutorialComplete?.()
    } catch {
      Alert.alert('Could not finish the walkthrough', 'SideFlip could not save your progress. Please try again.')
      setTutorialSaving(false)
    }
  }

  const tabAccessibilityLabel = label => mode
    ? `${label} tab. ${getTutorialPrompt(tutorialStep).expected?.label === label ? 'Next walkthrough step.' : 'Follow the walkthrough instruction.'}`
    : `${label} tab`

  return (
    <View style={{ flex: 1 }}>
      <TutorialModeContext.Provider value={Boolean(mode)}>
        <Tab.Navigator
          screenLayout={tutorialScreenLayout}
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: '#fff',
              borderTopColor: '#E8E4DE',
              height: tabBarHeight,
              paddingBottom: insets.bottom + navComfort,
              paddingTop: 10,
            },
            tabBarActiveTintColor: '#C8402F',
            tabBarInactiveTintColor: '#A8A49E',
            tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          }}
        >
          <Tab.Screen name="Projects" component={HomeScreen}
            listeners={{ tabPress: event => handleTutorialTabPress('Projects', event) }}
            options={{ tabBarAccessibilityLabel: tabAccessibilityLabel('Projects'), tabBarIcon: ({ focused }) => <TabIcon emoji="🔧" focused={focused} />, tabBarLabel: 'Projects' }} />
          <Tab.Screen name="Analyze" component={AnalyzeScreen}
            listeners={{ tabPress: event => handleTutorialTabPress('Analyze', event) }}
            options={{ tabBarAccessibilityLabel: tabAccessibilityLabel('Analyze'), tabBarIcon: ({ focused }) => <TabIcon emoji="📈" focused={focused} />, tabBarLabel: 'Analyze' }} />
          <Tab.Screen name="Goals" component={TradeUpGoalsScreen}
            listeners={{ tabPress: event => handleTutorialTabPress('Goals', event) }}
            options={{ tabBarAccessibilityLabel: tabAccessibilityLabel('Goals'), tabBarIcon: ({ focused }) => <TabIcon emoji="🎯" focused={focused} />, tabBarLabel: 'Goals' }} />
          <Tab.Screen name="Analytics" component={AnalyticsScreen}
            listeners={{ tabPress: event => handleTutorialTabPress('Analytics', event) }}
            options={{ tabBarAccessibilityLabel: tabAccessibilityLabel('Analytics'), tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} />, tabBarLabel: 'Analytics' }} />
          <Tab.Screen name="MyStuff" component={MyStuffScreen}
            listeners={{ tabPress: event => handleTutorialTabPress('MyStuff', event) }}
            options={{ tabBarAccessibilityLabel: tabAccessibilityLabel('My Stuff'), tabBarIcon: ({ focused }) => <TabIcon emoji="🧰" focused={focused} />, tabBarLabel: 'My Stuff' }} />
        </Tab.Navigator>
      </TutorialModeContext.Provider>
      {mode && (
        <TutorialOverlay
          bottom={tabBarHeight}
          stepIndex={tutorialStep}
          saving={tutorialSaving}
          onSkip={closeTutorial}
          onFinish={closeTutorial}
        />
      )}
    </View>
  )
}

function RootNavigator() {
  const { user, loading, needsOnboarding, refreshProfile } = useAuth()
  const [tutorialCheck, setTutorialCheck] = useState({ userId: null, status: 'checking' })
  const tutorialState = Platform.OS !== 'ios'
    ? 'complete'
    : tutorialCheck.userId === user?.id ? tutorialCheck.status : 'checking'

  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined
    if (!user || needsOnboarding) {
      setTutorialCheck({ userId: null, status: 'checking' })
      return undefined
    }

    let active = true
    const userId = user.id
    hasCompletedTutorial(AsyncStorage).then(completed => {
      if (active) setTutorialCheck({ userId, status: completed ? 'complete' : 'pending' })
    })
    return () => { active = false }
  }, [user?.id, needsOnboarding])

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

  if (tutorialState === 'checking') return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAF7' }}>
      <ActivityIndicator size="large" color="#C8402F" accessibilityLabel="Loading tutorial" />
    </View>
  )

  if (tutorialState === 'pending') return (
    <HomeTabs
      tutorialMode="first-run"
      onTutorialComplete={() => setTutorialCheck({ userId: user.id, status: 'complete' })}
    />
  )

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={HomeTabs} />
      <Stack.Screen name="NewProject" component={NewProjectScreen} />
      <Stack.Screen name="ProjectDetail" component={ProjectDetailScreen} />
      <Stack.Screen name="SellProject" component={SellProjectScreen} />
      <Stack.Screen name="GoalCreate" component={GoalCreateScreen} />
      <Stack.Screen name="MyStuffCreate" component={MyStuffCreateScreen} />
      <Stack.Screen name="MyStuffDetail" component={MyStuffDetailScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
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
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <NavigationContainer ref={navigationRef} onReady={trackScreen} onStateChange={trackScreen}>
        <AuthProvider>
          <AnalyticsLifecycle onReady={trackFirstReadyScreen} />
          <StatusBar style="dark" />
          <RootNavigator />
        </AuthProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  )
}
