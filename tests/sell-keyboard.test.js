import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/screens/SellProjectScreen.js', import.meta.url), 'utf8')

test('sale screen keeps actions reachable above the iOS number pad', () => {
  assert.match(source, /KeyboardAvoidingView/)
  assert.match(source, /ScrollView/)
  assert.match(source, /InputAccessoryView/)
  assert.match(source, /inputAccessoryViewID=\{SALE_KEYBOARD_ACCESSORY_ID\}/)
  assert.match(source, /Keyboard\.dismiss\(\)/)
  assert.match(source, />Done</)
  assert.match(source, />Confirm Sale</)
})
