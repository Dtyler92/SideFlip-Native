import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildMyStuffVinCreateSuggestions,
  buildProjectCreatePersistence,
  buildProjectVinCreateSuggestions,
  vehicleDetailsAfterCategoryChange,
} from '../src/domain/vinCreateModel.js'
import { buildCreateMyStuffItemV2WirePayload } from '../src/lib/myStuffPayloads.js'
import { mergeDecodedSuggestions } from '../src/domain/myStuff/vinModel.js'

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')
const decodedTruck = {
  modelYear: 2021,
  make: 'Ford',
  model: 'F-150',
  trim: 'XLT',
  engineCylinders: 6,
  displacementLiters: 3.5,
  transmissionStyle: 'Automatic',
  driveType: '4WD',
  fuelTypePrimary: 'Gasoline',
  bodyClass: 'Pickup',
  vehicleType: 'TRUCK',
}

test('leaving a vehicle project category permanently clears hidden vehicle identifiers', () => {
  const entered = { vin:'1FTFW1E50MFA00001', year:'2021', make:'Ford', model:'F-150', engine:'3.5L' }
  const hidden = vehicleDetailsAfterCategoryChange(entered, false)
  const shownAgain = vehicleDetailsAfterCategoryChange(hidden, true)

  assert.deepEqual(hidden, { vin:'', year:'', make:'', model:'', engine:'' })
  assert.deepEqual(shownAgain, { vin:'', year:'', make:'', model:'', engine:'' })
  assert.notEqual(hidden, shownAgain)
  assert.match(source('src/screens/NewProjectScreen.js'), /setVehicleDetails\(current => vehicleDetailsAfterCategoryChange\(current, VEHICLE_PROJECT_CATEGORIES\.has\(value\)\)\)/)
})

test('decoded create suggestions fill reliable blank fields, generate names, and classify only confident vehicles', () => {
  assert.deepEqual(buildProjectVinCreateSuggestions(decodedTruck), {
    year: 2021,
    make: 'Ford',
    model: 'F-150',
    engine: '3.5L · 6 cylinders',
    title: '2021 Ford F-150',
    category: 'car',
  })
  assert.deepEqual(buildMyStuffVinCreateSuggestions(decodedTruck), {
    year: 2021,
    make: 'Ford',
    model: 'F-150',
    trim: 'XLT',
    bodyStyle: 'Pickup',
    vehicleType: 'TRUCK',
    engine: '3.5L · 6 cylinders',
    engineCylinders: 6,
    engineDisplacementLiters: 3.5,
    transmission: 'Automatic',
    drivetrain: '4WD',
    fuelType: 'Gasoline',
    name: '2021 Ford F-150',
    itemType: 'truck',
    category: 'vehicle',
  })
  const unknown = { modelYear: 2020, make: 'Example', model: 'Mystery', vehicleType: 'LOW SPEED VEHICLE' }
  assert.equal('category' in buildProjectVinCreateSuggestions(unknown), false)
  assert.equal('itemType' in buildMyStuffVinCreateSuggestions(unknown), false)
})

test('automatic blank filling preserves conflicts for explicit field-level acceptance', () => {
  const project = { title: 'My Truck', category: 'mower', year: '', make: 'Ford', model: '', engine: '', vin: '1FTFW1E50MFA00001' }
  const preview = mergeDecodedSuggestions(project, buildProjectVinCreateSuggestions(decodedTruck))
  assert.deepEqual(preview.values, {
    ...project,
    year: 2021,
    model: 'F-150',
    engine: '3.5L · 6 cylinders',
  })
  assert.equal(preview.fields.title.status, 'conflicting')
  assert.equal(preview.fields.category.status, 'conflicting')
  assert.equal(preview.fields.make.status, 'verified')

  const suggestions = buildMyStuffVinCreateSuggestions(decodedTruck)
  const fresh = mergeDecodedSuggestions({ itemType: '', category: '' }, suggestions)
  assert.equal(fresh.values.itemType, 'truck')
  assert.equal(fresh.values.category, 'vehicle')
  const explicitlySelected = mergeDecodedSuggestions({ itemType: 'mower', category: 'equipment' }, suggestions)
  assert.equal(explicitlySelected.values.itemType, 'mower')
  assert.equal(explicitlySelected.values.category, 'equipment')
  assert.equal(explicitlySelected.fields.itemType.status, 'conflicting')
  assert.equal(explicitlySelected.fields.category.status, 'conflicting')
})

