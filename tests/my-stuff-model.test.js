import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addCalendarDays,
  canCreateMyStuffItem,
  createMutationId,
  getScheduleCurrentReading,
  getScheduleDueState,
  getScheduleTrackingModes,
  parseNonNegativeNumber,
  parsePositiveNumber,
  validateCalendarDate,
  validateMaintenanceCompletion,
} from '../src/screens/myStuffModel.js'

test('Free creation gate allows item one, blocks item two, and never hides existing items', () => {
  assert.equal(canCreateMyStuffItem({ isPro: false, itemCount: 0 }), true)
  assert.equal(canCreateMyStuffItem({ isPro: false, itemCount: 1 }), false)
  assert.equal(canCreateMyStuffItem({ isPro: true, itemCount: 8 }), true)
  const existing = [{ id: 'a' }, { id: 'b' }]
  assert.deepEqual(existing.filter(() => true), existing)
})

test('mileage schedule becomes due at its next reading', () => {
  const schedule = { tracking_type: 'mileage', next_due_value: 12000 }
  assert.equal(getScheduleDueState(schedule, { measurements: ['miles'], currentUsage: { miles: 11999 } }), 'upcoming')
  assert.equal(getScheduleDueState(schedule, { measurements: ['miles'], currentUsage: { miles: 12000 } }), 'due')
  assert.equal(getScheduleDueState(schedule, { measurements: ['miles'], currentUsage: { miles: 12001 } }), 'overdue')
})

test('hours schedule becomes due at its next reading', () => {
  const schedule = { tracking_type: 'hours', next_due_value: 250 }
  assert.equal(getScheduleDueState(schedule, { measurements: ['hours'], currentUsage: { hours: 249.5 } }), 'upcoming')
  assert.equal(getScheduleDueState(schedule, { measurements: ['hours'], currentUsage: { hours: 250 } }), 'due')
  assert.equal(getScheduleDueState(schedule, { measurements: ['hours'], currentUsage: { hours: 251 } }), 'overdue')
})

test('inactive retained meters cannot prefill, calculate, or offer meter maintenance', () => {
  const item = {
    measurements: [],
    currentUsage: {},
    current_mileage: 13000,
    effective_current_mileage: 12500,
    current_hours: 400,
    effective_current_hours: 390,
  }
  const mileageSchedule = { tracking_type: 'mileage', next_due_value: 12000 }
  const hoursSchedule = { tracking_type: 'hours', next_due_value: 380 }

  assert.equal(getScheduleCurrentReading(mileageSchedule, item), null)
  assert.equal(getScheduleDueState(mileageSchedule, item), 'unknown')
  assert.equal(getScheduleCurrentReading(hoursSchedule, item), null)
  assert.equal(getScheduleDueState(hoursSchedule, item), 'unknown')
  assert.deepEqual(getScheduleTrackingModes(item), ['calendar'])
  assert.deepEqual(getScheduleTrackingModes({ measurements: ['hours', 'cycles'] }), ['hours', 'calendar'])
})

test('calendar schedule uses local date-only comparisons without time drift', () => {
  const schedule = { tracking_type: 'calendar', next_due_at: '2026-08-24T00:00:00Z' }
  assert.equal(getScheduleDueState(schedule, {}, new Date(2026, 7, 23, 23, 59, 59)), 'upcoming')
  assert.equal(getScheduleDueState(schedule, {}, new Date(2026, 7, 24, 12)), 'due')
  assert.equal(getScheduleDueState(schedule, {}, new Date(2026, 7, 25, 0)), 'overdue')
})

test('invalid or incomplete schedules report unknown', () => {
  assert.equal(getScheduleDueState({ tracking_type: 'mileage', next_due_value: null }, {}), 'unknown')
  assert.equal(getScheduleDueState({ tracking_type: 'mileage', next_due_value: 100 }, { current_mileage: null }), 'unknown')
  assert.equal(getScheduleDueState({ tracking_type: 'hours', next_due_value: 10 }, { current_hours: undefined }), 'unknown')
  assert.equal(getScheduleDueState({ tracking_type: 'calendar', next_due_at: 'not-a-date' }, {}), 'unknown')
  assert.equal(getScheduleDueState({ tracking_type: 'calendar', next_due_at: '2026-08-24garbage' }, {}), 'unknown')
})

test('numeric and calendar validators reject unsafe synthetic values', () => {
  assert.deepEqual(parsePositiveNumber('2.5'), { ok: true, value: 2.5 })
  assert.equal(parsePositiveNumber('0').ok, false)
  assert.equal(parsePositiveNumber('Infinity').ok, false)
  assert.deepEqual(parseNonNegativeNumber('0'), { ok: true, value: 0 })
  assert.equal(parseNonNegativeNumber('-1').ok, false)
  assert.equal(parseNonNegativeNumber('NaN').ok, false)
  assert.equal(validateCalendarDate('2024-02-29'), true)
  assert.equal(validateCalendarDate('2023-02-29'), false)
  assert.equal(validateCalendarDate('2026-13-01'), false)
})

test('mutation IDs are nonempty and unique', () => {
  const first = createMutationId()
  const second = createMutationId()
  assert.ok(first.length >= 16)
  assert.notEqual(first, second)
})

test('business dates and calendar intervals stay inside the database contract', () => {
  assert.equal(validateCalendarDate('1899-12-31'), false)
  assert.equal(validateCalendarDate('1900-01-01'), true)
  assert.equal(validateCalendarDate('2200-12-31'), true)
  assert.equal(validateCalendarDate('2201-01-01'), false)
  assert.equal(addCalendarDays('2026-01-01', 36501), null)
  assert.equal(addCalendarDays('2199-01-01', 36500), null)
})

test('maintenance completion cannot rewind readings or calendar dates', () => {
  assert.match(validateMaintenanceCompletion({ tracking_type:'mileage', last_completed_value:100 }, '2026-08-24', 99), /cannot be lower/)
  assert.equal(validateMaintenanceCompletion({ tracking_type:'mileage', last_completed_value:100 }, '2026-08-24', 100), null)
  assert.match(validateMaintenanceCompletion({ tracking_type:'calendar', last_completed_at:'2026-08-24T12:00:00Z' }, '2026-08-23', null), /cannot be before/)
  assert.equal(validateMaintenanceCompletion({ tracking_type:'calendar', last_completed_at:'2026-08-24T12:00:00Z' }, '2026-08-24', null), null)
  assert.equal(validateMaintenanceCompletion({ tracking_type:'calendar', last_completed_at:'2026-08-24garbage' }, '2026-08-23', null), null)
})
