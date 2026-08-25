import { useRef, useState } from 'react'
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { createMyStuffItem } from '../lib/myStuffClient'
import { createMutationId, parseNonNegativeNumber, validateCalendarDate } from './myStuffModel'

const ACCENT = '#C8402F'
const CATEGORIES = ['Vehicle', 'Equipment', 'Tool', 'Home', 'Electronics', 'Recreation', 'Other']

export default function MyStuffCreateScreen({ navigation }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('Other')
  const [acquiredOn, setAcquiredOn] = useState('')
  const [notes, setNotes] = useState('')
  const [currentMileage, setCurrentMileage] = useState('')
  const [currentHours, setCurrentHours] = useState('')
  const [saving, setSaving] = useState(false)
  const mutationId = useRef(createMutationId())
  const saveInFlight = useRef(false)

  async function save() {
    if (saveInFlight.current) return
    if (!name.trim()) return Alert.alert('Item name required', 'Enter a name for this item.')
    if (acquiredOn.trim() && !validateCalendarDate(acquiredOn)) return Alert.alert('Check acquisition date', 'Use a valid date in YYYY-MM-DD format.')
    const mileage = parseNonNegativeNumber(currentMileage, { optional: true })
    const hours = parseNonNegativeNumber(currentHours, { optional: true })
    if (!mileage.ok) return Alert.alert('Check mileage', 'Mileage must be a finite number of zero or more.')
    if (!hours.ok) return Alert.alert('Check operating hours', 'Operating hours must be a finite number of zero or more.')

    saveInFlight.current = true
    setSaving(true)
    try {
      const itemId = await createMyStuffItem({
        name: name.trim(),
        category: category.toLowerCase(),
        acquiredOn: acquiredOn.trim() || null,
        notes: notes.trim() || null,
        currentMileage: mileage.value,
        currentHours: hours.value,
        mutationId: mutationId.current,
      })
      navigation.replace('MyStuffDetail', { itemId })
    } catch (error) {
      if (String(error?.message || '').includes('Free accounts can have one My Stuff item')) return navigation.replace('Pro')
      Alert.alert('Could not add item', error.message || 'Please try again.')
    } finally {
      saveInFlight.current = false
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <Header title="Add Item" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >
        <Label text="Item name *" />
        <TextInput style={s.input} value={name} onChangeText={setName} placeholder="e.g. Work Truck" placeholderTextColor="#A8A49E" autoFocus maxLength={120} />
        <Label text="Category *" />
        <View style={s.choices}>{CATEGORIES.map(value => <Choice key={value} label={value} selected={category === value} onPress={() => setCategory(value)} />)}</View>
        <Label text="Acquired on (optional)" />
        <TextInput style={s.input} value={acquiredOn} onChangeText={setAcquiredOn} placeholder="YYYY-MM-DD" placeholderTextColor="#A8A49E" keyboardType="numbers-and-punctuation" autoCapitalize="none" />
        <Label text="Current mileage (optional)" />
        <TextInput style={s.input} value={currentMileage} onChangeText={setCurrentMileage} placeholder="0" placeholderTextColor="#A8A49E" keyboardType="decimal-pad" />
        <Label text="Current operating hours (optional)" />
        <TextInput style={s.input} value={currentHours} onChangeText={setCurrentHours} placeholder="0" placeholderTextColor="#A8A49E" keyboardType="decimal-pad" />
        <Label text="Notes (optional)" />
        <TextInput style={[s.input,s.textarea]} value={notes} onChangeText={setNotes} placeholder="Model, serial number, or anything useful" placeholderTextColor="#A8A49E" multiline maxLength={1000} />
        <TouchableOpacity style={[s.button,saving&&s.disabled]} onPress={save} disabled={saving} accessibilityRole="button" accessibilityLabel="Add My Stuff item" accessibilityState={{disabled:saving,busy:saving}}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Add Item</Text>}</TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

function Header({ title, onBack }) { return <View style={s.header}><TouchableOpacity style={s.headerSide} onPress={onBack} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10}><Text style={s.back}>‹ Back</Text></TouchableOpacity><Text style={s.headerTitle}>{title}</Text><View style={s.headerSide}/></View> }
function Label({ text }) { return <Text style={s.label}>{text}</Text> }
function Choice({ label, selected, onPress }) { return <TouchableOpacity style={[s.choice,selected&&s.choiceActive]} onPress={onPress} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{selected}}><Text style={[s.choiceText,selected&&s.choiceTextActive]}>{label}</Text></TouchableOpacity> }
const s=StyleSheet.create({root:{flex:1,backgroundColor:'#FAFAF7'},header:{paddingTop:0,paddingBottom:12,paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#E8E4DE'},headerSide:{width:75},back:{color:ACCENT,fontWeight:'700',fontSize:15},headerTitle:{fontWeight:'800',fontSize:17,color:'#1A1917'},content:{padding:20,paddingBottom:100},label:{fontSize:13,fontWeight:'700',color:'#5C5850',marginTop:17,marginBottom:6},input:{backgroundColor:'#fff',borderWidth:1,borderColor:'#D7D2CB',borderRadius:10,padding:14,fontSize:15,color:'#1A1917'},textarea:{minHeight:110,textAlignVertical:'top'},choices:{flexDirection:'row',flexWrap:'wrap',gap:8},choice:{borderWidth:1,borderColor:'#D7D2CB',backgroundColor:'#fff',paddingHorizontal:12,paddingVertical:10,borderRadius:10},choiceActive:{borderColor:ACCENT,backgroundColor:'#FFF2EE'},choiceText:{color:'#5C5850',fontWeight:'600'},choiceTextActive:{color:ACCENT},button:{marginTop:26,backgroundColor:ACCENT,borderRadius:11,padding:16,alignItems:'center'},buttonText:{color:'#fff',fontWeight:'800',fontSize:16},disabled:{opacity:.6}})
