import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useAuth } from '../context/AuthContext'

// Retained as a safe fallback for older navigation state. Free access is now the default.
export default function NoSubscriptionScreen() {
  const { signOut } = useAuth()
  return (
    <View style={s.root}>
      <View style={s.inner}>
        <Text style={s.title}>Welcome to SideFlip Free</Text>
        <Text style={s.body}>Your projects, expenses, individual profit tracking, and one Trade-Up Goal are ready to use.</Text>
        <TouchableOpacity style={s.signOutLink} onPress={signOut}><Text style={s.link}>Sign out</Text></TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAF7', justifyContent: 'center' }, inner: { padding: 32, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: '#1A1917', marginBottom: 12, textAlign: 'center' },
  body: { fontSize: 15, color: '#5C5850', lineHeight: 22, textAlign: 'center' }, signOutLink: { marginTop: 20 }, link: { color: '#C8402F', fontWeight: '600', fontSize: 14 },
})
