import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'
import MyStuffItemTypePicker, { ValidationErrors } from '../components/MyStuffItemTypePicker'
import VinDecodePanel from '../components/VinDecodePanel'
import ReportPanel from '../components/ReportPanel'
import MyStuffV3Experience from '../components/MyStuffV3Experience'
import { maskVin } from '../domain/myStuff/vinModel'
import { normalizePlannedOccurrences } from '../domain/myStuff/v3Model'
import { deriveItemCategory, getItemCategoryContract, getItemTypeOption, selectItemType, supportsVinDecoder, validateItemDraft } from '../domain/myStuff/itemModel'
import {
  completeMyStuffMaintenance,
  createMyStuffMaintenanceDefinitionV2,
  deleteMyStuffItem,
  deleteMyStuffSchedule,
  getMyStuffLegacyMaintenance,
  getMyStuffItemV2,
  getMyStuffDueViewsV3,
  listMyStuffScheduleGroupsV3,
  recordMyStuffReadingV2,
  recordMyStuffServiceOccurrenceV2,
  setMyStuffItemArchivedV2,
  transferMyStuffToProjectV1,
  updateMyStuffMaintenanceDefinitionV2,
  updateMyStuffItemV2,
} from '../lib/myStuffClient'
import {
  buildCreateMaintenanceDefinitionV2WirePayload,
  buildRecordMyStuffReadingV2WirePayload,
  buildRecordServiceOccurrenceV2WirePayload,
  buildUpdateMaintenanceDefinitionV2WirePayload,
  buildUpdateMyStuffItemV2WirePayload,
} from '../lib/myStuffPayloads'
import { runMutationThenRefresh } from '../lib/mutationLifecycle'
import {
  canCompleteMaintenanceSchedule,
  canCompleteMaintenanceDefinition,
  createMutationAttemptState,
  createMutationId,
  dueStateLabel,
  filterActiveDueStates,
  getMaintenanceDefinitionAxes,
  getScheduleCurrentReading,
  getScheduleDueState,
  parseNonNegativeNumber,
  parsePositiveNumber,
  mutationIdForPayload,
  resetMutationAttemptState,
  todayDateInput,
  validateCalendarDate,
  validateMaintenanceCompletion,
} from './myStuffModel'

const ACCENT = '#C8402F'
const EMPTY_DEFINITION = { name:'', description:'', dueSemantics:'whichever_first', intervals:{miles:'',hours:'',cycles:''}, calendarMonths:'' }
const EMPTY_COMPLETION = { completedAt:todayDateInput(), readings:{miles:'',hours:'',cycles:''}, notes:'' }
const EMPTY_LEGACY_COMPLETION = { completedAt:todayDateInput(), reading:'', cost:'', notes:'' }
const EMPTY_USAGE = { type:'miles', value:'', recordedOn:todayDateInput(), correcting:false, correctionReason:'' }
const AXES = [{key:'miles',label:'Miles'},{key:'hours',label:'Hours'},{key:'cycles',label:'Cycles'}]

