import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import MultiPhotoPicker from '../components/MultiPhotoPicker'
import { createMutationId } from './tradeUpGoalModel'

const CATEGORIES = [
  {value:'mower',label:'🚜 Lawn Mower'},{value:'car',label:'🚗 Car'},
  {value:'motorcycle',label:'🏍️ Motorcycle'},{value:'atv',label:'🏎️ ATV / Powersports'},
  {value:'boat',label:'⛵ Boat'},{value:'bicycle',label:'🚲 Bicycle / E-Bike'},
  {value:'watch',label:'⌚ Watch'},{value:'electronics',label:'📱 Electronics'},
  {value:'gaming',label:'🎮 Gaming / Console'},{value:'tool',label:'🔧 Tool / Equipment'},
  {value:'exercise',label:'💪 Exercise Equipment'},{value:'instrument',label:'🎸 Musical Instrument'},
  {value:'furniture',label:'🪑 Furniture'},{value:'other',label:'📦 Other'},
]

const money = value => '$' + (Number(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const roundMoney = value => Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100

export default function NewProjectScreen({ navigation, route }) {
  const { user, isPro } = useAuth()
  const { onReturn } = route.params || {}
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('mower')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState([])
  const [activeGoals, setActiveGoals] = useState([])
  const [selectedGoalId, setSelectedGoalId] = useState(null)
  const [goalFundingInput, setGoalFundingInput] = useState('0')
  const [saving, setSaving] = useState(false)
  const projectMutationIdRef = useRef(createMutationId())
  const [showCats, setShowCats] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    supabase.from('trade_up_goals').select('id,name,goal_ledger(amount)').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.warn('Could not load active goals:', error.message)
        else setActiveGoals((data || []).map(goal => ({
          ...goal,
          available: Math.max(0, (goal.goal_ledger || []).reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0)),
        })))
      })
  }, [user?.id])

  const selectedGoal = activeGoals.find(goal => goal.id === selectedGoalId)
  const goalAvailable = Number(selectedGoal?.available) || 0
  const purchasePriceValue = roundMoney(purchasePrice)
  const goalFundingValue = roundMoney(goalFundingInput)
  const outOfPocketPreview = Math.max(0, roundMoney(purchasePriceValue - goalFundingValue))

  async function handleSave() {
    if (!title.trim()) return Alert.alert('Give your project a name')
    const rawPrice = Number(purchasePrice || 0)
    const rawFunding = Number(goalFundingInput || 0)
    if (!Number.isFinite(rawPrice) || rawPrice < 0) return Alert.alert('Enter a valid purchase price')
    if (!Number.isFinite(rawFunding) || rawFunding < 0) return Alert.alert('Enter a valid goal amount')

    const price = roundMoney(rawPrice)
    const funding = selectedGoalId ? roundMoney(rawFunding) : 0
    if (funding > price) return Alert.alert('Goal amount too high', 'The amount used from your goal cannot exceed the project purchase price.')
    if (funding > goalAvailable) return Alert.alert('Goal amount too high', `This goal currently has ${money(goalAvailable)} available.`)
    const outOfPocket = roundMoney(price - funding)

    setSaving(true)
    try {
      if (selectedGoalId) {
        const { data: projectId, error: createError } = await supabase.rpc('create_trade_up_project', {
          p_title: title.trim(),
          p_category: category,
          p_purchase_price: price,
          p_photo: photos[0] || null,
          p_notes: notes.trim() || null,
          p_model_number: null,
          p_serial_number: null,
          p_engine_model: null,
          p_engine_serial: null,
          p_vin: null,
          p_hull_number: null,
          p_vehicle_year: null,
          p_vehicle_make: null,
          p_vehicle_model: null,
          p_goal_id: selectedGoalId,
          p_goal_funding: funding,
          p_out_of_pocket: outOfPocket,
          p_mutation_id: projectMutationIdRef.current,
        })
        if (createError) throw createError
        const { error: galleryError } = await supabase.from('projects').update({ photo: photos[0] || null, photos }).eq('id', projectId).eq('user_id', user.id)
        if (galleryError) Alert.alert('Project created', 'The project was linked to your goal, but some gallery photos could not be attached. You can add them from Project Details.')
      } else {
        const { error } = await supabase.from('projects').insert({
          user_id: user.id,
          title: title.trim(),
          category,
          purchase_price: price,
          notes: notes.trim() || null,
          photo: photos[0] || null,
          photos,
          status: 'active',
        })
        if (error) throw error
      }
      onReturn?.()
      navigation.goBack()
    } catch (err) {
      Alert.alert('Error', err.message)
    } finally {
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

      <KeyboardAvoidingView style={s.keyboardArea} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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

        <Text style={[s.label, {marginTop:16}]}>Category</Text>
        <TouchableOpacity style={s.select} onPress={() => setShowCats(!showCats)}>
          <Text style={s.selectText}>{selectedCat?.label}</Text>
          <Text style={{color:'#A8A49E',fontSize:12,fontWeight:'700'}}>Choose</Text>
        </TouchableOpacity>
        {showCats && (
          <View style={s.catList}>
            {CATEGORIES.map(c => (
              <TouchableOpacity key={c.value} style={[s.catItem, category===c.value && s.catItemActive]}
                onPress={() => { setCategory(c.value); setShowCats(false) }}>
                <Text style={[s.catItemText, category===c.value && s.catItemTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {activeGoals.length > 0 && (
          <View>
            <Text style={[s.label, {marginTop:16}]}>Trade-Up Goal (optional)</Text>
            <Text style={s.goalHint}>Connect this project to a goal. Its purchase and sale will update goal progress.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.goalChoices}>
              <TouchableOpacity style={[s.goalChoice, !selectedGoalId && s.goalChoiceActive]} onPress={() => { setSelectedGoalId(null); setGoalFundingInput('0') }}>
                <Text style={[s.goalChoiceText, !selectedGoalId && s.goalChoiceTextActive]}>No goal</Text>
              </TouchableOpacity>
              {activeGoals.map(goal => (
                <TouchableOpacity key={goal.id} style={[s.goalChoice, selectedGoalId === goal.id && s.goalChoiceActive]} onPress={() => { setSelectedGoalId(goal.id); setGoalFundingInput('0') }}>
                  <Text style={[s.goalChoiceText, selectedGoalId === goal.id && s.goalChoiceTextActive]} numberOfLines={1}>{goal.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <Text style={[s.label, {marginTop:16}]}>Purchase Price</Text>
        <TextInput style={s.input} placeholder="0.00" placeholderTextColor="#A8A49E"
          value={purchasePrice} onChangeText={setPurchasePrice} keyboardType="decimal-pad" />

        {selectedGoal && (
          <View style={s.fundingCard}>
            <View style={s.fundingHeader}>
              <Text style={s.fundingTitle}>Use from goal balance</Text>
              <Text style={s.availableText}>{money(goalAvailable)} available</Text>
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
              <Text style={s.fundingSummaryValue}>{money(outOfPocketPreview)}</Text>
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
      </KeyboardAvoidingView>
    </View>
  )
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:'#FAFAF7'},
  keyboardArea:{flex:1},
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
  btn:{backgroundColor:'#C8402F',borderRadius:10,padding:16,alignItems:'center',marginTop:24},
  btnDisabled:{opacity:0.6},btnText:{color:'#fff',fontSize:16,fontWeight:'700'},
})
