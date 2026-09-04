import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'
import {
  completeMyStuffMaintenance,
  createMyStuffSchedule,
  deleteMyStuffItem,
  deleteMyStuffSchedule,
  getMyStuffItem,
  getMyStuffItemV2,
  recordMyStuffReadingV2,
  setMyStuffItemArchivedV2,
  updateMyStuffItemV2,
} from '../lib/myStuffClient'
import { buildRecordMyStuffReadingV2WirePayload, buildUpdateMyStuffItemV2WirePayload } from '../lib/myStuffPayloads'
import {
  addCalendarDays,
  createMutationAttemptState,
  createMutationId,
  dueStateLabel,
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
const EMPTY_SCHEDULE = { name:'', mode:'mileage', interval:'', lastReading:'', lastDate:'' }
const EMPTY_COMPLETION = { completedAt:todayDateInput(), reading:'', cost:'', notes:'' }
const EMPTY_USAGE = { type:'miles', value:'', recordedOn:todayDateInput(), correcting:false, correctionReason:'' }

export default function MyStuffDetailScreen({ navigation, route }) {
  const { user, formatMoney } = useAuth()
  const itemId = route.params?.itemId
  const [item,setItem]=useState(null)
  const [schedules,setSchedules]=useState([])
  const [logs,setLogs]=useState([])
  const [readings,setReadings]=useState([])
  const [definitions,setDefinitions]=useState([])
  const [dueStates,setDueStates]=useState([])
  const [usage,setUsage]=useState(EMPTY_USAGE)
  const [showUsage,setShowUsage]=useState(false)
  const [loading,setLoading]=useState(true)
  const [refreshing,setRefreshing]=useState(false)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [editing,setEditing]=useState(false)
  const [edit,setEdit]=useState({})
  const [showSchedule,setShowSchedule]=useState(false)
  const [schedule,setSchedule]=useState(EMPTY_SCHEDULE)
  const [completingId,setCompletingId]=useState(null)
  const [completion,setCompletion]=useState(EMPTY_COMPLETION)
  const requestGeneration=useRef(0)
  const completionMutationId=useRef(null)
  const completionInFlight=useRef(false)
  const scheduleMutationId=useRef(null)
  const scheduleInFlight=useRef(false)
  const itemMutationAttempt=useRef(createMutationAttemptState())
  const itemInFlight=useRef(false)
  const usageMutationAttempt=useRef(createMutationAttemptState())
  const usageInFlight=useRef(false)
  const archiveMutationId=useRef(null)
  const archiveInFlight=useRef(false)

  const load=useCallback(async({quiet=false}={})=>{
    if(!user?.id||!itemId)return
    const generation=++requestGeneration.current
    if(!quiet)setLoading(true)
    setError('')
    try{
      const [legacy,result]=await Promise.all([getMyStuffItem(itemId,user.id),getMyStuffItemV2(itemId,user.id)])
      if(generation!==requestGeneration.current)return
      setItem(result.item);setSchedules(legacy.schedules);setLogs(legacy.logs)
      setReadings(result.readings);setDefinitions(result.definitions);setDueStates(result.dueStates)
    }catch(nextError){if(generation===requestGeneration.current)setError(nextError.message||'Could not load this item.')}
    finally{if(generation===requestGeneration.current){setLoading(false);setRefreshing(false)}}
  },[itemId,user?.id])
  useFocusEffect(useCallback(()=>{
    load()
    return()=>{requestGeneration.current+=1;completionInFlight.current=false}
  },[load]))

  useEffect(()=>{
    if(!item)return
    setEdit({name:item.name||'',category:item.category||'other',itemType:item.itemType,year:item.model_year==null?'':String(item.model_year),make:item.make||'',model:item.model||'',trim:item.trim||'',modelNumber:item.model_number||'',serialNumber:item.serial_number||'',engine:item.engine||'',transmission:item.transmission||'',drivetrain:item.drivetrain||'',fuelType:item.fuel_power_type||'',acquiredOn:item.acquired_on||'',notes:item.notes||'',usageProfile:item.usage_profile||'normal',measurements:item.measurements||[]})
  },[item?.id,item?.updated_at])

  function setEditValue(key,value){setEdit(current=>({...current,[key]:value}))}
  function setScheduleValue(key,value){setSchedule(current=>({...current,[key]:value}))}
  function setCompletionValue(key,value){setCompletion(current=>({...current,[key]:value}))}
  function setUsageValue(key,value){setUsage(current=>({...current,[key]:value}))}

  async function saveItem(){
    if(itemInFlight.current)return
    if(!edit.name?.trim())return Alert.alert('Item name required','Enter a name for this item.')
    if(edit.acquiredOn?.trim()&&!validateCalendarDate(edit.acquiredOn))return Alert.alert('Check acquisition date','Use a valid date in YYYY-MM-DD format.')
    if(edit.year&&(!Number.isInteger(Number(edit.year))||Number(edit.year)<1800||Number(edit.year)>2200))return Alert.alert('Check model year','Model year must be a whole number between 1800 and 2200.')
    itemInFlight.current=true;setSaving(true)
    try{
      const {itemType,...editable}=edit
      const payload={...editable,itemId:item.id,category:edit.category.trim()||'other',acquiredOn:edit.acquiredOn.trim()||null,notes:edit.notes.trim()||null}
      if(itemType!==item.itemType)payload.itemType=itemType
      const wirePayload=buildUpdateMyStuffItemV2WirePayload(payload)
      const mutationId=mutationIdForPayload(itemMutationAttempt.current,wirePayload)
      await updateMyStuffItemV2(wirePayload,mutationId)
      resetMutationAttemptState(itemMutationAttempt.current);setEditing(false);await load({quiet:true})
    }catch(nextError){Alert.alert('Could not update item',nextError.message||'Please try again.')}
    finally{itemInFlight.current=false;setSaving(false)}
  }

  async function addSchedule(){
    if(scheduleInFlight.current)return
    if(!schedule.name.trim())return Alert.alert('Maintenance name required','Name this maintenance task.')
    const interval=parsePositiveNumber(schedule.interval)
    if(!interval.ok)return Alert.alert('Check interval','Interval must be a finite number greater than zero.')
    let lastCompletedValue=null,lastCompletedAt=null,nextDueValue=null,nextDueAt=null
    if(schedule.mode==='calendar'){
      if(!validateCalendarDate(schedule.lastDate))return Alert.alert('Check service date','Use a valid date in YYYY-MM-DD format.')
      if(!Number.isInteger(interval.value)||interval.value>36500)return Alert.alert('Check interval','Calendar interval must be a whole number from 1 to 36,500 days.')
      lastCompletedAt=schedule.lastDate
      nextDueAt=addCalendarDays(lastCompletedAt,interval.value)
      if(!nextDueAt)return Alert.alert('Check schedule','The next due date must remain within the supported 1900–2200 range.')
    }else{
      const reading=parseNonNegativeNumber(schedule.lastReading)
      if(!reading.ok)return Alert.alert('Check reading','Last service reading must be a finite number of zero or more.')
      lastCompletedValue=reading.value
      nextDueValue=reading.value+interval.value
    }
    scheduleInFlight.current=true
    setSaving(true)
    try{
      const mutationId=scheduleMutationId.current||(scheduleMutationId.current=createMutationId())
      await createMyStuffSchedule({itemId:item.id,name:schedule.name.trim(),trackingType:schedule.mode,intervalValue:interval.value,lastCompletedAt,lastCompletedValue,mutationId})
      scheduleMutationId.current=null;setSchedule(EMPTY_SCHEDULE);setShowSchedule(false);await load({quiet:true})
    }catch(nextError){Alert.alert('Could not add maintenance',nextError.message||'Please try again.')}
    finally{scheduleInFlight.current=false;setSaving(false)}
  }

  function toggleScheduleForm(){
    if(showSchedule){scheduleMutationId.current=null;setShowSchedule(false);return}
    scheduleMutationId.current=createMutationId();setShowSchedule(true)
  }

  function openCompletion(value){
    const reading=value.tracking_type==='mileage'?(item.effective_current_mileage??item.current_mileage):value.tracking_type==='hours'?(item.effective_current_hours??item.current_hours):''
    setCompletion({...EMPTY_COMPLETION,completedAt:todayDateInput(),reading:reading==null?'':String(reading)})
    completionMutationId.current=createMutationId()
    setCompletingId(value.id)
  }

  function cancelCompletion(){completionMutationId.current=null;completionInFlight.current=false;setCompletingId(null)}

  async function finishMaintenance(scheduleValue){
    if(completionInFlight.current)return
    if(!validateCalendarDate(completion.completedAt))return Alert.alert('Check completion date','Use a valid date in YYYY-MM-DD format.')
    const cost=parseNonNegativeNumber(completion.cost,{optional:true})
    if(!cost.ok)return Alert.alert('Check cost','Cost must be a finite number of zero or more.')
    let reading=null
    if(scheduleValue.tracking_type!=='calendar'){
      const parsed=parseNonNegativeNumber(completion.reading)
      if(!parsed.ok)return Alert.alert('Check reading','Completion reading must be a finite number of zero or more.')
      reading=parsed.value
    }
    const validationError=validateMaintenanceCompletion(scheduleValue,completion.completedAt,reading)
    if(validationError)return Alert.alert('Check completion',validationError)
    completionInFlight.current=true
    setSaving(true)
    try{
      const mutationId=completionMutationId.current||(completionMutationId.current=createMutationId())
      await completeMyStuffMaintenance({scheduleId:scheduleValue.id,completedAt:completion.completedAt,reading,cost:cost.value,notes:completion.notes.trim()||null,mutationId})
      completionMutationId.current=null;setCompletingId(null);await load({quiet:true})
    }catch(nextError){Alert.alert('Could not complete maintenance',nextError.message||'Please try again.')}
    finally{completionInFlight.current=false;setSaving(false)}
  }

  async function saveUsage(){
    if(usageInFlight.current)return
    if(!validateCalendarDate(usage.recordedOn))return Alert.alert('Check reading date','Use a valid date in YYYY-MM-DD format.')
    const parsed=parseNonNegativeNumber(usage.value)
    if(!parsed.ok||(usage.type==='cycles'&&!Number.isInteger(parsed.value)))return Alert.alert('Check reading',usage.type==='cycles'?'Cycles must be a whole number of zero or more.':'Reading must be a finite number of zero or more.')
    const sqlType=usage.type==='miles'?'mileage':usage.type
    const latest=readings.find(value=>value.reading_type===sqlType)
    if(usage.correcting&&!latest)return Alert.alert('Nothing to correct','Add a reading before using correction mode.')
    if(usage.correcting&&!usage.correctionReason.trim())return Alert.alert('Correction reason required','Explain why the effective reading is being corrected.')
    usageInFlight.current=true;setSaving(true)
    try{
      const payload={itemId:item.id,readingType:usage.type,value:parsed.value,recordedAt:`${usage.recordedOn}T12:00:00.000Z`,correctsReadingId:usage.correcting?latest.id:null,correctionReason:usage.correcting?usage.correctionReason.trim():null}
      const wirePayload=buildRecordMyStuffReadingV2WirePayload(payload)
      const mutationId=mutationIdForPayload(usageMutationAttempt.current,wirePayload)
      await recordMyStuffReadingV2(wirePayload,mutationId)
      resetMutationAttemptState(usageMutationAttempt.current);setUsage({...EMPTY_USAGE,recordedOn:todayDateInput()});setShowUsage(false);await load({quiet:true})
    }catch(nextError){Alert.alert('Could not save reading',nextError.message||'Please try again. Use correction mode if the effective reading needs to move backward.')}
    finally{usageInFlight.current=false;setSaving(false)}
  }

  function confirmArchive(){
    const archived=!item.archived_at
    Alert.alert(archived?'Archive this item?':'Restore this item?',archived?'It stays in your garage with all history retained.':'It will return to active items.',[
      {text:'Cancel',style:'cancel'},
      {text:archived?'Archive':'Restore',onPress:async()=>{
        if(archiveInFlight.current)return
        archiveInFlight.current=true;setSaving(true)
        try{
          const mutationId=archiveMutationId.current||(archiveMutationId.current=createMutationId())
          await setMyStuffItemArchivedV2({itemId:item.id,archived,reason:archived?'Archived manually':null,mutationId})
          archiveMutationId.current=null;await load({quiet:true})
        }catch(nextError){Alert.alert(`Could not ${archived?'archive':'restore'} item`,nextError.message||'Please try again.')}
        finally{archiveInFlight.current=false;setSaving(false)}
      }},
    ])
  }

  function confirmDeleteItem(){Alert.alert('Delete this item?','This permanently deletes its schedules and service history.',[{text:'Cancel',style:'cancel'},{text:'Delete Item',style:'destructive',onPress:async()=>{setSaving(true);try{await deleteMyStuffItem(item.id,user.id);navigation.goBack()}catch(nextError){Alert.alert('Could not delete item',nextError.message)}finally{setSaving(false)}}}])}
  function confirmDeleteSchedule(value){Alert.alert('Delete this schedule?','Existing service history remains associated with this item.',[{text:'Cancel',style:'cancel'},{text:'Delete Schedule',style:'destructive',onPress:async()=>{try{await deleteMyStuffSchedule(value.id,user.id);await load({quiet:true})}catch(nextError){Alert.alert('Could not delete schedule',nextError.message)}}}])}

  if(loading)return <View style={s.center}><ActivityIndicator size="large" color={ACCENT}/></View>
  if(!item)return <View style={s.center}><Text style={s.errorText}>{error||'Item not found.'}</Text><TouchableOpacity onPress={()=>navigation.goBack()}><Text style={s.link}>Go Back</Text></TouchableOpacity></View>

  return <SafeAreaView style={s.root} edges={['top']}>
    <Header title={item.name} onBack={()=>navigation.goBack()}/>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS==='ios'?'interactive':'on-drag'} automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load({quiet:true})}} tintColor={ACCENT}/>}>
      {!!error&&<Text style={s.errorText}>{error}</Text>}
      <View style={s.card}>
        <View style={s.between}><Text style={s.sectionTitle}>Item details</Text><TouchableOpacity onPress={()=>setEditing(value=>!value)} accessibilityRole="button" accessibilityLabel={editing?'Cancel editing item':'Edit item'}><Text style={s.link}>{editing?'Cancel':'Edit'}</Text></TouchableOpacity></View>
        {editing?<>
          <Field label="Item name *" value={edit.name} onChangeText={value=>setEditValue('name',value)}/>
          <Field label="Category" value={edit.category} onChangeText={value=>setEditValue('category',value)}/>
          <Field label="Model year" value={edit.year} onChangeText={value=>setEditValue('year',value)} keyboardType="number-pad"/>
          <Field label="Make" value={edit.make} onChangeText={value=>setEditValue('make',value)}/>
          <Field label="Model" value={edit.model} onChangeText={value=>setEditValue('model',value)}/>
          <Field label="Trim / version" value={edit.trim} onChangeText={value=>setEditValue('trim',value)}/>
          <Field label="Model number" value={edit.modelNumber} onChangeText={value=>setEditValue('modelNumber',value)}/>
          <Field label="Serial number" value={edit.serialNumber} onChangeText={value=>setEditValue('serialNumber',value)}/>
          <Field label="Engine / power system" value={edit.engine} onChangeText={value=>setEditValue('engine',value)}/>
          <Field label="Transmission" value={edit.transmission} onChangeText={value=>setEditValue('transmission',value)}/>
          <Field label="Drivetrain" value={edit.drivetrain} onChangeText={value=>setEditValue('drivetrain',value)}/>
          <Field label="Fuel / power type" value={edit.fuelType} onChangeText={value=>setEditValue('fuelType',value)}/>
          <Field label="Acquired on" value={edit.acquiredOn} onChangeText={value=>setEditValue('acquiredOn',value)} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation"/>
          <Field label="Notes" value={edit.notes} onChangeText={value=>setEditValue('notes',value)} multiline/>
          <Button label={saving?'Saving…':'Save Item'} onPress={saveItem} disabled={saving}/>
        </>:<>
          <Text style={s.itemName}>{item.name}</Text><Text style={s.muted}>{item.category||'Other'}{item.model_year?` · ${item.model_year}`:''}{item.make?` · ${item.make}`:''}{item.model?` ${item.model}`:''}</Text>
          {!!item.serial_number&&<Text style={s.muted}>Serial: {item.serial_number}</Text>}
          {!!item.archived_at&&<Text style={s.archiveBadge}>Archived · history retained</Text>}
          <View style={s.readingRow}><Reading label="Mileage" value={item.effective_current_mileage??item.current_mileage} suffix="mi"/><Reading label="Operating hours" value={item.effective_current_hours??item.current_hours} suffix="hr"/><Reading label="Cycles" value={item.effective_current_cycles??item.current_cycles} suffix="cycles"/></View>
          {!!item.notes&&<Text style={s.notes}>{item.notes}</Text>}
        </>}
      </View>

      <View style={s.between}><Text style={s.pageSection}>Usage readings</Text><TouchableOpacity onPress={()=>{resetMutationAttemptState(usageMutationAttempt.current);setShowUsage(value=>!value)}} accessibilityRole="button" accessibilityLabel={showUsage?'Cancel adding usage reading':'Add usage reading'}><Text style={s.link}>{showUsage?'Cancel':'+ Add'}</Text></TouchableOpacity></View>
      {showUsage&&<View style={s.card}>
        <Text style={s.label}>Measurement</Text><View style={s.modeRow} accessibilityRole="radiogroup" accessibilityLabel="Reading measurement">{['miles','hours','cycles'].map(type=><Choice key={type} label={type} selected={usage.type===type} onPress={()=>setUsageValue('type',type)}/>)}</View>
        <Field label="Reading *" value={usage.value} onChangeText={value=>setUsageValue('value',value)} keyboardType="decimal-pad"/>
        <Field label="Recorded on *" value={usage.recordedOn} onChangeText={value=>setUsageValue('recordedOn',value)} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation"/>
        <TouchableOpacity style={s.correctionToggle} onPress={()=>setUsageValue('correcting',!usage.correcting)} accessibilityRole="checkbox" accessibilityState={{checked:usage.correcting}}><Text style={s.link}>{usage.correcting?'✓ Correction mode':'Correct the latest reading'}</Text></TouchableOpacity>
        {usage.correcting&&<><Text style={s.warning}>Corrections append an audit record. They never lower the retained meter column.</Text><Field label="Correction reason *" value={usage.correctionReason} onChangeText={value=>setUsageValue('correctionReason',value)} multiline/></>}
        <Button label={saving?'Saving…':usage.correcting?'Append Correction':'Append Reading'} onPress={saveUsage} disabled={saving}/>
      </View>}
      {readings.slice(0,8).map(value=><View key={value.id} style={s.historyRow}><View style={s.flex}><Text style={s.historyName}>{value.reading_type==='mileage'?'Mileage':value.reading_type}</Text><Text style={s.muted}>{Number(value.reading_value).toLocaleString()} · {String(value.recorded_at||'').slice(0,10)}</Text>{value.source==='correction'&&<Text style={s.warning}>Correction · {value.correction_reason}</Text>}</View></View>)}
      {readings.length===0&&<View style={s.empty}><Text style={s.muted}>No appended usage readings yet.</Text></View>}

      <Text style={s.pageSection}>Due-state summary</Text>
      {dueStates.length===0?<View style={s.empty}><Text style={s.muted}>No V2 maintenance definitions are due yet.</Text></View>:dueStates.map(value=>{
        const definition=definitions.find(entry=>entry.id===value.definition_id)
        return <View key={value.definition_id} style={s.card}><View style={s.between}><Text style={s.scheduleName}>{definition?.name||'Maintenance'}</Text><View style={[s.pill,s[`pill_${value.due_status}`]]}><Text style={s.pillText}>{dueStateSummaryLabel(value.due_status)}</Text></View></View><Text style={s.muted}>{dueStateDescription(value)}</Text></View>
      })}

      <View style={s.between}><Text style={s.pageSection}>Maintenance schedules</Text><TouchableOpacity onPress={toggleScheduleForm} accessibilityRole="button" accessibilityLabel={showSchedule?'Cancel adding maintenance schedule':'Add maintenance schedule'}><Text style={s.link}>{showSchedule?'Cancel':'+ Add'}</Text></TouchableOpacity></View>
      {showSchedule&&<View style={s.card}>
        <Field label="Maintenance name *" value={schedule.name} onChangeText={value=>setScheduleValue('name',value)} placeholder="e.g. Oil change"/>
        <Text style={s.label}>Track by</Text><View style={s.modeRow} accessibilityRole="radiogroup" accessibilityLabel="Maintenance tracking mode">{['mileage','hours','calendar'].map(mode=><Choice key={mode} label={mode} selected={schedule.mode===mode} onPress={()=>setScheduleValue('mode',mode)}/>)}</View>
        <Field label={schedule.mode==='calendar'?'Interval in days *':`Interval in ${schedule.mode} *`} value={schedule.interval} onChangeText={value=>setScheduleValue('interval',value)} keyboardType="decimal-pad"/>
        {schedule.mode==='calendar'?<Field label="Last service date *" value={schedule.lastDate} onChangeText={value=>setScheduleValue('lastDate',value)} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation"/>:<Field label={`Last service ${schedule.mode} *`} value={schedule.lastReading} onChangeText={value=>setScheduleValue('lastReading',value)} keyboardType="decimal-pad"/>}
        <Button label={saving?'Saving…':'Add Schedule'} onPress={addSchedule} disabled={saving}/>
      </View>}
      {schedules.length===0?<View style={s.empty}><Text style={s.muted}>No maintenance schedules yet.</Text></View>:schedules.map(value=>{
        const state=getScheduleDueState(value,item)
        return <View key={value.id} style={s.card}>
          <View style={s.between}><View style={s.flex}><Text style={s.scheduleName}>{value.name}</Text><Text style={s.muted}>{scheduleDescription(value)}</Text></View><View style={[s.pill,s[`pill_${state}`]]}><Text style={s.pillText}>{dueStateLabel(state)}</Text></View></View>
          {completingId===value.id?<View style={s.completionBox}>
            <Field label="Completed on *" value={completion.completedAt} onChangeText={value=>setCompletionValue('completedAt',value)} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation"/>
            {value.tracking_type!=='calendar'&&<Field label={`${value.tracking_type} reading *`} value={completion.reading} onChangeText={next=>setCompletionValue('reading',next)} keyboardType="decimal-pad"/>}
            <Field label="Cost (optional)" value={completion.cost} onChangeText={next=>setCompletionValue('cost',next)} keyboardType="decimal-pad"/>
            <Field label="Notes (optional)" value={completion.notes} onChangeText={next=>setCompletionValue('notes',next)} multiline/>
            <Button label={saving?'Saving…':'Complete Maintenance'} onPress={()=>finishMaintenance(value)} disabled={saving}/><TouchableOpacity onPress={cancelCompletion} accessibilityRole="button" accessibilityLabel="Cancel maintenance completion"><Text style={s.cancelLink}>Cancel</Text></TouchableOpacity>
          </View>:<View style={s.actions}><TouchableOpacity style={s.smallButton} onPress={()=>openCompletion(value)} accessibilityRole="button" accessibilityLabel={`Mark ${value.name} complete`}><Text style={s.smallButtonText}>Mark Complete</Text></TouchableOpacity><TouchableOpacity onPress={()=>confirmDeleteSchedule(value)} accessibilityRole="button" accessibilityLabel={`Delete ${value.name} schedule`}><Text style={s.deleteLink}>Delete</Text></TouchableOpacity></View>}
        </View>
      })}

      <Text style={s.pageSection}>Service history</Text>
      {logs.length===0?<View style={s.empty}><Text style={s.muted}>Completed maintenance will appear here.</Text></View>:logs.map(log=>{
        const linked=schedules.find(value=>value.id===log.schedule_id)
        const logReading=log.mileage!=null?log.mileage:log.hours!=null?log.hours:null
        const readingSuffix=log.mileage!=null?' mi':log.hours!=null?' hr':''
        return <View key={log.id} style={s.historyRow}><View style={s.flex}><Text style={s.historyName}>{log.name||linked?.name||'Maintenance'}</Text><Text style={s.muted}>{String(log.completed_at||'').slice(0,10)}{logReading!=null?` · ${Number(logReading).toLocaleString()}${readingSuffix}`:''}</Text>{!!log.notes&&<Text style={s.notes}>{log.notes}</Text>}</View>{log.cost!=null&&<Text style={s.cost}>{formatMoney(log.cost)}</Text>}</View>
      })}
      <TouchableOpacity style={s.archiveItem} onPress={confirmArchive} disabled={saving} accessibilityRole="button" accessibilityLabel={item.archived_at?'Restore My Stuff item':'Archive My Stuff item'} accessibilityState={{disabled:saving}}><Text style={s.archiveItemText}>{item.archived_at?'Restore Item':'Archive Item'}</Text></TouchableOpacity>
      <TouchableOpacity style={s.deleteItem} onPress={confirmDeleteItem} disabled={saving} accessibilityRole="button" accessibilityLabel="Delete My Stuff item" accessibilityState={{disabled:saving}}><Text style={s.deleteItemText}>Delete Item Permanently</Text></TouchableOpacity>
    </ScrollView>
  </SafeAreaView>
}

