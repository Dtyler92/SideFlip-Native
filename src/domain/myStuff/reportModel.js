import { dateOnlyFromIso } from './maintenanceModel.js'

export const REPORT_SCHEMA_VERSION = 1
export const REPORT_DISCLAIMER = 'Records are user-entered unless explicitly identified as source-backed. SideFlip does not independently verify service performance.'

function finiteNumber(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function text(value) {
  if (value == null) return null
  const result = String(value).trim()
  return result || null
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== null && value !== undefined))
}

function generatedAt(value) {
  const candidate = text(value)
  return candidate && Number.isFinite(Date.parse(candidate)) ? new Date(candidate).toISOString() : new Date().toISOString()
}

function dateOnly(value) {
  return dateOnlyFromIso(text(value))
}

function dateRangeFor(options) {
  const bound = (name) => {
    const value = options[name]
    if (value == null || value === '') return null
    const candidate = text(value)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate || '') || !dateOnly(candidate)) {
      throw new RangeError(`${name} must be a valid calendar date in YYYY-MM-DD format.`)
    }
    return candidate
  }
  const startDate = bound('startDate')
  const endDate = bound('endDate')
  if (startDate && endDate && startDate > endDate) throw new RangeError('startDate must not be after endDate.')
  return compact({ startDate, endDate })
}

function withinDateRange(entry, dateKeys, options) {
  const range = dateRangeFor(options)
  const entryDate = dateKeys.map((key) => dateOnly(entry?.[key])).find(Boolean)
  if (!entryDate) return Object.keys(range).length === 0
  return (!range.startDate || entryDate >= range.startDate) && (!range.endDate || entryDate <= range.endDate)
}

function ownershipPeriodFor(record) {
  return compact({
    startedAt: text(record.acquiredOn || record.acquired_on || record.purchasedOn || record.purchased_on),
    endedAt: text(record.soldOn || record.sold_on || record.disposedOn || record.disposed_on),
  })
}

function selectedPhotosFor(options) {
  if (options.includePhotos !== true) return []
  return (Array.isArray(options.selectedPhotos) ? options.selectedPhotos : [])
    .map((photo) => compact({ caption: text(photo?.caption), uri: text(photo?.uri) }))
    .filter((photo) => photo.uri)
}

function stableDateSort(dateKeys) {
  return (left, right) => {
    const leftDate = dateKeys.map((key) => dateOnly(left?.[key])).find(Boolean) || ''
    const rightDate = dateKeys.map((key) => dateOnly(right?.[key])).find(Boolean) || ''
    const dateOrder = leftDate.localeCompare(rightDate)
    if (dateOrder) return dateOrder
    const leftLabel = text(left?.task || left?.description || left?.name || left?.title) || ''
    const rightLabel = text(right?.task || right?.description || right?.name || right?.title) || ''
    return leftLabel.localeCompare(rightLabel)
  }
}

function identityFor(record, options) {
  const identity = compact({
    name: text(record.name || record.title),
    category: text(record.category || record.itemType || record.item_type),
    year: finiteNumber(record.year),
    make: text(record.make),
    model: text(record.model),
    trim: text(record.trim),
    engine: text(record.engine),
    transmission: text(record.transmission),
    drivetrain: text(record.drivetrain),
  })
  // Canonical reports accept only a separately supplied masked value. Raw VIN,
  // serial, registration, and hull fields are never copied from source records.
  if (options.includeIdentifier === true && text(options.maskedIdentifier)) identity.identifier = text(options.maskedIdentifier)
  return identity
}

function projectWorkHistory(project, options) {
  const includeCosts = options.includeDetailedCosts === true
  const includeDocumentReferences = options.includeDocuments === true
  const entries = Array.isArray(project.workHistory) ? project.workHistory : Array.isArray(project.expenses) ? project.expenses : []
  return [...entries]
    .filter((entry) => withinDateRange(entry, ['date', 'completedAt', 'completed_at', 'createdAt', 'created_at'], options))
    .sort(stableDateSort(['date', 'completedAt', 'completed_at', 'createdAt', 'created_at'])).map((entry) => {
    const result = compact({
      date: ['date', 'completedAt', 'completed_at', 'createdAt', 'created_at'].map((key) => dateOnly(entry[key]) && text(entry[key])).find(Boolean),
      description: text(entry.description || entry.name || entry.task),
      notes: text(entry.notes),
    })
    if (includeCosts) {
      const cost = finiteNumber(entry.cost ?? entry.amount)
      if (cost != null) result.cost = cost
      const partsCost = finiteNumber(entry.partsCost ?? entry.parts_cost)
      const laborCost = finiteNumber(entry.laborCost ?? entry.labor_cost)
      if (partsCost != null) result.partsCost = partsCost
      if (laborCost != null) result.laborCost = laborCost
    }
    if (includeDocumentReferences) {
      const receiptReference = text(entry.receiptReference || entry.receipt_reference || entry.receiptRef || entry.receipt_ref)
      const invoiceReference = text(entry.invoiceReference || entry.invoice_reference || entry.invoiceRef || entry.invoice_ref)
      if (receiptReference) result.receiptReference = receiptReference
      if (invoiceReference) result.invoiceReference = invoiceReference
    }
    return result
  })
}

