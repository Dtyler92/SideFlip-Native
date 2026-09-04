import test from 'node:test'
import assert from 'node:assert/strict'
import {
  REPORT_DISCLAIMER,
  buildMaintenanceHistoryReport,
  buildProjectReport,
  canonicalStringify,
  renderReportHtml,
} from '../src/domain/myStuff/reportModel.js'

const project = {
  id: 'project-secret', name: '<Truck & Trailer>', category: 'Vehicles', vin: 'SECRET-VIN', purchasePrice: 1000,
  salePrice: 2200, expenses: [{ id: 'e2', date: '2024-02-02', description: '<script>alert(1)</script>', amount: 200 }, { id: 'e1', date: '2024-01-01', description: 'Tires', amount: 100 }],
  notes: 'Good > bad', goal: { id: 'goal-secret', name: 'Dream car', currentAmount: 900 },
}

test('project report is canonical, private by default, and does not mutate accounting input', () => {
  const before = structuredClone(project)
  const report = buildProjectReport(project, { generatedAt: '2026-09-03T12:00:00.000Z' })
  assert.equal(report.title, 'SideFlip Project Report')
  assert.equal(report.requiresPro, true)
  assert.equal(report.disclaimer, REPORT_DISCLAIMER)
  assert.equal(report.identity.identifier, undefined)
  assert.equal(report.financials, undefined)
  assert.equal(report.workHistory[0].description, 'Tires')
  assert.deepEqual(project, before)
  assert.equal(canonicalStringify(report), canonicalStringify(buildProjectReport(project, { generatedAt: '2026-09-03T12:00:00.000Z' })))
})

test('costs and masked identifier require explicit per-report inclusion', () => {
  const report = buildProjectReport(project, { generatedAt: '2026-09-03T12:00:00.000Z', includeDetailedCosts: true, includeIdentifier: true, maskedIdentifier: '••••4352' })
  assert.equal(report.identity.identifier, '••••4352')
  assert.deepEqual(report.financials, { purchasePrice: 1000, salePrice: 2200, expensesTotal: 300 })
  assert.equal(report.workHistory[0].cost, 100)
  assert.notEqual(report.identity.identifier, project.vin)
})

test('maintenance report sorts history and sources and hides identifiers and costs by default', () => {
  const item = {
    id: 'item-secret', name: 'Excavator', serial: 'SERIAL-SECRET', make: 'CAT', currentUsage: { hours: 500 },
    serviceHistory: [
      { id: 'b', completedAt: '2025-02-01', task: 'Oil', cost: 75, notes: 'B' },
      { id: 'a', completedAt: '2025-01-01', task: 'Filter', cost: 25, notes: 'A' },
    ],
    upcomingMaintenance: [{ name: 'Grease', status: 'due_soon', dueAt: '2025-03-01' }],
    sources: [{ title: 'Manual B', url: 'https://example.com/b', accessedAt: '2025-01-02' }, { title: 'Manual A', url: 'https://example.com/a', accessedAt: '2025-01-01' }],
  }
  const before = structuredClone(item)
  const report = buildMaintenanceHistoryReport(item, { generatedAt: '2026-09-03T12:00:00.000Z' })
  assert.equal(report.title, 'SideFlip Maintenance History Report')
  assert.equal(report.requiresPro, true)
  assert.equal(report.identity.identifier, undefined)
  assert.equal(report.serviceHistory[0].task, 'Filter')
  assert.equal(report.serviceHistory[0].cost, undefined)
  assert.equal(report.sources[0].title, 'Manual A')
  assert.deepEqual(item, before)
  assert.deepEqual(report.usage, { hours: 500 })
})

test('project and maintenance reports inclusively filter history to the selected date range', () => {
  const options = { generatedAt: '2026-09-03T12:00:00.000Z', startDate: '2024-01-15', endDate: '2024-02-02', includeDetailedCosts: true }
  const projectReport = buildProjectReport(project, options)
  assert.deepEqual(projectReport.dateRange, { startDate: '2024-01-15', endDate: '2024-02-02' })
  assert.deepEqual(projectReport.workHistory.map((entry) => entry.description), ['<script>alert(1)</script>'])
  assert.equal(projectReport.financials.expensesTotal, 200)

  const item = { serviceHistory: [
    { completedAt: '2024-01-14T23:59:59Z', task: 'Before' },
    { completedAt: '2024-01-15T23:59:59Z', task: 'Start' },
    { completed_at: '2024-02-02', task: 'End' },
    { completedAt: '2024-02-03', task: 'After' },
  ] }
  const maintenanceReport = buildMaintenanceHistoryReport(item, options)
  assert.deepEqual(maintenanceReport.dateRange, { startDate: '2024-01-15', endDate: '2024-02-02' })
  assert.deepEqual(maintenanceReport.serviceHistory.map((entry) => entry.task), ['Start', 'End'])
})

test('reports always have a safe generated timestamp and disclose ownership period', () => {
  const report = buildProjectReport({ name: 'Truck', acquiredOn: '2023-01-02', sold_on: '2024-03-04' })
  assert.equal(Number.isNaN(Date.parse(report.generatedAt)), false)
  assert.deepEqual(report.ownershipPeriod, { startedAt: '2023-01-02', endedAt: '2024-03-04' })
  const invalid = buildMaintenanceHistoryReport({}, { generatedAt: 'not-a-date' })
  assert.equal(Number.isNaN(Date.parse(invalid.generatedAt)), false)
})

