import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const pro = read('src/screens/ProScreen.js')
const deletion = read('src/screens/DeleteAccountScreen.js')

test('Android closed test never starts Apple purchase or restore flows', () => {
  assert.match(pro, /Platform\.OS === 'android'/)
  assert.match(pro, /if \(IS_ANDROID\) return/)
  assert.match(pro, /Google Play subscriptions are being prepared/)
  assert.match(pro, /IS_ANDROID \? null/)
})

test('Android account deletion copy points users to their original billing provider', () => {
  assert.match(deletion, /Platform\.OS === 'android'/)
  assert.match(deletion, /original billing provider/)
  assert.match(deletion, /Google Play/)
})
