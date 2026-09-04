import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  adaptItemDraftToSql,
  adaptItemPatchToSql,
  adaptSqlItem,
  fromSqlUsageDimension,
  toSqlItemType,
  toSqlUsageDimension,
} from '../src/lib/myStuffAdapters.js'
import {
  createMutationAttemptState,
  mutationIdForPayload,
  resetMutationAttemptState,
} from '../src/screens/myStuffModel.js'
import {
  buildCreateMyStuffItemV2WirePayload,
  buildRecordMyStuffReadingV2WirePayload,
  buildUpdateMyStuffItemV2WirePayload,
} from '../src/lib/myStuffPayloads.js'

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

test('item type adapter maps broad UI categories to the exact SQL enum', () => {
  assert.equal(toSqlItemType('vehicle'), 'car')
  assert.equal(toSqlItemType('home'), 'house')
  assert.equal(toSqlItemType('recreation'), 'other')
  assert.equal(toSqlItemType('side-by-side'), 'side_by_side')
  assert.equal(toSqlItemType('lawn mower'), 'mower')
  assert.equal(toSqlItemType('not-real'), 'other')
})

test('usage dimension adapter makes miles/mileage naming explicit and reversible', () => {
  assert.equal(toSqlUsageDimension('miles'), 'mileage')
  assert.equal(toSqlUsageDimension('hours'), 'hours')
  assert.equal(fromSqlUsageDimension('mileage'), 'miles')
  assert.equal(fromSqlUsageDimension('cycles'), 'cycles')
})

test('rich draft adapter emits only canonical V2 SQL keys', () => {
  assert.deepEqual(adaptItemDraftToSql({
    name: '  Work truck ', category: 'vehicle', year: '2020', make: 'Ford', model: 'F-150',
    serialNumber: 'ABC', measurements: ['miles', 'cycles'], currentUsage: { miles: 1200, cycles: 4 },
    acquiredOn: '2024-01-02', notes: ' kept ', usageProfile: 'severe',
  }), {
    name: 'Work truck', category: 'vehicle', item_type: 'car', model_year: 2020, make: 'Ford', model: 'F-150',
    serial_number: 'ABC', usage_dimensions: ['mileage', 'cycles'], current_mileage: 1200, origin_mileage: 1200,
    current_cycles: 4, origin_cycles: 4, acquired_on: '2024-01-02', notes: 'kept', usage_profile: 'severe',
  })
})

test('SQL item adapter prefers effective readings without lowering retained meter columns', () => {
  const item = adaptSqlItem({
    id: 'i', item_type: 'truck', category: 'truck', usage_dimensions: ['mileage', 'cycles'],
    current_mileage: 5000, effective_current_mileage: 4900, current_cycles: 10,
  })
  assert.equal(item.category, 'vehicle')
  assert.deepEqual(item.measurements, ['miles', 'cycles'])
  assert.deepEqual(item.currentUsage, { miles: 4900, cycles: 10 })
  assert.equal(item.current_mileage, 5000)
})

test('every exact SQL item type survives read-edit-write round trips', () => {
  const exactTypes = [
    'car', 'truck', 'motorcycle', 'boat', 'atv', 'side_by_side', 'mower', 'tractor',
    'trailer', 'generator', 'rv', 'equipment', 'bicycle', 'watch', 'electronics',
    'gaming', 'tool', 'exercise', 'instrument', 'furniture', 'house', 'other',
  ]
  for (const itemType of exactTypes) {
    const editable = adaptSqlItem({ id: itemType, item_type: itemType })
    assert.equal(editable.itemType, itemType, `${itemType} must remain exact when read`)
    assert.equal(adaptItemPatchToSql({ itemType: editable.itemType }).item_type, itemType, `${itemType} must remain exact when written`)
  }
})

test('category-only patches never rewrite exact item_type', () => {
  assert.deepEqual(adaptItemPatchToSql({ category: 'vehicle', name: 'Truck' }), {
    category: 'vehicle',
    name: 'Truck',
  })
  assert.deepEqual(adaptItemPatchToSql({ category: 'vehicle', itemType: 'truck' }), {
    category: 'vehicle',
    item_type: 'truck',
  })
})

