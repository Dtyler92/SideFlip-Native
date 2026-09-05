import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const screen = name => readFileSync(new URL(`../src/screens/${name}.js`, import.meta.url), 'utf8')
const monetaryScreens = [
  'HomeScreen',
  'AnalyticsScreen',
  'CalculatorScreen',
  'NewProjectScreen',
  'ProjectDetailScreen',
  'SellProjectScreen',
]

test('all native project-tracking money displays use the selected profile currency', () => {
  for (const name of monetaryScreens) {
    const source = screen(name)
    assert.match(source, /useAuth\(\)/, `${name} must read the shared auth/profile currency`)
    assert.match(source, /formatMoney/, `${name} must use the shared selected-currency formatter`)
    assert.doesNotMatch(source, /const (?:fmt|money)\s*=.*['"]\$/, `${name} must not define a hardcoded-dollar formatter`)
  }
})

test('sale guidance uses the selected currency symbol instead of hardcoded dollar-zero copy', () => {
  const source = screen('SellProjectScreen')
  assert.match(source, /currencySymbol/)
  assert.doesNotMatch(source, /greater than \$0|between \$0|Leave \$0/)
})

test('Android V1.3.0 advances version code while accepted iOS build remains frozen', () => {
  const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'))
  assert.equal(app.expo.version, '1.3.0')
  assert.equal(app.expo.android.package, 'com.sideflip.app')
  assert.equal(app.expo.android.versionCode, 8)
  assert.equal(app.expo.ios.bundleIdentifier, 'com.sideflip.app')
  assert.equal(app.expo.ios.buildNumber, '17')
})
