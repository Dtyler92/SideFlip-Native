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

function itemType(value, label, category) {
  return Object.freeze({ value, label, category })
}

// Keep this in the same order as the backend SQL allowlist.
export const ITEM_TYPE_OPTIONS = Object.freeze([
  itemType('car', 'Car', 'vehicle'),
  itemType('truck', 'Truck', 'vehicle'),
  itemType('motorcycle', 'Motorcycle', 'motorcycle'),
  itemType('boat', 'Boat', 'boat'),
  itemType('atv', 'ATV', 'recreation'),
  itemType('side_by_side', 'Side-by-side', 'recreation'),
  itemType('mower', 'Lawn mower', 'equipment'),
  itemType('tractor', 'Tractor', 'equipment'),
  itemType('trailer', 'Trailer', 'vehicle'),
  itemType('generator', 'Generator', 'equipment'),
  itemType('rv', 'RV', 'vehicle'),
  itemType('equipment', 'Other equipment', 'equipment'),
  itemType('bicycle', 'Bicycle / e-bike', 'recreation'),
  itemType('watch', 'Watch', 'other'),
  itemType('electronics', 'Electronics', 'electronics'),
  itemType('gaming', 'Gaming / console', 'electronics'),
  itemType('tool', 'Tool', 'tool'),
  itemType('exercise', 'Exercise equipment', 'recreation'),
  itemType('instrument', 'Musical instrument', 'other'),
  itemType('furniture', 'Furniture', 'home'),
  itemType('house', 'House', 'home'),
  itemType('other', 'Other', 'other'),
])

const ITEM_TYPE_BY_VALUE = Object.freeze(Object.fromEntries(ITEM_TYPE_OPTIONS.map(option => [option.value, option])))

export const ITEM_CATEGORIES = Object.freeze(Object.keys(CONTRACTS))
export const ITEM_CATEGORY_CONTRACTS = CONTRACTS
export const ITEM_CATEGORY_ALIASES = Object.freeze({
  car: 'vehicle', truck: 'vehicle', atv: 'recreation', 'side by side': 'recreation',
  'lawn mower': 'equipment', lawnmower: 'equipment', tractor: 'equipment', trailer: 'vehicle',
  generator: 'equipment', rv: 'vehicle', bicycle: 'recreation', watch: 'other', gaming: 'electronics',
  exercise: 'recreation', instrument: 'other', furniture: 'home', house: 'home',
})
export const MAX_USAGE_READING = 1_000_000_000

function normalizedKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ')
}

export function getItemTypeOption(value) {
  const key = normalizedKey(value).replace(/ /g, '_')
  return ITEM_TYPE_BY_VALUE[key] || null
}

export function deriveItemCategory(value) {
  return getItemTypeOption(value)?.category || 'other'
}

export function getItemCategoryContract(category) {
  const key = normalizedKey(category)
  return CONTRACTS[key] || CONTRACTS[ITEM_CATEGORY_ALIASES[key]] || null
}

export function selectItemType(draft = {}, value) {
  const option = getItemTypeOption(value)
  if (!option) return { ...draft, itemType: value }
  const allowed = new Set(CONTRACTS[option.category].measurements)
  const measurements = (Array.isArray(draft.measurements) ? draft.measurements : []).filter(mode => allowed.has(mode))
  const currentUsage = {}
  for (const mode of measurements) {
    if (draft.currentUsage && Object.prototype.hasOwnProperty.call(draft.currentUsage, mode)) currentUsage[mode] = draft.currentUsage[mode]
  }
  const next = { ...draft, itemType: option.value, category: option.category, measurements, currentUsage }
  for (const mode of MEASUREMENT_TYPES) if (!allowed.has(mode)) delete next[mode]
  return next
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

  const selectedType = item.itemType == null ? null : getItemTypeOption(item.itemType)
  if (item.itemType != null && !selectedType) errors.itemType = 'Choose a valid specific item type.'
  const category = selectedType?.category || item.category
  const contract = getItemCategoryContract(category)
  if (!contract) errors.category = 'Choose a valid category.'
  else if (selectedType && normalizedKey(item.category) !== selectedType.category) {
    errors.category = `Choose the category that matches ${selectedType.label}.`
  }

  const measurements = Array.isArray(item.measurements) ? item.measurements : []
  const unique = new Set(measurements)
  if (unique.size !== measurements.length) {
    errors.measurements = 'Measurement modes cannot contain duplicate values.'
  } else if (contract) {
    const unsupported = measurements.find(mode => !contract.measurements.includes(mode))
    if (unsupported) errors.measurements = `${unsupported} is not supported for ${contract.label}.`
  }

  if (item.year != null && item.year !== '') {
    const year = Number(item.year)
    if (!Number.isInteger(year) || year < 1800 || year > 2200) errors.year = 'Year must be a whole number between 1800 and 2200.'
  }
  if (item.usageProfile != null && !['normal', 'severe'].includes(item.usageProfile)) {
    errors.usageProfile = 'Usage profile must be Normal or Severe.'
  }

  const readingErrors = []
  const usage = item.currentUsage || {}
  for (const mode of MEASUREMENT_TYPES) {
    const raw = usage[mode]
    if (raw != null && raw !== '' && !measurements.includes(mode)) {
      readingErrors.push(`Select ${mode === 'miles' ? 'Miles' : mode[0].toUpperCase() + mode.slice(1)} before entering its current reading.`)
      continue
    }
    if (measurements.includes(mode)) {
      const error = validateReading(mode, raw)
      if (error) readingErrors.push(error)
    }
  }
  if (readingErrors.length) errors.currentUsage = readingErrors.join(' ')

  return { ok: Object.keys(errors).length === 0, errors }
}
