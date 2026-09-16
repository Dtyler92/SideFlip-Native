import { normalizeVin } from '../domain/myStuff/vinModel.js'

const ENDPOINT = 'https://sideflip.org/api/decode-vin'
const expoFetch = (...args) => import('expo/fetch').then(module => module.fetch(...args))
const MAX_RAW_VIN_LENGTH = 256
const MAX_RESPONSE_BYTES = 64 * 1024
const VEHICLE_TEXT_FIELDS = new Set([
  'make', 'model', 'trim', 'bodyClass', 'vehicleType', 'manufacturer', 'plantCountry',
  'fuelTypePrimary', 'driveType', 'transmissionStyle',
])
const VEHICLE_NUMBER_FIELDS = Object.freeze({
  modelYear: value => Number.isInteger(value) && value >= 1881 && value <= 2200,
  engineCylinders: value => Number.isInteger(value) && value >= 1 && value <= 32,
  displacementLiters: value => value >= 0.1 && value <= 30,
})
const SUBJECT_VALUES = new Set(['project', 'my_stuff_item'])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const VIN_SUBJECT_TYPES = Object.freeze({ project: 'project', myStuffItem: 'my_stuff_item' })

export class VinDecodeError extends Error {
  constructor(message, { code = 'DECODE_FAILED', retryable = false, proRequired = false } = {}) {
    super(message)
    this.name = 'VinDecodeError'
    this.code = code
    this.retryable = Boolean(retryable)
    this.proRequired = Boolean(proRequired)
    this.manualEntry = true
  }
}

function utf8ByteLength(value) {
  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xD800 && code <= 0xDBFF && index + 1 < value.length && value.charCodeAt(index + 1) >= 0xDC00 && value.charCodeAt(index + 1) <= 0xDFFF) { bytes += 4; index += 1 }
    else bytes += 3
  }
  return bytes
}

function safeMessage(value, fallback) {
  if (typeof value !== 'string') return fallback
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return clean ? clean.slice(0, 240) : fallback
}

function validateVehicle(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const vehicle = {}
  for (const [key, entry] of Object.entries(value)) {
    if (VEHICLE_TEXT_FIELDS.has(key)) {
      if (typeof entry !== 'string') return null
      const clean = safeMessage(entry, '')
      if (!clean || clean !== entry || clean.length > 160) return null
      vehicle[key] = clean
    } else if (Object.hasOwn(VEHICLE_NUMBER_FIELDS, key)) {
      if (typeof entry !== 'number' || !Number.isFinite(entry) || !VEHICLE_NUMBER_FIELDS[key](entry)) return null
      vehicle[key] = entry
    } else return null
  }
  return Object.keys(vehicle).length ? vehicle : null
}

function validateNotices(value) {
  if (!Array.isArray(value) || value.length > 20) return null
  const notices = []
  for (const notice of value) {
    if (!notice || typeof notice !== 'object' || Array.isArray(notice)) return null
    const code = typeof notice.code === 'string' && /^\d{1,3}$/.test(notice.code) ? notice.code : null
    const message = safeMessage(notice.message, '')
    if (!code || !message) return null
    notices.push({ code, message })
  }
  return notices
}

async function readBoundedJson(response, maxBytes, abort) {
  const invalid = async reader => {
    try { await reader?.cancel?.() } catch { /* cancellation is best effort */ }
    abort()
    throw new VinDecodeError('VIN decoding returned an invalid response. Use manual entry.', { code: 'INVALID_RESPONSE', retryable: true })
  }
  const rawLength = response?.headers?.get?.('content-length')
  const declared = typeof rawLength === 'string' && /^\d+$/.test(rawLength.trim()) ? Number(rawLength) : null
  if (declared != null && (!Number.isSafeInteger(declared) || declared > maxBytes)) await invalid()

  let text
  if (response?.body?.getReader) {
    const reader = response.body.getReader()
    const chunks = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value || !Number.isSafeInteger(value.byteLength)) await invalid(reader)
      total += value.byteLength
      if (!Number.isSafeInteger(total) || total > maxBytes) await invalid(reader)
      chunks.push(value instanceof Uint8Array ? value : new Uint8Array(value.buffer, value.byteOffset || 0, value.byteLength))
    }
    if (typeof TextDecoder !== 'function') await invalid(reader)
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { await invalid(reader) }
  } else {
    // React Native's fetch does not consistently expose ReadableStream. Only
    // materialize a fallback body when HTTP framing declared a safe bound.
    if (declared == null || typeof response?.text !== 'function') await invalid()
    text = await response.text()
    if (typeof text !== 'string' || utf8ByteLength(text) > maxBytes) await invalid()
  }
  try { return JSON.parse(text) } catch {
    throw new VinDecodeError('VIN decoding returned an invalid response. Use manual entry.', { code: 'INVALID_RESPONSE', retryable: true })
  }
}

