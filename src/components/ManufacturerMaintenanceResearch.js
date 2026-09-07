import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { captureEvent } from '../lib/analytics'
import { createMutationAttemptState, mutationIdForPayload, resetMutationAttemptState } from '../screens/myStuffModel'
import { applyMyStuffResearch, approveMyStuffResearch, cancelMyStuffResearch, enqueueMyStuffResearch, getMyStuffResearchReview, getMyStuffResearchStatus } from '../lib/myStuffClient'
import {
  createResearchRequestGate,
  evidenceForCandidate,
  formatResearchInterval,
  normalizeResearchReview,
  normalizeResearchStatus,
  researchCanPoll,
  researchSourceClassLabel,
} from '../domain/myStuff/maintenanceResearchModel'

const ACCENT='#C8402F'
const POLL_MS=5000

function messageForError(error) {
  const value=String(error?.message||error?.code||'').toUpperCase()
  if(value.includes('PRO_REQUIRED'))return 'SideFlip Pro is required at every research, approval, and apply step.'
  if(value.includes('IDENTITY_UNCONFIRMED'))return 'Confirm the vehicle identity again before researching its schedule.'
  if(value.includes('RESEARCH_DISABLED')||value.includes('PROVIDER_DISABLED'))return 'Manufacturer research is not available right now. Manual schedule entry still works.'
  if(value.includes('BUDGET')||value.includes('RATE'))return 'The research limit has been reached. Try again later or add schedules manually.'
  return error?.message||'Manufacturer research could not be loaded. Manual schedule entry still works.'
}

function sourceLocation(source) {
  if(source.page)return `Page ${source.page}`
  if(source.section)return `Section: ${source.section}`
  return 'Location verified by SideFlip'
}

