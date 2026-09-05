import { decodedVehicleSuggestions } from './myStuff/vinModel.js'

const EMPTY_PROJECT_VEHICLE_DETAILS = { vin:'', year:'', make:'', model:'', engine:'' }
const PROJECT_VEHICLE_DETAIL_FIELDS = ['vin','year','make','model','engine','transmission']

function compact(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function generatedVehicleName(vehicle = {}) {
  return [vehicle.modelYear, compact(vehicle.make), compact(vehicle.model)].filter(Boolean).join(' ')
}

function classifyVehicle(vehicle = {}) {
  const vehicleType = compact(vehicle.vehicleType)?.toUpperCase() || ''
  const bodyClass = compact(vehicle.bodyClass)?.toUpperCase() || ''
  const description = `${vehicleType} ${bodyClass}`

  if (/ALL[- ]TERRAIN|\bATV\b/.test(description)) return { projectCategory: 'atv', itemType: 'atv', itemCategory: 'recreation' }
  if (/MOTORCYCLE/.test(vehicleType)) return { projectCategory: 'motorcycle', itemType: 'motorcycle', itemCategory: 'motorcycle' }
  if (/\bTRUCK\b/.test(vehicleType) || /PICKUP/.test(bodyClass)) return { projectCategory: 'car', itemType: 'truck', itemCategory: 'vehicle' }
  if (/PASSENGER CAR|MULTIPURPOSE PASSENGER VEHICLE/.test(vehicleType)) return { projectCategory: 'car', itemType: 'car', itemCategory: 'vehicle' }
  return null
}

export function buildProjectVinCreateSuggestions(vehicle = {}) {
  const decoded = decodedVehicleSuggestions(vehicle)
  const classification = classifyVehicle(vehicle)
  const title = generatedVehicleName(vehicle)
  return {
    ...Object.fromEntries(Object.entries({ year: decoded.year, make: decoded.make, model: decoded.model, engine: decoded.engine }).filter(([, value]) => value != null && value !== '')),
    ...(title ? { title } : {}),
    ...(classification ? { category: classification.projectCategory } : {}),
  }
}

export function buildMyStuffVinCreateSuggestions(vehicle = {}) {
  const decoded = decodedVehicleSuggestions(vehicle)
  const classification = classifyVehicle(vehicle)
  const name = generatedVehicleName(vehicle)
  const supported = Object.fromEntries(Object.entries(decoded).filter(([field]) => field !== 'bodyClass'))
  return {
    ...supported,
    ...(name ? { name } : {}),
    ...(classification ? { itemType: classification.itemType, category: classification.itemCategory } : {}),
  }
}

export function buildProjectCreatePersistence(values = {}) {
  const yearText = compact(values.year)
  const numericYear = yearText == null ? null : Number(yearText)
  return {
    vin: compact(values.vin),
    vehicle_year: Number.isInteger(numericYear) ? numericYear : null,
    vehicle_make: compact(values.make),
    vehicle_model: compact(values.model),
    engine_model: compact(values.engine),
  }
}

export function vehicleDetailsAfterCategoryChange(values = {}, isVehicleCategory = false) {
  return isVehicleCategory ? { ...values } : { ...EMPTY_PROJECT_VEHICLE_DETAILS }
}

export function hasProjectVehicleDetailsChanged(submitted = {}, current = {}) {
  return PROJECT_VEHICLE_DETAIL_FIELDS.some(field => String(submitted[field] ?? '') !== String(current[field] ?? ''))
}
