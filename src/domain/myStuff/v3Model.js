const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
export const EXPENSE_CATEGORIES = Object.freeze(['maintenance','repair','parts','labor','fuel','registration','insurance','upgrade','accessory','transportation','other'])
const EXPENSE_CATEGORY_SET = new Set(EXPENSE_CATEGORIES)
export const RESEARCH_IDENTITY_FIELDS = Object.freeze(['vin','year','manufacturer','make','model','trim','engineModel','engineDisplacementLiters','engineCylinders','transmission','drivetrain','fuelType','vehicleType','bodyStyle','plantName','plantCountry','vehicleMarket'])
export const OCCURRENCE_STATUSES = Object.freeze(['not_completed','completed','not_applicable','skipped','history_unknown'])

function text(value, max = 2000) {
  const result = String(value ?? '').trim()
  if (result.length > max) throw new Error(`Text must be ${max} characters or fewer.`)
  return result || null
}
function optionalNumber(value, label) {
  if (value == null || String(value).trim() === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be a finite number of zero or more.`)
  return parsed
}
function revision(expense) { return expense?.latest_revision || expense?.revision || expense || {} }

export function normalizeExpenseRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map(row => {
    const { expense_id, revision_id, revision_number, description, category, custom_category, amount, currency, incurred_on, vendor, mileage, hours, notes } = row
    return {
      ...row,
      id: expense_id || row.id,
      latest_revision: row.latest_revision || { id:revision_id, revision_number, description, category, custom_category, amount, currency, incurred_on, vendor, mileage, hours, notes },
    }
  })
}

export function normalizePlannedOccurrences(scheduleRows = [], dueViews = [], definitions = []) {
  const definitionsById = new Map(definitions.map(definition => [definition.id, definition]))
  const dueById = new Map((Array.isArray(dueViews) ? dueViews : []).map(entry => [entry?.occurrence?.id, entry]))
  const rowsById = new Map()
  for (const row of Array.isArray(scheduleRows) ? scheduleRows : []) rowsById.set(row.id, row)
  for (const entry of Array.isArray(dueViews) ? dueViews : []) if (entry?.occurrence?.id) rowsById.set(entry.occurrence.id, entry.occurrence)
  return [...rowsById.values()].map(row => {
    const definition = definitionsById.get(row.definition_id)
    const due = dueById.get(row.id)
    return { ...row, planned_occurrence_id:row.id, name:definition?.name || row.name, due_status:due?.view || row.due_status }
  })
}

export function buildExpenseDraft(values = {}) {
  const amount = optionalNumber(values.amount, 'Expense amount')
  if (amount == null) throw new Error('Expense amount is required.')
  const category = String(values.category || 'other').trim().toLowerCase()
  if (!EXPENSE_CATEGORY_SET.has(category)) throw new Error('Expense category is not supported.')
  const incurredOn = String(values.incurredOn || '').trim()
  if (!DATE_PATTERN.test(incurredOn)) throw new Error('Expense date must use YYYY-MM-DD.')
  const currency = String(values.currency || 'USD').trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Expense currency must be a three-letter code.')
  const description = text(values.description, 200)
  if (!description) throw new Error('Expense description is required.')
  const customCategory = text(values.customCategory, 80)
  if (category === 'other' && !customCategory) throw new Error('Custom category is required for Other.')
  return {
    description, category, custom_category: customCategory, amount, currency, incurred_on: incurredOn,
    vendor: text(values.vendor, 160), mileage: optionalNumber(values.mileage, 'Mileage'),
    hours: optionalNumber(values.hours, 'Hours'), notes: text(values.notes, 2000),
  }
}

export function sortExpenseHistory(expenses = []) {
  return [...expenses].sort((a,b) => String(revision(b).incurred_on || b.created_at || '').localeCompare(String(revision(a).incurred_on || a.created_at || '')) || String(a.id).localeCompare(String(b.id)))
}

export function buildFinancialSummary({ purchasePrice = 0, expenses = [] } = {}) {
  const totals = { transferredProjectSubtotal:0, maintenanceRepairSubtotal:0, upgradesSubtotal:0, otherSubtotal:0 }
  const categoryTotals = {}
  for (const expense of expenses) {
    if (expense?.voided_at) continue
    const row = revision(expense)
    const amount = Number(row.amount)
    if (!Number.isFinite(amount)) continue
    const category = String(row.category || 'other')
    categoryTotals[category] = (categoryTotals[category] || 0) + amount
    if (expense.source_type === 'project_transfer') totals.transferredProjectSubtotal += amount
    else if (category === 'maintenance' || category === 'repair') totals.maintenanceRepairSubtotal += amount
    else if (category === 'upgrade') totals.upgradesSubtotal += amount
    else totals.otherSubtotal += amount
  }
  const price = Number(purchasePrice) || 0
  const expenseSubtotal = Object.values(categoryTotals).reduce((sum,value)=>sum+value,0)
  return { purchasePrice:price, ...totals, expenseSubtotal, totalInvested:price+expenseSubtotal, categoryTotals }
}

export function classifyDueOccurrences(occurrences = []) {
  const groups = { overdue:[], dueSoon:[], upcoming:[], completedRecently:[] }
  for (const occurrence of occurrences) {
    if (occurrence.status === 'completed') groups.completedRecently.push(occurrence)
    else if (occurrence.due_status === 'overdue') groups.overdue.push(occurrence)
    else if (occurrence.due_status === 'due_now' || occurrence.due_status === 'due_soon') groups.dueSoon.push(occurrence)
    else groups.upcoming.push(occurrence)
  }
  return groups
}

export function serviceCompletionDefaults(item = {}, today) {
  const usage = item.currentUsage || {}
  return {
    actualServiceDate:today, readings:{miles:usage.miles == null?'':String(usage.miles),hours:usage.hours == null?'':String(usage.hours),cycles:usage.cycles == null?'':String(usage.cycles)},
    cost:'', providerType:'provider', providerName:'', parts:'', notes:'', receiptUri:null,
  }
}

export function buildServicePayload({ occurrence = {}, actualServiceDate, readings = {}, providerType = 'provider', providerName, parts, notes } = {}) {
  if (!DATE_PATTERN.test(String(actualServiceDate || '').trim())) throw new Error('Service date must use YYYY-MM-DD.')
  const serviceName = text(occurrence.name || occurrence.service_name, 200)
  if (!serviceName) throw new Error('Service name is required.')
  const payload = {
    service_name:serviceName,
    service_category:text(occurrence.service_category, 80) || 'maintenance',
    service_action:text(occurrence.service_action, 80) || 'service',
    completed_at:`${actualServiceDate}T12:00:00.000Z`,
  }
  for (const [key, wireKey] of Object.entries({ miles:'mileage', hours:'hours', cycles:'cycles' })) {
    const value = optionalNumber(readings[key], key)
    if (value != null) payload[wireKey] = value
  }
  const partsDescription = text(parts, 2000)
  const vendorName = text(providerName, 160)
  payload.parts = partsDescription ? [{ description:partsDescription }] : []
  payload.labor = []
  payload.vendor = vendorName ? { type:providerType === 'diy' ? 'diy' : 'provider', name:vendorName } : { type:providerType === 'diy' ? 'diy' : 'provider' }
  payload.warranty = {}
  const serviceNotes = text(notes, 2000)
  if (serviceNotes) payload.notes = serviceNotes
  return payload
}

export function buildServiceExpenseRequest({ itemId, plannedOccurrenceId=null, definitionId=null, service, cost, description, currency='USD', incurredOn, vendor, mileage, hours, notes } = {}) {
  const amount = optionalNumber(cost, 'Service cost')
  const expense = amount == null ? null : buildExpenseDraft({
    description:description || 'Service', category:'maintenance', amount, currency,
    incurredOn, vendor, mileage, hours, notes,
  })
  return { itemId, plannedOccurrenceId, definitionId, service, expense }
}

export function hasVehicleIdentityChanged(confirmed = {}, current = {}) {
  return RESEARCH_IDENTITY_FIELDS.some(field => String(confirmed[field] ?? '').trim() !== String(current[field] ?? '').trim())
}

export async function persistThenConfirmVehicleIdentity({ snapshot, persist, confirm, isCurrent }) {
  await persist(snapshot)
  if (!isCurrent(snapshot)) return { confirmed:false,stale:true }
  await confirm(snapshot)
  if (!isCurrent(snapshot)) return { confirmed:false,stale:true }
  return { confirmed:true,stale:false }
}

export function linkedOccurrenceId(expense = {}) {
  return expense.linked_occurrence_id || expense.occurrence_id || expense.service_occurrence_id || null
}

export async function reviseExpenseByLinkage({ row, patch, reason, mutationId, reviseExpense, reviseServiceExpense }) {
  const occurrenceId = linkedOccurrenceId(row)
  if (occurrenceId) return reviseServiceExpense({
    occurrenceId,
    expenseId:row.id,
    servicePatch:{},
    expensePatch:patch,
    reason,
    mutationId,
  })
  return reviseExpense(row.id,patch,reason,mutationId)
}

export function expenseRevision(expense) { return revision(expense) }
