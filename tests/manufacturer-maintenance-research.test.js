import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createMaintenanceResearchClient } from '../src/lib/maintenanceResearchClient.js'
import {
  createResearchRequestGate,
  evidenceForCandidate,
  formatResearchInterval,
  normalizeResearchReview,
  researchCanPoll,
  researchSourceAccessibilityLabel,
  researchSourceClassLabel,
} from '../src/domain/myStuff/maintenanceResearchModel.js'
import { requiresResearchIdentityReconfirmation } from '../src/domain/myStuff/itemModel.js'

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

test('research client uses the narrow lifecycle RPCs with explicit idempotency', async () => {
  const calls = []
  const database = { rpc: async (name,payload) => { calls.push({name,payload});return {data:{name},error:null} } }
  const client = createMaintenanceResearchClient(database)
  await client.enqueue('item-1','a'.repeat(64),'enqueue-1')
  await client.getStatus('item-1')
  await client.getReview('job-1')
  await client.approve('job-1',['candidate-a'],'approve-1')
  await client.apply('approval-1','apply-1')
  await client.cancel('job-1','cancel-1')
  assert.deepEqual(calls,[
    {name:'enqueue_my_stuff_research_v3',payload:{p_item_id:'item-1',p_confirmed_fingerprint:'a'.repeat(64),p_mutation_id:'enqueue-1'}},
    {name:'get_my_stuff_research_status_v1',payload:{p_item_id:'item-1'}},
    {name:'get_my_stuff_research_review_v1',payload:{p_job_id:'job-1'}},
    {name:'approve_my_stuff_research_v1',payload:{p_job_id:'job-1',p_candidate_ids:['candidate-a'],p_mutation_id:'approve-1'}},
    {name:'apply_my_stuff_research_v1',payload:{p_approval_id:'approval-1',p_mutation_id:'apply-1'}},
    {name:'cancel_my_stuff_research_v1',payload:{p_job_id:'job-1',p_mutation_id:'cancel-1'}},
  ])
})

test('research client propagates server authorization and availability errors', async () => {
  const error = Object.assign(new Error('PRO_REQUIRED'),{code:'42501'})
  const client = createMaintenanceResearchClient({rpc:async()=>({data:null,error})})
  await assert.rejects(()=>client.getStatus('item-1'),value=>value===error)
})

test('review normalization joins citation evidence and preserves unresolved results', () => {
  const review=normalizeResearchReview({
    job:{id:'job-1',status:'awaiting_review'},
    candidates:[{id:'candidate-a',name:'Engine oil',action:'replace',profile:'normal',dueSemantics:'whichever_first',intervalMiles:7500,evidenceIds:['e1'],uncertainty:'low'}],
    evidence:[{id:'row-1',evidence_key:'e1',title:'2020 owner guide',canonical_url:'https://manufacturer.test/manual.pdf',exact_excerpt:'Replace every 7,500 miles.',page:'42',accessed_at:'2026-09-07T12:00:00.000Z',applicability:'2020 model',source_class:'manufacturer'}],
    unresolved:[{name:'Coolant',reason:'Conflicting intervals'}],
  })
  assert.equal(review.jobId,'job-1')
  assert.equal(review.candidates[0].id,'candidate-a')
  assert.deepEqual(evidenceForCandidate(review.candidates[0],review.evidence).map(row=>row.key),['e1'])
  assert.equal(review.unresolved[0].reason,'Conflicting intervals')
  assert.equal(review.evidence[0].accessedOn,'2026-09-07T12:00:00.000Z')
  assert.equal(formatResearchInterval(review.candidates[0]),'Every 7,500 mi')
  assert.equal(researchCanPoll('queued'),true)
  assert.equal(researchCanPoll('running'),true)
  assert.equal(researchCanPoll('awaiting_review'),false)
})

test('research request gate rejects old items and inactive screen generations', () => {
  const gate=createResearchRequestGate()
  gate.activate('item-a')
  const first=gate.snapshot('item-a')
  assert.equal(gate.isCurrent(first),true)
  assert.equal(gate.isCurrent(first,'item-b',true),false)
  assert.equal(gate.isCurrent(first,'item-a',false),false)
  gate.activate('item-b')
  assert.equal(gate.isCurrent(first),false)
  const second=gate.snapshot('item-b')
  assert.equal(gate.isCurrent(second),true)
  gate.invalidate()
  assert.equal(gate.isCurrent(second),false)
})