export default function MyStuffDetailScreen({ navigation, route }) {
  const { user, isPro: hasPro, formatMoney, currency:profileCurrency } = useAuth()
  const itemId = route.params?.itemId
  const [item,setItem]=useState(null)
  const [schedules,setSchedules]=useState([])
  const [logs,setLogs]=useState([])
  const [occurrences,setOccurrences]=useState([])
  const [readings,setReadings]=useState([])
  const [definitions,setDefinitions]=useState([])
  const [dueStates,setDueStates]=useState([])
  const [plannedOccurrences,setPlannedOccurrences]=useState([])
  const [v3MaintenanceActive,setV3MaintenanceActive]=useState(false)
  const [usage,setUsage]=useState(EMPTY_USAGE)
  const [showUsage,setShowUsage]=useState(true)
  const [loading,setLoading]=useState(true)
  const [refreshing,setRefreshing]=useState(false)
  const [saving,setSaving]=useState(false)
  const [vinConfirmationBusy,setVinConfirmationBusy]=useState(false)
  const [error,setError]=useState('')
  const [editing,setEditing]=useState(false)
  const [edit,setEdit]=useState({})
  const [validationErrors,setValidationErrors]=useState({})
  const [detailTab,setDetailTab]=useState('Maintenance')
  const [showItemSettings,setShowItemSettings]=useState(false)
  const [showDefinition,setShowDefinition]=useState(false)
  const [editingDefinitionId,setEditingDefinitionId]=useState(null)
  const [definition,setDefinition]=useState(EMPTY_DEFINITION)
  const [completingId,setCompletingId]=useState(null)
  const [completion,setCompletion]=useState(EMPTY_COMPLETION)
  const [legacyCompletingId,setLegacyCompletingId]=useState(null)
  const [legacyCompletion,setLegacyCompletion]=useState(EMPTY_LEGACY_COMPLETION)
  const [completionCelebration,setCompletionCelebration]=useState(null)
  const requestGeneration=useRef(0)
  const serviceMutationAttempt=useRef(createMutationAttemptState())
  const completionInFlight=useRef(false)
  const legacyCompletionMutationAttempt=useRef(createMutationAttemptState())
  const legacyCompletionInFlight=useRef(false)
  const definitionMutationAttempt=useRef(createMutationAttemptState())
  const definitionInFlight=useRef(false)
  const itemMutationAttempt=useRef(createMutationAttemptState())
  const identityPersistenceAttempt=useRef(createMutationAttemptState())
  const itemInFlight=useRef(false)
  const usageMutationAttempt=useRef(createMutationAttemptState())
  const usageInFlight=useRef(false)
  const archiveMutationId=useRef(null)
  const archiveInFlight=useRef(false)
  const transferAttempt=useRef(createMutationAttemptState())
  const transferInFlight=useRef(false)
  const itemOperationInFlight=useRef(false)

  const load=useCallback(async({quiet=false,throwOnError=false}={})=>{
    if(!user?.id||!itemId)return
    const generation=++requestGeneration.current
    if(!quiet)setLoading(true)
    setError('')
    try{
      const [legacy,result,v3]=await Promise.all([
        getMyStuffLegacyMaintenance(itemId,user.id),
        getMyStuffItemV2(itemId,user.id),
        Promise.all([listMyStuffScheduleGroupsV3(itemId),getMyStuffDueViewsV3(itemId,new Date().toISOString())]).then(([schedule,due])=>({available:true,schedule,due}),()=>({available:false,schedule:[],due:[]})),
      ])
      if(generation!==requestGeneration.current)return
      setItem(result.item);setSchedules(legacy.schedules);setLogs(legacy.logs)
      setUsage(current=>{
        if(result.item.measurements.includes(current.type))return current
        const type=result.item.measurements[0]||'miles'
        return {...EMPTY_USAGE,type,recordedOn:todayDateInput()}
      })
      setReadings(result.readings);setDefinitions(result.definitions);setOccurrences(result.occurrences);setDueStates(filterActiveDueStates(result.dueStates,result.item))
      setV3MaintenanceActive(v3.available)
      setPlannedOccurrences(normalizePlannedOccurrences(v3.schedule,v3.due,result.definitions))
    }catch(nextError){
      if(generation===requestGeneration.current)setError(nextError.message||'Could not load this item.')
      if(throwOnError)throw nextError
    }
    finally{if(generation===requestGeneration.current){setLoading(false);setRefreshing(false)}}
  },[itemId,user?.id])
  useFocusEffect(useCallback(()=>{
    load()
    return()=>{requestGeneration.current+=1;completionInFlight.current=false;legacyCompletionInFlight.current=false}
  },[load]))

  useEffect(()=>{
    if(!item)return
    setEdit({name:item.name||'',category:item.category||'other',itemType:item.itemType,year:item.model_year==null?'':String(item.model_year),make:item.make||'',model:item.model||'',trim:item.trim||'',series:item.series||'',manufacturer:item.manufacturer||'',vehicleType:item.vehicle_type||'',bodyStyle:item.body_style||'',plantName:item.plant_name||'',plantCountry:item.plant_country||'',vehicleMarket:item.vehicle_market||'',modelNumber:item.model_number||'',serialNumber:item.serial_number||'',vin:item.vin||'',engine:item.engine||'',engineModel:item.engine_model||'',engineDisplacementLiters:item.engine_displacement_liters==null?'':String(item.engine_displacement_liters),engineCylinders:item.engine_cylinders==null?'':String(item.engine_cylinders),transmission:item.transmission||'',drivetrain:item.drivetrain||'',fuelType:item.fuel_power_type||'',acquiredOn:item.acquired_on||'',notes:item.notes||'',usageProfile:item.usage_profile||'normal',measurements:item.measurements||[]})
  },[item?.id,item?.updated_at])

  function setEditValue(key,value){setValidationErrors({});setEdit(current=>({...current,[key]:value}))}
  function setExactType(value){setValidationErrors({});setEdit(current=>selectItemType(current,value))}
  function toggleEditMeasurement(axis){setValidationErrors({});setEdit(current=>({...current,measurements:current.measurements.includes(axis)?current.measurements.filter(value=>value!==axis):[...current.measurements,axis]}))}
  function setDefinitionValue(key,value){setDefinition(current=>({...current,[key]:value}))}
  function setDefinitionInterval(axis,value){setDefinition(current=>({...current,intervals:{...current.intervals,[axis]:value}}))}
  function setCompletionValue(key,value){setCompletion(current=>({...current,[key]:value}))}
  function setCompletionReading(axis,value){setCompletion(current=>({...current,readings:{...current.readings,[axis]:value}}))}
  function setLegacyCompletionValue(key,value){setLegacyCompletion(current=>({...current,[key]:value}))}
  function setUsageValue(key,value){setUsage(current=>({...current,[key]:value}))}

  function beginItemOperation(){
    if(itemOperationInFlight.current)return false
    itemOperationInFlight.current=true
    return true
  }
  function endItemOperation(){itemOperationInFlight.current=false}

  function reportSavedRefreshFailure(title,nextError){
    Alert.alert(title,`Your change was saved, but the latest item data could not be loaded. The existing data is still shown; pull to refresh.${nextError?.message?`\n\n${nextError.message}`:''}`)
  }

  async function saveItem(){
    if(itemInFlight.current)return
    if(edit.acquiredOn?.trim()&&!validateCalendarDate(edit.acquiredOn))return Alert.alert('Check acquisition date','Use a valid date in YYYY-MM-DD format.')
    const validatedEdit={...edit,name:String(edit.name||'').trim(),category:deriveItemCategory(edit.itemType),measurements:edit.measurements||[]}
    const validation=validateItemDraft(validatedEdit)
    setValidationErrors(validation.errors)
    if(!validation.ok)return
    if(!beginItemOperation())return Alert.alert('Finish the current change','Wait for it to finish before updating the item.')
    itemInFlight.current=true;setSaving(true)
    try{
      const {itemType,...editable}=validatedEdit
      const payload={...editable,itemId:item.id,acquiredOn:edit.acquiredOn.trim()||null,notes:edit.notes.trim()||null}
      if(itemType!==item.itemType)payload.itemType=itemType
      const wirePayload=buildUpdateMyStuffItemV2WirePayload(payload)
      const mutationId=mutationIdForPayload(itemMutationAttempt.current,wirePayload)
      await runMutationThenRefresh({
        mutate:()=>updateMyStuffItemV2(wirePayload,mutationId),
        onMutationSuccess:()=>{resetMutationAttemptState(itemMutationAttempt.current);setEditing(false)},
        refresh:()=>load({quiet:true,throwOnError:true}),
        onMutationError:nextError=>Alert.alert('Could not update item',nextError.message||'Please try again.'),
        onRefreshError:nextError=>reportSavedRefreshFailure('Item details saved, but refresh failed',nextError),
      })
    }
    finally{itemInFlight.current=false;endItemOperation();setSaving(false)}
  }

  function definitionUsageAxes(value) {
    return getMaintenanceDefinitionAxes(value).filter(axis=>axis!=='calendar')
  }

  async function persistIdentityForConfirmation(identity){
    if(itemInFlight.current)throw new Error('Another item update is already in progress.')
    const nextEdit={...edit,...identity}
    const validatedEdit={...nextEdit,name:String(nextEdit.name||'').trim(),category:deriveItemCategory(nextEdit.itemType),measurements:nextEdit.measurements||[]}
    const validation=validateItemDraft(validatedEdit)
    setValidationErrors(validation.errors)
    if(!validation.ok)throw new Error(Object.values(validation.errors)[0]||'Check the item details before confirming.')
    const {itemType,...editable}=validatedEdit
    const payload={...editable,itemId:item.id,acquiredOn:String(nextEdit.acquiredOn||'').trim()||null,notes:String(nextEdit.notes||'').trim()||null}
    if(itemType!==item.itemType)payload.itemType=itemType
    const wirePayload=buildUpdateMyStuffItemV2WirePayload(payload)
    const mutationId=mutationIdForPayload(identityPersistenceAttempt.current,wirePayload)
    itemInFlight.current=true;setSaving(true)
    try{
      await updateMyStuffItemV2(wirePayload,mutationId)
      resetMutationAttemptState(identityPersistenceAttempt.current)
    }finally{
      itemInFlight.current=false;setSaving(false)
    }
  }

  function openDefinitionEditor(value=null) {
    resetMutationAttemptState(definitionMutationAttempt.current)
    setEditingDefinitionId(value?.id||null)
    setDefinition(value?{
      name:value.name||'',description:value.description||'',dueSemantics:value.due_semantics||'whichever_first',
      intervals:{
        miles:value.normal_interval_miles==null?'':String(value.normal_interval_miles),
        hours:value.normal_interval_hours==null?'':String(value.normal_interval_hours),
        cycles:value.normal_interval_cycles==null?'':String(value.normal_interval_cycles),
      },
      calendarMonths:value.normal_calendar_months==null?'':String(value.normal_calendar_months),
    }:{...EMPTY_DEFINITION,intervals:{...EMPTY_DEFINITION.intervals}})
    setShowDefinition(true)
  }

  function cancelDefinitionEditor(){resetMutationAttemptState(definitionMutationAttempt.current);setShowDefinition(false);setEditingDefinitionId(null)}

  async function saveDefinition(){
    if(definitionInFlight.current)return
    if(!definition.name.trim())return Alert.alert('Maintenance name required','Name this maintenance task.')
    const existing=definitions.find(value=>value.id===editingDefinitionId)
    const allowedAxes=new Set([...(item.measurements||[]),...definitionUsageAxes(existing||{})])
    const intervals={}
    let hasCadence=false
    for(const axis of ['miles','hours','cycles']){
      if(!allowedAxes.has(axis))continue
      const raw=definition.intervals[axis]
      if(String(raw).trim()===''){intervals[axis]=null;continue}
      const parsed=parsePositiveNumber(raw)
      if(!parsed.ok||(axis==='cycles'&&!Number.isInteger(parsed.value)))return Alert.alert('Check interval',`${axis==='cycles'?'Cycles':'Usage'} interval must be ${axis==='cycles'?'a whole number':'a finite number'} greater than zero.`)
      intervals[axis]=parsed.value;hasCadence=true
    }
    let calendarMonths=null
    if(String(definition.calendarMonths).trim()!==''){
      const parsed=parsePositiveNumber(definition.calendarMonths)
      if(!parsed.ok||!Number.isInteger(parsed.value)||parsed.value>1200)return Alert.alert('Check calendar interval','Calendar months must be a whole number from 1 to 1,200.')
      calendarMonths=parsed.value;hasCadence=true
    }
    if(!hasCadence)return Alert.alert('Maintenance interval required','Add a calendar interval or at least one active usage interval.')
    const values={definitionId:editingDefinitionId,itemId:item.id,name:definition.name,description:definition.description,dueSemantics:definition.dueSemantics,activeProfile:item.usage_profile||'normal',cadenceAnchor:'last_completion',intervals,calendarMonths}
    const wirePayload=editingDefinitionId?buildUpdateMaintenanceDefinitionV2WirePayload(values):buildCreateMaintenanceDefinitionV2WirePayload(values)
    const mutationId=mutationIdForPayload(definitionMutationAttempt.current,wirePayload)
    if(!beginItemOperation())return Alert.alert('Finish the current change','Wait for it to finish before saving maintenance.')
    definitionInFlight.current=true;setSaving(true)
    try{
      await runMutationThenRefresh({
        mutate:()=>editingDefinitionId?updateMyStuffMaintenanceDefinitionV2(wirePayload,mutationId):createMyStuffMaintenanceDefinitionV2(wirePayload,mutationId),
        onMutationSuccess:()=>{resetMutationAttemptState(definitionMutationAttempt.current);setShowDefinition(false);setEditingDefinitionId(null);setDefinition({...EMPTY_DEFINITION,intervals:{...EMPTY_DEFINITION.intervals}})},
        refresh:()=>load({quiet:true,throwOnError:true}),
        onMutationError:nextError=>Alert.alert('Could not save maintenance task',nextError.message||'Please try again.'),
        onRefreshError:nextError=>reportSavedRefreshFailure('Maintenance task saved, but refresh failed',nextError),
      })
    }
    finally{definitionInFlight.current=false;endItemOperation();setSaving(false)}
  }

  function archiveDefinition(value){
    Alert.alert('Archive this maintenance task?','It will stop affecting due status. Its service history stays visible.',[
      {text:'Cancel',style:'cancel'},
      {text:'Archive',onPress:async()=>{
        if(definitionInFlight.current)return
        const wirePayload=buildUpdateMaintenanceDefinitionV2WirePayload({definitionId:value.id,enabled:false})
        const mutationId=mutationIdForPayload(definitionMutationAttempt.current,wirePayload)
        if(!beginItemOperation())return Alert.alert('Finish the current change','Wait for it to finish before archiving maintenance.')
        definitionInFlight.current=true;setSaving(true)
        try{await runMutationThenRefresh({
          mutate:()=>updateMyStuffMaintenanceDefinitionV2(wirePayload,mutationId),
          onMutationSuccess:()=>{resetMutationAttemptState(definitionMutationAttempt.current);setDefinitions(current=>current.map(entry=>entry.id===value.id?{...entry,enabled:false}:entry));setDueStates(current=>current.filter(entry=>entry.definition_id!==value.id))},
          refresh:()=>load({quiet:true,throwOnError:true}),
          onMutationError:nextError=>Alert.alert('Could not archive maintenance task',nextError.message||'Please try again.'),
          onRefreshError:nextError=>reportSavedRefreshFailure('Maintenance task archived, but refresh failed',nextError),
        })}
        finally{definitionInFlight.current=false;endItemOperation();setSaving(false)}
      }},
    ])
  }

  function openCompletion(value){
    if(!canCompleteMaintenanceDefinition(value,item))return Alert.alert('Measurement no longer active','Re-enable every measurement used by this task before recording service.')
    const nextReadings={miles:'',hours:'',cycles:''}
    for(const axis of definitionUsageAxes(value))nextReadings[axis]=item.currentUsage[axis]==null?'':String(item.currentUsage[axis])
    setCompletion({...EMPTY_COMPLETION,completedAt:todayDateInput(),readings:nextReadings})
    resetMutationAttemptState(serviceMutationAttempt.current)
    setCompletingId(value.id)
  }

  function cancelCompletion(){resetMutationAttemptState(serviceMutationAttempt.current);completionInFlight.current=false;setCompletingId(null)}

  async function finishMaintenance(definitionValue){
    if(completionInFlight.current)return
    if(!definitionValue.enabled||!canCompleteMaintenanceDefinition(definitionValue,item))return Alert.alert('Task cannot be completed','Archived tasks and tasks using disabled measurements are read-only.')
    if(!validateCalendarDate(completion.completedAt))return Alert.alert('Check completion date','Use a valid date in YYYY-MM-DD format.')
    const serviceReadings={}
    const configuredAxes=definitionUsageAxes(definitionValue)
    for(const axis of configuredAxes){
      const parsed=parseNonNegativeNumber(completion.readings[axis])
      if(!parsed.ok||(axis==='cycles'&&!Number.isInteger(parsed.value)))return Alert.alert('Check reading',`${axis==='cycles'?'Cycles':'Service reading'} must be ${axis==='cycles'?'a whole number':'a finite number'} of zero or more.`)
      serviceReadings[axis]=parsed.value
    }
    const wirePayload=buildRecordServiceOccurrenceV2WirePayload({itemId:item.id,definitionId:definitionValue.id,completedAt:`${completion.completedAt}T12:00:00.000Z`,readings:serviceReadings,configuredAxes,notes:completion.notes})
    const mutationId=mutationIdForPayload(serviceMutationAttempt.current,wirePayload)
    if(!beginItemOperation())return Alert.alert('Finish the current change','Wait for it to finish before recording maintenance.')
    completionInFlight.current=true;setSaving(true)
    try{
      await runMutationThenRefresh({
        mutate:()=>recordMyStuffServiceOccurrenceV2(wirePayload,mutationId),
        onMutationSuccess:()=>{resetMutationAttemptState(serviceMutationAttempt.current);setCompletingId(null);setCompletion({...EMPTY_COMPLETION,completedAt:todayDateInput(),readings:{...EMPTY_COMPLETION.readings}});setCompletionCelebration({name:definitionValue.name||'Maintenance'})},
        refresh:()=>load({quiet:true,throwOnError:true}),
        onMutationError:nextError=>Alert.alert('Could not record service',nextError.message||'Please try again. Service readings cannot move backward.'),
        onRefreshError:nextError=>reportSavedRefreshFailure('Service recorded, but refresh failed',nextError),
      })
    }
    finally{completionInFlight.current=false;endItemOperation();setSaving(false)}
  }

  function openLegacyCompletion(value){
    if(!canCompleteMaintenanceSchedule(value,item))return Alert.alert('Measurement no longer active','Re-enable this schedule measurement before completing it.')
    const reading=getScheduleCurrentReading(value,item)
    setLegacyCompletion({...EMPTY_LEGACY_COMPLETION,completedAt:todayDateInput(),reading:reading==null?'':String(reading)})
    resetMutationAttemptState(legacyCompletionMutationAttempt.current)
    setLegacyCompletingId(value.id)
  }

  function cancelLegacyCompletion(){resetMutationAttemptState(legacyCompletionMutationAttempt.current);legacyCompletionInFlight.current=false;setLegacyCompletingId(null)}

  async function finishLegacyMaintenance(scheduleValue){
    if(legacyCompletionInFlight.current)return
    if(!canCompleteMaintenanceSchedule(scheduleValue,item))return Alert.alert('Measurement no longer active','Enable this measurement in Item details before completing this legacy maintenance schedule.')
    if(!validateCalendarDate(legacyCompletion.completedAt))return Alert.alert('Check completion date','Use a valid date in YYYY-MM-DD format.')
    const cost=parseNonNegativeNumber(legacyCompletion.cost,{optional:true})
    if(!cost.ok)return Alert.alert('Check cost','Cost must be a finite number of zero or more.')
    let reading=null
    if(scheduleValue.tracking_type!=='calendar'){
      const parsed=parseNonNegativeNumber(legacyCompletion.reading)
      if(!parsed.ok)return Alert.alert('Check reading','Completion reading must be a finite number of zero or more.')
      reading=parsed.value
    }
    const validationError=validateMaintenanceCompletion(scheduleValue,legacyCompletion.completedAt,reading)
    if(validationError)return Alert.alert('Check completion',validationError)
    const canonicalPayload={scheduleId:scheduleValue.id,completedAt:legacyCompletion.completedAt,reading,cost:cost.value,notes:legacyCompletion.notes.trim()||null}
    const mutationId=mutationIdForPayload(legacyCompletionMutationAttempt.current,canonicalPayload)
    const legacyPayload={...canonicalPayload,mutationId}
    if(!beginItemOperation())return Alert.alert('Finish the current change','Wait for it to finish before recording maintenance.')
    legacyCompletionInFlight.current=true;setSaving(true)
    try{
      await runMutationThenRefresh({
        mutate:()=>completeMyStuffMaintenance(legacyPayload),
        onMutationSuccess:()=>{resetMutationAttemptState(legacyCompletionMutationAttempt.current);setLegacyCompletingId(null);setLegacyCompletion({...EMPTY_LEGACY_COMPLETION,completedAt:todayDateInput()});setCompletionCelebration({name:scheduleValue.name||'Maintenance'})},
        refresh:()=>load({quiet:true,throwOnError:true}),
        onMutationError:nextError=>Alert.alert('Could not complete maintenance',nextError.message||'Please try again.'),
        onRefreshError:nextError=>reportSavedRefreshFailure('Maintenance completed, but refresh failed',nextError),
      })
    }
    finally{legacyCompletionInFlight.current=false;endItemOperation();setSaving(false)}
  }

  async function saveUsage(){
    if(usageInFlight.current)return
    if(!item.measurements.includes(usage.type))return Alert.alert('Choose a tracked measurement',`Enable ${usage.type} in Item details before adding this reading.`)
    if(!validateCalendarDate(usage.recordedOn))return Alert.alert('Check reading date','Use a valid date in YYYY-MM-DD format.')
    const parsed=parseNonNegativeNumber(usage.value)
    if(!parsed.ok||(usage.type==='cycles'&&!Number.isInteger(parsed.value)))return Alert.alert('Check reading',usage.type==='cycles'?'Cycles must be a whole number of zero or more.':'Reading must be a finite number of zero or more.')
    const sqlType=usage.type==='miles'?'mileage':usage.type
    const latest=readings.find(value=>value.reading_type===sqlType)
    if(usage.correcting&&!latest)return Alert.alert('Nothing to correct','Add a reading before using correction mode.')
    if(usage.correcting&&!usage.correctionReason.trim())return Alert.alert('Correction reason required','Explain why the effective reading is being corrected.')
    if(!beginItemOperation())return Alert.alert('Finish the current change','Wait for it to finish before saving a reading.')
    usageInFlight.current=true;setSaving(true)
    try{
      const payload={itemId:item.id,readingType:usage.type,value:parsed.value,recordedAt:`${usage.recordedOn}T12:00:00.000Z`,correctsReadingId:usage.correcting?latest.id:null,correctionReason:usage.correcting?usage.correctionReason.trim():null}
      const wirePayload=buildRecordMyStuffReadingV2WirePayload(payload)
      const mutationId=mutationIdForPayload(usageMutationAttempt.current,wirePayload)
      await runMutationThenRefresh({
        mutate:()=>recordMyStuffReadingV2(wirePayload,mutationId),
        onMutationSuccess:()=>{resetMutationAttemptState(usageMutationAttempt.current);setUsage({...EMPTY_USAGE,recordedOn:todayDateInput()});setShowUsage(true)},
        refresh:()=>load({quiet:true,throwOnError:true}),
        onMutationError:nextError=>Alert.alert('Could not save reading',nextError.message||'Please try again. Use correction mode if the effective reading needs to move backward.'),
        onRefreshError:nextError=>reportSavedRefreshFailure('Reading saved, but refresh failed',nextError),
      })
    }
    finally{usageInFlight.current=false;endItemOperation();setSaving(false)}
  }

  function confirmArchive(){
    const archived=!item.archived_at
    Alert.alert(archived?'Archive this item?':'Restore this item?',archived?'It stays in your garage with all history retained.':'It will return to active items.',[
      {text:'Cancel',style:'cancel'},
      {text:archived?'Archive':'Restore',onPress:async()=>{
        if(archiveInFlight.current||!beginItemOperation())return Alert.alert('Finish the current change','Wait for it to finish before changing archive status.')
        archiveInFlight.current=true;setSaving(true)
        try{
          const mutationId=archiveMutationId.current||(archiveMutationId.current=createMutationId())
          await setMyStuffItemArchivedV2({itemId:item.id,archived,reason:archived?'Archived manually':null,mutationId})
          archiveMutationId.current=null;await load({quiet:true})
        }catch(nextError){Alert.alert(`Could not ${archived?'archive':'restore'} item`,nextError.message||'Please try again.')}
        finally{archiveInFlight.current=false;endItemOperation();setSaving(false)}
      }},
    ])
  }

  function confirmDeleteItem(){Alert.alert('Delete this item?','This permanently deletes its schedules and service history.',[{text:'Cancel',style:'cancel'},{text:'Delete Item',style:'destructive',onPress:async()=>{if(!beginItemOperation())return Alert.alert('Finish the current change','Wait for it to finish before deleting the item.');setSaving(true);try{await deleteMyStuffItem(item.id,user.id);navigation.goBack()}catch(nextError){Alert.alert('Could not delete item',nextError.message)}finally{endItemOperation();setSaving(false)}}}])}
  function confirmTransferToProject(){
    Alert.alert('Move this item to Projects?','A selling Project will be created with the original purchase price and each current non-voided expense copied once. This My Stuff item will be archived with all maintenance history retained.',[
      {text:'Cancel',style:'cancel'},
      {text:'Create Project',onPress:async()=>{
        if(transferInFlight.current||itemOperationInFlight.current)return Alert.alert('Finish the current change','Wait for the expense or maintenance update to finish before creating the Project.')
        const mutationId=mutationIdForPayload(transferAttempt.current,{itemId:item.id})
        transferInFlight.current=true;itemOperationInFlight.current=true;setSaving(true)
        try{
          const projectId=await transferMyStuffToProjectV1(item.id,mutationId)
          resetMutationAttemptState(transferAttempt.current)
          navigation.replace('ProjectDetail',{projectId})
        }catch(nextError){Alert.alert('Could not create Project',`${nextError.message||'Please try again.'}\n\nThe item was not assumed transferred.`)}
        finally{transferInFlight.current=false;itemOperationInFlight.current=false;setSaving(false)}
      }},
    ])
  }
  function confirmDeleteSchedule(value){Alert.alert('Delete this legacy schedule?','Existing service history remains associated with this item.',[{text:'Cancel',style:'cancel'},{text:'Delete Schedule',style:'destructive',onPress:async()=>{if(!beginItemOperation())return Alert.alert('Finish the current change','Wait for it to finish before deleting maintenance.');setSaving(true);try{await runMutationThenRefresh({
    mutate:()=>deleteMyStuffSchedule(value.id,user.id),
    onMutationSuccess:()=>setSchedules(current=>current.filter(entry=>entry.id!==value.id)),
    refresh:()=>load({quiet:true,throwOnError:true}),
    onMutationError:nextError=>Alert.alert('Could not delete schedule',nextError.message||'Please try again.'),
    onRefreshError:nextError=>reportSavedRefreshFailure('Schedule deleted, but refresh failed',nextError),
  })}finally{endItemOperation();setSaving(false)}}}])}

  if(loading)return <View style={s.center}><ActivityIndicator size="large" color={ACCENT}/></View>
  if(!item)return <View style={s.center}><Text style={s.errorText}>{error||'Item not found.'}</Text><TouchableOpacity onPress={()=>navigation.goBack()}><Text style={s.link}>Go Back</Text></TouchableOpacity></View>

  return <SafeAreaView style={s.root} edges={['top']}>
    <Header title={item.name} onBack={()=>navigation.goBack()}/>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS==='ios'?'interactive':'on-drag'} automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load({quiet:true})}} tintColor={ACCENT}/>}>
      {!!error&&<Text style={s.errorText}>{error}</Text>}
      {detailTab==='Maintenance'&&<TouchableOpacity style={s.settingsButton} onPress={()=>setShowItemSettings(value=>!value)} accessibilityRole="button" accessibilityLabel="Item settings" accessibilityState={{expanded:showItemSettings}}><Text style={s.settingsButtonText}>{showItemSettings?'Hide item settings':'Item settings'}</Text></TouchableOpacity>}
      {detailTab==='Maintenance'&&showItemSettings&&<View style={s.card}>
        <View style={s.between}><Text style={s.sectionTitle}>Item details</Text><TouchableOpacity onPress={()=>setEditing(value=>!value)} accessibilityRole="button" accessibilityLabel={editing?'Cancel editing item':'Edit item'}><Text style={s.link}>{editing?'Cancel':'Edit'}</Text></TouchableOpacity></View>
        {editing?<>
          <Field label="Item name *" value={edit.name} onChangeText={value=>setEditValue('name',value)}/>
          <MyStuffItemTypePicker value={edit.itemType} onChange={setExactType} error={validationErrors.itemType||validationErrors.category}/>
          <Field label="Model year" value={edit.year} onChangeText={value=>setEditValue('year',value)} keyboardType="number-pad"/>
          <Field label="Make" value={edit.make} onChangeText={value=>setEditValue('make',value)}/>
          <Field label="Model" value={edit.model} onChangeText={value=>setEditValue('model',value)}/>
          <Field label="Trim / version" value={edit.trim} onChangeText={value=>setEditValue('trim',value)}/>
          <Field label="Model number" value={edit.modelNumber} onChangeText={value=>setEditValue('modelNumber',value)}/>
          <Field label="Serial number" value={edit.serialNumber} onChangeText={value=>setEditValue('serialNumber',value)}/>
          {!supportsVinDecoder(edit.itemType)&&<Text style={s.muted}>Use the manufacturer model and serial numbers for equipment identity. Automatic model/serial lookup is not available yet.</Text>}
          <Field label="Engine / power system" value={edit.engine} onChangeText={value=>setEditValue('engine',value)}/>
          <Field label="Transmission" value={edit.transmission} onChangeText={value=>setEditValue('transmission',value)}/>
          <Field label="Drivetrain" value={edit.drivetrain} onChangeText={value=>setEditValue('drivetrain',value)}/>
          <Field label="Fuel / power type" value={edit.fuelType} onChangeText={value=>setEditValue('fuelType',value)}/>
          {supportsVinDecoder(edit.itemType)&&<VinDecodePanel subjectType="my_stuff_item" subjectId={item.id} values={edit} onChange={value=>{setValidationErrors({});setEdit(value)}} persistIdentity={persistIdentityForConfirmation} operationLock={itemOperationInFlight} onOperationLockChange={setVinConfirmationBusy} onIdentityConfirmed={async()=>{setEditing(false);try{await load({quiet:true,throwOnError:true})}catch(nextError){reportSavedRefreshFailure('Vehicle confirmed, but refresh failed',nextError)}}} suggestionFields={['year','make','model','trim','bodyStyle','vehicleType','manufacturer','plantName','plantCountry','vehicleMarket','fuelType','engineCylinders','engineDisplacementLiters','engineModel','engine','transmission','drivetrain']}/>}
          <Field label="Acquired on" value={edit.acquiredOn} onChangeText={value=>setEditValue('acquiredOn',value)} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation"/>
          <Text style={s.label}>Usage measurements</Text><View style={s.modeRow} accessibilityRole="group" accessibilityLabel="Usage measurements">{AXES.filter(axis=>getItemCategoryContract(edit.category).measurements.includes(axis.key)).map(axis=><Choice key={axis.key} label={axis.label} selected={edit.measurements.includes(axis.key)} onPress={()=>toggleEditMeasurement(axis.key)} multiple={true}/>)}</View>
          <Text style={s.label}>Usage profile</Text><View style={s.modeRow} accessibilityRole="radiogroup" accessibilityLabel="Usage profile">{['normal','severe'].map(value=><Choice key={value} label={value==='normal'?'Normal use':'Severe use'} selected={edit.usageProfile===value} onPress={()=>setEditValue('usageProfile',value)}/>)}</View>
          <Field label="Notes" value={edit.notes} onChangeText={value=>setEditValue('notes',value)} multiline/>
          <ValidationErrors errors={validationErrors}/>
          <Button label={saving?'Saving…':'Save Item Details'} onPress={saveItem} disabled={saving}/>
        </>:<>
          <Text style={s.itemName}>{item.name}</Text><Text style={s.muted}>{getItemTypeOption(item.itemType)?.label||'Other'} · {getItemCategoryContract(item.category)?.label||'Other'}{item.model_year?` · ${item.model_year}`:''}{item.make?` · ${item.make}`:''}{item.model?` ${item.model}`:''}</Text>
          {!!item.serial_number&&<Text style={s.muted}>Serial: {item.serial_number}</Text>}
          {!!item.vin&&supportsVinDecoder(item.itemType)&&<Text style={s.muted}>VIN: {maskVin(item.vin)}</Text>}
          {!!item.archived_at&&<Text style={s.archiveBadge}>Archived · history retained</Text>}
          {!!item.notes&&<Text style={s.notes}>{item.notes}</Text>}
        </>}
        <TouchableOpacity style={s.archiveItem} onPress={confirmArchive} disabled={saving} accessibilityRole="button" accessibilityLabel={item.archived_at?'Restore My Stuff item':'Archive My Stuff item'} accessibilityState={{disabled:saving}}><Text style={s.archiveItemText}>{item.archived_at?'Restore Item':'Archive Item'}</Text></TouchableOpacity>
        <TouchableOpacity style={s.deleteItem} onPress={confirmDeleteItem} disabled={saving} accessibilityRole="button" accessibilityLabel="Delete My Stuff item" accessibilityState={{disabled:saving}}><Text style={s.deleteItemText}>Delete Item Permanently</Text></TouchableOpacity>
      </View>}
      <MyStuffV3Experience
        item={item}
        definitions={definitions}
        plannedOccurrences={plannedOccurrences}
        formatMoney={formatMoney}
        currency={item.purchase_currency||profileCurrency}
        activeTab={detailTab}
        onTabChange={setDetailTab}
        onRefresh={()=>load({quiet:true,throwOnError:true})}
        onStartSelling={confirmTransferToProject}
        transferring={transferInFlight.current}
        operationLock={itemOperationInFlight}
        parentBusy={saving||vinConfirmationBusy}
        maintenanceUsageSection={<View style={s.card}>
          <View style={s.between}><View style={s.flex}><Text style={s.scheduleName}>Current usage</Text><Text style={s.muted}>Update mileage, hours, or cycles here. Saving immediately refreshes every schedule’s due status.</Text></View>{item.measurements.length>0&&<TouchableOpacity onPress={()=>{resetMutationAttemptState(usageMutationAttempt.current);const type=item.measurements.includes(usage.type)?usage.type:item.measurements[0];setUsage({...EMPTY_USAGE,type,value:item.currentUsage[type]==null?'':String(item.currentUsage[type]),recordedOn:todayDateInput()});setShowUsage(value=>!value)}} accessibilityRole="button" accessibilityLabel={showUsage?'Hide current usage update':'Update current usage'}><Text style={s.link}>{showUsage?'Hide':'Update'}</Text></TouchableOpacity>}</View>
          {item.measurements.length>0&&<View style={s.readingRow}>{item.measurements.map(axis=>{const config=AXES.find(value=>value.key===axis);return <Reading key={axis} label={config?.label||axis} value={item.currentUsage[axis]} suffix={axis==='miles'?'mi':axis==='hours'?'hr':'cycles'}/>})}</View>}
          {showUsage&&item.measurements.length>0&&<View>
            <Text style={s.label}>Measurement</Text><View style={s.modeRow} accessibilityRole="radiogroup" accessibilityLabel="Current usage measurement">{item.measurements.map(type=><Choice key={type} label={type} selected={usage.type===type} onPress={()=>setUsage(current=>({...current,type,value:item.currentUsage[type]==null?'':String(item.currentUsage[type])}))}/>)}</View>
            <Field label={usage.type==='miles'?'Updated mileage *':'Current reading *'} value={usage.value} onChangeText={value=>setUsageValue('value',value)} keyboardType="decimal-pad"/>
            <Field label="Recorded on *" value={usage.recordedOn} onChangeText={value=>setUsageValue('recordedOn',value)} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation"/>
            <TouchableOpacity style={s.correctionToggle} onPress={()=>setUsageValue('correcting',!usage.correcting)} accessibilityRole="checkbox" accessibilityState={{checked:usage.correcting}}><Text style={s.link}>{usage.correcting?'✓ Correction mode':'Correct the latest reading'}</Text></TouchableOpacity>
            {usage.correcting&&<><Text style={s.warning}>Corrections append an audit record. They never lower the retained meter column.</Text><Field label="Correction reason *" value={usage.correctionReason} onChangeText={value=>setUsageValue('correctionReason',value)} multiline/></>}
            <Button label={saving?'Saving…':usage.correcting?'Save Usage Correction':usage.type==='miles'?'Save Mileage':'Save Current Usage'} onPress={saveUsage} disabled={saving}/>
          </View>}
          {item.measurements.length===0&&<Text style={s.muted}>Edit Item details to enable miles, hours, or cycles.</Text>}
        </View>}
      />

      {detailTab==='Maintenance'&&<>
      {v3MaintenanceActive&&<Text style={s.muted}>Complete maintenance through V3 Due Items above. Older schedules remain visible here without a second completion action.</Text>}
      <View style={s.between}><Text style={s.pageSection}>Maintenance schedules</Text><TouchableOpacity onPress={()=>showDefinition?cancelDefinitionEditor():openDefinitionEditor()} accessibilityRole="button" accessibilityLabel={showDefinition?'Cancel maintenance task':'Add maintenance task'}><Text style={s.link}>{showDefinition?'Cancel':'+ Add'}</Text></TouchableOpacity></View>

      <Text style={s.pageSection}>Due-state summary</Text>
      {dueStates.length===0?<View style={s.empty}><Text style={s.muted}>No maintenance schedules are due yet.</Text></View>:dueStates.map(value=>{
        const definition=definitions.find(entry=>entry.id===value.definition_id)
        return <View key={value.definition_id} style={s.card}><View style={s.between}><Text style={s.scheduleName}>{definition?.name||'Maintenance'}</Text><View style={[s.pill,s[`pill_${value.due_status}`]]}><Text style={s.pillText}>{dueStateSummaryLabel(value.due_status)}</Text></View></View><Text style={s.muted}>{dueStateDescription(value)}</Text></View>
      })}

      {showDefinition&&<View style={s.card}>
        <Field label="Maintenance name *" value={definition.name} onChangeText={value=>setDefinitionValue('name',value)} placeholder="e.g. Oil change"/>
        <Field label="Description (optional)" value={definition.description} onChangeText={value=>setDefinitionValue('description',value)} multiline/>
        <Text style={s.label}>Combined due behavior</Text><View style={s.modeRow} accessibilityRole="radiogroup" accessibilityLabel="Combined maintenance due behavior">
          <Choice label="Whichever first" selected={definition.dueSemantics==='whichever_first'} onPress={()=>setDefinitionValue('dueSemantics','whichever_first')}/>
          <Choice label="All intervals" selected={definition.dueSemantics==='all'} onPress={()=>setDefinitionValue('dueSemantics','all')}/>
        </View>
        <Field label="Calendar interval in months" value={definition.calendarMonths} onChangeText={value=>setDefinitionValue('calendarMonths',value)} keyboardType="number-pad"/>
        {AXES.filter(axis=>item.measurements.includes(axis.key)||String(definition.intervals[axis.key]||'').trim()!=='').map(axis=><Field key={axis.key} label={`${axis.label} interval${item.measurements.includes(axis.key)?'':' (inactive, retained)'}`} value={definition.intervals[axis.key]} onChangeText={value=>setDefinitionInterval(axis.key,value)} keyboardType="decimal-pad" editable={item.measurements.includes(axis.key)}/>) }
        <Text style={s.muted}>You can combine calendar and usage intervals. Only measurements enabled on this item can be added to new schedules.</Text>
        <Button label={saving?'Saving…':editingDefinitionId?'Save Schedule':'Add Schedule'} onPress={saveDefinition} disabled={saving}/>
      </View>}
      {definitions.length===0?<View style={s.empty}><Text style={s.muted}>No maintenance schedules yet.</Text></View>:definitions.map(value=>{
        const due=dueStates.find(state=>state.definition_id===value.id)
        const canComplete=!v3MaintenanceActive&&value.enabled&&canCompleteMaintenanceDefinition(value,item)
        return <View key={value.id} style={s.card}>
          <View style={s.between}><View style={s.flex}><Text style={s.scheduleName}>{value.name}</Text><Text style={s.muted}>{definitionDescription(value)}</Text>{due&&<Text style={s.nextDue}>{dueStateDescription(due)}</Text>}</View><View style={[s.pill,s[`pill_${due?.due_status}`]]}><Text style={s.pillText}>{value.enabled?dueStateSummaryLabel(due?.due_status):'Archived'}</Text></View></View>
          {!!value.description&&<Text style={s.notes}>{value.description}</Text>}
          {!v3MaintenanceActive&&!canComplete&&value.enabled&&<Text style={s.warning}>Read-only until all schedule measurements are enabled on this item.</Text>}
          {completingId===value.id&&canComplete?<View style={s.completionBox}>
            <Field label="Completed on *" value={completion.completedAt} onChangeText={next=>setCompletionValue('completedAt',next)} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation"/>
            {definitionUsageAxes(value).map(axis=><Field key={axis} label={`${axis==='miles'?'Mileage':axis[0].toUpperCase()+axis.slice(1)} at completion *`} value={completion.readings[axis]} onChangeText={next=>setCompletionReading(axis,next)} keyboardType="decimal-pad"/>)}
            <Field label="Notes (optional)" value={completion.notes} onChangeText={next=>setCompletionValue('notes',next)} multiline/>
            <Button label={saving?'Saving…':'Complete Maintenance'} onPress={()=>finishMaintenance(value)} disabled={saving}/><TouchableOpacity onPress={cancelCompletion} accessibilityRole="button" accessibilityLabel="Cancel service completion"><Text style={s.cancelLink}>Cancel</Text></TouchableOpacity>
          </View>:<View style={s.actions}>
            {canComplete&&<TouchableOpacity style={s.smallButton} onPress={()=>openCompletion(value)} accessibilityRole="button" accessibilityLabel={`Complete ${value.name} maintenance`}><Text style={s.smallButtonText}>Complete</Text></TouchableOpacity>}
            {value.provenance_type==='manual'&&value.enabled&&<TouchableOpacity onPress={()=>openDefinitionEditor(value)} accessibilityRole="button" accessibilityLabel={`Edit ${value.name} schedule`}><Text style={s.link}>Edit</Text></TouchableOpacity>}
            {value.provenance_type==='manual'&&value.enabled&&<TouchableOpacity onPress={()=>archiveDefinition(value)} accessibilityRole="button" accessibilityLabel={`Archive ${value.name} schedule`}><Text style={s.deleteLink}>Archive</Text></TouchableOpacity>}
          </View>}
        </View>
      })}

      <ReportPanel subjectType="my_stuff_item" subjectId={item.id} isPro={hasPro} onUpgrade={()=>navigation.navigate('Pro')} />
      </>}

      {detailTab==='History'&&<>
      <Text style={s.pageSection}>Service history</Text>
      {occurrences.length===0?<View style={s.empty}><Text style={s.muted}>Recorded V2 service will appear here.</Text></View>:occurrences.map(occurrence=>{
        const readingsText=serviceReadingDescription(occurrence)
        return <View key={occurrence.id} style={s.historyRow}><View style={s.flex}><Text style={s.historyName}>{occurrence.service_name}</Text><Text style={s.muted}>{String(occurrence.completed_at||'').slice(0,10)}{readingsText?` · ${readingsText}`:''}</Text>{!!occurrence.latest_revision?.notes&&<Text style={s.notes}>{occurrence.latest_revision.notes}</Text>}<Text style={s.eyebrow}>{occurrence.scheduled?'Scheduled task':'Unscheduled service'} · immutable record</Text></View></View>
      })}
      </>}

      {detailTab==='Maintenance'&&<>
      <Text style={s.pageSection}>Legacy schedules</Text>
      {schedules.length===0?<View style={s.empty}><Text style={s.muted}>No legacy maintenance schedules.</Text></View>:schedules.map(value=>{
        const state=getScheduleDueState(value,item)
        const canComplete=!v3MaintenanceActive&&canCompleteMaintenanceSchedule(value,item)
        return <View key={value.id} style={s.card}>
          <View style={s.between}><View style={s.flex}><Text style={s.scheduleName}>{value.name}</Text><Text style={s.muted}>{scheduleDescription(value)}</Text></View><View style={[s.pill,s[`pill_${state}`]]}><Text style={s.pillText}>{dueStateLabel(state)}</Text></View></View>
          {!v3MaintenanceActive&&!canComplete&&value.tracking_type!=='calendar'&&<Text style={s.warning}>Legacy schedule retained as read-only because its measurement is no longer active.</Text>}
          {legacyCompletingId===value.id&&canComplete?<View style={s.completionBox}>
            <Field label="Completed on *" value={legacyCompletion.completedAt} onChangeText={next=>setLegacyCompletionValue('completedAt',next)} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation"/>
            {value.tracking_type!=='calendar'&&<Field label={`${value.tracking_type} reading *`} value={legacyCompletion.reading} onChangeText={next=>setLegacyCompletionValue('reading',next)} keyboardType="decimal-pad"/>}
            <Field label="Cost (optional)" value={legacyCompletion.cost} onChangeText={next=>setLegacyCompletionValue('cost',next)} keyboardType="decimal-pad"/>
            <Field label="Notes (optional)" value={legacyCompletion.notes} onChangeText={next=>setLegacyCompletionValue('notes',next)} multiline/>
            <Button label={saving?'Saving…':'Complete Maintenance'} onPress={()=>finishLegacyMaintenance(value)} disabled={saving}/><TouchableOpacity onPress={cancelLegacyCompletion} accessibilityRole="button" accessibilityLabel="Cancel legacy maintenance completion"><Text style={s.cancelLink}>Cancel</Text></TouchableOpacity>
          </View>:<View style={s.actions}>{canComplete&&<TouchableOpacity style={s.smallButton} onPress={()=>openLegacyCompletion(value)} accessibilityRole="button" accessibilityLabel={`Mark legacy ${value.name} complete`}><Text style={s.smallButtonText}>Mark Complete</Text></TouchableOpacity>}<TouchableOpacity onPress={()=>confirmDeleteSchedule(value)} accessibilityRole="button" accessibilityLabel={`Delete legacy ${value.name} schedule`}><Text style={s.deleteLink}>Delete</Text></TouchableOpacity></View>}
          <Text style={s.eyebrow}>Legacy schedule</Text>
        </View>
      })}
      </>}

      {detailTab==='History'&&<>
      <Text style={s.pageSection}>Legacy service history (read-only)</Text>
      {logs.length===0?<View style={s.empty}><Text style={s.muted}>No legacy service history.</Text></View>:logs.map(log=>{
        const linked=schedules.find(value=>value.id===log.schedule_id)
        const logReading=log.mileage!=null?log.mileage:log.hours!=null?log.hours:null
        const readingSuffix=log.mileage!=null?' mi':log.hours!=null?' hr':''
        return <View key={log.id} style={s.historyRow}><View style={s.flex}><Text style={s.historyName}>{log.name||linked?.name||'Maintenance'}</Text><Text style={s.muted}>{String(log.completed_at||'').slice(0,10)}{logReading!=null?` · ${Number(logReading).toLocaleString()}${readingSuffix}`:''}</Text>{!!log.notes&&<Text style={s.notes}>{log.notes}</Text>}<Text style={s.eyebrow}>Legacy · read-only</Text></View>{log.cost!=null&&<Text style={s.cost}>{formatMoney(log.cost)}</Text>}</View>
      })}
      </>}
    </ScrollView>
    <Modal visible={!!completionCelebration} transparent animationType="fade" onRequestClose={()=>setCompletionCelebration(null)}>
      <View style={s.celebrationOverlay}>
        <View style={s.celebrationCard} accessibilityViewIsModal>
          <Text style={s.celebrationIcon}>🎉</Text>
          <Text style={s.celebrationTitle}>Good Job!</Text>
          <Text style={s.celebrationText}>{completionCelebration?.name||'Maintenance'} was completed and saved.</Text>
          <TouchableOpacity style={s.celebrationButton} onPress={()=>setCompletionCelebration(null)} accessibilityRole="button" accessibilityLabel="Close maintenance success"><Text style={s.celebrationButtonText}>Done</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  </SafeAreaView>
}

