import test from 'node:test'
import assert from 'node:assert/strict'
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
import { buildCreateMaintenanceDefinitionV2WirePayload } from '../src/lib/myStuffPayloads.js'

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

function sourceFiles(directory) {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory,name)
    return statSync(path).isDirectory() ? sourceFiles(path) : [path]
  }).filter(path => /\.(?:js|jsx|ts|tsx)$/.test(path))
}

test('common vehicle presets expose the exact disclaimer and conservative editable defaults', () => {
  assert.equal(COMMON_MAINTENANCE_DISCLAIMER, 'Common starting points — check your owner’s manual.')
  assert.deepEqual(COMMON_MAINTENANCE_PRESETS, [
    { id:'oil-filter', name:'Oil and filter change', catalogAction:'replace', persistedAction:'service', miles:5000, months:6 },
    { id:'tire-rotation', name:'Tire rotation', catalogAction:'rotate', persistedAction:'service', miles:5000, months:6 },
    { id:'brake-inspection', name:'Brake inspection', catalogAction:'inspect', persistedAction:'inspect', miles:10000, months:12 },
    { id:'brake-fluid', name:'Brake fluid service', catalogAction:'replace', persistedAction:'service', miles:null, months:24 },
    { id:'transmission-fluid', name:'Transmission fluid service', catalogAction:'replace', persistedAction:'service', miles:60000, months:48 },
    { id:'coolant', name:'Coolant service', catalogAction:'replace', persistedAction:'service', miles:60000, months:60 },
    { id:'engine-air-filter', name:'Engine air filter', catalogAction:'replace', persistedAction:'service', miles:30000, months:36 },
    { id:'cabin-air-filter', name:'Cabin air filter', catalogAction:'replace', persistedAction:'service', miles:15000, months:12 },
    { id:'spark-plugs', name:'Spark plugs', catalogAction:'replace', persistedAction:'service', miles:60000, months:60 },
    { id:'battery-inspection', name:'Battery inspection', catalogAction:'inspect', persistedAction:'inspect', miles:null, months:12 },
    { id:'timing-belt-chain-inspection', name:'Timing belt/chain inspection', catalogAction:'inspect', persistedAction:'inspect', miles:60000, months:60 },
  ])
  for (const preset of COMMON_MAINTENANCE_PRESETS) {
    const draft = buildCommonMaintenanceDraft(preset,{ measurements:['miles'], usage_profile:'normal' })
    assert.equal(draft.dueSemantics,'whichever_first')
    assert.equal(draft.activeProfile,'normal')
    assert.equal(draft.calendarMonths,preset.months)
    assert.equal(draft.intervals.miles,preset.miles)
    assert.match(draft.description,/starting point/i)
    assert.match(draft.description,/owner’s manual/i)
  }
  assert.equal(COMMON_MAINTENANCE_PRESETS.at(-1).name.includes('replacement'),false)
})

test('preset drafts never invent unsupported mileage and identity matching normalizes name and action', () => {
  const preset = COMMON_MAINTENANCE_PRESETS[2]
  assert.deepEqual(buildCommonMaintenanceDraft(preset,{ measurements:[], usage_profile:'severe' }).intervals,{miles:null,hours:null,cycles:null})
  assert.equal(normalizeMaintenanceIdentity('  Timing BELT / chain—inspection  '),'timing belt chain inspection')
  assert.equal(activeDefinitionMatchesPreset({name:' Oil & Filter Change ',service_action:'SERVICE',enabled:true},COMMON_MAINTENANCE_PRESETS[0]),true)
  assert.equal(activeDefinitionMatchesPreset({name:'Oil and filter change',service_action:'inspect',enabled:true},COMMON_MAINTENANCE_PRESETS[0]),false)
  assert.equal(activeDefinitionMatchesPreset({name:'Oil and filter change',service_action:'service',enabled:false},COMMON_MAINTENANCE_PRESETS[0]),false)
})