function scheduleDescription(value){if(value.tracking_type==='calendar')return `Every ${value.interval_value} days · next ${String(value.next_due_at||'').slice(0,10)}`;return `Every ${Number(value.interval_value).toLocaleString()} ${value.tracking_type} · next at ${Number(value.next_due_value).toLocaleString()}`}
function dueStateSummaryLabel(status){return {overdue:'Overdue',due_now:'Due now',due_soon:'Due soon',needs_usage_update:'Needs usage',upcoming:'Upcoming'}[status]||'Not calculated'}
function dueStateDescription(value){const details=[];if(value.next_due_at)details.push(`Date ${String(value.next_due_at).slice(0,10)}`);if(value.next_due_mileage!=null)details.push(`${Number(value.next_due_mileage).toLocaleString()} mi`);if(value.next_due_hours!=null)details.push(`${Number(value.next_due_hours).toLocaleString()} hr`);if(value.next_due_cycles!=null)details.push(`${Number(value.next_due_cycles).toLocaleString()} cycles`);return details.join(' · ')||'Update usage to calculate the next service.'}
function Header({title,onBack}){return <View style={s.header}><TouchableOpacity style={s.headerSide} onPress={onBack} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10}><Text style={s.back}>‹ Back</Text></TouchableOpacity><Text style={s.headerTitle} numberOfLines={1}>{title}</Text><View style={s.headerSide}/></View>}
function Field({label,multiline,...props}){return <View><Text style={s.label}>{label}</Text><TextInput style={[s.input,multiline&&s.textarea]} placeholderTextColor="#A8A49E" multiline={multiline} {...props}/></View>}
function Choice({label,selected,onPress}){return <TouchableOpacity style={[s.choice,selected&&s.choiceActive]} onPress={onPress} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{selected}}><Text style={[s.choiceText,selected&&s.choiceTextActive]}>{label}</Text></TouchableOpacity>}
function Button({label,onPress,disabled}){return <TouchableOpacity style={[s.button,disabled&&s.disabled]} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled,busy:disabled}}><Text style={s.buttonText}>{label}</Text></TouchableOpacity>}
function Reading({label,value,suffix}){return <View style={s.reading}><Text style={s.eyebrow}>{label}</Text><Text style={s.readingValue}>{value==null?'Not set':`${Number(value).toLocaleString()} ${suffix}`}</Text></View>}

