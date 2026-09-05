import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, InputAccessoryView, Keyboard, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import * as Crypto from 'expo-crypto'
import {
  createMyStuffExpenseV3,
  getMyStuffExpensesV3,
  getMyStuffFinancialSummaryV3,
  recordMyStuffServiceWithExpenseV3,
  reviseMyStuffExpenseV3,
  reviseMyStuffServiceExpenseV3,
  setMyStuffOccurrenceStatusV3,
  voidMyStuffExpenseV3,
} from '../lib/myStuffClient'
import {
  buildExpenseDraft,
  buildFinancialSummary,
  buildServicePayload,
  classifyDueOccurrences,
  EXPENSE_CATEGORIES,
  expenseRevision,
  linkedOccurrenceId,
  reviseExpenseByLinkage,
  serviceCompletionDefaults,
  sortExpenseHistory,
} from '../domain/myStuff/v3Model'
import { createMutationAttemptState, mutationIdForPayload, resetMutationAttemptState, todayDateInput } from '../screens/myStuffModel'

const ACCENT = '#C8402F'
const TABS = ['Details','Expenses','Maintenance','History']
const STATUS_CHOICES = [['not_completed','Not completed'],['completed','Completed'],['not_applicable','Not applicable'],['skipped','Skipped'],['history_unknown','History unknown']]
const EMPTY_EXPENSE = { description:'',category:'maintenance',customCategory:'',amount:'',currency:'',incurredOn:todayDateInput(),vendor:'',mileage:'',hours:'',notes:'' }
const EXPENSE_ACCESSORY = 'my-stuff-v3-expense-keyboard'
const SERVICE_ACCESSORY = 'my-stuff-v3-service-keyboard'

