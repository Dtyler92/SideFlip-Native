import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const ACCENT = '#C8402F'

const CURRENCIES = [
  { code: 'USD', symbol: '$', label: 'US Dollar' },
  { code: 'CAD', symbol: 'CA$', label: 'Canadian Dollar' },
  { code: 'GBP', symbol: '£', label: 'British Pound' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar' },
  { code: 'MXN', symbol: 'MX$', label: 'Mexican Peso' },
  { code: 'JPY', symbol: '¥', label: 'Japanese Yen' },
  { code: 'INR', symbol: '₹', label: 'Indian Rupee' },
]

const LANGUAGES = [
  { code: 'en', label: '🇺🇸 English' },
  { code: 'es', label: '🇪🇸 Español' },
  { code: 'fr', label: '🇫🇷 Français' },
  { code: 'de', label: '🇩🇪 Deutsch' },
  { code: 'pt', label: '🇧🇷 Português' },
  { code: 'ja', label: '🇯🇵 日本語' },
]

export default function OnboardingScreen({ onComplete }) {
  const { user, signOut } = useAuth()
  const [currency, setCurrency] = useState('USD')
  const [language, setLanguage] = useState('en')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Please sign in again.')
      const response = await fetch('https://sideflip.org/api/update-profile-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ currency, language, onboarded: true }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Could not save preferences.')
      onComplete({ currency, language })
    } catch (error) {
      Alert.alert('Error', error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <View style={s.logoRow}>
        <Text style={s.logo}><Text style={s.logoSide}>Side</Text><Text style={s.logoFlip}>Flip</Text></Text>
      </View>
      <Text style={s.heading}>Welcome! Let's set up your account.</Text>
      <Text style={s.sub}>You can change these anytime in Settings.</Text>

      {/* Currency */}
      <Text style={s.sectionTitle}>Currency</Text>
      <View style={s.grid}>
        {CURRENCIES.map(c => (
          <TouchableOpacity
            key={c.code}
            style={[s.chip, currency === c.code && s.chipActive]}
            onPress={() => setCurrency(c.code)}
          >
            <Text style={[s.chipSymbol, currency === c.code && s.chipTextActive]}>{c.symbol}</Text>
            <Text style={[s.chipCode, currency === c.code && s.chipTextActive]}>{c.code}</Text>
            <Text style={[s.chipLabel, currency === c.code && s.chipLabelActive]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Language */}
      <Text style={s.sectionTitle}>Language</Text>
      <View style={s.langGrid}>
        {LANGUAGES.map(l => (
          <TouchableOpacity
            key={l.code}
            style={[s.langChip, language === l.code && s.chipActive]}
            onPress={() => setLanguage(l.code)}
          >
            <Text style={[s.langLabel, language === l.code && s.chipTextActive]}>{l.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={[s.btn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Get Started</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={signOut} style={s.backButton} disabled={saving}>
        <Text style={s.backText}>← Back to Sign In</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAF7' },
  content: { padding: 24, paddingBottom: 60 },
  logoRow: { alignItems: 'center', marginTop: 48, marginBottom: 28 },
  logo: { fontSize: 42, fontWeight: '800', letterSpacing: -0.5 },
  logoSide: { color: '#1A1917' },
  logoFlip: { color: '#C8402F' },
  heading: { fontSize: 22, fontWeight: '800', color: '#1A1917', marginBottom: 6, textAlign: 'center' },
  sub: { fontSize: 14, color: '#8C8880', marginBottom: 28, textAlign: 'center' },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#8C8880', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12, marginTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  chip: { width: '47%', borderRadius: 12, borderWidth: 1.5, borderColor: '#E8E4DE', backgroundColor: '#fff', padding: 12, alignItems: 'center' },
  chipActive: { borderColor: ACCENT, backgroundColor: '#FDF1EF' },
  chipSymbol: { fontSize: 22, fontWeight: '700', color: '#1A1917', marginBottom: 2 },
  chipCode: { fontSize: 13, fontWeight: '700', color: '#1A1917' },
  chipLabel: { fontSize: 11, color: '#A8A49E', marginTop: 2 },
  chipTextActive: { color: ACCENT },
  chipLabelActive: { color: '#C8402F99' },
  langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 32 },
  langChip: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#E8E4DE', backgroundColor: '#fff' },
  langLabel: { fontSize: 15, color: '#1A1917', fontWeight: '500' },
  btn: { backgroundColor: ACCENT, borderRadius: 12, padding: 16, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  backButton: { alignItems: 'center', padding: 16, marginTop: 8 },
  backText: { color: ACCENT, fontSize: 15, fontWeight: '700' },
})
