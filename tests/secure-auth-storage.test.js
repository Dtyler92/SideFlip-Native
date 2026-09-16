import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createSecureAuthStorage, SECURE_AUTH_CHUNK_BYTES } from '../src/lib/secureAuthStorageModel.js'

function stores({ legacyValue = null } = {}) {
  const secure = new Map()
  const legacy = new Map(legacyValue == null ? [] : [['sb-test-auth-token', legacyValue]])
  const control = { writes:0, deletes:0, failSecureWriteAt:null, failSecureDeleteAt:null, failLegacyDelete:false }
  return {
    secure,
    legacy,
    control,
    secureStore: {
      async getItemAsync(name) { return secure.get(name) ?? null },
      async setItemAsync(name, value) {
        control.writes += 1
        if (control.writes === control.failSecureWriteAt) throw new Error('secure write failed')
        secure.set(name, value)
      },
      async deleteItemAsync(name) {
        control.deletes += 1
        if (control.deletes === control.failSecureDeleteAt) throw new Error('secure delete failed')
        secure.delete(name)
      },
    },
    legacyStorage: {
      async getItem(name) { return legacy.get(name) ?? null },
      async removeItem(name) {
        if (control.failLegacyDelete) throw new Error('legacy delete failed')
        legacy.delete(name)
      },
    },
  }
}

const key = 'sb-test-auth-token'
const metaKey = `${key}.secure.meta`
const tombstoneKey = `${key}.secure.loggedout`

function create(io) { return createSecureAuthStorage(io) }

test('Supabase sessions use the secure adapter instead of AsyncStorage directly', () => {
  const source = readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8')
  assert.match(source, /storage:\s*secureAuthStorage/)
  assert.doesNotMatch(source, /storage:\s*AsyncStorage/)
})

test('secure auth storage chunks large sessions and reconstructs them', async () => {
  const io = stores()
  const storage = create(io)
  const value = 'x'.repeat(SECURE_AUTH_CHUNK_BYTES * 2 + 17)
  await storage.setItem(key, value)
  assert.equal(await storage.getItem(key), value)
  const manifest = JSON.parse(io.secure.get(metaKey))
  assert.equal(manifest.chunks, 3)
  assert.ok([...io.secure.entries()].filter(([name]) => name.includes(`secure.${manifest.slot}.`)).every(([, chunk]) => chunk.length <= SECURE_AUTH_CHUNK_BYTES))
})

test('secure chunks honor the byte limit for Unicode session metadata', async () => {
  const io = stores()
  const storage = create(io)
  const value = '🙂'.repeat(1000)
  await storage.setItem(key, value)
  assert.equal(await storage.getItem(key), value)
  for (const [name, chunk] of io.secure.entries()) {
    if (/\.secure\.[ab]\.\d+$/.test(name)) assert.ok(Buffer.byteLength(chunk, 'utf8') <= SECURE_AUTH_CHUNK_BYTES)
  }
})

test('legacy migration is fenced so a crash cannot reactivate plaintext state', async () => {
  const io = stores({ legacyValue:'legacy-session' })
  io.control.failSecureWriteAt = 2
  const storage = create(io)
  await assert.rejects(storage.getItem(key), /secure write failed/)
  assert.equal(io.legacy.get(key), 'legacy-session')
  assert.equal(io.secure.get(tombstoneKey), '1')
  assert.equal(await create(io).getItem(key), null)
})

test('logout tombstone prevents legacy resurrection when cleanup fails', async () => {
  const io = stores({ legacyValue:'session' })
  const storage = create(io)
  assert.equal(await storage.getItem(key), 'session')
  io.legacy.set(key, 'stale-session')
  io.control.failLegacyDelete = true
  await assert.rejects(storage.removeItem(key), /legacy delete failed/)
  assert.equal(io.secure.get(tombstoneKey), '1')
  assert.equal(await create(io).getItem(key), null)
})

test('logout removes deterministic orphan chunks left by an interrupted write', async () => {
  const io = stores({ legacyValue:'x'.repeat(4000) })
  io.control.failSecureWriteAt = 3
  const storage = create(io)
  await assert.rejects(storage.getItem(key), /secure write failed/)
  assert.equal([...io.secure.keys()].some(name => name.includes('.secure.a.')), true)
  io.control.failSecureWriteAt = null
  await storage.removeItem(key)
  assert.equal([...io.secure.keys()].some(name => /\.secure\.[ab]\.\d+$/.test(name)), false)
  assert.equal(io.secure.get(tombstoneKey), '1')
})

test('replacement and concurrent logout serialize without stale session recovery', async () => {
  const io = stores()
  const storage = create(io)
  await storage.setItem(key, 'first-session')
  await storage.setItem(key, 'second-session')
  assert.equal(await storage.getItem(key), 'second-session')
  const pendingWrite = storage.setItem(key, 'third-session')
  const pendingLogout = storage.removeItem(key)
  await Promise.all([pendingWrite,pendingLogout])
  assert.equal(await create(io).getItem(key), null)
  assert.equal(io.legacy.has(key), false)
  assert.equal([...io.secure.keys()].some(name => /\.secure\.[ab]\.\d+$/.test(name)), false)
})

test('invalid storage keys reject without waiting behind unrelated secure writes', async () => {
  const io = stores()
  let releaseWrite
  const writeGate = new Promise(resolve => { releaseWrite = resolve })
  const baseSet = io.secureStore.setItemAsync
  let held = false
  io.secureStore.setItemAsync = async (name, value) => {
    if (!held) {
      held = true
      await writeGate
    }
    return baseSet(name, value)
  }
  const storage = create(io)
  const pendingValidWrite = storage.setItem(key, 'session')
  await Promise.resolve()
  const invalidOutcome = await Promise.race([
    storage.setItem('invalid:key', 'value').then(() => 'resolved', () => 'rejected'),
    new Promise(resolve => setTimeout(() => resolve('blocked'), 20)),
  ])
  assert.equal(invalidOutcome, 'rejected')
  releaseWrite()
  await pendingValidWrite
})

test('invalid storage keys and oversized manifests fail closed', async () => {
  const io = stores()
  const storage = create(io)
  await assert.rejects(storage.setItem('invalid:key', 'value'), /storage key/)
  io.secure.set(metaKey, JSON.stringify({ version:2, slot:'a', chunks:999 }))
  await assert.rejects(storage.getItem(key), /manifest/)
})
