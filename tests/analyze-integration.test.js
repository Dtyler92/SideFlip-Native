import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('Calculator tab is replaced by Analyze with a profit-oriented icon and primary Deal Analyzer', () => {
  const app = read('App.js')
  const analyze = read('src/screens/AnalyzeScreen.js')
  assert.match(app, /Tab\.Screen name="Analyze" component=\{AnalyzeScreen\}/)
  assert.match(app, /tabBarLabel: 'Analyze'/)
  assert.match(app, /emoji="📈"/)
  assert.doesNotMatch(app, /tabBarLabel: 'Calculator'/)
  assert.match(analyze, /Deal Analyzer/)
  assert.match(analyze, /Quick Deal Check/)
  assert.match(analyze, /List Price Calculator/)
  assert.match(analyze, /Maximum Buy Price/)
  assert.match(analyze, /Profit Calculator/)
})

test('Analyze integrates owner projects and Project Detail exposes prefilled Analyze action', () => {
  const analyze = read('src/screens/AnalyzeScreen.js')
  const detail = read('src/screens/ProjectDetailScreen.js')
  assert.match(analyze, /from\('projects'\)\.select\('id,title,status,purchase_price,expenses\(id,category,amount,description\)'\)\.eq\('user_id', user\.id\)/)
  assert.match(analyze, /Analyze Existing Project/)
  assert.match(analyze, /projectAnalysisDraft/)
  assert.match(detail, />Analyze Flip</)
  assert.match(detail, /navigate\('Main',\s*\{\s*screen:\s*'Analyze'/)
})

test('custom profit and platform fee inputs are conditional', () => {
  const analyze = read('src/screens/AnalyzeScreen.js')
  assert.match(analyze, /const ROI_PRESETS = \['10', '25', '50', '100', '150'\]/)
  assert.match(analyze, /profitPreset === 'custom'/)
  assert.match(analyze, /preset === 'custom'/)
  assert.match(analyze, /Facebook/)
  assert.match(analyze, /Craigslist/)
  assert.match(analyze, /eBay/)
})

test('Analyze keeps future market estimates explicit and never fabricates AI data', () => {
  const analyze = read('src/screens/AnalyzeScreen.js')
  assert.match(analyze, /Estimated resale values are entered by you/i)
  assert.doesNotMatch(analyze, /mock|fake AI|sample comparable/i)
})

test('Analyze uses the selected profile currency and guards asynchronous project prefills', () => {
  const analyze = read('src/screens/AnalyzeScreen.js')
  assert.match(analyze, /const \{ currencySymbol \} = useAuth\(\)/)
  assert.match(analyze, /<Field \{\.\.\.props\} currencySymbol=\{currencySymbol\}\/?>/)
  assert.doesNotMatch(analyze, /Profit \$/)
  assert.match(analyze, /loadGeneration\.current/)
  assert.match(analyze, /requestedId === route\?\.params\?\.projectId/)
})

test('Analyze validates local records and clears them after account deletion', () => {
  const store = read('src/lib/analysisStore.js')
  const deletion = read('src/screens/DeleteAccountScreen.js')
  assert.match(store, /normalizeSavedAnalyses/)
  assert.match(store, /clearSavedAnalyses/)
  assert.match(store, /const queues=new Map\(\)/)
  assert.match(deletion, /clearSavedAnalyses\(user\.id\)/)
  assert.ok(deletion.indexOf("if (!response.ok || !body.deleted)") < deletion.indexOf('clearSavedAnalyses(user.id)'), 'remote deletion must succeed before local cleanup')
  assert.match(deletion, /Account deleted, but local cleanup is incomplete/)
})

test('Analyze bounds visible numeric inputs and provides an iOS decimal-keyboard Done action', () => {
  const analyze = read('src/screens/AnalyzeScreen.js')
  assert.match(analyze, /MAX_CURRENCY_AMOUNT/)
  assert.match(analyze, /MAX_ROI_PERCENT/)
  assert.match(analyze, /MAX_PLATFORM_FEE_PERCENT/)
  assert.match(analyze, /InputAccessoryView/)
  assert.match(analyze, /inputAccessoryViewID/)
  assert.match(analyze, />Done</)
})
