import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

test('My Stuff uses only its three separate tables and fixed creation/completion RPCs', () => {
  const client = source('src/lib/myStuffClient.js')
  const maintenanceApi = source('src/lib/myStuffMaintenanceApi.js')
  const maintenanceSources = `${client}\n${maintenanceApi}`
  assert.match(client, /from\('my_stuff_items'\)/)
  assert.match(maintenanceSources, /from\('my_stuff_schedules'\)/)
  assert.match(client, /from\('my_stuff_service_logs'\)/)
  assert.match(client, /rpc\('create_my_stuff_item'/)
  assert.match(client, /rpc\('create_my_stuff_schedule'/)
  assert.match(maintenanceSources, /rpc\('complete_my_stuff_maintenance'/)
  assert.doesNotMatch(maintenanceSources, /from\('(projects|expenses|trade_up_goals|goal_ledger)'\)/)
  assert.doesNotMatch(client, /from\('my_stuff_items'\)\.insert/)
  assert.doesNotMatch(client, /from\('my_stuff_schedules'\)\.insert/)
})

test('creation and completion RPC payloads use the fixed contract', () => {
  const client = source('src/lib/myStuffClient.js')
  const maintenanceSources = `${client}\n${source('src/lib/myStuffMaintenanceApi.js')}`
  for (const parameter of ['p_name','p_category','p_acquired_on','p_notes','p_current_mileage','p_current_hours','p_mutation_id']) {
    assert.match(client, new RegExp(`${parameter}:`))
  }
  for (const parameter of ['p_schedule_id','p_completed_at','p_reading','p_cost','p_notes']) {
    assert.match(maintenanceSources, new RegExp(`${parameter}:`))
  }
  for (const parameter of ['p_item_id','p_tracking_type','p_interval_value','p_last_completed_at','p_last_completed_value']) {
    assert.match(client, new RegExp(`${parameter}:`))
  }
})

test('My Stuff replaces the former Settings tab and registers full stack navigation', () => {
  const app = source('App.js')
  assert.match(app, /<Tab\.Screen name="MyStuff" component=\{MyStuffScreen\}/)
  assert.match(app, /tabBarLabel: 'My Stuff'/)
  assert.match(app, /name="MyStuffCreate" component=\{MyStuffCreateScreen\}/)
  assert.match(app, /name="MyStuffDetail" component=\{MyStuffDetailScreen\}/)
  assert.doesNotMatch(app, /<Tab\.Screen name="Settings"/)
})

test('downgrades retain and manage every loaded item without entitlement filtering', () => {
  const list = source('src/screens/MyStuffScreen.js')
  const detail = source('src/screens/MyStuffDetailScreen.js')
  assert.doesNotMatch(list, /items\.filter\([^)]*isPro/)
  assert.doesNotMatch(list, /isPro\s*\?\s*items/)
  assert.match(list, /canCreateMyStuffItem\(\{ isPro, itemCount: items\.length \}\)/)
  assert.match(detail, /updateMyStuffItem/)
  assert.match(detail, /deleteMyStuffItem/)
  assert.doesNotMatch(detail, /if\s*\(!isPro\)/)
})

test('Android-safe Pro information has no Apple, restore, checkout, or purchase CTA copy', () => {
  const sources = [
    source('src/screens/MyStuffScreen.js'),
    source('src/screens/MyStuffCreateScreen.js'),
  ].join('\n')
  assert.doesNotMatch(sources, /Apple|App Store|Restore Purchases|checkout|Buy Pro|Purchase Pro/i)
  assert.match(sources, /View SideFlip Pro/)
})

test('all My Stuff forms are keyboard-safe and support every maintenance mode and history', () => {
  const create = source('src/screens/MyStuffCreateScreen.js')
  const detail = source('src/screens/MyStuffDetailScreen.js')
  for (const form of [create, detail]) {
    assert.match(form, /ScrollView/)
    assert.match(form, /keyboardShouldPersistTaps="handled"/)
    assert.match(form, /automaticallyAdjustKeyboardInsets=\{Platform\.OS === 'ios'\}/)
  }
  assert.match(detail, /mileage/)
  assert.match(detail, /hours/)
  assert.match(detail, /calendar/)
  assert.match(detail, /Service history/)
  assert.match(detail, /recordMyStuffServiceOccurrenceV2/)
})

test('item creation always defers entitlement authority to the server RPC', () => {
  const create = source('src/screens/MyStuffCreateScreen.js')
  assert.doesNotMatch(create, /canCreateMyStuffItem/)
  assert.match(create, /await createMyStuffItem/)
  assert.match(create, /Free accounts can have one My Stuff item/)
  assert.match(create, /navigation\.replace\('Pro'\)/)
})

test('maintenance retries retain one mutation key and block synchronous double submits', () => {
  const detail = source('src/screens/MyStuffDetailScreen.js')
  assert.match(detail, /serviceMutationAttempt=useRef\(createMutationAttemptState\(\)\)/)
  assert.match(detail, /completionInFlight=useRef\(false\)/)
  assert.match(detail, /if\(completionInFlight\.current\)return/)
  assert.match(detail, /mutationId=mutationIdForPayload\(serviceMutationAttempt\.current,wirePayload\)/)
  assert.doesNotMatch(detail, /mutationId:createMutationId\(\)/)
})

test('schedule retries retain one mutation key and block synchronous double submits', () => {
  const detail = source('src/screens/MyStuffDetailScreen.js')
  assert.match(detail, /definitionMutationAttempt=useRef\(createMutationAttemptState\(\)\)/)
  assert.match(detail, /definitionInFlight=useRef\(false\)/)
  assert.match(detail, /if\(definitionInFlight\.current\)return/)
  assert.match(detail, /mutationId=mutationIdForPayload\(definitionMutationAttempt\.current,wirePayload\)/)
})

test('retained history readings do not depend on a surviving schedule', () => {
  const detail = source('src/screens/MyStuffDetailScreen.js')
  assert.match(detail, /log\.mileage!=null\?log\.mileage:log\.hours!=null\?log\.hours:null/)
  assert.match(detail, /occurrences\.map\(occurrence=>/)
  assert.match(detail, /latest_revision\?\.notes/)
})

test('My Stuff stack headers and loads handle safe areas and stale requests', () => {
  const create = source('src/screens/MyStuffCreateScreen.js')
  const detail = source('src/screens/MyStuffDetailScreen.js')
  const list = source('src/screens/MyStuffScreen.js')
  assert.match(create, /SafeAreaView/)
  assert.match(detail, /SafeAreaView/)
  assert.doesNotMatch(create, /paddingTop:52/)
  assert.doesNotMatch(detail, /paddingTop:52/)
  assert.match(list, /requestGeneration/)
  assert.match(detail, /requestGeneration/)
})
