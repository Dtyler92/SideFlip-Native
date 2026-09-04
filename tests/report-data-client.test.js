import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  REPORT_DISCLAIMER,
  REPORT_SUBJECT_TYPES,
  createReportDataClient,
  createReportRequestGate,
} from '../src/lib/reportDataClient.js'
import { createAndShareReportPdf } from '../src/lib/reportPdfAdapter.js'
import { renderCanonicalReportHtml } from '../src/domain/myStuff/reportModel.js'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const ITEM_ID = '22222222-2222-4222-8222-222222222222'
const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

function response(body, { status = 200, headers = {} } = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
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

function canonical(subjectType, subjectId, report = { title: '<Truck>', notes: 'A & B' }) {
  return { schemaVersion: 1, subjectType, subjectId, disclaimer: REPORT_DISCLAIMER, report }
}

function harness({ body, status = 200, token = 'access-token', fetchImpl } = {}) {
  const calls = []
  const client = createReportDataClient({
    auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null }, error: null }) },
    fetchImpl: fetchImpl || (async (url, options) => {
      calls.push({ url, options })
      const request = JSON.parse(options.body)
      return response(body || canonical(request.subjectType, request.subjectId), { status })
    }),
    timeoutMs: 1_000,
  })
  return { client, calls }
}

test('shared authenticated client posts the exact canonical contract for both subjects with private defaults', async () => {
  assert.deepEqual(REPORT_SUBJECT_TYPES, { project: 'project', myStuffItem: 'my_stuff_item' })
  for (const [subjectType, subjectId] of [['project', PROJECT_ID], ['my_stuff_item', ITEM_ID]]) {
    const { client, calls } = harness()
    await client.load({ subjectType, subjectId })
    assert.equal(calls[0].url, 'https://sideflip.org/api/report-data')
    assert.equal(calls[0].options.headers.Authorization, 'Bearer access-token')
    assert.deepEqual(JSON.parse(calls[0].options.body), {
      subjectType,
      subjectId,
      disclaimer: REPORT_DISCLAIMER,
      includeIdentifiers: false,
      includeDetailedCosts: false,
      includePhotos: false,
      includeDocuments: false,
    })
  }
})

test('identifier and cost inclusion require exact boolean opt-ins while unavailable media stays excluded', async () => {
  const { client, calls } = harness()
  await client.load({ subjectType: 'project', subjectId: PROJECT_ID, options: {
    includeIdentifiers: true,
    includeDetailedCosts: true,
    includePhotos: true,
    includeDocuments: true,
    ignored: true,
  } })
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    subjectType: 'project', subjectId: PROJECT_ID, disclaimer: REPORT_DISCLAIMER,
    includeIdentifiers: true, includeDetailedCosts: true, includePhotos: false, includeDocuments: false,
  })
})

test('report and VIN clients select the Expo streaming fetch implementation by default', () => {
  for (const path of ['src/lib/reportDataClient.js', 'src/lib/vinDecodeClient.js']) {
    const clientSource = source(path)
    assert.match(clientSource, /import\('expo\/fetch'\)/)
    assert.match(clientSource, /fetchImpl = expoFetch/)
    assert.doesNotMatch(clientSource, /fetchImpl = fetch(?:[, }])/)
  }
})

test('client maps auth and server failures to bounded safe report errors', async () => {
  const signedOut = harness({ token: '' })
  await assert.rejects(signedOut.client.load({ subjectType: 'project', subjectId: PROJECT_ID }), error => error.code === 'AUTH_REQUIRED' && error.message.length < 250)
  const denied = harness({ status: 403, body: { code: 'PRO_REQUIRED', error: 'SideFlip Pro is required for reports.' } })
  await assert.rejects(denied.client.load({ subjectType: 'project', subjectId: PROJECT_ID }), error => error.code === 'PRO_REQUIRED' && error.proRequired)
  const hostile = harness({ status: 503, body: { code: 'BAD CODE<script>', error: `private ${'x'.repeat(1000)}` } })
  await assert.rejects(hostile.client.load({ subjectType: 'project', subjectId: PROJECT_ID }), error => error.code === 'REPORT_FAILED' && !error.message.includes('private'))
})

test('client incrementally bounds responses, cancels oversized streams, and rejects identity mismatch', async () => {
  const chunked = streamedResponse([new Uint8Array(80_000), new Uint8Array(60_000)])
  let signal
  const oversized = harness({ fetchImpl: async (_url, options) => { signal = options.signal; return chunked } })
  await assert.rejects(oversized.client.load({ subjectType: 'project', subjectId: PROJECT_ID }), error => error.code === 'INVALID_RESPONSE')
  assert.equal(chunked.wasCancelled(), true)
  assert.equal(signal.aborted, true)

  const mismatch = harness({ body: canonical('my_stuff_item', ITEM_ID) })
  await assert.rejects(mismatch.client.load({ subjectType: 'project', subjectId: PROJECT_ID }), error => error.code === 'INVALID_RESPONSE')
})

test('client fails closed without stream framing and timeout/caller abort remain safe', async () => {
  let textCalled = false
  const unbounded = harness({ fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => { textCalled = true; return '{}' } }) })
  await assert.rejects(unbounded.client.load({ subjectType: 'project', subjectId: PROJECT_ID }), error => error.code === 'INVALID_RESPONSE')
  assert.equal(textCalled, false)

  const controller = new AbortController()
  const cancelled = harness({ fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('secret'), { name: 'AbortError' })))
  }) })
  const pending = cancelled.client.load({ subjectType: 'project', subjectId: PROJECT_ID, signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, error => error.code === 'REPORT_CANCELLED')
})

