import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  VIN_SUBJECT_TYPES,
  createVinDecodeClient,
} from '../src/lib/vinDecodeClient.js'
import {
  applyVinSuggestions,
  createVinDecodeRequestGate,
  decodedVehicleSuggestions,
  mergeDecodedSuggestions,
  validateVinIdentifier,
  VIN_IDENTIFIER_MAX_LENGTHS,
} from '../src/domain/myStuff/vinModel.js'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const ITEM_ID = '22222222-2222-4222-8222-222222222222'
const VIN = '1HGCM82633A004352'
const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

function response(body, { status = 200, headers = {} } = {}) {
  const text = JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => headers[name.toLowerCase()] ?? (name.toLowerCase() === 'content-length' ? String(Buffer.byteLength(text)) : null) },
    text: async () => text,
  }
}

function streamedResponse(chunks, { status = 200 } = {}) {
  let index = 0
  let cancelled = false
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    body: { getReader: () => ({
      read: async () => index < chunks.length ? { done: false, value: chunks[index++] } : { done: true },
      cancel: async () => { cancelled = true },
    }) },
    wasCancelled: () => cancelled,
  }
}

function clientHarness({ responseValue, token = 'access-token' } = {}) {
  const calls = []
  const client = createVinDecodeClient({
    auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null }, error: null }) },
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      return responseValue || response({
        subjectType: 'project', subjectId: PROJECT_ID, requestId: 'request-1', cached: false,
        vehicle: { modelYear: 2003, make: 'HONDA', model: 'Accord' }, nhtsaWarnings: [], nhtsaErrors: [],
      })
    },
    timeoutMs: 1_000,
  })
  return { client, calls }
}

test('shared client posts normalized VIN with exact backend subject contracts and bearer auth', async () => {
  assert.deepEqual(VIN_SUBJECT_TYPES, { project: 'project', myStuffItem: 'my_stuff_item' })
  for (const [subjectType, subjectId] of [['project', PROJECT_ID], ['my_stuff_item', ITEM_ID]]) {
    const { client, calls } = clientHarness({
      responseValue: response({ subjectType, subjectId, requestId: 'request-1', cached: false, vehicle: { make: 'HONDA' }, nhtsaWarnings: [], nhtsaErrors: [] }),
    })
    const result = await client.decode({ subjectType, subjectId, vin: ' 1hg-cm826 33a004352 ' })
    assert.equal(result.vehicle.make, 'HONDA')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://sideflip.org/api/decode-vin')
    assert.equal(calls[0].options.method, 'POST')
    assert.equal(calls[0].options.headers.Authorization, 'Bearer access-token')
    assert.deepEqual(JSON.parse(calls[0].options.body), { subjectType, subjectId, vin: VIN })
  }
})

test('pre-save decode permits only an explicit null subject and validates echoed null exactly', async () => {
  for (const subjectType of ['project', 'my_stuff_item']) {
    const { client, calls } = clientHarness({
      responseValue: response({ subjectType, subjectId: null, vehicle: { make: 'HONDA' }, nhtsaWarnings: [], nhtsaErrors: [] }),
    })
    const result = await client.decode({ subjectType, subjectId: null, vin: VIN })
    assert.equal(result.subjectId, null)
    assert.deepEqual(JSON.parse(calls[0].options.body), { subjectType, subjectId: null, vin: VIN })
  }

  const { client } = clientHarness({ responseValue: response({ subjectType: 'project', subjectId: PROJECT_ID, vehicle: { make: 'HONDA' }, nhtsaWarnings: [], nhtsaErrors: [] }) })
  await assert.rejects(client.decode({ subjectType: 'project', subjectId: null, vin: VIN }), error => error.code === 'INVALID_RESPONSE')
  await assert.rejects(client.decode({ subjectType: 'project', vin: VIN }), error => error.code === 'SUBJECT_ID_INVALID')
  await assert.rejects(client.decode({ subjectType: 'project', subjectId: 'not-a-uuid', vin: VIN }), error => error.code === 'SUBJECT_ID_INVALID')
})

