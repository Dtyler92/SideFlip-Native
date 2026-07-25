import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Linking } from 'react-native'
import { useState } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import * as FileSystem from 'expo-file-system'
import * as Sharing from 'expo-sharing'

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

export default function SettingsScreen() {
  const insets = useSafeAreaInsets()
  const { user, profile, signOut, refreshProfile } = useAuth()
  const [currency, setCurrency] = useState(profile?.currency || 'USD')
  const [language, setLanguage] = useState(profile?.language || 'en')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [exportingTax, setExportingTax] = useState(false)

  async function handleTaxExport() {
    setExportingTax(true)
    try {
      const year = new Date().getFullYear()
      const { data: projects } = await supabase
        .from('projects')
        .select('*, expenses(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })

      const { data: receipts } = await supabase
        .from('receipts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })

      if (!projects?.length) {
        Alert.alert('No Data', 'No projects found to export.')
        return
      }

      const rows = []
      rows.push(['Type','Project','Category','Description','Amount','Date','Status','Sale Price','Profit/Loss'].join(','))

      for (const p of projects) {
        const totalExpenses = (p.expenses||[]).reduce((s,e) => s + Number(e.amount), 0)
        const totalInvested = totalExpenses + Number(p.purchase_price || 0)
        const profit = p.sale_price ? Number(p.sale_price) - totalInvested : ''
        rows.push([
          'Project', `"${p.title}"`, p.category,
          'Purchase Price', Number(p.purchase_price||0).toFixed(2),
          p.created_at?.split('T')[0] || '',
          p.status, Number(p.sale_price||0).toFixed(2),
          profit !== '' ? Number(profit).toFixed(2) : ''
        ].join(','))
        for (const e of (p.expenses||[])) {
          rows.push([
            'Expense', `"${p.title}"`, e.category,
            `"${e.description}"`, Number(e.amount).toFixed(2),
            e.created_at?.split('T')[0] || '',
            '', '', ''
          ].join(','))
        }
      }

      for (const r of (receipts||[])) {
        rows.push([
          'Receipt', '', '',
          `"${r.description}"`, Number(r.amount).toFixed(2),
          r.created_at?.split('T')[0] || '',
          '', '', ''
        ].join(','))
      }

      const csv = rows.join('\n')
      const path = FileSystem.documentDirectory + `SideFlip_Tax_Report_${year}.csv`
      await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 })

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: `SideFlip Tax Report ${year}` })
      } else {
        Alert.alert('Saved', `Report saved to: ${path}`)
      }
    } catch (err) {
      Alert.alert('Export failed', err.message)
    } finally {
      setExportingTax(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ currency, language })
      .eq('id', user.id)
    setSaving(false)
    if (error) return Alert.alert('Error saving', error.message)
    await refreshProfile()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function confirmSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ])
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={[s.content, { paddingTop: insets.top + 20 }]}>
      <Text style={s.heading}>Settings</Text>

      {/* Account Info */}
      <Text style={s.sectionTitle}>Account</Text>
      <View style={s.card}>
        <Text style={s.accountEmail}>{user?.email}</Text>
      </View>

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

      {/* Save */}
      <TouchableOpacity style={[s.btn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
        {saving
          ? <ActivityIndicator color="#fff" />
          : <Text style={s.btnText}>{saved ? '✓ Saved!' : 'Save Changes'}</Text>
        }
      </TouchableOpacity>

      {/* Tax Report */}
      <Text style={s.sectionTitle}>Tax & Reports</Text>
      <TouchableOpacity style={[s.btn, { backgroundColor: '#1A1917' }, exportingTax && { opacity: 0.6 }]} onPress={handleTaxExport} disabled={exportingTax}>
        {exportingTax
          ? <ActivityIndicator color="#fff" />
          : <Text style={s.btnText}>📊 Download Tax Report (CSV)</Text>
        }
      </TouchableOpacity>

      {/* Sign Out */}
      <TouchableOpacity style={s.signOutBtn} onPress={confirmSignOut}>
        <Text style={s.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      {/* Manage Subscription */}
      <TouchableOpacity onPress={() => Linking.openURL('https://sideflip.org')} style={{ alignItems: 'center', marginBottom: 20 }}>
        <Text style={s.manageLink}>Manage Subscription →</Text>
      </TouchableOpacity>

      {/* Version */}
      <Text style={s.version}>SideFlip - Project Ledger v1.0.0</Text>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAF7' },
  content: { padding: 20, paddingBottom: 60 },
  heading: { fontSize: 26, fontWeight: '800', color: '#1A1917', marginBottom: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#8C8880', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12, marginTop: 8 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  accountEmail: { fontSize: 15, color: '#1A1917', fontWeight: '500', marginBottom: 10 },
  manageLink: { fontSize: 14, color: ACCENT, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  chip: { width: '47%', borderRadius: 12, borderWidth: 1.5, borderColor: '#E8E4DE', backgroundColor: '#fff', padding: 12, alignItems: 'center' },
  chipActive: { borderColor: ACCENT, backgroundColor: '#FDF1EF' },
  chipSymbol: { fontSize: 22, fontWeight: '700', color: '#1A1917', marginBottom: 2 },
  chipCode: { fontSize: 13, fontWeight: '700', color: '#1A1917' },
  chipLabel: { fontSize: 11, color: '#A8A49E', marginTop: 2 },
  chipTextActive: { color: ACCENT },
  chipLabelActive: { color: '#C8402F99' },
  langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 },
  langChip: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#E8E4DE', backgroundColor: '#fff' },
  langLabel: { fontSize: 15, color: '#1A1917', fontWeight: '500' },
  btn: { backgroundColor: ACCENT, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  signOutBtn: { borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1.5, borderColor: '#E8E4DE', marginBottom: 24 },
  signOutText: { color: '#5C5850', fontSize: 15, fontWeight: '600' },
  version: { textAlign: 'center', fontSize: 12, color: '#C8C4BE' },
})
