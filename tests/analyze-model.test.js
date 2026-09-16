import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEAL_RATING_THRESHOLDS,
  MINIMUM_OFFER_LIST_PRICE_RATIO,
  analyzeDeal,
  calculateListPrice,
  calculateProfit,
  projectAnalysisDraft,
  quickDealCheck,
  rateDeal,
} from '../src/domain/analyzeModel.js'

test('deal analyzer centralizes investment, fees, profit, margin, ROI, break-even, and maximum buy price', () => {
  const result = analyzeDeal({
    purchasePrice: 200,
    repairsMaterials: 50,
    parts: 25,
    fuelTravel: 10,
    shippingCost: 15,
    otherExpenses: 5,
    expectedSellingPrice: 500,
    platformFeePct: 13,
    sellerPaidShipping: 20,
    salesTaxOtherFees: 5,
    desiredMinimumProfit: 100,
  })
  assert.deepEqual(result, {
    totalInvestment: 305,
    expectedRevenue: 500,
    platformFees: 65,
    totalSellingCosts: 90,
    expectedProfit: 105,
    profitMarginPct: 21,
    roiPct: 34.43,
    breakEvenSellingPrice: 379.31,
    maximumPurchasePrice: 205,
    dealRating: 'GOOD FLIP',
    ratingTone: 'positive',
    ratingExplanation: 'This deal appears to have a solid projected return based on your estimates.',
  })
})

test('quick deal check matches the ten-second example', () => {
  assert.deepEqual(quickDealCheck({ askingPrice: 200, estimatedRepairs: 75, expectedResaleValue: 500, desiredMinimumProfit: 200 }), {
    expectedInvestment: 275,
    expectedProfit: 225,
    roiPct: 81.82,
    maximumBuyPrice: 225,
    dealRating: 'GREAT FLIP',
    ratingTone: 'strong',
    ratingExplanation: 'This deal appears to have a strong projected return based on your estimates.',
  })
})

test('list price calculator supports profit dollars and ROI targets with selling costs', () => {
  const dollars = calculateListPrice({ totalInvested: 405, targetMode: 'profit', targetValue: 190, platformFeePct: 13 })
  assert.equal(dollars.recommendedListPrice, 683.91)
  assert.equal(dollars.expectedProfit, 190)
  assert.equal(dollars.expectedRoiPct, 46.91)
  assert.equal(dollars.breakEvenPrice, 465.52)
  assert.equal(dollars.suggestedMinimumOffer, 629.2)
  assert.equal(MINIMUM_OFFER_LIST_PRICE_RATIO, 0.92)

  const roi = calculateListPrice({ totalInvested: 400, targetMode: 'roi', targetValue: 50, platformFeePct: 0 })
  assert.equal(roi.targetProfit, 200)
  assert.equal(roi.recommendedListPrice, 600)
  assert.equal(roi.expectedRoiPct, 50)
})

test('profit calculator reports actual results and break-even', () => {
  assert.deepEqual(calculateProfit({ totalInvested: 300, sellingPrice: 500, platformFeePct: 10, sellerPaidShipping: 25, additionalSellingCosts: 5 }), {
    platformFees: 50,
    totalSellingCosts: 80,
    expectedProfit: 120,
    profitMarginPct: 24,
    roiPct: 40,
    breakEvenPrice: 366.67,
  })
})

test('project integration categorizes existing expenses without mutating records', () => {
  const project = {
    id: 'p1', title: '2012 Craftsman Riding Mower', purchase_price: 300,
    expenses: [
      { id:'e1', category:'parts', amount:45 },
      { id:'e2', category:'parts', amount:28 },
      { id:'e3', category:'transport', amount:12 },
      { id:'e4', category:'supplies', amount:20 },
      { id:'e5', category:'other', amount:7 },
    ],
  }
  const snapshot = JSON.stringify(project)
  assert.deepEqual(projectAnalysisDraft(project), {
    projectId:'p1', itemName:'2012 Craftsman Riding Mower', purchasePrice:300,
    repairsMaterials:20, parts:73, fuelTravel:12, shippingCost:0, otherExpenses:7,
    totalInvested:412,
  })
  assert.equal(JSON.stringify(project), snapshot)
})