export function buildProjectReport(project = {}, options = {}) {
  const includeCosts = options.includeDetailedCosts === true
  const workHistory = projectWorkHistory(project, options)
  const report = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    reportType: 'project',
    requiresPro: true,
    title: 'SideFlip Project Report',
    generatedAt: generatedAt(options.generatedAt),
    dateRange: dateRangeFor(options),
    identity: identityFor(project, options),
    ownershipPeriod: ownershipPeriodFor(project),
    photos: selectedPhotosFor(options),
    notes: text(project.notes),
    workHistory,
    disclaimer: REPORT_DISCLAIMER,
  }
  if (includeCosts) {
    const expenseValues = workHistory.map((entry) => finiteNumber(entry.cost)).filter((value) => value != null)
    report.financials = compact({
      purchasePrice: finiteNumber(project.purchasePrice ?? project.purchase_price),
      salePrice: finiteNumber(project.salePrice ?? project.sale_price),
      expensesTotal: expenseValues.reduce((total, value) => total + value, 0),
    })
  }
  return report
}

function serviceHistoryFor(item, options) {
  const includeCosts = options.includeDetailedCosts === true
  const includeDocumentReferences = options.includeDocuments === true
  const dateKeys = ['completedAt', 'completed_at', 'date', 'createdAt', 'created_at']
  return [...(Array.isArray(item.serviceHistory) ? item.serviceHistory : Array.isArray(item.service_history) ? item.service_history : [])]
    .filter((entry) => withinDateRange(entry, dateKeys, options))
    .sort(stableDateSort(dateKeys))
    .map((entry) => {
      const result = compact({
        completedAt: dateKeys.map((key) => dateOnly(entry[key]) && text(entry[key])).find(Boolean),
        task: text(entry.task || entry.name),
        type: text(entry.type),
        readings: entry.readings && typeof entry.readings === 'object' ? compact({
          miles: finiteNumber(entry.readings.miles), hours: finiteNumber(entry.readings.hours), cycles: finiteNumber(entry.readings.cycles),
        }) : undefined,
        performer: text(entry.performer || entry.shop),
        notes: text(entry.notes),
      })
      if (includeCosts) {
        const cost = finiteNumber(entry.cost)
        if (cost != null) result.cost = cost
        const partsCost = finiteNumber(entry.partsCost ?? entry.parts_cost)
        const laborCost = finiteNumber(entry.laborCost ?? entry.labor_cost)
        if (partsCost != null) result.partsCost = partsCost
        if (laborCost != null) result.laborCost = laborCost
      }
      if (includeDocumentReferences) {
        const receiptReference = text(entry.receiptReference || entry.receipt_reference || entry.receiptRef || entry.receipt_ref)
        const invoiceReference = text(entry.invoiceReference || entry.invoice_reference || entry.invoiceRef || entry.invoice_ref)
        if (receiptReference) result.receiptReference = receiptReference
        if (invoiceReference) result.invoiceReference = invoiceReference
      }
      return result
    })
}

function sourcesFor(item) {
  return [...(Array.isArray(item.sources) ? item.sources : [])]
    .sort(stableDateSort(['accessedAt', 'accessed_at']))
    .map((source) => compact({
      title: text(source.title),
      url: text(source.url),
      section: text(source.section),
      accessedAt: text(source.accessedAt || source.accessed_at),
      sourceBacked: true,
    }))
}

export function buildMaintenanceHistoryReport(item = {}, options = {}) {
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    reportType: 'maintenance_history',
    requiresPro: true,
    title: 'SideFlip Maintenance History Report',
    generatedAt: generatedAt(options.generatedAt),
    dateRange: dateRangeFor(options),
    identity: identityFor(item, options),
    ownershipPeriod: ownershipPeriodFor(item),
    photos: selectedPhotosFor(options),
    usage: compact({
      miles: finiteNumber(item.currentUsage?.miles ?? item.current_mileage),
      hours: finiteNumber(item.currentUsage?.hours ?? item.current_hours),
      cycles: finiteNumber(item.currentUsage?.cycles ?? item.current_cycles),
      recordedAt: text(item.currentUsage?.recordedAt || item.current_usage_recorded_at),
    }),
    serviceHistory: serviceHistoryFor(item, options),
    upcomingMaintenance: [...(Array.isArray(item.upcomingMaintenance) ? item.upcomingMaintenance : [])]
      .sort(stableDateSort(['dueAt', 'due_at']))
      .map((entry) => compact({ name: text(entry.name || entry.task), status: text(entry.status), dueAt: text(entry.dueAt || entry.due_at) })),
    sources: sourcesFor(item),
    disclaimer: REPORT_DISCLAIMER,
  }
}

export const buildProjectReportModel = buildProjectReport
export const buildMaintenanceHistoryReportModel = buildMaintenanceHistoryReport

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => [key, canonicalValue(value[key])]))
  }
  return value
}

export function canonicalStringify(value) {
  return JSON.stringify(canonicalValue(value))
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderValue(value) {
  if (Array.isArray(value)) return `<ol>${value.map((entry) => `<li>${renderValue(entry)}</li>`).join('')}</ol>`
  if (value && typeof value === 'object') {
    return `<dl>${Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null).map(([key, entry]) => `<dt>${escapeHtml(key)}</dt><dd>${renderValue(entry)}</dd>`).join('')}</dl>`
  }
  return escapeHtml(value)
}

export function renderReportHtml(report = {}) {
  const title = escapeHtml(report.title || 'SideFlip Report')
  const body = Object.entries(report)
    .filter(([key, value]) => key !== 'title' && value !== undefined && value !== null)
    .map(([key, value]) => `<section><h2>${escapeHtml(key)}</h2>${renderValue(value)}</section>`)
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1>${body}</body></html>`
}
