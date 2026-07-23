import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native'
import { useAuth } from '../context/AuthContext'

export default function NoSubscriptionScreen() {
  const { signOut, user } = useAuth()
  return (
    <View style={s.root}>
      <View style={s.inner}>
        <Text style={s.logo}><Text style={s.logoSide}>Side</Text><Text style={s.logoFlip}>Flip</Text></Text>
        <Text style={s.title}>Subscription Required</Text>
        <Text style={s.body}>Your account ({user?.email}) doesn't have an active subscription.{'\n\n'}Visit sideflip.org to start your 7-day free trial, then sign in here.</Text>
        <TouchableOpacity style={s.btn} onPress={() => Linking.openURL('https://sideflip.org')}>
          <Text style={s.btnText}>Go to sideflip.org →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.signOutLink} onPress={signOut}>
          <Text style={s.link}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAF7', justifyContent: 'center' },
  inner: { padding: 32, alignItems: 'center' },
  logo: { fontSize: 44, fontWeight: '800', letterSpacing: -1, marginBottom: 32 },
  logoSide: { color: '#1A1917' },
  logoFlip: { color: '#C8402F' },
  title: { fontSize: 22, fontWeight: '700', color: '#1A1917', marginBottom: 12, textAlign: 'center' },
  body: { fontSize: 15, color: '#5C5850', lineHeight: 22, textAlign: 'center', marginBottom: 28 },
  btn: { backgroundColor: '#C8402F', borderRadius: 12, paddingVertical: 16, paddingHorizontal: 32, alignItems: 'center', width: '100%' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  signOutLink: { marginTop: 20 },
  link: { color: '#C8402F', fontWeight: '600', fontSize: 14 },
})