function errorFromResponse(status, body) {
  const code = typeof body?.code === 'string' && /^[A-Z0-9_]{1,50}$/.test(body.code) ? body.code : 'DECODE_FAILED'
  return new VinDecodeError(safeMessage(body?.error, 'VIN decoding failed. Use manual entry or try again.'), {
    code,
    retryable: body?.retryable === true,
    proRequired: status === 403 || code === 'PRO_REQUIRED',
  })
}

export function createVinDecodeClient({ auth, fetchImpl = expoFetch, timeoutMs = 10_000, maxResponseBytes = MAX_RESPONSE_BYTES } = {}) {
  if (!auth?.getSession) throw new TypeError('VIN decode auth adapter is required.')
  return {
    async decode({ subjectType, subjectId, vin, signal }) {
      if (!SUBJECT_VALUES.has(subjectType)) throw new VinDecodeError('Choose a supported VIN destination.', { code: 'SUBJECT_TYPE_INVALID' })
      if (subjectId !== null && (typeof subjectId !== 'string' || !UUID_PATTERN.test(subjectId))) throw new VinDecodeError('The selected item is invalid.', { code: 'SUBJECT_ID_INVALID' })
      if (typeof vin !== 'string' || utf8ByteLength(vin) > MAX_RAW_VIN_LENGTH) {
        throw new VinDecodeError('The VIN input is too large. Use manual entry.', { code: 'VIN_INPUT_TOO_LARGE' })
      }
      const normalized = normalizeVin(vin)
      let sessionResult
      try { sessionResult = await auth.getSession() } catch {
        throw new VinDecodeError('Please sign in again. Manual entry is still available.', { code: 'AUTH_REQUIRED' })
      }
      const { data, error } = sessionResult || {}
      const token = data?.session?.access_token
      if (error || !token) throw new VinDecodeError('Please sign in again. Manual entry is still available.', { code: 'AUTH_REQUIRED' })

      const controller = new AbortController()
      const abortFromCaller = () => controller.abort()
      if (signal?.aborted) controller.abort()
      else signal?.addEventListener?.('abort', abortFromCaller, { once: true })
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      let response
      let body
      try {
        response = await fetchImpl(ENDPOINT, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ subjectType, subjectId, vin: normalized }),
        })
        body = await readBoundedJson(response, maxResponseBytes, () => controller.abort())
      } catch (errorValue) {
        if (errorValue instanceof VinDecodeError) throw errorValue
        const abortedByCaller = signal?.aborted === true
        const timedOut = errorValue?.name === 'AbortError'
        throw new VinDecodeError(abortedByCaller ? 'VIN decoding was cancelled.' : timedOut ? 'VIN decoding timed out. Use manual entry or try again.' : 'VIN decoding is unavailable. Use manual entry or try again.', {
          code: abortedByCaller ? 'DECODE_CANCELLED' : timedOut ? 'DECODE_TIMEOUT' : 'NETWORK_UNAVAILABLE', retryable: !abortedByCaller,
        })
      } finally {
        clearTimeout(timeout)
        signal?.removeEventListener?.('abort', abortFromCaller)
      }

      if (!response.ok) throw errorFromResponse(response.status, body)
      const vehicle = validateVehicle(body?.vehicle)
      const warnings = validateNotices(body?.nhtsaWarnings)
      const errors = validateNotices(body?.nhtsaErrors)
      if (body?.subjectType !== subjectType || body?.subjectId !== subjectId || !vehicle || !warnings || !errors || errors.length) {
        throw new VinDecodeError('VIN decoding returned an invalid response. Use manual entry.', { code: 'INVALID_RESPONSE', retryable: true })
      }
      return {
        subjectType,
        subjectId,
        vehicle,
        nhtsaWarnings: warnings,
        cached: body.cached === true,
        requestId: typeof body.requestId === 'string' ? body.requestId.slice(0, 80) : null,
      }
    },
  }
}
