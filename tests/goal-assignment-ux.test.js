import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

test('project details offers accounting-safe goal assignment only when unassigned and active', () => {
  const detail = source('src/screens/ProjectDetailScreen.js')
  assert.match(detail, /project\.status === 'active' && !project\.goal_id/)
  assert.match(detail, />Assign to Goal</)
  assert.match(detail, /rpc\('link_trade_up_project'/)
  assert.match(detail, /p_goal_funding:\s*0/)
  assert.match(detail, /openGoalCreation\(\{/)
})

test('new project always shows a goal add control and supports creating then selecting a goal', () => {
  const screen = source('src/screens/NewProjectScreen.js')
  assert.match(screen, /accessibilityLabel="Create new Trade-Up Goal"/)
  assert.match(screen, />\+</)
  assert.match(screen, /openGoalCreation\(\{/)
  assert.match(screen, /setSelectedGoalId\(goal\.id\)/)
})

test('additional goal creation sends Free users to Pro while Pro can continue', () => {
  const helper = source('src/screens/goalCreationNavigation.js')
  assert.match(helper, /canCreateAnotherGoal\(plan, activeGoals\)/)
  assert.match(helper, /navigation\.navigate\('Pro'\)/)
  assert.match(helper, /navigation\.navigate\('GoalCreate'/)
})

test('goal creation screen uses the server-enforced goal RPC and is registered in navigation', () => {
  const screen = source('src/screens/GoalCreateScreen.js')
  const app = source('App.js')
  assert.match(screen, /rpc\('create_trade_up_goal'/)
  assert.match(screen, /canCreateAnotherGoal\(plan, activeGoals\)/)
  assert.match(app, /name="GoalCreate" component=\{GoalCreateScreen\}/)
})

test('new project includes Home Improvement and avoids double iOS keyboard adjustment', () => {
  const screen = source('src/screens/NewProjectScreen.js')
  assert.match(screen, /value:'house',label:'🏠 Home Improvement'/)
  assert.match(source('src/screens/HomeScreen.js'), /house:'🏠'/)
  assert.match(source('src/screens/AnalyticsScreen.js'), /house: '🏠'/)
  assert.doesNotMatch(screen, /KeyboardAvoidingView/)
  assert.match(screen, /automaticallyAdjustKeyboardInsets=\{Platform\.OS === 'ios'\}/)
})