function scheduleDescription(value){if(value.tracking_type==='calendar')return `Every ${value.interval_value} days · next ${String(value.next_due_at||'').slice(0,10)}`;return `Every ${Number(value.interval_value).toLocaleString()} ${value.tracking_type} · next at ${Number(value.next_due_value).toLocaleString()}`}
function definitionDescription(value){
  const prefix=value.active_profile==='severe'?'Severe profile':'Normal profile'
  const intervals=[]
  const profile=value.active_profile==='severe'?'severe':'normal'
  const values={miles:value[`${profile}_interval_miles`]??value.normal_interval_miles,hours:value[`${profile}_interval_hours`]??value.normal_interval_hours,cycles:value[`${profile}_interval_cycles`]??value.normal_interval_cycles,months:value[`${profile}_calendar_months`]??value.normal_calendar_months}
  if(values.miles!=null)intervals.push(`${Number(values.miles).toLocaleString()} mi`)
  if(values.hours!=null)intervals.push(`${Number(values.hours).toLocaleString()} hr`)
  if(values.cycles!=null)intervals.push(`${Number(values.cycles).toLocaleString()} cycles`)
  if(values.months!=null)intervals.push(`${Number(values.months).toLocaleString()} months`)
  return `${prefix} · ${intervals.join(value.due_semantics==='all'?' + ':' or ')}`
}
function serviceReadingDescription(value){const parts=[];if(value.mileage!=null)parts.push(`${Number(value.mileage).toLocaleString()} mi`);if(value.hours!=null)parts.push(`${Number(value.hours).toLocaleString()} hr`);if(value.cycles!=null)parts.push(`${Number(value.cycles).toLocaleString()} cycles`);return parts.join(' · ')}
function dueStateSummaryLabel(status){return {overdue:'Overdue',due_now:'Due now',due_soon:'Due soon',needs_usage_update:'Needs usage',upcoming:'Upcoming'}[status]||'Not calculated'}
function dueStateDescription(value){const details=[];if(value.next_due_at)details.push(`Date ${String(value.next_due_at).slice(0,10)}`);if(value.next_due_mileage!=null)details.push(`${Number(value.next_due_mileage).toLocaleString()} mi`);if(value.next_due_hours!=null)details.push(`${Number(value.next_due_hours).toLocaleString()} hr`);if(value.next_due_cycles!=null)details.push(`${Number(value.next_due_cycles).toLocaleString()} cycles`);return details.join(' · ')||'Update usage to calculate the next service.'}
function Header({title,onBack}){return <View style={s.header}><TouchableOpacity style={s.headerSide} onPress={onBack} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10}><Text style={s.back}>‹ Back</Text></TouchableOpacity><Text style={s.headerTitle} numberOfLines={1}>{title}</Text><View style={s.headerSide}/></View>}
function Field({label,multiline,...props}){return <View><Text style={s.label}>{label}</Text><TextInput style={[s.input,multiline&&s.textarea]} placeholderTextColor="#A8A49E" multiline={multiline} {...props}/></View>}
function Choice({label,selected,onPress,multiple=false}){return <TouchableOpacity style={[s.choice,selected&&s.choiceActive]} onPress={onPress} accessibilityRole={multiple?'checkbox':'radio'} accessibilityLabel={label} accessibilityState={multiple?{checked:selected}:{selected}}><Text style={[s.choiceText,selected&&s.choiceTextActive]}>{label}</Text></TouchableOpacity>}
function Button({label,onPress,disabled}){return <TouchableOpacity style={[s.button,disabled&&s.disabled]} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled,busy:disabled}}><Text style={s.buttonText}>{label}</Text></TouchableOpacity>}
function Reading({label,value,suffix}){return <View style={s.reading}><Text style={s.eyebrow}>{label}</Text><Text style={s.readingValue}>{value==null?'Not set':`${Number(value).toLocaleString()} ${suffix}`}</Text></View>}

