import AsyncStorage from '@react-native-async-storage/async-storage'
import { CURRENCY_SYMBOLS } from './currencyModel.js'

export const ANALYSIS_SCHEMA_VERSION = 1
export const MAX_SAVED_ANALYSES = 100
export const MAX_ANALYSIS_RECORD_BYTES = 4096
export const MAX_ANALYSIS_STORE_BYTES = 256000
const keyFor = userId => `sideflip:saved-analyses:${userId}`
const MONEY_FIELDS = ['purchasePrice','estimatedExpenses','expectedSellingPrice','projectedProfit','maximumPurchasePrice','recommendedListPrice']
const INPUT_FIELDS = ['purchasePrice','repairsMaterials','parts','fuelTravel','shippingCost','otherExpenses','expectedSellingPrice','platformFeePct','sellerPaidShipping','salesTaxOtherFees','desiredMinimumProfit']
const PLATFORM_KEYS = new Set(['none','facebook','craigslist','ebay','custom'])
const MAX_INPUT_MONEY = 1000000000
// Derived gross-up values can exceed any one accepted input at high fees. Keep
// them below the safe integer-cent boundary while preserving valid analyses.
const MAX_DERIVED_MONEY = 80000000000000

function boundedString(value,max,allowEmpty=false) {
  if (typeof value !== 'string') return null
  const text=value.trim()
  return (allowEmpty || text) && text.length<=max ? text : null
}
function finiteBounded(value,{min=-1e9,max=1e9,nullable=false}={}) {
  if (nullable && value == null) return null
  const number=Number(value)
  return Number.isFinite(number)&&number>=min&&number<=max ? number : undefined
}
function normalizeRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record) || record.schemaVersion!==ANALYSIS_SCHEMA_VERSION) return null
  const id=boundedString(record.id,100), itemName=boundedString(record.itemName,120)
  const analyzedAt=boundedString(record.analyzedAt,40)
  const currency=boundedString(record.currency,3)
  const platform=boundedString(record.platform,30)
  if (!id||!itemName||!analyzedAt||Number.isNaN(Date.parse(analyzedAt))||!currency||!CURRENCY_SYMBOLS[currency]||!platform||!PLATFORM_KEYS.has(platform)) return null
  if (!record.inputs||typeof record.inputs!=='object'||Array.isArray(record.inputs)) return null
  const inputs={}
  for (const field of INPUT_FIELDS) {
    const value=finiteBounded(record.inputs[field],{min:0,max:1e9})
    if (value===undefined) return null
    inputs[field]=String(record.inputs[field]).trim()
  }
  const normalized={
    schemaVersion:ANALYSIS_SCHEMA_VERSION,id,projectId:record.projectId==null?null:boundedString(record.projectId,100),
    itemName,platform,currency,estimateSource:record.estimateSource==='user_entered'?'user_entered':'user_entered',
    calculationVersion:record.calculationVersion===1?1:1,analyzedAt,inputs,
  }
  if (record.projectId!=null&&!normalized.projectId) return null
  for (const field of MONEY_FIELDS) {
    const isDirectInput=field==='purchasePrice'||field==='expectedSellingPrice'
    const limit=isDirectInput?MAX_INPUT_MONEY:MAX_DERIVED_MONEY
    const value=finiteBounded(record[field],{min:-limit,max:limit})
    if (value===undefined) return null
    normalized[field]=Math.round(value*100)/100
  }
  const roi=finiteBounded(record.projectedRoi,{min:-1e6,max:1e6,nullable:true})
  if (roi===undefined) return null
  normalized.projectedRoi=roi==null?null:Math.round(roi*100)/100
  if (JSON.stringify(normalized).length>MAX_ANALYSIS_RECORD_BYTES) return null
  return normalized
}

export function normalizeSavedAnalyses(value) {
  if (!Array.isArray(value)) return []
  const seen=new Set(), result=[]
  for (const candidate of value) {
    const record=normalizeRecord(candidate)
    if (!record||seen.has(record.id)) continue
    seen.add(record.id); result.push(record)
    if (result.length===MAX_SAVED_ANALYSES) break
  }
  return result
}

export function createAnalysisStore(storage=AsyncStorage) {
  const queues=new Map()
  async function read(userId) {
    if (!userId) return []
    const raw=await storage.getItem(keyFor(userId))
    if (!raw) return []
    if (raw.length>MAX_ANALYSIS_STORE_BYTES) throw new Error('Saved analysis data is too large.')
    let parsed
    try { parsed=JSON.parse(raw) } catch { throw new Error('Saved analysis data is corrupted.') }
    return normalizeSavedAnalyses(parsed)
  }
  async function load(userId) {
    if (!userId) return []
    const pending=queues.get(userId)
    if (pending) await pending
    return read(userId)
  }
  function mutate(userId,operation) {
    if (!userId) return Promise.reject(new Error('Sign in to manage saved analyses.'))
    const previous=queues.get(userId)||Promise.resolve()
    const next=previous.catch(()=>{}).then(operation)
    queues.set(userId,next)
    return next.finally(()=>{ if(queues.get(userId)===next) queues.delete(userId) })
  }
  async function write(userId,records) {
    const json=JSON.stringify(records)
    if (json.length>MAX_ANALYSIS_STORE_BYTES) throw new Error('Saved analysis storage limit reached.')
    await storage.setItem(keyFor(userId),json)
  }
  return {
    loadSavedAnalyses:load,
    saveAnalysis(userId,record) { return mutate(userId,async()=>{ const candidate={...record,id:record?.id||`${Date.now()}-${Math.random().toString(36).slice(2,10)}`,analyzedAt:record?.analyzedAt||new Date().toISOString(),schemaVersion:ANALYSIS_SCHEMA_VERSION}; const normalized=normalizeRecord(candidate); if(!normalized) throw new Error('Analysis data is invalid.'); const current=await read(userId); const next=[normalized,...current.filter(item=>item.id!==normalized.id)].slice(0,MAX_SAVED_ANALYSES); await write(userId,next); return normalized }) },
    deleteSavedAnalysis(userId,analysisId) { return mutate(userId,async()=>{ const current=await read(userId); const next=current.filter(item=>item.id!==analysisId); await write(userId,next); return next }) },
    clearSavedAnalyses(userId) { return mutate(userId,()=>storage.removeItem(keyFor(userId))) },
  }
}

const defaultStore=createAnalysisStore()
export const loadSavedAnalyses=(...args)=>defaultStore.loadSavedAnalyses(...args)
export const saveAnalysis=(...args)=>defaultStore.saveAnalysis(...args)
export const deleteSavedAnalysis=(...args)=>defaultStore.deleteSavedAnalysis(...args)
export const clearSavedAnalyses=(...args)=>defaultStore.clearSavedAnalyses(...args)
