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

const VIN_CATEGORIES = ['car', 'motorcycle', 'atv', 'boat']

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
  const [vin, setVin] = useState('')
  const [decoding, setDecoding] = useState(false)
  const [vehicleYear, setVehicleYear] = useState('')
  const [vehicleMake, setVehicleMake] = useState('')
  const [vehicleModel, setVehicleModel] = useState('')

  const showVin = VIN_CATEGORIES.includes(category)

  async function decodeVin() {
    const cleanVin = vin.trim().toUpperCase()
    if (cleanVin.length !== 17) return Alert.alert('Invalid VIN', 'A VIN must be exactly 17 characters.')
    setDecoding(true)
    try {
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${cleanVin}?format=json`)
      const data = await res.json()
      const results = data.Results || []
      const get = (var_) => results.find(r => r.Variable === var_)?.Value || ''
      const year = get('Model Year')
      const make = get('Make')
      const model = get('Model')
      if (!year || !make || make === 'null' || make === '0') {
        Alert.alert('VIN Not Found', 'Could not decode that VIN. Please check it and try again.')
        return
      }
      setVehicleYear(year)
      setVehicleMake(make)
      setVehicleModel(model)
      // Auto-fill title if empty
      const autoTitle = `${year} ${make} ${model}`.trim()
      if (!title) setTitle(autoTitle)
      Alert.alert('✅ VIN Decoded!', `${year} ${make} ${model}`)
    } catch (err) {
      Alert.alert('Error', 'Could not reach the VIN decoder. Check your connection.')
    } finally {
      setDecoding(false)
    }
  }

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
        vin: vin.trim().toUpperCase() || null,
        vehicle_year: vehicleYear || null,
        vehicle_make: vehicleMake || null,
        vehicle_model: vehicleModel || null,
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

        <Text style={s.label}>Category</Text>
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

        {/* VIN Decoder — vehicles only */}
        {showVin && (
          <View style={s.vinBox}>
            <Text style={s.label}>VIN (optional)</Text>
            <View style={s.vinRow}>
              <TextInput
                style={[s.input, s.vinInput]}
                placeholder="17-character VIN"
                placeholderTextColor="#A8A49E"
                value={vin}
                onChangeText={v => setVin(v.toUpperCase())}
                autoCapitalize="characters"
                maxLength={17}
              />
              <TouchableOpacity style={[s.decodeBtn, decoding && {opacity:0.6}]} onPress={decodeVin} disabled={decoding}>
                {decoding
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.decodeBtnText}>Decode</Text>
                }
              </TouchableOpacity>
            </View>
            {vehicleYear ? (
              <View style={s.vinResult}>
                <Text style={s.vinResultText}>🚗 {vehicleYear} {vehicleMake} {vehicleModel}</Text>
              </View>
            ) : null}
          </View>
        )}

        <Text style={[s.label, {marginTop:16}]}>Project Name *</Text>
        <TextInput style={s.input} placeholder="e.g. Honda HRR216 Mower" placeholderTextColor="#A8A49E"
          value={title} onChangeText={setTitle} />

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
  vinBox:{marginTop:16},
  vinRow:{flexDirection:'row',gap:8,alignItems:'center'},
  vinInput:{flex:1},
  decodeBtn:{backgroundColor:'#C8402F',borderRadius:10,paddingVertical:14,paddingHorizontal:16,alignItems:'center',justifyContent:'center'},
  decodeBtnText:{color:'#fff',fontWeight:'700',fontSize:14},
  vinResult:{marginTop:8,backgroundColor:'#F0FFF4',borderRadius:8,padding:10,borderWidth:1,borderColor:'#86EFAC'},
  vinResultText:{color:'#166534',fontWeight:'600',fontSize:14},
  btn:{backgroundColor:'#C8402F',borderRadius:10,padding:16,alignItems:'center',marginTop:24},
  btnDisabled:{opacity:0.6},btnText:{color:'#fff',fontSize:16,fontWeight:'700'},
})
