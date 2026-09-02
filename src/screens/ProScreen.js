import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, Linking } from 'react-native'
import { getAvailablePurchases, useIAP } from 'expo-iap'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import ProFeatureList from '../components/ProFeatureList'
import { captureEvent } from '../lib/analytics'
import { queryRestorablePurchases } from '../lib/storekitRestore'

const PRODUCT_IDS = ['com.sideflip.app.pro.monthly', 'com.sideflip.app.pro.annual']
const STORE_CONNECTION_GRACE_MS = 3000
const purchaseKey = purchase => purchase?.purchaseToken || purchase?.transactionId || purchase?.id
const monthlyEquivalent = product => {
  const annualPrice = Number(product?.price)
  if (!Number.isFinite(annualPrice) || annualPrice <= 0 || !product?.currency) return null
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: product.currency }).format(annualPrice / 12)
  } catch {
    return null
  }
}

const planForProduct = productId => PRODUCT_IDS.includes(productId) ? (productId.endsWith('.annual') ? 'annual' : 'monthly') : undefined

async function verifyWithSideFlip(purchase, isRestore = false) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token || !purchase?.purchaseToken) throw new Error('Please sign in again before verifying your purchase.')
  const response = await fetch('https://sideflip.org/api/verify-apple-purchase', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ signedTransaction: purchase.purchaseToken, isRestore }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || !body.entitlement?.verified) throw new Error(body.error || 'Your purchase could not be verified yet. Please try Restore Purchases.')
  if (!['active', 'grace_period'].includes(body.entitlement.status)) throw new Error('Apple verified this purchase, but there is no active SideFlip Pro subscription to restore.')
  return body.entitlement
}

