import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateGoalSummary, canCreateAnotherGoal } from '../src/screens/tradeUpGoalModel.js'

test('Free allows one active goal and Pro allows multiple active goals', () => {
  assert.equal(canCreateAnotherGoal('free', []), true)
  assert.equal(canCreateAnotherGoal('free', [{ status: 'completed' }]), true)
  assert.equal(canCreateAnotherGoal('free', [{ status: 'active' }]), false)
  assert.equal(canCreateAnotherGoal('pro', [{ status: 'active' }]), true)
})

test('goal progress includes available ledger cash and capital in active projects', () => {
  const goal = {
    id: 'g1',
    target_amount: 1000,
    goal_ledger: [{ goal_id: 'g1', amount: 200 }, { goal_id: 'g1', amount: -50 }],
  }
  const projects = [
    { goal_id: 'g1', status: 'active', purchase_price: 300, expenses: [{ amount: 50 }] },
    { goal_id: 'g1', status: 'sold', purchase_price: 100, expenses: [] },
    { goal_id: 'other', status: 'active', purchase_price: 999, expenses: [] },
  ]
  assert.deepEqual(calculateGoalSummary(goal, projects), {
    available: 150,
    activeValue: 350,
    progressValue: 500,
    progressPercent: 50,
    activeCount: 1,
    soldCount: 1,
  })
})
