import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../App.js', import.meta.url), 'utf8')

test('the root safe-area provider encloses navigation and every RootNavigator route', () => {
  assert.match(
    app,
    /<SafeAreaProvider initialMetrics=\{initialWindowMetrics\}>\s*<NavigationContainer\b[\s\S]*<RootNavigator \/>[\s\S]*<\/NavigationContainer>\s*<\/SafeAreaProvider>/,
  )
})
