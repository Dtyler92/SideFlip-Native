import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

test('goal-linked project creation uses the atomic goal-project RPC', () => {
  const value = source('src/screens/NewProjectScreen.js')
  assert.match(value, /rpc\('create_trade_up_project'/)
  assert.match(value, /p_goal_funding:\s*0/)
  assert.match(value, /projectMutationIdRef\.current/)
  assert.doesNotMatch(value, /rpc\('link_trade_up_project'/)
})

test('goal-linked project sales use the accounting-safe sale RPC', () => {
  const value = source('src/screens/SellProjectScreen.js')
  assert.match(value, /if \(project\.goal_id\)/)
  assert.match(value, /rpc\('record_trade_up_sale'/)
  assert.match(value, /p_keep_amount:/)
})

test('project deletion always uses the accounting-safe deletion RPC', () => {
  const value = source('src/screens/ProjectDetailScreen.js')
  assert.match(value, /rpc\('delete_trade_up_project'/)
  assert.doesNotMatch(value, /from\('projects'\)\.delete\(\)/)
})