export default function ManufacturerMaintenanceResearch({item,isPro,onUpgrade,onApplied,operationLock,parentBusy=false}) {
  const isFocused=useIsFocused()
  const [status,setStatus]=useState(null)
  const [review,setReview]=useState(null)
  const [selected,setSelected]=useState(new Set())
  const [loading,setLoading]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const requestGate=useRef(null)
  if(!requestGate.current)requestGate.current=createResearchRequestGate()
  const renderedScope=useRef(null)
  renderedScope.current={itemId:item?.id||null,active:Boolean(isFocused&&isPro&&item?.id)}
  const isCurrentRequest=useCallback(snapshot=>{
    const scope=renderedScope.current||{}
    return requestGate.current.isCurrent(snapshot,scope.itemId,scope.active)
  },[])
  const loadGeneration=useRef(0)
  const operationClaim=useRef(null)
  const mounted=useRef(false)
  const selectionJobId=useRef(null)
  const enqueueAttempt=useRef(createMutationAttemptState())
  const approveAttempt=useRef(createMutationAttemptState())
  const applyAttempt=useRef(createMutationAttemptState())
  const cancelAttempt=useRef(createMutationAttemptState())

  function releaseOperation(token=operationClaim.current){
    if(!token||operationClaim.current!==token)return
    operationClaim.current=null
    if(operationLock)operationLock.current=false
  }

  const load=useCallback(async({quiet=false}={})=>{
    if(!isPro||!item?.id||!isFocused)return null
    const snapshot=requestGate.current.snapshot(item.id)
    if(!isCurrentRequest(snapshot))return null
    const request=++loadGeneration.current
    if(!quiet)setLoading(true)
    try{
      const next=normalizeResearchStatus(await getMyStuffResearchStatus(snapshot.itemId))
      if(request!==loadGeneration.current||!isCurrentRequest(snapshot))return null
      setStatus(next);setError('')
      if(next?.jobId&&['awaiting_review','approved','applied'].includes(next.status)){
        const nextReview=normalizeResearchReview(await getMyStuffResearchReview(next.jobId))
        if(request!==loadGeneration.current||!isCurrentRequest(snapshot))return null
        setReview(nextReview)
        if(next.status==='awaiting_review'&&selectionJobId.current!==next.jobId){
          selectionJobId.current=next.jobId
          setSelected(new Set(nextReview.candidates.map(row=>row.id)))
        }
      }else if(!researchCanPoll(next?.status))setReview(null)
      return next
    }catch(nextError){
      if(request===loadGeneration.current&&isCurrentRequest(snapshot))setError(messageForError(nextError))
      return null
    }finally{
      if(request===loadGeneration.current&&isCurrentRequest(snapshot))setLoading(false)
    }
  },[isFocused,isPro,item?.id,isCurrentRequest])

  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])

  useEffect(()=>{
    requestGate.current.invalidate();loadGeneration.current+=1
    setStatus(null);setReview(null);setSelected(new Set());setError('');setLoading(false);setBusy(false)
    selectionJobId.current=null
    resetMutationAttemptState(enqueueAttempt.current);resetMutationAttemptState(approveAttempt.current);resetMutationAttemptState(applyAttempt.current);resetMutationAttemptState(cancelAttempt.current)
  },[item?.id])

  useEffect(()=>{
    if(!isFocused||!isPro||!item?.id){
      requestGate.current.invalidate();loadGeneration.current+=1
      return
    }
    requestGate.current.activate(item.id)
    load()
    return()=>{requestGate.current.invalidate();loadGeneration.current+=1}
  },[isFocused,isPro,item?.id,load])

  useEffect(()=>{
    if(!isFocused||!researchCanPoll(status?.status))return
    let stopped=false
    let timer=setTimeout(async function poll(){
      await load({quiet:true})
      if(!stopped)timer=setTimeout(poll,POLL_MS)
    },POLL_MS)
    return()=>{stopped=true;clearTimeout(timer)}
  },[isFocused,status?.status,load])

  function beginOperation(){
    if(operationLock?.current)return null
    const token={}
    operationClaim.current=token
    if(operationLock)operationLock.current=true
    return token
  }

  function currentSnapshot(){
    const snapshot=requestGate.current.snapshot(item.id)
    return isCurrentRequest(snapshot)?snapshot:null
  }

  function publishFailure(snapshot,nextError,fallbackCode){
    if(!isCurrentRequest(snapshot))return
    setError(messageForError(nextError))
    captureEvent('my_stuff_research_failed',{item_category:item.category,source_class:'manufacturer',result:'failed',error_type:String(nextError?.code||fallbackCode).slice(0,80)})
  }

  async function startResearch(){
    if(busy)return
    if(!isPro)return onUpgrade?.()
    const fingerprint=item.vin_confirmation_fingerprint
    if(!fingerprint)return Alert.alert('Confirm identity first','Confirm the decoded vehicle identity in Item settings before starting manufacturer research.')
    const snapshot=requestGate.current.snapshot(item.id)
    if(!isCurrentRequest(snapshot))return
    const token=beginOperation()
    if(!token)return Alert.alert('Finish the current change','Wait for the current item update to finish.')
    const mutationId=mutationIdForPayload(enqueueAttempt.current,{itemId:snapshot.itemId,fingerprint})
    setBusy(true);setError('')
    try{
      await enqueueMyStuffResearch(snapshot.itemId,fingerprint,mutationId)
      if(!isCurrentRequest(snapshot))return
      resetMutationAttemptState(enqueueAttempt.current)
      captureEvent('my_stuff_research_started',{item_category:item.category,source_class:'manufacturer',result:'success'})
      await load({quiet:true})
    }catch(nextError){publishFailure(snapshot,nextError,'request_failed')}
    finally{if(mounted.current)setBusy(false);releaseOperation(token)}
  }

  function toggleCandidate(id){setSelected(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next})}

  function confirmApproval(){
    if(selected.size===0)return Alert.alert('Choose at least one task','Select each cited task you want in the approved snapshot.')
    Alert.alert('Approve selected research?','This seals an evidence snapshot. It does not change your maintenance schedules until you separately apply it.',[
      {text:'Cancel',style:'cancel'},
      {text:'Approve',onPress:approveSelected},
    ])
  }

  async function approveSelected(){
    if(busy||!status?.jobId)return
    if(!isPro)return onUpgrade?.()
    const snapshot=currentSnapshot()
    if(!snapshot)return
    const token=beginOperation()
    if(!token)return Alert.alert('Finish the current change','Wait for the current item update to finish.')
    const jobId=status.jobId
    const candidateIds=[...selected].sort()
    const mutationId=mutationIdForPayload(approveAttempt.current,{jobId,candidateIds})
    setBusy(true);setError('')
    try{
      await approveMyStuffResearch(jobId,candidateIds,mutationId)
      if(!isCurrentRequest(snapshot))return
      resetMutationAttemptState(approveAttempt.current)
      await load({quiet:true})
    }catch(nextError){publishFailure(snapshot,nextError,'approval_failed')}
    finally{if(mounted.current)setBusy(false);releaseOperation(token)}
  }

  function confirmApply(){
    Alert.alert('Apply approved schedules?','This creates manufacturer-backed schedules from the sealed snapshot. Existing manual schedules and edits will not be silently overwritten.',[
      {text:'Cancel',style:'cancel'},
      {text:'Apply schedules',onPress:applyApproved},
    ])
  }

  async function applyApproved(){
    if(busy||!status?.approvalId)return
    if(!isPro)return onUpgrade?.()
    const snapshot=currentSnapshot()
    if(!snapshot)return
    const token=beginOperation()
    if(!token)return Alert.alert('Finish the current change','Wait for the current item update to finish.')
    const approvalId=status.approvalId
    const mutationId=mutationIdForPayload(applyAttempt.current,{approvalId})
    setBusy(true);setError('')
    try{
      await applyMyStuffResearch(approvalId,mutationId)
      if(!isCurrentRequest(snapshot))return
      resetMutationAttemptState(applyAttempt.current)
      captureEvent('my_stuff_research_completed',{item_category:item.category,source_class:'manufacturer',result:'success'})
      await load({quiet:true})
      if(isCurrentRequest(snapshot))await onApplied?.()
    }catch(nextError){publishFailure(snapshot,nextError,'apply_failed')}
    finally{if(mounted.current)setBusy(false);releaseOperation(token)}
  }

  function confirmCancel(){
    Alert.alert('Cancel research?','No research suggestions from this job will be applied. Manual schedules remain unchanged.',[
      {text:'Keep research',style:'cancel'},
      {text:'Cancel research',style:'destructive',onPress:cancelResearch},
    ])
  }

  async function cancelResearch(){
    if(busy||!status?.jobId)return
    if(!isPro)return onUpgrade?.()
    const snapshot=currentSnapshot()
    if(!snapshot)return
    const token=beginOperation()
    if(!token)return Alert.alert('Finish the current change','Wait for the current item update to finish.')
    const jobId=status.jobId
    const mutationId=mutationIdForPayload(cancelAttempt.current,{jobId})
    setBusy(true);setError('')
    try{
      await cancelMyStuffResearch(jobId,mutationId)
      if(!isCurrentRequest(snapshot))return
      resetMutationAttemptState(cancelAttempt.current)
      await load({quiet:true})
    }catch(nextError){publishFailure(snapshot,nextError,'cancel_failed')}
    finally{if(mounted.current)setBusy(false);releaseOperation(token)}
  }

  async function openSource(url){
    if(!/^https:\/\//i.test(url||''))return Alert.alert('Source unavailable','This source does not have a valid secure web address.')
    try{await Linking.openURL(url)}catch{Alert.alert('Could not open source','Copying source links is not available in this version. Please try again later.')}
  }

  const disabled=busy||parentBusy||operationLock?.current
  if(!isPro)return <View style={s.card}><Text style={s.title}>Manufacturer maintenance research</Text><Text style={s.copy}>Pro can research cited manufacturer guidance for a confirmed vehicle. You review every suggestion before anything is applied.</Text><Text style={s.manual}>Manual schedule entry stays available for everyone.</Text><TouchableOpacity style={s.secondary} onPress={onUpgrade} accessibilityRole="button" accessibilityLabel="Upgrade for manufacturer maintenance research"><Text style={s.secondaryText}>View Pro</Text></TouchableOpacity></View>

  const retryButton=(message,label='Research manufacturer schedule again')=><TouchableOpacity style={[s.primary,disabled&&s.disabled]} onPress={startResearch} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}}><Text style={s.primaryText}>{message}</Text></TouchableOpacity>

  return <View style={s.card}>
    <Text style={s.title}>Manufacturer maintenance research</Text>
    <Text style={s.copy}>Research results are suggestions, not service or safety advice. Review applicability and the exact manufacturer source before approval.</Text>
    <Text style={s.copy}>Starting sends the vehicle/item type and available confirmed year, make, model, trim, engine, transmission, drivetrain, fuel, and market details to Anthropic to search approved manufacturer or authorized-dealer sources. VIN, notes, costs, and expenses are never sent.</Text>
    <Text style={s.manual}>Manual schedule entry stays available if research is unavailable or inconclusive.</Text>
    {!!error&&<View style={s.errorBox}><Text style={s.error}>{error}</Text><TouchableOpacity onPress={()=>load()} disabled={disabled} accessibilityRole="button" accessibilityLabel="Retry research status" accessibilityState={{disabled}}><Text style={s.link}>Retry status</Text></TouchableOpacity></View>}
    {loading&&!status?<ActivityIndicator color={ACCENT}/>:null}
    {!status&&!loading&&<TouchableOpacity style={[s.primary,disabled&&s.disabled]} onPress={startResearch} disabled={disabled} accessibilityRole="button" accessibilityLabel="Research manufacturer schedule" accessibilityState={{disabled}}><Text style={s.primaryText}>{busy?'Starting…':'Research manufacturer schedule'}</Text></TouchableOpacity>}
    {researchCanPoll(status?.status)&&<View style={s.progress}><ActivityIndicator color={ACCENT}/><View style={s.flex}><Text style={s.rowTitle}>{status.status==='queued'?'Research queued':'Researching manufacturer sources'}</Text><Text style={s.copy}>You can leave this screen. Results must still be reviewed and applied manually.</Text></View></View>}
    {!!status?.jobId&&['queued','running','awaiting_review','approved'].includes(status.status)&&<TouchableOpacity style={[s.secondary,disabled&&s.disabled]} onPress={confirmCancel} disabled={disabled} accessibilityRole="button" accessibilityLabel="Cancel manufacturer maintenance research" accessibilityState={{disabled}}><Text style={s.secondaryText}>Cancel research</Text></TouchableOpacity>}
    {status?.status==='failed'&&<><Text style={s.error}>Research ended without an applicable result{status.errorCode?` (${status.errorCode})`:'.'}</Text>{retryButton('Research again')}</>}
    {status?.status==='cancelled'&&<><Text style={s.copy}>This research job was cancelled. No suggestions were applied.</Text>{retryButton('Research again')}</>}
    {['superseded','deleted'].includes(status?.status)&&<><Text style={s.copy}>This research result is no longer current and nothing was applied.</Text>{retryButton('Research again')}</>}
    {status?.status==='awaiting_review'&&review&&<View><Text style={s.heading}>Review suggestions</Text>{review.candidates.map(candidate=><View key={candidate.id} style={s.candidate}><TouchableOpacity style={s.choice} onPress={()=>toggleCandidate(candidate.id)} accessibilityRole="checkbox" accessibilityState={{checked:selected.has(candidate.id)}} accessibilityLabel={`Include ${candidate.name}`}><Text style={s.check}>{selected.has(candidate.id)?'☑':'☐'}</Text><View style={s.flex}><Text style={s.rowTitle}>{candidate.name}</Text><Text style={s.interval}>{formatResearchInterval(candidate)}</Text><Text style={s.meta}>Action: {candidate.action} · {candidate.profile==='severe'?'Severe use':'Normal use'} · {candidate.uncertainty} uncertainty</Text></View></TouchableOpacity>{evidenceForCandidate(candidate,review.evidence).map(source=><View key={source.key} style={s.source}><Text style={s.sourceClass}>{researchSourceClassLabel(source.sourceClass)}</Text><Text style={s.sourceTitle}>{source.title}</Text><Text style={s.excerpt}>“{source.exactExcerpt}”</Text><Text style={s.meta}>{sourceLocation(source)} · accessed {String(source.accessedOn).slice(0,10)} · {source.applicability}</Text><TouchableOpacity onPress={()=>openSource(source.canonicalUrl)} accessibilityRole="link" accessibilityLabel={`Open ${researchSourceClassLabel(source.sourceClass).toLowerCase()} for ${candidate.name}`}><Text style={s.link}>Open source</Text></TouchableOpacity></View>)}</View>)}{review.candidates.length===0&&<Text style={s.copy}>No cited maintenance tasks were found. Add a manual schedule instead.</Text>}{review.unresolved.map((row,index)=><View key={`unresolved-${index}`} style={s.unresolved}><Text style={s.rowTitle}>{row.name||'Unresolved guidance'}</Text><Text style={s.copy}>{row.reason||row.message||'The sources did not support one clear interval.'}</Text></View>)}{review.candidates.length>0&&<TouchableOpacity style={[s.primary,disabled&&s.disabled]} onPress={confirmApproval} disabled={disabled} accessibilityRole="button" accessibilityLabel="Approve cited research suggestions" accessibilityState={{disabled}}><Text style={s.primaryText}>{busy?'Approving…':'Approve cited suggestions'}</Text></TouchableOpacity>}</View>}
    {status?.status==='approved'&&<View><Text style={s.heading}>Research approved</Text><Text style={s.copy}>The cited snapshot is sealed. Apply is a separate step and rechecks ownership and Pro access.</Text><TouchableOpacity style={[s.primary,disabled&&s.disabled]} onPress={confirmApply} disabled={disabled} accessibilityRole="button" accessibilityLabel="Apply approved schedules" accessibilityState={{disabled}}><Text style={s.primaryText}>{busy?'Applying…':'Apply approved schedules'}</Text></TouchableOpacity></View>}
    {status?.status==='applied'&&<View style={s.success}><Text style={s.rowTitle}>Manufacturer schedules applied</Text><Text style={s.copy}>The approved citation snapshot is preserved with the schedules. Manual schedules were not overwritten.</Text><TouchableOpacity onPress={startResearch} disabled={disabled} accessibilityRole="button" accessibilityLabel="Research updated manufacturer guidance" accessibilityState={{disabled}}><Text style={s.link}>Research updated guidance</Text></TouchableOpacity></View>}
  </View>
}

