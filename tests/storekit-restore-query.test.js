import test from 'node:test'
import assert from 'node:assert/strict'
import { queryRestorablePurchases } from '../src/lib/storekitRestore.js'

const options = { alsoPublishToEventListenerIOS: false, onlyIncludeActiveItemsIOS: true }

test('restore queries available purchases even when AppStore sync fails', async () => {
  const syncError = new Error('Unable to Complete Request')
  const expected = [{ productId: 'com.sideflip.app.pro.monthly', purchaseToken: 'signed-jws' }]
  let queried = false
  let reportedError = null

  const purchases = await queryRestorablePurchases({
    options,
    syncPurchases: async () => { throw syncError },
    getAvailablePurchases: async receivedOptions => {
      queried = true
      assert.deepEqual(receivedOptions, options)
      return expected
    },
    onSyncError: error => { reportedError = error },
  })

  assert.equal(queried, true)
  assert.equal(reportedError, syncError)
  assert.deepEqual(purchases, expected)
})

test('restore syncs before querying when AppStore sync succeeds', async () => {
  const calls = []
  await queryRestorablePurchases({
    options,
    syncPurchases: async () => { calls.push('sync') },
    getAvailablePurchases: async () => { calls.push('query'); return [] },
  })
  assert.deepEqual(calls, ['sync', 'query'])
})
