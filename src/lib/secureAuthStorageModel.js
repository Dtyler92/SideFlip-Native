export const SECURE_AUTH_CHUNK_BYTES = 1800
const MAX_CHUNKS = 64
const MANIFEST_VERSION = 2
const KEY_PATTERN = /^[A-Za-z0-9._-]{1,160}$/
const SLOTS = ['a','b']

function manifestKey(key) { return `${key}.secure.meta` }
function tombstoneKey(key) { return `${key}.secure.loggedout` }
function chunkKey(key, slot, index) { return `${key}.secure.${slot}.${index}` }

function utf8ByteLength(character) {
  const codePoint = character.codePointAt(0)
  if (codePoint <= 0x7f) return 1
  if (codePoint <= 0x7ff) return 2
  if (codePoint <= 0xffff) return 3
  return 4
}

function splitUtf8(value) {
  if (!value) return ['']
  const chunks = []
  let chunk = ''
  let bytes = 0
  for (const character of value) {
    const characterBytes = utf8ByteLength(character)
    if (bytes + characterBytes > SECURE_AUTH_CHUNK_BYTES) {
      chunks.push(chunk)
      chunk = ''
      bytes = 0
    }
    chunk += character
    bytes += characterBytes
  }
  if (chunk) chunks.push(chunk)
  return chunks
}

function validateKey(key) {
  if (!KEY_PATTERN.test(String(key || ''))) throw new Error('Invalid secure auth storage key.')
  return key
}

function parseManifest(raw) {
  if (raw == null) return null
  let value
  try { value = JSON.parse(raw) } catch { throw new Error('Invalid secure auth storage manifest.') }
  if (value?.version !== MANIFEST_VERSION || !SLOTS.includes(value.slot) || !Number.isInteger(value.chunks) || value.chunks < 1 || value.chunks > MAX_CHUNKS) {
    throw new Error('Invalid secure auth storage manifest.')
  }
  return value
}

async function removeSlot(secureStore, key, slot, count = MAX_CHUNKS) {
  const outcomes = await Promise.allSettled(Array.from({ length: count }, (_, index) => secureStore.deleteItemAsync(chunkKey(key, slot, index))))
  const failure = outcomes.find(outcome => outcome.status === 'rejected')
  if (failure) throw failure.reason
}

export function createSecureAuthStorage({ secureStore, legacyStorage }) {
  if (!secureStore || !legacyStorage) throw new Error('Secure auth storage dependencies are required.')

  const mutationQueues = new Map()
  const enqueue = (key, operation) => {
    const previous = mutationQueues.get(key) || Promise.resolve()
    const result = previous.then(operation, operation)
    const settled = result.catch(() => {})
    mutationQueues.set(key, settled)
    settled.then(() => {
      if (mutationQueues.get(key) === settled) mutationQueues.delete(key)
    })
    return result
  }

  async function readItem(rawKey) {
    const key = validateKey(rawKey)
    if (await secureStore.getItemAsync(tombstoneKey(key)) != null) return null

    const manifest = parseManifest(await secureStore.getItemAsync(manifestKey(key)))
    if (manifest) {
      const chunks = await Promise.all(Array.from({ length: manifest.chunks }, (_, index) => secureStore.getItemAsync(chunkKey(key, manifest.slot, index))))
      if (chunks.some(chunk => typeof chunk !== 'string')) throw new Error('Incomplete secure auth storage value.')
      await legacyStorage.removeItem(key).catch(() => {})
      return chunks.join('')
    }

    const legacyValue = await legacyStorage.getItem(key)
    if (legacyValue == null) return null
    await writeItem(key, legacyValue)
    return legacyValue
  }

  async function writeItem(rawKey, rawValue) {
    const key = validateKey(rawKey)
    const value = String(rawValue)
    const chunks = splitUtf8(value)
    if (chunks.length > MAX_CHUNKS) throw new Error('Secure auth storage value is too large.')

    const oldManifest = parseManifest(await secureStore.getItemAsync(manifestKey(key)))
    const targetSlot = oldManifest?.slot === 'a' ? 'b' : 'a'
    const needsMigrationFence = !oldManifest
    if (needsMigrationFence) await secureStore.setItemAsync(tombstoneKey(key), '1')

    for (let index = 0; index < chunks.length; index += 1) {
      await secureStore.setItemAsync(chunkKey(key, targetSlot, index), chunks[index])
    }
    const nextManifest = { version: MANIFEST_VERSION, slot: targetSlot, chunks: chunks.length }
    await secureStore.setItemAsync(manifestKey(key), JSON.stringify(nextManifest))
    await legacyStorage.removeItem(key)
    await secureStore.deleteItemAsync(tombstoneKey(key))
    if (oldManifest) await removeSlot(secureStore, key, oldManifest.slot)
  }

  async function deleteItem(rawKey) {
    const key = validateKey(rawKey)
    await secureStore.setItemAsync(tombstoneKey(key), '1')
    await secureStore.deleteItemAsync(manifestKey(key))
    await Promise.all(SLOTS.map(slot => removeSlot(secureStore, key, slot)))
    await legacyStorage.removeItem(key)
  }

  function enqueueValidated(rawKey, operation) {
    let key
    try { key = validateKey(rawKey) } catch (error) { return Promise.reject(error) }
    return enqueue(key, () => operation(key))
  }

  return {
    getItem(rawKey) { return enqueueValidated(rawKey, readItem) },
    setItem(rawKey, rawValue) { return enqueueValidated(rawKey, key => writeItem(key, rawValue)) },
    removeItem(rawKey) { return enqueueValidated(rawKey, deleteItem) },
  }
}
