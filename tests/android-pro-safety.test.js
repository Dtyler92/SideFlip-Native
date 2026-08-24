import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const pro = read('src/screens/ProScreen.js')
const deletion = read('src/screens/DeleteAccountScreen.js')
const settings = read('src/screens/SettingsScreen.js')
const goals = read('src/screens/TradeUpGoalsScreen.js')

test('Android closed test never starts Apple purchase or restore flows', () => {
  assert.match(pro, /Platform\.OS === 'android'/)
  assert.ok((pro.match(/if \(IS_ANDROID\) return/g) || []).length >= 5)
  assert.match(pro, /onPurchaseSuccess: async purchase => \{\s*if \(IS_ANDROID\) return/)
  assert.match(pro, /onPurchaseError: error => \{\s*if \(IS_ANDROID\) return/)
  assert.match(pro, /Google Play subscriptions are being prepared/)
  assert.match(pro, /\{IS_ANDROID \? \(/)
  assert.match(pro, /Purchasing and restore are disabled in this closed-test build/)
})

test('Android account deletion copy points users to their original billing provider', () => {
  assert.match(deletion, /Platform\.OS === 'android'/)
  assert.match(deletion, /original billing provider/)
  assert.match(deletion, /Google Play/)
})

test('Android currency and goal-limit copy presents Google Play, not Apple, as its storefront', () => {
  assert.match(settings, /Platform\.OS === 'android'/)
  assert.match(settings, /Future Google Play subscription prices use your Play storefront currency/)
  assert.match(goals, /Platform\.OS === 'android'/)
  assert.match(goals, /Google Play subscriptions are being prepared for a future test/)
})
