import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, InputAccessoryView, Keyboard, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { supabase } from '../lib/supabase'

const fmt = n => '$' + Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const getTotalInvested = p => (p.expenses||[]).reduce((s,e)=>s+Number(e.amount),0) + (Number(p.purchase_price)||0)
const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100
const SALE_KEYBOARD_ACCESSORY_ID = 'sell-project-number-pad-actions'

export default function SellProjectScreen({ navigation, route }) {
  const { projectId, project: proj, onReturn } = route.params || {}
  const [project] = useState(proj)
  const [salePrice, setSalePrice] = useState('')
  const [cashKeptOutInput, setCashKeptOutInput] = useState('0')
  const [saving, setSaving] = useState(false)

  if (!project) return null

  const totalInvested = getTotalInvested(project)
  const preview = salePrice ? Number(salePrice) - totalInvested : null
  const roi = preview !== null && totalInvested ? ((preview / totalInvested) * 100).toFixed(1) : null

  async function handleSell() {
    const price = roundMoney(salePrice)
    const cashKeptOut = roundMoney(cashKeptOutInput || 0)
    const goalRetained = roundMoney(price - cashKeptOut)
    if (!salePrice || !Number.isFinite(price) || price < 0) return Alert.alert('Enter a valid sale price')
    if (project.goal_id && price === 0) return Alert.alert('Enter a sale price', 'A goal-linked sale must be greater than $0 so proceeds can be recorded toward the goal.')
    if (!Number.isFinite(cashKeptOut) || cashKeptOut < 0 || cashKeptOut > price) return Alert.alert('Cash kept out must be between $0 and the sale price.')
    setSaving(true)
    try {
      if (project.goal_id) {
        const { error } = await supabase.rpc('record_trade_up_sale', {
          p_project_id: projectId,
          p_sale_price: price,
          p_keep_amount: goalRetained,
        })
        if (error) throw error
      } else {
        const { error } = await supabase.from('projects').update({
          status: 'sold',
          sale_price: price,
          sold_at: new Date().toISOString(),
        }).eq('id', projectId)
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

  return (
    <View style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Mark as Sold</Text>
        <View style={{width:60}} />
      </View>

      <KeyboardAvoidingView style={s.keyboardArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={s.content}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
        <View style={s.card}>
          <Text style={s.projectLabel}>Project</Text>
          <Text style={s.projectTitle}>{project.title}</Text>
          <View style={s.row}>
            <Text style={s.label}>Total Invested</Text>
            <Text style={[s.value,{color:'#C8402F'}]}>{fmt(totalInvested)}</Text>
          </View>
        </View>

        <Text style={s.sectionLabel}>Sale Price</Text>
        <TextInput
          style={s.bigInput} placeholder="0.00" placeholderTextColor="#A8A49E"
          value={salePrice} onChangeText={setSalePrice} keyboardType="decimal-pad" autoFocus
          inputAccessoryViewID={SALE_KEYBOARD_ACCESSORY_ID}
        />

        {project.goal_id && (
          <View style={s.goalSplit}>
            <Text style={s.sectionLabel}>Cash kept out</Text>
            <Text style={s.goalSplitHint}>Leave $0 to roll all sale proceeds into this Trade-Up Goal.</Text>
            <TextInput
              style={s.splitInput}
              placeholder="0.00"
              placeholderTextColor="#A8A49E"
              value={cashKeptOutInput}
              onChangeText={setCashKeptOutInput}
              keyboardType="decimal-pad"
              inputAccessoryViewID={SALE_KEYBOARD_ACCESSORY_ID}
            />
          </View>
        )}

        {preview !== null && (
          <View style={[s.previewCard, preview<0 && s.previewCardLoss]}>
            <Text style={[s.previewLabel, preview<0 && s.previewLabelLoss]}>{preview>=0?'Profit':'Loss'}</Text>
            <Text style={[s.previewAmount, preview<0 && s.previewAmountLoss]}>{preview>=0?'+':''}{fmt(preview)}</Text>
            {roi && <Text style={[s.previewRoi, preview<0 && s.previewLabelLoss]}>{preview>=0?'📈':'📉'} {roi}% ROI</Text>}
          </View>
        )}

        <TouchableOpacity style={[s.btn, saving && s.btnDisabled]} onPress={handleSell} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Confirm Sale</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={s.cancelBtn} onPress={() => { Keyboard.dismiss(); navigation.goBack() }}>
          <Text style={s.cancelText}>Cancel</Text>
        </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={SALE_KEYBOARD_ACCESSORY_ID}>
          <View style={s.keyboardToolbar}>
            <TouchableOpacity style={s.keyboardDone} onPress={() => Keyboard.dismiss()}>
              <Text style={s.keyboardDoneText}>Done</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.keyboardConfirm, saving && s.btnDisabled]} onPress={handleSell} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.keyboardConfirmText}>Confirm Sale</Text>}
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:'#FAFAF7'},
  keyboardArea:{flex:1},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingTop:56,paddingBottom:12,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#E8E4DE'},
  backBtn:{width:60},backText:{color:'#C8402F',fontSize:16,fontWeight:'600'},
  headerTitle:{fontSize:17,fontWeight:'700',color:'#1A1917'},
  content:{padding:20},
  card:{backgroundColor:'#fff',borderRadius:12,padding:16,marginBottom:20,shadowColor:'#000',shadowOpacity:0.04,shadowRadius:8,shadowOffset:{width:0,height:2},elevation:2},
  projectLabel:{fontSize:10,color:'#A8A49E',textTransform:'uppercase',letterSpacing:0.5,marginBottom:4},
  projectTitle:{fontSize:18,fontWeight:'700',color:'#1A1917',marginBottom:12},
  row:{flexDirection:'row',justifyContent:'space-between'},
  label:{fontSize:14,color:'#5C5850'},value:{fontSize:14,fontWeight:'700'},
  sectionLabel:{fontSize:13,fontWeight:'600',color:'#5C5850',marginBottom:8},
  bigInput:{backgroundColor:'#fff',borderRadius:12,borderWidth:1,borderColor:'#E8E4DE',padding:20,fontSize:36,fontWeight:'700',color:'#1A1917',textAlign:'center',marginBottom:16},
  goalSplit:{backgroundColor:'#FFF9F6',borderWidth:1,borderColor:'#F1D2C8',borderRadius:12,padding:14,marginBottom:16},
  goalSplitHint:{fontSize:12,lineHeight:17,color:'#8C8880',marginBottom:8},
  splitInput:{backgroundColor:'#fff',borderRadius:10,borderWidth:1,borderColor:'#E8E4DE',padding:13,fontSize:18,fontWeight:'700',color:'#1A1917'},
  previewCard:{backgroundColor:'#E8F5EE',borderRadius:12,padding:20,alignItems:'center',marginBottom:16},
  previewCardLoss:{backgroundColor:'#FDECEA'},
  previewLabel:{fontSize:11,color:'#2D7A4F',textTransform:'uppercase',letterSpacing:0.5,marginBottom:4},
  previewLabelLoss:{color:'#C8402F'},
  previewAmount:{fontSize:32,fontWeight:'800',color:'#2D7A4F'},
  previewAmountLoss:{color:'#C8402F'},
  previewRoi:{fontSize:13,color:'#2D7A4F',marginTop:4,fontWeight:'600'},
  btn:{backgroundColor:'#2D7A4F',borderRadius:12,padding:16,alignItems:'center',marginBottom:10},
  btnDisabled:{opacity:0.6},btnText:{color:'#fff',fontSize:16,fontWeight:'700'},
  cancelBtn:{alignItems:'center',padding:12},
  cancelText:{color:'#A8A49E',fontSize:15},
  keyboardToolbar:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,paddingHorizontal:14,paddingVertical:10,backgroundColor:'#F4F1EC',borderTopWidth:1,borderTopColor:'#DEDAD3'},
  keyboardDone:{paddingHorizontal:12,paddingVertical:10},
  keyboardDoneText:{color:'#C8402F',fontSize:16,fontWeight:'700'},
  keyboardConfirm:{flex:1,backgroundColor:'#2D7A4F',borderRadius:10,paddingVertical:12,alignItems:'center'},
  keyboardConfirmText:{color:'#fff',fontSize:15,fontWeight:'700'},
})
