import test from 'node:test'
import assert from 'node:assert/strict'
import { ANALYSIS_SCHEMA_VERSION, createAnalysisStore, normalizeSavedAnalyses } from '../src/lib/analysisStore.js'

function memoryStorage() {
  const values=new Map()
  return {
    values,
    async getItem(key){return values.get(key)??null},
    async setItem(key,value){await new Promise(resolve=>setTimeout(resolve,1));values.set(key,value)},
    async removeItem(key){values.delete(key)},
  }
}
function record(id='a',overrides={}) {
  return {
    schemaVersion:ANALYSIS_SCHEMA_VERSION,id,itemName:'Mower',projectId:null,platform:'facebook',currency:'USD',
    estimateSource:'user_entered',calculationVersion:1,analyzedAt:'2026-09-06T20:00:00.000Z',
    purchasePrice:100,estimatedExpenses:20,expectedSellingPrice:200,projectedProfit:80,projectedRoi:66.67,
    maximumPurchasePrice:160,recommendedListPrice:220,
    inputs:{purchasePrice:'100',repairsMaterials:'20',parts:'',fuelTravel:'',shippingCost:'',otherExpenses:'',expectedSellingPrice:'200',platformFeePct:'0',sellerPaidShipping:'',salesTaxOtherFees:'',desiredMinimumProfit:'40'},
    ...overrides,
  }
}

test('saved analysis normalization allowlists schema, fields, currency, and unique IDs',()=>{
  const valid=record('same',{unknown:{private:'discard me'}})
  const rows=normalizeSavedAnalyses([valid,record('same'),record('future',{schemaVersion:999}),record('currency',{currency:'BTC'}),record('bad-input',{inputs:{...valid.inputs,purchasePrice:{}}})])
  assert.equal(rows.length,1)
  assert.equal(rows[0].id,'same')
  assert.equal('unknown' in rows[0],false)
  assert.equal(rows[0].currency,'USD')
})

test('concurrent saves and deletes serialize without lost updates',async()=>{
  const storage=memoryStorage(),store=createAnalysisStore(storage)
  await Promise.all([store.saveAnalysis('u',record('a')),store.saveAnalysis('u',record('b'))])
  assert.deepEqual((await store.loadSavedAnalyses('u')).map(row=>row.id).sort(),['a','b'])
  await Promise.all([store.deleteSavedAnalysis('u','a'),store.saveAnalysis('u',record('c'))])
  assert.deepEqual((await store.loadSavedAnalyses('u')).map(row=>row.id).sort(),['b','c'])
})

test('accepted maximum inputs can save safe derived values above the input cap',async()=>{
  const storage=memoryStorage(),store=createAnalysisStore(storage)
  const saved=await store.saveAnalysis('u',record('extreme',{
    estimatedExpenses:5000000000,
    projectedProfit:-7999900000,
    recommendedListPrice:39999999999960,
  }))
  assert.equal(saved.estimatedExpenses,5000000000)
  assert.equal(saved.projectedProfit,-7999900000)
  assert.equal(saved.recommendedListPrice,39999999999960)
})

test('corrupted storage and failed deletion are surfaced',async()=>{
  const storage=memoryStorage(),store=createAnalysisStore(storage)
  storage.values.set('sideflip:saved-analyses:u','{bad json')
  await assert.rejects(store.loadSavedAnalyses('u'),/corrupted/)
  storage.removeItem=async()=>{throw new Error('disk failure')}
  await assert.rejects(store.clearSavedAnalyses('u'),/disk failure/)
})
