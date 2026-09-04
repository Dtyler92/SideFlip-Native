export const MEASUREMENT_TYPES = Object.freeze(['miles', 'hours', 'cycles'])

const CONTRACTS = Object.freeze({
  vehicle: Object.freeze({ category: 'vehicle', label: 'Vehicle', measurements: Object.freeze(['miles', 'hours', 'cycles']), identityFields: Object.freeze(['year', 'make', 'model', 'trim', 'engine', 'transmission', 'drivetrain', 'fuelType']) }),
  motorcycle: Object.freeze({ category: 'motorcycle', label: 'Motorcycle', measurements: Object.freeze(['miles', 'hours', 'cycles']), identityFields: Object.freeze(['year', 'make', 'model', 'trim', 'engine']) }),
  boat: Object.freeze({ category: 'boat', label: 'Boat', measurements: Object.freeze(['miles', 'hours', 'cycles']), identityFields: Object.freeze(['year', 'make', 'model', 'engine']) }),
  equipment: Object.freeze({ category: 'equipment', label: 'Equipment', measurements: Object.freeze(['hours', 'cycles']), identityFields: Object.freeze(['year', 'make', 'model', 'engine', 'powerType']) }),
  tool: Object.freeze({ category: 'tool', label: 'Tool', measurements: Object.freeze(['hours', 'cycles']), identityFields: Object.freeze(['make', 'model', 'powerType']) }),
  home: Object.freeze({ category: 'home', label: 'Home', measurements: Object.freeze(['hours', 'cycles']), identityFields: Object.freeze(['year', 'make', 'model']) }),
  appliance: Object.freeze({ category: 'appliance', label: 'Appliance', measurements: Object.freeze(['cycles']), identityFields: Object.freeze(['year', 'make', 'model']) }),
  electronics: Object.freeze({ category: 'electronics', label: 'Electronics', measurements: Object.freeze(['cycles']), identityFields: Object.freeze(['year', 'make', 'model']) }),
  recreation: Object.freeze({ category: 'recreation', label: 'Recreation', measurements: Object.freeze(['miles', 'hours', 'cycles']), identityFields: Object.freeze(['year', 'make', 'model', 'engine']) }),
  other: Object.freeze({ category: 'other', label: 'Other', measurements: Object.freeze(['miles', 'hours', 'cycles']), identityFields: Object.freeze(['year', 'make', 'model']) }),
})

export const ITEM_CATEGORIES = Object.freeze(Object.keys(CONTRACTS))
export const ITEM_CATEGORY_CONTRACTS = CONTRACTS
export const ITEM_CATEGORY_ALIASES = Object.freeze({
  car: 'vehicle', truck: 'vehicle', atv: 'recreation', 'side by side': 'recreation',
  'lawn mower': 'equipment', lawnmower: 'equipment', tractor: 'equipment', trailer: 'vehicle',
  generator: 'equipment', rv: 'vehicle',
})
export const MAX_USAGE_READING = 1_000_000_000

export function getItemCategoryContract(category) {
  const key = String(category || '').trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ')
  return CONTRACTS[key] || CONTRACTS[ITEM_CATEGORY_ALIASES[key]] || null
}

function validateReading(mode, raw) {
  if (raw == null || raw === '') return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0 || value > MAX_USAGE_READING) return `${mode} must be a bounded non-negative number.`
  if (mode === 'cycles' && !Number.isInteger(value)) return 'cycles must be a whole number.'
  return null
}

export function validateItemDraft(item = {}) {
  const errors = {}
  const name = String(item.name ?? '').trim()
  if (!name) errors.name = 'Item name is required.'
  else if (name.length > 200) errors.name = 'Item name must be 200 characters or fewer.'

  const contract = getItemCategoryContract(item.category)
  if (!contract) errors.category = 'Choose a valid category.'

  const measurements = Array.isArray(item.measurements) ? item.measurements : []
  const unique = new Set(measurements)
  if (unique.size !== measurements.length) {
    errors.measurements = 'Measurement modes cannot contain duplicate values.'
  } else if (contract) {
    const unsupported = measurements.find((mode) => !contract.measurements.includes(mode))
    if (unsupported) errors.measurements = `${unsupported} is not supported for ${contract.label}.`
  }

  if (item.year != null && item.year !== '') {
    const year = Number(item.year)
    if (!Number.isInteger(year) || year < 1800 || year > 2200) errors.year = 'Year must be a whole number between 1800 and 2200.'
  }

  const readingErrors = []
  const usage = item.currentUsage || {}
  for (const mode of measurements) {
    const error = validateReading(mode, usage[mode])
    if (error) readingErrors.push(error)
  }
  if (readingErrors.length) errors.currentUsage = readingErrors.join(' ')

  return { ok: Object.keys(errors).length === 0, errors }
}
