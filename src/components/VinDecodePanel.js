import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { supabase } from '../lib/supabase'
import { createVinDecodeClient } from '../lib/vinDecodeClient'
import {
  applyVinSuggestions,
  createVinDecodeRequestGate,
  decodedVehicleSuggestions,
  maskVin,
  mergeDecodedSuggestions,
  validateVin,
  VIN_IDENTIFIER_MAX_LENGTHS,
} from '../domain/myStuff/vinModel'

const ACCENT = '#C8402F'
const client = createVinDecodeClient({ auth: supabase.auth })

export default function VinDecodePanel({ subjectType, subjectId, isPro, values, onChange, onUpgrade, fieldLabels = {}, suggestionFields }) {
  const [decoding, setDecoding] = useState(false)
  const [preview, setPreview] = useState(null)
  const [warnings, setWarnings] = useState([])
  const [message, setMessage] = useState('')
  const requestGate = useRef(null)
  if (!requestGate.current) requestGate.current = createVinDecodeRequestGate()
  const valuesRef = useRef(values)
  valuesRef.current = values
  const vinState = useMemo(() => validateVin(values?.vin), [values?.vin])
  const identifierMaxLength = VIN_IDENTIFIER_MAX_LENGTHS[subjectType] || 64

  useEffect(() => () => requestGate.current.invalidate(), [subjectType, subjectId])

  function update(next) {
    valuesRef.current = next
    onChange(next)
  }

  function editVin(vin) {
    requestGate.current.invalidate()
    setDecoding(false)
    update({ ...valuesRef.current, vin })
    setPreview(null)
    setWarnings([])
    setMessage('')
  }

  async function decode() {
    if (!isPro) return onUpgrade()
    if (!vinState.canDecode) {
      setMessage(vinState.reason || 'Enter a standard 17-character VIN, or continue with manual entry.')
      return
    }
    const request = requestGate.current.begin(vinState.normalized)
    setDecoding(true)
    setMessage('')
    setWarnings([])
    setPreview(null)
    try {
      const result = await client.decode({ subjectType, subjectId, vin: request.normalizedVin, signal: request.controller.signal })
      if (!requestGate.current.isCurrent(request, valuesRef.current?.vin)) return
      const decoded = decodedVehicleSuggestions(result.vehicle)
      const supported = Array.isArray(suggestionFields)
        ? Object.fromEntries(Object.entries(decoded).filter(([field]) => suggestionFields.includes(field)))
        : decoded
      setPreview({ ...mergeDecodedSuggestions(valuesRef.current, supported), requestVin: request.normalizedVin })
      setWarnings(result.nhtsaWarnings)
    } catch (error) {
      if (!requestGate.current.isCurrent(request, valuesRef.current?.vin)) return
      if (error?.proRequired) onUpgrade()
      setMessage(error?.message || 'VIN decoding failed. Manual entry is still available.')
    } finally {
      if (requestGate.current.finish(request)) setDecoding(false)
    }
  }

  function fillBlanks() {
    if (!preview || preview.requestVin !== validateVin(valuesRef.current?.vin).normalized) return
    const next = applyVinSuggestions(valuesRef.current, preview.fields, { mode: 'fill_blanks' })
    update(next)
    setPreview(current => current ? { ...mergeDecodedSuggestions(next, decodedVehicleSuggestionsFromFields(current.fields)), requestVin: current.requestVin } : null)
  }

  function useSuggestion(field) {
    if (!preview || preview.requestVin !== validateVin(valuesRef.current?.vin).normalized) return
    const next = applyVinSuggestions(valuesRef.current, preview.fields, { fields: [field] })
    update(next)
    setPreview(current => current ? { ...mergeDecodedSuggestions(next, decodedVehicleSuggestionsFromFields(current.fields)), requestVin: current.requestVin } : null)
  }

  const entries = preview ? Object.entries(preview.fields).filter(([, detail]) => detail.suggestion != null) : []
  const hasBlankSuggestions = entries.some(([, detail]) => detail.status === 'suggested')

  return <View style={s.panel}>
    <Text style={s.title}>VIN Decoder <Text style={s.pro}>PRO</Text></Text>
    <Text style={s.hint}>Enter or edit identifiers manually at any time. Decoding only suggests values and never saves or replaces details automatically.</Text>
    <Text style={s.label}>VIN / identifier</Text>
    <TextInput
      style={s.input}
      value={values?.vin || ''}
      onChangeText={editVin}
      autoCapitalize="characters"
      autoCorrect={false}
      maxLength={identifierMaxLength}
      placeholder="17-character VIN or manual identifier"
      placeholderTextColor="#A8A49E"
      accessibilityLabel="VIN or identifier"
    />
    {!!values?.vin && !vinState.canDecode && <Text style={s.manual}>{vinState.reason}</Text>}
    <TouchableOpacity style={[s.decodeButton, decoding && s.disabled]} onPress={decode} disabled={decoding} accessibilityRole="button" accessibilityLabel={isPro ? 'Decode VIN' : 'Unlock Pro VIN Decoder'} accessibilityState={{ disabled: decoding, busy: decoding }}>
      {decoding ? <ActivityIndicator color="#fff"/> : <Text style={s.decodeText}>{isPro ? 'Decode VIN' : 'Unlock Pro VIN Decoder'}</Text>}
    </TouchableOpacity>
    {!!message && <Text style={s.message}>{message} You can keep editing and save manually.</Text>}
    {warnings.map(warning => <Text key={warning.code} style={s.warning}>NHTSA warning: {warning.message}</Text>)}
    {preview && <View style={s.preview}>
      <Text style={s.previewTitle}>Suggestions for {maskVin(preview.requestVin)}</Text>
      {entries.length === 0 ? <Text style={s.hint}>No additional vehicle details were returned.</Text> : entries.map(([field, detail]) => <View key={field} style={s.suggestion}>
        <View style={s.suggestionCopy}>
          <Text style={s.suggestionLabel}>{fieldLabels[field] || defaultLabel(field)}</Text>
          <Text style={s.suggestionValue}>{String(detail.suggestion)}</Text>
          {detail.status === 'conflicting' && <Text style={s.conflict}>Current: {String(detail.existing)}</Text>}
          {detail.status === 'verified' && <Text style={s.verified}>Matches current value</Text>}
        </View>
        {detail.status === 'conflicting' && <TouchableOpacity onPress={() => useSuggestion(field)} accessibilityRole="button" accessibilityLabel={`Use suggested ${fieldLabels[field] || defaultLabel(field)}`}><Text style={s.use}>Use suggestion</Text></TouchableOpacity>}
      </View>)}
      {hasBlankSuggestions && <TouchableOpacity style={s.fillButton} onPress={fillBlanks} accessibilityRole="button" accessibilityLabel="Fill Blank Fields"><Text style={s.fillText}>Fill Blank Fields</Text></TouchableOpacity>}
    </View>}
  </View>
}

