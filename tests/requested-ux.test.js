import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  accessibleActiveGoalsAfterProLoss,
  canCompleteGoal,
  isGoalLockedAfterProLoss,
  progressColor,
} from '../src/screens/tradeUpGoalModel.js'

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

test('project actions use requested copy and sold projects can be undone', () => {
  const detail = source('src/screens/ProjectDetailScreen.js')
  assert.match(detail, />Create Sales Listing</)
  assert.match(detail, />✨ Generate Description</)
  assert.doesNotMatch(detail, /Generate FB Listing|🔒 AI Listing|💰 Mark as Sold|📋 Share/)
  assert.match(detail, /rpc\('undo_goal_project_outcome'/)
  assert.match(detail, /await onReturn\?\.\(\)/)
  assert.match(detail, />Undo Sale</)
  assert.match(detail, /✅ Sold for/)
  assert.match(detail, /<Text style=\{s\.expenseRemove\}>×<\/Text>/)
  assert.doesNotMatch(detail, /<Text style=\{s\.expenseRemove\}>Remove<\/Text>/)
})

test('new projects require an explicit category selection', () => {
  const create = source('src/screens/NewProjectScreen.js')
  assert.match(create, /useState\(''\)/)
  assert.match(create, /selectedCat\?\.label \|\| 'Select'/)
  assert.match(create, /if \(!category\)/)
})

test('expense labor is mandatory and expenses can be edited later', () => {
  const detail = source('src/screens/ProjectDetailScreen.js')
  assert.match(detail, /laborHours/)
  assert.match(detail, /roundLaborHours/)
  assert.match(detail, /labor_hours:/)
  assert.match(detail, /editingExpenseId/)
  assert.match(detail, /\.from\('expenses'\)\.update/)
})

test('goal progress transitions from red to green', () => {
  assert.equal(progressColor(0), '#C8402F')
  assert.equal(progressColor(100), '#2D7A4F')
  assert.notEqual(progressColor(50), progressColor(0))
  assert.notEqual(progressColor(50), progressColor(100))
})

test('goal detail has completion celebration, requested stats, and collapsed amount editor', () => {
  const goals = source('src/screens/TradeUpGoalsScreen.js')
  assert.match(goals, /Congratulations!/)
  assert.match(goals, /celebrationVisible/)
  assert.match(goals, /Out of pocket/)
  assert.match(goals, /Flipped/)
  assert.match(goals, /showAdjustment/)
  assert.match(goals, /progressColor/)
})

test('goal completion requires a positive fully funded target', () => {
  assert.equal(canCompleteGoal({ target_amount: 0 }, { progressValue: 500 }), false)
  assert.equal(canCompleteGoal({ target_amount: 500 }, { progressValue: 499.99 }), false)
  assert.equal(canCompleteGoal({ target_amount: 500 }, { progressValue: 500 }), true)

  const goals = source('src/screens/TradeUpGoalsScreen.js')
  assert.match(goals, /const canMarkComplete = canCompleteGoal\(selected, summary\)/)
  assert.match(goals, /if \(status === 'completed' && !canCompleteGoal/)
  assert.match(goals, /Save Target Amount/)
})

test('expired Pro retains only the oldest active goal as accessible', () => {
  const goals = [
    { id: 'new', status: 'active', created_at: '2026-02-01T00:00:00Z' },
    { id: 'old', status: 'active', created_at: '2026-01-01T00:00:00Z' },
    { id: 'done', status: 'completed', created_at: '2025-01-01T00:00:00Z' },
  ]
  assert.equal(isGoalLockedAfterProLoss(goals[0], goals, 'free'), true)
  assert.equal(isGoalLockedAfterProLoss(goals[1], goals, 'free'), false)
  assert.deepEqual(accessibleActiveGoalsAfterProLoss(goals, 'free').map(goal => goal.id), ['old'])
  assert.deepEqual(accessibleActiveGoalsAfterProLoss(goals, 'pro').map(goal => goal.id), ['new', 'old'])
})

test('goal mutations and project pickers recheck entitlement after plan changes', () => {
  const goals = source('src/screens/TradeUpGoalsScreen.js')
  const createProject = source('src/screens/NewProjectScreen.js')
  const projectDetail = source('src/screens/ProjectDetailScreen.js')
  assert.match(goals, /function getCurrentlyAccessibleGoal\(goalId\)/)
  assert.match(goals, /isGoalLockedAfterProLoss\(goal, currentGoals\.current, currentPlan\.current\)/)
  for (const mutation of ['saveStatus', 'adjustBalance', 'updateTargetAmount', 'deleteGoal']) {
    assert.match(goals, new RegExp(`async function ${mutation}\\([^)]*goalId = selected\\?\\.id[^)]*\\) \\{[\\s\\S]*?getCurrentlyAccessibleGoal\\(goalId\\)`))
  }
  assert.match(createProject, /const goalLoadGeneration = useRef\(0\)/)
  assert.match(createProject, /if \(request !== goalLoadGeneration\.current\) return/)
  assert.match(createProject, /if \(selectedGoalId && !selectedGoal\)/)
  assert.match(projectDetail, /const projectLoadGeneration = useRef\(0\)/)
  assert.match(projectDetail, /if \(request !== projectLoadGeneration\.current\) return/)
  assert.match(projectDetail, /accessibleActiveGoalsAfterProLoss\(candidateGoals, currentPlan\.current\)/)
  assert.match(goals, /status === 'active' && !canCreateAnotherGoal\(currentPlan\.current, otherGoals\)/)
})

test('goal balance adjustments reject invalid money and preserve retry idempotency', () => {
  const goals = source('src/screens/TradeUpGoalsScreen.js')
  assert.match(goals, /!Number\.isFinite\(rawAmount\) \|\| rawAmount <= 0/)
  assert.match(goals, /const amount = roundMoney\(rawAmount\)/)
  assert.match(goals, /!Number\.isFinite\(amount\) \|\| amount <= 0/)
  assert.match(goals, /adjustmentMutation\.current/)
  assert.match(goals, /p_mutation_id: mutationId/)
})

test('goal status and target changes use one owner-scoped full-state RPC with stable retries', () => {
  const goals = source('src/screens/TradeUpGoalsScreen.js')
  assert.match(goals, /updateTradeUpGoal/)
  assert.doesNotMatch(goals, /\.from\('trade_up_goals'\)[\s\S]{0,160}\.update\(/)
  assert.match(goals, /goalUpdateMutation\.current/)
  assert.match(goals, /status: status, targetAmount/)
  assert.match(goals, /status: mutationGoal\.status, targetAmount/)
})

test('goal-linked projects and Settings are visible from Home', () => {
  const home = source('src/screens/HomeScreen.js')
  const settings = source('src/screens/SettingsScreen.js')
  assert.match(home, /p\.goal_id/)
  assert.match(home, />Goal<\/Text>/)
  assert.match(home, /navigation\.navigate\('Settings'\)/)
  assert.match(home, /accessibilityLabel="Account menu"/)
  assert.match(home, /useFocusEffect\(useCallback\(\(\) => \{ load\(\) \}, \[load\]\)\)/)
  assert.match(settings, /navigation\.goBack\(\)/)
})

test('iOS goal upsells retain Apple wording and no alternate purchase path', () => {
  const goals = source('src/screens/TradeUpGoalsScreen.js')
  const createGoal = source('src/screens/GoalCreateScreen.js')
  assert.match(goals, /Upgrade in the App Store/)
  assert.match(goals, /Upgrade with Apple in the app/)
  assert.match(createGoal, /Upgrade in the App Store/)
  assert.doesNotMatch(`${goals}\n${createGoal}`, /Google Play|Stripe/)
})
