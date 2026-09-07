import { useRef, useState } from 'react'
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { createMyStuffItemV2 } from '../lib/myStuffClient'
import { buildCreateMyStuffItemV2WirePayload } from '../lib/myStuffPayloads'
import MyStuffItemTypePicker, { ValidationErrors } from '../components/MyStuffItemTypePicker'
import { deriveItemCategory, getItemCategoryContract, requiresUsageAndPurchase, selectItemType, supportsVinDecoder, toggleItemMeasurementDraft, validateItemDraft } from '../domain/myStuff/itemModel'
import { createMutationAttemptState, mutationIdForPayload, resetMutationAttemptState, validateCalendarDate } from './myStuffModel'

import VinDecodePanel from '../components/VinDecodePanel'
import { buildMyStuffVinCreateSuggestions } from '../domain/vinCreateModel'

const ACCENT = '#C8402F'
const AXES = [{ key: 'miles', label: 'Miles' }, { key: 'hours', label: 'Hours' }, { key: 'cycles', label: 'Cycles' }]

export default function MyStuffCreateScreen({ navigation }) {

  const [draft, setDraft] = useState({ itemType: '', category: '', measurements: [], usageProfile: 'normal' })
  const [validationErrors, setValidationErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const mutationAttempt = useRef(createMutationAttemptState())
  const saveInFlight = useRef(false)

  function setValue(key, value) { setValidationErrors({}); setDraft(current => ({ ...current, [key]: value })) }
  function setExactType(value) { setValidationErrors({}); setDraft(current => selectItemType(current, value)) }
  function applyVinValues(values) {
    setValidationErrors({})
    setDraft(current => values.itemType !== current.itemType ? selectItemType(values, values.itemType) : values)
  }
  function toggleAxis(axis) {
    setDraft(current => toggleItemMeasurementDraft(current, axis))
  }

  async function save() {
    if (saveInFlight.current) return
    if (draft.acquiredOn?.trim() && !validateCalendarDate(draft.acquiredOn)) return Alert.alert('Check acquisition date', 'Use a valid date in YYYY-MM-DD format.')
    const rawUsage = Object.fromEntries(draft.measurements.filter(axis => draft[axis] !== '' && draft[axis] != null).map(axis => [axis, draft[axis]]))
    const validatedDraft = { ...draft, name: String(draft.name || '').trim(), category: deriveItemCategory(draft.itemType), currentUsage: rawUsage }
    const validation = validateItemDraft(validatedDraft, { requireOwnershipFields:true })
    setValidationErrors(validation.errors)
    if (!validation.ok) return
    const currentUsage = Object.fromEntries(Object.entries(rawUsage).map(([axis, value]) => [axis, Number(value)]))
    saveInFlight.current = true
    setSaving(true)
    try {
      const payload = {
        ...validatedDraft,
        acquiredOn: draft.acquiredOn?.trim() || null,
        notes: draft.notes?.trim() || null,
        currentUsage,
      }
      const wirePayload = buildCreateMyStuffItemV2WirePayload(payload)
      const mutationId = mutationIdForPayload(mutationAttempt.current, wirePayload)
      const itemId = await createMyStuffItemV2(wirePayload, mutationId)
      resetMutationAttemptState(mutationAttempt.current)
      navigation.replace('MyStuffDetail', { itemId })
    } catch (error) {
      if (String(error?.message || '').includes('Free accounts can have one My Stuff item')) return navigation.replace('Pro')
      Alert.alert('Could not add item', error.message || 'Please try again.')
    } finally {
      saveInFlight.current = false
      setSaving(false)
    }
  }

  return <SafeAreaView style={s.root} edges={['top']}>
    <Header title="Add Item" onBack={() => navigation.goBack()} />
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
      <Text style={s.section}>Identity</Text>
      {supportsVinDecoder(draft.itemType) && <VinDecodePanel
        subjectType="my_stuff_item"
        subjectId={null}
        values={draft}
        onChange={applyVinValues}
        mapSuggestions={buildMyStuffVinCreateSuggestions}
        autoFillBlanks
        initiallyExpanded
      />}
      {supportsVinDecoder(draft.itemType) && <Text style={s.help}>Add the item to save and confirm its decoded vehicle identity. No research runs before the item exists.</Text>}
      <Field label="Item name *" value={draft.name || ''} onChangeText={value => setValue('name', value)} placeholder="e.g. Work Truck" maxLength={200} />
      <MyStuffItemTypePicker value={draft.itemType} onChange={setExactType} error={validationErrors.itemType || validationErrors.category} />
      <View style={s.twoColumn}>
        <View style={s.flex}><Field label="Model year" value={draft.year || ''} onChangeText={value => setValue('year', value)} keyboardType="number-pad" /></View>
        <View style={s.flex}><Field label="Make" value={draft.make || ''} onChangeText={value => setValue('make', value)} /></View>
      </View>
      <Field label="Model" value={draft.model || ''} onChangeText={value => setValue('model', value)} />
      <Field label="Trim / version" value={draft.trim || ''} onChangeText={value => setValue('trim', value)} />
      <Field label="Model number" value={draft.modelNumber || ''} onChangeText={value => setValue('modelNumber', value)} />
      <Field label="Serial number" value={draft.serialNumber || ''} onChangeText={value => setValue('serialNumber', value)} autoCapitalize="characters" />
      {!supportsVinDecoder(draft.itemType) && <Text style={s.help}>Use the manufacturer model and serial numbers for equipment identity. Automatic model/serial lookup is not available yet.</Text>}
      <Field label="Engine / power system" value={draft.engine || ''} onChangeText={value => setValue('engine', value)} />
      <Field label="Transmission" value={draft.transmission || ''} onChangeText={value => setValue('transmission', value)} />
      <Field label="Drivetrain" value={draft.drivetrain || ''} onChangeText={value => setValue('drivetrain', value)} />
      <Field label="Fuel / power type" value={draft.fuelType || ''} onChangeText={value => setValue('fuelType', value)} />
      <Field label="Acquired on" value={draft.acquiredOn || ''} onChangeText={value => setValue('acquiredOn', value)} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" autoCapitalize="none" />

      <Text style={s.section}>Usage tracking *</Text>
      <Text style={s.help}>{requiresUsageAndPurchase(draft.itemType)?'Choose at least one measurement and enter a current reading for every selection.':'Choose at least one measurement. Current readings are optional and can be added later.'}</Text>
      <View style={s.choices} accessibilityRole="group" accessibilityLabel="Usage measurements">{AXES.filter(axis => getItemCategoryContract(draft.category)?.measurements.includes(axis.key)).map(axis => <Choice key={axis.key} label={axis.label} selected={draft.measurements.includes(axis.key)} onPress={() => toggleAxis(axis.key)} />)}</View>
      {AXES.filter(axis => draft.measurements.includes(axis.key)).map(axis => <Field key={axis.key} label={`Current ${axis.label.toLowerCase()} ${requiresUsageAndPurchase(draft.itemType)?'*':'(optional)'}`} value={draft[axis.key] || ''} onChangeText={value => setValue(axis.key, value)} keyboardType="decimal-pad" />)}
      <Field label={requiresUsageAndPurchase(draft.itemType)?'Purchase price *':'Purchase price (optional)'} value={draft.purchasePrice || ''} onChangeText={value => setValue('purchasePrice', value)} keyboardType="decimal-pad" placeholder="0.00" />
      <Text style={s.label}>Usage profile</Text>
      <View style={s.choices} accessibilityRole="radiogroup" accessibilityLabel="Usage profile">{['normal', 'severe'].map(value => <Choice key={value} label={value === 'normal' ? 'Normal use' : 'Severe use'} selected={draft.usageProfile === value} onPress={() => setValue('usageProfile', value)} exclusive />)}</View>
      <Field label="Notes (optional)" value={draft.notes || ''} onChangeText={value => setValue('notes', value)} multiline maxLength={1000} />
      <ValidationErrors errors={validationErrors} />
      <TouchableOpacity style={[s.button, saving && s.disabled]} onPress={save} disabled={saving} accessibilityRole="button" accessibilityLabel="Add My Stuff item" accessibilityState={{ disabled: saving, busy: saving }}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Add Item</Text>}
      </TouchableOpacity>
    </ScrollView>
  </SafeAreaView>
}

