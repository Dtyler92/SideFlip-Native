import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

test('Airplanes are available in Projects and My Stuff without automotive VIN decoding', () => {
  const projectCreate = source('src/screens/NewProjectScreen.js')
  const itemModel = source('src/domain/myStuff/itemModel.js')
  assert.match(projectCreate, /value:'airplane',label:'✈️ Airplane'/)
  assert.match(itemModel, /itemType\('airplane', 'Airplane', 'aircraft'\)/)
  assert.doesNotMatch(itemModel, /VIN_ITEM_TYPES[^\n]*airplane/)
})

test('Project notes are editable below expenses and above identification', () => {
  const detail = source('src/screens/ProjectDetailScreen.js')
  const expenses = detail.indexOf('Expenses ({project.expenses?.length || 0})')
  const notes = detail.indexOf('Notes', expenses)
  const identity = Math.min(...['Vehicle details','Model & serial identification'].map(label => detail.indexOf(label, notes)).filter(index => index >= 0))
  assert.ok(expenses >= 0 && notes > expenses && identity > notes)
  assert.match(detail, /Save Notes/)
  assert.match(detail, /update\(\{ notes:/)
  assert.match(detail, /select\('notes'\)\.single\(\)/)
  assert.match(detail, /resolveProjectNotesSaveResponse/)
})

test('Project-scoped note and listing drafts reset when the route changes', () => {
  const detail = source('src/screens/ProjectDetailScreen.js')
  assert.match(detail, /activeProjectId\.current = projectId/)
  assert.match(detail, /setProjectNotes\(''\)/)
  assert.match(detail, /setSellerBrief\(''\)/)
  assert.match(detail, /generationAbortRef\.current\?\.abort\(\)/)
})

 test('My Stuff create screen marks required ownership fields and validates in creation mode', () => {
  const create = source('src/screens/MyStuffCreateScreen.js')
  assert.match(create, /validateItemDraft\(validatedDraft, \{ requireOwnershipFields:true \}\)/)
  assert.match(create, /Purchase price \*/)
  assert.match(create, /Current \$\{axis\.label\.toLowerCase\(\)\}/)
  assert.match(create, /requiresUsageAndPurchase\(draft\.itemType\)\?'\*':'\(optional\)'/)
})