export default function ProScreen() {
  const { user, isPro, refreshEntitlement } = useAuth()
  const [busy, setBusy] = useState(false)
  const [catalogAttempted, setCatalogAttempted] = useState(false)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState(false)
  const restoringRef = useRef(false)
  const restoredPurchaseKeysRef = useRef(new Set())
  const pendingProductRef = useRef(null)
  const lastPurchaseErrorRef = useRef({ key: '', at: 0 })
  const hasPro = isPro

  function reportPurchaseError(error, source) {
    const key = `${error?.code || 'unknown'}:${error?.message || ''}`
    const now = Date.now()
    if (lastPurchaseErrorRef.current.key === key && now - lastPurchaseErrorRef.current.at < 2500) return
    lastPurchaseErrorRef.current = { key, at: now }
    const productId = pendingProductRef.current
    const cancelled = error?.code === 'user-cancelled'
    captureEvent(cancelled ? 'apple_purchase_cancelled' : 'apple_purchase_failed', {
      provider: 'apple',
      plan: planForProduct(productId),
      product_id: productId,
      error_type: source,
    })
  }

  const { connected, subscriptions, fetchProducts, requestPurchase, restorePurchases, finishTransaction, reconnect } = useIAP({
    onPurchaseSuccess: async purchase => {
      const key = purchaseKey(purchase)
      if (restoringRef.current || (key && restoredPurchaseKeysRef.current.has(key))) return
      const productId = purchase.productId || pendingProductRef.current
      let verified = false
      try {
        await verifyWithSideFlip(purchase, false)
        verified = true
        await finishTransaction({ purchase, isConsumable: false })
        const nextPlan = await refreshEntitlement()
        if (nextPlan !== 'pro') throw new Error('The verified subscription has not activated SideFlip Pro yet. Please try Restore Purchases.')
        captureEvent('apple_entitlement_activated', {
          provider: 'apple', plan: planForProduct(productId), product_id: productId,
          status: 'active', is_restore: false,
        })
        Alert.alert('SideFlip Pro is active', 'Your verified Pro access is ready.')
      } catch (error) {
        captureEvent(verified ? 'apple_entitlement_activation_failed' : 'apple_purchase_verification_failed', {
          provider: 'apple', plan: planForProduct(productId), product_id: productId,
          error_type: verified ? 'finish_or_entitlement_refresh' : 'verification', is_restore: false,
        })
        Alert.alert('Purchase received', error.message)
      } finally { pendingProductRef.current = null; setBusy(false) }
    },
    onPurchaseError: error => {
      reportPurchaseError(error, 'store_callback')
      pendingProductRef.current = null
      setBusy(false)
      if (error?.code !== 'user-cancelled') Alert.alert('Purchase not completed', error?.message || 'Please try again.')
    },
  })

  const loadProducts = useCallback(async () => {
    setCatalogLoading(true)
    setCatalogError(false)
    try {
      await fetchProducts({ skus: PRODUCT_IDS, type: 'subs' })
    } catch {
      setCatalogError(true)
      captureEvent('apple_store_products_fetch_failed', { provider: 'apple', error_type: 'product_fetch' })
    } finally {
      setCatalogAttempted(true)
      setCatalogLoading(false)
    }
  }, [fetchProducts])

  const retryProducts = useCallback(async () => {
    if (connected) {
      await loadProducts()
      return
    }
    setCatalogAttempted(true)
    setCatalogLoading(true)
    setCatalogError(false)
    const reconnected = await reconnect()
    if (reconnected) return
    setCatalogError(true)
    setCatalogLoading(false)
    captureEvent('apple_store_products_fetch_failed', { provider: 'apple', error_type: 'store_connection' })
  }, [connected, loadProducts, reconnect])

  useEffect(() => { captureEvent('paywall_viewed', { provider: 'apple', source: 'native_upgrade' }) }, [])
  useEffect(() => {
    if (connected) {
      loadProducts()
      return undefined
    }
    const timeout = setTimeout(() => {
      setCatalogAttempted(true)
      setCatalogError(true)
    }, STORE_CONNECTION_GRACE_MS)
    return () => clearTimeout(timeout)
  }, [connected, loadProducts])
  const product = id => subscriptions.find(item => item.id === id)
  const catalogReady = PRODUCT_IDS.every(id => {
    const item = product(id)
    return Boolean(item?.displayPrice)
  })
  async function buy(id) {
    pendingProductRef.current = id
    captureEvent('plan_selected', { provider: 'apple', plan: planForProduct(id), product_id: id })
    captureEvent('apple_purchase_started', { provider: 'apple', plan: planForProduct(id), product_id: id })
    setBusy(true)
    try {
      await requestPurchase({ type: 'subs', request: { apple: { sku: id, appAccountToken: user.id, andDangerouslyFinishTransactionAutomatically: false } } })
    } catch (error) {
      reportPurchaseError(error, 'request_purchase')
      pendingProductRef.current = null
      setBusy(false)
      if (error?.code !== 'user-cancelled') Alert.alert('Purchase not started', error.message)
    }
  }
  async function restore() {
    captureEvent('apple_restore_started', { provider: 'apple', is_restore: true })
    setBusy(true)
    restoringRef.current = true
    try {
      const restoreOptions = { alsoPublishToEventListenerIOS: false, onlyIncludeActiveItemsIOS: true }
      const purchases = await queryRestorablePurchases({
        options: restoreOptions,
        syncPurchases: restorePurchases,
        getAvailablePurchases,
        onSyncError: () => captureEvent('apple_restore_sync_failed', { provider: 'apple', error_type: 'store_sync', is_restore: true }),
      })
      const eligible = purchases.filter(purchase => PRODUCT_IDS.includes(purchase.productId) && purchase.purchaseToken)
      let verifiedCount = 0
      const verifiedProductIds = []
      let lastError = null

      for (const purchase of eligible) {
        let verified = false
        try {
          await verifyWithSideFlip(purchase, true)
          verified = true
          await finishTransaction({ purchase, isConsumable: false })
          const key = purchaseKey(purchase)
          if (key) restoredPurchaseKeysRef.current.add(key)
          verifiedCount += 1
          verifiedProductIds.push(purchase.productId)
        } catch (error) {
          captureEvent(verified ? 'apple_entitlement_activation_failed' : 'apple_purchase_verification_failed', {
            provider: 'apple', plan: planForProduct(purchase.productId), product_id: purchase.productId,
            error_type: verified ? 'restore_finish' : 'restore_verification', is_restore: true,
          })
          lastError = error
        }
      }

      if (verifiedCount === 0) {
        if (lastError) throw lastError
        captureEvent('apple_restore_completed', { provider: 'apple', status: 'not_found', verified_count: 0, is_restore: true })
        Alert.alert('No active purchase found', 'No active SideFlip Pro subscription is currently available for this Apple ID.')
        return
      }

      const nextPlan = await refreshEntitlement()
      if (nextPlan !== 'pro') throw new Error('Apple verified the subscription, but SideFlip Pro is not active yet. Please try Restore Purchases again.')
      const restoredProductId = verifiedProductIds[0]
      captureEvent('apple_restore_completed', {
        provider: 'apple', status: 'active', plan: planForProduct(restoredProductId),
        product_id: restoredProductId, verified_count: verifiedCount, is_restore: true,
      })
      captureEvent('apple_entitlement_activated', {
        provider: 'apple', status: 'active', plan: planForProduct(restoredProductId),
        product_id: restoredProductId, is_restore: true,
      })
      Alert.alert('SideFlip Pro restored', 'Your verified Apple subscription is active on this SideFlip account.')
    } catch (error) {
      captureEvent('apple_restore_failed', { provider: 'apple', error_type: 'restore_or_entitlement', is_restore: true })
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
      </View>

      {hasPro && (
        <View style={s.activeBanner}>
          <Text style={s.activeTitle}>✓ SideFlip Pro is active</Text>
          <Text style={s.activeCopy}>Your Pro features are unlocked on this account.</Text>
        </View>
      )}

      <Text style={s.sectionTitle}>{hasPro ? 'Your subscription options' : 'Choose your plan'}</Text>
      {PRODUCT_IDS.map(id => {
        const annual = id.endsWith('.annual')
        const item = product(id)
        const primaryPrice = item?.displayPrice || null
        const equivalentPrice = annual ? monthlyEquivalent(item) : null
        const equivalentText = equivalentPrice ? `Equivalent to ${equivalentPrice}/month` : null
        const priceUnavailable = !primaryPrice
        return (
          <View key={id} style={[s.card, annual && s.featured]}>
            <View style={s.planRow}>
              <Text style={s.plan}>{annual ? 'Annual' : 'Monthly'}</Text>
              {annual && <Text style={s.valueBadge}>BEST VALUE</Text>}
            </View>
            <Text style={[s.price, priceUnavailable && s.priceLoading]}>
              {primaryPrice || 'Loading Apple price…'}
              {primaryPrice && <Text style={s.unit}>{annual ? '/year' : '/month'}</Text>}
            </Text>
            <Text style={s.detail}>{primaryPrice
              ? (annual ? 'Billed annually' : 'Billed monthly')
              : 'Apple prices are provided in your App Store storefront currency.'}
            </Text>
            {equivalentText && <Text style={s.equivalent}>{equivalentText}</Text>}
            {!hasPro && (
              <TouchableOpacity
                accessibilityRole="button"
                disabled={!connected || busy || priceUnavailable}
                onPress={() => buy(id)}
                style={[s.button, (!connected || busy || priceUnavailable) && s.buttonDisabled]}
              >
                <Text style={s.buttonText}>{busy ? 'Working…' : `Choose ${annual ? 'Annual' : 'Monthly'}`}</Text>
              </TouchableOpacity>
            )}
          </View>
        )
      })}
      {catalogAttempted && !catalogReady && (
        <View style={s.catalogError}>
          <Text style={s.catalogErrorText}>{catalogError
            ? 'Apple prices could not be loaded.'
            : (catalogLoading ? 'Connecting to the App Store…' : 'Apple did not return all subscription prices.')}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            disabled={catalogLoading}
            onPress={retryProducts}
            style={[s.catalogRetry, catalogLoading && s.buttonDisabled]}
          >
            <Text style={s.catalogRetryText}>{catalogLoading ? 'Retrying…' : 'Retry Apple Prices'}</Text>
          </TouchableOpacity>
        </View>
      )}
      <Text style={s.sectionTitle}>Included with Pro</Text>
      <View style={s.featuresCard}><ProFeatureList /></View>

      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={restore} style={s.restore}>
        <Text style={s.restoreText}>Restore Purchases</Text>
      </TouchableOpacity>
      <Text style={s.legal}>Payment is charged to your Apple ID. Subscriptions renew automatically unless canceled at least 24 hours before the current period ends. Manage subscriptions in your Apple ID settings.</Text>
      <View style={s.legalLinks}>
        <TouchableOpacity onPress={() => Linking.openURL('https://sideflip.org/privacy')}><Text style={s.legalLink}>Privacy Policy</Text></TouchableOpacity>
        <Text style={s.legalDot}>•</Text>
        <TouchableOpacity onPress={() => Linking.openURL('https://sideflip.org/terms')}><Text style={s.legalLink}>Terms of Service</Text></TouchableOpacity>
        <Text style={s.legalDot}>•</Text>
        <TouchableOpacity onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}><Text style={s.legalLink}>Apple EULA</Text></TouchableOpacity>
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
  priceLoading: { fontSize: 18, color: '#8C8880' },
  unit: { fontSize: 15, fontWeight: '700', color: '#C8402F' },
  detail: { color: '#8C8880', marginTop: 3 },
  equivalent: { fontSize: 13, color: '#8C8880', marginTop: 4 },
  button: { backgroundColor: '#C8402F', alignItems: 'center', padding: 14, borderRadius: 10, marginTop: 15 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '800' },
  catalogError: { backgroundColor: '#FFF7E8', borderColor: '#E8C986', borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8 },
  catalogErrorText: { color: '#6F5420', textAlign: 'center', lineHeight: 19 },
  catalogRetry: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  catalogRetryText: { color: '#C8402F', fontWeight: '800' },
  restore: { alignItems: 'center', padding: 16 },
  restoreText: { color: '#C8402F', fontWeight: '700' },
  legal: { fontSize: 12, color: '#8C8880', textAlign: 'center', lineHeight: 18, marginTop: 8 },
  legalLinks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 9, marginTop: 10 },
  legalLink: { color: '#C8402F', fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  legalDot: { color: '#A8A49E', fontSize: 12 },
})