export default function MyStuffV3Experience({ item, definitions = [], plannedOccurrences = [], formatMoney, currency, activeTab = 'Details', onTabChange, onRefresh }) {
  const [maintenanceView,setMaintenanceView] = useState('Schedule')
  const [expenses,setExpenses] = useState([])
  const [serverSummary,setServerSummary] = useState(null)
  const [availability,setAvailability] = useState('loading')
  const [expenseNotice,setExpenseNotice] = useState('')
  const [expenseForm,setExpenseForm] = useState(null)
  const [editingExpense,setEditingExpense] = useState(null)
  const [serviceOccurrence,setServiceOccurrence] = useState(null)
  const [serviceForm,setServiceForm] = useState(() => serviceCompletionDefaults(item,todayDateInput()))
  const [saving,setSaving] = useState(false)
  const [expandedGroups,setExpandedGroups] = useState({ Mileage:true,Time:true,Manufacturer:true })
  const expenseAttempt = useRef(createMutationAttemptState())
  const serviceAttempt = useRef(createMutationAttemptState())
  const statusAttempt = useRef(createMutationAttemptState())
  const statusInFlight = useRef(false)
  const loadGeneration = useRef(0)
  const itemIdRef = useRef(item.id)
  itemIdRef.current = item.id

  async function loadExpenses({ afterMutation = false } = {}) {
    const generation = ++loadGeneration.current
    const requestedItemId = item.id
    if (!afterMutation) setAvailability('loading')
    try {
      const [rows,summary] = await Promise.all([getMyStuffExpensesV3(requestedItemId),getMyStuffFinancialSummaryV3(requestedItemId)])
      if (generation !== loadGeneration.current || requestedItemId !== itemIdRef.current) return false
      setExpenses(Array.isArray(rows) ? rows : [])
      setServerSummary(summary || null)
      setAvailability('available')
      setExpenseNotice('')
      return true
    } catch {
      if (generation !== loadGeneration.current || requestedItemId !== itemIdRef.current) return false
      if (afterMutation) setExpenseNotice('Saved, but the latest expenses could not be loaded. Pull to refresh or try again.')
      else setAvailability('unavailable')
      return false
    }
  }

  useEffect(() => {
    loadExpenses()
    return () => { loadGeneration.current += 1 }
  }, [item.id])

  const localSummary = useMemo(() => buildFinancialSummary({ purchasePrice:item.purchase_price,expenses }), [item.purchase_price,expenses])
  const summary = serverSummary || localSummary
  const dueGroups = useMemo(() => classifyDueOccurrences(plannedOccurrences), [plannedOccurrences])
  const definitionById = useMemo(() => new Map(definitions.map(definition => [definition.id,definition])), [definitions])
  const scheduleGroups = useMemo(() => {
    const groups = { Mileage:[],Time:[],Manufacturer:[] }
    for (const occurrence of plannedOccurrences) {
      const definition = definitionById.get(occurrence.definition_id) || {}
      if (definition.provenance_type === 'manufacturer') groups.Manufacturer.push(occurrence)
      else if (definition.normal_interval_miles != null) groups.Mileage.push(occurrence)
      else groups.Time.push(occurrence)
    }
    return groups
  }, [definitionById,plannedOccurrences])

  function changeExpense(key,value) { setExpenseForm(current => ({ ...current,[key]:value })) }
  function startExpense(row = null) {
    resetMutationAttemptState(expenseAttempt.current)
    setEditingExpense(row)
    if (!row) return setExpenseForm({ ...EMPTY_EXPENSE,currency,incurredOn:todayDateInput() })
    const value = expenseRevision(row)
    setExpenseForm({
      description:value.description || '',category:value.category || 'other',customCategory:value.custom_category || '',amount:String(value.amount ?? ''),
      currency:value.currency || currency,incurredOn:value.incurred_on || todayDateInput(),vendor:value.vendor || '',mileage:value.mileage == null?'':String(value.mileage),
      hours:value.hours == null?'':String(value.hours),notes:value.notes || '',
    })
  }

  async function saveExpense() {
    if (saving) return
    let payload
    try { payload = buildExpenseDraft(expenseForm) } catch (error) { return Alert.alert('Check expense',error.message) }
    const requestedItemId = item.id
    const expenseId = editingExpense?.id || null
    const mutationId = mutationIdForPayload(expenseAttempt.current,{ expenseId,payload })
    setSaving(true)
    try {
      if (expenseId) await reviseExpenseByLinkage({ row:editingExpense,patch:payload,reason:'Edited by owner',mutationId,reviseExpense:reviseMyStuffExpenseV3,reviseServiceExpense:reviseMyStuffServiceExpenseV3 })
      else await createMyStuffExpenseV3(requestedItemId,payload,mutationId)
    } catch (error) {
      setSaving(false)
      return Alert.alert('Could not save expense',`${error.message || 'Please try again.'}\n\nYour entered fields are still here.`)
    }
    resetMutationAttemptState(expenseAttempt.current)
    if (requestedItemId === itemIdRef.current) { setExpenseForm(null);setEditingExpense(null) }
    const refreshed = await loadExpenses({ afterMutation:true })
    if (!refreshed && requestedItemId === itemIdRef.current) Alert.alert('Expense saved, but refresh failed','The expense was saved. Pull to refresh or retry loading expenses.')
    setSaving(false)
  }

  function confirmVoid(row) {
    Alert.alert('Void expense?','The immutable history remains visible.',[
      { text:'Cancel',style:'cancel' },
      { text:'Void',style:'destructive',onPress:async() => {
        const requestedItemId = item.id
        try {
          await voidMyStuffExpenseV3(row.id,'Voided by owner',mutationIdForPayload(expenseAttempt.current,{ expenseId:row.id,void:true }))
          resetMutationAttemptState(expenseAttempt.current)
          const refreshed = await loadExpenses({ afterMutation:true })
          if (!refreshed && requestedItemId === itemIdRef.current) Alert.alert('Expense voided, but refresh failed','The expense was voided. Pull to refresh or retry loading expenses.')
        } catch (error) { Alert.alert('Could not void expense',error.message || 'Please try again.') }
      } },
    ])
  }

  async function chooseStatus(row,status) {
    if (status === 'completed') {
      setServiceOccurrence(row)
      setServiceForm(serviceCompletionDefaults(item,todayDateInput()))
      resetMutationAttemptState(serviceAttempt.current)
      return
    }
    if (statusInFlight.current) return
    const occurrenceId = row.planned_occurrence_id
    if (!occurrenceId) return Alert.alert('Status unavailable','This row has no V3 planned occurrence identifier.')
    const mutationId = mutationIdForPayload(statusAttempt.current,{ occurrenceId,status })
    statusInFlight.current = true
    setSaving(true)
    try {
      await setMyStuffOccurrenceStatusV3(occurrenceId,status,`Set to ${status.replaceAll('_',' ')} by owner`,mutationId)
    } catch (error) {
      statusInFlight.current = false
      setSaving(false)
      return Alert.alert('Could not update status',`${error.message || 'Please try again.'} No status change was assumed.`)
    }
    resetMutationAttemptState(statusAttempt.current)
    try { await onRefresh?.() } catch (error) { Alert.alert('Status saved, but refresh failed',`The status was updated. Pull to refresh.${error?.message ? `\n\n${error.message}` : ''}`) }
    statusInFlight.current = false
    setSaving(false)
  }

  async function saveService() {
    if (saving) return
    let service
    try { service = buildServicePayload({ occurrence:serviceOccurrence,...serviceForm }) } catch (error) { return Alert.alert('Check service',error.message) }
    const costText = String(serviceForm.cost || '').trim()
    const cost = costText === '' ? null : Number(costText)
    if (cost != null && (!Number.isFinite(cost) || cost < 0)) return Alert.alert('Check cost','Cost must be a finite number of zero or more.')
    const expense = cost == null ? null : {
      description:service.service_name,category:'maintenance',custom_category:null,amount:cost,currency,incurred_on:serviceForm.actualServiceDate,
      vendor:serviceForm.providerName.trim() || null,mileage:service.mileage ?? null,hours:service.hours ?? null,notes:service.notes || null,
    }
    const request = {
      itemId:item.id,plannedOccurrenceId:serviceOccurrence?.planned_occurrence_id || null,definitionId:serviceOccurrence?.definition_id || null,service,expense,
    }
    const requestedItemId = item.id
    const mutationId = mutationIdForPayload(serviceAttempt.current,request)
    setSaving(true)
    try { await recordMyStuffServiceWithExpenseV3({ ...request,mutationId }) }
    catch (error) {
      setSaving(false)
      return Alert.alert('Could not log service',`${error.message || 'Please try again.'}\n\nYour entered service and expense fields are still here.`)
    }
    resetMutationAttemptState(serviceAttempt.current)
    if (requestedItemId === itemIdRef.current) setServiceOccurrence(null)
    const expenseRefresh = await loadExpenses({ afterMutation:true })
    let detailRefresh = true
    try { await onRefresh?.() } catch { detailRefresh = false }
    if ((!expenseRefresh || !detailRefresh) && requestedItemId === itemIdRef.current) Alert.alert('Service saved, but refresh failed','The service and linked expense were saved. Pull to refresh for the latest data.')
    setSaving(false)
  }

  return <View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs} accessibilityRole="tablist" accessibilityLabel="My Stuff detail sections">
      {TABS.map(value => <TouchableOpacity key={value} style={[s.tab,activeTab===value&&s.tabActive]} onPress={() => onTabChange?.(value)} accessibilityRole="tab" accessibilityState={{ selected:activeTab===value }}><Text style={[s.tabText,activeTab===value&&s.tabTextActive]}>{value}</Text></TouchableOpacity>)}
    </ScrollView>
    {activeTab==='Details'&&<View style={s.notice}><Text style={s.noticeTitle}>Details</Text><Text style={s.muted}>Identity, usage, legacy controls, and manual entry remain below.</Text></View>}
    {activeTab==='Expenses'&&<View>
      <View style={s.summary}><Summary label="Purchase price" value={summary.purchase_price??summary.purchasePrice} formatMoney={formatMoney}/><Summary label="Transferred project" value={summary.transferred_project_subtotal??summary.transferredProjectSubtotal} formatMoney={formatMoney}/><Summary label="Maintenance & repairs" value={summary.maintenance_repair_subtotal??summary.maintenanceRepairSubtotal} formatMoney={formatMoney}/><Summary label="Upgrades" value={summary.upgrades_subtotal??summary.upgradesSubtotal} formatMoney={formatMoney}/><Summary label="Total invested" value={summary.total_invested??summary.totalInvested} formatMoney={formatMoney} strong/>{Object.entries(summary.category_totals||summary.categoryTotals||{}).map(([category,total])=><Summary key={category} label={`${category[0].toUpperCase()+category.slice(1)} total`} value={total} formatMoney={formatMoney}/>)}</View>
      {!!expenseNotice&&<Text style={s.warning}>{expenseNotice}</Text>}
      {availability==='loading'&&<Text style={s.muted}>Loading expenses…</Text>}
      {availability==='unavailable'&&<View style={s.notice}><Text style={s.noticeTitle}>Expenses unavailable</Text><Text style={s.muted}>The V3 expense service is unavailable. Purchase price remains in Details. Try again later or keep manual records.</Text><TouchableOpacity onPress={() => loadExpenses()} accessibilityRole="button"><Text style={s.link}>Retry</Text></TouchableOpacity></View>}
      {availability==='available'&&<><TouchableOpacity style={s.primary} onPress={() => startExpense()} accessibilityRole="button"><Text style={s.primaryText}>Add expense</Text></TouchableOpacity>{sortExpenseHistory(expenses).map(row => { const value=expenseRevision(row);return <View key={row.id} style={s.row}><View style={s.flex}><Text style={s.rowTitle}>{value.description}</Text><Text style={s.muted}>{value.incurred_on} · {value.category}{linkedOccurrenceId(row)?' · Linked service':''}{row.source_type==='project_transfer'?' · Transferred project':''}{row.voided_at?' · Voided':''}</Text></View><Text style={s.amount}>{formatMoney(value.amount)}</Text>{!row.voided_at&&<View><TouchableOpacity onPress={() => startExpense(row)} accessibilityRole="button"><Text style={s.link}>Edit expense</Text></TouchableOpacity>{!linkedOccurrenceId(row)&&<TouchableOpacity onPress={() => confirmVoid(row)} accessibilityRole="button"><Text style={s.danger}>Void</Text></TouchableOpacity>}</View>}</View>})}</>}
      {expenseForm&&<ExpenseForm value={expenseForm} onChange={changeExpense} onSave={saveExpense} onCancel={() => setExpenseForm(null)} saving={saving} editing={!!editingExpense}/>}
    </View>}
    {activeTab==='Maintenance'&&<View>
      <View style={s.subtabs} accessibilityRole="tablist">{['Schedule','Due Items'].map(value=><TouchableOpacity key={value} style={[s.subtab,maintenanceView===value&&s.subtabActive]} onPress={()=>setMaintenanceView(value)} accessibilityRole="tab" accessibilityState={{selected:maintenanceView===value}}><Text style={s.tabText}>{value}</Text></TouchableOpacity>)}</View>
      {maintenanceView==='Schedule' ? Object.entries(scheduleGroups).map(([group,rows]) => <View key={group} style={s.group}><TouchableOpacity style={s.groupHeader} onPress={() => setExpandedGroups(current=>({...current,[group]:!current[group]}))} accessibilityRole="button" accessibilityState={{expanded:!!expandedGroups[group]}} accessibilityLabel={`${group} maintenance group`}><Text style={s.noticeTitle}>{group}{group==='Manufacturer'?' intervals':''}</Text><Text>{expandedGroups[group]?'−':'+'}</Text></TouchableOpacity>{expandedGroups[group]&&<View>{rows.map(row=><Text key={row.planned_occurrence_id} style={s.muted}>{row.name || 'Maintenance item'} · {group==='Manufacturer'?'Manufacturer interval (citation preserved)':'Manual schedule'} · {row.due_at?String(row.due_at).slice(0,10):'No date'}</Text>)}{rows.length===0&&<Text style={s.muted}>No {group.toLowerCase()} planned occurrences. Manual schedule entry remains available below.</Text>}</View>}</View>) : <>{Object.entries({Overdue:dueGroups.overdue,'Due soon':dueGroups.dueSoon,Upcoming:dueGroups.upcoming,'Completed recently':dueGroups.completedRecently}).map(([label,rows])=><View key={label}><Text style={s.heading}>{label}</Text>{rows.length===0?<Text style={s.muted}>None</Text>:rows.map(row=><Occurrence key={row.planned_occurrence_id} row={row} onStatus={chooseStatus}/>)}</View>)}</>}
      {serviceOccurrence&&<ServiceForm value={serviceForm} onChange={(key,value)=>setServiceForm(current=>({...current,[key]:value}))} onReading={(key,value)=>setServiceForm(current=>({...current,readings:{...current.readings,[key]:value}}))} onSave={saveService} onCancel={()=>setServiceOccurrence(null)} saving={saving}/>}
    </View>}
    {activeTab==='History'&&<View><View style={s.notice}><Text style={s.noticeTitle}>History</Text><Text style={s.muted}>Service and read-only legacy history appear below.</Text></View>{sortExpenseHistory(expenses).filter(row=>linkedOccurrenceId(row)).map(row=>{const value=expenseRevision(row);return <View key={`history-${row.id}`} style={s.row}><View style={s.flex}><Text style={s.rowTitle}>{value.description||'Service expense'}</Text><Text style={s.muted}>Linked expense {row.id} · occurrence {linkedOccurrenceId(row)}</Text></View><Text style={s.amount}>{formatMoney(value.amount)}</Text></View>})}</View>}
  </View>
}

