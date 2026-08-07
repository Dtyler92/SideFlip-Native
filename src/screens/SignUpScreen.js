import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert } from 'react-native'
import { useAuth } from '../context/AuthContext'

export default function SignUpScreen({ navigation }) {
  const { signUp } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignUp() {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || !password) return Alert.alert('Enter your email and password')
    if (password.length < 6) return Alert.alert('Use a password with at least 6 characters')
    if (password !== confirmPassword) return Alert.alert('Passwords do not match')
    setLoading(true)
    try {
      const data = await signUp(normalizedEmail, password)
      if (!data.session) {
        Alert.alert('Confirm your email', `Check ${normalizedEmail} for a confirmation link, then sign in to use SideFlip Free.`)
        navigation.replace('Login')
      }
    } catch (error) {
      Alert.alert('Could not create account', error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>Create your Free account</Text>
        <Text style={s.subtitle}>Track projects, expenses, profit, and one Trade-Up Goal. No card required.</Text>
        <View style={s.card}>
          <Text style={s.label}>Email</Text>
          <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="you@email.com" placeholderTextColor="#A8A49E" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          <Text style={[s.label, { marginTop: 16 }]}>Password</Text>
          <TextInput style={s.input} value={password} onChangeText={setPassword} placeholder="Choose a password (6+ characters)" placeholderTextColor="#A8A49E" secureTextEntry autoComplete="new-password" />
          <Text style={[s.label, { marginTop: 16 }]}>Confirm password</Text>
          <TextInput style={s.input} value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Re-enter your password" placeholderTextColor="#A8A49E" secureTextEntry autoComplete="new-password" />
          <TouchableOpacity style={[s.btn, loading && s.disabled]} onPress={handleSignUp} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Create Free Account</Text>}
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.signInLink}><Text style={s.link}>Already have an account? Sign in</Text></TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAF7' }, scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: '800', color: '#1A1917', marginBottom: 8 }, subtitle: { color: '#5C5850', lineHeight: 21, marginBottom: 24 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  label: { fontSize: 13, fontWeight: '600', color: '#5C5850', marginBottom: 6 }, input: { borderWidth: 1, borderColor: '#E8E4DE', borderRadius: 10, padding: 14, fontSize: 15, color: '#1A1917', backgroundColor: '#FAFAF7' },
  btn: { backgroundColor: '#C8402F', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 22 }, disabled: { opacity: 0.6 }, btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  signInLink: { alignItems: 'center', marginTop: 24 }, link: { color: '#C8402F', fontWeight: '700', fontSize: 14 },
})