test('create retries bind to the canonical adapted RPC payload', () => {
  let sequence = 0
  const state = createMutationAttemptState()
  const generate = () => `create-${++sequence}`
  const first = buildCreateMyStuffItemV2WirePayload({ name: ' Truck ', category: ' Vehicle ', notes: ' kept ' })
  const normalizedEquivalent = buildCreateMyStuffItemV2WirePayload({ name: 'Truck', category: 'Vehicle', notes: 'kept' })
  const changed = buildCreateMyStuffItemV2WirePayload({ name: 'Truck XL', category: 'Vehicle', notes: 'kept' })

  const firstId = mutationIdForPayload(state, first, generate)
  assert.deepEqual(normalizedEquivalent, first)
  assert.equal(mutationIdForPayload(state, normalizedEquivalent, generate), firstId)
  assert.notEqual(mutationIdForPayload(state, changed, generate), firstId)
  resetMutationAttemptState(state)
  assert.equal(mutationIdForPayload(state, changed, generate), 'create-3')
})

test('update retries bind to canonical adapted RPC payload including item ID', () => {
  let sequence = 0
  const state = createMutationAttemptState()
  const generate = () => `update-${++sequence}`
  const first = buildUpdateMyStuffItemV2WirePayload({ itemId: 'item-a', name: ' Truck ', notes: ' kept ' })
  const normalizedEquivalent = buildUpdateMyStuffItemV2WirePayload({ itemId: 'item-a', name: 'Truck', notes: 'kept' })
  const differentItem = buildUpdateMyStuffItemV2WirePayload({ itemId: 'item-b', name: 'Truck', notes: 'kept' })
  const changedPatch = buildUpdateMyStuffItemV2WirePayload({ itemId: 'item-b', name: 'Truck', notes: 'changed' })

  const firstId = mutationIdForPayload(state, first, generate)
  assert.deepEqual(normalizedEquivalent, first)
  assert.equal(mutationIdForPayload(state, normalizedEquivalent, generate), firstId)
  assert.notEqual(mutationIdForPayload(state, differentItem, generate), firstId)
  assert.notEqual(mutationIdForPayload(state, changedPatch, generate), 'update-2')
})

test('reading retries use canonical SQL dimensions and include item ID', () => {
  let sequence = 0
  const state = createMutationAttemptState()
  const generate = () => `reading-${++sequence}`
  const first = buildRecordMyStuffReadingV2WirePayload({ itemId: 'item-a', readingType: 'miles', value: 1200, recordedAt: '2026-09-03T12:00:00.000Z' })
  const aliasEquivalent = buildRecordMyStuffReadingV2WirePayload({ itemId: 'item-a', readingType: 'mileage', value: 1200, recordedAt: '2026-09-03T12:00:00.000Z' })
  const differentItem = buildRecordMyStuffReadingV2WirePayload({ itemId: 'item-b', readingType: 'mileage', value: 1200, recordedAt: '2026-09-03T12:00:00.000Z' })

  const firstId = mutationIdForPayload(state, first, generate)
  assert.deepEqual(aliasEquivalent, first)
  assert.equal(mutationIdForPayload(state, aliasEquivalent, generate), firstId)
  assert.notEqual(mutationIdForPayload(state, differentItem, generate), firstId)
})

test('rich editable fields survive create and update adaptation', () => {
  const rich = {
    transmission: ' Automatic ', drivetrain: '4WD', fuelType: 'Gasoline',
    engineModel: ' EcoBoost ', engineSerial: ' ENG-1 ', hullNumber: ' HULL-1 ',
    registrationNumber: ' REG-1 ', manufacturedOn: '2020-01-01', inServiceOn: '2020-02-01',
    purchasePrice: '24500.50', purchaseCurrency: 'usd', purchaseVendor: ' Dealer ',
  }
  const expected = {
    transmission: 'Automatic', drivetrain: '4WD', fuel_power_type: 'Gasoline',
    engine_model: 'EcoBoost', engine_serial: 'ENG-1', hull_number: 'HULL-1',
    registration_number: 'REG-1', manufactured_on: '2020-01-01', in_service_on: '2020-02-01',
    purchase_price: 24500.5, purchase_currency: 'USD', purchase_vendor: 'Dealer',
  }
  assert.deepEqual(adaptItemDraftToSql(rich), { ...expected, item_type: 'other' })
  assert.deepEqual(adaptItemPatchToSql(rich), expected)
})