test('invalid and loss inputs stay finite and rating thresholds are configurable', () => {
  const result = analyzeDeal({ purchasePrice:'bad', expectedSellingPrice:50, platformFeePct:1000, otherExpenses:100 })
  for (const value of Object.values(result)) if (typeof value === 'number') assert.equal(Number.isFinite(value), true)
  assert.equal(result.dealRating, 'LOSS')
  assert.equal(DEAL_RATING_THRESHOLDS.great.minRoiPct, 50)
})

test('break-even is not described as a loss', () => {
  assert.deepEqual(rateDeal({ expectedProfit: 0, roiPct: 0 }), {
    dealRating: 'LOW MARGIN',
    ratingTone: 'caution',
    ratingExplanation: 'This deal is projected to break even, leaving no cushion for surprises.',
  })
})

test('suggested minimum offer discloses the reduced return', () => {
  const result = calculateListPrice({ totalInvested: 405, targetMode: 'profit', targetValue: 190, platformFeePct: 13 })
  assert.equal(result.suggestedMinimumOffer, 629.2)
  assert.equal(result.minimumOfferExpectedProfit, 142.4)
  assert.equal(result.minimumOfferExpectedRoiPct, 35.16)
})

test('financial inputs normalize to cents before calculations and snapshots', () => {
  const result = analyzeDeal({ purchasePrice: 10.009, otherExpenses: 0.009, expectedSellingPrice: 20.009 })
  assert.equal(result.totalInvestment, 10.02)
  assert.equal(result.expectedRevenue, 20.01)
  assert.equal(result.expectedProfit, 9.99)
})

test('displayed monetary components reconcile exactly at cent precision', () => {
  const result = analyzeDeal({ purchasePrice:1, expectedSellingPrice:10.05, platformFeePct:10 })
  assert.equal(Math.round(result.expectedRevenue*100),Math.round((result.totalInvestment + result.totalSellingCosts + result.expectedProfit)*100))
  const list = calculateListPrice({ totalInvested:100, targetMode:'profit', targetValue:1, platformFeePct:0 })
  assert.equal(list.minimumOfferBasis,'break_even')
  assert.equal(list.minimumOfferTargetComparison,'below')
})

test('zero-cost positive-profit deals report unavailable ROI without a misleading low-margin rating', () => {
  const result=analyzeDeal({purchasePrice:0,expectedSellingPrice:1000})
  assert.equal(result.roiPct,null)
  assert.equal(result.dealRating,'GREAT FLIP')
  assert.match(result.ratingExplanation,/ROI is unavailable/)
})

test('maximum-length money inputs and 99.99 percent fees stay bounded and terminate', () => {
  const huge = '99999999999999'
  const deal = analyzeDeal({ purchasePrice: huge, expectedSellingPrice: huge, platformFeePct: 99.99 })
  const list = calculateListPrice({ totalInvested: huge, targetMode: 'profit', targetValue: huge, platformFeePct: 99.99 })
  const profit = calculateProfit({ totalInvested: huge, sellingPrice: huge, platformFeePct: 99.99 })

  for (const result of [deal, list, profit]) {
    for (const value of Object.values(result)) {
      if (typeof value === 'number') assert.equal(Number.isFinite(value), true)
    }
  }
  assert.equal(deal.totalInvestment, 1000000000)
  assert.equal(deal.expectedRevenue, 1000000000)
  assert.equal(list.targetProfit, 1000000000)
})

test('maximum-length custom ROI cannot overflow list-price gross-up arithmetic', () => {
  const result = calculateListPrice({
    totalInvested: '1000000000',
    targetMode: 'roi',
    targetValue: '9'.repeat(120),
    platformFeePct: 99.99,
    sellerPaidShipping: '1000000000',
    additionalSellingCosts: '1000000000',
  })
  for (const value of Object.values(result)) {
    if (typeof value === 'number') assert.equal(Number.isFinite(value), true)
  }
  assert.equal(result.targetProfit, 5000000000)
})
