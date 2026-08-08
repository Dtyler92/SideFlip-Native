import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/screens/ProScreen.js', import.meta.url), 'utf8')

test('restore processes the authoritative active purchase list without a fixed delay', () => {
  assert.match(source, /getAvailablePurchases\(/)
  assert.match(source, /verifyWithSideFlip\(purchase\)/)
  assert.match(source, /finishTransaction\(\{ purchase, isConsumable: false \}\)/)
  assert.doesNotMatch(source, /setTimeout\s*\(/)
  assert.match(source, /verifiedCount === 0/)
})

test('annual monthly equivalent derives from StoreKit price and currency', () => {
  assert.match(source, /Number\(product\?\.price\)/)
  assert.match(source, /currency: product\.currency/)
  assert.match(source, /annualPrice \/ 12/)
})
