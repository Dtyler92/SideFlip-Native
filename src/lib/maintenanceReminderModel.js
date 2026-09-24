const REMINDER_PREFIX = 'my-stuff-maintenance:'
const REMINDER_DIGEST_INPUT_PREFIX = 'sideflip:maintenance-reminder:v1:'
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i
const GENERIC_CONTENT = Object.freeze({
  title: 'Maintenance reminder',
  body: 'A maintenance task is due in My Stuff.',
  data: Object.freeze({ type: 'my-stuff-maintenance' }),
})
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const DUE_REMINDER_STATUSES = new Set(['overdue','due_now'])

function dueDetail(value = {}) {
  const parts = []
  if (value.next_due_at) parts.push(`Date ${String(value.next_due_at).slice(0,10)}`)
  if (value.next_due_mileage != null) parts.push(`${Number(value.next_due_mileage).toLocaleString()} mi`)
  if (value.next_due_hours != null) parts.push(`${Number(value.next_due_hours).toLocaleString()} hr`)
  if (value.next_due_cycles != null) parts.push(`${Number(value.next_due_cycles).toLocaleString()} cycles`)
  return parts.join(' · ')
}

export function listDueMaintenanceReminders(definitions = [], dueStates = []) {
  const dueByDefinition = new Map((Array.isArray(dueStates) ? dueStates : []).map(value => [value.definition_id,value]))
  return (Array.isArray(definitions) ? definitions : []).flatMap(definition => {
    const due = dueByDefinition.get(definition.id)
    if (definition.enabled === false || !DUE_REMINDER_STATUSES.has(due?.due_status)) return []
    return [{ id:definition.id, name:definition.name || 'Maintenance', status:due.due_status, detail:dueDetail(due) }]
  })
}

export function buildMaintenanceReminderValues(definition = {}, dueState = {}, item = {}) {
  const currentUsage = item.currentUsage || {}
  return {
    schedule:{
      id:definition.id,
      enabled:definition.enabled,
      deleted_at:definition.deleted_at,
      due_status:dueState?.due_status,
      next_due_at:dueState?.next_due_at,
      next_due_mileage:dueState?.next_due_mileage,
      next_due_hours:dueState?.next_due_hours,
      next_due_cycles:dueState?.next_due_cycles,
    },
    item:{
      current_mileage:currentUsage.miles ?? item.current_mileage,
      current_hours:currentUsage.hours ?? item.current_hours,
      current_cycles:currentUsage.cycles ?? item.current_cycles,
    },
  }
}

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

function readingIsDue(schedule, item) {
  let trackingType = schedule?.tracking_type
  let dueRaw = schedule?.next_due_value
  if (!trackingType && schedule?.next_due_mileage != null) { trackingType = 'mileage'; dueRaw = schedule.next_due_mileage }
  else if (!trackingType && schedule?.next_due_hours != null) { trackingType = 'hours'; dueRaw = schedule.next_due_hours }
  else if (!trackingType && schedule?.next_due_cycles != null) { trackingType = 'cycles'; dueRaw = schedule.next_due_cycles }
  if (trackingType !== 'mileage' && trackingType !== 'hours' && trackingType !== 'cycles') return false
  const currentRaw = trackingType === 'mileage' ? item?.current_mileage : trackingType === 'hours' ? item?.current_hours : item?.current_cycles
  if (dueRaw == null || currentRaw == null) return false
  const due = Number(dueRaw)
  const current = Number(currentRaw)
  return Number.isFinite(due) && Number.isFinite(current) && current >= due
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
  if (DUE_REMINDER_STATUSES.has(schedule?.due_status)) {
    trigger = null
  } else if (schedule?.tracking_type === 'calendar' || schedule?.next_due_at) {
    const dueDate = localReminderDate(schedule.next_due_at)
    if (!dueDate) return null
    trigger = dueDate.getTime() > now.getTime()
      ? { type: 'date', date: dueDate }
      : null
  } else {
    if (!readingIsDue(schedule, item)) return null
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