test('selected photos and detailed costs and document references require explicit options', () => {
  const item = {
    acquired_on: '2020-01-01',
    serviceHistory: [{ completedAt: '2025-01-01', task: 'Service', cost: 90, partsCost: 40, labor_cost: 50, receiptRef: 'R-1', invoice_reference: 'I-2' }],
  }
  const privateReport = buildMaintenanceHistoryReport(item, { generatedAt: '2026-09-03T12:00:00.000Z' })
  assert.equal(privateReport.serviceHistory[0].partsCost, undefined)
  assert.equal(privateReport.serviceHistory[0].receiptReference, undefined)
  assert.deepEqual(privateReport.photos, [])

  const disclosed = buildMaintenanceHistoryReport(item, {
    generatedAt: '2026-09-03T12:00:00.000Z', includeDetailedCosts: true, includeDocuments: true, includePhotos: true,
    selectedPhotos: [{ uri: 'file://selected.jpg', caption: '<engine>' }],
  })
  assert.deepEqual(disclosed.ownershipPeriod, { startedAt: '2020-01-01' })
  assert.deepEqual(disclosed.photos, [{ caption: '<engine>', uri: 'file://selected.jpg' }])
  assert.deepEqual(disclosed.serviceHistory[0], {
    completedAt: '2025-01-01', task: 'Service', cost: 90, partsCost: 40, laborCost: 50,
    receiptReference: 'R-1', invoiceReference: 'I-2',
  })
  assert.doesNotMatch(renderReportHtml(disclosed), /<engine>/)
})

test('canonical disclosure controls govern private report fields and legacy names fail closed', () => {
  const item = {
    serviceHistory: [{ completedAt: '2025-01-01', task: 'Service', cost: 90, partsCost: 40, receiptRef: 'R-1' }],
  }
  const selectedPhotos = [{ uri: 'file://private.jpg', caption: 'Private' }]
  const legacy = buildMaintenanceHistoryReport(item, {
    generatedAt: '2026-09-03T12:00:00.000Z', selectedPhotos,
    includeCosts: true, includeDocumentReferences: true,
  })
  assert.deepEqual(legacy.photos, [])
  assert.equal(legacy.serviceHistory[0].cost, undefined)
  assert.equal(legacy.serviceHistory[0].partsCost, undefined)
  assert.equal(legacy.serviceHistory[0].receiptReference, undefined)

  const disclosed = buildMaintenanceHistoryReport(item, {
    generatedAt: '2026-09-03T12:00:00.000Z', selectedPhotos,
    includePhotos: true, includeDocuments: true, includeDetailedCosts: true,
  })
  assert.deepEqual(disclosed.photos, selectedPhotos)
  assert.equal(disclosed.serviceHistory[0].cost, 90)
  assert.equal(disclosed.serviceHistory[0].partsCost, 40)
  assert.equal(disclosed.serviceHistory[0].receiptReference, 'R-1')
})

test('reports reject malformed or reversed date ranges instead of failing open', () => {
  for (const build of [buildProjectReport, buildMaintenanceHistoryReport]) {
    assert.throws(() => build({}, { startDate: 'not-a-date' }), /startDate must be a valid calendar date/)
    assert.throws(() => build({}, { endDate: '2025-02-30' }), /endDate must be a valid calendar date/)
    assert.throws(() => build({}, { startDate: '2025-06-01garbage' }), /startDate must be a valid calendar date/)
    assert.throws(() => build({}, { endDate: '2025-06-01garbage' }), /endDate must be a valid calendar date/)
    assert.throws(() => build({}, { startDate: '2025-02-02', endDate: '2025-02-01' }), /startDate must not be after endDate/)
  }
})

test('history sorting uses validated camelCase and snake_case fallback dates', () => {
  const report = buildProjectReport({ workHistory: [
    { description: 'Invalid date', completedAt: '2024-01-09garbage', created_at: '2024-01-03T10:00:00Z' },
    { description: 'Snake completion', completed_at: '2024-01-02' },
    { description: 'Snake creation', created_at: '2024-01-01T10:00:00Z' },
    { description: 'Later real date', completedAt: '2024-01-05' },
  ] })
  assert.deepEqual(report.workHistory.map((entry) => entry.description), ['Snake creation', 'Snake completion', 'Invalid date', 'Later real date'])

  const maintenance = buildMaintenanceHistoryReport({ serviceHistory: [
    { task: 'Later', created_at: '2024-02-02T10:00:00Z' },
    { task: 'Earlier', created_at: '2024-02-01T10:00:00Z' },
  ] })
  assert.deepEqual(maintenance.serviceHistory.map((entry) => entry.task), ['Earlier', 'Later'])
})

test('date-like garbage in report history does not pass range filtering by its ten-character prefix', () => {
  const options = { startDate: '2025-06-01', endDate: '2025-06-01' }
  const projectReport = buildProjectReport({ workHistory: [
    { date: '2025-06-01garbage', description: 'Malformed' },
    { date: '2025-06-01T12:00:00Z', description: 'Valid ISO timestamp' },
  ] }, options)
  assert.deepEqual(projectReport.workHistory.map((entry) => entry.description), ['Valid ISO timestamp'])

  const maintenanceReport = buildMaintenanceHistoryReport({ serviceHistory: [
    { completedAt: '2025-06-01garbage', task: 'Malformed', completed_at: '2025-06-01' },
  ] }, options)
  assert.deepEqual(maintenanceReport.serviceHistory.map((entry) => entry.task), ['Malformed'])
  assert.equal(maintenanceReport.serviceHistory[0].completedAt, '2025-06-01')
})

test('HTML rendering escapes every user-entered value', () => {
  const report = buildProjectReport(project, { generatedAt: '2026-09-03T12:00:00.000Z' })
  const html = renderReportHtml(report)
  assert.match(html, /&lt;Truck &amp; Trailer&gt;/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(html, /Good &gt; bad/)
  assert.doesNotMatch(html, /<script>/)
  assert.doesNotMatch(html, /SECRET-VIN|project-secret|goal-secret/)
})