const s=StyleSheet.create({root:{flex:1,backgroundColor:'#FAFAF7'},center:{flex:1,justifyContent:'center',alignItems:'center',padding:30,backgroundColor:'#FAFAF7'},header:{paddingTop:0,paddingBottom:12,paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#E8E4DE'},headerSide:{width:70},back:{color:ACCENT,fontWeight:'700'},headerTitle:{flex:1,textAlign:'center',fontWeight:'800',fontSize:17,color:'#1A1917'},content:{padding:18,paddingBottom:100},settingsButton:{alignSelf:'flex-end',minHeight:44,justifyContent:'center',paddingHorizontal:12,borderRadius:10,borderWidth:1,borderColor:'#D7D2CB',backgroundColor:'#fff',marginBottom:6},settingsButtonText:{color:ACCENT,fontWeight:'800'},card:{backgroundColor:'#fff',borderRadius:14,padding:16,borderWidth:1,borderColor:'#E8E4DE',marginBottom:10},between:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},flex:{flex:1},sectionTitle:{fontSize:17,fontWeight:'800',color:'#1A1917'},pageSection:{fontSize:18,fontWeight:'800',color:'#1A1917',marginTop:18,marginBottom:10},link:{color:ACCENT,fontWeight:'700'},itemName:{fontSize:23,fontWeight:'800',color:'#1A1917',marginTop:12},muted:{color:'#6B665E',lineHeight:20},notes:{color:'#444039',lineHeight:20,marginTop:8},archiveBadge:{alignSelf:'flex-start',marginTop:10,color:'#6B4B16',backgroundColor:'#FFF1C9',paddingHorizontal:9,paddingVertical:5,borderRadius:10,fontWeight:'700'},readingRow:{flexDirection:'row',flexWrap:'wrap',gap:10,marginTop:16},reading:{minWidth:'29%',flex:1,backgroundColor:'#F3F1EC',borderRadius:10,padding:12},eyebrow:{fontSize:11,fontWeight:'700',color:'#79736A',textTransform:'uppercase'},readingValue:{fontWeight:'700',color:'#1A1917',marginTop:4},label:{fontSize:13,fontWeight:'700',color:'#5C5850',marginTop:14,marginBottom:5},input:{borderWidth:1,borderColor:'#D7D2CB',borderRadius:10,padding:12,fontSize:15,color:'#1A1917',backgroundColor:'#fff'},textarea:{minHeight:90,textAlignVertical:'top'},modeRow:{flexDirection:'row',gap:7},choice:{flex:1,borderWidth:1,borderColor:'#D7D2CB',borderRadius:9,paddingVertical:10,alignItems:'center'},choiceActive:{borderColor:ACCENT,backgroundColor:'#FFF2EE'},choiceText:{color:'#5C5850',fontWeight:'600',textTransform:'capitalize'},choiceTextActive:{color:ACCENT},button:{backgroundColor:ACCENT,borderRadius:10,padding:14,alignItems:'center',marginTop:18},buttonText:{color:'#fff',fontWeight:'800'},disabled:{opacity:.6},empty:{padding:18,borderRadius:12,backgroundColor:'#fff',borderWidth:1,borderColor:'#E8E4DE'},scheduleName:{fontSize:16,fontWeight:'800',color:'#1A1917'},pill:{paddingHorizontal:9,paddingVertical:6,borderRadius:12,backgroundColor:'#EDEAE5'},pill_due:{backgroundColor:'#FFF1C9'},pill_due_now:{backgroundColor:'#FFF1C9'},pill_due_soon:{backgroundColor:'#FFF1C9'},pill_needs_usage_update:{backgroundColor:'#EDEAE5'},pill_overdue:{backgroundColor:'#FDE0DB'},pill_upcoming:{backgroundColor:'#DFF1E8'},pillText:{fontSize:11,fontWeight:'800',color:'#443F38'},actions:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:14},smallButton:{backgroundColor:'#FFF2EE',borderRadius:9,paddingHorizontal:13,paddingVertical:10},smallButtonText:{color:ACCENT,fontWeight:'800'},deleteLink:{color:'#A33A2C',fontWeight:'600'},completionBox:{marginTop:8},cancelLink:{color:'#6B665E',fontWeight:'700',textAlign:'center',padding:12},historyRow:{backgroundColor:'#fff',borderRadius:12,padding:15,borderWidth:1,borderColor:'#E8E4DE',marginBottom:8,flexDirection:'row',gap:10},historyName:{fontWeight:'800',fontSize:15,color:'#1A1917'},cost:{fontWeight:'800',color:'#1A1917'},correctionToggle:{paddingVertical:13},warning:{color:'#8A5B13',fontSize:12,lineHeight:18,marginTop:6},archiveItem:{borderWidth:1,borderColor:'#C8A25C',backgroundColor:'#FFF8E9',borderRadius:10,padding:14,alignItems:'center',marginTop:30},archiveItemText:{color:'#6B4B16',fontWeight:'800'},deleteItem:{borderWidth:1,borderColor:'#D8A39B',borderRadius:10,padding:14,alignItems:'center',marginTop:10},deleteItemText:{color:'#A33A2C',fontWeight:'800'},nextDue:{color:'#5C5850',fontSize:12,lineHeight:18,marginTop:4},celebrationOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.42)',alignItems:'center',justifyContent:'center',padding:28},celebrationCard:{width:'100%',maxWidth:360,backgroundColor:'#fff',borderRadius:20,padding:24,alignItems:'center'},celebrationIcon:{fontSize:46},celebrationTitle:{fontSize:25,fontWeight:'900',color:'#1A1917',marginTop:8},celebrationText:{fontSize:15,color:'#5C5850',lineHeight:21,textAlign:'center',marginTop:8},celebrationButton:{alignSelf:'stretch',backgroundColor:ACCENT,borderRadius:11,padding:14,alignItems:'center',marginTop:20},celebrationButtonText:{color:'#fff',fontSize:16,fontWeight:'800'},errorText:{color:'#9A3023',marginBottom:10}})
