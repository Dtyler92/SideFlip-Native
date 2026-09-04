const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const ISO_DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/
const AXES = Object.freeze(['miles', 'hours', 'cycles', 'months'])

export const DUE_SOON_THRESHOLDS = Object.freeze({ miles: 500, hours: 10, cycles: 10, days: 30 })
export const DUE_SOON_LIMITS = Object.freeze({ miles: 10_000_000, hours: 1_000_000, cycles: 10_000_000, days: 36_500 })
export const MAINTENANCE_LIMITS = Object.freeze({ miles: 10_000_000, hours: 1_000_000, cycles: 10_000_000, months: 1200 })
export const MAINTENANCE_MODES = Object.freeze(['whichever_first'])
export const MAINTENANCE_MODE_ALIASES = Object.freeze({ any: 'whichever_first' })
export const MAINTENANCE_PROFILES = Object.freeze(['normal', 'severe'])

export function validateCalendarDate(input) {
  const match = DATE_PATTERN.exec(String(input || '').trim())
  if (!match) return false
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return year >= 1900 && year <= 2200 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function dateOnlyFromIso(input) {
  const raw = String(input ?? '').trim()
  if (validateCalendarDate(raw)) return raw
  const match = ISO_DATE_TIME_PATTERN.exec(raw)
  if (!match || !validateCalendarDate(match[1]) || !Number.isFinite(Date.parse(raw))) return null
  return match[1]
}

export function addCalendarMonths(dateInput, months) {
  if (!validateCalendarDate(dateInput) || !Number.isInteger(months) || months <= 0 || months > MAINTENANCE_LIMITS.months) return null
  const [year, month, day] = dateInput.split('-').map(Number)
  const targetMonthIndex = month - 1 + months
  const targetYear = year + Math.floor(targetMonthIndex / 12)
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12
  if (targetYear < 1900 || targetYear > 2200) return null
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const result = `${String(targetYear).padStart(4, '0')}-${String(targetMonth + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
  return validateCalendarDate(result) ? result : null
}

function validateIntervals(intervals, label) {
  if (!intervals || typeof intervals !== 'object' || Array.isArray(intervals)) return `${label} intervals are required.`
  const configured = AXES.filter((axis) => intervals[axis] != null)
  if (!configured.length) return `${label} must include at least one interval.`
  for (const axis of configured) {
    const value = Number(intervals[axis])
    if (!Number.isFinite(value) || value <= 0 || value > MAINTENANCE_LIMITS[axis]) return `${label} ${axis} interval is out of bounds.`
    if ((axis === 'cycles' || axis === 'months') && !Number.isInteger(value)) return `${label} ${axis} interval must be a whole number.`
  }
  return null
}

function maintenanceMode(mode) {
  return MAINTENANCE_MODE_ALIASES[mode] || mode
}

function validateDueSoonThresholds(thresholds) {
  if (thresholds == null) return null
  if (typeof thresholds !== 'object' || Array.isArray(thresholds)) return 'Due-soon thresholds must be an object.'
  for (const axis of Object.keys(thresholds)) {
    if (!(axis in DUE_SOON_LIMITS)) return `Due-soon ${axis} threshold is not supported.`
    const value = Number(thresholds[axis])
    if (!Number.isFinite(value) || value < 0 || value > DUE_SOON_LIMITS[axis]) return `Due-soon ${axis} threshold is out of bounds.`
    if ((axis === 'cycles' || axis === 'days') && !Number.isInteger(value)) return `Due-soon ${axis} threshold must be a whole number.`
  }
  return null
}

export function validateMaintenanceProgram(task = {}) {
  const errors = {}
  if (!MAINTENANCE_MODES.includes(maintenanceMode(task.mode))) errors.mode = 'Mode must be whichever_first (legacy any is accepted as an alias).'
  if (!MAINTENANCE_PROFILES.includes(task.profile)) errors.profile = 'Profile must be explicitly normal or severe.'
  const normalError = validateIntervals(task.normal, 'normal')
  if (normalError) errors.normal = normalError
  if (task.profile === 'severe') {
    const severeError = validateIntervals(task.severe, 'severe')
    if (severeError) errors.severe = severeError
  } else if (task.severe != null) {
    const severeError = validateIntervals(task.severe, 'severe')
    if (severeError) errors.severe = severeError
  }
  if (task.firstService != null) {
    const firstError = validateIntervals(task.firstService, 'first service')
    if (firstError) errors.firstService = firstError
  }
  const thresholdError = validateDueSoonThresholds(task.dueSoonThresholds ?? task.due_soon_thresholds)
  if (thresholdError) errors.dueSoonThresholds = thresholdError
  return { ok: Object.keys(errors).length === 0, errors }
}

function dateOnly(value) {
  return dateOnlyFromIso(value)
}

function firstValidDate(values, parser = dateOnly) {
  for (const value of values) {
    const parsed = parser(value)
    if (parsed != null) return parsed
  }
  return null
}

function timestamp(value) {
  const raw = String(value ?? '').trim()
  const match = ISO_DATE_TIME_PATTERN.exec(raw)
  if (!match || !validateCalendarDate(match[1])) return null
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function compareDate(left, right) {
  return left === right ? 0 : left < right ? -1 : 1
}

function daysBetween(from, to) {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

function latestCompletion(completions, asOfDate) {
  const cutoff = asOfDate
  return [...(Array.isArray(completions) ? completions : [])]
    .filter((entry) => {
      const completedAt = firstValidDate([entry?.completedAt, entry?.completed_at])
      return entry?.qualifying !== false && entry?.qualifies !== false && completedAt && (!cutoff || completedAt <= cutoff)
    })
    .sort((a, b) => {
      const dateOrder = compareDate(firstValidDate([a.completedAt, a.completed_at]), firstValidDate([b.completedAt, b.completed_at]))
      if (dateOrder) return dateOrder
      const leftCreatedAt = firstValidDate([a.createdAt, a.created_at], timestamp) ?? -Infinity
      const rightCreatedAt = firstValidDate([b.createdAt, b.created_at], timestamp) ?? -Infinity
      const createdOrder = leftCreatedAt - rightCreatedAt
      if (createdOrder) return createdOrder
      return String(a.id || '').localeCompare(String(b.id || ''))
    })
    .at(-1) || null
}

function numericAxisState(axis, interval, anchor, current, threshold) {
  const base = Number(anchor)
  const reading = Number(current)
  if (anchor == null || current == null || !Number.isFinite(base) || !Number.isFinite(reading) || base < 0 || reading < base) {
    return { status: 'unknown', dueAt: null, remaining: null }
  }
  const dueAt = base + interval
  const remaining = dueAt - reading
  const status = remaining < 0 ? 'overdue' : remaining === 0 ? 'due_now' : remaining <= threshold ? 'due_soon' : 'upcoming'
  return { status, dueAt, remaining }
}

function calendarAxisState(interval, anchorDate, asOfDate, threshold) {
  if (!anchorDate || !asOfDate) return { status: 'unknown', dueAt: null, remaining: null }
  const dueAt = addCalendarMonths(anchorDate, interval)
  if (!dueAt) return { status: 'unknown', dueAt: null, remaining: null }
  const comparison = compareDate(asOfDate, dueAt)
  const remaining = daysBetween(asOfDate, dueAt)
  const status = comparison > 0 ? 'overdue' : comparison === 0 ? 'due_now' : remaining <= threshold ? 'due_soon' : 'upcoming'
  return { status, dueAt, remaining }
}

export function calculateMaintenanceDueState({ task = {}, assetOrigin = {}, currentUsage = {}, asOfDate, completions = [] } = {}) {
  const validation = validateMaintenanceProgram(task)
  if (!validation.ok) return { status: 'invalid', errors: validation.errors, axes: {}, missingAxes: [] }

  const normalizedAsOfDate = dateOnly(asOfDate)
  if (asOfDate != null && !normalizedAsOfDate) {
    return { status: 'invalid', errors: { asOfDate: 'As-of date must be a valid calendar date.' }, axes: {}, missingAxes: [] }
  }

  const completion = latestCompletion(completions, normalizedAsOfDate)
  const useFirstService = !completion && task.firstService != null
  const intervalSource = useFirstService ? 'first_service' : task.profile
  const intervals = useFirstService ? task.firstService : task[task.profile]
  const anchorSource = completion ? 'last_completion' : 'asset_origin'
  const axes = {}
  const configuredThresholds = task.dueSoonThresholds ?? task.due_soon_thresholds ?? {}
  const thresholds = { ...DUE_SOON_THRESHOLDS, ...configuredThresholds }

  for (const axis of AXES) {
    if (intervals[axis] == null) continue
    if (axis === 'months') {
      const anchor = completion
        ? firstValidDate([completion.completedAt, completion.completed_at])
        : firstValidDate([assetOrigin.date, assetOrigin.acquiredOn, assetOrigin.acquired_on])
      axes.months = calendarAxisState(Number(intervals.months), anchor, normalizedAsOfDate, Number(thresholds.days))
    } else {
      const readings = completion?.readings || completion?.usage || {}
      const anchor = completion ? readings[axis] : assetOrigin[axis]
      axes[axis] = numericAxisState(axis, Number(intervals[axis]), anchor, currentUsage[axis], Number(thresholds[axis]))
    }
  }

  const missingAxes = AXES.filter((axis) => axes[axis]?.status === 'unknown')
  const statuses = Object.values(axes).map((axis) => axis.status)
  let status = 'upcoming'
  if (statuses.includes('overdue')) status = 'overdue'
  else if (statuses.includes('due_now')) status = 'due_now'
  else if (missingAxes.length) status = 'needs_usage_update'
  else if (statuses.includes('due_soon')) status = 'due_soon'

  return { status, mode: maintenanceMode(task.mode), intervalSource, anchorSource, axes, missingAxes }
}

function clone(value) {
  if (value == null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(clone)
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)]))
}

export function appendServiceCompletion(history = [], completion = {}) {
  return [...history.map(clone), clone(completion)]
}