function Header({ title, onBack }) { return <View style={s.header}><TouchableOpacity style={s.headerSide} onPress={onBack} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10}><Text style={s.back}>‹ Back</Text></TouchableOpacity><Text style={s.headerTitle}>{title}</Text><View style={s.headerSide} /></View> }
function Field({ label, multiline, ...props }) { return <View><Text style={s.label}>{label}</Text><TextInput style={[s.input, multiline && s.textarea]} placeholderTextColor="#A8A49E" multiline={multiline} {...props} /></View> }
function Choice({ label, selected, onPress, exclusive = false }) { return <TouchableOpacity style={[s.choice, selected && s.choiceActive]} onPress={onPress} accessibilityRole={exclusive ? 'radio' : 'checkbox'} accessibilityLabel={label} accessibilityState={exclusive ? { selected } : { checked: selected }}><Text style={[s.choiceText, selected && s.choiceTextActive]}>{label}</Text></TouchableOpacity> }

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:'#FAFAF7'},header:{paddingBottom:12,paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#E8E4DE'},headerSide:{width:75},back:{color:ACCENT,fontWeight:'700',fontSize:15},headerTitle:{fontWeight:'800',fontSize:17,color:'#1A1917'},content:{padding:20,paddingBottom:120},section:{fontSize:18,fontWeight:'800',color:'#1A1917',marginTop:14,marginBottom:2},help:{fontSize:13,color:'#6B665E',lineHeight:19,marginBottom:10},label:{fontSize:13,fontWeight:'700',color:'#5C5850',marginTop:15,marginBottom:6},input:{backgroundColor:'#fff',borderWidth:1,borderColor:'#D7D2CB',borderRadius:10,padding:14,fontSize:15,color:'#1A1917'},textarea:{minHeight:110,textAlignVertical:'top'},choices:{flexDirection:'row',flexWrap:'wrap',gap:8},choice:{borderWidth:1,borderColor:'#D7D2CB',backgroundColor:'#fff',paddingHorizontal:12,paddingVertical:10,borderRadius:10},choiceActive:{borderColor:ACCENT,backgroundColor:'#FFF2EE'},choiceText:{color:'#5C5850',fontWeight:'600'},choiceTextActive:{color:ACCENT},twoColumn:{flexDirection:'row',gap:10},flex:{flex:1},button:{marginTop:26,backgroundColor:ACCENT,borderRadius:11,padding:16,alignItems:'center'},buttonText:{color:'#fff',fontWeight:'800',fontSize:16},disabled:{opacity:.6},
})
