const VIN_LENGTH = 17
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/
const NORTH_AMERICAN_WMI = /^[1-5]/
const TRANSLITERATION = Object.freeze({
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
})
const WEIGHTS = Object.freeze([8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2])

// Projects use an unbounded text column; 256 matches the shared request cap.
// My Stuff V2 has an explicit 64-character database constraint.
export const VIN_IDENTIFIER_MAX_LENGTHS = Object.freeze({ project: 256, my_stuff_item: 64 })

export const VIN_SUGGESTION_FIELDS = Object.freeze([
  'year', 'make', 'model', 'trim', 'series', 'bodyStyle', 'vehicleType', 'manufacturer',
  'plantName', 'plantCountry', 'vehicleMarket', 'fuelType', 'engineCylinders',
  'engineDisplacementLiters', 'engineModel', 'transmission', 'drivetrain',
  // Legacy fields stay accepted for existing Project and V2 callers.
  'engine', 'bodyClass', 'title', 'name', 'category', 'itemType',
])

export const VIN_CONFIRMATION_PERSISTENCE_FIELDS = Object.freeze([
  'vin', 'year', 'manufacturer', 'make', 'model', 'trim', 'engine', 'engineModel',
  'engineDisplacementLiters', 'engineCylinders', 'transmission', 'drivetrain', 'fuelType',
  'vehicleType', 'bodyStyle', 'plantName', 'plantCountry', 'vehicleMarket',
])

export function normalizeVin(input) {
  return String(input ?? '').trim().toUpperCase().replace(/[ -]/g, '')
}

export function validateVinIdentifier(input, subjectType) {
  const maxLength = VIN_IDENTIFIER_MAX_LENGTHS[subjectType]
  if (!maxLength) return { ok: false, maxLength: 0, reason: 'Choose a supported VIN destination.' }
  const value = String(input ?? '')
  return value.length <= maxLength
    ? { ok: true, maxLength, reason: null }
    : { ok: false, maxLength, reason: `VIN / identifier must be ${maxLength} characters or fewer.` }
}

export function createVinDecodeRequestGate() {
  let generation = 0
  let activeController = null
  return {
    begin(vin) {
      activeController?.abort()
      const request = { generation: ++generation, normalizedVin: normalizeVin(vin), controller: new AbortController() }
      activeController = request.controller
      return request
    },
    invalidate() {
      generation += 1
      activeController?.abort()
      activeController = null
    },
    isCurrent(request, vin) {
      return request?.generation === generation
        && request.normalizedVin === normalizeVin(vin)
        && request.controller.signal.aborted === false
    },
    finish(request) {
      if (request?.generation !== generation) return false
      activeController = null
      return true
    },
  }
}

export function isVinCheckDigitApplicable(input, context = {}) {
  const vin = normalizeVin(input)
  if (vin.length !== VIN_LENGTH) return false
  const explicitApplicability = context.checkDigitApplicable ?? context.decoder?.checkDigitApplicable
  if (typeof explicitApplicability === 'boolean') return explicitApplicability
  const market = String(context.market ?? context.decoder?.market ?? '').trim().toUpperCase()
  if (market === 'US' || market === 'USA' || market === 'UNITED STATES') return true
  return NORTH_AMERICAN_WMI.test(vin)
}

export function calculateVinCheckDigit(input) {
  const vin = normalizeVin(input)
  if (vin.length !== VIN_LENGTH || /[^A-Z0-9]/.test(vin) || /[IOQ]/.test(vin)) return null
  let total = 0
  for (let index = 0; index < VIN_LENGTH; index += 1) {
    const character = vin[index]
    const value = /\d/.test(character) ? Number(character) : TRANSLITERATION[character]
    if (value == null) return null
    total += value * WEIGHTS[index]
  }
  const remainder = total % 11
  return remainder === 10 ? 'X' : String(remainder)
}

export function validateVin(input, context = {}) {
  const normalized = normalizeVin(input)
  if (!normalized) {
    return { normalized, kind: 'manual', valid: false, canDecode: false, checkDigitApplicable: false, checkDigitValid: null, reason: 'Enter a VIN or identifier.' }
  }

  if (normalized.length !== VIN_LENGTH) {
    return {
      normalized, kind: 'manual', valid: true, canDecode: false,
      checkDigitApplicable: false, checkDigitValid: null,
      reason: 'Older or nonstandard identifiers are kept for manual entry and cannot be automatically decoded.',
    }
  }

  if (/[IOQ]/.test(normalized)) {
    return {
      normalized, kind: 'standard', valid: false, canDecode: false,
      checkDigitApplicable: isVinCheckDigitApplicable(normalized, context), checkDigitValid: null,
      reason: 'A standard VIN cannot contain I, O, or Q.',
    }
  }
  if (!VIN_PATTERN.test(normalized)) {
    return {
      normalized, kind: 'standard', valid: false, canDecode: false,
      checkDigitApplicable: isVinCheckDigitApplicable(normalized, context), checkDigitValid: null,
      reason: 'A standard VIN must contain exactly 17 letters and numbers.',
    }
  }

  const checkDigitApplicable = isVinCheckDigitApplicable(normalized, context)
  const checkDigitValid = checkDigitApplicable ? calculateVinCheckDigit(normalized) === normalized[8] : null
  return {
    normalized,
    kind: 'standard',
    valid: checkDigitValid !== false,
    canDecode: checkDigitValid !== false,
    checkDigitApplicable,
    checkDigitValid,
    reason: checkDigitValid === false ? 'VIN check digit does not match.' : null,
  }
}

