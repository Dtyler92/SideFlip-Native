import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildCreateMaintenanceDefinitionV2WirePayload,
  buildRecordServiceOccurrenceV2WirePayload,
  buildUpdateMaintenanceDefinitionV2WirePayload,
} from '../src/lib/myStuffPayloads.js'
import { createMyStuffMaintenanceApi } from '../src/lib/myStuffMaintenanceApi.js'
import { runMutationThenRefresh } from '../src/lib/mutationLifecycle.js'
import {
  canCompleteMaintenanceSchedule,
  canCompleteMaintenanceDefinition,
  createMutationAttemptState,
  getMaintenanceDefinitionAxes,
  mutationIdForPayload,
} from '../src/screens/myStuffModel.js'

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

function makeRpcClient() {
  const calls = []
  return {
    calls,
    client: {
      async rpc(name, payload) {
        calls.push({ name, payload })
        return name === 'get_my_stuff_due_state_v2'
          ? { data: [{ definition_id: 'definition-1', due_status: 'upcoming' }], error: null }
          : { data: `${name}-result`, error: null }
      },
    },
  }
}

test('behavioral V2 lifecycle sends canonical task, usage, service, then refreshes due state', async () => {
  const { client, calls } = makeRpcClient()
  const api = createMyStuffMaintenanceApi(client)
  const definitionWire = buildCreateMaintenanceDefinitionV2WirePayload({
    itemId: 'item-1', name: '  Oil and annual service  ', description: '  Keep records  ',
    dueSemantics: 'whichever_first', activeProfile: 'normal', calendarMonths: '12',
    intervals: { miles: '5000', hours: '', cycles: null },
  })
  const readingWire = {
    p_item_id: 'item-1', p_reading_type: 'mileage', p_value: 6000,
    p_recorded_at: '2026-09-03T12:00:00.000Z', p_corrects_reading_id: null,
    p_correction_reason: null, p_metadata: {},
  }
  const serviceWire = buildRecordServiceOccurrenceV2WirePayload({
    itemId: 'item-1', definitionId: 'definition-1', completedAt: '2026-09-03T12:00:00.000Z',
    readings: { miles: '6000' }, notes: '  Changed oil  ',
  })

  await api.createDefinition(definitionWire, 'create-key')
  await api.recordReading(readingWire, 'reading-key')
  await api.recordServiceOccurrence(serviceWire, 'service-key')
  const due = await api.getDueState('item-1', '2026-09-03T13:00:00.000Z')

  assert.deepEqual(definitionWire, {
    p_item_id: 'item-1',
    p_definition: {
      name: 'Oil and annual service', description: 'Keep records', service_category: 'other',
      service_action: 'service', due_semantics: 'whichever_first', active_profile: 'normal',
      cadence_anchor: 'last_completion', normal_interval_miles: 5000, normal_calendar_months: 12,
      enabled: true,
    },
  })
  assert.deepEqual(serviceWire, {
    p_item_id: 'item-1', p_definition_id: 'definition-1',
    p_service: { completed_at: '2026-09-03T12:00:00.000Z', mileage: 6000, notes: 'Changed oil' },
  })
  assert.deepEqual(calls, [
    { name: 'create_my_stuff_maintenance_definition_v2', payload: { ...definitionWire, p_mutation_id: 'create-key' } },
    { name: 'record_my_stuff_reading_v2', payload: { ...readingWire, p_mutation_id: 'reading-key' } },
    { name: 'record_my_stuff_service_occurrence_v2', payload: { ...serviceWire, p_mutation_id: 'service-key' } },
    { name: 'get_my_stuff_due_state_v2', payload: { p_item_id: 'item-1', p_as_of: '2026-09-03T13:00:00.000Z' } },
  ])
  assert.deepEqual(due, [{ definition_id: 'definition-1', due_status: 'upcoming' }])
  assert.equal(JSON.stringify(calls).includes('provenance'), false)
})

test('definition payloads support combined calendar and active usage axes and safe archive edits', () => {
  const create = buildCreateMaintenanceDefinitionV2WirePayload({
    itemId: 'item-1', name: 'Combined', dueSemantics: 'all', activeProfile: 'severe',
    intervals: { miles: 1000, hours: 50, cycles: 25 }, calendarMonths: 6,
  })
  assert.deepEqual(create.p_definition, {
    name: 'Combined', service_category: 'other', service_action: 'service', due_semantics: 'all',
    active_profile: 'severe', cadence_anchor: 'last_completion', normal_interval_miles: 1000,
    normal_interval_hours: 50, normal_interval_cycles: 25, normal_calendar_months: 6, enabled: true,
  })
  assert.equal(Object.keys(create.p_definition).some(key => key.includes('provenance') || key.startsWith('citation')), false)

  assert.deepEqual(buildUpdateMaintenanceDefinitionV2WirePayload({
    definitionId: 'definition-1', name: ' Archived ', intervals: {}, calendarMonths: null, enabled: false,
  }), {
    p_definition_id: 'definition-1',
    p_definition: {
      name: 'Archived', normal_interval_miles: null, normal_interval_hours: null,
      normal_interval_cycles: null, normal_calendar_months: null, enabled: false,
    },
  })
})