test('V2 client preserves V1 exports and uses exact owner-scoped reads and RPC contracts', () => {
  const client = source('src/lib/myStuffClient.js')
  for (const name of ['listMyStuffItems','getMyStuffItem','createMyStuffItem','updateMyStuffItem','deleteMyStuffItem','createMyStuffSchedule','deleteMyStuffSchedule','completeMyStuffMaintenance']) {
    assert.match(client, new RegExp(`export async function ${name}\\(`))
  }
  for (const rpc of ['create_my_stuff_item_v2','update_my_stuff_item_v2','set_my_stuff_item_archived_v2','record_my_stuff_reading_v2','get_my_stuff_due_state_v2']) {
    assert.match(client, new RegExp(`rpc\\('${rpc}'`))
  }
  for (const table of ['my_stuff_items','my_stuff_readings','my_stuff_maintenance_definitions','my_stuff_service_occurrences']) {
    assert.match(client, new RegExp(`from\\('${table}'\\).*?eq\\('user_id', userId\\)`, 's'))
  }
  assert.deepEqual(buildCreateMyStuffItemV2WirePayload({ name: ' Truck ' }), { p_item: { name: 'Truck', item_type: 'other' } })
  assert.deepEqual(buildUpdateMyStuffItemV2WirePayload({ itemId: 'item-a', name: ' Truck ' }), { p_item_id: 'item-a', p_patch: { name: 'Truck' } })
  assert.equal(buildRecordMyStuffReadingV2WirePayload({ itemId: 'item-a', readingType: 'miles', value: 1 }).p_reading_type, 'mileage')
  assert.match(client, /from\('my_stuff_readings'\)[\s\S]*?order\('created_at', \{ ascending: false \}\)\.order\('id', \{ ascending: false \}\)/)
})

test('native UI exposes rich identity, cycles, append/correction, archive and due summary safely', () => {
  const create = source('src/screens/MyStuffCreateScreen.js')
  const detail = source('src/screens/MyStuffDetailScreen.js')
  const list = source('src/screens/MyStuffScreen.js')
  assert.match(create, /createMyStuffItemV2/)
  for (const label of ['Model year', 'Make', 'Model', 'Serial number', 'Transmission', 'Drivetrain', 'Fuel / power type', 'Cycles']) assert.match(create, new RegExp(label, 'i'))
  assert.match(detail, /itemType:item\.itemType/)
  assert.match(detail, /if\(itemType!==item\.itemType\)payload\.itemType=itemType/)
  assert.match(create, /buildCreateMyStuffItemV2WirePayload/)
  assert.match(detail, /buildUpdateMyStuffItemV2WirePayload/)
  assert.match(detail, /buildRecordMyStuffReadingV2WirePayload/)
  assert.match(detail, /recordMyStuffReadingV2/)
  assert.match(detail, /correctsReadingId/)
  assert.match(detail, /Correction reason/)
  assert.match(detail, /setMyStuffItemArchivedV2/)
  assert.match(detail, /Due-state summary/)
  assert.match(detail, /effective_current_mileage/)
  assert.doesNotMatch(detail, /current_mileage\s*:/)
  assert.match(list, /listMyStuffItemsV2/)
  assert.match(list, /Archived/)
  assert.match(list, /effective_current_cycles/)
  for (const sourceText of [create, detail]) {
    assert.match(sourceText, /mutationIdForPayload/)
    assert.match(sourceText, /InFlight/)
  }
  assert.match(detail, /archiveMutationId\.current\|\|/)
  assert.match(detail, /archiveMutationId\.current=null/)
  assert.match(detail, /itemInFlight/)
  for (const screen of [create, detail]) {
    assert.match(screen, /keyboardShouldPersistTaps="handled"/)
    assert.match(screen, /automaticallyAdjustKeyboardInsets=\{Platform\.OS === 'ios'\}/)
    assert.match(screen, /SafeAreaView/)
  }
  assert.match(create, /accessibilityRole="radiogroup"/)
  assert.match(detail, /accessibilityRole="radiogroup"/)
})
