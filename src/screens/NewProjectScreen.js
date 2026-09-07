import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Alert, ActivityIndicator, Platform } from 'react-native'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import MultiPhotoPicker from '../components/MultiPhotoPicker'
import { accessibleActiveGoalsAfterProLoss } from './tradeUpGoalModel'
import { captureEvent } from '../lib/analytics'
import { openGoalCreation } from './goalCreationNavigation'
import VinDecodePanel from '../components/VinDecodePanel'
import { buildProjectCreatePersistence, buildProjectVinCreateSuggestions, vehicleDetailsAfterCategoryChange } from '../domain/vinCreateModel'
import { validateVinIdentifier } from '../domain/myStuff/vinModel'
import { createMutationAttemptState, mutationIdForPayload, resetMutationAttemptState } from './myStuffModel'

const CATEGORIES = [
  {value:'mower',label:'🚜 Lawn Mower'},{value:'car',label:'🚗 Car'},{value:'truck',label:'🛻 Truck'},
  {value:'motorcycle',label:'🏍️ Motorcycle'},{value:'atv',label:'🏎️ ATV / Powersports'},{value:'side_by_side',label:'🏁 Side-by-side'},
  {value:'trailer',label:'🚛 Trailer'},{value:'rv',label:'🚐 RV'},
  {value:'boat',label:'⛵ Boat'},{value:'airplane',label:'✈️ Airplane'},{value:'bicycle',label:'🚲 Bicycle / E-Bike'},
  {value:'watch',label:'⌚ Watch'},{value:'electronics',label:'📱 Electronics'},
  {value:'gaming',label:'🎮 Gaming / Console'},{value:'tool',label:'🔧 Tool / Equipment'},
  {value:'exercise',label:'💪 Exercise Equipment'},{value:'instrument',label:'🎸 Musical Instrument'},
  {value:'furniture',label:'🪑 Furniture'},{value:'house',label:'🏠 Home Improvement'},
  {value:'other',label:'📦 Other'},
]

const roundMoney = value => Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100
const VEHICLE_PROJECT_CATEGORIES = new Set(['car', 'truck', 'motorcycle', 'atv', 'side_by_side', 'trailer', 'rv'])
const EMPTY_VEHICLE_DETAILS = { vin: '', year: '', make: '', model: '', engine: '' }

