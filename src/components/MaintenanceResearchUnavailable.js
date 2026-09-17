import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

// Presentation only: no research client, callbacks, or runtime feature flag.
export default function MaintenanceResearchUnavailable() {
  return <View style={s.container}>
    <TouchableOpacity
      style={s.control}
      disabled={true}
      accessibilityRole="button"
      accessibilityLabel="Automated maintenance research — Coming soon"
      accessibilityState={{ disabled: true }}
    >
      <Text style={s.title}>Automated maintenance research</Text>
      <Text style={s.badge}>Coming soon</Text>
    </TouchableOpacity>
    <Text style={s.help}>VIN-based schedule research is still in development. VIN decoding and manual maintenance remain available.</Text>
  </View>
}

const s = StyleSheet.create({
  container: { marginBottom: 16 },
  control: { backgroundColor: '#E5E7EB', borderColor: '#D1D5DB', borderWidth: 1, borderRadius: 12, padding: 14, gap: 4 },
  title: { color: '#6B7280', fontSize: 14, fontWeight: '600' },
  badge: { color: '#6B7280', fontSize: 12, fontWeight: '600' },
  help: { color: '#6B7280', fontSize: 12, lineHeight: 18, marginTop: 8 },
})
