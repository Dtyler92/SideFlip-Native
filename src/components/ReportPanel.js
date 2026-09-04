import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { File } from 'expo-file-system'
import { supabase } from '../lib/supabase'
import { createReportDataClient, createReportRequestGate } from '../lib/reportDataClient'
import { createAndShareReportPdf } from '../lib/reportPdfAdapter'
import { renderCanonicalReportHtml } from '../domain/myStuff/reportModel'

const ACCENT = '#C8402F'
const PRIVATE_DEFAULTS = { includeIdentifiers: false, includeDetailedCosts: false }
const client = createReportDataClient({ auth: supabase.auth })
const OPTION_ROWS = [
  { key: 'includeIdentifiers', label: 'Identifiers (VIN is masked)', detail: 'Includes allowlisted model and serial identifiers. The server returns only the last four VIN characters.' },
  { key: 'includeDetailedCosts', label: 'Detailed costs', detail: 'Includes purchase, sale, service, and expense amounts when available.' },
]

export default function ReportPanel({ subjectType, subjectId, isPro, onUpgrade }) {
  const [options, setOptions] = useState(PRIVATE_DEFAULTS)
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState('')
  const gate = useRef(null)
  if (!gate.current) gate.current = createReportRequestGate()

  useEffect(() => {
    gate.current.invalidate()
    setGenerating(false)
    setMessage('')
    setOptions(PRIVATE_DEFAULTS)
    return () => gate.current.invalidate()
  }, [subjectType, subjectId])

  function toggle(key) {
    if (generating) return
    setOptions(current => ({ ...current, [key]: !current[key] }))
    setMessage('')
  }

  async function generate() {
    if (generating) return
    if (!isPro) return onUpgrade?.()
    const request = gate.current.begin(subjectType)
    const selectedOptions = { ...options }
    setGenerating(true)
    setMessage('')
    try {
      const payload = await client.load({ subjectType, subjectId, options: selectedOptions, signal: request.controller.signal })
      if (!gate.current.isCurrent(request)) return
      const html = renderCanonicalReportHtml(payload, { generatedAt: new Date().toISOString() })
      await createAndShareReportPdf(
        { html, title: subjectType === 'project' ? 'Share private project report' : 'Share private My Stuff report' },
        { print: Print, sharing: Sharing, fileSystem: { File }, shouldContinue: () => gate.current.isCurrent(request) },
      )
      if (gate.current.isCurrent(request)) setMessage('PDF created. It remains private unless you choose a destination in the share sheet.')
    } catch (error) {
      if (!gate.current.isCurrent(request)) return
      if (error?.proRequired) onUpgrade?.()
      setMessage(error?.message || 'The PDF could not be created or shared. Your records were not changed.')
    } finally {
      if (gate.current.finish(request)) setGenerating(false)
    }
  }

  return <View style={styles.panel}>
    <Text style={styles.title}>Private PDF Report <Text style={styles.pro}>PRO</Text></Text>
    <Text style={styles.disclosure}>Photos and documents are not included. Identifiers and detailed costs are excluded by default; turn on only what you intend to share. SideFlip sends these selections to the authenticated report service, which enforces Pro access and returns canonical bounded report data.</Text>
    <Text style={styles.date}>The PDF includes its report date. Creating or sharing it never changes this record.</Text>
    {OPTION_ROWS.map(option => <TouchableOpacity
      key={option.key}
      style={styles.option}
      onPress={() => toggle(option.key)}
      disabled={generating}
      accessibilityRole="checkbox"
      accessibilityLabel={option.label}
      accessibilityHint={option.detail}
      accessibilityState={{ checked: options[option.key], disabled: generating }}
    >
      <View style={[styles.checkbox, options[option.key] && styles.checkboxOn]}><Text style={styles.check}>{options[option.key] ? '✓' : ''}</Text></View>
      <View style={styles.optionCopy}><Text style={styles.optionLabel}>{option.label}</Text><Text style={styles.optionDetail}>{option.detail}</Text></View>
    </TouchableOpacity>)}
    <TouchableOpacity
      style={[styles.button, generating && styles.disabled]}
      onPress={generate}
      disabled={generating}
      accessibilityRole="button"
      accessibilityLabel={isPro ? 'Create and Share PDF' : 'Unlock Pro PDF Reports'}
      accessibilityState={{ disabled: generating, busy: generating }}
    >
      {generating ? <><ActivityIndicator color="#fff" size="small"/><Text style={styles.buttonText}>Preparing private PDF…</Text></> : <Text style={styles.buttonText}>{isPro ? 'Create & Share PDF' : 'Unlock Pro PDF Reports'}</Text>}
    </TouchableOpacity>
    {!!message && <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text>}
  </View>
}

const styles = StyleSheet.create({
  panel:{backgroundColor:'#fff',borderRadius:14,padding:16,borderWidth:1,borderColor:'#E8E4DE',marginBottom:12},
  title:{fontSize:17,fontWeight:'800',color:'#1A1917'},pro:{fontSize:11,color:ACCENT},
  disclosure:{fontSize:12,color:'#5C5850',lineHeight:18,marginTop:7},date:{fontSize:11,color:'#79736A',lineHeight:16,marginTop:6,marginBottom:6},
  option:{flexDirection:'row',alignItems:'flex-start',paddingVertical:10,borderTopWidth:1,borderTopColor:'#F0EDE8'},
  checkbox:{width:22,height:22,borderRadius:5,borderWidth:1.5,borderColor:'#A8A49E',alignItems:'center',justifyContent:'center',marginTop:1},
  checkboxOn:{backgroundColor:ACCENT,borderColor:ACCENT},check:{color:'#fff',fontWeight:'900'},optionCopy:{flex:1,marginLeft:10},
  optionLabel:{fontSize:14,fontWeight:'700',color:'#1A1917'},optionDetail:{fontSize:11,color:'#79736A',lineHeight:16,marginTop:2},
  button:{minHeight:48,backgroundColor:ACCENT,borderRadius:10,paddingHorizontal:14,paddingVertical:13,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8,marginTop:8},
  buttonText:{color:'#fff',fontSize:15,fontWeight:'700'},disabled:{opacity:.6},message:{fontSize:12,color:'#5C5850',lineHeight:18,marginTop:9},
})