function Summary({label,value,strong,formatMoney}) { return <View style={s.summaryRow}><Text style={[s.muted,strong&&s.strong]}>{label}</Text><Text style={[s.amount,strong&&s.strong]}>{formatMoney(value)}</Text></View> }
function Input({label,multiline,...props}) { return <View><Text style={s.label}>{label}</Text><TextInput style={[s.input,multiline&&s.textarea]} multiline={multiline} placeholderTextColor="#A8A49E" {...props}/></View> }
function KeyboardToolbar({nativeID,onSave,saving,label}) { return Platform.OS==='ios'?<InputAccessoryView nativeID={nativeID}><View style={s.keyboardToolbar}><TouchableOpacity onPress={()=>Keyboard.dismiss()}><Text style={s.keyboardDone}>Done</Text></TouchableOpacity><TouchableOpacity style={[s.keyboardSave,saving&&s.disabled]} onPress={onSave} disabled={saving}><Text style={s.keyboardSaveText}>{saving?'Saving…':label}</Text></TouchableOpacity></View></InputAccessoryView>:null }
function ExpenseForm({value,onChange,onSave,onCancel,saving,editing}) { return <View style={s.form}><Text style={s.heading}>{editing?'Edit expense':'Add expense'}</Text><Input label="Description *" value={value.description} onChangeText={v=>onChange('description',v)}/><Input label="Amount *" value={value.amount} keyboardType="decimal-pad" inputAccessoryViewID={EXPENSE_ACCESSORY} onChangeText={v=>onChange('amount',v)}/><Input label="Currency" value={value.currency} autoCapitalize="characters" maxLength={3} onChangeText={v=>onChange('currency',v)}/><Input label="Incurred on *" value={value.incurredOn} onChangeText={v=>onChange('incurredOn',v)}/><Text style={s.label}>Category</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.statuses}>{EXPENSE_CATEGORIES.map(category=><TouchableOpacity key={category} style={s.status} onPress={()=>onChange('category',category)} accessibilityRole="radio" accessibilityState={{selected:value.category===category}}><Text style={s.statusText}>{category==='other'?'Other':category[0].toUpperCase()+category.slice(1)}</Text></TouchableOpacity>)}</ScrollView>{value.category==='other'&&<Input label="Custom category *" value={value.customCategory} onChangeText={v=>onChange('customCategory',v)}/>}<Input label="Vendor" value={value.vendor} onChangeText={v=>onChange('vendor',v)}/><Input label="Mileage" value={value.mileage} keyboardType="decimal-pad" inputAccessoryViewID={EXPENSE_ACCESSORY} onChangeText={v=>onChange('mileage',v)}/><Input label="Hours" value={value.hours} keyboardType="decimal-pad" inputAccessoryViewID={EXPENSE_ACCESSORY} onChangeText={v=>onChange('hours',v)}/><Input label="Notes" value={value.notes} multiline onChangeText={v=>onChange('notes',v)}/><TouchableOpacity style={s.primary} onPress={onSave} disabled={saving}><Text style={s.primaryText}>{saving?'Saving…':editing?'Save revision':'Save expense'}</Text></TouchableOpacity><TouchableOpacity onPress={onCancel}><Text style={s.link}>Cancel</Text></TouchableOpacity><KeyboardToolbar nativeID={EXPENSE_ACCESSORY} onSave={onSave} saving={saving} label={editing?'Save revision':'Save expense'}/></View> }
function Occurrence({row,onStatus}) { return <View style={s.row}><View style={s.flex}><Text style={s.rowTitle}>{row.name||'Maintenance item'}</Text><Text style={s.muted}>{row.due_at?String(row.due_at).slice(0,10):'Due date unavailable'}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.statuses}>{STATUS_CHOICES.map(([value,label])=><TouchableOpacity key={value} style={s.status} onPress={()=>onStatus(row,value)} accessibilityRole="radio" accessibilityState={{selected:(row.status||'not_completed')===value}} accessibilityLabel={`${label} for ${row.name||'maintenance item'}`}><Text style={s.statusText}>{label}</Text></TouchableOpacity>)}</ScrollView></View></View> }
function ServiceForm({value,onChange,onReading,onSave,onCancel,saving}) { return <View style={s.form}><Text style={s.heading}>Log Service</Text><Input label="Actual service date *" value={value.actualServiceDate} onChangeText={v=>onChange('actualServiceDate',v)}/><Input label="Current mileage" value={value.readings.miles} keyboardType="decimal-pad" inputAccessoryViewID={SERVICE_ACCESSORY} onChangeText={v=>onReading('miles',v)}/><Input label="Current hours" value={value.readings.hours} keyboardType="decimal-pad" inputAccessoryViewID={SERVICE_ACCESSORY} onChangeText={v=>onReading('hours',v)}/><Input label="Cost" value={value.cost} keyboardType="decimal-pad" inputAccessoryViewID={SERVICE_ACCESSORY} onChangeText={v=>onChange('cost',v)}/><Text style={s.label}>Provider / DIY</Text><View style={s.statuses}>{[['provider','Service provider'],['diy','DIY']].map(([key,label])=><TouchableOpacity key={key} style={s.status} onPress={()=>onChange('providerType',key)} accessibilityRole="radio" accessibilityState={{selected:value.providerType===key}}><Text style={s.statusText}>{label}</Text></TouchableOpacity>)}</View><Input label="Provider name" value={value.providerName} onChangeText={v=>onChange('providerName',v)}/><Input label="Parts" value={value.parts} multiline onChangeText={v=>onChange('parts',v)}/><Input label="Notes" value={value.notes} multiline onChangeText={v=>onChange('notes',v)}/><Text style={s.muted}>Receipt and attachment controls are unavailable in this version. Record any reference in Notes.</Text><TouchableOpacity style={s.primary} onPress={onSave} disabled={saving}><Text style={s.primaryText}>{saving?'Saving…':'Save service and linked expense'}</Text></TouchableOpacity><TouchableOpacity onPress={onCancel}><Text style={s.link}>Cancel</Text></TouchableOpacity><KeyboardToolbar nativeID={SERVICE_ACCESSORY} onSave={onSave} saving={saving} label="Save service"/></View> }

