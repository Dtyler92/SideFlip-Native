import { View, Text, StyleSheet } from 'react-native'

export const PRO_FEATURES = [
  { icon: '📊', title: 'Portfolio Analytics', detail: 'See profit, ROI, win rate, category performance, and sales trends.' },
  { icon: '✨', title: 'AI Listing Generator', detail: 'Turn project details into a polished marketplace listing.' },
  { icon: '📈', title: 'Comparable Sales & ROI', detail: 'Research comps and potential returns before you buy.', comingSoon: true },
  { icon: '🚘', title: 'VIN Decoder', detail: 'Quickly identify vehicle details from a VIN.', comingSoon: true },
  { icon: '🧾', title: 'Tax-Ready Exports', detail: 'Organize project income and expenses for tax time.', comingSoon: true },
  { icon: '📷', title: 'Receipt Tracker', detail: 'Capture and organize purchase and expense receipts.', comingSoon: true },
  { icon: '🎯', title: 'Multiple Trade-Up Goals', detail: 'Work toward more than one flipping goal at a time.' },
  { icon: '🖼️', title: 'Expanded Project Photos', detail: 'Keep more before, progress, and after photos on each flip.' },
]

export default function ProFeatureList({ compact = false }) {
  return (
    <View style={styles.list}>
      {PRO_FEATURES.map(feature => (
        <View key={feature.title} style={[styles.row, compact && styles.rowCompact]}>
          <View style={styles.iconWrap}>
            <Text style={styles.icon}>{feature.icon}</Text>
          </View>
          <View style={styles.copy}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{feature.title}</Text>
              {feature.comingSoon && <Text style={styles.badge}>COMING SOON</Text>}
            </View>
            {!compact && <Text style={styles.detail}>{feature.detail}</Text>}
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  rowCompact: { alignItems: 'center' },
  iconWrap: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#F7E8E5', alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 19 },
  copy: { flex: 1, paddingTop: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  title: { fontSize: 15, fontWeight: '700', color: '#1A1917' },
  badge: { fontSize: 9, fontWeight: '800', color: '#8D3529', backgroundColor: '#F7E8E5', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3, letterSpacing: 0.4 },
  detail: { fontSize: 13, color: '#716D66', lineHeight: 18, marginTop: 3 },
})