test('catalog semantics stay distinct while every preset freezes the supported RPC wire action', () => {
  const detail=source('src/screens/MyStuffDetailScreen.js')
  assert.match(detail,/preset\.catalogAction/)
  assert.deepEqual(COMMON_MAINTENANCE_PRESETS.map(preset=>({
    id:preset.id,
    catalogAction:preset.catalogAction,
    wire:buildCommonMaintenanceDraft(preset,{measurements:['miles'],usage_profile:'normal'}).serviceAction,
  })), [
    {id:'oil-filter',catalogAction:'replace',wire:'service'},
    {id:'tire-rotation',catalogAction:'rotate',wire:'service'},
    {id:'brake-inspection',catalogAction:'inspect',wire:'inspect'},
    {id:'brake-fluid',catalogAction:'replace',wire:'service'},
    {id:'transmission-fluid',catalogAction:'replace',wire:'service'},
    {id:'coolant',catalogAction:'replace',wire:'service'},
    {id:'engine-air-filter',catalogAction:'replace',wire:'service'},
    {id:'cabin-air-filter',catalogAction:'replace',wire:'service'},
    {id:'spark-plugs',catalogAction:'replace',wire:'service'},
    {id:'battery-inspection',catalogAction:'inspect',wire:'inspect'},
    {id:'timing-belt-chain-inspection',catalogAction:'inspect',wire:'inspect'},
  ])
  assert.deepEqual(buildCreateMaintenanceDefinitionV2WirePayload({
    itemId:'vehicle-1',
    ...buildCommonMaintenanceDraft(COMMON_MAINTENANCE_PRESETS[1],{measurements:['miles'],usage_profile:'normal'}),
  }), {
    p_item_id:'vehicle-1',
    p_definition:{
      name:'Tire rotation',
      description:'Common starting point only; edit it for this vehicle and check your owner’s manual.',
      service_category:'other',
      service_action:'service',
      due_semantics:'whichever_first',
      active_profile:'normal',
      cadence_anchor:'last_completion',
      normal_interval_miles:5000,
      normal_calendar_months:6,
      enabled:true,
    },
  })
})

test('preset workflow skips active duplicates, reuses retry IDs, and confirms every create by rereading', async () => {
  const oil = COMMON_MAINTENANCE_PRESETS[0]
  const tires = COMMON_MAINTENANCE_PRESETS[1]
  let definitions = [{id:'existing',name:' OIL & FILTER CHANGE ',service_action:'service',enabled:true}]
  const events=[]
  let firstTireCall=true
  const result = await addCommonMaintenancePresets({
    presets:[oil,tires],
    readDefinitions:async()=>{events.push('read');return structuredClone(definitions)},
    mutationIdForPreset:preset=>`${preset.id}-stable-id`,
    createDefinition:async(preset,mutationId)=>{
      events.push(['create',preset.id,mutationId])
      if (preset.id==='tire-rotation' && firstTireCall) {
        firstTireCall=false
        definitions.push({id:'created',name:preset.name,service_action:preset.persistedAction,enabled:true})
        throw new Error('response lost')
      }
    },
  })
  assert.deepEqual(result,{created:['tire-rotation'],skipped:['oil-filter']})
  assert.deepEqual(events,[
    'read',
    ['create','tire-rotation','tire-rotation-stable-id'],
    'read',
  ])

  let calls=0
  await assert.rejects(()=>addCommonMaintenancePresets({
    presets:[tires],
    readDefinitions:async()=>[],
    mutationIdForPreset:()=> 'same-id-after-real-failure',
    createDefinition:async(_preset,mutationId)=>{calls+=1;assert.equal(mutationId,'same-id-after-real-failure');throw new Error('not saved')},
  }),/not saved/)
  assert.equal(calls,1)
})

test('reachable iOS source removes maintenance research while retaining VIN decode and editable manual schedules', () => {
  const srcRoot = new URL('../src',import.meta.url).pathname
  const combined = sourceFiles(srcRoot).map(path=>readFileSync(path,'utf8')).join('\n')
  for (const forbidden of [
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
  ]) assert.doesNotMatch(combined,forbidden)

  const detail=source('src/screens/MyStuffDetailScreen.js')
  const vin=source('src/components/VinDecodePanel.js')
  assert.match(detail,/Common maintenance schedules/)
  assert.match(detail,/COMMON_MAINTENANCE_DISCLAIMER/)
  assert.match(detail,/Add selected/)
  assert.match(detail,/Add this schedule/)
  assert.match(detail,/createMyStuffMaintenanceDefinitionV2/)
  assert.match(detail,/updateMyStuffMaintenanceDefinitionV2/)
  assert.match(detail,/openDefinitionEditor\(value\)/)
  assert.match(vin,/createVinDecodeClient/)
  assert.match(vin,/Decode VIN with NHTSA/)
  assert.match(vin,/confirmMyStuffVehicleIdentityV3/)
})
