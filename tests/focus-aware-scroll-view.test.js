import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  keyboardRevealDelta,
  keyboardRevealScrollPosition,
  keyboardTopFromViewport,
  shouldRevealFocusedField,
} from '../src/lib/keyboardVisibility.js'

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('keyboard reveal delta moves an obscured field fully above the keyboard', () => {
  assert.equal(keyboardRevealDelta({ fieldY: 820, fieldHeight: 64, keyboardY: 800, gap: 24 }), 108)
})

test('keyboard reveal delta does not move a field that is already visible', () => {
  assert.equal(keyboardRevealDelta({ fieldY: 650, fieldHeight: 64, keyboardY: 800, gap: 24 }), 0)
})

test('keyboard reveal delta fails safely for incomplete native measurements', () => {
  assert.equal(keyboardRevealDelta({ fieldY: Number.NaN, fieldHeight: 64, keyboardY: 800, gap: 24 }), 0)
  assert.equal(keyboardRevealDelta({ fieldY: 820, fieldHeight: 64, keyboardY: undefined, gap: 24 }), 0)
})

test('keyboard reveal ownership excludes unrelated and horizontal scroll views', () => {
  const target = 42
  assert.equal(shouldRevealFocusedField({ ownsFocus: true, horizontal: false, target, keyboardY: 800 }), true)
  assert.equal(shouldRevealFocusedField({ ownsFocus: false, horizontal: false, target, keyboardY: 800 }), false)
  assert.equal(shouldRevealFocusedField({ ownsFocus: true, horizontal: true, target, keyboardY: 800 }), false)
  assert.equal(shouldRevealFocusedField({ ownsFocus: true, horizontal: false, target: null, keyboardY: 800 }), false)
})

test('vertical keyboard reveal preserves the horizontal scroll offset', () => {
  assert.deepEqual(keyboardRevealScrollPosition({ scrollX: 135, scrollY: 220, delta: 48 }), { x: 135, y: 268, animated: true })
})

test('a resized Android viewport replaces a stale visible-keyboard boundary', () => {
  assert.equal(keyboardTopFromViewport({ viewportY: 72, viewportHeight: 488 }), 560)
  assert.equal(keyboardTopFromViewport({ viewportY: 72, viewportHeight: Number.NaN }), null)
})

test('focus-aware scrolling measures only its owned target and tracks keyboard frame changes', () => {
  const helper = source('src/components/FocusAwareScrollView.js')
  assert.doesNotMatch(helper, /TextInput\.State\.currentlyFocusedInput/)
  assert.match(helper, /ownsFocusedField\.current/)
  assert.match(helper, /handleBlur/)
  assert.match(helper, /keyboardWillChangeFrame/)
  assert.match(helper, /refreshAndroidKeyboardBoundary/)
  assert.match(helper, /onLayout\?\.\(event\)/)
  assert.match(helper, /onLayout=\{handleLayout\}/)
  assert.match(helper, /keyboardDidShow/)
  assert.match(helper, /keyboardDidHide/)
  assert.match(helper, /scrollTo\(keyboardRevealScrollPosition/)
  assert.match(helper, /contentOffset\?\.x/)
  assert.match(helper, /contentOffset\?\.y/)
  assert.match(helper, /onBlur=\{handleBlur\}/)
  assert.match(helper, /onFocus\?\.\(event\)/)
  assert.match(helper, /onBlur\?\.\(event\)/)
  assert.match(helper, /onScroll\?\.\(event\)/)
  assert.match(helper, /frameSubscription\?\.remove\(\)/)
  assert.match(helper, /cancelAnimationFrame\(revealFrame\.current\)/)
})
