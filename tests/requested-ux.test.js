import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { progressColor } from '../src/screens/tradeUpGoalModel.js'

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

test('Projects reload whenever the Projects screen regains focus', () => {
  const home = source('src/screens/HomeScreen.js')
  assert.match(home, /import \{ useFocusEffect \} from '@react-navigation\/native'/)
  assert.match(home, /useFocusEffect\(useCallback\(\(\) => \{ load\(\) \}, \[load\]\)\)/)
  assert.doesNotMatch(home, /useEffect\(\(\) => \{ load\(\) \}, \[load\]\)/)
})

test('Project expenses use a heading-level plus action instead of a bottom add button', () => {
  const detail = source('src/screens/ProjectDetailScreen.js')
  const expenses = detail.slice(detail.indexOf('{/* Expenses */}'), detail.indexOf('{/* Sales Listing Editor */}'))
  assert.match(expenses, /style=\{s\.expenseSectionHeader\}/)
  assert.match(expenses, /accessibilityLabel="Add expense"/)
  assert.match(expenses, /<Text style=\{s\.expenseAddText\}>\+<\/Text>/)
  assert.match(expenses, /\{showAddExpense && \(editingExpenseId \|\| project\.status === 'active'\) && \(/)
  assert.match(detail, /if \(!editingExpenseId && project\.status !== 'active'\)/)
  assert.doesNotMatch(expenses, />Add Expense<\/Text>/)
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

test('goal completion is unavailable until current progress funds the target', () => {
  const goals = source('src/screens/TradeUpGoalsScreen.js')
  assert.match(goals, /const canMarkComplete = canCompleteGoal\(selected, summary\)/)
  assert.match(goals, /activeGoal && canMarkComplete/)
  assert.match(goals, /if \(status === 'completed' && !canCompleteGoal/)
})

test('goal screens reserve the Android top safe area while scrolling', () => {
  const goals = source('src/screens/TradeUpGoalsScreen.js')
  assert.match(goals, /SafeAreaView/)
  assert.ok((goals.match(/edges=\{\['top'\]\}/g) || []).length >= 2)
})

test('expired Pro locks later active goals while preserving grey progress and an upgrade reminder', () => {
  const goals = source('src/screens/TradeUpGoalsScreen.js')
  const createProject = source('src/screens/NewProjectScreen.js')
  const projectDetail = source('src/screens/ProjectDetailScreen.js')
  assert.match(goals, /isGoalLockedAfterProLoss/)
  assert.match(goals, /const locked = isGoalLockedAfterProLoss\(goal, goals, plan\)/)
  assert.match(goals, /locked \? <View[^>]+accessibilityState=\{\{ disabled: true \}\}/)
  assert.match(goals, /Progress summary=\{summary\} target=\{goal\.target_amount\} formatMoney=\{formatMoney\} compact locked=\{locked\}/)
  assert.match(goals, /Upgrade to unlock this Goal/)
  assert.match(goals, /const currentGoals = useRef\(goals\)/)
  assert.match(goals, /const currentPlan = useRef\(plan\)/)
  assert.match(goals, /function getCurrentlyAccessibleGoal\(goalId\)/)
  assert.match(goals, /isGoalLockedAfterProLoss\(goal, currentGoals\.current, currentPlan\.current\)/)
  for (const mutation of ['saveStatus', 'adjustBalance', 'updateTargetAmount', 'deleteGoal']) {
    assert.match(goals, new RegExp(`async function ${mutation}\\([^)]*goalId = selected\\?\\.id[^)]*\\) \\{[\\s\\S]*?getCurrentlyAccessibleGoal\\(goalId\\)`))
  }
  for (const picker of [createProject, projectDetail]) {
    assert.match(picker, /accessibleActiveGoalsAfterProLoss/)
    assert.match(picker, /select\('[^']*created_at/)
  }
  assert.match(createProject, /const goalLoadGeneration = useRef\(0\)/)
  assert.match(createProject, /const selectableGoals = accessibleActiveGoalsAfterProLoss\(activeGoals, plan\)/)
  assert.match(createProject, /if \(request !== goalLoadGeneration\.current\) return/)
  assert.match(createProject, /if \(selectedGoalId && !selectedGoal\)/)
  assert.match(createProject, /selectableGoals\.map\(goal =>/)
  assert.match(projectDetail, /const projectLoadGeneration = useRef\(0\)/)
  assert.match(projectDetail, /if \(request !== projectLoadGeneration\.current\) return/)
  assert.match(projectDetail, /const selectableGoals = accessibleActiveGoalsAfterProLoss\(activeGoals, plan\)/)
  assert.match(projectDetail, /const currentPlan = useRef\(plan\)/)
  assert.match(projectDetail, /currentPlan\.current = plan/)
  assert.match(projectDetail, /async function assignGoal\(goalId, candidateGoals = activeGoals\)/)
  assert.match(projectDetail, /const allowedGoal = accessibleActiveGoalsAfterProLoss\(candidateGoals, currentPlan\.current\)\.some\(goal => goal\.id === goalId\)/)
  assert.match(projectDetail, /await assignGoal\(goal\.id, nextGoals\)/)
  assert.match(projectDetail, /if \(!allowedGoal\) return Alert\.alert\('Goal locked'/)
  const goalCreate = source('src/screens/GoalCreateScreen.js')
  assert.match(goalCreate, /select\('id,name,status,created_at'\)/)
  assert.match(goalCreate, /await onCreated\?\.\(\{ \.\.\.createdGoal, available: startingAmount \}\)/)
})

test('every goal has a positive editable target so completion remains reachable', () => {
  const goals = source('src/screens/TradeUpGoalsScreen.js')
  assert.doesNotMatch(goals, /Estimated target value \(optional\)/)
  assert.match(goals, /async function updateTargetAmount\(goalId = selected\?\.id\)/)
  assert.match(goals, /setShowTargetEditor/)
  assert.match(goals, /Save Target Amount/)
})

test('V1.1 exposes goal markers and moves Settings into the account menu', () => {
  const home = source('src/screens/HomeScreen.js')
  const app = source('App.js')
  const settings = source('src/screens/SettingsScreen.js')
  assert.match(home, /p\.goal_id/)
  assert.match(home, />Goal<\/Text>/)
  assert.match(home, /navigation\.navigate\('Settings'\)/)
  assert.match(home, /accessibilityLabel="Account menu"/)
  assert.doesNotMatch(app, /<Tab\.Screen name="Settings"/)
  assert.match(app, /<Stack\.Screen name="Settings" component=\{SettingsScreen\}/)
  assert.match(settings, /navigation\.goBack\(\)/)
})

test('V1.1 removes user-visible AI wording without removing listing generation', () => {
  const home = source('src/screens/HomeScreen.js')
  const detail = source('src/screens/ProjectDetailScreen.js')
  const features = source('src/components/ProFeatureList.js')
  for (const value of [home, detail, features]) assert.doesNotMatch(value, /AI Listing Generator|AI listings/)
  assert.match(home, /sales listing tools/)
  assert.match(detail, /Generate Description/)
  assert.match(features, /Sales Listing Generator/)
})

test('Android forms use resize and every nontrivial form is scrollable', () => {
  const config = JSON.parse(source('app.json')).expo
  assert.equal(config.android.softwareKeyboardLayoutMode, 'resize')
  const forgot = source('src/screens/ForgotPasswordScreen.js')
  assert.match(forgot, /ScrollView/)
  assert.match(forgot, /keyboardShouldPersistTaps="handled"/)
  assert.match(forgot, /flexGrow:\s*1/)
})
