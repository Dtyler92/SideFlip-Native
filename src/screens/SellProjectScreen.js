import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { supabase } from '../lib/supabase'

const fmt = n => '$' + Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const getTotalInvested = p => (p.expenses||[]).reduce((s,e)=>s+Number(e.amount),0) + (Number(p.purchase_price)||0)

export default function SellProjectScreen({ navigation, route }) {
  const { projectId, project: proj, onReturn } = route.params || {}
  const [project] = useState(proj)
  const [salePrice, setSalePrice] = useState('')
  const [saving, setSaving] = useState(false)

  if (!project) return null

  const totalInvested = getTotalInvested(project)
  const preview = salePrice ? Number(salePrice) - totalInvested : null
  const roi = preview !== null && totalInvested ? ((preview / totalInvested) * 100).toFixed(1) : null

  async function handleSell() {
    if (!salePrice || Number(salePrice) < 0) return Alert.alert('Enter a valid sale price')
    setSaving(true)
    try {
      await supabase.from('projects').update({
        status: 'sold',
        sale_price: Number(salePrice),
        sold_at: new Date().toISOString(),
      }).eq('id', projectId)
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

      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
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
        />

        {preview !== null && (
          <View style={[s.previewCard, preview<0 && s.previewCardLoss]}>
            <Text style={[s.previewLabel, preview<0 && s.previewLabelLoss]}>{preview>=0?'Profit':'Loss'}</Text>
            <Text style={[s.previewAmount, preview<0 && s.previewAmountLoss]}>{preview>=0?'+':''}{fmt(preview)}</Text>
            {roi && <Text style={[s.previewRoi, preview<0 && s.previewLabelLoss]}>{preview>=0?'📈':'📉'} {roi}% ROI</Text>}
          </View>
        )}

        <TouchableOpacity style={[s.btn, saving && s.btnDisabled]} onPress={handleSell} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Confirm Sale →</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={s.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={s.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:'#FAFAF7'},
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
})