const s=StyleSheet.create({card:{backgroundColor:'#FFF8EE',borderWidth:1,borderColor:'#E8D5B5',borderRadius:14,padding:16,marginBottom:12},title:{fontSize:17,fontWeight:'800',color:'#1A1917'},heading:{fontSize:16,fontWeight:'800',color:'#1A1917',marginTop:16,marginBottom:8},copy:{color:'#6B665E',lineHeight:20,marginTop:5},manual:{color:'#5C5850',fontWeight:'700',lineHeight:20,marginTop:8},primary:{backgroundColor:ACCENT,minHeight:46,borderRadius:10,alignItems:'center',justifyContent:'center',paddingHorizontal:14,marginTop:12},primaryText:{color:'#fff',fontWeight:'800'},secondary:{minHeight:46,borderRadius:10,borderWidth:1,borderColor:ACCENT,alignItems:'center',justifyContent:'center',marginTop:12},secondaryText:{color:ACCENT,fontWeight:'800'},disabled:{opacity:.55},progress:{flexDirection:'row',alignItems:'center',gap:12,marginTop:14},flex:{flex:1},candidate:{backgroundColor:'#fff',borderWidth:1,borderColor:'#E8E4DE',borderRadius:12,padding:12,marginBottom:10},choice:{flexDirection:'row',alignItems:'flex-start',gap:10,minHeight:44},check:{fontSize:23,color:ACCENT},rowTitle:{fontWeight:'800',color:'#1A1917'},interval:{fontWeight:'700',color:ACCENT,marginTop:3},meta:{fontSize:12,color:'#79736A',lineHeight:17,marginTop:4},source:{borderTopWidth:1,borderTopColor:'#E8E4DE',marginTop:10,paddingTop:10},sourceClass:{fontSize:11,fontWeight:'800',color:'#6B4B16',textTransform:'uppercase',marginBottom:3},sourceTitle:{fontWeight:'700',color:'#34312D'},excerpt:{color:'#444039',fontStyle:'italic',lineHeight:19,marginTop:5},link:{color:ACCENT,fontWeight:'700',paddingVertical:8},unresolved:{backgroundColor:'#FFF1C9',borderRadius:9,padding:10,marginBottom:8},errorBox:{backgroundColor:'#FDECE8',borderRadius:9,padding:10,marginTop:10},error:{color:'#8B3328',lineHeight:19},success:{backgroundColor:'#EEF7E9',borderRadius:9,padding:12,marginTop:12}})