const s=StyleSheet.create({
  tabs:{gap:8,paddingVertical:12},tab:{minWidth:86,minHeight:44,paddingHorizontal:14,justifyContent:'center',alignItems:'center',borderRadius:22,borderWidth:1,borderColor:'#D7D2CB'},tabActive:{backgroundColor:ACCENT,borderColor:ACCENT},tabText:{fontWeight:'700',color:'#5C5850'},tabTextActive:{color:'#fff'},
  subtabs:{flexDirection:'row',gap:8,marginVertical:10},subtab:{flex:1,minHeight:44,alignItems:'center',justifyContent:'center',borderBottomWidth:2,borderBottomColor:'#D7D2CB'},subtabActive:{borderBottomColor:ACCENT},
  notice:{backgroundColor:'#FFF8EE',borderWidth:1,borderColor:'#E8D5B5',borderRadius:12,padding:14,marginBottom:10},noticeTitle:{fontWeight:'800',color:'#1A1917'},muted:{color:'#6B665E',lineHeight:19},warning:{color:'#8B3328',lineHeight:19,marginBottom:8},link:{color:ACCENT,fontWeight:'700',paddingVertical:8},danger:{color:'#9E2F22',fontWeight:'700',paddingVertical:5},
  summary:{backgroundColor:'#fff',borderRadius:12,padding:14,marginBottom:10},summaryRow:{flexDirection:'row',justifyContent:'space-between',paddingVertical:6},amount:{fontWeight:'700',color:'#1A1917'},strong:{fontWeight:'900',color:ACCENT},
  primary:{backgroundColor:ACCENT,minHeight:46,borderRadius:10,alignItems:'center',justifyContent:'center',paddingHorizontal:14,marginVertical:10},primaryText:{color:'#fff',fontWeight:'800'},disabled:{opacity:.6},
  row:{backgroundColor:'#fff',borderWidth:1,borderColor:'#E8E4DE',borderRadius:12,padding:13,marginBottom:8,flexDirection:'row',alignItems:'center',gap:10},rowTitle:{fontWeight:'800',color:'#1A1917'},flex:{flex:1},
  form:{backgroundColor:'#fff',borderWidth:1,borderColor:ACCENT,borderRadius:12,padding:14,marginVertical:10},heading:{fontSize:17,fontWeight:'800',color:'#1A1917',marginVertical:10},label:{fontSize:13,fontWeight:'700',color:'#5C5850',marginTop:11,marginBottom:5},input:{borderWidth:1,borderColor:'#D7D2CB',borderRadius:9,padding:11,color:'#1A1917',backgroundColor:'#fff'},textarea:{minHeight:78,textAlignVertical:'top'},
  group:{backgroundColor:'#fff',borderWidth:1,borderColor:'#E8E4DE',borderRadius:10,padding:12,marginBottom:8},groupHeader:{minHeight:44,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},statuses:{flexDirection:'row',gap:7,flexWrap:'wrap'},status:{minHeight:40,borderWidth:1,borderColor:'#D7D2CB',borderRadius:20,paddingHorizontal:12,justifyContent:'center'},statusText:{fontSize:12,fontWeight:'700',color:'#5C5850'},
  keyboardToolbar:{backgroundColor:'#F7F5F1',borderTopWidth:1,borderTopColor:'#D7D2CB',padding:8,flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:12},keyboardDone:{color:ACCENT,fontWeight:'700',padding:8},keyboardSave:{backgroundColor:ACCENT,borderRadius:8,paddingHorizontal:14,paddingVertical:10},keyboardSaveText:{color:'#fff',fontWeight:'800'},
})
