import test from 'node:test'
import assert from 'node:assert/strict'
import { roundLaborHours, calculateHourlyEarnings } from '../src/screens/laborModel.js'

test('labor always rounds up to the nearest quarter hour', () => {
  assert.equal(roundLaborHours('0.01'), 0.25)
  assert.equal(roundLaborHours('0.25'), 0.25)
  assert.equal(roundLaborHours('0.26'), 0.5)
  assert.equal(roundLaborHours('1.01'), 1.25)
  assert.equal(roundLaborHours('2'), 2)
  assert.equal(roundLaborHours('0'), null)
  assert.equal(roundLaborHours('not-a-number'), null)
})

test('hourly earnings excludes legacy sold projects without labor from both numerator and denominator', () => {
  const result = calculateHourlyEarnings([
    { status: 'sold', purchase_price: 10, sale_price: 1010, expenses: [] },
    { status: 'sold', purchase_price: 100, sale_price: 250, expenses: [{ amount: 50, labor_hours: 2 }] },
  ])
  assert.deepEqual(result, { totalProfit: 100, totalLaborHours: 2, hourlyEarnings: 50 })
})

test('hourly earnings uses sold-project profit and recorded labor only', () => {
  const projects = [
    {
      status: 'sold', purchase_price: 100, sale_price: 300,
      expenses: [{ amount: 20, labor_hours: 0.5 }, { amount: 30, labor_hours: 0.25 }],
    },
    {
      status: 'active', purchase_price: 10,
      expenses: [{ amount: 5, labor_hours: 10 }],
    },
  ]
  assert.deepEqual(calculateHourlyEarnings(projects), {
    totalProfit: 150,
    totalLaborHours: 0.75,
    hourlyEarnings: 200,
  })
  assert.equal(calculateHourlyEarnings([{ status: 'sold', purchase_price: 10, sale_price: 20, expenses: [] }]).hourlyEarnings, null)
})
