import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DUE_SOON_THRESHOLDS,
  addCalendarMonths,
  appendServiceCompletion,
  calculateMaintenanceDueState,
  validateMaintenanceProgram,
} from '../src/domain/myStuff/maintenanceModel.js'

const origin = { date: '2024-01-31', miles: 1000, hours: 10, cycles: 2 }

test('month arithmetic clamps to month end and leap day', () => {
  assert.equal(addCalendarMonths('2024-01-31', 1), '2024-02-29')
  assert.equal(addCalendarMonths('2023-01-31', 1), '2023-02-28')
  assert.equal(addCalendarMonths('2024-02-29', 12), '2025-02-28')
  assert.equal(addCalendarMonths('2200-12-31', 1), null)
})

test('first service uses asset origin, then recurring service uses last completion', () => {
  const task = {
    mode: 'whichever_first', profile: 'normal',
    firstService: { miles: 1000, months: 6 },
    normal: { miles: 5000, months: 12 },
    severe: { miles: 2500, months: 6 },
  }
  const first = calculateMaintenanceDueState({ task, assetOrigin: origin, currentUsage: { miles: 1999 }, asOfDate: '2024-08-01', completions: [] })
  assert.equal(first.intervalSource, 'first_service')
  assert.equal(first.anchorSource, 'asset_origin')
  assert.equal(first.status, 'overdue')
  assert.equal(first.axes.miles.dueAt, 2000)

  const completions = [{ completedAt: '2024-08-31', readings: { miles: 2100 } }]
  const recurring = calculateMaintenanceDueState({ task, assetOrigin: origin, currentUsage: { miles: 6599 }, asOfDate: '2025-08-01', completions })
  assert.equal(recurring.intervalSource, 'normal')
  assert.equal(recurring.anchorSource, 'last_completion')
  assert.equal(recurring.axes.miles.dueAt, 7100)
  assert.equal(recurring.axes.months.dueAt, '2025-08-31')
  assert.equal(recurring.status, 'due_soon')
})

test('first service ignores non-qualifying history and ends after the first qualifying completion', () => {
  const task = { mode: 'any', profile: 'normal', firstService: { hours: 25 }, normal: { hours: 100 } }
  const state = calculateMaintenanceDueState({
    task,
    assetOrigin: origin,
    currentUsage: { hours: 20 },
    asOfDate: '2024-03-01',
    completions: [{ completedAt: '2024-02-01', readings: { hours: 15 }, qualifying: false }],
  })
  assert.equal(state.intervalSource, 'first_service')
  assert.equal(state.anchorSource, 'asset_origin')
})

test('severe profile is explicit and whichever-first evaluates every supported axis', () => {
  const task = { mode: 'any', profile: 'severe', normal: { hours: 100 }, severe: { hours: 50, cycles: 20 } }
  const state = calculateMaintenanceDueState({ task, assetOrigin: origin, currentUsage: { hours: 61, cycles: 10 }, asOfDate: '2024-02-01', completions: [] })
  assert.equal(state.intervalSource, 'severe')
  assert.equal(state.axes.hours.status, 'overdue')
  assert.equal(state.status, 'overdue')
})

test('missing applicable usage axis reports needs_usage_update instead of upcoming', () => {
  const task = { mode: 'whichever_first', profile: 'normal', normal: { miles: 5000, hours: 100 } }
  const state = calculateMaintenanceDueState({ task, assetOrigin: origin, currentUsage: { miles: 1200 }, asOfDate: '2024-02-01', completions: [] })
  assert.equal(state.axes.hours.status, 'unknown')
  assert.equal(state.status, 'needs_usage_update')
  assert.deepEqual(state.missingAxes, ['hours'])
})

test('due soon thresholds are centralized for miles, hours, cycles, and calendar days', () => {
  assert.deepEqual(DUE_SOON_THRESHOLDS, { miles: 500, hours: 10, cycles: 10, days: 30 })
  const task = { mode: 'whichever_first', profile: 'normal', normal: { miles: 1000, hours: 50, cycles: 100, months: 2 } }
  const state = calculateMaintenanceDueState({ task, assetOrigin: origin, currentUsage: { miles: 1500, hours: 50, cycles: 92 }, asOfDate: '2024-02-15', completions: [] })
  assert.equal(state.status, 'due_soon')
  assert.equal(state.axes.miles.status, 'due_soon')
  const dueNow = calculateMaintenanceDueState({ task, assetOrigin: origin, currentUsage: { miles: 2000, hours: 11, cycles: 3 }, asOfDate: '2024-02-01', completions: [] })
  assert.equal(dueNow.status, 'due_now')
})

