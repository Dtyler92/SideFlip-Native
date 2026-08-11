import test from 'node:test'
import assert from 'node:assert/strict'
import { formatMoneyForCurrency } from '../src/lib/currencyModel.js'

test('selected project currency formats actual values across supported storefront-independent currencies', () => {
  assert.equal(formatMoneyForCurrency(1234.5, 'USD'), '$1,234.50')
  assert.equal(formatMoneyForCurrency(1234.5, 'CAD'), 'CA$1,234.50')
  assert.equal(formatMoneyForCurrency(1234.5, 'EUR'), '€1,234.50')
  assert.equal(formatMoneyForCurrency(1234.5, 'JPY'), '¥1,235')
})

test('negative project amounts place the sign before the selected currency symbol', () => {
  assert.equal(formatMoneyForCurrency(-12.5, 'GBP'), '-£12.50')
  assert.equal(formatMoneyForCurrency(-12.5, 'AUD'), '-A$12.50')
})

test('unknown or invalid values safely use the USD project-currency default', () => {
  assert.equal(formatMoneyForCurrency(10, 'UNKNOWN'), '$10.00')
  assert.equal(formatMoneyForCurrency(undefined, 'USD'), '$0.00')
})
