import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildExpenseDraft,
  buildFinancialSummary,
  buildServicePayload,
  buildServiceExpenseRequest,
  classifyDueOccurrences,
  hasVehicleIdentityChanged,
  linkedOccurrenceId,
  normalizeExpenseRows,
  normalizePlannedOccurrences,
  persistThenConfirmVehicleIdentity,
  reviseExpenseByLinkage,
  serviceCompletionDefaults,
  sortExpenseHistory,
} from '../src/domain/myStuff/v3Model.js'
import { decodedVehicleSuggestions } from '../src/domain/myStuff/vinModel.js'
import { selectItemType, supportsVinDecoder } from '../src/domain/myStuff/itemModel.js'
import { createMyStuffV3Client } from '../src/lib/myStuffV3Client.js'
import { buildUpdateMyStuffItemV2WirePayload } from '../src/lib/myStuffPayloads.js'

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

test('V3 expense model preserves purchase price separately and totals immutable current revisions', () => {
  const expenses = [
    { id:'transfer', source_type:'project_transfer', latest_revision:{ amount:'125.50', category:'repair', incurred_on:'2026-01-02' } },
    { id:'service', source_type:'service', linked_occurrence_id:'occ-1', latest_revision:{ amount:80, category:'maintenance', incurred_on:'2026-01-03' } },
    { id:'upgrade', source_type:'manual', latest_revision:{ amount:40, category:'upgrade', incurred_on:'2026-01-01' } },
    { id:'void', voided_at:'2026-01-04', latest_revision:{ amount:999, category:'repair' } },
  ]
  const summary = buildFinancialSummary({ purchasePrice:1000, expenses })
  assert.deepEqual(summary, {
    purchasePrice:1000, transferredProjectSubtotal:125.5, maintenanceRepairSubtotal:80,
    upgradesSubtotal:40, otherSubtotal:0, expenseSubtotal:245.5, totalInvested:1245.5,
    categoryTotals:{ repair:125.5, maintenance:80, upgrade:40 },
  })
  assert.deepEqual(sortExpenseHistory(expenses).map(value=>value.id), ['service','transfer','upgrade','void'])
})

test('full V3 expense form creates bounded canonical data without treating purchase price as an expense', () => {
  assert.deepEqual(buildExpenseDraft({
    description:' Oil and filter ', category:'maintenance', customCategory:'', amount:'49.95',
    currency:'usd', incurredOn:'2026-09-05', vendor:' Shop ', mileage:'12000', hours:'', notes:' done ',
  }), {
    description:'Oil and filter', category:'maintenance', custom_category:null, amount:49.95,
    currency:'USD', incurred_on:'2026-09-05', vendor:'Shop', mileage:12000, hours:null, notes:'done',
  })
  assert.throws(()=>buildExpenseDraft({description:'x',category:'repair',amount:'NaN',currency:'USD',incurredOn:'2026-09-05'}), /amount/i)
})

test('due occurrences are grouped deterministically and status transitions use contract values', () => {
  const grouped = classifyDueOccurrences([
    {id:'a',due_status:'upcoming'}, {id:'b',due_status:'overdue'}, {id:'c',due_status:'due_now'},
    {id:'d',status:'completed',completed_at:'2026-09-01'}, {id:'e',due_status:'due_soon'},
  ])
  assert.deepEqual(Object.fromEntries(Object.entries(grouped).map(([key,rows])=>[key,rows.map(row=>row.id)])), {
    overdue:['b'], dueSoon:['c','e'], upcoming:['a'], completedRecently:['d'],
  })
})

test('service completion defaults current readings and richer optional fields', () => {
  assert.deepEqual(serviceCompletionDefaults({currentUsage:{miles:1234,hours:55}}, '2026-09-05'), {
    actualServiceDate:'2026-09-05', readings:{miles:'1234',hours:'55',cycles:''}, cost:'',
    providerType:'provider', providerName:'', parts:'', notes:'', receiptUri:null,
  })
})

