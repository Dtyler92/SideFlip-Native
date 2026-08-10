import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/screens/ProScreen.js', import.meta.url), 'utf8')

test('restore processes the authoritative active purchase list without a fixed delay', () => {
  assert.match(source, /getAvailablePurchases\(/)
  assert.match(source, /verifyWithSideFlip\(purchase, true\)/)
  assert.match(source, /finishTransaction\(\{ purchase, isConsumable: false \}\)/)
  assert.doesNotMatch(source, /setTimeout\s*\(/)
  assert.match(source, /verifiedCount === 0/)
  assert.match(source, /verifiedProductIds\.push\(purchase\.productId\)/)
  assert.match(source, /restoredProductId = verifiedProductIds\[0\]/)
  assert.doesNotMatch(source, /restoredProductId = eligible\[0\]/)
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