export default function NewProjectScreen({ navigation, route }) {
  const { user, isPro, plan, formatMoney } = useAuth()
  const { onReturn } = route.params || {}
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [notes, setNotes] = useState('')
  const [vehicleDetails, setVehicleDetails] = useState(EMPTY_VEHICLE_DETAILS)
  const [identifiers, setIdentifiers] = useState({ modelNumber:'', serialNumber:'' })
  const [photos, setPhotos] = useState([])
  const [activeGoals, setActiveGoals] = useState([])
  const [selectedGoalId, setSelectedGoalId] = useState(null)
  const [goalFundingInput, setGoalFundingInput] = useState('0')
  const [saving, setSaving] = useState(false)
  const projectMutationAttempt = useRef(createMutationAttemptState())
  const submitInFlight = useRef(false)
  const goalLoadGeneration = useRef(0)
  const [showCats, setShowCats] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    const request = ++goalLoadGeneration.current
    supabase.from('trade_up_goals').select('id,name,status,created_at,goal_ledger(amount)').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (request !== goalLoadGeneration.current) return
        if (error) console.warn('Could not load active goals:', error.message)
        else {
          const preparedGoals = (data || []).map(goal => ({
            ...goal,
            available: Math.max(0, (goal.goal_ledger || []).reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0)),
          }))
          setActiveGoals(preparedGoals)
        }
      })
    return () => {
      if (request === goalLoadGeneration.current) goalLoadGeneration.current += 1
    }
  }, [user?.id, plan])

  const selectableGoals = accessibleActiveGoalsAfterProLoss(activeGoals, plan)
  const selectedGoal = selectableGoals.find(goal => goal.id === selectedGoalId)
  const goalAvailable = Number(selectedGoal?.available) || 0
  const purchasePriceValue = roundMoney(purchasePrice)
  const goalFundingValue = roundMoney(goalFundingInput)
  const outOfPocketPreview = Math.max(0, roundMoney(purchasePriceValue - goalFundingValue))

  function handleCreateGoal() {
    openGoalCreation({
      navigation,
      plan,
      activeGoals: selectableGoals,
      onCreated: goal => {
        setActiveGoals(current => [goal, ...current.filter(item => item.id !== goal.id)])
        setSelectedGoalId(goal.id)
        setGoalFundingInput('0')
      },
    })
  }

  function applyVinValues(values) {
    setTitle(values.title ?? '')
    setCategory(values.category ?? '')
    setVehicleDetails({ vin: values.vin ?? '', year: values.year ?? '', make: values.make ?? '', model: values.model ?? '', engine: values.engine ?? '' })
  }

  function selectCategory(value) {
    setCategory(value)
    setVehicleDetails(current => vehicleDetailsAfterCategoryChange(current, VEHICLE_PROJECT_CATEGORIES.has(value)))
    setShowCats(false)
  }

  async function handleSave() {
    if (submitInFlight.current) return
    if (!title.trim()) return Alert.alert('Give your project a name')
    if (!category) return Alert.alert('Select a category', 'Choose the category that best matches this project.')
    if (selectedGoalId && !selectedGoal) return Alert.alert('Goal locked', 'Your plan changed. Choose the oldest available Goal or upgrade to SideFlip Pro.')
    const rawPrice = Number(purchasePrice || 0)
    const rawFunding = Number(goalFundingInput || 0)
    if (!Number.isFinite(rawPrice) || rawPrice < 0) return Alert.alert('Enter a valid purchase price')
    if (!Number.isFinite(rawFunding) || rawFunding < 0) return Alert.alert('Enter a valid goal amount')
    if (VEHICLE_PROJECT_CATEGORIES.has(category)) {
      const yearText = String(vehicleDetails.year || '').trim()
      const year = yearText === '' ? null : Number(yearText)
      if (yearText && (!Number.isInteger(year) || year < 1800 || year > 2200)) return Alert.alert('Check model year', 'Enter a whole year from 1800 to 2200, or leave it blank.')
      const vinValidation = validateVinIdentifier(vehicleDetails.vin, 'project')
      if (!vinValidation.ok) return Alert.alert('Check VIN / identifier', vinValidation.reason)
    }

    const price = roundMoney(rawPrice)
    const funding = selectedGoalId ? roundMoney(rawFunding) : 0
    if (funding > price) return Alert.alert('Goal amount too high', 'The amount used from your goal cannot exceed the project purchase price.')
    if (funding > goalAvailable) return Alert.alert('Goal amount too high', `This goal currently has ${formatMoney(goalAvailable)} available.`)
    const outOfPocket = roundMoney(price - funding)
    const vehiclePersistence = VEHICLE_PROJECT_CATEGORIES.has(category) ? buildProjectCreatePersistence(vehicleDetails) : buildProjectCreatePersistence()

    submitInFlight.current = true
    setSaving(true)
    try {
      if (selectedGoalId) {
        const rpcPayload = {
          p_title: title.trim(),
          p_category: category,
          p_purchase_price: price,
          p_photo: photos[0] || null,
          p_notes: notes.trim() || null,
          p_model_number: identifiers.modelNumber.trim() || null,
          p_serial_number: identifiers.serialNumber.trim() || null,
          p_engine_model: vehiclePersistence.engine_model,
          p_engine_serial: null,
          p_vin: vehiclePersistence.vin,
          p_hull_number: null,
          p_vehicle_year: vehiclePersistence.vehicle_year,
          p_vehicle_make: vehiclePersistence.vehicle_make,
          p_vehicle_model: vehiclePersistence.vehicle_model,
          p_goal_id: selectedGoalId,
          p_goal_funding: funding,
          p_out_of_pocket: outOfPocket,
        }
        const mutationId = mutationIdForPayload(projectMutationAttempt.current, rpcPayload)
        const { data: projectId, error: createError } = await supabase.rpc('create_trade_up_project', { ...rpcPayload, p_mutation_id: mutationId })
        if (createError) throw createError
        resetMutationAttemptState(projectMutationAttempt.current)
        const { error: galleryError } = await supabase.from('projects').update({ photo: photos[0] || null, photos }).eq('id', projectId).eq('user_id', user.id)
        if (galleryError) Alert.alert('Project created', 'The project was linked to your goal, but some gallery photos could not be attached. You can add them from Project Details.')
      } else {
        const directPayload = {
          user_id: user.id,
          title: title.trim(),
          category,
          purchase_price: price,
          notes: notes.trim() || null,
          photo: photos[0] || null,
          photos,
          status: 'active',
          model_number: identifiers.modelNumber.trim() || null,
          serial_number: identifiers.serialNumber.trim() || null,
          ...vehiclePersistence,
        }
        const mutationId = mutationIdForPayload(projectMutationAttempt.current, directPayload)
        const { error } = await supabase.from('projects').insert({ ...directPayload, trade_up_mutation_id: mutationId })
        if (error?.code === '23505') {
          const { data: existing, error: recoveryError } = await supabase
            .from('projects')
            .select('id')
            .eq('user_id', user.id)
            .eq('trade_up_mutation_id', mutationId)
            .maybeSingle()
          if (recoveryError || !existing?.id) throw error
        } else if (error) {
          throw error
        }
        resetMutationAttemptState(projectMutationAttempt.current)
      }
      captureEvent('project_created', { project_category: category, is_goal_linked: Boolean(selectedGoalId) })
      onReturn?.()
      navigation.goBack()
    } catch (err) {
      Alert.alert('Error', err.message)
    } finally {
      submitInFlight.current = false
      setSaving(false)
    }
  }

  const selectedCat = CATEGORIES.find(c => c.value === category)

  return (
    <View style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>New Project</Text>
        <View style={{width:60}} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >
        <MultiPhotoPicker
          userId={user.id}
          photos={photos}
          onUpdate={setPhotos}
          isPro={isPro}
          onUpgrade={() => navigation.navigate('Pro')}
        />

        <Text style={s.label}>Project Name *</Text>
        <TextInput style={s.input} placeholder="e.g. Honda HRR216 Mower" placeholderTextColor="#A8A49E"
          value={title} onChangeText={setTitle} autoFocus />

        <Text style={[s.label, {marginTop:16}]}>Category *</Text>
        <TouchableOpacity style={s.select} onPress={() => setShowCats(!showCats)}>
          <Text style={s.selectText}>{selectedCat?.label || 'Select'}</Text>
          <Text style={{color:'#A8A49E',fontSize:12,fontWeight:'700'}}>Choose</Text>
        </TouchableOpacity>
        {showCats && (
          <View style={s.catList}>
            {CATEGORIES.map(c => (
              <TouchableOpacity key={c.value} style={[s.catItem, category===c.value && s.catItemActive]}
                onPress={() => selectCategory(c.value)}>
                <Text style={[s.catItemText, category===c.value && s.catItemTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {VEHICLE_PROJECT_CATEGORIES.has(category) && (
          <View style={s.vehicleCard}>
            <Text style={s.vehicleTitle}>Vehicle details</Text>
            <Text style={s.goalHint}>Decode with NHTSA or enter every vehicle field manually.</Text>
            <VinDecodePanel
              subjectType="project"
              subjectId={null}
              values={{ title, category, ...vehicleDetails }}
              onChange={applyVinValues}
              mapSuggestions={buildProjectVinCreateSuggestions}
              suggestionFields={['title','category','year','make','model','engine']}
              autoFillBlanks
            />
            <Text style={s.label}>Model year</Text>
            <TextInput style={s.input} value={vehicleDetails.year} onChangeText={year => setVehicleDetails(current => ({ ...current, year }))} keyboardType="number-pad" />
            <Text style={s.label}>Make</Text>
            <TextInput style={s.input} value={vehicleDetails.make} onChangeText={make => setVehicleDetails(current => ({ ...current, make }))} />
            <Text style={s.label}>Model</Text>
            <TextInput style={s.input} value={vehicleDetails.model} onChangeText={model => setVehicleDetails(current => ({ ...current, model }))} />
            <Text style={s.label}>Engine</Text>
            <TextInput style={s.input} value={vehicleDetails.engine} onChangeText={engine => setVehicleDetails(current => ({ ...current, engine }))} />
          </View>
        )}

        <View style={s.vehicleCard}>
          <Text style={s.vehicleTitle}>{VEHICLE_PROJECT_CATEGORIES.has(category)?'Additional identifiers':'Model & serial identification'}</Text>
          {!VEHICLE_PROJECT_CATEGORIES.has(category)&&<Text style={s.goalHint}>Use the manufacturer model and serial numbers. Automatic model/serial lookup is not available yet.</Text>}
          <Text style={s.label}>Model number</Text>
          <TextInput style={s.input} value={identifiers.modelNumber} onChangeText={modelNumber=>setIdentifiers(current=>({...current,modelNumber}))} maxLength={200} accessibilityLabel="Model number"/>
          <Text style={s.label}>Serial number</Text>
          <TextInput style={s.input} value={identifiers.serialNumber} onChangeText={serialNumber=>setIdentifiers(current=>({...current,serialNumber}))} maxLength={200} autoCapitalize="characters" accessibilityLabel="Serial number"/>
        </View>

        <View>
            <View style={s.goalLabelRow}>
              <Text style={[s.label, s.goalLabel]}>Trade-Up Goal (optional)</Text>
              <TouchableOpacity style={s.goalAddButton} onPress={handleCreateGoal} accessibilityRole="button" accessibilityLabel="Create new Trade-Up Goal">
                <Text style={s.goalAddText}>+</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.goalHint}>Connect this project to a goal. Its purchase and sale will update goal progress.</Text>
            {selectableGoals.length > 0 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.goalChoices}>
              <TouchableOpacity style={[s.goalChoice, !selectedGoalId && s.goalChoiceActive]} onPress={() => { setSelectedGoalId(null); setGoalFundingInput('0') }}>
                <Text style={[s.goalChoiceText, !selectedGoalId && s.goalChoiceTextActive]}>No goal</Text>
              </TouchableOpacity>
              {selectableGoals.map(goal => (
                <TouchableOpacity key={goal.id} style={[s.goalChoice, selectedGoalId === goal.id && s.goalChoiceActive]} onPress={() => { setSelectedGoalId(goal.id); setGoalFundingInput('0') }}>
                  <Text style={[s.goalChoiceText, selectedGoalId === goal.id && s.goalChoiceTextActive]} numberOfLines={1}>{goal.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView> : <Text style={s.noGoalsText}>No active goals yet. Tap + to create one.</Text>}
          </View>

        <Text style={[s.label, {marginTop:16}]}>Purchase Price</Text>
        <TextInput style={s.input} placeholder="0.00" placeholderTextColor="#A8A49E"
          value={purchasePrice} onChangeText={setPurchasePrice} keyboardType="decimal-pad" />

        {selectedGoal && (
          <View style={s.fundingCard}>
            <View style={s.fundingHeader}>
              <Text style={s.fundingTitle}>Use from goal balance</Text>
              <Text style={s.availableText}>{formatMoney(goalAvailable)} available</Text>
            </View>
            <Text style={s.goalHint}>Choose how much of this purchase comes from the goal. The rest is tracked as out-of-pocket.</Text>
            <View style={s.fundingInputRow}>
              <TextInput
                style={[s.input, s.fundingInput]}
                placeholder="0.00"
                placeholderTextColor="#A8A49E"
                value={goalFundingInput}
                onChangeText={setGoalFundingInput}
                keyboardType="decimal-pad"
              />
              <TouchableOpacity
                style={s.useMaxButton}
                onPress={() => setGoalFundingInput(String(Math.min(goalAvailable, purchasePriceValue)))}
              >
                <Text style={s.useMaxText}>Use max</Text>
              </TouchableOpacity>
            </View>
            <View style={s.fundingSummary}>
              <Text style={s.fundingSummaryLabel}>Out-of-pocket</Text>
              <Text style={s.fundingSummaryValue}>{formatMoney(outOfPocketPreview)}</Text>
            </View>
          </View>
        )}

        <Text style={[s.label, {marginTop:16}]}>Notes (optional)</Text>
        <TextInput style={[s.input, s.textarea]} placeholder="Condition, what's wrong, the plan..."
          placeholderTextColor="#A8A49E" value={notes} onChangeText={setNotes} multiline numberOfLines={4} />

        <TouchableOpacity style={[s.btn, saving && s.btnDisabled]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Create Project</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:'#FAFAF7'},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingTop:56,paddingBottom:12,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#E8E4DE'},
  backBtn:{width:60},backText:{color:'#C8402F',fontSize:16,fontWeight:'600'},
  headerTitle:{fontSize:17,fontWeight:'700',color:'#1A1917'},
  scroll:{flex:1},content:{padding:20,paddingBottom:60},
  label:{fontSize:13,fontWeight:'600',color:'#5C5850',marginBottom:6},
  input:{borderWidth:1,borderColor:'#E8E4DE',borderRadius:10,padding:14,fontSize:15,color:'#1A1917',backgroundColor:'#fff'},
  textarea:{minHeight:100,textAlignVertical:'top'},
  select:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderWidth:1,borderColor:'#E8E4DE',borderRadius:10,padding:14,backgroundColor:'#fff'},
  selectText:{fontSize:15,color:'#1A1917'},
  catList:{borderWidth:1,borderColor:'#E8E4DE',borderRadius:10,backgroundColor:'#fff',marginTop:4,overflow:'hidden'},
  catItem:{padding:14,borderBottomWidth:1,borderBottomColor:'#F0EDE8'},
  catItemActive:{backgroundColor:'#C8402F'},
  catItemText:{fontSize:14,color:'#1A1917'},
  catItemTextActive:{color:'#fff',fontWeight:'600'},
  goalHint:{fontSize:12,lineHeight:17,color:'#8C8880',marginBottom:9},
  goalLabelRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:16},
  goalLabel:{marginBottom:0},
  goalAddButton:{width:32,height:32,borderRadius:16,borderWidth:1.5,borderColor:'#C8402F',alignItems:'center',justifyContent:'center',backgroundColor:'#FFF2EE'},
  goalAddText:{fontSize:22,lineHeight:24,color:'#C8402F',fontWeight:'700'},
  noGoalsText:{fontSize:13,color:'#8C8880',paddingVertical:7},
  goalChoices:{gap:8,paddingRight:8},
  goalChoice:{maxWidth:190,borderWidth:1,borderColor:'#D7D2CB',borderRadius:20,paddingHorizontal:13,paddingVertical:9,backgroundColor:'#fff'},
  goalChoiceActive:{borderColor:'#C8402F',backgroundColor:'#FFF2EE'},
  goalChoiceText:{fontSize:13,color:'#5C5850',fontWeight:'600'},
  goalChoiceTextActive:{color:'#C8402F'},
  fundingCard:{marginTop:14,padding:14,borderRadius:12,borderWidth:1,borderColor:'#CFE4D8',backgroundColor:'#F3FAF6'},
  fundingHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:5},
  fundingTitle:{fontSize:14,fontWeight:'700',color:'#1A1917'},
  availableText:{fontSize:12,fontWeight:'700',color:'#2D7A4F'},
  fundingInputRow:{flexDirection:'row',alignItems:'center',gap:10},
  fundingInput:{flex:1},
  useMaxButton:{paddingHorizontal:14,paddingVertical:14,borderRadius:10,backgroundColor:'#2D7A4F'},
  useMaxText:{fontSize:13,fontWeight:'700',color:'#fff'},
  fundingSummary:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:12,paddingTop:10,borderTopWidth:1,borderTopColor:'#D8EADF'},
  fundingSummaryLabel:{fontSize:13,color:'#5C5850'},
  fundingSummaryValue:{fontSize:15,fontWeight:'800',color:'#1A1917'},
  vehicleCard:{marginTop:16,padding:14,borderRadius:12,borderWidth:1,borderColor:'#E8E4DE',backgroundColor:'#fff'},
  vehicleTitle:{fontSize:16,fontWeight:'800',color:'#1A1917'},
  btn:{backgroundColor:'#C8402F',borderRadius:10,padding:16,alignItems:'center',marginTop:24},
  btnDisabled:{opacity:0.6},btnText:{color:'#fff',fontSize:16,fontWeight:'700'},
})
