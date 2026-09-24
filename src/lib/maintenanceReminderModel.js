const REMINDER_PREFIX = 'my-stuff-maintenance:'
const REMINDER_DIGEST_INPUT_PREFIX = 'sideflip:maintenance-reminder:v1:'
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i
const GENERIC_CONTENT = Object.freeze({
  title: 'Maintenance reminder',
  body: 'A maintenance task is due in My Stuff.',
  data: Object.freeze({ type: 'my-stuff-maintenance' }),
})
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export async function maintenanceReminderId(scheduleId, deriveDigest) {
  let id
  try {
    id = String(scheduleId ?? '').trim()
  } catch {
    return null
  }
  if (!id || typeof deriveDigest !== 'function') return null

  try {
    const digest = await deriveDigest(`${REMINDER_DIGEST_INPUT_PREFIX}${id}`)
    if (typeof digest !== 'string' || !SHA256_HEX_PATTERN.test(digest)) return null
    return `${REMINDER_PREFIX}${digest.toLowerCase()}`
  } catch {
    return null
  }
}

function localReminderDate(value) {
  const dateOnly = String(value ?? '').slice(0, 10)
  const match = DATE_PATTERN.exec(dateOnly)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day, 9, 0, 0, 0)
  if (year < 1900 || year > 2200 || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

function currentReading(schedule, item) {
  if (schedule?.tracking_type === 'mileage') return item?.currentUsage?.miles ?? item?.current_mileage
  if (schedule?.tracking_type === 'hours') return item?.currentUsage?.hours ?? item?.current_hours
  return null
}

function readingDueState(schedule, item) {
  const trackingType = schedule?.tracking_type
  if (trackingType !== 'mileage' && trackingType !== 'hours') return 'unknown'
  const dueRaw = schedule?.next_due_value
  const currentRaw = currentReading(schedule,item)
  if (dueRaw == null || currentRaw == null) return 'unknown'
  const due = Number(dueRaw)
  const current = Number(currentRaw)
  if (!Number.isFinite(due) || !Number.isFinite(current)) return 'unknown'
  if (current === due) return 'due'
  return current > due ? 'overdue' : 'upcoming'
}

function concreteAuthoritativeAxes(schedule) {
  const axes = new Set()
  if (localReminderDate(schedule?.next_due_at)) axes.add('calendar')
  for (const [field,axis] of [['next_due_mileage','miles'],['next_due_hours','hours'],['next_due_cycles','cycles']]) {
    const value = schedule?.[field]
    if (value != null && Number.isFinite(Number(value)) && Number(value) >= 0) axes.add(axis)
  }
  return axes
}

function authoritativeDueState(schedule) {
  const status = schedule?.due_status
  if (!['overdue','due_now','due_soon','upcoming'].includes(status)) return 'unknown'
  const concreteAxes = concreteAuthoritativeAxes(schedule)
  if (concreteAxes.size === 0) return 'unknown'
  if (schedule?.due_semantics === 'all') {
    const requiredAxes = Array.isArray(schedule.required_axes) ? schedule.required_axes : []
    if (requiredAxes.length === 0 || !requiredAxes.every(axis=>concreteAxes.has(axis))) return 'unknown'
  }
  if (status === 'overdue') return 'overdue'
  if (status === 'due_now') return 'due'
  return 'upcoming'
}

export function classifyMaintenanceReminder(schedule, item = {}, now = new Date()) {
  if (!schedule || schedule.enabled === false || schedule.deleted_at) return 'unknown'
  if (schedule.due_status != null) return authoritativeDueState(schedule)
  if (schedule.tracking_type !== 'calendar') return readingDueState(schedule,item)
  const dueDate = localReminderDate(schedule.next_due_at)
  if (!dueDate || !(now instanceof Date) || !Number.isFinite(now.getTime())) return 'unknown'
  const dueDay = new Date(dueDate.getFullYear(),dueDate.getMonth(),dueDate.getDate()).getTime()
  const today = new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime()
  if (dueDay === today) return 'due'
  return dueDay < today ? 'overdue' : 'upcoming'
}

export async function buildMaintenanceReminderRequest({
  schedule,
  item = {},
  now = new Date(),
  platform = 'ios',
  channelId,
  deriveDigest,
} = {}) {
  const identifier = await maintenanceReminderId(schedule?.id, deriveDigest)
  if (!identifier || schedule?.enabled === false || schedule?.deleted_at) return null

  let trigger
  if (schedule?.due_status != null) {
    const dueState = authoritativeDueState(schedule)
    if (dueState === 'unknown') return null
    if (dueState === 'due' || dueState === 'overdue') trigger = null
    else {
      if (schedule.due_semantics === 'all') return null
      const dueDate = localReminderDate(schedule.next_due_at)
      if (!dueDate || dueDate.getTime() <= now.getTime()) return null
      trigger = { type:'date',date:dueDate }
    }
  } else if (schedule?.tracking_type === 'calendar') {
    const dueDate = localReminderDate(schedule.next_due_at)
    if (!dueDate) return null
    trigger = dueDate.getTime() > now.getTime()
      ? { type: 'date', date: dueDate }
      : null
  } else {
    const dueState = readingDueState(schedule,item)
    if (dueState !== 'due' && dueState !== 'overdue') return null
    trigger = null
  }

  if (platform === 'android') {
    if (!channelId) return null
    trigger = trigger ? { ...trigger, channelId } : { channelId }
  }

  return {
    identifier,
    content: {
      title: GENERIC_CONTENT.title,
      body: GENERIC_CONTENT.body,
      data: { ...GENERIC_CONTENT.data },
    },
    trigger,
  }
}
