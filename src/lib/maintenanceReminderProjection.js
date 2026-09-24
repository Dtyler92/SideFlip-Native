import { classifyMaintenanceReminder } from './maintenanceReminderModel.js'

const AUTHORITATIVE_STATUSES = new Set(['overdue','due_now','due_soon','upcoming'])
const METER_FIELDS = Object.freeze([
  ['next_due_mileage','miles'],
  ['next_due_hours','hours'],
  ['next_due_cycles','cycles'],
])
const DEFINITION_AXES = Object.freeze([
  ['miles',['normal_interval_miles','severe_interval_miles','first_interval_miles']],
  ['hours',['normal_interval_hours','severe_interval_hours','first_interval_hours']],
  ['cycles',['normal_interval_cycles','severe_interval_cycles','first_interval_cycles']],
  ['calendar',['normal_calendar_months','severe_calendar_months','first_calendar_months']],
])

function finite(value) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function validDate(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  return Number.isFinite(Date.parse(value)) ? value : null
}

function dueSourceFor(definitionId, dueByDefinition, plannedByDefinition) {
  if (dueByDefinition.has(definitionId)) return dueByDefinition.get(definitionId)
  return plannedByDefinition.get(definitionId) || null
}

function requiredAxesFor(definition) {
  return DEFINITION_AXES
    .filter(([,fields])=>fields.some(field=>finite(definition?.[field]) != null))
    .map(([axis])=>axis)
}

function projectDueSource(source) {
  const dueStatus = String(source?.due_status || '').trim()
  if (!AUTHORITATIVE_STATUSES.has(dueStatus)) return null

  const nextDueAt = validDate(source.next_due_at ?? source.due_at)
  const values = {}
  let hasConcreteDue = Boolean(nextDueAt)

  for (const [target] of METER_FIELDS) {
    const value = finite(source[target] ?? source[target.replace('next_','')])
    values[target] = value
    if (value == null) continue
    hasConcreteDue = true
  }
  if (!hasConcreteDue) return null
  return { due_status:dueStatus,next_due_at:nextDueAt,...values }
}

/**
 * Projects persisted V2 definitions and calculated server due data into the
 * schedule-shaped input used by the local reminder runtime. It never derives a
 * due value from an interval: a concrete V2 due row or planned occurrence is
 * required.
 */
export function buildV2MaintenanceReminderSchedules({ definitions = [],dueStates = [],plannedOccurrences = [],item = {} } = {}) {
  const dueByDefinition = new Map()
  for (const due of Array.isArray(dueStates) ? dueStates : []) {
    const definitionId=String(due?.definition_id ?? '').trim()
    if (definitionId&&!dueByDefinition.has(definitionId)) dueByDefinition.set(definitionId,due)
  }
  const plannedByDefinition = new Map()
  for (const occurrence of Array.isArray(plannedOccurrences) ? plannedOccurrences : []) {
    const definitionId=String(occurrence?.definition_id ?? '').trim()
    if (definitionId&&occurrence?.status==='not_completed'&&!plannedByDefinition.has(definitionId)) plannedByDefinition.set(definitionId,occurrence)
  }

  const schedules=[]
  for (const definition of Array.isArray(definitions) ? definitions : []) {
    const definitionId=String(definition?.id ?? '').trim()
    if (!definitionId||definition?.enabled===false) continue
    const source=dueSourceFor(definitionId,dueByDefinition,plannedByDefinition)
    const due=projectDueSource(source)
    if (!due) continue
    schedules.push({
      id:definitionId,
      definition_id:definitionId,
      name:definition.name,
      enabled:true,
      due_semantics:definition.due_semantics,
      ...due,
      required_axes:requiredAxesFor(definition),
      planned_occurrence_id:source?.planned_occurrence_id || source?.id || null,
    })
  }
  return schedules
}

export function listedMaintenanceReminders(schedules, item = {}, now = new Date()) {
  const priority={overdue:0,due:1,upcoming:2}
  const byId=new Map()
  for (const schedule of Array.isArray(schedules) ? schedules : []) {
    const id=String(schedule?.id ?? '').trim()
    if (id&&!byId.has(id)) byId.set(id,schedule)
  }
  return [...byId.values()]
    .map(schedule=>({...schedule,dueState:classifyMaintenanceReminder(schedule,item,now)}))
    .filter(schedule=>schedule.enabled!==false&&schedule.dueState!=='unknown')
    .sort((left,right)=>priority[left.dueState]-priority[right.dueState])
}
