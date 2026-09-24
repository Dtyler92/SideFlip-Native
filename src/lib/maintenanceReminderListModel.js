import { classifyMaintenanceReminder } from './maintenanceReminderModel.js'

function uniqueSchedules(schedules) {
  const byId = new Map()
  for (const schedule of Array.isArray(schedules) ? schedules : []) {
    const id = String(schedule?.id ?? '').trim()
    if (id && !byId.has(id)) byId.set(id, schedule)
  }
  return byId
}

export function visibleMaintenanceReminders(schedules, item = {}, now = new Date()) {
  const priority = { overdue: 0, due: 1 }
  return [...uniqueSchedules(schedules).values()]
    .map(schedule => ({ ...schedule, dueState: classifyMaintenanceReminder(schedule, item, now) }))
    .filter(schedule => schedule.enabled !== false && (schedule.dueState === 'due' || schedule.dueState === 'overdue'))
    .sort((left, right) => priority[left.dueState] - priority[right.dueState])
}

export async function synchronizeMaintenanceReminders({ schedules, previousScheduleIds = [], item = {}, runtime } = {}) {
  const current = uniqueSchedules(schedules)
  const currentIds = [...current.keys()]
  const currentIdSet = new Set(currentIds)
  const removedIds = [...new Set(previousScheduleIds.map(id => String(id ?? '').trim()).filter(Boolean))]
    .filter(id => !currentIdSet.has(id))

  const results = []
  for (const scheduleId of removedIds) {
    try { results.push(await runtime.cancelMaintenanceReminder(scheduleId)) }
    catch { results.push({ status: 'unavailable' }) }
  }
  for (const schedule of current.values()) {
    try { results.push(await runtime.updateMaintenanceReminder({ schedule, item })) }
    catch { results.push({ status: 'unavailable' }) }
  }
  return { scheduleIds: currentIds, results }
}
