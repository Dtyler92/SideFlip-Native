import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

test('My Stuff heading uses an accessible plus action instead of a full-width add bar', () => {
  const screen = source('src/screens/MyStuffScreen.js')
  assert.match(screen, /style=\{s\.headingRow\}/)
  assert.match(screen, /accessibilityLabel="Add a My Stuff item"/)
  assert.match(screen, /<Text style=\{s\.addButtonText\}>\+<\/Text>/)
  assert.doesNotMatch(screen, />Add an Item<\/Text>/)
})

test('Item Settings shows the complete saved VIN and every supported decoded identity field', () => {
  const screen = source('src/screens/MyStuffDetailScreen.js')
  assert.match(screen, /<IdentityLine label="VIN" value=\{item\.vin\}/)
  assert.doesNotMatch(screen, /maskVin\(item\.vin\)/)
  for (const label of [
    'Manufacturer','Vehicle type','Body style','Plant name','Plant country','Vehicle market',
    'Engine model','Engine displacement','Engine cylinders','Transmission','Drivetrain','Fuel / power type',
  ]) assert.match(screen, new RegExp(label.replaceAll(' / ',' \\/ '), 'i'), label)
})

test('VIN review saves all supported fields and then exposes the separate research action', () => {
  const panel = source('src/components/VinDecodePanel.js')
  const detail = source('src/screens/MyStuffDetailScreen.js')
  assert.match(panel, /Confirm vehicle for research/)
  assert.match(panel, /buildVehicleConfirmationSnapshot\(valuesRef\.current,preview\.fields\)/)
  assert.match(panel, /Research manufacturer schedule/)
  assert.doesNotMatch(panel, /Research is not available yet|queues zero research jobs/)
  assert.match(detail, /Confirm vehicle identity for manufacturer research/)
  assert.match(detail, /confirmationPersistsIdentity/)
  assert.doesNotMatch(detail, /persistIdentityForConfirmation/)
  assert.match(detail, /'series'/)
  assert.match(detail, /label="Series" value=\{item\.series\}/)
  assert.match(detail, /!item\.vin_confirmation_fingerprint/)
  assert.ok(detail.indexOf('<ManufacturerMaintenanceResearch') < detail.indexOf('<MyStuffV3Experience'), 'research CTA should be near the top of Maintenance after identity confirmation')
})

test('VIN research review opens a focused expanded decoder instead of duplicate vehicle fields', () => {
  const create = source('src/screens/MyStuffCreateScreen.js')
  const detail = source('src/screens/MyStuffDetailScreen.js')
  assert.match(detail, /const \[vinReviewRequested,setVinReviewRequested\]=useState\(false\)/)
  assert.match(detail, /setVinReviewRequested\(true\);setShowItemSettings\(true\);setEditing\(true\)/)
  assert.match(detail, /initiallyExpanded=\{vinReviewRequested\|\|!item\.vin_confirmation_fingerprint\}/)
  assert.match(detail, /supportsVinDecoder\(edit\.itemType\)&&<><VinDecodePanel/)
  assert.match(detail, /\(!supportsVinDecoder\(edit\.itemType\)\|\|showManualVehicleFields\)&&<>/)
  assert.match(create, /\(!supportsVinDecoder\(draft\.itemType\)\|\|showManualVehicleFields\) && <>/)
  assert.match(create, /Enter vehicle details manually/)
  assert.match(detail, /Enter vehicle details manually/)
})

test('requested My Stuff maintenance cleanup removes duplicate and legacy controls without deleting history', () => {
  const detail = source('src/screens/MyStuffDetailScreen.js')
  const experience = source('src/components/MyStuffV3Experience.js')
  const maintenance = experience.slice(experience.indexOf("{activeTab==='Maintenance'"), experience.indexOf("{activeTab==='History'"))
  const expenses = experience.slice(experience.indexOf("{activeTab==='Expenses'"), experience.indexOf("{activeTab==='Maintenance'"))
  assert.doesNotMatch(detail, /Archive Item|Restore Item|Due-state summary|Legacy schedules/)
  assert.match(detail, /Legacy service history \(read-only\)/)
  assert.doesNotMatch(detail, />Current usage</)
  assert.doesNotMatch(detail, /Update mileage, hours, or cycles here/)
  assert.match(detail, /Update current usage/)
  assert.doesNotMatch(maintenance, /Add expense/)
  assert.match(expenses, /Add expense/)
  assert.match(experience, /recordMyStuffServiceWithExpenseV3/)
  assert.match(experience, /reviseExpenseByLinkage/)
})