test('each task can safely customize due-soon thresholds including cycles', () => {
  const task = {
    mode: 'whichever_first', profile: 'normal', normal: { miles: 1000, hours: 100, cycles: 100, months: 2 },
    dueSoonThresholds: { miles: 100, hours: 2, cycles: 3, days: 5 },
  }
  const state = calculateMaintenanceDueState({ task, assetOrigin: origin, currentUsage: { miles: 1800, hours: 108, cycles: 99 }, asOfDate: '2024-03-26' })
  assert.equal(state.axes.miles.status, 'upcoming')
  assert.equal(state.axes.hours.status, 'due_soon')
  assert.equal(state.axes.cycles.status, 'due_soon')
  assert.equal(state.axes.months.status, 'due_soon')
  assert.match(validateMaintenanceProgram({ ...task, dueSoonThresholds: { cycles: -1 } }).errors.dueSoonThresholds, /cycles/)
  assert.match(validateMaintenanceProgram({ ...task, dueSoonThresholds: { cycles: 1.5 } }).errors.dueSoonThresholds, /whole number/)
  assert.match(validateMaintenanceProgram({ ...task, dueSoonThresholds: { days: 100_000 } }).errors.dueSoonThresholds, /days/)
})

test('legacy any mode is an explicit alias for whichever-first behavior', () => {
  const state = calculateMaintenanceDueState({ task: { mode: 'any', profile: 'normal', normal: { hours: 100 } }, assetOrigin: origin, currentUsage: { hours: 20 } })
  assert.equal(state.mode, 'whichever_first')
})

test('same-day completion tie-break uses created timestamp and then stable ID', () => {
  const task = { mode: 'whichever_first', profile: 'normal', normal: { miles: 1000 } }
  const byCreatedAt = calculateMaintenanceDueState({
    task, currentUsage: { miles: 300 }, completions: [
      { id: 'z', completedAt: '2025-01-01', createdAt: '2025-01-01T09:00:00Z', readings: { miles: 100 } },
      { id: 'a', completedAt: '2025-01-01', created_at: '2025-01-01T10:00:00Z', readings: { miles: 200 } },
    ],
  })
  assert.equal(byCreatedAt.axes.miles.dueAt, 1200)

  const byId = calculateMaintenanceDueState({
    task, currentUsage: { miles: 300 }, completions: [
      { id: 'a', completedAt: '2025-01-01', createdAt: '2025-01-01T10:00:00Z', readings: { miles: 200 } },
      { id: 'b', completedAt: '2025-01-01', createdAt: '2025-01-01T10:00:00Z', readings: { miles: 250 } },
    ],
  })
  assert.equal(byId.axes.miles.dueAt, 1250)
})

test('future completions do not become the latest completion for an earlier as-of date', () => {
  const state = calculateMaintenanceDueState({
    task: { mode: 'whichever_first', profile: 'normal', normal: { miles: 1000, months: 12 } },
    assetOrigin: { date: '2024-01-01', miles: 100 },
    currentUsage: { miles: 300 },
    asOfDate: '2025-06-01',
    completions: [
      { completed_at: '2025-01-01', readings: { miles: 200 } },
      { completed_at: '2025-07-01', readings: { miles: 900 } },
    ],
  })
  assert.equal(state.axes.miles.dueAt, 1200)
  assert.equal(state.axes.months.dueAt, '2026-01-01')
})

test('a malformed supplied as-of date fails closed instead of admitting future history', () => {
  const state = calculateMaintenanceDueState({
    task: { mode: 'whichever_first', profile: 'normal', normal: { miles: 1000 } },
    assetOrigin: { miles: 100 },
    currentUsage: { miles: 300 },
    asOfDate: 'not-a-date',
    completions: [{ completedAt: '2099-01-01', readings: { miles: 900 } }],
  })
  assert.equal(state.status, 'invalid')
  assert.match(state.errors.asOfDate, /valid calendar date/i)
  assert.deepEqual(state.axes, {})
})

test('date-like garbage is rejected across maintenance cutoff, completion, and origin dates', () => {
  const task = { mode: 'whichever_first', profile: 'normal', normal: { miles: 1000, months: 12 } }
  const invalidCutoff = calculateMaintenanceDueState({
    task,
    assetOrigin: { date: '2024-01-01', miles: 100 },
    currentUsage: { miles: 300 },
    asOfDate: '2025-06-01garbage',
    completions: [{ completedAt: '2099-01-01', readings: { miles: 900 } }],
  })
  assert.equal(invalidCutoff.status, 'invalid')
  assert.match(invalidCutoff.errors.asOfDate, /valid calendar date/i)

  const fallbackCompletion = calculateMaintenanceDueState({
    task,
    assetOrigin: { date: '2024-01-01', miles: 100 },
    currentUsage: { miles: 300 },
    asOfDate: '2025-06-01',
    completions: [{ completedAt: '2025-05-01garbage', completed_at: '2025-01-01', readings: { miles: 200 } }],
  })
  assert.equal(fallbackCompletion.axes.miles.dueAt, 1200)
  assert.equal(fallbackCompletion.axes.months.dueAt, '2026-01-01')

  const invalidOrigin = calculateMaintenanceDueState({
    task: { mode: 'whichever_first', profile: 'normal', normal: { months: 12 } },
    assetOrigin: { date: '2024-01-01garbage' },
    asOfDate: '2025-06-01',
  })
  assert.equal(invalidOrigin.status, 'needs_usage_update')
  assert.deepEqual(invalidOrigin.axes.months, { status: 'unknown', dueAt: null, remaining: null })

  const validIsoTimestamp = calculateMaintenanceDueState({
    task,
    assetOrigin: { date: '2024-01-01', miles: 100 },
    currentUsage: { miles: 300 },
    asOfDate: '2025-06-01T12:00:00.000Z',
    completions: [{ completedAt: '2025-01-01T08:30:00+00:00', readings: { miles: 200 } }],
  })
  assert.equal(validIsoTimestamp.status, 'upcoming')
  assert.equal(validIsoTimestamp.axes.miles.dueAt, 1200)
  assert.equal(validIsoTimestamp.axes.months.dueAt, '2026-01-01')
})

