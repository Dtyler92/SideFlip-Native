import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { captureEvent } from '../lib/analytics'
import { canCreateAnotherGoal, createMutationId } from './tradeUpGoalModel'

const ACCENT = '#C8402F'
const EMPTY_FORM = { name: '', goalType: 'item', targetItem: '', targetAmount: '', startingAmount: '', description: '' }

export default function GoalCreateScreen({ navigation, route }) {
  const { user, plan } = useAuth()
  const { onCreated } = route.params || {}
  const [form, setForm] = useState(EMPTY_FORM)
  const [activeGoals, setActiveGoals] = useState([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [mutationId] = useState(createMutationId)

  useEffect(() => {
    if (!user?.id) return
    supabase.from('trade_up_goals').select('id,status').eq('user_id', user.id).eq('status', 'active')
      .then(({ data, error }) => {
        if (error) Alert.alert('Could not check goals', error.message)
        else setActiveGoals(data || [])
        setLoading(false)
      })
  }, [user?.id])

  function update(key, value) {
    setForm(current => ({ ...current, [key]: value }))
  }

  function showPaywall() {
    Alert.alert('SideFlip Pro', 'Free includes one active Trade-Up Goal. Upgrade to SideFlip Pro to create additional active goals.', [
      { text: 'Not Now', style: 'cancel' },
      { text: 'View Pro', onPress: () => navigation.navigate('Pro') },
    ])
  }

  async function createGoal() {
    if (!canCreateAnotherGoal(plan, activeGoals)) return showPaywall()
    const name = form.name.trim()
    const targetAmount = Number(form.targetAmount || 0)
    const startingAmount = Number(form.startingAmount || 0)
    if (!name) return Alert.alert('Goal name required', 'Give your Trade-Up Goal a name.')
    if (form.goalType === 'item' && !form.targetItem.trim()) return Alert.alert('Target item required', 'Enter the item you are working toward.')
    if (form.goalType === 'amount' && targetAmount <= 0) return Alert.alert('Target amount required', 'Enter an amount greater than zero.')
    if (!Number.isFinite(targetAmount) || !Number.isFinite(startingAmount) || targetAmount < 0 || startingAmount < 0) return Alert.alert('Check amounts', 'Goal amounts must be valid positive numbers.')

    setSaving(true)
    try {
      const { data: goalId, error } = await supabase.rpc('create_trade_up_goal', {
        p_name: name,
        p_goal_type: form.goalType,
        p_target_item: form.goalType === 'item' ? form.targetItem.trim() : null,
        p_target_amount: targetAmount,
        p_description: form.description.trim() || null,
        p_starting_amount: startingAmount,
        p_mutation_id: mutationId,
      })
      if (error) throw error
      captureEvent('goal_created', { goal_type: form.goalType })
      await onCreated?.({ id: goalId, name, status: 'active', available: startingAmount })
      navigation.goBack()
    } catch (error) {
      Alert.alert('Could not create goal', error.message || 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={ACCENT} /></View>

  return (
    <View style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.headerSide}><Text style={s.backText}>‹ Back</Text></TouchableOpacity>
        <Text style={s.headerTitle}>New Goal</Text>
        <View style={s.headerSide} />
      </View>
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >
        <Text style={s.label}>Goal name *</Text>
        <TextInput style={s.input} value={form.name} onChangeText={value => update('name', value)} placeholder="e.g. Rolex Fund" placeholderTextColor="#A8A49E" autoFocus />

        <Text style={s.label}>Goal type</Text>
        <View style={s.choiceRow}>
          <Choice label="Target Item" selected={form.goalType === 'item'} onPress={() => update('goalType', 'item')} />
          <Choice label="Dollar Amount" selected={form.goalType === 'amount'} onPress={() => update('goalType', 'amount')} />
        </View>

        {form.goalType === 'item' && <>
          <Text style={s.label}>Target item *</Text>
          <TextInput style={s.input} value={form.targetItem} onChangeText={value => update('targetItem', value)} placeholder="What are you working toward?" placeholderTextColor="#A8A49E" />
        </>}

        <Text style={s.label}>{form.goalType === 'amount' ? 'Target amount *' : 'Estimated target amount (optional)'}</Text>
        <TextInput style={s.input} value={form.targetAmount} onChangeText={value => update('targetAmount', value)} placeholder="0.00" placeholderTextColor="#A8A49E" keyboardType="decimal-pad" />

        <Text style={s.label}>Starting amount (optional)</Text>
        <TextInput style={s.input} value={form.startingAmount} onChangeText={value => update('startingAmount', value)} placeholder="0.00" placeholderTextColor="#A8A49E" keyboardType="decimal-pad" />

        <Text style={s.label}>Description (optional)</Text>
        <TextInput style={[s.input, s.textarea]} value={form.description} onChangeText={value => update('description', value)} placeholder="Why this goal matters..." placeholderTextColor="#A8A49E" multiline />

        <TouchableOpacity style={[s.button, saving && s.disabled]} onPress={createGoal} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Create Goal</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

function Choice({ label, selected, onPress }) {
  return <TouchableOpacity style={[s.choice, selected && s.choiceActive]} onPress={onPress}><Text style={[s.choiceText, selected && s.choiceTextActive]}>{label}</Text></TouchableOpacity>
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:'#FAFAF7'},
  center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#FAFAF7'},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingTop:56,paddingBottom:12,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#E8E4DE'},
  headerSide:{width:72},backText:{color:ACCENT,fontSize:16,fontWeight:'600'},headerTitle:{fontSize:17,fontWeight:'700',color:'#1A1917'},
  content:{padding:20,paddingBottom:80},
  label:{fontSize:13,fontWeight:'600',color:'#5C5850',marginBottom:6,marginTop:16},
  input:{borderWidth:1,borderColor:'#E8E4DE',borderRadius:10,padding:14,fontSize:15,color:'#1A1917',backgroundColor:'#fff'},
  textarea:{minHeight:100,textAlignVertical:'top'},
  choiceRow:{flexDirection:'row',gap:8},
  choice:{flex:1,borderWidth:1,borderColor:'#D7D2CB',borderRadius:10,padding:12,alignItems:'center',backgroundColor:'#fff'},
  choiceActive:{borderColor:ACCENT,backgroundColor:'#FFF2EE'},choiceText:{fontSize:13,fontWeight:'600',color:'#5C5850'},choiceTextActive:{color:ACCENT},
  button:{backgroundColor:ACCENT,borderRadius:10,padding:16,alignItems:'center',marginTop:24},disabled:{opacity:0.6},buttonText:{color:'#fff',fontSize:16,fontWeight:'700'},
})
