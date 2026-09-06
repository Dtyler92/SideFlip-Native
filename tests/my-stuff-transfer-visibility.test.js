import test from 'node:test'
import assert from 'node:assert/strict'
import { excludeTransferredItems } from '../src/domain/myStuff/transferVisibility.js'

test('transferred items leave My Stuff while manual archives remain available', () => {
  const active = { id:'active', archived_at:null }
  const manualArchive = { id:'manual-archive', archived_at:'2026-09-01T00:00:00Z' }
  const transferred = { id:'transferred', archived_at:'2026-09-02T00:00:00Z' }

  assert.deepEqual(
    excludeTransferredItems([active, manualArchive, transferred], [{ item_id:'transferred' }]),
    [active, manualArchive],
  )
})

test('duplicate provenance rows cannot duplicate or remove unrelated My Stuff items', () => {
  const items = [{ id:'kept' }, { id:'moved' }]
  assert.deepEqual(
    excludeTransferredItems(items, [{ item_id:'moved' }, { item_id:'moved' }, { item_id:null }]),
    [{ id:'kept' }],
  )
})
