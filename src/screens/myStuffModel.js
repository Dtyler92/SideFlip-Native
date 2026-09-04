import { dateOnlyFromIso, validateCalendarDate } from '../domain/myStuff/maintenanceModel.js'

export { validateCalendarDate } from '../domain/myStuff/maintenanceModel.js'

export function createMutationId() {
  const random = Math.random().toString(36).slice(2)
  return `${Date.now().toString(36)}-${random}-${Math.random().toString(36).slice(2)}`
}

function stablePayloadValue(value) {
  if (Array.isArray(value)) return value.map(stablePayloadValue)
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      if (value[key] !== undefined) result[key] = stablePayloadValue(value[key])
      return result
    }, {})
  }
  return value
}

export function createMutationAttemptState() {
  return { mutationId: null, payloadKey: null }
}

export function mutationIdForPayload(state, payload, generate = createMutationId) {
  const payloadKey = JSON.stringify(stablePayloadValue(payload))
  if (!state.mutationId || state.payloadKey !== payloadKey) {
    state.mutationId = generate()
    state.payloadKey = payloadKey
  }
  return state.mutationId
}

export function resetMutationAttemptState(state) {
  state.mutationId = null
  state.payloadKey = null
}

export function canCreateMyStuffItem({ isPro, itemCount }) {
  return Boolean(isPro) || Number(itemCount) < 1
}

export function parsePositiveNumber(input) {
  const value = Number(input)
  return Number.isFinite(value) && value > 0
    ? { ok: true, value }
    : { ok: false, value: null }
}

export function parseNonNegativeNumber(input, { optional = false } = {}) {
  if (optional && String(input ?? '').trim() === '') return { ok: true, value: null }
  const value = Number(input)
  return Number.isFinite(value) && value >= 0
    ? { ok: true, value }
    : { ok: false, value: null }
}

export function todayDateInput(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function compareDateOnly(value, now) {
  if (!validateCalendarDate(value)) return null
  const today = todayDateInput(now)
  return value === today ? 0 : value < today ? -1 : 1
}

export function getScheduleDueState(schedule, item = {}, now = new Date()) {
  const mode = schedule?.tracking_type
  if (mode === 'calendar') {
    const comparison = compareDateOnly(dateOnlyFromIso(schedule.next_due_at), now)
    if (comparison === null) return 'unknown'
    if (comparison === 0) return 'due'
    return comparison < 0 ? 'overdue' : 'upcoming'
  }
  if (mode !== 'mileage' && mode !== 'hours') return 'unknown'
  const dueRaw = schedule?.next_due_value
  const currentRaw = getScheduleCurrentReading(schedule, item)
  const due = Number(dueRaw)
  const current = Number(currentRaw)
  if (dueRaw == null || currentRaw == null || !Number.isFinite(due) || !Number.isFinite(current)) return 'unknown'
  if (current === due) return 'due'
  return current > due ? 'overdue' : 'upcoming'
}

export function getScheduleCurrentReading(schedule, item = {}) {
  if (!canCompleteMaintenanceSchedule(schedule, item)) return null
  if (schedule?.tracking_type === 'mileage') return item?.currentUsage?.miles ?? null
  if (schedule?.tracking_type === 'hours') return item?.currentUsage?.hours ?? null
  return null
}

export function canCompleteMaintenanceSchedule(schedule, item = {}) {
  const mode = schedule?.tracking_type
  if (mode === 'calendar') return true
  const measurements = Array.isArray(item?.measurements) ? item.measurements : []
  if (mode === 'mileage') return measurements.includes('miles')
  if (mode === 'hours') return measurements.includes('hours')
  return false
}

const DUE_STATE_DIMENSIONS = Object.freeze([
  { field: 'next_due_at', measurement: null, usage: null },
  { field: 'next_due_mileage', measurement: 'miles', usage: 'miles' },
  { field: 'next_due_hours', measurement: 'hours', usage: 'hours' },
  { field: 'next_due_cycles', measurement: 'cycles', usage: 'cycles' },
])
const DISPLAYABLE_DUE_STATUSES = new Set(['overdue', 'due_now', 'due_soon', 'upcoming'])

function hasFiniteValue(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
}

export function filterActiveDueStates(rows, item = {}) {
  if (!Array.isArray(rows)) return []
  const measurements = Array.isArray(item?.measurements) ? item.measurements : []
  const usage = item?.currentUsage && typeof item.currentUsage === 'object' ? item.currentUsage : {}
  return rows.filter(row => {
    if (!row || typeof row !== 'object') return false
    // `needs_usage_update` can be caused by a configured meter whose null due
    // field does not identify the missing axis in the RPC row, so it is unsafe
    // to display after an item dimension changes.
    if (!DISPLAYABLE_DUE_STATUSES.has(row.due_status)) return false
    const dimensions = DUE_STATE_DIMENSIONS.filter(({ field }) => row[field] !== null && row[field] !== undefined)
    if (dimensions.length === 0) return false
    return dimensions.every(({ field, measurement, usage: usageKey }) => {
      if (field === 'next_due_at') return typeof row[field] === 'string' && row[field].trim() !== '' && Number.isFinite(Date.parse(row[field]))
      return hasFiniteValue(row[field]) && measurements.includes(measurement) && hasFiniteValue(usage[usageKey])
    })
  })
}

export function getScheduleTrackingModes(item = {}) {
  const measurements = Array.isArray(item?.measurements) ? item.measurements : []
  return [
    ...(measurements.includes('miles') ? ['mileage'] : []),
    ...(measurements.includes('hours') ? ['hours'] : []),
    'calendar',
  ]
}

export function dueStateLabel(state) {
  if (state === 'overdue') return 'Overdue'
  if (state === 'due') return 'Due now'
  if (state === 'upcoming') return 'Upcoming'
  return 'Not calculated'
}

export function addCalendarDays(dateInput, interval) {
  if (!validateCalendarDate(dateInput) || !Number.isInteger(interval) || interval <= 0 || interval > 36500) return null
  const [year, month, day] = dateInput.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + interval))
  const result = date.toISOString().slice(0, 10)
  return validateCalendarDate(result) ? result : null
}

export function validateMaintenanceCompletion(schedule, completedAt, reading) {
  if (!validateCalendarDate(completedAt)) return 'Use a valid completion date between 1900 and 2200.'
  if (schedule?.tracking_type === 'calendar') {
    const lastDate = dateOnlyFromIso(schedule.last_completed_at)
    if (lastDate && completedAt < lastDate) return 'Completion date cannot be before the previous completion.'
    return null
  }
  const current = Number(reading)
  const previous = Number(schedule?.last_completed_value)
  if (schedule?.last_completed_value != null && Number.isFinite(previous) && current < previous) return 'Maintenance reading cannot be lower than the previous completion.'
  return null
}
