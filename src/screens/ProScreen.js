import { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, Linking } from 'react-native'
import { getAvailablePurchases, useIAP } from 'expo-iap'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import ProFeatureList from '../components/ProFeatureList'

const PRODUCT_IDS = ['com.sideflip.app.pro.monthly', 'com.sideflip.app.pro.annual']
const purchaseKey = purchase => purchase?.purchaseToken || purchase?.transactionId || purchase?.id
const monthlyEquivalent = product => {
  const annualPrice = Number(product?.price)
  if (!Number.isFinite(annualPrice) || annualPrice <= 0) return '$8.33'
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: product.currency || 'USD' }).format(annualPrice / 12)
  } catch {
    return `$${(annualPrice / 12).toFixed(2)}`
  }
}

async function verifyWithSideFlip(purchase) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token || !purchase?.purchaseToken) throw new Error('Please sign in again before verifying your purchase.')
  const response = await fetch('https://sideflip.org/api/verify-apple-purchase', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ signedTransaction: purchase.purchaseToken }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || !body.entitlement?.verified) throw new Error(body.error || 'Your purchase could not be verified yet. Please try Restore Purchases.')
  if (!['active', 'grace_period'].includes(body.entitlement.status)) throw new Error('Apple verified this purchase, but there is no active SideFlip Pro subscription to restore.')
  return body.entitlement
}