test('evidence source classes have accurate visible and accessibility labels', () => {
  assert.equal(researchSourceClassLabel('manufacturer'),'Manufacturer source')
  assert.equal(researchSourceClassLabel('authorized_dealer'),'Authorized-dealer source')
  assert.equal(researchSourceAccessibilityLabel({sourceClass:'manufacturer',title:'Owner guide'}),'Manufacturer source: Owner guide')
  assert.match(researchSourceAccessibilityLabel({ sourceClass:'authorized_dealer',title:'Dealer schedule' }),/Authorized-dealer source/)
  assert.equal(researchSourceClassLabel('unexpected'),'Unverified source')
  assert.match(researchSourceAccessibilityLabel({ sourceClass:'',title:'Unknown' }),/Unverified source/)
})

test('supported item-type changes require a fresh identity confirmation', () => {
  assert.equal(requiresResearchIdentityReconfirmation('car','truck'),true)
  assert.equal(requiresResearchIdentityReconfirmation('truck','truck'),false)
  assert.equal(requiresResearchIdentityReconfirmation('car','mower'),false)
  assert.equal(requiresResearchIdentityReconfirmation('mower','truck'),false)
})

test('native detail exposes Pro-only explicit review, approval, and apply gates without replacing manual entry', () => {
  const detail=source('src/screens/MyStuffDetailScreen.js')
  const panel=source('src/components/ManufacturerMaintenanceResearch.js')
  assert.match(detail,/ManufacturerMaintenanceResearch/)
  assert.match(detail,/isPro=\{hasPro\}/)
  assert.match(panel,/Research manufacturer schedule/)
  assert.match(panel,/Anthropic/)
  assert.match(panel,/item type/i)
  assert.match(panel,/VIN, notes, costs, and expenses are never sent/)
  assert.match(panel,/Review suggestions/)
  assert.match(panel,/Approve cited suggestions/)
  assert.match(panel,/Apply approved schedules/)
  assert.match(panel, /status\?\.status==='cancelled'.*Research again/s)
  assert.doesNotMatch(panel,/research_identity_fingerprint/)
  assert.match(panel,/candidate\.action/)
  assert.match(panel,/\['superseded','deleted'\].includes\(status\?\.status\)/)
  assert.match(panel,/Open source/)
  assert.match(panel,/Linking\.openURL/)
  assert.match(panel,/Manual schedule entry stays available/)
  assert.match(panel,/navigation|onUpgrade/)
  assert.match(panel,/captureEvent\('my_stuff_research_started'/)
  assert.match(panel,/captureEvent\('my_stuff_research_completed'/)
  assert.match(panel,/captureEvent\('my_stuff_research_failed'/)
  assert.match(detail,/\{showDefinition\?'Cancel':'\+ Add'\}/)
  assert.match(panel,/useIsFocused/)
  assert.match(panel,/requestGate\.current\.snapshot\(item\.id\)/)
  assert.match(panel,/isCurrentRequest\(snapshot\)/)
  assert.match(panel,/selectionJobId\.current!==next\.jobId/)
  assert.match(panel,/if\(mounted\.current\)setBusy\(false\);releaseOperation\(token\)/)
  assert.doesNotMatch(panel,/invalidate\(\);loadGeneration\.current\+=1;releaseOperation\(\)/)
  assert.match(panel,/if\(!isFocused\|\|!researchCanPoll/)
  assert.match(panel,/researchSourceClassLabel\(source\.sourceClass\)/)
  assert.doesNotMatch(panel,/<View key=\{source\.key\}[^>]*\saccessible(?:\s|>)/)
  assert.match(panel,/accessibilityRole="link" accessibilityLabel=\{`Open/)
  for (const label of ['Retry research status','Research manufacturer schedule again','Approve cited research suggestions','Research updated manufacturer guidance']) assert.match(panel,new RegExp(label))
  assert.match(panel,/const retryButton=.*accessibilityRole="button".*accessibilityLabel=\{label\}.*accessibilityState=\{\{disabled\}\}/)
  assert.match(panel,/accessibilityState=\{\{disabled\}\}/)
  assert.match(detail,/requiresResearchIdentityReconfirmation/)
  assert.match(detail,/setResearchConfirmationInvalidated\(true\)/)
  assert.match(detail,/Confirm the current vehicle identity again/)
  assert.match(detail,/!researchConfirmationInvalidated&&<ManufacturerMaintenanceResearch/)
})