const s=StyleSheet.create({root:{flex:1,backgroundColor:'#FAFAF7'},center:{flex:1,justifyContent:'center',alignItems:'center',padding:30,backgroundColor:'#FAFAF7'},header:{paddingTop:0,paddingBottom:12,paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#E8E4DE'},headerSide:{width:70},back:{color:ACCENT,fontWeight:'700'},headerTitle:{flex:1,textAlign:'center',fontWeight:'800',fontSize:17,color:'#1A1917'},content:{padding:18,paddingBottom:100},card:{backgroundColor:'#fff',borderRadius:14,padding:16,borderWidth:1,borderColor:'#E8E4DE',marginBottom:10},between:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},flex:{flex:1},sectionTitle:{fontSize:17,fontWeight:'800',color:'#1A1917'},pageSection:{fontSize:18,fontWeight:'800',color:'#1A1917',marginTop:18,marginBottom:10},link:{color:ACCENT,fontWeight:'700'},itemName:{fontSize:23,fontWeight:'800',color:'#1A1917',marginTop:12},muted:{color:'#6B665E',lineHeight:20},notes:{color:'#444039',lineHeight:20,marginTop:8},archiveBadge:{alignSelf:'flex-start',marginTop:10,color:'#6B4B16',backgroundColor:'#FFF1C9',paddingHorizontal:9,paddingVertical:5,borderRadius:10,fontWeight:'700'},readingRow:{flexDirection:'row',flexWrap:'wrap',gap:10,marginTop:16},reading:{minWidth:'29%',flex:1,backgroundColor:'#F3F1EC',borderRadius:10,padding:12},eyebrow:{fontSize:11,fontWeight:'700',color:'#79736A',textTransform:'uppercase'},readingValue:{fontWeight:'700',color:'#1A1917',marginTop:4},label:{fontSize:13,fontWeight:'700',color:'#5C5850',marginTop:14,marginBottom:5},input:{borderWidth:1,borderColor:'#D7D2CB',borderRadius:10,padding:12,fontSize:15,color:'#1A1917',backgroundColor:'#fff'},textarea:{minHeight:90,textAlignVertical:'top'},modeRow:{flexDirection:'row',gap:7},choice:{flex:1,borderWidth:1,borderColor:'#D7D2CB',borderRadius:9,paddingVertical:10,alignItems:'center'},choiceActive:{borderColor:ACCENT,backgroundColor:'#FFF2EE'},choiceText:{color:'#5C5850',fontWeight:'600',textTransform:'capitalize'},choiceTextActive:{color:ACCENT},button:{backgroundColor:ACCENT,borderRadius:10,padding:14,alignItems:'center',marginTop:18},buttonText:{color:'#fff',fontWeight:'800'},disabled:{opacity:.6},empty:{padding:18,borderRadius:12,backgroundColor:'#fff',borderWidth:1,borderColor:'#E8E4DE'},scheduleName:{fontSize:16,fontWeight:'800',color:'#1A1917'},pill:{paddingHorizontal:9,paddingVertical:6,borderRadius:12,backgroundColor:'#EDEAE5'},pill_due:{backgroundColor:'#FFF1C9'},pill_due_now:{backgroundColor:'#FFF1C9'},pill_due_soon:{backgroundColor:'#FFF1C9'},pill_needs_usage_update:{backgroundColor:'#EDEAE5'},pill_overdue:{backgroundColor:'#FDE0DB'},pill_upcoming:{backgroundColor:'#DFF1E8'},pillText:{fontSize:11,fontWeight:'800',color:'#443F38'},actions:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:14},smallButton:{backgroundColor:'#FFF2EE',borderRadius:9,paddingHorizontal:13,paddingVertical:10},smallButtonText:{color:ACCENT,fontWeight:'800'},deleteLink:{color:'#A33A2C',fontWeight:'600'},completionBox:{marginTop:8},cancelLink:{color:'#6B665E',fontWeight:'700',textAlign:'center',padding:12},historyRow:{backgroundColor:'#fff',borderRadius:12,padding:15,borderWidth:1,borderColor:'#E8E4DE',marginBottom:8,flexDirection:'row',gap:10},historyName:{fontWeight:'800',fontSize:15,color:'#1A1917'},cost:{fontWeight:'800',color:'#1A1917'},correctionToggle:{paddingVertical:13},warning:{color:'#8A5B13',fontSize:12,lineHeight:18,marginTop:6},archiveItem:{borderWidth:1,borderColor:'#C8A25C',backgroundColor:'#FFF8E9',borderRadius:10,padding:14,alignItems:'center',marginTop:30},archiveItemText:{color:'#6B4B16',fontWeight:'800'},deleteItem:{borderWidth:1,borderColor:'#D8A39B',borderRadius:10,padding:14,alignItems:'center',marginTop:10},deleteItemText:{color:'#A33A2C',fontWeight:'800'},errorText:{color:'#9A3023',marginBottom:10}})
