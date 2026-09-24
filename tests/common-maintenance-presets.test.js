import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  COMMON_MAINTENANCE_DISCLAIMER,
  COMMON_MAINTENANCE_PRESETS,
  activeDefinitionMatchesPreset,
  buildCommonMaintenanceDraft,
  normalizeMaintenanceIdentity,
} from '../src/domain/myStuff/commonMaintenancePresets.js'
import { addCommonMaintenancePresets } from '../src/lib/commonMaintenancePresetWorkflow.js'

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

function sourceFiles(directory) {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory,name)
    return statSync(path).isDirectory() ? sourceFiles(path) : [path]
  }).filter(path => /\.(?:js|jsx|ts|tsx)$/.test(path))
}

const CANONICAL_EXPECTED_CONTRACT = JSON.parse(source('tests/fixtures/common-maintenance-presets.expected.json'))
const PRESET_FIELDS = ['id','name','catalogAction','persistedAction','miles','months']

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function contractHash(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

test('Android presets equal the checked-in iOS/PWA contract bidirectionally by hash and field', () => {
  const androidContract={disclaimer:COMMON_MAINTENANCE_DISCLAIMER,presets:COMMON_MAINTENANCE_PRESETS.map(value=>({...value}))}
  assert.deepEqual(androidContract,CANONICAL_EXPECTED_CONTRACT)
  assert.deepEqual(CANONICAL_EXPECTED_CONTRACT,androidContract)
  assert.equal(contractHash(androidContract),contractHash(CANONICAL_EXPECTED_CONTRACT))
  assert.equal(contractHash(CANONICAL_EXPECTED_CONTRACT),'3a97a10f75cd478e6c6fc79557970954cfaea6889826fea6e118739bdbf15e39')

  const androidById=new Map(androidContract.presets.map(value=>[value.id,value]))
  const expectedById=new Map(CANONICAL_EXPECTED_CONTRACT.presets.map(value=>[value.id,value]))
  for(const [id,actual] of androidById){
    const expected=expectedById.get(id)
    assert.ok(expected,`unexpected Android preset ${id}`)
    assert.deepEqual(Object.keys(actual).sort(),[...PRESET_FIELDS].sort())
    for(const field of PRESET_FIELDS)assert.deepEqual(actual[field],expected[field],`${id}.${field}`)
  }
  for(const [id,expected] of expectedById){
    const actual=androidById.get(id)
    assert.ok(actual,`missing Android preset ${id}`)
    for(const field of PRESET_FIELDS)assert.deepEqual(expected[field],actual[field],`${id}.${field}`)
  }
  assert.equal(androidById.size,expectedById.size)
})

test('preset drafts preserve actions, whichever-first semantics, and editable supported axes', () => {
  for (const preset of COMMON_MAINTENANCE_PRESETS) {
    const draft=buildCommonMaintenanceDraft(preset,{measurements:['miles'],usage_profile:'normal'})
    assert.equal(draft.name,preset.name)
    assert.equal(draft.serviceAction,preset.persistedAction)
    assert.equal(draft.dueSemantics,'whichever_first')
    assert.equal(draft.activeProfile,'normal')
    assert.equal(draft.calendarMonths,preset.months)
    assert.equal(draft.intervals.miles,preset.miles)
    assert.match(draft.description,/starting point/i)
    assert.match(draft.description,/owner’s manual/i)
  }
  assert.deepEqual(buildCommonMaintenanceDraft(COMMON_MAINTENANCE_PRESETS[2],{measurements:[],usage_profile:'severe'}).intervals,{miles:null,hours:null,cycles:null})
})

test('duplicate identity normalizes name and action and ignores archived definitions', () => {
  const oil=COMMON_MAINTENANCE_PRESETS[0]
  assert.equal(normalizeMaintenanceIdentity('  Timing BELT / chain—inspection  '),'timing belt chain inspection')
  assert.equal(activeDefinitionMatchesPreset({name:' Oil & Filter Change ',service_action:'SERVICE',enabled:true},oil),true)
  assert.equal(activeDefinitionMatchesPreset({name:'Oil and filter change',service_action:'service',enabled:false},oil),false)
  assert.equal(activeDefinitionMatchesPreset({name:'Oil and filter change',service_action:'inspect',enabled:true},oil),false)
})

test('preset workflow skips active duplicates, reuses retry IDs, and rereads every create', async () => {
  const oil=COMMON_MAINTENANCE_PRESETS[0]
  const tires=COMMON_MAINTENANCE_PRESETS[1]
  let definitions=[{id:'existing',name:' OIL & FILTER CHANGE ',service_action:'service',enabled:true}]
  const events=[]
  let firstTireCall=true
  const result=await addCommonMaintenancePresets({
    presets:[oil,tires],
    readDefinitions:async()=>{events.push('read');return structuredClone(definitions)},
    mutationIdForPreset:preset=>`${preset.id}-stable-id`,
    createDefinition:async(preset,mutationId)=>{
      events.push(['create',preset.id,mutationId])
      if(preset.id==='tire-rotation'&&firstTireCall){
        firstTireCall=false
        definitions.push({id:'created',name:preset.name,service_action:preset.persistedAction,enabled:true})
        throw new Error('response lost')
      }
    },
  })
  assert.deepEqual(result,{created:['tire-rotation'],skipped:['oil-filter']})
  assert.deepEqual(events,['read',['create','tire-rotation','tire-rotation-stable-id'],'read'])

  let calls=0
  await assert.rejects(()=>addCommonMaintenancePresets({
    presets:[tires],
    readDefinitions:async()=>[],
    mutationIdForPreset:()=> 'same-id-after-real-failure',
    createDefinition:async(_preset,mutationId)=>{calls+=1;assert.equal(mutationId,'same-id-after-real-failure');throw new Error('not saved')},
  }),/not saved/)
  assert.equal(calls,1)
})

test('preset workflow allows a schedule to be re-added after archival', async () => {
  const oil=COMMON_MAINTENANCE_PRESETS[0]
  let definitions=[{id:'archived',name:' OIL & FILTER CHANGE ',service_action:'service',enabled:false}]
  const created=[]
  const result=await addCommonMaintenancePresets({
    presets:[oil],
    readDefinitions:async()=>structuredClone(definitions),
    mutationIdForPreset:()=> 'oil-after-archive',
    createDefinition:async(preset,mutationId)=>{
      created.push([preset.id,mutationId])
      definitions.push({id:'replacement',name:preset.name,service_action:preset.persistedAction,enabled:true})
    },
  })
  assert.deepEqual(result,{created:['oil-filter'],skipped:[]})
  assert.deepEqual(created,[['oil-filter','oil-after-archive']])
})

test('reachable Android source removes research while retaining VIN, history, and explicit editable preset adds', () => {
  const srcRoot=new URL('../src',import.meta.url).pathname
  const combined=sourceFiles(srcRoot).map(path=>readFileSync(path,'utf8')).join('\n')
  for(const forbidden of [
    /ManufacturerMaintenanceResearch/,
    /maintenanceResearchClient/,
    /enqueue_my_stuff_research/i,
    /get_my_stuff_research/i,
    /approve_my_stuff_research/i,
    /apply_my_stuff_research/i,
    /cancel_my_stuff_research/i,
    /Research manufacturer schedule/i,
    /manufacturer maintenance research/i,
    /my_stuff_research_(?:started|completed|failed)/i,
  ])assert.doesNotMatch(combined,forbidden)

  const detail=source('src/screens/MyStuffDetailScreen.js')
  const maintenanceApi=source('src/lib/myStuffMaintenanceApi.js')
  const vin=source('src/components/VinDecodePanel.js')
  assert.match(detail,/Common maintenance schedules/)
  assert.match(detail,/COMMON_MAINTENANCE_DISCLAIMER/)
  assert.match(detail,/onPress=\{\(\)=>togglePreset\(preset\.id\)\}/)
  assert.match(detail,/accessibilityRole="checkbox"/)
  assert.match(detail,/Add selected/)
  assert.match(detail,/Add this schedule/)
  assert.match(detail,/addPresetSchedules\(\[preset\.id\]\)/)
  assert.match(detail,/createMyStuffMaintenanceDefinitionV2/)
  assert.match(detail,/updateMyStuffMaintenanceDefinitionV2/)
  assert.match(detail,/openDefinitionEditor\(value\)/)
  assert.match(detail,/getMyStuffItemV2/)
  assert.match(detail,/mutationIdForPreset:presetMutationId/)
  assert.match(maintenanceApi,/client\.rpc\('create_my_stuff_maintenance_definition_v2'/)
  assert.match(vin,/createVinDecodeClient/)
  assert.match(vin,/Decode VIN with NHTSA/)
  assert.match(vin,/confirmMyStuffVehicleIdentityV3/)
})
