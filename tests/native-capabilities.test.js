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
    outOfPocket: 50,
    flipped: 0,
  })
})

test('undoing a goal-linked sale removes proceeds and restores only active invested capital', () => {
  const goal = { id: 'g1', target_amount: 1000 }
  const soldSummary = calculateGoalSummary(goal, [
    { goal_id: 'g1', status: 'sold', purchase_price: 100, sale_price: 300, expenses: [{ amount: 50 }] },
  ], [
    { goal_id: 'g1', type: 'sale_proceeds', amount: 300 },
  ])
  assert.equal(soldSummary.available, 300)
  assert.equal(soldSummary.activeValue, 0)
  assert.equal(soldSummary.progressValue, 300)

  const reopenedSummary = calculateGoalSummary(goal, [
    { goal_id: 'g1', status: 'active', purchase_price: 100, sale_price: null, expenses: [{ amount: 50 }] },
  ], [])
  assert.equal(reopenedSummary.available, 0)
  assert.equal(reopenedSummary.activeValue, 150)
  assert.equal(reopenedSummary.progressValue, 150)
  assert.equal(reopenedSummary.flipped, 0)
})

test('goal analytics reports personal cash invested and gross flipped value', () => {
  const goal = {
    id: 'g1',
    target_amount: 5000,
    goal_ledger: [
      { goal_id: 'g1', type: 'personal_contribution', amount: 600 },
      { goal_id: 'g1', type: 'goal_purchase', amount: -400 },
    ],
  }
  const projects = [
    {
      goal_id: 'g1', status: 'sold', purchase_price: 500, out_of_pocket_amount: 100,
      sale_price: 1200, expenses: [{ amount: 50 }],
    },
  ]
  const summary = calculateGoalSummary(goal, projects)
  assert.equal(summary.outOfPocket, 750)
  assert.equal(summary.flipped, 1200)
})
