import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import PhotoPicker from '../components/PhotoPicker'

const CATEGORIES = [
  {value:'mower',label:'🚜 Lawn Mower'},{value:'car',label:'🚗 Car'},
  {value:'motorcycle',label:'🏍️ Motorcycle'},{value:'atv',label:'🏎️ ATV / Powersports'},
  {value:'boat',label:'⛵ Boat'},{value:'bicycle',label:'🚲 Bicycle / E-Bike'},
  {value:'watch',label:'⌚ Watch'},{value:'electronics',label:'📱 Electronics'},
  {value:'gaming',label:'🎮 Gaming / Console'},{value:'tool',label:'🔧 Tool / Equipment'},
  {value:'exercise',label:'💪 Exercise Equipment'},{value:'instrument',label:'🎸 Musical Instrument'},
  {value:'furniture',label:'🪑 Furniture'},{value:'other',label:'📦 Other'},
]

export default function NewProjectScreen({ navigation, route }) {
  const { user } = useAuth()
  const { onReturn } = route.params || {}
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('mower')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [notes, setNotes] = useState('')
  const [photo, setPhoto] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showCats, setShowCats] = useState(false)

  async function handleSave() {
    if (!title.trim()) return Alert.alert('Give your project a name')
    setSaving(true)
    try {
      await supabase.from('projects').insert({
        user_id: user.id,
        title: title.trim(),
        category,
        purchase_price: Number(purchasePrice) || 0,
        notes: notes.trim() || null,
        photo: photo || null,
        status: 'active',
      })
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

      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <PhotoPicker userId={user.id} photoUrl={photo} onUploaded={setPhoto} />

        <Text style={s.label}>Project Name *</Text>
        <TextInput style={s.input} placeholder="e.g. Honda HRR216 Mower" placeholderTextColor="#A8A49E"
          value={title} onChangeText={setTitle} autoFocus />

        <Text style={[s.label, {marginTop:16}]}>Category</Text>
        <TouchableOpacity style={s.select} onPress={() => setShowCats(!showCats)}>
          <Text style={s.selectText}>{selectedCat?.label}</Text>
          <Text style={{color:'#A8A49E'}}>{showCats ? '▲' : '▼'}</Text>
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

        <Text style={[s.label, {marginTop:16}]}>Purchase Price</Text>
        <TextInput style={s.input} placeholder="0.00" placeholderTextColor="#A8A49E"
          value={purchasePrice} onChangeText={setPurchasePrice} keyboardType="decimal-pad" />

        <Text style={[s.label, {marginTop:16}]}>Notes (optional)</Text>
        <TextInput style={[s.input, s.textarea]} placeholder="Condition, what's wrong, the plan..."
          placeholderTextColor="#A8A49E" value={notes} onChangeText={setNotes} multiline numberOfLines={4} />

        <TouchableOpacity style={[s.btn, saving && s.btnDisabled]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Create Project →</Text>}
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
  catItemTextActive:{color:'#fff',fontWeight:'700'},
  btn:{backgroundColor:'#C8402F',borderRadius:10,padding:16,alignItems:'center',marginTop:24},
  btnDisabled:{opacity:0.6},btnText:{color:'#fff',fontSize:16,fontWeight:'700'},
})
