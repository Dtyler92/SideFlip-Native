import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const source = path => readFileSync(new URL(path, root), 'utf8')

test('superseded native screens and components are removed from source and tests', () => {
  assert.equal(existsSync(new URL('src/screens/CalculatorScreen.js', root)), false)
  assert.equal(existsSync(new URL('src/components/PhotoPicker.js', root)), false)
  assert.equal(existsSync(new URL('src/screens/NoSubscriptionScreen.js', root)), false)

  const currencyTest = source('tests/currency-formatting.test.js')
  const readinessTest = source('tests/android-play-readiness.test.js')
  assert.doesNotMatch(currencyTest, /CalculatorScreen/)
  assert.doesNotMatch(readinessTest, /src\/components\/PhotoPicker\.js/)
})

test('My Stuff detail avoids reloading the same item while preserving one expense-state owner', () => {
  const detail = source('src/screens/MyStuffDetailScreen.js')
  const client = source('src/lib/myStuffClient.js')
  const v3 = source('src/components/MyStuffV3Experience.js')

  assert.doesNotMatch(detail, /\bgetMyStuffItem\(/)
  assert.match(detail, /getMyStuffLegacyMaintenance\(/)
  assert.match(client, /export async function getMyStuffItem\(/)
  assert.match(client, /released V1 call-site compatibility/)
  assert.doesNotMatch(detail, /initialExpenses=|initialFinancialSummary=/)
  assert.doesNotMatch(v3, /initialExpenses|initialFinancialSummary/)
})

test('unused component props and local bindings are removed', () => {
  const vin = source('src/components/VinDecodePanel.js')
  const onboarding = source('src/screens/OnboardingScreen.js')
  const maintenance = source('src/domain/myStuff/maintenanceModel.js')

  assert.doesNotMatch(vin, /function VinDecodePanel\([^)]*\bisPro\b/)
  assert.doesNotMatch(vin, /function VinDecodePanel\([^)]*\bonUpgrade\b/)
  assert.doesNotMatch(onboarding, /const \{ user, signOut \} = useAuth\(\)/)
  assert.doesNotMatch(maintenance, /function numericAxisState\(axis,/)
})