test('a malformed camelCase completion date falls back to a valid snake_case date', () => {
  const state = calculateMaintenanceDueState({
    task: { mode: 'whichever_first', profile: 'normal', normal: { miles: 1000 } },
    assetOrigin: { miles: 100 },
    currentUsage: { miles: 300 },
    asOfDate: '2025-06-01',
    completions: [{ completedAt: 'invalid', completed_at: '2025-01-01', readings: { miles: 200 } }],
  })
  assert.equal(state.anchorSource, 'last_completion')
  assert.equal(state.axes.miles.dueAt, 1200)
})

test('a malformed camelCase created timestamp falls back to a valid snake_case timestamp', () => {
  const state = calculateMaintenanceDueState({
    task: { mode: 'whichever_first', profile: 'normal', normal: { miles: 1000 } },
    currentUsage: { miles: 300 },
    completions: [
      {
        id: 'later',
        completedAt: '2025-01-01',
        createdAt: 'invalid',
        created_at: '2025-01-01T11:00:00Z',
        readings: { miles: 250 },
      },
      { id: 'earlier', completedAt: '2025-01-01', createdAt: '2025-01-01T10:00:00Z', readings: { miles: 200 } },
    ],
  })
  assert.equal(state.axes.miles.dueAt, 1250)
})

test('date-parseable created timestamp garbage falls back to valid snake_case timestamp', () => {
  const state = calculateMaintenanceDueState({
    task: { mode: 'whichever_first', profile: 'normal', normal: { miles: 1000 } },
    currentUsage: { miles: 300 },
    completions: [
      {
        id: 'later',
        completedAt: '2025-01-01',
        createdAt: '2025-01-01 (garbage)',
        created_at: '2025-01-01T11:00:00Z',
        readings: { miles: 250 },
      },
      { id: 'earlier', completedAt: '2025-01-01', createdAt: '2025-01-01T10:00:00Z', readings: { miles: 200 } },
    ],
  })
  assert.equal(state.axes.miles.dueAt, 1250)
})

test('a current reading below the selected completion reading is unknown', () => {
  const state = calculateMaintenanceDueState({
    task: { mode: 'whichever_first', profile: 'normal', normal: { hours: 100 } },
    currentUsage: { hours: 400 },
    asOfDate: '2025-06-01',
    completions: [{ completedAt: '2025-05-01', readings: { hours: 500 } }],
  })
  assert.equal(state.status, 'needs_usage_update')
  assert.deepEqual(state.axes.hours, { status: 'unknown', dueAt: null, remaining: null })
})

test('program validation rejects missing profiles and out-of-bounds or fractional intervals', () => {
  assert.equal(validateMaintenanceProgram({ mode: 'whichever_first', profile: 'normal', normal: { miles: 5000 } }).ok, true)
  assert.match(validateMaintenanceProgram({ mode: 'all', profile: 'normal', normal: { miles: 1 } }).errors.mode, /whichever_first/)
  assert.match(validateMaintenanceProgram({ mode: 'any', profile: 'severe', normal: { miles: 1 } }).errors.severe, /required/)
  assert.match(validateMaintenanceProgram({ mode: 'any', profile: 'normal', normal: { months: 1201 } }).errors.normal, /months/)
  assert.match(validateMaintenanceProgram({ mode: 'any', profile: 'normal', normal: { cycles: 1.5 } }).errors.normal, /whole number/)
})

test('appending a completion does not mutate old records or readings', () => {
  const history = [{ id: 'old', completedAt: '2024-01-01', readings: { miles: 1000 }, notes: 'kept' }]
  const oldSnapshot = structuredClone(history)
  const next = appendServiceCompletion(history, { id: 'new', completedAt: '2024-02-01', readings: { miles: 1200 } })
  next[1].readings.miles = 9999
  assert.deepEqual(history, oldSnapshot)
  assert.deepEqual(next[0], oldSnapshot[0])
})