export default function ProScreen() {
  const { user, isPro, refreshEntitlement } = useAuth()
  const [busy, setBusy] = useState(false)
  const restoringRef = useRef(false)
  const restoredPurchaseKeysRef = useRef(new Set())
  const hasPro = isPro
  const { connected, subscriptions, fetchProducts, requestPurchase, restorePurchases, finishTransaction } = useIAP({
    onPurchaseSuccess: async purchase => {
      const key = purchaseKey(purchase)
      if (restoringRef.current || (key && restoredPurchaseKeysRef.current.has(key))) return
      try {
        await verifyWithSideFlip(purchase)
        await finishTransaction({ purchase, isConsumable: false })
        await refreshEntitlement()
        Alert.alert('SideFlip Pro is active', 'Your verified Pro access is ready.')
      } catch (error) { Alert.alert('Purchase received', error.message) } finally { setBusy(false) }
    },
    onPurchaseError: error => { setBusy(false); if (error?.code !== 'user-cancelled') Alert.alert('Purchase not completed', error?.message || 'Please try again.') },
  })

  useEffect(() => { if (connected) fetchProducts({ skus: PRODUCT_IDS, type: 'subs' }).catch(error => Alert.alert('Store unavailable', error.message)) }, [connected, fetchProducts])
  const product = id => subscriptions.find(item => item.id === id)
  async function buy(id) {
    setBusy(true)
    try {
      await requestPurchase({ type: 'subs', request: { apple: { sku: id, appAccountToken: user.id, andDangerouslyFinishTransactionAutomatically: false } } })
    } catch (error) {
      setBusy(false)
      if (error?.code !== 'user-cancelled') Alert.alert('Purchase not started', error.message)
    }
  }
  async function restore() {
    setBusy(true)
    restoringRef.current = true
    try {
      await restorePurchases({ alsoPublishToEventListenerIOS: false, onlyIncludeActiveItemsIOS: true })
      const purchases = await getAvailablePurchases({ alsoPublishToEventListenerIOS: false, onlyIncludeActiveItemsIOS: true })
      const eligible = purchases.filter(purchase => PRODUCT_IDS.includes(purchase.productId) && purchase.purchaseToken)
      let verifiedCount = 0
      let lastError = null

      for (const purchase of eligible) {
        try {
          await verifyWithSideFlip(purchase)
          await finishTransaction({ purchase, isConsumable: false })
          const key = purchaseKey(purchase)
          if (key) restoredPurchaseKeysRef.current.add(key)
          verifiedCount += 1
        } catch (error) {
          lastError = error
        }
      }

      if (verifiedCount === 0) {
        if (lastError) throw lastError
        Alert.alert('No active purchase found', 'No active SideFlip Pro subscription is currently available for this Apple ID.')
        return
      }

      const nextPlan = await refreshEntitlement()
      if (nextPlan !== 'pro') throw new Error('Apple verified the subscription, but SideFlip Pro is not active yet. Please try Restore Purchases again.')
      Alert.alert('SideFlip Pro restored', 'Your verified Apple subscription is active on this SideFlip account.')
    } catch (error) {
      Alert.alert('Restore failed', error.message)
    } finally {
      restoringRef.current = false
      setBusy(false)
    }
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <View style={s.hero}>
        <View style={s.heroIcon}><Text style={s.heroIconText}>⚡</Text></View>
        <Text style={s.title}>Do more with every flip</Text>
        <Text style={s.sub}>SideFlip Pro brings your portfolio insights, listing tools, and growing flipper toolkit together in one native app.</Text>
      </View>

      {hasPro && (
        <View style={s.activeBanner}>
          <Text style={s.activeTitle}>✓ SideFlip Pro is active</Text>
          <Text style={s.activeCopy}>Your Pro features are unlocked on this account.</Text>
        </View>
      )}

      <Text style={s.sectionTitle}>Included with Pro</Text>
      <View style={s.featuresCard}><ProFeatureList /></View>

      <Text style={s.sectionTitle}>{hasPro ? 'Your subscription options' : 'Choose your plan'}</Text>
      {PRODUCT_IDS.map(id => {
        const annual = id.endsWith('.annual')
        const item = product(id)
        return (
          <View key={id} style={[s.card, annual && s.featured]}>
            <View style={s.planRow}>
              <Text style={s.plan}>{annual ? 'Annual' : 'Monthly'}</Text>
              {annual && <Text style={s.valueBadge}>BEST VALUE</Text>}
            </View>
            <Text style={s.price}>
              {annual ? monthlyEquivalent(item) : (item?.displayPrice || '$12.99')}
              <Text style={s.unit}>/month</Text>
            </Text>
            <Text style={s.detail}>{annual ? `${item?.displayPrice || '$99.99'} billed annually` : 'Billed monthly'}</Text>
            {!hasPro && (
              <TouchableOpacity
                accessibilityRole="button"
                disabled={!connected || busy || !item}
                onPress={() => buy(id)}
                style={[s.button, (!connected || busy || !item) && s.buttonDisabled]}
              >
                <Text style={s.buttonText}>{busy ? 'Working…' : `Choose ${annual ? 'Annual' : 'Monthly'}`}</Text>
              </TouchableOpacity>
            )}
          </View>
        )
      })}
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={restore} style={s.restore}>
        <Text style={s.restoreText}>Restore Purchases</Text>
      </TouchableOpacity>
      <Text style={s.legal}>Payment is charged to your Apple ID. Subscriptions renew automatically unless canceled at least 24 hours before the current period ends. Manage subscriptions in your Apple ID settings.</Text>
      <View style={s.legalLinks}>
        <TouchableOpacity onPress={() => Linking.openURL('https://sideflip.org/privacy')}><Text style={s.legalLink}>Privacy Policy</Text></TouchableOpacity>
        <Text style={s.legalDot}>•</Text>
        <TouchableOpacity onPress={() => Linking.openURL('https://sideflip.org/terms')}><Text style={s.legalLink}>Terms of Use</Text></TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAF7' },
  content: { padding: 20, paddingBottom: 44 },
  hero: { alignItems: 'center', paddingTop: 8, marginBottom: 20 },
  heroIcon: { width: 58, height: 58, borderRadius: 18, backgroundColor: '#F7E8E5', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  heroIconText: { fontSize: 28 },
  title: { fontSize: 28, fontWeight: '800', color: '#1A1917', textAlign: 'center' },
  sub: { color: '#5C5850', lineHeight: 21, marginTop: 8, textAlign: 'center' },
  activeBanner: { backgroundColor: '#E8F5EE', borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#B9DDC9' },
  activeTitle: { color: '#23613F', fontSize: 16, fontWeight: '800', marginBottom: 3 },
  activeCopy: { color: '#397256', fontSize: 13 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#8C8880', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, marginTop: 4 },
  featuresCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#E8E4DE' },
  card: { backgroundColor: '#fff', padding: 18, borderRadius: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E8E4DE' },
  featured: { borderColor: '#C8402F', borderWidth: 2 },
  planRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  plan: { fontSize: 17, fontWeight: '800', color: '#1A1917' },
  valueBadge: { fontSize: 9, fontWeight: '800', color: '#8D3529', backgroundColor: '#F7E8E5', borderRadius: 5, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 4, letterSpacing: 0.4 },
  price: { fontSize: 28, fontWeight: '800', color: '#C8402F', marginTop: 6 },
  unit: { fontSize: 15, fontWeight: '700', color: '#C8402F' },
  detail: { color: '#8C8880', marginTop: 3 },
  button: { backgroundColor: '#C8402F', alignItems: 'center', padding: 14, borderRadius: 10, marginTop: 15 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '800' },
  restore: { alignItems: 'center', padding: 16 },
  restoreText: { color: '#C8402F', fontWeight: '700' },
  legal: { fontSize: 12, color: '#8C8880', textAlign: 'center', lineHeight: 18, marginTop: 8 },
  legalLinks: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9, marginTop: 10 },
  legalLink: { color: '#C8402F', fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  legalDot: { color: '#A8A49E', fontSize: 12 },
})
