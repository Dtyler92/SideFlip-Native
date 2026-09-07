import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { supabase } from '../lib/supabase'
import { confirmMyStuffVehicleIdentityV3 } from '../lib/myStuffClient'
import { hasVehicleIdentityChanged, persistThenConfirmVehicleIdentity } from '../domain/myStuff/v3Model'
import { createMutationAttemptState, mutationIdForPayload, resetMutationAttemptState } from '../screens/myStuffModel'
import { createVinDecodeClient } from '../lib/vinDecodeClient'
import { hasProjectVehicleDetailsChanged } from '../domain/vinCreateModel'
import {
  applyVinSuggestions,
  buildVehicleConfirmationSnapshot,
  createVinDecodeRequestGate,
  decodedVehicleSuggestions,
  maskVin,
  mergeDecodedSuggestions,
  validateVin,
  VIN_CONFIRMATION_PERSISTENCE_FIELDS,
  VIN_IDENTIFIER_MAX_LENGTHS,
} from '../domain/myStuff/vinModel'

const ACCENT = '#C8402F'
const client = createVinDecodeClient({ auth: supabase.auth })
const ALWAYS_EDITABLE_REVIEW_FIELDS = Object.freeze(['transmission'])

function ensureEditableReviewFields(review, values = {}) {
  const fields = { ...(review?.fields || {}) }
  for (const field of ALWAYS_EDITABLE_REVIEW_FIELDS) {
    fields[field] ||= { status:'manual', existing:values[field] ?? '' }
  }
  return { ...review, fields }
}