test('service payload only emits configured readings and rejects disabled-meter completion in UI model', () => {
  const definition = { normal_interval_miles: 5000, normal_interval_hours: 100, normal_calendar_months: 12 }
  assert.deepEqual(getMaintenanceDefinitionAxes(definition), ['miles', 'hours', 'calendar'])
  assert.equal(canCompleteMaintenanceDefinition(definition, { measurements: ['miles', 'hours'] }), true)
  assert.equal(canCompleteMaintenanceDefinition(definition, { measurements: ['miles'] }), false)
  assert.equal(canCompleteMaintenanceDefinition({ normal_calendar_months: 12 }, { measurements: [] }), true)
  assert.deepEqual(buildRecordServiceOccurrenceV2WirePayload({
    itemId: 'item-1', definitionId: 'definition-1', completedAt: '2026-09-03T12:00:00.000Z',
    readings: { miles: 1234, hours: '', cycles: 999 }, configuredAxes: ['miles'], notes: '',
  }).p_service, { completed_at: '2026-09-03T12:00:00.000Z', mileage: 1234 })
})

test('native maintenance UI separates managed legacy schedules from all new V2 mutations', () => {
  const detail = source('src/screens/MyStuffDetailScreen.js')
  for (const symbol of [
    'createMyStuffMaintenanceDefinitionV2', 'updateMyStuffMaintenanceDefinitionV2',
    'recordMyStuffServiceOccurrenceV2', 'buildCreateMaintenanceDefinitionV2WirePayload',
    'buildRecordServiceOccurrenceV2WirePayload',
  ]) assert.match(detail, new RegExp(symbol))
  assert.doesNotMatch(detail, /await createMyStuffSchedule\(/)
  assert.match(detail, /mutate:\(\)=>completeMyStuffMaintenance\(legacyPayload\)/)
  assert.match(detail, /mutate:\(\)=>deleteMyStuffSchedule\(value\.id,user\.id\)/)
  assert.match(detail, /canCompleteMaintenanceSchedule\(value,item\)/)
  assert.match(detail, /legacyCompletionMutationAttempt=useRef\(createMutationAttemptState\(\)\)/)
  assert.match(detail, /if\(legacyCompletionInFlight\.current\)return/)
  assert.match(detail, /mutationIdForPayload\(legacyCompletionMutationAttempt\.current,canonicalPayload\)/)
  assert.match(detail, /occurrences\.map\(/)
  assert.match(detail, /Legacy schedules/)
  assert.doesNotMatch(detail, /Legacy schedules \(read-only\)/)
  assert.match(detail, /Legacy service history \(read-only\)/)
  assert.match(detail, /mutationIdForPayload\(definitionMutationAttempt\.current,wirePayload\)/)
  assert.match(detail, /mutationIdForPayload\(serviceMutationAttempt\.current,wirePayload\)/)
  assert.match(detail, /runMutationThenRefresh\(/)
  assert.match(detail, /refresh:\(\)=>load\(\{quiet:true,throwOnError:true\}\)/)
  assert.match(detail, /saved, but refresh failed/)
  assert.doesNotMatch(detail, /\{(?:isPro|hasPro)&&[^}\n]*(?:maintenance|service)/i)
})

test('V2 item save finalizes retry state before a separately reported refresh failure', () => {
  const detail = source('src/screens/MyStuffDetailScreen.js')
  const start = detail.indexOf('async function saveItem()')
  const end = detail.indexOf('function definitionUsageAxes', start)
  const saveItem = detail.slice(start, end)
  assert.match(saveItem, /runMutationThenRefresh\(/)
  assert.match(saveItem, /mutate:\(\)=>updateMyStuffItemV2\(wirePayload,mutationId\)/)
  assert.match(saveItem, /onMutationSuccess:\(\)=>\{resetMutationAttemptState\(itemMutationAttempt\.current\);setEditing\(false\)\}/)
  assert.match(saveItem, /refresh:\(\)=>load\(\{quiet:true,throwOnError:true\}\)/)
  assert.match(saveItem, /Item details saved, but refresh failed/)
  assert.doesNotMatch(saveItem, /await updateMyStuffItemV2\(wirePayload,mutationId\)/)
})

test('legacy completion retains the canonical V1 RPC contract and deletion stays owner scoped', async () => {
  const calls = []
  const client = {
    async rpc(name, payload) {
      calls.push({ name, payload })
      return { data: 'legacy-result', error: null }
    },
    from(table) {
      const operation = { table, filters: [] }
      calls.push(operation)
      return {
        delete() { return this },
        eq(column, value) {
          operation.filters.push([column, value])
          return operation.filters.length === 2 ? Promise.resolve({ error: null }) : this
        },
      }
    },
  }
  const api = createMyStuffMaintenanceApi(client)
  const payload = {
    scheduleId: 'legacy-schedule', completedAt: '2026-09-03', reading: 1234,
    cost: 45.5, notes: 'Changed oil', mutationId: 'legacy-key',
  }

  assert.equal(await api.completeLegacySchedule(payload), 'legacy-result')
  await api.deleteLegacySchedule('legacy-schedule', 'owner-1')

  assert.deepEqual(calls, [
    { name: 'complete_my_stuff_maintenance', payload: {
      p_schedule_id: 'legacy-schedule', p_completed_at: '2026-09-03', p_reading: 1234,
      p_cost: 45.5, p_notes: 'Changed oil', p_mutation_id: 'legacy-key',
    } },
    { table: 'my_stuff_schedules', filters: [['id', 'legacy-schedule'], ['user_id', 'owner-1']] },
  ])
  assert.equal(canCompleteMaintenanceSchedule({ tracking_type: 'mileage' }, { measurements: [] }), false)
  assert.equal(canCompleteMaintenanceSchedule({ tracking_type: 'calendar' }, { measurements: [] }), true)
})

test('canonical retry lifecycle reuses unchanged IDs, rotates changed payloads, and gates concurrent calls', async () => {
  const state = createMutationAttemptState()
  let generated = 0
  const generate = () => `mutation-${++generated}`
  const canonical = { p_definition_id: 'definition-1', p_service: { notes: 'Changed oil' } }
  const reordered = { p_service: { notes: 'Changed oil' }, p_definition_id: 'definition-1' }

  assert.equal(mutationIdForPayload(state, canonical, generate), 'mutation-1')
  assert.equal(mutationIdForPayload(state, reordered, generate), 'mutation-1')
  assert.equal(mutationIdForPayload(state, { ...canonical, p_service: { notes: 'Changed filter' } }, generate), 'mutation-2')

  let inFlight = false
  let release
  const calls = []
  const submit = async payload => {
    if (inFlight) return false
    inFlight = true
    calls.push(payload)
    try { await new Promise(resolve => { release = resolve }) }
    finally { inFlight = false }
    return true
  }
  const first = submit(canonical)
  assert.equal(await submit(canonical), false)
  release()
  assert.equal(await first, true)
  assert.equal(calls.length, 1)
})

test('successful maintenance mutation is finalized before a separately reported refresh failure', async () => {
  const events = []
  const mutationError = new Error('mutation failed')
  const refreshError = new Error('refresh failed')

  const result = await runMutationThenRefresh({
    mutate: async () => { events.push('mutation') },
    onMutationSuccess: () => { events.push('success-reset') },
    refresh: async () => { events.push('refresh'); throw refreshError },
    onMutationError: error => { events.push(['mutation-error', error]) },
    onRefreshError: error => { events.push(['refresh-error', error]) },
  })

  assert.deepEqual(events, [
    'mutation',
    'success-reset',
    'refresh',
    ['refresh-error', refreshError],
  ])
  assert.deepEqual(result, { mutationSucceeded: true, refreshSucceeded: false })
  assert.equal(events.some(event => Array.isArray(event) && event[1] === mutationError), false)
})

test('failed maintenance mutation retains retry state and never refreshes', async () => {
  const events = []
  const mutationError = new Error('mutation failed')

  const result = await runMutationThenRefresh({
    mutate: async () => { events.push('mutation'); throw mutationError },
    onMutationSuccess: () => { events.push('success-reset') },
    refresh: async () => { events.push('refresh') },
    onMutationError: error => { events.push(['mutation-error', error]) },
    onRefreshError: error => { events.push(['refresh-error', error]) },
  })

  assert.deepEqual(events, ['mutation', ['mutation-error', mutationError]])
  assert.deepEqual(result, { mutationSucceeded: false, refreshSucceeded: false })
})
