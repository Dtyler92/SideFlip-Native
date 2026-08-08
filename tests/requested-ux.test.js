import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { progressColor } from '../src/screens/tradeUpGoalModel.js'

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

test('project actions use requested copy and sold projects can be undone', () => {
  const detail = source('src/screens/ProjectDetailScreen.js')
  assert.match(detail, />Generate Sales Listing</)
  assert.doesNotMatch(detail, /Generate FB Listing|✨ Generate|🔒 AI Listing|💰 Mark as Sold|📋 Share/)
  assert.match(detail, /rpc\('undo_goal_project_outcome'/)
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
