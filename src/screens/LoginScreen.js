import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert, Linking } from 'react-native'
import { useAuth } from '../context/AuthContext'

export default function LoginScreen({ navigation }) {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignIn() {
    if (!email.trim() || !password) return Alert.alert('Please enter your email and password')
    setLoading(true)
    try { await signIn(email.trim().toLowerCase(), password) }
    catch (err) { Alert.alert('Sign in failed', err.message) }
    finally { setLoading(false) }
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.logoWrap}>
          <Text style={s.logo}><Text style={s.logoSide}>Side</Text><Text style={s.logoFlip}>Flip</Text></Text>
          <Text style={s.tagline}>Track every flip. Know every profit.</Text>
        </View>
        <View style={s.card}>
          <Text style={s.label}>Email</Text>
          <TextInput style={s.input} placeholder="you@email.com" placeholderTextColor="#A8A49E"
            value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          <Text style={[s.label, { marginTop: 16 }]}>Password</Text>
          <TextInput style={s.input} placeholder="Your password" placeholderTextColor="#A8A49E"
            value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
          <TouchableOpacity style={[s.btn, loading && s.btnDisabled]} onPress={handleSignIn} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Sign In →</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')} style={s.linkRow}>
            <Text style={s.link}>Forgot password?</Text>
          </TouchableOpacity>
        </View>
        <View style={s.signupRow}>
          <Text style={s.mutedText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://sideflip.org')}>
            <Text style={s.link}>Sign up at sideflip.org</Text>
          </TouchableOpacity>
        </View>
        <View style={s.legalRow}>
          <TouchableOpacity onPress={() => Linking.openURL('https://sideflip.org/privacy')}><Text style={s.legalLink}>Privacy Policy</Text></TouchableOpacity>
          <Text style={s.legalDot}> · </Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://sideflip.org/terms')}><Text style={s.legalLink}>Terms of Service</Text></TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAF7' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoWrap: { alignItems: 'center', marginBottom: 36 },
  logo: { fontSize: 48, fontWeight: '800', letterSpacing: -1 },
  logoSide: { color: '#1A1917' },
  logoFlip: { color: '#C8402F' },
  tagline: { fontSize: 14, color: '#8C8880', marginTop: 6 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  label: { fontSize: 13, fontWeight: '600', color: '#5C5850', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#E8E4DE', borderRadius: 10, padding: 14, fontSize: 15, color: '#1A1917', backgroundColor: '#FAFAF7' },
  btn: { backgroundColor: '#C8402F', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 20 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  linkRow: { alignItems: 'center', marginTop: 16 },
  link: { color: '#C8402F', fontWeight: '700', fontSize: 14 },
  signupRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' },
  mutedText: { fontSize: 14, color: '#8C8880' },
  legalRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 32 },
  legalLink: { fontSize: 12, color: '#A8A49E' },
  legalDot: { fontSize: 12, color: '#A8A49E' },
})
