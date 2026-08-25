const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function createMutationId() {
  const random = Math.random().toString(36).slice(2)
  return `${Date.now().toString(36)}-${random}-${Math.random().toString(36).slice(2)}`
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

export function validateCalendarDate(input) {
  const match = DATE_PATTERN.exec(String(input || '').trim())
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return year >= 1900 && year <= 2200 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
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
    const comparison = compareDateOnly(String(schedule.next_due_at || '').slice(0, 10), now)
    if (comparison === null) return 'unknown'
    if (comparison === 0) return 'due'
    return comparison < 0 ? 'overdue' : 'upcoming'
  }
  if (mode !== 'mileage' && mode !== 'hours') return 'unknown'
  const dueRaw = schedule?.next_due_value
  const currentRaw = mode === 'mileage' ? item?.current_mileage : item?.current_hours
  const due = Number(dueRaw)
  const current = Number(currentRaw)
  if (dueRaw == null || currentRaw == null || !Number.isFinite(due) || !Number.isFinite(current)) return 'unknown'
  if (current === due) return 'due'
  return current > due ? 'overdue' : 'upcoming'
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
    const lastDate = String(schedule.last_completed_at || '').slice(0, 10)
    if (lastDate && validateCalendarDate(lastDate) && completedAt < lastDate) return 'Completion date cannot be before the previous completion.'
    return null
  }
  const current = Number(reading)
  const previous = Number(schedule?.last_completed_value)
  if (schedule?.last_completed_value != null && Number.isFinite(previous) && current < previous) return 'Maintenance reading cannot be lower than the previous completion.'
  return null
}
