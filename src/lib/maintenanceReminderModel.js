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

function readingIsDue(schedule, item) {
  const trackingType = schedule?.tracking_type
  if (trackingType !== 'mileage' && trackingType !== 'hours') return false
  const dueRaw = schedule?.next_due_value
  const currentRaw = trackingType === 'mileage' ? item?.current_mileage : item?.current_hours
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
  if (schedule?.tracking_type === 'calendar') {
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
