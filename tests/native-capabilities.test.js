import test from 'node:test'
import assert from 'node:assert/strict'
import { accessibleActiveGoalsAfterProLoss, calculateGoalSummary, canCompleteGoal, canCreateAnotherGoal, isGoalLockedAfterProLoss } from '../src/screens/tradeUpGoalModel.js'

test('Free allows one active goal and Pro allows multiple active goals', () => {
  assert.equal(canCreateAnotherGoal('free', []), true)
  assert.equal(canCreateAnotherGoal('free', [{ status: 'completed' }]), true)
  assert.equal(canCreateAnotherGoal('free', [{ status: 'active' }]), false)
  assert.equal(canCreateAnotherGoal('pro', [{ status: 'active' }]), true)
})

test('after Pro loss only the oldest active goal opens while later active goals lock', () => {
  const goals = [
    { id: 'newer', status: 'active', created_at: '2026-08-20T00:00:00Z' },
    { id: 'oldest', status: 'active', created_at: '2026-08-01T00:00:00Z' },
    { id: 'completed', status: 'completed', created_at: '2026-07-01T00:00:00Z' },
  ]

  assert.equal(isGoalLockedAfterProLoss(goals[0], goals, 'free'), true)
  assert.equal(isGoalLockedAfterProLoss(goals[1], goals, 'free'), false)
  assert.equal(isGoalLockedAfterProLoss(goals[2], goals, 'free'), false)
  assert.equal(isGoalLockedAfterProLoss(goals[0], goals, 'pro'), false)
})

test('downgrade goal locking is deterministic when creation timestamps match', () => {
  const goals = [
    { id: 'b', status: 'active', created_at: '2026-08-01T00:00:00Z' },
    { id: 'a', status: 'active', created_at: '2026-08-01T00:00:00Z' },
  ]
  assert.equal(isGoalLockedAfterProLoss(goals[0], goals, 'free'), true)
  assert.equal(isGoalLockedAfterProLoss(goals[1], goals, 'free'), false)

  const undated = { id: 'undated', status: 'active', created_at: null }
  assert.equal(isGoalLockedAfterProLoss(undated, [undated, goals[1]], 'free'), true)
})

test('project goal pickers expose only the oldest active goal after Pro loss', () => {
  const goals = [
    { id: 'newer', status: 'active', created_at: '2026-08-20T00:00:00Z' },
    { id: 'oldest', status: 'active', created_at: '2026-08-01T00:00:00Z' },
  ]
  assert.deepEqual(accessibleActiveGoalsAfterProLoss(goals, 'free').map(goal => goal.id), ['oldest'])
  assert.deepEqual(accessibleActiveGoalsAfterProLoss(goals, 'pro').map(goal => goal.id), ['newer', 'oldest'])
})

test('a goal can only be completed after current progress reaches a positive target', () => {
  assert.equal(canCompleteGoal({ target_amount: 10000 }, { progressValue: 1000 }), false)
  assert.equal(canCompleteGoal({ target_amount: 10000 }, { progressValue: 9999.99 }), false)
  assert.equal(canCompleteGoal({ target_amount: 10000 }, { progressValue: 10000 }), true)
  assert.equal(canCompleteGoal({ target_amount: 10000 }, { progressValue: 12000 }), true)
  assert.equal(canCompleteGoal({ target_amount: 0 }, { progressValue: 10000 }), false)
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