test('VIN mapping keeps every allowlisted decoded field typed and separate', () => {
  assert.deepEqual(decodedVehicleSuggestions({
    modelYear:'2020', make:'Ford', model:'F-150', trim:'XL', series:'F-Series', bodyClass:'Pickup',
    vehicleType:'TRUCK', manufacturer:'Ford Motor Company', plantName:'Dearborn', plantCountry:'USA',
    fuelTypePrimary:'Gasoline', engineCylinders:'6', displacementLiters:'3.5', engineModel:'GTDI',
    driveType:'4WD', transmissionStyle:'Automatic',
  }), {
    year:2020, make:'Ford', model:'F-150', trim:'XL', series:'F-Series', bodyStyle:'Pickup', bodyClass:'Pickup', vehicleType:'TRUCK',
    manufacturer:'Ford Motor Company', plantName:'Dearborn', plantCountry:'USA', fuelType:'Gasoline',
    engineCylinders:6, engineDisplacementLiters:3.5, engineModel:'GTDI', engine:'3.5L · 6 cylinders', drivetrain:'4WD', transmission:'Automatic',
  })
})

test('accessible picker is collapsed, expandable, and retains selectItemType callers', () => {
  const picker = source('src/components/MyStuffItemTypePicker.js')
  assert.match(picker, /accessibilityRole="button"/)
  assert.match(picker, /accessibilityState=\{\{ expanded/)
  assert.match(picker, /accessibilityValue=\{\{ text: selected\?\.label/)
  assert.match(picker, /accessibilityRole="menu"/)
  assert.match(picker, /accessibilityRole="menuitem"/)
  assert.match(picker, /setExpanded/)
  assert.match(picker, /nestedScrollEnabled/)
  assert.doesNotMatch(picker, /accessibilityRole="radiogroup"/)
  for (const screen of ['src/screens/MyStuffCreateScreen.js','src/screens/MyStuffDetailScreen.js']) assert.match(source(screen), /selectItemType/)
})

test('V3 client sends canonical payloads with exact RPC argument names', async () => {
  const calls=[]
  const api=createMyStuffV3Client({rpc:async(name,payload)=>{calls.push({name,payload});return {data:{ok:true},error:null}}})
  await api.createExpense('item-1',{amount:12},'mutation-1')
  await api.reviseExpense('expense-1',{amount:13},'Owner edit','mutation-2')
  await api.voidExpense('expense-1','Duplicate','mutation-3')
  await api.getExpenses('item-1')
  await api.getFinancialSummary('item-1')
  await api.listScheduleGroups('item-1')
  await api.getDueViews('item-1','2026-09-05T12:00:00.000Z')
  await api.recordServiceWithExpense({itemId:'item-1',plannedOccurrenceId:'plan-1',definitionId:'def-1',service:{notes:'done'},expense:{amount:12},mutationId:'mutation-4'})
  await api.reviseServiceExpense({occurrenceId:'occ-1',expenseId:'expense-1',servicePatch:{notes:'fixed'},expensePatch:{amount:14},reason:'Correction',mutationId:'mutation-5'})
  await api.transitionOccurrenceStatus('plan-1','skipped','Owner skipped','mutation-6')
  await api.confirmVehicleIdentity('item-1',{year:2021,make:'Ford',model:'F-150',engineModel:'GTDI',engineDisplacementLiters:3.5,engineCylinders:6,bodyStyle:'Pickup',vehicleType:'TRUCK'},'mutation-7')
  await api.transferProject('project-1',{serviceExpenseIds:['project-expense-1']},'mutation-8')
  await api.transferItemToProject('item-1','mutation-9')
  assert.deepEqual(calls, [
    {name:'create_my_stuff_expense_v3',payload:{p_item_id:'item-1',p_expense:{amount:12},p_mutation_id:'mutation-1'}},
    {name:'revise_my_stuff_expense_v3',payload:{p_expense_id:'expense-1',p_patch:{amount:13},p_reason:'Owner edit',p_mutation_id:'mutation-2'}},
    {name:'void_my_stuff_expense_v3',payload:{p_expense_id:'expense-1',p_reason:'Duplicate',p_mutation_id:'mutation-3'}},
    {name:'get_my_stuff_expenses_v3',payload:{p_item_id:'item-1'}},
    {name:'get_my_stuff_financial_summary_v3',payload:{p_item_id:'item-1'}},
    {name:'list_my_stuff_schedule_groups_v3',payload:{p_item_id:'item-1'}},
    {name:'get_my_stuff_due_views_v3',payload:{p_item_id:'item-1',p_as_of:'2026-09-05T12:00:00.000Z'}},
    {name:'record_my_stuff_service_with_expense_v3',payload:{p_item_id:'item-1',p_planned_occurrence_id:'plan-1',p_definition_id:'def-1',p_service:{notes:'done'},p_expense:{amount:12},p_mutation_id:'mutation-4'}},
    {name:'revise_my_stuff_service_expense_v3',payload:{p_occurrence_id:'occ-1',p_expense_id:'expense-1',p_service_patch:{notes:'fixed'},p_expense_patch:{amount:14},p_reason:'Correction',p_mutation_id:'mutation-5'}},
    {name:'transition_my_stuff_occurrence_status_v3',payload:{p_occurrence_id:'plan-1',p_status:'skipped',p_reason:'Owner skipped',p_mutation_id:'mutation-6'}},
    {name:'confirm_my_stuff_vehicle_identity_v3',payload:{p_item_id:'item-1',p_identity:{model_year:2021,make:'Ford',model:'F-150',engine_model:'GTDI',engine_displacement_liters:3.5,engine_cylinders:6,body_style:'Pickup',vehicle_type:'TRUCK'},p_mutation_id:'mutation-7'}},

    {name:'transfer_project_to_my_stuff_v3',payload:{p_project_id:'project-1',p_options:{service_expense_ids:['project-expense-1']},p_mutation_id:'mutation-8'}},
    {name:'transfer_my_stuff_to_project_v1',payload:{p_item_id:'item-1',p_mutation_id:'mutation-9'}},
  ])
})

test('VIN decoder appears only for item types that use VINs', () => {
  for (const type of ['car','truck','motorcycle','atv','side_by_side','trailer','rv']) assert.equal(supportsVinDecoder(type), true, type)
  for (const type of ['mower','tractor','generator','equipment','tool','boat','bicycle','electronics','furniture','other']) assert.equal(supportsVinDecoder(type), false, type)
})

test('changing from a VIN type to a non-VIN type clears hidden vehicle identity', () => {
  const changed = selectItemType({
    itemType:'car',vin:'1HGCM82633A004352',trim:'EX',series:'Accord',manufacturer:'Honda Motor Co.',vehicleType:'PASSENGER CAR',
    bodyStyle:'Sedan',plantName:'Marysville',plantCountry:'USA',vehicleMarket:'US',engineModel:'K24',
    engineDisplacementLiters:'2.4',engineCylinders:'4',transmission:'Automatic',drivetrain:'FWD',
  }, 'mower')
  for (const field of ['vin','trim','series','manufacturer','vehicleType','bodyStyle','plantName','plantCountry','vehicleMarket','engineModel','engineDisplacementLiters','engineCylinders','transmission','drivetrain']) {
    assert.equal(changed[field], '', field)
  }
})

test('My Stuff opens on maintenance with expense and transfer actions while details are secondary', () => {
  const detail = source('src/screens/MyStuffDetailScreen.js')
  const experience = source('src/components/MyStuffV3Experience.js')
  assert.match(detail, /useState\('Maintenance'\)/)
  assert.match(experience, /const TABS = \['Maintenance','Expenses','History'\]/)
  assert.doesNotMatch(experience, /activeTab==='Details'/)
  assert.match(experience, /Add expense/)
  assert.match(detail, /Item settings/)
  assert.match(experience, /Move to Project to Sell/)
  assert.match(detail, /transferMyStuffToProjectV1/)
  assert.match(detail, /itemOperationInFlight/)
  assert.ok((detail.match(/beginItemOperation\(\)/g)||[]).length>=9,'all parent item/maintenance mutations claim the shared lock')
  assert.match(detail, /VinDecodePanel[^\n]+operationLock=\{itemOperationInFlight\}/)
  assert.match(detail, /onOperationLockChange=\{setVinConfirmationBusy\}/)
  assert.match(detail, /parentBusy=\{saving\|\|vinConfirmationBusy\}/)
  assert.match(experience, /statusAttempt[\s\S]*beginItemOperation\(\)/)
  assert.match(experience, /parentBusy/)
  assert.match(experience, /operationLock/)
  assert.doesNotMatch(experience, /Purchase price remains in Details/)
})

test('maintenance places current mileage before schedule tabs and omits total invested', () => {
  const detail = source('src/screens/MyStuffDetailScreen.js')
  const experience = source('src/components/MyStuffV3Experience.js')
  const maintenance = experience.slice(experience.indexOf("{activeTab==='Maintenance'"), experience.indexOf("{activeTab==='History'"))
  assert.match(detail, /maintenanceUsageSection=\{<View style=\{s\.card\}>/)
  assert.ok(maintenance.indexOf('{maintenanceUsageSection}') < maintenance.indexOf('style={s.subtabs}'))
  assert.doesNotMatch(maintenance, /Total invested/)
})

test('VIN panels are gated while model and serial fields remain available', () => {
  for (const screen of ['src/screens/MyStuffCreateScreen.js','src/screens/MyStuffDetailScreen.js']) {
    const value = source(screen)
    assert.match(value, /supportsVinDecoder/)
    assert.match(value, /Model number/)
    assert.match(value, /Serial number/)
  }
})

test('service payload links one optional expense to the same planned occurrence', () => {
  const base={itemId:'item-1',plannedOccurrenceId:'plan-1',definitionId:'def-1',service:{completed_at:'2026-09-05T12:00:00.000Z'}}
  assert.deepEqual(buildServiceExpenseRequest({...base,cost:'',description:'Oil change'}), {...base,expense:null})
  assert.deepEqual(buildServiceExpenseRequest({...base,cost:'45.50',description:'Oil change',currency:'usd',incurredOn:'2026-09-05',vendor:'DIY'}), {
    ...base, expense:{description:'Oil change',category:'maintenance',custom_category:null,amount:45.5,currency:'USD',incurred_on:'2026-09-05',vendor:'DIY',mileage:null,hours:null,notes:null},
  })
})

test('flat expense RPC rows normalize to stable IDs and editable revisions', () => {
  assert.deepEqual(normalizeExpenseRows([{expense_id:'expense-1',revision_id:'revision-2',revision_number:2,description:'Oil',category:'other',custom_category:'Track prep',amount:'45',currency:'CAD',incurred_on:'2026-09-05',vendor:'Shop',mileage:1234,hours:8,notes:'Done'}]), [{
    expense_id:'expense-1',id:'expense-1',revision_id:'revision-2',revision_number:2,description:'Oil',category:'other',custom_category:'Track prep',amount:'45',currency:'CAD',incurred_on:'2026-09-05',vendor:'Shop',mileage:1234,hours:8,notes:'Done',
    latest_revision:{id:'revision-2',revision_number:2,description:'Oil',category:'other',custom_category:'Track prep',amount:'45',currency:'CAD',incurred_on:'2026-09-05',vendor:'Shop',mileage:1234,hours:8,notes:'Done'},
  }])
})

test('owned-item identity is persisted before confirmation and stale edits never confirm', async () => {
  const calls=[]
  const snapshot={vin:'1HGCM82633A004352',year:'2003',make:'Honda',model:'Accord'}
  const result=await persistThenConfirmVehicleIdentity({
    snapshot,
    persist:async value=>calls.push(['persist',value]),
    confirm:async value=>calls.push(['confirm',value]),
    isCurrent:()=>true,
  })
  assert.deepEqual(calls,[['persist',snapshot],['confirm',snapshot]])
  assert.deepEqual(result,{confirmed:true,stale:false})

  calls.length=0
  const stale=await persistThenConfirmVehicleIdentity({snapshot,persist:async()=>calls.push(['persist']),confirm:async()=>calls.push(['confirm']),isCurrent:()=>false})
  assert.deepEqual(calls,[['persist']])
  assert.deepEqual(stale,{confirmed:false,stale:true})
})

test('owned-item update payload persists VIN and every typed confirmation identity field', () => {
  assert.deepEqual(buildUpdateMyStuffItemV2WirePayload({itemId:'item-1',vin:'1HGCM82633A004352',year:'2003',manufacturer:'Honda',make:'Honda',model:'Accord',trim:'EX',engineModel:'K24',engineDisplacementLiters:'2.4',engineCylinders:'4',transmission:'Automatic',drivetrain:'FWD',fuelType:'Gasoline',vehicleType:'PASSENGER CAR',bodyStyle:'Sedan',plantName:'Marysville',plantCountry:'USA',vehicleMarket:'US'}),{
    p_item_id:'item-1',p_patch:{vin:'1HGCM82633A004352',model_year:2003,manufacturer:'Honda',make:'Honda',model:'Accord',trim:'EX',engine_model:'K24',engine_displacement_liters:2.4,engine_cylinders:4,transmission:'Automatic',drivetrain:'FWD',fuel_power_type:'Gasoline',vehicle_type:'PASSENGER CAR',body_style:'Sedan',plant_name:'Marysville',plant_country:'USA',vehicle_market:'US'},
  })
})

test('linked service expense edits use only the atomic service-expense RPC and cannot fall through', async () => {
  const calls=[]
  const linked={id:'expense-1',linked_occurrence_id:'occurrence-1'}
  assert.equal(linkedOccurrenceId(linked),'occurrence-1')
  await reviseExpenseByLinkage({row:linked,patch:{amount:22},reason:'Owner edit',mutationId:'mutation-1',reviseExpense:async()=>calls.push('generic'),reviseServiceExpense:async request=>calls.push(request)})
  assert.deepEqual(calls,[{occurrenceId:'occurrence-1',expenseId:'expense-1',servicePatch:{},expensePatch:{amount:22},reason:'Owner edit',mutationId:'mutation-1'}])

  calls.length=0
  await reviseExpenseByLinkage({row:{id:'expense-2'},patch:{amount:10},reason:'Owner edit',mutationId:'mutation-2',reviseExpense:async(...args)=>calls.push(args),reviseServiceExpense:async()=>calls.push('linked')})
  assert.deepEqual(calls,[['expense-2',{amount:10},'Owner edit','mutation-2']])
})

test('V3 planned and due RPC rows retain planned occurrence identity', () => {
  const schedule=[{id:'plan-1',definition_id:'def-1',status:'not_completed',due_at:'2026-10-01'}]
  const due=[{occurrence:{id:'plan-1',definition_id:'def-1',status:'not_completed',due_at:'2026-10-01'},view:'due_soon'}]
  assert.deepEqual(normalizePlannedOccurrences(schedule,due,[{id:'def-1',name:'Oil change'}]), [{id:'plan-1',planned_occurrence_id:'plan-1',definition_id:'def-1',status:'not_completed',due_at:'2026-10-01',name:'Oil change',due_status:'due_soon'}])
})

test('service form builds only the exact structured backend service contract', () => {
  assert.deepEqual(buildServicePayload({
    occurrence:{name:'Oil change',service_category:'maintenance',service_action:'replace'},actualServiceDate:'2026-09-05',
    readings:{miles:'12000',hours:'',cycles:''},providerType:'provider',providerName:'SideFlip Auto',parts:'Filter and oil',notes:'Done',
  }), {service_name:'Oil change',service_category:'maintenance',service_action:'replace',completed_at:'2026-09-05T12:00:00.000Z',mileage:12000,parts:[{description:'Filter and oil'}],labor:[],vendor:{type:'provider',name:'SideFlip Auto'},warranty:{},notes:'Done'})
})

test('editing any research-critical typed field invalidates confirmed VIN identity', () => {
  const confirmed={vin:'1FTFW1E50MFA00001',year:2021,make:'Ford',model:'F-150',engineModel:'GTDI',engineDisplacementLiters:3.5,engineCylinders:6,transmission:'Automatic',drivetrain:'4WD',vehicleMarket:'US'}
  assert.equal(hasVehicleIdentityChanged(confirmed,{...confirmed}),false)
  for(const field of Object.keys(confirmed)) assert.equal(hasVehicleIdentityChanged(confirmed,{...confirmed,[field]:`${confirmed[field]} changed`}),true,field)
})

test('V3 client uses exact approved RPC names and keeps legacy exports', () => {
  const client = source('src/lib/myStuffClient.js') + source('src/lib/myStuffV3Client.js')
  for (const rpc of [
    'create_my_stuff_expense_v3','revise_my_stuff_expense_v3','void_my_stuff_expense_v3',
    'get_my_stuff_expenses_v3','get_my_stuff_financial_summary_v3',
    'record_my_stuff_service_with_expense_v3','revise_my_stuff_service_expense_v3',
    'confirm_my_stuff_vehicle_identity_v3','list_my_stuff_schedule_groups_v3','get_my_stuff_due_views_v3','transition_my_stuff_occurrence_status_v3','transfer_project_to_my_stuff_v3','transfer_my_stuff_to_project_v1',
  ]) assert.match(client, new RegExp(`(?:rpc|call)\\('${rpc}'`), rpc)
  for (const legacy of ['createMyStuffItem','completeMyStuffMaintenance','recordMyStuffServiceOccurrenceV2']) assert.match(client, new RegExp(`export async function ${legacy}`))
})

test('V3 native experience exposes tabs, forms, status controls, provenance, and truthful fallback', () => {
  const detail = source('src/components/MyStuffV3Experience.js')
  for (const copy of [
    'Expenses','Maintenance','History','Schedule','Due Items','Purchase price','Transferred project',
    'Maintenance & repairs','Upgrades','Total invested','Linked service','Add expense','Edit expense',
    'Actual service date','Current mileage','Current hours','Cost','Provider / DIY','Parts',
    'Overdue','Due soon','Upcoming','Completed recently','Not applicable','Skipped','History unknown',
    'Manufacturer interval','Unavailable','manual',
  ]) assert.match(detail, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'), copy)
  assert.match(detail, /accessibilityRole="tablist"/)
  assert.match(detail, /accessibilityRole="tab"/)
  assert.match(detail, /InputAccessoryView/)
  assert.doesNotMatch(detail, /ImagePicker|Select receipt photo|Receipt \/ photo/)
})

test('Free decode and identity confirmation are reachable while unapproved research enqueue is absent', () => {
  const vin = source('src/components/VinDecodePanel.js')
  assert.doesNotMatch(vin, /if \(!isPro\) return onUpgrade\(\)/)
  assert.match(vin, /Basic NHTSA decode/)
  assert.match(vin, /Confirm Vehicle/)
  assert.match(vin, /Unconfirmed/)
  assert.match(vin, /Verified/)
  assert.match(vin, /confirmMyStuffVehicleIdentityV3/)
  assert.doesNotMatch(vin, /enqueueMyStuffResearchV3|enqueue_my_stuff_research_v3|Confirm Vehicle & Research/)
  assert.match(vin, /Research is not available yet/)
})

test('V3 detail loads planned schedules and due views without duplicate V2/history rendering', () => {
  const detail=source('src/screens/MyStuffDetailScreen.js')
  const experience=source('src/components/MyStuffV3Experience.js')
  assert.match(detail,/listMyStuffScheduleGroupsV3/)
  assert.match(detail,/getMyStuffDueViewsV3/)
  assert.match(detail,/plannedOccurrences=\{plannedOccurrences\}/)
  assert.doesNotMatch(experience,/legacyLogs\.map|occurrences\.map/)
})

test('detail parent wires safe VIN persistence and makes legacy completion read-only while V3 is active', () => {
  const detail=source('src/screens/MyStuffDetailScreen.js')
  assert.match(detail,/persistIdentity=\{persistIdentityForConfirmation\}/)
  assert.match(detail,/v3MaintenanceActive/)
  assert.match(detail,/!v3MaintenanceActive&&value.enabled&&canCompleteMaintenanceDefinition/)
  assert.match(detail,/!v3MaintenanceActive&&canCompleteMaintenanceSchedule/)
})

test('V3 runtime uses linked-service atomic revisions, supplied money formatting, linked history, and truthful attachment copy', () => {
  const experience=source('src/components/MyStuffV3Experience.js')
  assert.match(experience,/reviseMyStuffServiceExpenseV3/)
  assert.match(experience,/reviseExpenseByLinkage/)
  assert.match(experience,/!linkedOccurrenceId\(row\).*confirmVoid/)
  assert.match(experience,/Linked expense/)
  assert.match(experience,/Receipt and attachment controls are unavailable/)
  assert.match(experience,/formatMoney\(value\)/)
  assert.doesNotMatch(experience,/style:'currency',currency:'USD'/)
  assert.doesNotMatch(experience,/currency:'USD'/)
  assert.match(experience,/statusInFlight\.current/)
  assert.match(experience,/mutationIdForPayload\(statusAttempt\.current,\{ occurrenceId,status \}\)/)
  assert.match(experience,/resetMutationAttemptState\(statusAttempt\.current\)/)
  assert.doesNotMatch(experience,/setMyStuffOccurrenceStatusV3\([^\n]+Crypto\.randomUUID\(\)/)
})

test('Project detail requires transfer confirmation and calls only V3 transfer RPC', () => {
  const project = source('src/screens/ProjectDetailScreen.js')
  assert.match(project, /Transfer to My Stuff/)
  assert.match(project, /transferProjectToMyStuffV3/)
  assert.match(project, /Alert\.alert\('Transfer project to My Stuff\?'/)
  assert.doesNotMatch(project, /rpc\('transfer_project_to_my_stuff_v2'/)
})
