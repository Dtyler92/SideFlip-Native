import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ITEM_CATEGORIES,
  MEASUREMENT_TYPES,
  getItemCategoryContract,
  validateItemDraft,
} from '../src/domain/myStuff/itemModel.js'

test('every item category declares identity fields and valid measurement modes', () => {
  assert.deepEqual(MEASUREMENT_TYPES, ['miles', 'hours', 'cycles'])
  assert.ok(ITEM_CATEGORIES.length >= 6)
  for (const category of ITEM_CATEGORIES) {
    const contract = getItemCategoryContract(category)
    assert.equal(contract.category, category)
    assert.ok(Array.isArray(contract.identityFields))
    assert.ok(contract.measurements.every((mode) => MEASUREMENT_TYPES.includes(mode)))
  }
  assert.deepEqual(getItemCategoryContract('vehicle').measurements, ['miles', 'hours', 'cycles'])
  assert.deepEqual(getItemCategoryContract('equipment').measurements, ['hours', 'cycles'])
})

test('item validation enforces category measurement contracts and conditional fields', () => {
  assert.deepEqual(validateItemDraft({ name: 'Truck', category: 'vehicle', measurements: ['miles'], year: 2020 }), { ok: true, errors: {} })
  assert.equal(validateItemDraft({ name: 'Truck', category: 'vehicle', measurements: ['miles', 'hours'] }).ok, true)
  assert.match(validateItemDraft({ name: '', category: 'vehicle', measurements: ['miles'] }).errors.name, /required/)
  assert.match(validateItemDraft({ name: 'Mystery', category: 'invalid', measurements: [] }).errors.category, /valid category/)
  assert.match(validateItemDraft({ name: 'Truck', category: 'vehicle', measurements: ['miles'], year: 1799 }).errors.year, /between/)
})

test('measurement selections are unique and current readings are bounded non-negative numbers', () => {
  assert.match(validateItemDraft({ name: 'Loader', category: 'equipment', measurements: ['hours', 'hours'] }).errors.measurements, /duplicate/)
  assert.match(validateItemDraft({ name: 'Loader', category: 'equipment', measurements: ['hours'], currentUsage: { hours: -1 } }).errors.currentUsage, /non-negative/)
  assert.match(validateItemDraft({ name: 'Loader', category: 'equipment', measurements: ['cycles'], currentUsage: { cycles: 1.5 } }).errors.currentUsage, /whole number/)
})

test('user-requested category names map explicitly to legacy contracts', () => {
  const aliases = {
    car: 'vehicle', truck: 'vehicle', ATV: 'recreation', 'side-by-side': 'recreation',
    'lawn mower': 'equipment', tractor: 'equipment', trailer: 'vehicle', generator: 'equipment', RV: 'vehicle',
  }
  for (const [alias, category] of Object.entries(aliases)) {
    assert.equal(getItemCategoryContract(alias).category, category, alias)
    assert.equal(validateItemDraft({ name: alias, category: alias, measurements: getItemCategoryContract(alias).measurements }).ok, true, alias)
  }
})

test('vehicle, motorcycle, and boat contracts accept relevant combined measurement axes', () => {
  for (const category of ['vehicle', 'motorcycle', 'boat']) {
    assert.equal(validateItemDraft({ name: category, category, measurements: ['miles', 'hours', 'cycles'] }).ok, true)
  }
})

test('every category accepts each declared measurement and rejects undeclared measurements', () => {
  for (const category of ITEM_CATEGORIES) {
    const contract = getItemCategoryContract(category)
    for (const measurement of MEASUREMENT_TYPES) {
      const result = validateItemDraft({ name: category, category, measurements: [measurement] })
      assert.equal(result.ok, contract.measurements.includes(measurement), `${category}/${measurement}`)
    }
  }
})