export default function VinDecodePanel({ subjectType, subjectId, values, onChange, persistIdentity, onIdentityConfirmed, onDecoded, onConfirmDecoded, fieldLabels = {}, suggestionFields, mapSuggestions = decodedVehicleSuggestions, autoFillBlanks = false, initiallyExpanded = false, operationLock, onOperationLockChange }) {
  const [expanded, setExpanded] = useState(initiallyExpanded)
  const [decoding, setDecoding] = useState(false)
  const [preview, setPreview] = useState(null)
  const [warnings, setWarnings] = useState([])
  const [message, setMessage] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const confirmationGeneration = useRef(0)
  const confirmationAttempt = useRef(createMutationAttemptState())
  const projectConfirmationInFlight = useRef(false)
  const requestGate = useRef(null)
  if (!requestGate.current) requestGate.current = createVinDecodeRequestGate()
  const valuesRef = useRef(values)
  valuesRef.current = values
  const vinState = useMemo(() => validateVin(values?.vin), [values?.vin])
  const identifierMaxLength = VIN_IDENTIFIER_MAX_LENGTHS[subjectType] || 64

  useEffect(() => {
    requestGate.current.invalidate()
    confirmationGeneration.current += 1
    resetMutationAttemptState(confirmationAttempt.current)
    projectConfirmationInFlight.current = false
    setConfirming(false)
    setConfirmed(false)
    setExpanded(initiallyExpanded)
    return () => { requestGate.current.invalidate();confirmationGeneration.current += 1 }
  }, [subjectType, subjectId, initiallyExpanded])

  function update(next) {
    valuesRef.current = next
    confirmationGeneration.current += 1
    setConfirmed(false)
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
      const decoded = mapSuggestions(result.vehicle)
      const supported = Array.isArray(suggestionFields)
        ? Object.fromEntries(Object.entries(decoded).filter(([field]) => suggestionFields.includes(field)))
        : decoded
      const currentValues = autoFillBlanks
        ? { ...valuesRef.current, vin: request.normalizedVin }
        : valuesRef.current
      const merged = mergeDecodedSuggestions(currentValues, supported)
      const next = autoFillBlanks ? merged.values : currentValues
      if (autoFillBlanks) update(next)
      setPreview({ ...ensureEditableReviewFields(mergeDecodedSuggestions(next, supported),next), requestVin: request.normalizedVin })
      setWarnings(result.nhtsaWarnings)
      onDecoded?.({ vin: request.normalizedVin, vehicle: result.vehicle })
    } catch (error) {
      if (!requestGate.current.isCurrent(request, valuesRef.current?.vin)) return
      if (error?.proRequired) setMessage('Basic decode is unavailable because the server returned PRO_REQUIRED. Manual entry is still available.')
      else setMessage(error?.message || 'VIN decoding failed. Manual entry is still available.')
    } finally {
      if (requestGate.current.finish(request)) setDecoding(false)
    }
  }

  function fillBlanks() {
    if (!preview || preview.requestVin !== validateVin(valuesRef.current?.vin).normalized) return
    const next = applyVinSuggestions(valuesRef.current, preview.fields, { mode: 'fill_blanks' })
    update(next)
    refreshPreview(next)
  }

  function useSuggestion(field) {
    if (!preview || preview.requestVin !== validateVin(valuesRef.current?.vin).normalized) return
    const next = applyVinSuggestions(valuesRef.current, preview.fields, { fields: [field] })
    update(next)
    refreshPreview(next)
  }

  function editReviewField(field, value) {
    const next = { ...valuesRef.current, [field]:value }
    update(next)
    refreshPreview(next)
  }

  function refreshPreview(next) {
    setPreview(current => current ? { ...ensureEditableReviewFields(mergeDecodedSuggestions(next, decodedVehicleSuggestionsFromFields(current.fields)),next), requestVin: current.requestVin } : null)
  }

  async function confirmVehicle() {
    if (subjectType === 'project' && typeof onConfirmDecoded === 'function') {
      if (projectConfirmationInFlight.current) return
      if (!preview || preview.requestVin !== vinState.normalized) return setMessage('Decode the current VIN before confirming vehicle details.')
      const confirmedValues = { ...applyVinSuggestions(valuesRef.current, preview.fields, { mode: 'fill_blanks' }), vin: vinState.normalized }
      update(confirmedValues)
      const generation = ++confirmationGeneration.current
      const snapshot = { ...confirmedValues }
      projectConfirmationInFlight.current = true
      setConfirming(true);setMessage('')
      try {
        await onConfirmDecoded(snapshot)
        if (generation !== confirmationGeneration.current || hasProjectVehicleDetailsChanged(snapshot, valuesRef.current)) return
        setConfirmed(true)
        setMessage('Vehicle details confirmed and saved.')
        await onIdentityConfirmed?.()
      } catch (error) {
        if (generation !== confirmationGeneration.current) return
        setMessage(`${error?.message || 'Vehicle confirmation is unavailable.'} Your editable review is still here and manual entry remains available.`)
      } finally {
        projectConfirmationInFlight.current = false
        if (generation === confirmationGeneration.current) setConfirming(false)
      }
      return
    }
    if (subjectType !== 'my_stuff_item' || !subjectId) return
    if (typeof persistIdentity !== 'function') return setMessage('Vehicle confirmation is unavailable because item saving is not connected. Save item details manually instead.')
    if (!vinState.canDecode) return setMessage('Decode or manually enter a valid standard VIN before confirming vehicle identity.')
    if (!preview || preview.requestVin !== vinState.normalized) return setMessage('Decode the current VIN before confirming vehicle identity.')
    const snapshot = buildVehicleConfirmationSnapshot(valuesRef.current,preview.fields)
    update({ ...valuesRef.current,...snapshot })
    const generation = ++confirmationGeneration.current
    const mutationId = mutationIdForPayload(confirmationAttempt.current,{ subjectId,identity:snapshot })
    if (operationLock?.current) return setMessage('Wait for the current item update to finish before confirming vehicle identity.')
    if (operationLock) operationLock.current = true
    const claimedOperation = !!operationLock
    if (claimedOperation) onOperationLockChange?.(true)
    setConfirming(true);setMessage('')
    try {
      const isCurrent = () => {
        const currentIdentity = { vin:validateVin(valuesRef.current?.vin).normalized }
        for (const field of VIN_CONFIRMATION_PERSISTENCE_FIELDS) {
          if (field !== 'vin') currentIdentity[field] = valuesRef.current?.[field]
        }
        return generation === confirmationGeneration.current && !hasVehicleIdentityChanged(snapshot,currentIdentity)
      }
      const result = await persistThenConfirmVehicleIdentity({
        snapshot,
        persist:persistIdentity,
        confirm:value=>confirmMyStuffVehicleIdentityV3(subjectId,value,mutationId),
        isCurrent,
      })
      if (!result.confirmed) return
      resetMutationAttemptState(confirmationAttempt.current)
      setConfirmed(true)
      setMessage('Vehicle identity confirmed. Research is not available yet; no research job was queued. Manual schedules remain available.')
      await onIdentityConfirmed?.()
    } catch (error) {
      if (generation !== confirmationGeneration.current) return
      setMessage(`${error?.message || 'Vehicle confirmation is unavailable.'} Your editable review is still here and manual entry remains available.`)
    } finally {
      if (claimedOperation) {
        operationLock.current = false
        onOperationLockChange?.(false)
      }
      if (generation === confirmationGeneration.current) setConfirming(false)
    }
  }

  const entries = preview ? Object.entries(preview.fields).filter(([field, detail]) => detail.suggestion != null || ALWAYS_EDITABLE_REVIEW_FIELDS.includes(field)) : []
  const hasBlankSuggestions = entries.some(([, detail]) => detail.status === 'suggested')

  return <View style={s.panel}>
    <TouchableOpacity style={s.titleRow} onPress={()=>setExpanded(value=>!value)} accessibilityRole="button" accessibilityLabel={expanded ? 'Close VIN decoder' : 'Open VIN decoder'} accessibilityState={{ expanded }}>
      <Text style={s.title}>VIN Decoder <Text style={s.basic}>BASIC</Text></Text>
      <Text style={s.chevron}>{expanded?'⌃':'⌄'}</Text>
    </TouchableOpacity>
    {expanded&&<>
    <Text style={s.hint}>Basic NHTSA decode is available to signed-in Free and Pro accounts. {autoFillBlanks ? 'Blank fields fill after decoding; review and edit every value before confirmation.' : 'Decoded values are an unconfirmed editable review and never save automatically.'}</Text>
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
    <TouchableOpacity style={[s.decodeButton, decoding && s.disabled]} onPress={decode} disabled={decoding} accessibilityRole="button" accessibilityLabel="Decode VIN with NHTSA" accessibilityState={{ disabled: decoding, busy: decoding }}>
      {decoding ? <ActivityIndicator color="#fff"/> : <Text style={s.decodeText}>Decode VIN</Text>}
    </TouchableOpacity>
    {!!message && <Text style={s.message}>{message} You can keep editing and save manually.</Text>}
    {warnings.map(warning => <Text key={warning.code} style={s.warning}>NHTSA warning: {warning.message}</Text>)}
    {preview && <View style={s.preview}>
      <Text style={s.previewTitle}>Unconfirmed editable review for {maskVin(preview.requestVin)}</Text>
      {entries.length === 0 ? <Text style={s.hint}>No additional vehicle details were returned.</Text> : entries.map(([field, detail]) => <View key={field} style={s.suggestion}>
        <View style={s.suggestionCopy}>
          <Text style={s.suggestionLabel}>{fieldLabels[field] || defaultLabel(field)}</Text>
          <TextInput style={s.reviewInput} value={String(preview.values?.[field] ?? detail.suggestion ?? '')} onChangeText={value=>editReviewField(field,value)} accessibilityLabel={`Editable ${fieldLabels[field] || defaultLabel(field)}`}/>
          {detail.status === 'conflicting' && <Text style={s.conflict}>Decoder: {String(detail.suggestion)} · Unconfirmed</Text>}
          {detail.status === 'suggested' && <Text style={s.unconfirmed}>NHTSA suggestion · Unconfirmed</Text>}
          {detail.status === 'verified' && <Text style={s.verified}>Verified match with current value</Text>}
          {detail.status === 'manual' && <Text style={s.unconfirmed}>Not returned by NHTSA · enter and verify manually</Text>}
        </View>
        {detail.status === 'conflicting' && <TouchableOpacity onPress={() => useSuggestion(field)} accessibilityRole="button" accessibilityLabel={`Use suggested ${fieldLabels[field] || defaultLabel(field)}`}><Text style={s.use}>Use suggestion</Text></TouchableOpacity>}
      </View>)}
      {hasBlankSuggestions && <TouchableOpacity style={s.fillButton} onPress={fillBlanks} accessibilityRole="button" accessibilityLabel="Fill Blank Fields"><Text style={s.fillText}>Fill Blank Fields</Text></TouchableOpacity>}
      {((subjectType==='my_stuff_item'&&!!subjectId)||(subjectType==='project'&&typeof onConfirmDecoded==='function'))&&<TouchableOpacity style={[s.confirmButton,confirming&&s.disabled]} onPress={confirmVehicle} disabled={confirming} accessibilityRole="button" accessibilityState={{disabled:confirming,busy:confirming}}><Text style={s.confirmText}>{confirmed?'Vehicle Confirmed':'Confirm Vehicle'}</Text></TouchableOpacity>}
      {subjectType==='my_stuff_item'&&!!subjectId&&<Text style={s.hint}>Confirmation saves identity only. Research is not available yet, so this queues zero research jobs.</Text>}
    </View>}
    </>}
  </View>
}

