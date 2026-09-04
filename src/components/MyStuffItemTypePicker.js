import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { ITEM_TYPE_OPTIONS, deriveItemCategory, getItemCategoryContract } from '../domain/myStuff/itemModel'

const ACCENT = '#C8402F'

export default function MyStuffItemTypePicker({ value, onChange, error }) {
  const category = deriveItemCategory(value)
  const categoryLabel = getItemCategoryContract(category)?.label || 'Other'
  return <View>
    <Text style={s.label}>Specific item type *</Text>
    <Text style={s.help}>Choose the closest exact type. This sets the broad category and available usage measurements.</Text>
    <View style={s.choices} accessibilityRole="radiogroup" accessibilityLabel="Specific item type">
      {ITEM_TYPE_OPTIONS.map(option => <TouchableOpacity
        key={option.value}
        style={[s.choice, value === option.value && s.choiceActive]}
        onPress={() => onChange(option.value)}
        accessibilityRole="radio"
        accessibilityLabel={option.label}
        accessibilityHint={`Sets category to ${getItemCategoryContract(option.category).label}`}
        accessibilityState={{ selected: value === option.value }}
      ><Text style={[s.choiceText, value === option.value && s.choiceTextActive]}>{option.label}</Text></TouchableOpacity>)}
    </View>
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
  choices:{flexDirection:'row',flexWrap:'wrap',gap:8},
  choice:{minHeight:44,justifyContent:'center',borderWidth:1,borderColor:'#D7D2CB',backgroundColor:'#fff',paddingHorizontal:12,paddingVertical:10,borderRadius:10},
  choiceActive:{borderColor:ACCENT,backgroundColor:'#FFF2EE'},
  choiceText:{color:'#5C5850',fontWeight:'600'},
  choiceTextActive:{color:ACCENT},
  derived:{fontSize:13,color:'#5C5850',fontWeight:'700',marginTop:10},
  fieldError:{color:'#9E2F22',fontSize:13,lineHeight:18,marginTop:6},
  errorBox:{backgroundColor:'#FFF2EE',borderColor:'#E4A69D',borderWidth:1,borderRadius:10,padding:12,marginTop:16},
  errorTitle:{color:'#7D261C',fontWeight:'800',marginBottom:4},
  errorMessage:{color:'#7D261C',lineHeight:19},
})
