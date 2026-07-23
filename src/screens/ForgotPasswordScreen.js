import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native'
import { useAuth } from '../context/AuthContext'

export default function ForgotPasswordScreen({ navigation }) {
  const { resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleReset() {
    if (!email.trim()) return Alert.alert('Enter your email address')
    setLoading(true)
    try { await resetPassword(email.trim().toLowerCase()); setSent(true) }
    catch (err) { Alert.alert('Error', err.message) }
    finally { setLoading(false) }
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.inner}>
        <Text style={s.title}>Reset Password</Text>
        <Text style={s.sub}>We'll email you a link to reset your password.</Text>
        {sent ? (
          <View style={s.successBox}>
            <Text style={s.successText}>✅ Check your email for a reset link.</Text>
            <TouchableOpacity onPress={() => navigation.goBack()} style={[s.btn, { marginTop: 16 }]}>
              <Text style={s.btnText}>Back to Sign In</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TextInput style={s.input} placeholder="you@email.com" placeholderTextColor="#A8A49E"
              value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoFocus />
            <TouchableOpacity style={[s.btn, loading && s.btnDisabled]} onPress={handleReset} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Send Reset Email</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.goBack()} style={s.backLink}>
              <Text style={s.link}>← Back to Sign In</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAF7' },
  inner: { flex: 1, padding: 24, paddingTop: 60 },
  title: { fontSize: 26, fontWeight: '800', color: '#1A1917', marginBottom: 8 },
  sub: { fontSize: 14, color: '#8C8880', marginBottom: 28, lineHeight: 20 },
  input: { borderWidth: 1, borderColor: '#E8E4DE', borderRadius: 10, padding: 14, fontSize: 15, color: '#1A1917', backgroundColor: '#fff' },
  btn: { backgroundColor: '#C8402F', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 16 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  backLink: { alignItems: 'center', marginTop: 16 },
  link: { color: '#C8402F', fontWeight: '700', fontSize: 14 },
  successBox: { backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  successText: { fontSize: 15, color: '#1A1917', lineHeight: 22 },
})