function decodedVehicleSuggestionsFromFields(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, detail]) => detail?.suggestion != null).map(([field, detail]) => [field, detail.suggestion]))
}

function defaultLabel(field) {
  if (field === 'transmission') return 'Transmission type'
  return field.replace(/([A-Z])/g, ' $1').replace(/^./, value => value.toUpperCase())
}

const s = StyleSheet.create({
  panel:{marginTop:14,paddingTop:14,borderTopWidth:1,borderTopColor:'#E8E4DE'},
  titleRow:{minHeight:44,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},title:{fontSize:16,fontWeight:'800',color:'#1A1917'},basic:{fontSize:11,color:'#2D7A4F'},chevron:{fontSize:22,color:'#6B665E',fontWeight:'700'},
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
  reviewInput:{borderWidth:1,borderColor:'#D7D2CB',borderRadius:8,padding:9,color:'#1A1917',marginTop:4},
  conflict:{fontSize:12,color:'#8B3328',marginTop:2},unconfirmed:{fontSize:12,color:'#6B4B16',marginTop:2},verified:{fontSize:12,color:'#2D7A4F',marginTop:2},use:{fontSize:12,fontWeight:'700',color:ACCENT},
  fillButton:{borderWidth:1.5,borderColor:ACCENT,borderRadius:9,padding:11,alignItems:'center',marginTop:12},fillText:{color:ACCENT,fontWeight:'700'},
  confirmButton:{backgroundColor:ACCENT,borderRadius:9,padding:13,alignItems:'center',marginTop:10},confirmText:{color:'#fff',fontWeight:'800'},
})
