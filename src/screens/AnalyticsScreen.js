import { useEffect, useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import ProFeatureList from '../components/ProFeatureList'

const ACCENT = '#C8402F'
const GREEN = '#2D7A4F'
const fmt = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const getTotalInvested = p => (p.expenses || []).reduce((s, e) => s + Number(e.amount), 0) + (Number(p.purchase_price) || 0)
const getProfit = p => p.sale_price ? Number(p.sale_price) - getTotalInvested(p) : null

const ICONS = { mower: '🚜', car: '🚗', motorcycle: '🏍️', atv: '🏎️', boat: '⛵', bicycle: '🚲', watch: '⌚', electronics: '📱', gaming: '🎮', tool: '🔧', exercise: '💪', instrument: '🎸', furniture: '🪑', other: '📦' }

function StatCard({ label, value, sub, color }) {
  return (
    <View style={s.statCard}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, color && { color }]}>{value}</Text>
      {sub && <Text style={s.statSub}>{sub}</Text>}
    </View>
  )
}

function LockedAnalyticsPreview({ navigation, topInset }) {
  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[s.content, { paddingTop: topInset + 20 }]}
    >
      <Text style={s.heading}>Analytics</Text>
      <Text style={s.sub}>Understand every flip and make your next buy with confidence.</Text>

      <View style={s.lockCard}>
        <View style={s.lockIconWrap}><Text style={s.lockIcon}>🔒</Text></View>
        <Text style={s.lockTitle}>Portfolio Analytics is a Pro feature</Text>
        <Text style={s.lockCopy}>Upgrade to unlock live performance insights across your entire portfolio.</Text>
      </View>

      <View style={s.preview} pointerEvents="none">
        <Text style={s.sectionTitle}>Analytics Preview</Text>
        <View style={s.row}>
          <StatCard label="Total Profit" value="$4,280" color={GREEN} sub="31.4% ROI" />
          <StatCard label="Win Rate" value="86%" color={GREEN} sub="12 of 14 sold" />
        </View>
        <View style={s.row}>
          <StatCard label="Avg Profit / Flip" value="$356.67" color={GREEN} />
          <StatCard label="Avg Days to Sell" value="11d" />
        </View>
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        style={s.upgradeButton}
        onPress={() => navigation.navigate('Pro')}
      >
        <Text style={s.upgradeButtonText}>Upgrade to SideFlip Pro</Text>
      </TouchableOpacity>

      <Text style={s.proIncludes}>Everything included with Pro</Text>
      <View style={s.featureCard}><ProFeatureList compact /></View>
    </ScrollView>
  )
}

