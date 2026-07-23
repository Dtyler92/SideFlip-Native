import { useState } from 'react'
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const ACCENT = '#C8402F'
const GREEN = '#2D7A4F'
const fmt = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const PRESETS = [
  { label: '10%', value: 10 },
  { label: '25%', value: 25 },
  { label: '50%', value: 50 },
  { label: '100%', value: 100 },
  { label: '2x', value: 100 },
]

export default function CalculatorScreen() {
  const insets = useSafeAreaInsets()
  const [invested, setInvested] = useState('')
  const [targetPct, setTargetPct] = useState('50')
  const [fees, setFees] = useState('10') // platform fees %

  const inv = parseFloat(invested) || 0
  const pct = parseFloat(targetPct) || 0
  const feePct = parseFloat(fees) || 0

  const targetProfit = inv * (pct / 100)
  // Account for platform fees: listPrice * (1 - fee%) = inv + targetProfit
  const listPrice = feePct > 0 ? (inv + targetProfit) / (1 - feePct / 100) : inv + targetProfit
  const actualProfit = listPrice * (1 - feePct / 100) - inv
  const roi = inv > 0 ? ((actualProfit / inv) * 100).toFixed(1) : null

  const scenarios = [10, 25, 50, 100].map(p => {
    const profit = inv * (p / 100)
    const price = feePct > 0 ? (inv + profit) / (1 - feePct / 100) : inv + profit
    return { pct: p, price, profit }
  })

  return (
    <ScrollView style={s.root} contentContainerStyle={[s.content, { paddingTop: insets.top + 20 }]} keyboardShouldPersistTaps="handled">
      <Text style={s.heading}>List Price Calculator</Text>
      <Text style={s.sub}>Find out exactly what to list for to hit your profit goal.</Text>

      {/* Inputs */}
      <View style={s.card}>
        <Text style={s.label}>Total Invested</Text>
        <TextInput
          style={s.bigInput}
          placeholder="0.00"
          placeholderTextColor="#A8A49E"
          value={invested}
          onChangeText={setInvested}
          keyboardType="decimal-pad"
        />

        <Text style={[s.label, { marginTop: 16 }]}>Target Profit %</Text>
        <View style={s.presetRow}>
          {[10, 25, 50, 100, 150].map(p => (
            <TouchableOpacity
              key={p}
              style={[s.preset, targetPct === String(p) && s.presetActive]}
              onPress={() => setTargetPct(String(p))}
            >
              <Text style={[s.presetText, targetPct === String(p) && s.presetTextActive]}>{p}%</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={[s.input, { marginTop: 8 }]}
          placeholder="Or type a custom %"
          placeholderTextColor="#A8A49E"
          value={targetPct}
          onChangeText={setTargetPct}
          keyboardType="decimal-pad"
        />

        <Text style={[s.label, { marginTop: 16 }]}>Platform Fees %</Text>
        <View style={s.presetRow}>
          {[{ l: 'None', v: '0' }, { l: 'FB (0%)', v: '0' }, { l: 'eBay (13%)', v: '13' }, { l: 'Craigslist (0%)', v: '0' }].map(({ l, v }) => (
            <TouchableOpacity key={l} style={[s.preset, fees === v && s.presetActive]} onPress={() => setFees(v)}>
              <Text style={[s.presetText, fees === v && s.presetTextActive]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={[s.input, { marginTop: 8 }]}
          placeholder="Custom fee %"
          placeholderTextColor="#A8A49E"
          value={fees}
          onChangeText={setFees}
          keyboardType="decimal-pad"
        />
      </View>

      {/* Result */}
      {inv > 0 && (
        <View style={s.resultCard}>
          <Text style={s.resultLabel}>List At</Text>
          <Text style={s.resultPrice}>{fmt(listPrice)}</Text>
          <View style={s.resultRow}>
            <View style={s.resultStat}>
              <Text style={s.resultStatLabel}>Your Profit</Text>
              <Text style={[s.resultStatValue, { color: GREEN }]}>{fmt(actualProfit)}</Text>
            </View>
            <View style={s.resultDivider} />
            <View style={s.resultStat}>
              <Text style={s.resultStatLabel}>ROI</Text>
              <Text style={[s.resultStatValue, { color: GREEN }]}>{roi}%</Text>
            </View>
            <View style={s.resultDivider} />
            <View style={s.resultStat}>
              <Text style={s.resultStatLabel}>Invested</Text>
              <Text style={s.resultStatValue}>{fmt(inv)}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Scenarios table */}
      {inv > 0 && (
        <View style={s.card}>
          <Text style={s.sectionTitle}>Profit Scenarios</Text>
          <View style={s.tableHeader}>
            <Text style={[s.tableCell, s.tableHeadText, { flex: 1 }]}>Goal</Text>
            <Text style={[s.tableCell, s.tableHeadText, { flex: 2 }]}>List Price</Text>
            <Text style={[s.tableCell, s.tableHeadText, { flex: 2, textAlign: 'right' }]}>Profit</Text>
          </View>
          {scenarios.map(({ pct: p, price, profit }) => (
            <TouchableOpacity key={p} style={s.tableRow} onPress={() => setTargetPct(String(p))}>
              <Text style={[s.tableCell, { flex: 1, fontWeight: '600', color: ACCENT }]}>{p}%</Text>
              <Text style={[s.tableCell, { flex: 2, fontWeight: '700', color: '#1A1917' }]}>{fmt(price)}</Text>
              <Text style={[s.tableCell, { flex: 2, textAlign: 'right', color: GREEN, fontWeight: '600' }]}>{fmt(profit)}</Text>
            </TouchableOpacity>
          ))}
          <Text style={s.tableHint}>Tap a row to set as your target</Text>
        </View>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAF7' },
  content: { padding: 20, paddingBottom: 60 },
  heading: { fontSize: 26, fontWeight: '800', color: '#1A1917', marginBottom: 4 },
  sub: { fontSize: 14, color: '#8C8880', marginBottom: 20, lineHeight: 20 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  label: { fontSize: 13, fontWeight: '600', color: '#5C5850', marginBottom: 8 },
  bigInput: { borderWidth: 1, borderColor: '#E8E4DE', borderRadius: 12, padding: 16, fontSize: 28, fontWeight: '700', color: '#1A1917', textAlign: 'center', backgroundColor: '#FAFAF7' },
  input: { borderWidth: 1, borderColor: '#E8E4DE', borderRadius: 10, padding: 12, fontSize: 15, color: '#1A1917', backgroundColor: '#FAFAF7' },
  presetRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  preset: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#E8E4DE', backgroundColor: '#F5F2EE' },
  presetActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  presetText: { fontSize: 13, fontWeight: '600', color: '#5C5850' },
  presetTextActive: { color: '#fff' },
  resultCard: { backgroundColor: '#1A1917', borderRadius: 16, padding: 20, marginBottom: 16, alignItems: 'center' },
  resultLabel: { fontSize: 11, color: '#8C8880', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  resultPrice: { fontSize: 48, fontWeight: '800', color: '#fff', letterSpacing: -1, marginBottom: 16 },
  resultRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-around' },
  resultStat: { alignItems: 'center', flex: 1 },
  resultStatLabel: { fontSize: 10, color: '#8C8880', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  resultStatValue: { fontSize: 16, fontWeight: '700', color: '#fff' },
  resultDivider: { width: 1, backgroundColor: '#333', marginHorizontal: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#8C8880', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  tableHeader: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#F0EDE8', marginBottom: 4 },
  tableHeadText: { fontSize: 11, color: '#A8A49E', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: '600' },
  tableRow: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0EDE8' },
  tableCell: { fontSize: 14 },
  tableHint: { fontSize: 11, color: '#A8A49E', textAlign: 'center', marginTop: 10 },
})
