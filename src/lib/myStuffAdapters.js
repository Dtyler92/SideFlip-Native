import { ITEM_TYPE_OPTIONS, deriveItemCategory } from '../domain/myStuff/itemModel.js'

const SQL_ITEM_TYPES = new Set(ITEM_TYPE_OPTIONS.map(option => option.value))

const TYPE_ALIASES = Object.freeze({
  vehicle: 'car', home: 'house', appliance: 'electronics', recreation: 'other',
  'side by side': 'side_by_side', 'lawn mower': 'mower', lawnmower: 'mower',
})


const FIELD_MAP = Object.freeze({
  customName: 'custom_name', year: 'model_year', modelYear: 'model_year', manufacturer: 'manufacturer',
  make: 'make', model: 'model', trim: 'trim', modelNumber: 'model_number', engine: 'engine',
  engineModel: 'engine_model', transmission: 'transmission', drivetrain: 'drivetrain',
  fuelType: 'fuel_power_type', powerType: 'fuel_power_type', serialNumber: 'serial_number',
  engineSerial: 'engine_serial', hullNumber: 'hull_number', registrationNumber: 'registration_number',
  purchasePrice: 'purchase_price', purchaseCurrency: 'purchase_currency', purchaseVendor: 'purchase_vendor',
  acquiredOn: 'acquired_on', manufacturedOn: 'manufactured_on', inServiceOn: 'in_service_on',
  primaryPhotoUrl: 'primary_photo_url', usageProfile: 'usage_profile', notes: 'notes', name: 'name',
  vin: 'vin',
})

function normalizedKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ')
}

export function toSqlItemType(value) {
  const key = normalizedKey(value)
  const direct = key.replace(/ /g, '_')
  return SQL_ITEM_TYPES.has(direct) ? direct : TYPE_ALIASES[key] || 'other'
}

export function fromSqlItemType(value) {
  return deriveItemCategory(toSqlItemType(value))
}

export function toSqlUsageDimension(value) {
  const key = normalizedKey(value)
  if (key === 'miles' || key === 'mileage') return 'mileage'
  return key === 'hours' || key === 'cycles' || key === 'time' ? key : null
}

export function fromSqlUsageDimension(value) {
  const key = toSqlUsageDimension(value)
  return key === 'mileage' ? 'miles' : key
}

function compactValue(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }
  return value
}

function assignPresent(target, key, value) {
  if (value === undefined) return
  const compacted = compactValue(value)
  target[key] = compacted
}

function adaptIdentity(values, { patch = false } = {}) {
  const result = {}
  for (const [uiKey, sqlKey] of Object.entries(FIELD_MAP)) {
    if (Object.prototype.hasOwnProperty.call(values, uiKey)) assignPresent(result, sqlKey, values[uiKey])
  }
  if (result.model_year != null) result.model_year = Number(result.model_year)
  if (result.purchase_price != null) result.purchase_price = Number(result.purchase_price)
  if (result.purchase_currency) result.purchase_currency = result.purchase_currency.toUpperCase()
  if (Object.prototype.hasOwnProperty.call(values, 'category')) {
    result.category = compactValue(values.category) || 'other'
  }
  if (Object.prototype.hasOwnProperty.call(values, 'itemType')) {
    result.item_type = toSqlItemType(values.itemType)
  } else if (!patch && Object.prototype.hasOwnProperty.call(values, 'category')) {
    result.item_type = toSqlItemType(values.category)
  }
  if (Object.prototype.hasOwnProperty.call(values, 'measurements')) {
    result.usage_dimensions = [...new Set(values.measurements.map(toSqlUsageDimension).filter(Boolean))]
  }
  if (!patch && !result.item_type) result.item_type = 'other'
  return result
}

export function adaptItemDraftToSql(values = {}) {
  const result = adaptIdentity(values)
  const usage = values.currentUsage || {}
  if (Object.prototype.hasOwnProperty.call(usage, 'miles')) {
    assignPresent(result, 'current_mileage', usage.miles)
    assignPresent(result, 'origin_mileage', usage.miles)
  }
  if (Object.prototype.hasOwnProperty.call(usage, 'mileage')) {
    assignPresent(result, 'current_mileage', usage.mileage)
    assignPresent(result, 'origin_mileage', usage.mileage)
  }
  if (Object.prototype.hasOwnProperty.call(usage, 'hours')) {
    assignPresent(result, 'current_hours', usage.hours)
    assignPresent(result, 'origin_hours', usage.hours)
  }
  if (Object.prototype.hasOwnProperty.call(usage, 'cycles')) {
    assignPresent(result, 'current_cycles', usage.cycles)
    assignPresent(result, 'origin_cycles', usage.cycles)
  }
  return result
}

// Meter values are intentionally excluded: usage changes must append a reading.
export function adaptItemPatchToSql(values = {}) {
  return adaptIdentity(values, { patch: true })
}

export function adaptSqlItem(item = {}) {
  const measurements = Array.isArray(item.usage_dimensions)
    ? [...new Set(item.usage_dimensions.map(fromSqlUsageDimension).filter(Boolean))]
    : []
  const selectedMeasurements = new Set(measurements)
  const currentUsage = {}
  const miles = item.effective_current_mileage ?? item.current_mileage
  const hours = item.effective_current_hours ?? item.current_hours
  const cycles = item.effective_current_cycles ?? item.current_cycles
  if (selectedMeasurements.has('miles') && miles != null) currentUsage.miles = Number(miles)
  if (selectedMeasurements.has('hours') && hours != null) currentUsage.hours = Number(hours)
  if (selectedMeasurements.has('cycles') && cycles != null) currentUsage.cycles = Number(cycles)
  return {
    ...item,
    category: fromSqlItemType(item.item_type || item.category),
    itemType: toSqlItemType(item.item_type || item.category),
    measurements,
    currentUsage,
  }
}