export default function AnalyticsScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const { user, isPro } = useAuth()
  const [projects, setProjects] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const hasPro = isPro

  const load = useCallback(async () => {
    if (!hasPro) {
      setProjects([])
      setRefreshing(false)
      return
    }
    const { data } = await supabase
      .from('projects')
      .select('*, expenses(*)')
      .eq('user_id', user.id)
    setProjects(data || [])
    setRefreshing(false)
  }, [hasPro, user])

  useEffect(() => { load() }, [load])

  if (!hasPro) return <LockedAnalyticsPreview navigation={navigation} topInset={insets.top} />

  const sold = projects.filter(p => p.status === 'sold')
  const active = projects.filter(p => p.status === 'active')

  const totalProfit = sold.reduce((s, p) => s + (getProfit(p) || 0), 0)
  const totalRevenue = sold.reduce((s, p) => s + (Number(p.sale_price) || 0), 0)
  const totalInvestedSold = sold.reduce((s, p) => s + getTotalInvested(p), 0)
  const totalInvestedActive = active.reduce((s, p) => s + getTotalInvested(p), 0)
  const avgProfit = sold.length > 0 ? totalProfit / sold.length : 0
  const winRate = sold.length > 0 ? (sold.filter(p => (getProfit(p) || 0) > 0).length / sold.length * 100).toFixed(0) : 0
  const overallROI = totalInvestedSold > 0 ? ((totalProfit / totalInvestedSold) * 100).toFixed(1) : null

  // Days to sell
  const withDays = sold.filter(p => p.created_at && p.sold_at).map(p => {
    const days = Math.round((new Date(p.sold_at) - new Date(p.created_at)) / (1000 * 60 * 60 * 24))
    return { ...p, days }
  })
  const avgDays = withDays.length > 0 ? Math.round(withDays.reduce((s, p) => s + p.days, 0) / withDays.length) : null

  // Best category
  const byCat = {}
  sold.forEach(p => {
    const cat = p.category || 'other'
    if (!byCat[cat]) byCat[cat] = { count: 0, profit: 0 }
    byCat[cat].count++
    byCat[cat].profit += getProfit(p) || 0
  })
  const catEntries = Object.entries(byCat).sort((a, b) => b[1].profit - a[1].profit)
  const bestCat = catEntries[0]

  // Best flip
  const bestFlip = sold.length > 0 ? sold.reduce((best, p) => {
    const pr = getProfit(p) || 0
    return pr > (getProfit(best) || 0) ? p : best
  }, sold[0]) : null

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 20 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={ACCENT} />}
    >
      <Text style={s.heading}>Analytics</Text>
      <Text style={s.sub}>Your flipping performance at a glance.</Text>

      {projects.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>📊</Text>
          <Text style={s.emptyTitle}>No data yet</Text>
          <Text style={s.emptySub}>Add some projects and mark them sold to see your stats.</Text>
        </View>
      ) : (
        <>
          {/* Overview */}
          <Text style={s.sectionTitle}>Overview</Text>
          <View style={s.row}>
            <StatCard label="Total Flips" value={sold.length} sub={`${active.length} active`} />
            <StatCard label="Total Profit" value={fmt(totalProfit)} color={totalProfit >= 0 ? GREEN : ACCENT} sub={overallROI ? `${overallROI}% ROI` : null} />
          </View>
          <View style={s.row}>
            <StatCard label="Avg Profit / Flip" value={fmt(avgProfit)} color={avgProfit >= 0 ? GREEN : ACCENT} />
            <StatCard label="Win Rate" value={`${winRate}%`} color={GREEN} sub={`${sold.filter(p => (getProfit(p)||0)>0).length} of ${sold.length} sold`} />
          </View>
          <View style={s.row}>
            <StatCard label="Total Revenue" value={fmt(totalRevenue)} />
            <StatCard label="Capital Active" value={fmt(totalInvestedActive)} sub={`across ${active.length} projects`} />
          </View>
          {avgDays !== null && (
            <View style={s.row}>
              <StatCard label="Avg Days to Sell" value={`${avgDays}d`} />
              <StatCard label="Fastest Sell" value={withDays.length > 0 ? `${Math.min(...withDays.map(p=>p.days))}d` : '—'} />
            </View>
          )}

          {/* Best category */}
          {bestCat && (
            <>
              <Text style={s.sectionTitle}>By Category</Text>
              <View style={s.card}>
                {catEntries.map(([cat, data]) => {
                  const pct = totalProfit > 0 ? data.profit / totalProfit : 0
                  return (
                    <View key={cat} style={s.catRow}>
                      <Text style={s.catIcon}>{ICONS[cat] || '📦'}</Text>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={s.catName}>{cat} <Text style={s.catCount}>({data.count})</Text></Text>
                          <Text style={[s.catProfit, { color: data.profit >= 0 ? GREEN : ACCENT }]}>{fmt(data.profit)}</Text>
                        </View>
                        <View style={s.barBg}>
                          <View style={[s.barFill, { width: `${Math.max(Math.abs(pct) * 100, 2)}%`, backgroundColor: data.profit >= 0 ? GREEN : ACCENT }]} />
                        </View>
                      </View>
                    </View>
                  )
                })}
              </View>
            </>
          )}

          {/* Best flip */}
          {bestFlip && (
            <>
              <Text style={s.sectionTitle}>Best Flip</Text>
              <View style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
                <Text style={{ fontSize: 32 }}>{ICONS[bestFlip.category] || '📦'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.bestTitle}>{bestFlip.title}</Text>
                  <Text style={s.bestSub}>Bought {fmt(bestFlip.purchase_price)} · Sold {fmt(bestFlip.sale_price)}</Text>
                </View>
                <Text style={[s.bestProfit, { color: GREEN }]}>+{fmt(getProfit(bestFlip))}</Text>
              </View>
            </>
          )}

          {/* Recent sold */}
          {sold.length > 0 && (
            <>
              <Text style={s.sectionTitle}>Recent Sales</Text>
              <View style={s.card}>
                {sold.slice(0, 5).map(p => {
                  const profit = getProfit(p)
                  return (
                    <View key={p.id} style={s.recentRow}>
                      <Text style={s.recentIcon}>{ICONS[p.category] || '📦'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={s.recentTitle} numberOfLines={1}>{p.title}</Text>
                        <Text style={s.recentMeta}>{fmt(getTotalInvested(p))} in · {fmt(p.sale_price)} sold</Text>
                      </View>
                      <Text style={[s.recentProfit, { color: profit >= 0 ? GREEN : ACCENT }]}>{profit >= 0 ? '+' : ''}{fmt(profit)}</Text>
                    </View>
                  )
                })}
              </View>
            </>
          )}
        </>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAF7' },
  content: { padding: 20, paddingBottom: 60 },
  heading: { fontSize: 26, fontWeight: '800', color: '#1A1917', marginBottom: 4 },
  sub: { fontSize: 14, color: '#8C8880', marginBottom: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#8C8880', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, marginTop: 6 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  statLabel: { fontSize: 11, color: '#8C8880', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  statValue: { fontSize: 22, fontWeight: '800', color: '#1A1917' },
  statSub: { fontSize: 11, color: '#A8A49E', marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  catIcon: { fontSize: 20, width: 28 },
  catName: { fontSize: 14, fontWeight: '600', color: '#1A1917', textTransform: 'capitalize' },
  catCount: { color: '#A8A49E', fontWeight: '400' },
  catProfit: { fontSize: 14, fontWeight: '700' },
  barBg: { height: 4, backgroundColor: '#F0EDE8', borderRadius: 2, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2 },
  bestTitle: { fontSize: 15, fontWeight: '700', color: '#1A1917', marginBottom: 3 },
  bestSub: { fontSize: 12, color: '#8C8880' },
  bestProfit: { fontSize: 18, fontWeight: '800' },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0EDE8' },
  recentIcon: { fontSize: 20, width: 28 },
  recentTitle: { fontSize: 14, fontWeight: '600', color: '#1A1917', marginBottom: 2 },
  recentMeta: { fontSize: 11, color: '#A8A49E' },
  recentProfit: { fontSize: 14, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1A1917', marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#8C8880', textAlign: 'center', lineHeight: 22 },
  lockCard: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 22, marginBottom: 18, borderWidth: 1, borderColor: '#E8E4DE' },
  lockIconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#F7E8E5', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  lockIcon: { fontSize: 24 },
  lockTitle: { fontSize: 18, fontWeight: '800', color: '#1A1917', textAlign: 'center', marginBottom: 7 },
  lockCopy: { fontSize: 14, color: '#716D66', textAlign: 'center', lineHeight: 20 },
  preview: { opacity: 0.42 },
  upgradeButton: { minHeight: 56, backgroundColor: ACCENT, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, marginTop: 5, marginBottom: 26, shadowColor: ACCENT, shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  upgradeButtonText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  proIncludes: { fontSize: 18, fontWeight: '800', color: '#1A1917', marginBottom: 12 },
  featureCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E8E4DE' },
})