test('request generations abort and reject stale Project and My Stuff results', () => {
  for (const subjectType of ['project', 'my_stuff_item']) {
    const gate = createReportRequestGate()
    const first = gate.begin(subjectType)
    const second = gate.begin(subjectType)
    assert.equal(first.controller.signal.aborted, true)
    assert.equal(gate.isCurrent(first), false)
    assert.equal(gate.isCurrent(second), true)
    gate.invalidate()
    assert.equal(second.controller.signal.aborted, true)
  }
})

test('canonical HTML escapes every server field and includes report date and privacy disclosure', () => {
  const payload = canonical('project', PROJECT_ID, {
    title: '<img src=x onerror=alert(1)>',
    notes: `Owner's & "private"`,
    identifiers: { vin: '••••2345' },
    nested: [{ '<script>': '</style><script>alert(1)</script>' }],
  })
  const html = renderCanonicalReportHtml(payload, { generatedAt: '2026-09-04T12:00:00.000Z' })
  assert.match(html, /September 4, 2026/)
  assert.match(html, /private report/i)
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.match(html, /Owner&#39;s &amp; &quot;private&quot;/)
  assert.doesNotMatch(html, /<script>|<img/)
  assert.doesNotMatch(html, new RegExp(PROJECT_ID))
})

test('PDF adapter deletes its generated cache file after successful sharing', async () => {
  const events = []
  const result = await createAndShareReportPdf({ html: '<html></html>', title: 'Private report' }, {
    print: { printToFileAsync: async options => { events.push(['print', options]); return { uri: 'file:///cache/report.pdf' } } },
    sharing: { isAvailableAsync: async () => true, shareAsync: async (uri, options) => events.push(['share', uri, options]) },
    fileSystem: { File: class { constructor(uri) { this.uri = uri } delete() { events.push(['delete', this.uri]) } } },
  })
  assert.equal(result.uri, 'file:///cache/report.pdf')
  assert.equal(events[0][1].html, '<html></html>')
  assert.equal(events[1][1], 'file:///cache/report.pdf')
  assert.equal(events[1][2].mimeType, 'application/pdf')
  assert.deepEqual(events[2], ['delete', 'file:///cache/report.pdf'])
})

test('PDF adapter deletes generated files after cancellation and sharing failure without masking outcomes', async () => {
  for (const scenario of ['cancelled', 'share-failed']) {
    const deleted = []
    const dependencies = {
      print: { printToFileAsync: async () => ({ uri: `file:///cache/${scenario}.pdf` }) },
      sharing: {
        isAvailableAsync: async () => true,
        shareAsync: async () => { if (scenario === 'share-failed') throw new Error('private share failure') },
      },
      shouldContinue: () => scenario !== 'cancelled',
      fileSystem: { File: class { constructor(uri) { this.uri = uri } delete() { deleted.push(this.uri); throw new Error('cleanup failure') } } },
    }
    await assert.rejects(
      createAndShareReportPdf({ html: '<html></html>' }, dependencies),
      error => error.code === (scenario === 'cancelled' ? 'REPORT_CANCELLED' : 'PDF_FAILED') && !error.message.includes('private') && !error.message.includes('cleanup'),
    )
    assert.deepEqual(deleted, [`file:///cache/${scenario}.pdf`])
  }
})

test('PDF adapter does not turn successful sharing into failure when cache cleanup fails', async () => {
  const result = await createAndShareReportPdf({ html: '<html></html>' }, {
    print: { printToFileAsync: async () => ({ uri: 'file:///cache/success.pdf' }) },
    sharing: { isAvailableAsync: async () => true, shareAsync: async () => {} },
    fileSystem: { File: class { delete() { throw new Error('cleanup failure') } } },
  })
  assert.equal(result.uri, 'file:///cache/success.pdf')
})

test('both detail screens expose reachable private Pro PDF controls without report analytics or local data queries', () => {
  const project = source('src/screens/ProjectDetailScreen.js')
  const item = source('src/screens/MyStuffDetailScreen.js')
  const panel = source('src/components/ReportPanel.js')
  for (const [screen, subjectType] of [[project, 'project'], [item, 'my_stuff_item']]) {
    assert.match(screen, new RegExp(`ReportPanel[^>]*subjectType="${subjectType}"`))
    assert.match(screen, /navigation\.navigate\('Pro'\)/)
    assert.match(panel, /Create & Share PDF/)
    assert.match(panel, /Identifiers \(VIN is masked\)/)
    assert.match(panel, /private/i)
    assert.match(panel, /includeIdentifiers: false, includeDetailedCosts: false/)
    assert.doesNotMatch(panel, /label: 'Photos'|label: 'Documents'/)
    assert.match(panel, /photos and documents are not included/i)
    assert.doesNotMatch(panel, /captureEvent|analytics/)
  }
  assert.doesNotMatch(panel, /supabase\.from|\.rpc\(/)
  const features = source('src/components/ProFeatureList.js')
  assert.match(features, /title: 'Private PDF Reports'/)
  assert.doesNotMatch(features, /title: 'Private PDF Reports'[^\n]*comingSoon: true/)
})