test('project create persistence includes supported decoded fields in direct and goal-linked paths', () => {
  assert.deepEqual(buildProjectCreatePersistence({
    vin: ' 1FTFW1E50MFA00001 ', year: '2021', make: ' Ford ', model: ' F-150 ', engine: ' 3.5L ',
  }), {
    vin: '1FTFW1E50MFA00001', vehicle_year: 2021, vehicle_make: 'Ford', vehicle_model: 'F-150', engine_model: '3.5L',
  })
  const screen = source('src/screens/NewProjectScreen.js')
  for (const field of ['p_vin: vehiclePersistence.vin', 'p_vehicle_year: vehiclePersistence.vehicle_year', 'p_vehicle_make: vehiclePersistence.vehicle_make', 'p_vehicle_model: vehiclePersistence.vehicle_model', 'p_engine_model: vehiclePersistence.engine_model']) {
    assert.ok(screen.includes(field), `goal-linked payload missing ${field}`)
  }
  assert.match(screen, /const directPayload = \{[\s\S]*\.\.\.vehiclePersistence[\s\S]*\}/)
  assert.match(screen, /insert\(\{ \.\.\.directPayload, trade_up_mutation_id: mutationId \}\)/)
  assert.match(screen, /VEHICLE_PROJECT_CATEGORIES\.has\(category\) \? buildProjectCreatePersistence\(vehicleDetails\) : buildProjectCreatePersistence\(\)/)
  assert.match(screen, /const submitInFlight = useRef\(false\)/)
  assert.match(screen, /if \(submitInFlight\.current\) return/)
  assert.match(screen, /const rpcPayload = \{[\s\S]*p_vin: vehiclePersistence\.vin[\s\S]*\}/)
  assert.match(screen, /mutationIdForPayload\(projectMutationAttempt\.current, rpcPayload\)/)
  assert.match(screen, /mutationIdForPayload\(projectMutationAttempt\.current, directPayload\)/)
  assert.match(screen, /trade_up_mutation_id: mutationId/)
  assert.match(screen, /error\?\.code === '23505'/)
  assert.match(screen, /\.eq\('user_id', user\.id\)[\s\S]*\.eq\('trade_up_mutation_id', mutationId\)/)
  assert.match(screen, /resetMutationAttemptState\(projectMutationAttempt\.current\)/)
})

test('My Stuff V2 create payload persists VIN and every supported decoded value', () => {
  const wire = buildCreateMyStuffItemV2WirePayload({
    name: '2021 Ford F-150', itemType: 'truck', category: 'vehicle', measurements: [],
    vin: '1FTFW1E50MFA00001', year: 2021, make: 'Ford', model: 'F-150', trim: 'XLT',
    engine: '3.5L · 6 cylinders', transmission: 'Automatic', drivetrain: '4WD', fuelType: 'Gasoline',
  })
  assert.deepEqual(wire.p_item, {
    name: '2021 Ford F-150', item_type: 'truck', category: 'vehicle', usage_dimensions: [],
    vin: '1FTFW1E50MFA00001', model_year: 2021, make: 'Ford', model: 'F-150', trim: 'XLT',
    engine: '3.5L · 6 cylinders', transmission: 'Automatic', drivetrain: '4WD', fuel_power_type: 'Gasoline',
  })
  const screen = source('src/screens/MyStuffCreateScreen.js')
  const panel = source('src/components/VinDecodePanel.js')
  assert.match(screen, /<VinDecodePanel[\s\S]*subjectType="my_stuff_item"[\s\S]*subjectId=\{null\}[\s\S]*autoFillBlanks/)
  assert.match(panel, /vin: request\.normalizedVin/)
  assert.ok(screen.indexOf('<VinDecodePanel') < screen.indexOf('label="Item name *"'))
  assert.match(screen, /onUpgrade=\{\(\) => navigation\.navigate\('Pro'\)\}/)
})

