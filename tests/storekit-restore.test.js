import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/screens/ProScreen.js', import.meta.url), 'utf8')

test('restore processes the authoritative active purchase list without a fixed delay', () => {
  const restoreStart = source.indexOf('async function restore()')
  const restoreEnd = source.indexOf('\n  return (', restoreStart)
  const restoreSource = source.slice(restoreStart, restoreEnd)
  assert.match(restoreSource, /getAvailablePurchases\(/)
  assert.match(restoreSource, /verifyWithSideFlip\(purchase, true\)/)
  assert.match(restoreSource, /finishTransaction\(\{ purchase, isConsumable: false \}\)/)
  assert.doesNotMatch(restoreSource, /setTimeout\s*\(/)
  assert.match(restoreSource, /verifiedCount === 0/)
  assert.match(restoreSource, /verifiedProductIds\.push\(purchase\.productId\)/)
  assert.match(restoreSource, /restoredProductId = verifiedProductIds\[0\]/)
  assert.doesNotMatch(restoreSource, /restoredProductId = eligible\[0\]/)
})

test('StoreKit catalog loading has a dedicated failure event', () => {
  assert.match(source, /apple_store_products_fetch_failed/)
  assert.doesNotMatch(source, /apple_purchase_failed[^\n]*product_fetch/)
})

test('restore emits only one terminal restore failure event', () => {
  assert.equal(source.match(/captureEvent\('apple_restore_failed'/g)?.length, 1)
  assert.match(source, /verified \? 'apple_entitlement_activation_failed' : 'apple_purchase_verification_failed'/)
})

test('annual monthly equivalent derives from StoreKit price and currency', () => {
  assert.match(source, /Number\(product\?\.price\)/)
  assert.match(source, /currency: product\.currency/)
  assert.match(source, /annualPrice \/ 12/)
})

test('StoreKit pricing never falls back to hardcoded USD amounts', () => {
  for (const hardcoded of ['\\$8.33', '\\$12.99', '\\$99.99']) {
    assert.doesNotMatch(source, new RegExp(hardcoded))
  }
  assert.match(source, /Loading Apple price/)
  assert.match(source, /displayPrice/)
  assert.match(source, /App Store storefront/)
})

test('a disconnected, incomplete, or failed Apple catalog has an in-screen retry', () => {
  assert.match(source, /catalogAttempted/)
  assert.match(source, /PRODUCT_IDS\.every/)
  assert.match(source, /STORE_CONNECTION_GRACE_MS/)
  assert.match(source, /reconnect/)
  assert.match(source, /Retry Apple Prices/)
  assert.match(source, /onPress=\{retryProducts\}/)
})