test('client fails closed without auth and for Pro denial while preserving manual fallback', async () => {
  const signedOut = clientHarness({ token: '' })
  await assert.rejects(signedOut.client.decode({ subjectType: 'project', subjectId: PROJECT_ID, vin: VIN }), error => {
    assert.equal(error.code, 'AUTH_REQUIRED')
    assert.equal(error.manualEntry, true)
    return true
  })
  assert.equal(signedOut.calls.length, 0)

  const denied = clientHarness({ responseValue: response({ error: 'SideFlip Pro is required.', code: 'PRO_REQUIRED', manualEntry: true }, { status: 403 }) })
  await assert.rejects(denied.client.decode({ subjectType: 'project', subjectId: PROJECT_ID, vin: VIN }), error => {
    assert.equal(error.code, 'PRO_REQUIRED')
    assert.equal(error.proRequired, true)
    assert.equal(error.manualEntry, true)
    return true
  })
})

test('client bounds request/response shapes and rejects mismatched ownership context', async () => {
  const { client } = clientHarness()
  await assert.rejects(client.decode({ subjectType: 'project', subjectId: PROJECT_ID, vin: 'x'.repeat(300) }), /too large/i)
  await assert.rejects(createVinDecodeClient({
    auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) },
    fetchImpl: async () => response({ subjectType: 'my_stuff_item', subjectId: ITEM_ID, vehicle: { make: 'HONDA' }, nhtsaWarnings: [], nhtsaErrors: [] }),
  }).decode({ subjectType: 'project', subjectId: PROJECT_ID, vin: VIN }), error => error.code === 'INVALID_RESPONSE' && error.manualEntry)
  await assert.rejects(createVinDecodeClient({
    auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) },
    fetchImpl: async () => response({ subjectType: 'project', subjectId: PROJECT_ID, vehicle: { make: 'x'.repeat(500) }, nhtsaWarnings: [], nhtsaErrors: [] }),
  }).decode({ subjectType: 'project', subjectId: PROJECT_ID, vin: VIN }), error => error.code === 'INVALID_RESPONSE')
})

test('client incrementally bounds chunked responses and aborts the request before materializing an oversized body', async () => {
  const chunked = streamedResponse([new Uint8Array(40_000), new Uint8Array(30_000)])
  let requestSignal
  const client = createVinDecodeClient({
    auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) },
    fetchImpl: async (_url, options) => { requestSignal = options.signal; return chunked },
  })
  await assert.rejects(client.decode({ subjectType: 'project', subjectId: PROJECT_ID, vin: VIN }), error => error.code === 'INVALID_RESPONSE')
  assert.equal(chunked.wasCancelled(), true)
  assert.equal(requestSignal.aborted, true)
})

test('client fails closed without a stream or declared bound and never calls response.text', async () => {
  let textCalled = false
  const client = createVinDecodeClient({
    auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) },
    fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => { textCalled = true; return '{}'.repeat(100_000) } }),
  })
  await assert.rejects(client.decode({ subjectType: 'project', subjectId: PROJECT_ID, vin: VIN }), error => error.code === 'INVALID_RESPONSE')
  assert.equal(textCalled, false)
})

test('VIN identifier bounds match each persistence subject and reject over-limit saves', () => {
  assert.deepEqual(VIN_IDENTIFIER_MAX_LENGTHS, { project: 256, my_stuff_item: 64 })
  assert.equal(validateVinIdentifier('x'.repeat(256), 'project').ok, true)
  assert.equal(validateVinIdentifier('x'.repeat(257), 'project').ok, false)
  assert.equal(validateVinIdentifier('x'.repeat(64), 'my_stuff_item').ok, true)
  assert.equal(validateVinIdentifier('x'.repeat(65), 'my_stuff_item').ok, false)

  const project = source('src/screens/ProjectDetailScreen.js')
  const item = source('src/screens/MyStuffDetailScreen.js')
  const panel = source('src/components/VinDecodePanel.js')
  assert.match(project, /validateVinIdentifier\((?:vehicleDetails|details)\.vin,'project'\)/)
  assert.match(item, /validateItemDraft\(validatedEdit\)/)
  assert.match(panel, /maxLength=\{identifierMaxLength\}/)
})

test('editing during decode aborts and invalidates the stale generation before it can publish or apply', () => {
  const gate = createVinDecodeRequestGate()
  const first = gate.begin(VIN)
  assert.equal(gate.isCurrent(first, VIN), true)
  gate.invalidate()
  assert.equal(first.controller.signal.aborted, true)
  assert.equal(gate.isCurrent(first, VIN), false)

  const second = gate.begin('2HGES16555H000001')
  assert.equal(gate.isCurrent(second, '2hges16555h000001'), true)
  assert.equal(gate.isCurrent(first, '2HGES16555H000001'), false)
})