test('New Project offers pre-save Pro VIN decoding for vehicle details', () => {
  const screen = source('src/screens/NewProjectScreen.js')
  assert.match(screen, /VEHICLE_PROJECT_CATEGORIES\.has\(category\)[\s\S]*<VinDecodePanel/)
  assert.match(screen, /<VinDecodePanel[\s\S]*subjectType="project"[\s\S]*subjectId=\{null\}[\s\S]*autoFillBlanks/)
  assert.match(screen, /mapSuggestions=\{buildProjectVinCreateSuggestions\}/)
  assert.match(screen, /onUpgrade=\{\(\) => navigation\.navigate\('Pro'\)\}/)
})

test('Project Detail starts vehicle details expanded and compresses them after a successful VIN decode', () => {
  const detail = source('src/screens/ProjectDetailScreen.js')
  const panel = source('src/components/VinDecodePanel.js')
  assert.match(detail, /const \[showVehicleDetails, setShowVehicleDetails\] = useState\(true\)/)
  assert.match(detail, /accessibilityState=\{\{ expanded: showVehicleDetails \}\}/)
  assert.match(detail, /onPress=\{\(\) => setShowVehicleDetails\(current => !current\)\}/)
  assert.match(detail, /<VinDecodePanel[\s\S]*onDecoded=\{\(\) => setShowVehicleDetails\(false\)\}/)
  assert.match(panel, /setPreview\([^\n]+\)\n\s+setWarnings\(result\.nhtsaWarnings\)\n\s+onDecoded\?\.\(/)
  assert.match(detail, /style=\{\[s\.vehicleDetailsBody, !showVehicleDetails && s\.vehicleDetailsBodyHidden\]\}/)
  assert.match(detail, /importantForAccessibility=\{showVehicleDetails \? 'auto' : 'no-hide-descendants'\}/)
  assert.match(detail, /accessibilityLabel=\{`Vehicle details, \$\{vehicleSummary\}, VIN \$\{vehicleVinSummary\}`\}/)
  assert.match(detail, /showVehicleDetails \? 'Hide' : 'Show'/)
})

test('Project Detail puts VIN decoder and PDF creator after expenses/form and directly before actions', () => {
  const detail = source('src/screens/ProjectDetailScreen.js')
  const expenses = detail.indexOf('Expenses ({project.expenses?.length || 0})')
  const expenseForm = detail.indexOf('{showAddExpense && (', expenses)
  const vehicleSection = detail.indexOf('Vehicle details', expenseForm)
  const vehicleCard = detail.indexOf('<View style={s.card}>', vehicleSection)
  const manualFields = detail.indexOf('<ProjectVehicleField', vehicleCard)
  const vin = detail.indexOf('<VinDecodePanel', manualFields)
  const saveVehicle = detail.indexOf('Save Vehicle Details', vin)
  const report = detail.indexOf('<ReportPanel', saveVehicle)
  const actions = detail.indexOf('{/* Actions */}', report)
  assert.ok(expenses >= 0 && expenseForm > expenses && vehicleSection > expenseForm && vehicleCard > vehicleSection && manualFields > vehicleCard && vin > manualFields && saveVehicle > vin && report > saveVehicle && actions > report)
  assert.equal(detail.slice(0, expenses).includes('<Text style={s.sectionTitle}>Vehicle details</Text>'), false)
  assert.equal(detail.slice(expenseForm, vin).includes('<ReportPanel'), false)
  assert.equal(detail.slice(report, actions).includes('<VinDecodePanel'), false)
})
