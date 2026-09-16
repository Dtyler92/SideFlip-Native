import { useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { ITEM_TYPE_OPTIONS, deriveItemCategory, getItemCategoryContract, getItemTypeOption } from '../domain/myStuff/itemModel'

const ACCENT = '#C8402F'

export default function MyStuffItemTypePicker({ value, onChange, error }) {
  const [expanded, setExpanded] = useState(false)
  const category = deriveItemCategory(value)
  const categoryLabel = getItemCategoryContract(category)?.label || 'Other'
  const selected = getItemTypeOption(value)
  function choose(next) { onChange(next); setExpanded(false) }
  return <View>
    <Text style={s.label}>Specific item type *</Text>
    <Text style={s.help}>Choose the closest exact type. This sets the broad category and available usage measurements.</Text>
    <TouchableOpacity
      style={[s.trigger, expanded && s.triggerOpen, error && s.triggerError]}
      onPress={() => setExpanded(current => !current)}
      accessibilityRole="button"
      accessibilityLabel="Specific item type"
      accessibilityValue={{ text: selected?.label || 'No item type selected' }}
      accessibilityHint="Opens the exact item type choices"
      accessibilityState={{ expanded }}
    >
      <Text style={[s.triggerText,!selected&&s.placeholder]}>{selected?.label || 'Choose an item type'}</Text>
      <Text style={s.chevron}>{expanded ? '▲' : '▼'}</Text>
    </TouchableOpacity>
    {expanded && <ScrollView style={s.menu} nestedScrollEnabled keyboardShouldPersistTaps="handled" accessibilityRole="menu" accessibilityLabel="Exact item types">
      {ITEM_TYPE_OPTIONS.map(option => <TouchableOpacity
        key={option.value}
        style={[s.option, value === option.value && s.optionSelected]}
        onPress={() => choose(option.value)}
        accessibilityRole="menuitem"
        accessibilityLabel={option.label}
        accessibilityHint={`Sets category to ${getItemCategoryContract(option.category).label}`}
        accessibilityState={{ selected: value === option.value }}
      ><Text style={[s.optionText,value===option.value&&s.optionTextSelected]}>{value===option.value?'✓ ':''}{option.label}</Text></TouchableOpacity>)}
    </ScrollView>}
    <Text style={s.derived}>Category: {categoryLabel}</Text>
    {!!error && <Text style={s.fieldError} accessibilityRole="alert">{error}</Text>}
  </View>
}

export function ValidationErrors({ errors = {} }) {
  const messages = [...new Set(Object.values(errors).filter(Boolean))]
  if (!messages.length) return null
  return <View style={s.errorBox} accessibilityRole="alert" accessibilityLiveRegion="polite">
    <Text style={s.errorTitle}>Please check this item</Text>
    {messages.map(message => <Text key={message} style={s.errorMessage}>• {message}</Text>)}
  </View>
}

const s = StyleSheet.create({
  label:{fontSize:13,fontWeight:'700',color:'#5C5850',marginTop:15,marginBottom:6},
  help:{fontSize:13,color:'#6B665E',lineHeight:19,marginBottom:10},
  trigger:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderWidth:1,borderColor:'#D7D2CB',backgroundColor:'#fff',paddingHorizontal:13,borderRadius:10},
  triggerOpen:{borderColor:ACCENT,borderBottomLeftRadius:0,borderBottomRightRadius:0},triggerError:{borderColor:'#9E2F22'},
  triggerText:{fontSize:15,color:'#1A1917',fontWeight:'600'},placeholder:{color:'#79736A',fontWeight:'400'},chevron:{color:ACCENT,fontSize:12},
  menu:{maxHeight:264,borderWidth:1,borderTopWidth:0,borderColor:ACCENT,borderBottomLeftRadius:10,borderBottomRightRadius:10,backgroundColor:'#fff'},
  option:{minHeight:44,justifyContent:'center',paddingHorizontal:13,paddingVertical:9,borderTopWidth:1,borderTopColor:'#F0EDE8'},optionSelected:{backgroundColor:'#FFF2EE'},
  optionText:{color:'#5C5850',fontWeight:'600'},optionTextSelected:{color:ACCENT,fontWeight:'800'},
  derived:{fontSize:13,color:'#5C5850',fontWeight:'700',marginTop:10},
  fieldError:{color:'#9E2F22',fontSize:13,lineHeight:18,marginTop:6},
  errorBox:{backgroundColor:'#FFF2EE',borderColor:'#E4A69D',borderWidth:1,borderRadius:10,padding:12,marginTop:16},
  errorTitle:{color:'#7D261C',fontWeight:'800',marginBottom:4},errorMessage:{color:'#7D261C',lineHeight:19},
})
