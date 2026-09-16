import test from 'node:test'
import assert from 'node:assert/strict'
import { createMyStuffListClient } from '../src/lib/myStuffListClient.js'
import { createTradeUpGoalClient } from '../src/lib/tradeUpGoalClient.js'

test('My Stuff list RPC returns every row with backend lock state', async () => {
  const calls=[]
  const rows=[
    {id:'oldest',created_at:'2026-01-01T00:00:00Z',is_locked:false,usage_dimensions:['mileage'],current_mileage:10},
    {id:'later',created_at:'2026-01-02T00:00:00Z',is_locked:true,usage_dimensions:['hours'],current_hours:2},
  ]
  const client=createMyStuffListClient({rpc:async(name,payload)=>{calls.push({name,payload});return {data:rows,error:null}}})
  const result=await client.list({includeArchived:true,excludeTransferred:true})
  assert.deepEqual(calls,[{name:'list_my_stuff_items_v4',payload:{p_include_archived:true,p_exclude_transferred:true}}])
  assert.equal(result.length,2)
  assert.equal(result[0].is_locked,false)
  assert.equal(result[1].is_locked,true)
  assert.deepEqual(result[0].currentUsage,{miles:10})
})

test('goal update RPC accepts matching scalar UUID on initial and replayed success', async () => {
  const calls=[]
  const database={rpc:async(name,payload)=>{calls.push({name,payload});return {data:'goal-1',error:null}}}
  const client=createTradeUpGoalClient(database)
  const first=await client.update('goal-1','completed',500,'mutation-1','user-1')
  const replay=await client.update('goal-1','completed',500,'mutation-1','user-1')
  assert.equal(first,'goal-1')
  assert.equal(replay,'goal-1')
  assert.deepEqual(calls,[
    {name:'update_trade_up_goal',payload:{p_goal_id:'goal-1',p_status:'completed',p_target_amount:500,p_mutation_id:'mutation-1'}},
    {name:'update_trade_up_goal',payload:{p_goal_id:'goal-1',p_status:'completed',p_target_amount:500,p_mutation_id:'mutation-1'}},
  ])

  const missing=createTradeUpGoalClient({rpc:async()=>({data:null,error:null})})
  await assert.rejects(()=>missing.update('goal-1','active',500,'mutation-2','user-1'),/matching goal id/i)
  const foreign=createTradeUpGoalClient({rpc:async()=>({data:'goal-2',error:null})})
  await assert.rejects(()=>foreign.update('goal-1','active',500,'mutation-3','user-1'),/matching goal id/i)
})