export function maskVin(input, visibleCharacters = 4) {
  const normalized = normalizeVin(input)
  if (!normalized) return ''
  if (normalized.length === 1) return '•'
  const requested = Number.isInteger(visibleCharacters) ? visibleCharacters : 4
  const visible = Math.max(1, Math.min(requested, normalized.length - 1))
  return `${'•'.repeat(normalized.length - visible)}${normalized.slice(-visible)}`
}

function isBlank(value) {
  return value == null || (typeof value === 'string' && value.trim() === '')
}

function equivalent(left, right) {
  return String(left).trim().toLocaleLowerCase() === String(right).trim().toLocaleLowerCase()
}

function clone(value) {
  if (value == null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(clone)
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)]))
}

export function mergeDecodedSuggestions(existing = {}, decoded = {}) {
  const values = clone(existing)
  const fields = {}
  for (const field of VIN_SUGGESTION_FIELDS) {
    const current = existing[field]
    const suggestion = decoded[field]
    if (isBlank(suggestion)) {
      if (!isBlank(current)) fields[field] = { status: 'user_confirmed', existing: clone(current) }
      continue
    }
    if (isBlank(current)) {
      values[field] = clone(suggestion)
      fields[field] = { status: 'suggested', suggestion: clone(suggestion) }
    } else if (equivalent(current, suggestion)) {
      fields[field] = { status: 'verified', existing: clone(current), suggestion: clone(suggestion) }
    } else {
      fields[field] = { status: 'conflicting', existing: clone(current), suggestion: clone(suggestion) }
    }
  }
  return { values, fields }
}

export function decodedVehicleSuggestions(vehicle = {}) {
  const typedYear = Number(vehicle.modelYear)
  const typedCylinders = Number(vehicle.engineCylinders)
  const typedDisplacement = Number(vehicle.displacementLiters)
  const engineParts = [
    Number.isFinite(typedDisplacement) ? `${typedDisplacement}L` : null,
    Number.isFinite(typedCylinders) ? `${typedCylinders} cylinders` : null,
  ].filter(Boolean)
  const mapped = {
    year: Number.isInteger(typedYear) ? typedYear : vehicle.modelYear,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim,
    series: vehicle.series,
    bodyStyle: vehicle.bodyClass,
    bodyClass: vehicle.bodyClass,
    vehicleType: vehicle.vehicleType,
    manufacturer: vehicle.manufacturer,
    plantName: vehicle.plantName,
    plantCountry: vehicle.plantCountry,
    vehicleMarket: vehicle.vehicleMarket,
    fuelType: vehicle.fuelTypePrimary,
    engineCylinders: Number.isFinite(typedCylinders) ? typedCylinders : vehicle.engineCylinders,
    engineDisplacementLiters: Number.isFinite(typedDisplacement) ? typedDisplacement : vehicle.displacementLiters,
    engineModel: vehicle.engineModel,
    // Keep the released Project/V2 compatibility projection while retaining
    // each typed field independently for V3 confirmation and research.
    engine: engineParts.length ? engineParts.join(' · ') : vehicle.engineModel,
    transmission: vehicle.transmissionStyle,
    drivetrain: vehicle.driveType,
  }
  return Object.fromEntries(Object.entries(mapped).filter(([, value]) => !isBlank(value)))
}

export function buildVehicleConfirmationSnapshot(values = {}, previewFields = {}) {
  const merged = applyVinSuggestions(values, previewFields, { mode: 'fill_blanks' })
  merged.vin = normalizeVin(values.vin)
  const snapshot = {}
  for (const field of VIN_CONFIRMATION_PERSISTENCE_FIELDS) {
    const value = merged[field]
    if (!isBlank(value)) snapshot[field] = clone(value)
  }
  return snapshot
}

export function applyVinSuggestions(existing = {}, previewFields = {}, { mode = 'selected', fields = [] } = {}) {
  const result = clone(existing)
  const selected = new Set(fields)
  for (const [field, preview] of Object.entries(previewFields)) {
    if (!preview || !Object.prototype.hasOwnProperty.call(preview, 'suggestion')) continue
    if (mode === 'fill_blanks') {
      if (preview.status === 'suggested' && isBlank(existing[field])) result[field] = clone(preview.suggestion)
    } else if (selected.has(field)) result[field] = clone(preview.suggestion)
  }
  return result
}