function decodedVehicleSuggestionsFromFields(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, detail]) => detail?.suggestion != null).map(([field, detail]) => [field, detail.suggestion]))
}

function defaultLabel(field) {
  return field.replace(/([A-Z])/g, ' $1').replace(/^./, value => value.toUpperCase())
}

const s = StyleSheet.create({
  panel:{marginTop:14,paddingTop:14,borderTopWidth:1,borderTopColor:'#E8E4DE'},
  title:{fontSize:16,fontWeight:'800',color:'#1A1917'},pro:{fontSize:11,color:ACCENT},
  hint:{fontSize:12,color:'#6B665E',lineHeight:17,marginTop:5},
  label:{fontSize:13,fontWeight:'700',color:'#5C5850',marginTop:12,marginBottom:5},
  input:{borderWidth:1,borderColor:'#D7D2CB',borderRadius:10,padding:12,fontSize:15,color:'#1A1917',backgroundColor:'#fff'},
  manual:{fontSize:12,color:'#6B665E',lineHeight:17,marginTop:6},
  decodeButton:{backgroundColor:'#1A1917',borderRadius:10,padding:13,alignItems:'center',marginTop:10},
  decodeText:{color:'#fff',fontSize:14,fontWeight:'700'},disabled:{opacity:.6},
  message:{fontSize:12,color:'#8B3328',lineHeight:18,marginTop:9},warning:{fontSize:12,color:'#6B4B16',lineHeight:18,marginTop:8},
  preview:{backgroundColor:'#FAFAF7',borderRadius:10,padding:12,marginTop:12,borderWidth:1,borderColor:'#E8E4DE'},
  previewTitle:{fontSize:14,fontWeight:'800',color:'#1A1917',marginBottom:5},
  suggestion:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,paddingVertical:8,borderBottomWidth:1,borderBottomColor:'#E8E4DE'},
  suggestionCopy:{flex:1},suggestionLabel:{fontSize:11,fontWeight:'700',color:'#79736A',textTransform:'uppercase'},suggestionValue:{fontSize:14,fontWeight:'700',color:'#1A1917',marginTop:2},
  conflict:{fontSize:12,color:'#8B3328',marginTop:2},verified:{fontSize:12,color:'#2D7A4F',marginTop:2},use:{fontSize:12,fontWeight:'700',color:ACCENT},
  fillButton:{borderWidth:1.5,borderColor:ACCENT,borderRadius:9,padding:11,alignItems:'center',marginTop:12},fillText:{color:ACCENT,fontWeight:'700'},
})