test('network/provider failures expose bounded safe messages and always leave manual entry available', async () => {
  const unavailable = createVinDecodeClient({
    auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) },
    fetchImpl: async () => { throw new Error(`network failed for ${VIN}`) },
    timeoutMs: 1_000,
  })
  await assert.rejects(unavailable.decode({ subjectType: 'project', subjectId: PROJECT_ID, vin: VIN }), error => {
    assert.equal(error.code, 'NETWORK_UNAVAILABLE')
    assert.equal(error.manualEntry, true)
    assert.doesNotMatch(error.message, new RegExp(VIN))
    return true
  })

  const provider = clientHarness({ responseValue: response({ error: 'NHTSA unavailable. Use manual entry.', code: 'NHTSA_UNAVAILABLE', retryable: true, manualEntry: true }, { status: 503 }) })
  await assert.rejects(provider.client.decode({ subjectType: 'project', subjectId: PROJECT_ID, vin: VIN }), error => {
    assert.equal(error.code, 'NHTSA_UNAVAILABLE')
    assert.equal(error.retryable, true)
    assert.equal(error.manualEntry, true)
    return true
  })
})

test('decoded vehicle mapping previews blank suggestions and conflicts until explicit apply', () => {
  const suggestions = decodedVehicleSuggestions({
    modelYear: 2003, make: 'HONDA', model: 'Accord', trim: 'EX', engineCylinders: 6,
    displacementLiters: 3, transmissionStyle: 'Automatic', driveType: '4x2', fuelTypePrimary: 'Gasoline', bodyClass: 'Sedan',
  })
  assert.deepEqual(suggestions, {
    year: 2003, make: 'HONDA', model: 'Accord', trim: 'EX', engine: '3L · 6 cylinders',
    engineCylinders: 6, engineDisplacementLiters: 3,
    transmission: 'Automatic', drivetrain: '4x2', fuelType: 'Gasoline', bodyClass: 'Sedan', bodyStyle: 'Sedan',
  })
  const existing = { year: '2003', make: 'Honda', model: '', trim: 'LX', notes: 'keep' }
  const preview = mergeDecodedSuggestions(existing, suggestions)
  assert.equal(preview.values.model, 'Accord')
  assert.equal(preview.values.trim, 'LX')
  assert.equal(preview.fields.trim.status, 'conflicting')
  assert.deepEqual(applyVinSuggestions(existing, preview.fields, { mode: 'fill_blanks' }), { ...existing, model: 'Accord', engine: '3L · 6 cylinders', engineCylinders: 6, engineDisplacementLiters: 3, transmission: 'Automatic', drivetrain: '4x2', fuelType: 'Gasoline', bodyClass: 'Sedan', bodyStyle: 'Sedan' })
  assert.deepEqual(applyVinSuggestions(existing, preview.fields, { fields: ['trim'] }), { ...existing, trim: 'EX' })
})

test('both detail screens expose Pro-gated reachable decode, preview/apply, and manual-save paths without sensitive analytics', () => {
  const project = source('src/screens/ProjectDetailScreen.js')
  const item = source('src/screens/MyStuffDetailScreen.js')
  const component = source('src/components/VinDecodePanel.js')
  for (const [screen, subjectType] of [[project, 'project'], [item, 'my_stuff_item']]) {
    const reachable = `${screen}\n${component}`
    assert.match(reachable, /Decode VIN/)
    assert.match(reachable, /Fill Blank Fields/)
    assert.match(screen, /Save (?:Vehicle|Item) Details/)
    assert.match(screen, new RegExp(`subjectType="${subjectType}"`))
    assert.match(screen, /navigation\.navigate\('Pro'\)/)
    assert.match(screen, /keyboardShouldPersistTaps="handled"/)
    assert.doesNotMatch(reachable, /captureEvent\([^\n]*\bvin\b/i)
  }
  const featureList = source('src/components/ProFeatureList.js')
  assert.match(featureList, /title: 'VIN Decoder'/)
  assert.doesNotMatch(featureList, /title: 'VIN Decoder'[^\n]*comingSoon: true/)
})
