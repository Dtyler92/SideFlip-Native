const ENDPOINT = 'https://sideflip.org/api/report-data'
const MAX_RESPONSE_BYTES = 128 * 1024
const SUBJECT_VALUES = new Set(['project', 'my_stuff_item'])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const OPTION_KEYS = ['includeIdentifiers', 'includeDetailedCosts']
const expoFetch = (...args) => import('expo/fetch').then(module => module.fetch(...args))

export const REPORT_SUBJECT_TYPES = Object.freeze({ project: 'project', myStuffItem: 'my_stuff_item' })
export const REPORT_DISCLAIMER = 'Prepared by the owner from SideFlip records. Verify details independently before relying on this private report.'

const SAFE_ERRORS = Object.freeze({
  AUTH_REQUIRED: 'Please sign in again to create a report.',
  PRO_REQUIRED: 'SideFlip Pro is required to create reports.',
  ACCOUNT_DELETED: 'This account is unavailable.',
  SUBJECT_NOT_FOUND: 'This item is no longer available.',
  REQUEST_TOO_LARGE: 'The report request is too large.',
  RESPONSE_TOO_LARGE: 'This report contains too much data to create safely.',
  PRIVATE_MEDIA_UNAVAILABLE: 'Private photos or documents are not available for this report.',
  SERVICE_UNAVAILABLE: 'Report data is temporarily unavailable. Try again later.',
})

export class ReportDataError extends Error {
  constructor(message, { code = 'REPORT_FAILED', retryable = false, proRequired = false } = {}) {
    super(message)
    this.name = 'ReportDataError'
    this.code = code
    this.retryable = Boolean(retryable)
    this.proRequired = Boolean(proRequired)
  }
}

function invalidResponse() {
  return new ReportDataError('The report service returned an invalid response. Try again later.', { code: 'INVALID_RESPONSE', retryable: true })
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

async function readBoundedJson(response, maxBytes, abort) {
  const reject = async reader => {
    try { await reader?.cancel?.() } catch { /* best effort */ }
    abort()
    throw invalidResponse()
  }
  const rawLength = response?.headers?.get?.('content-length')
  const declared = typeof rawLength === 'string' && /^\d+$/.test(rawLength.trim()) ? Number(rawLength) : null
  if (declared != null && (!Number.isSafeInteger(declared) || declared > maxBytes)) await reject()

  let text
  if (response?.body?.getReader) {
    const reader = response.body.getReader()
    const chunks = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value || !Number.isSafeInteger(value.byteLength)) await reject(reader)
      total += value.byteLength
      if (!Number.isSafeInteger(total) || total > maxBytes) await reject(reader)
      chunks.push(value instanceof Uint8Array ? value : new Uint8Array(value.buffer, value.byteOffset || 0, value.byteLength))
    }
    if (typeof TextDecoder !== 'function') await reject(reader)
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { await reject(reader) }
  } else {
    if (declared == null || typeof response?.text !== 'function') await reject()
    text = await response.text()
    if (typeof text !== 'string' || utf8ByteLength(text) > maxBytes) await reject()
  }
  try { return JSON.parse(text) } catch { throw invalidResponse() }
}

function responseError(status, body) {
  const code = typeof body?.code === 'string' && /^[A-Z0-9_]{1,50}$/.test(body.code) ? body.code : 'REPORT_FAILED'
  const message = SAFE_ERRORS[code] || (status === 401 ? SAFE_ERRORS.AUTH_REQUIRED : status === 403 ? SAFE_ERRORS.PRO_REQUIRED : 'Could not create the report. Try again later.')
  return new ReportDataError(message, {
    code,
    retryable: status >= 500,
    proRequired: status === 403 || code === 'PRO_REQUIRED',
  })
}

function validateCanonicalResponse(body, subjectType, subjectId) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  if (body.schemaVersion !== 1 || body.subjectType !== subjectType || body.subjectId !== subjectId) return null
  if (typeof body.disclaimer !== 'string' || !body.disclaimer.trim() || body.disclaimer.length > 1_000) return null
  if (!body.report || typeof body.report !== 'object' || Array.isArray(body.report)) return null
  return { schemaVersion: 1, subjectType, subjectId, disclaimer: body.disclaimer, report: body.report }
}

export function createReportDataClient({ auth, fetchImpl = expoFetch, timeoutMs = 15_000, maxResponseBytes = MAX_RESPONSE_BYTES } = {}) {
  if (!auth?.getSession) throw new TypeError('Report auth adapter is required.')
  return {
    async load({ subjectType, subjectId, options = {}, signal } = {}) {
      if (!SUBJECT_VALUES.has(subjectType)) throw new ReportDataError('Choose a supported report type.', { code: 'SUBJECT_TYPE_INVALID' })
      if (typeof subjectId !== 'string' || !UUID_PATTERN.test(subjectId)) throw new ReportDataError('The selected item is invalid.', { code: 'SUBJECT_ID_INVALID' })
      let sessionResult
      try { sessionResult = await auth.getSession() } catch { throw new ReportDataError(SAFE_ERRORS.AUTH_REQUIRED, { code: 'AUTH_REQUIRED' }) }
      const token = sessionResult?.data?.session?.access_token
      if (sessionResult?.error || !token) throw new ReportDataError(SAFE_ERRORS.AUTH_REQUIRED, { code: 'AUTH_REQUIRED' })

      const controller = new AbortController()
      let timedOut = false
      const abortFromCaller = () => controller.abort()
      if (signal?.aborted) controller.abort()
      else signal?.addEventListener?.('abort', abortFromCaller, { once: true })
      const timeout = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
      const requestBody = { subjectType, subjectId, disclaimer: REPORT_DISCLAIMER }
      for (const key of OPTION_KEYS) requestBody[key] = options[key] === true
      requestBody.includePhotos = false
      requestBody.includeDocuments = false

      let response
      let body
      try {
        if (controller.signal.aborted) throw Object.assign(new Error('Request aborted'), { name: 'AbortError' })
        response = await fetchImpl(ENDPOINT, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(requestBody),
        })
        body = await readBoundedJson(response, maxResponseBytes, () => controller.abort())
      } catch (error) {
        if (error instanceof ReportDataError) throw error
        const callerCancelled = signal?.aborted === true
        throw new ReportDataError(callerCancelled ? 'Report creation was cancelled.' : timedOut ? 'Report creation timed out. Try again.' : 'Report data is temporarily unavailable. Try again later.', {
          code: callerCancelled ? 'REPORT_CANCELLED' : timedOut ? 'REPORT_TIMEOUT' : 'NETWORK_UNAVAILABLE',
          retryable: !callerCancelled,
        })
      } finally {
        clearTimeout(timeout)
        signal?.removeEventListener?.('abort', abortFromCaller)
      }
      if (!response.ok) throw responseError(response.status, body)
      const result = validateCanonicalResponse(body, subjectType, subjectId)
      if (!result) throw invalidResponse()
      return result
    },
  }
}

export function createReportRequestGate() {
  let generation = 0
  let active = null
  return {
    begin(subjectType) {
      active?.controller.abort()
      const request = { generation: ++generation, subjectType, controller: new AbortController() }
      active = request
      return request
    },
    isCurrent(request) { return active === request && request.generation === generation && !request.controller.signal.aborted },
    finish(request) { if (active !== request) return false; active = null; return true },
    invalidate() { generation += 1; active?.controller.abort(); active = null },
  }
}
