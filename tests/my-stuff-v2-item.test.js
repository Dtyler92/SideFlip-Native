import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ITEM_CATEGORIES,
  ITEM_TYPE_OPTIONS,
  MEASUREMENT_TYPES,
  deriveItemCategory,
  getItemCategoryContract,
  selectItemType,
  validateItemDraft,
} from '../src/domain/myStuff/itemModel.js'
import { adaptItemDraftToSql, adaptSqlItem } from '../src/lib/myStuffAdapters.js'

const EXACT_ITEM_TYPES = [
  'car', 'truck', 'motorcycle', 'boat', 'atv', 'side_by_side', 'mower', 'tractor',
  'trailer', 'generator', 'rv', 'equipment', 'bicycle', 'watch', 'electronics',
  'gaming', 'tool', 'exercise', 'instrument', 'furniture', 'house', 'other',
]

test('all 22 backend item types are selectable and persist with a derived broad category', () => {
  assert.deepEqual(ITEM_TYPE_OPTIONS.map(option => option.value), EXACT_ITEM_TYPES)
  for (const itemType of EXACT_ITEM_TYPES) {
    const selected = selectItemType({ name: 'Manual item', measurements: [] }, itemType)
    assert.equal(selected.itemType, itemType)
    assert.equal(selected.category, deriveItemCategory(itemType))
    assert.equal(validateItemDraft(selected).ok, true, itemType)
    assert.equal(adaptItemDraftToSql(selected).item_type, itemType)
    const persisted = adaptSqlItem({ item_type: itemType })
    assert.equal(persisted.itemType, itemType)
    assert.equal(persisted.category, selected.category, `${itemType} must restore its derived broad category`)
  }
})

test('changing exact type drops unsupported measurement axes and their draft readings', () => {
  const selected = selectItemType({
    itemType: 'truck', category: 'vehicle', measurements: ['miles', 'hours'],
    miles: '1200', hours: '15', currentUsage: { miles: 1200, hours: 15 },
  }, 'electronics')
  assert.deepEqual(selected.measurements, [])
  assert.equal(selected.miles, undefined)
  assert.equal(selected.hours, undefined)
  assert.deepEqual(selected.currentUsage, {})
})

test('V2 validation rejects type/category drift, unsupported axes, orphan readings, and invalid profiles', () => {
  assert.match(validateItemDraft({ name: 'Truck', itemType: 'truck', category: 'equipment' }).errors.category, /matches Truck/)
  assert.match(validateItemDraft({ name: 'TV', itemType: 'electronics', category: 'electronics', measurements: ['miles'] }).errors.measurements, /not supported/)
  assert.match(validateItemDraft({ name: 'TV', itemType: 'electronics', category: 'electronics', measurements: [], currentUsage: { cycles: 2 } }).errors.currentUsage, /select Cycles/i)
  assert.match(validateItemDraft({ name: 'TV', itemType: 'electronics', category: 'electronics', usageProfile: 'extreme' }).errors.usageProfile, /Normal or Severe/)
  assert.match(validateItemDraft({ name: 'Mystery', itemType: 'not_real', category: 'other' }).errors.itemType, /specific item type/)
})

test('manual non-automotive items remain usable without measurements or automotive fields', () => {
  assert.deepEqual(validateItemDraft(selectItemType({ name: 'Dining table', measurements: [], usageProfile: 'normal' }, 'furniture')), { ok: true, errors: {} })
})

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
