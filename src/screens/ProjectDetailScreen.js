import { useEffect, useRef, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert, ActivityIndicator, Share, Modal, KeyboardAvoidingView, Platform } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import MultiPhotoPicker from '../components/MultiPhotoPicker'
import VinDecodePanel from '../components/VinDecodePanel'
import { maskVin, validateVinIdentifier } from '../domain/myStuff/vinModel'
import { roundLaborHours } from './laborModel'
import { captureEvent } from '../lib/analytics'
import { accessibleActiveGoalsAfterProLoss, createMutationId } from './tradeUpGoalModel'
import { openGoalCreation } from './goalCreationNavigation'
import { createDescriptionRequest, needsDescriptionPreview, normalizeListingSelection } from './listingGeneratorModel'

const ACCENT = '#C8402F'
const GREEN = '#2D7A4F'
const getTotalInvested = p => (p.expenses||[]).reduce((s,e)=>s+Number(e.amount),0) + (Number(p.purchase_price)||0)

const EXPENSE_CATS = [
  {value:'parts',label:'Parts'},{value:'supplies',label:'Supplies'},
  {value:'labor',label:'Labor'},{value:'transport',label:'Transport'},
  {value:'fees',label:'Fees'},{value:'other',label:'Other'},
]

const LISTING_STYLES = [
  { value: 'professional', label: 'Professional' },
  { value: 'normal', label: 'Normal' },
  { value: 'funny', label: 'Funny' },
]
const HUMOR_LEVELS = [
  { value: 'subtle', label: 'Subtle' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'unhinged', label: 'Unhinged' },
]

const EMPTY_EXPENSE = { description: '', amount: '', category: 'parts', laborHours: '' }
const EMPTY_VEHICLE_DETAILS = { vin: '', year: '', make: '', model: '', engine: '' }

export default function ProjectDetailScreen({ navigation, route }) {
  const { user, isPro, plan, formatMoney } = useAuth()
  const { projectId, onReturn } = route.params || {}
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [editingExpenseId, setEditingExpenseId] = useState(null)
  const [expense, setExpense] = useState(EMPTY_EXPENSE)
  const [saving, setSaving] = useState(false)
  const [generatingListing, setGeneratingListing] = useState(false)
  const [listingText, setListingText] = useState('')
  const [generatedPreview, setGeneratedPreview] = useState('')
  const [generatedPreviewSelection, setGeneratedPreviewSelection] = useState(null)
  const [showListingModal, setShowListingModal] = useState(false)
  const [generatorStep, setGeneratorStep] = useState(null)
  const [showDescriptionPreview, setShowDescriptionPreview] = useState(false)
  const [selectedListingStyle, setSelectedListingStyle] = useState('normal')
  const [selectedHumorLevel, setSelectedHumorLevel] = useState('balanced')
  const [activeGoals, setActiveGoals] = useState([])
  const [vehicleDetails, setVehicleDetails] = useState(EMPTY_VEHICLE_DETAILS)
  const [savingVehicleDetails, setSavingVehicleDetails] = useState(false)
  const [showAssignGoal, setShowAssignGoal] = useState(false)
  const goalLinkMutationId = useRef(createMutationId())
  const projectLoadGeneration = useRef(0)
  const generationRequestRef = useRef(0)
  const generationInFlightRef = useRef(false)
  const generationAbortRef = useRef(null)
  const listingTextRef = useRef(listingText)
  const currentPlan = useRef(plan)
  listingTextRef.current = listingText
  currentPlan.current = plan

  async function load() {
    const request = ++projectLoadGeneration.current
    const [projectResult, goalResult] = await Promise.all([
      supabase.from('projects').select('*, expenses(*)').eq('id', projectId).single(),
      supabase.from('trade_up_goals').select('id,name,status,created_at').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }),
    ])
    if (request !== projectLoadGeneration.current) return
    if (projectResult.error) {
      Alert.alert('Could not load project', projectResult.error.message)
      setLoading(false)
      return
    }
    setProject(projectResult.data)
    setVehicleDetails({
      vin: projectResult.data.vin || '',
      year: projectResult.data.vehicle_year == null ? '' : String(projectResult.data.vehicle_year),
      make: projectResult.data.vehicle_make || '',
      model: projectResult.data.vehicle_model || '',
      engine: projectResult.data.engine_model || '',
    })
    if (goalResult.error) Alert.alert('Could not load goals', goalResult.error.message)
    else setActiveGoals(goalResult.data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    return () => { projectLoadGeneration.current += 1 }
  }, [projectId, plan])

  useEffect(() => () => {
    generationRequestRef.current += 1
    generationInFlightRef.current = false
    generationAbortRef.current?.abort()
  }, [])

  const selectableGoals = accessibleActiveGoalsAfterProLoss(activeGoals, plan)

  async function assignGoal(goalId, candidateGoals = activeGoals) {
    if (saving) return
    const allowedGoal = accessibleActiveGoalsAfterProLoss(candidateGoals, currentPlan.current).some(goal => goal.id === goalId)
    if (!allowedGoal) return Alert.alert('Goal locked', 'Your plan changed. Only your oldest active Goal is available without SideFlip Pro.')
    setSaving(true)
    try {
      const { error } = await supabase.rpc('link_trade_up_project', {
        p_project_id: projectId,
        p_goal_id: goalId,
        p_goal_funding: 0,
        p_mutation_id: goalLinkMutationId.current,
      })
      if (error) throw error
      goalLinkMutationId.current = createMutationId()
      setShowAssignGoal(false)
      await onReturn?.()
      await load()
      Alert.alert('Goal assigned', 'This project will now update the selected Trade-Up Goal.')
    } catch (error) {
      Alert.alert('Could not assign goal', error.message || 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function createGoalForProject() {
    setShowAssignGoal(false)
    openGoalCreation({
      navigation,
      plan,
      activeGoals,
      onCreated: async goal => {
        const nextGoals = [goal, ...activeGoals.filter(item => item.id !== goal.id)]
        setActiveGoals(nextGoals)
        await assignGoal(goal.id, nextGoals)
      },
    })
  }

  function beginAssignGoal() {
    if (selectableGoals.length > 0) {
      setShowAssignGoal(true)
      return
    }
    Alert.alert('No active goal', 'Would you like to create a Trade-Up Goal for this project?', [
      { text: 'Not Now', style: 'cancel' },
      { text: 'Create Goal', onPress: createGoalForProject },
    ])
  }

  async function handlePhotosUpdate(urls) {
    const photo = urls[0] || null
    const photos = urls
    const { error } = await supabase.from('projects').update({ photo, photos }).eq('id', projectId)
    if (error) throw new Error(`Could not save project photos: ${error.message}`)
    setProject(p => ({ ...p, photo, photos }))
  }

  async function saveVehicleDetails() {
    if (savingVehicleDetails) return
    const yearText = String(vehicleDetails.year || '').trim()
    const year = yearText === '' ? null : Number(yearText)
    if (yearText && (!Number.isInteger(year) || year < 1800 || year > 2200)) {
      return Alert.alert('Check model year', 'Enter a whole year from 1800 to 2200, or leave it blank.')
    }
    const vinValidation = validateVinIdentifier(vehicleDetails.vin,'project')
    if (!vinValidation.ok) return Alert.alert('Check VIN / identifier', vinValidation.reason)
    const values = {
      vin: String(vehicleDetails.vin || '').trim() || null,
      vehicle_year: year,
      vehicle_make: String(vehicleDetails.make || '').trim() || null,
      vehicle_model: String(vehicleDetails.model || '').trim() || null,
      engine_model: String(vehicleDetails.engine || '').trim() || null,
    }
    setSavingVehicleDetails(true)
    try {
      const { data, error } = await supabase.from('projects').update(values).eq('id', projectId).eq('user_id', user.id).select('*').single()
      if (error) throw error
      setProject(current => ({ ...current, ...data }))
      Alert.alert('Vehicle details saved', 'Your manual and applied VIN details were saved.')
    } catch (error) {
      Alert.alert('Could not save vehicle details', error.message || 'Your entries are still here. Please try again.')
    } finally {
      setSavingVehicleDetails(false)
    }
  }

  function beginAddExpense() {
    setEditingExpenseId(null)
    setExpense(EMPTY_EXPENSE)
    setShowAddExpense(true)
  }

  function beginEditExpense(item) {
    setEditingExpenseId(item.id)
    setExpense({
      description: item.description || '',
      amount: String(item.amount ?? ''),
      category: item.category || 'other',
      laborHours: item.labor_hours == null ? '' : String(item.labor_hours),
    })
    setShowAddExpense(true)
  }

  function cancelExpense() {
    setEditingExpenseId(null)
    setExpense(EMPTY_EXPENSE)
    setShowAddExpense(false)
  }

  async function handleAddExpense() {
    const amount = Number(expense.amount)
    const laborHours = roundLaborHours(expense.laborHours)
    if (!expense.description.trim() || !Number.isFinite(amount) || amount <= 0) {
      return Alert.alert('Fill in expense details', 'Description and an amount greater than zero are required.')
    }
    if (laborHours === null) {
      return Alert.alert('Labor time required', 'Enter the time spent. SideFlip rounds it up to the nearest 0.25 hour.')
    }

    setSaving(true)
    try {
      const values = {
        description: expense.description.trim(),
        amount,
        category: expense.category,
        labor_hours: laborHours,
      }
      const query = editingExpenseId
        ? supabase.from('expenses').update(values).eq('id', editingExpenseId).eq('project_id', projectId).eq('user_id', user.id)
        : supabase.from('expenses').insert({ ...values, project_id: projectId, user_id: user.id })
      const { error } = await query
      if (error) throw error
      captureEvent(editingExpenseId ? 'expense_updated' : 'expense_added', {
        expense_category: expense.category,
        project_category: project.category,
      })
      cancelExpense()
      await load()
    } catch (error) {
      Alert.alert(editingExpenseId ? 'Could not update expense' : 'Could not add expense', error.message || 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteExpense(id) {
    Alert.alert('Remove expense?', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('expenses').delete().eq('id', id).eq('project_id', projectId).eq('user_id', user.id)
        if (error) return Alert.alert('Could not remove expense', error.message)
        captureEvent('expense_deleted', { project_category: project.category })
        if (editingExpenseId === id) cancelExpense()
        await load()
      }}
    ])
  }

  async function handleUndoSale() {
    if (saving) return
    Alert.alert('Undo this sale?', 'The project will return to Active and its sale proceeds will be removed from the goal, if linked.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Undo Sale', onPress: async () => {
        setSaving(true)
        try {
          const { error } = await supabase.rpc('undo_goal_project_outcome', { p_project_id: projectId })
          if (error) throw error
          captureEvent('project_sale_undone', { project_category: project.category, is_goal_linked: Boolean(project.goal_id) })
          await onReturn?.()
          await load()
        } catch (error) {
          Alert.alert('Could not undo sale', error.message || 'Please try again.')
        } finally {
          setSaving(false)
        }
      }},
    ])
  }

  async function handleDelete() {
    Alert.alert(`Delete "${project?.title}"?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const { error } = await supabase.rpc('delete_trade_up_project', { p_project_id: projectId })
        if (error) return Alert.alert('Could not delete project', error.message)
        captureEvent('project_deleted', { project_category: project.category, is_goal_linked: Boolean(project.goal_id) })
        onReturn?.()
        navigation.goBack()
      }}
    ])
  }

  function openListingEditor() {
    if (!isPro) {
      navigation.navigate('Pro')
      return
    }
    setShowListingModal(true)
  }

  function closeListingEditor() {
    generationRequestRef.current += 1
    generationInFlightRef.current = false
    generationAbortRef.current?.abort()
    generationAbortRef.current = null
    setGeneratingListing(false)
    setGeneratorStep(null)
    setShowDescriptionPreview(false)
    setGeneratedPreviewSelection(null)
    setShowListingModal(false)
  }

  function closeDescriptionPreview() {
    if (generationInFlightRef.current) {
      generationRequestRef.current += 1
      generationInFlightRef.current = false
      generationAbortRef.current?.abort()
      generationAbortRef.current = null
      setGeneratingListing(false)
    }
    setShowDescriptionPreview(false)
    setGeneratedPreviewSelection(null)
  }

  function handleListingTextChange(text) {
    listingTextRef.current = text
    setListingText(text)
  }

  function beginDescriptionGenerator() {
    if (generatingListing || generationInFlightRef.current) return
    setGeneratorStep('style')
  }

  function chooseListingStyle(style) {
    const selection = normalizeListingSelection(style)
    setSelectedListingStyle(selection.style)
    setSelectedHumorLevel(selection.humorLevel || 'balanced')
    if (selection.style === 'funny') {
      setGeneratorStep('humor')
      return
    }
    generateListing(selection.style, null)
  }

  function chooseHumorLevel(humorLevel) {
    const selection = normalizeListingSelection('funny', humorLevel)
    setSelectedListingStyle(selection.style)
    setSelectedHumorLevel(selection.humorLevel)
    generateListing(selection.style, selection.humorLevel)
  }

  function choosePreviewStyle(style) {
    const selection = normalizeListingSelection(style, style === 'funny' ? selectedHumorLevel : null)
    setSelectedListingStyle(selection.style)
    setSelectedHumorLevel(selection.humorLevel)
  }

  function analyticsForSelection(style, humorLevel, extra = {}) {
    return {
      project_category: project?.category,
      listing_style: style,
      ...(style === 'funny' ? { humor_level: humorLevel || 'balanced' } : {}),
      had_existing_description: needsDescriptionPreview(listingTextRef.current),
      ...extra,
    }
  }

  async function generateListing(style = selectedListingStyle, humorLevel = selectedHumorLevel, isRegeneration = false) {
    if (generationInFlightRef.current) return
    if (!isPro) {
      setGeneratorStep(null)
      setShowDescriptionPreview(false)
      setShowListingModal(false)
      navigation.navigate('Pro')
      return
    }

    const selection = normalizeListingSelection(style, style === 'funny' ? humorLevel : null)
    const hadExistingDescription = needsDescriptionPreview(listingTextRef.current)
    const requestBody = createDescriptionRequest(projectId, selection.style, selection.humorLevel, listingTextRef.current)
    const request = ++generationRequestRef.current
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25_000)
    generationInFlightRef.current = true
    generationAbortRef.current = controller
    setGeneratorStep(null)
    setGeneratingListing(true)
    captureEvent('ai_listing_requested', analyticsForSelection(selection.style, selection.humorLevel, { is_pro: true, had_existing_description: hadExistingDescription }))
    if (isRegeneration) captureEvent('ai_listing_regenerated', analyticsForSelection(selection.style, selection.humorLevel, { had_existing_description: hadExistingDescription }))

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('auth')
      const res = await fetch('https://sideflip.org/api/generate-listing', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(requestBody),
      })
      let data = {}
      try { data = await res.json() } catch { /* show the friendly message below */ }
      const description = typeof data.description === 'string' ? data.description.trim() : typeof data.listing === 'string' ? data.listing.trim() : ''
      if (!res.ok || !description || request !== generationRequestRef.current) {
        if (request !== generationRequestRef.current) return
        throw new Error('generation')
      }

      captureEvent('ai_listing_succeeded', analyticsForSelection(selection.style, selection.humorLevel, { had_existing_description: hadExistingDescription }))
      if (hadExistingDescription) {
        setGeneratedPreview(description)
        setGeneratedPreviewSelection({ ...selection, hadExistingDescription })
        setShowDescriptionPreview(true)
      } else {
        handleListingTextChange(description)
        captureEvent('ai_listing_accepted', analyticsForSelection(selection.style, selection.humorLevel, { had_existing_description: hadExistingDescription }))
      }
    } catch (error) {
      if (request !== generationRequestRef.current) return
      captureEvent('ai_listing_failed', analyticsForSelection(selection.style, selection.humorLevel, { error_type: error?.name === 'AbortError' ? 'timeout' : 'generation_failed', had_existing_description: hadExistingDescription }))
      Alert.alert("Couldn't generate a description", 'Try again.')
    } finally {
      clearTimeout(timeout)
      if (request === generationRequestRef.current) {
        generationInFlightRef.current = false
        generationAbortRef.current = null
        setGeneratingListing(false)
      }
    }
  }

  function useGeneratedDescription() {
    handleListingTextChange(generatedPreview)
    setShowDescriptionPreview(false)
    const producingSelection = generatedPreviewSelection || normalizeListingSelection(selectedListingStyle, selectedHumorLevel)
    setGeneratedPreviewSelection(null)
    captureEvent('ai_listing_accepted', analyticsForSelection(producingSelection.style, producingSelection.humorLevel, { had_existing_description: generatedPreviewSelection?.hadExistingDescription ?? true }))
  }

  if (loading) return <View style={{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:'#FAFAF7'}}><ActivityIndicator color={ACCENT} /></View>
  if (!project) return <View style={{flex:1,padding:24}}><Text>Project not found.</Text></View>

  const totalInvested = getTotalInvested(project)
  const profit = project.sale_price ? Number(project.sale_price) - totalInvested : null
  const photos = project.photos?.length > 0 ? project.photos : (project.photo ? [project.photo] : [])
  const dedicatedPhotos = [project.before_photo, project.after_photo].filter(url => url && !photos.includes(url))
  const laborPreview = roundLaborHours(expense.laborHours)

  return (
    <View style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => { onReturn?.(); navigation.goBack() }} style={s.backBtn}>
          <Text style={s.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{project.title}</Text>
        <TouchableOpacity onPress={handleDelete} style={{width:60,alignItems:'flex-end'}}>
          <Text style={{color:ACCENT,fontSize:13,fontWeight:'600'}}>Delete</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
        {/* Multi Photo */}
        <MultiPhotoPicker
          userId={user.id}
          photos={photos}
          onUpdate={handlePhotosUpdate}
          isPro={isPro}
          additionalPhotoCount={dedicatedPhotos.length}
          onUpgrade={() => navigation.navigate('Pro')}
        />

        {/* Stats */}
        <View style={s.statsCard}>
          <View style={s.statRow}>
            <Text style={s.statLabel}>Purchase Price</Text>
            <Text style={s.statValue}>{formatMoney(project.purchase_price)}</Text>
          </View>
          <View style={s.statRow}>
            <Text style={s.statLabel}>Expenses</Text>
            <Text style={s.statValue}>{formatMoney(totalInvested - Number(project.purchase_price||0))}</Text>
          </View>
          <View style={[s.statRow,{borderBottomWidth:0}]}>
            <Text style={[s.statLabel,{fontWeight:'700'}]}>Total Invested</Text>
            <Text style={[s.statValue,{color:ACCENT,fontWeight:'700'}]}>{formatMoney(totalInvested)}</Text>
          </View>
          {profit !== null && (
            <View style={[s.profitBanner, profit<0 && s.profitBannerLoss]}>
              <Text style={s.profitLabel}>{profit>=0?'Profit':'Loss'}</Text>
              <Text style={s.profitAmount}>{profit>=0?'+':''}{formatMoney(profit)}</Text>
            </View>
          )}
        </View>

        <Text style={s.sectionTitle}>Vehicle details</Text>
        <View style={s.card}>
          <Text style={s.inputHint}>Manual entry is always available. Saved VIN display: {vehicleDetails.vin ? maskVin(vehicleDetails.vin) : 'Not set'}</Text>
          <ProjectVehicleField label="Model year" value={vehicleDetails.year} onChangeText={year => setVehicleDetails(current => ({ ...current, year }))} keyboardType="number-pad" />
          <ProjectVehicleField label="Make" value={vehicleDetails.make} onChangeText={make => setVehicleDetails(current => ({ ...current, make }))} />
          <ProjectVehicleField label="Model" value={vehicleDetails.model} onChangeText={model => setVehicleDetails(current => ({ ...current, model }))} />
          <ProjectVehicleField label="Engine" value={vehicleDetails.engine} onChangeText={engine => setVehicleDetails(current => ({ ...current, engine }))} />
          <VinDecodePanel subjectType="project" subjectId={projectId} isPro={isPro} values={vehicleDetails} onChange={setVehicleDetails} onUpgrade={() => navigation.navigate('Pro')} suggestionFields={['year','make','model','engine']} />
          <TouchableOpacity style={[s.btn,{marginTop:12},savingVehicleDetails&&s.btnDisabled]} onPress={saveVehicleDetails} disabled={savingVehicleDetails} accessibilityRole="button" accessibilityLabel="Save Vehicle Details" accessibilityState={{disabled:savingVehicleDetails,busy:savingVehicleDetails}}>
            {savingVehicleDetails ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>Save Vehicle Details</Text>}
          </TouchableOpacity>
        </View>

        {/* Notes */}
        {project.notes && (
          <>
            <Text style={s.sectionTitle}>Notes</Text>
            <View style={s.card}><Text style={s.notesText}>{project.notes}</Text></View>
          </>
        )}

        {/* Expenses */}
        <Text style={s.sectionTitle}>Expenses ({project.expenses?.length || 0})</Text>
        <View style={s.card}>
          {(!project.expenses || project.expenses.length === 0) ? (
            <Text style={s.emptyText}>No expenses yet</Text>
          ) : (
            project.expenses.map(e => (
              <View key={e.id} style={s.expenseRow}>
                <TouchableOpacity style={s.expenseEditArea} onPress={() => beginEditExpense(e)}>
                  <View style={{flex:1}}>
                    <Text style={s.expenseDesc}>{e.description}</Text>
                    <Text style={s.expenseCat}>{e.category}{e.labor_hours ? ` · ${Number(e.labor_hours)} hr labor` : ' · Labor not recorded'}</Text>
                  </View>
                  <Text style={s.expenseAmount}>{formatMoney(e.amount)}</Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove ${e.description}`} onPress={() => handleDeleteExpense(e.id)}>
                  <Text style={s.expenseRemove}>×</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Add expense form */}
        {showAddExpense && (
          <View style={s.card}>
            <Text style={s.formTitle}>{editingExpenseId ? 'Edit Expense' : 'Add Expense'}</Text>
            <Text style={[s.label,{marginBottom:6}]}>Description</Text>
            <TextInput style={s.input} placeholder="e.g. Carburetor" placeholderTextColor="#A8A49E"
              value={expense.description} onChangeText={v => setExpense(e=>({...e,description:v}))} autoFocus />
            <Text style={[s.label,{marginTop:12,marginBottom:6}]}>Amount</Text>
            <TextInput style={s.input} placeholder="0.00" placeholderTextColor="#A8A49E"
              value={expense.amount} onChangeText={v => setExpense(e=>({...e,amount:v}))} keyboardType="decimal-pad" />
            <Text style={[s.label,{marginTop:12,marginBottom:6}]}>Labor hours *</Text>
            <TextInput style={s.input} placeholder="0.25" placeholderTextColor="#A8A49E"
              value={expense.laborHours} onChangeText={v => setExpense(e=>({...e,laborHours:v}))} keyboardType="decimal-pad" />
            <Text style={s.inputHint}>{laborPreview ? `Will save as ${laborPreview} hour${laborPreview === 1 ? '' : 's'}.` : 'Always rounded up to the nearest 0.25 hour.'}</Text>
            <View style={{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:12}}>
              {EXPENSE_CATS.map(c => (
                <TouchableOpacity key={c.value} onPress={() => setExpense(e=>({...e,category:c.value}))}
                  style={[s.catChip, expense.category===c.value && s.catChipActive]}>
                  <Text style={[s.catChipText, expense.category===c.value && s.catChipTextActive]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{flexDirection:'row',gap:8,marginTop:16}}>
              <TouchableOpacity style={[s.btn,{flex:1,backgroundColor:'#F0EDE8'}]} onPress={cancelExpense}>
                <Text style={[s.btnText,{color:'#5C5850'}]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn,{flex:1},saving&&s.btnDisabled]} onPress={handleAddExpense} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>{editingExpenseId ? 'Save Changes' : 'Add Expense'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Actions */}
        {project.status === 'active' && (
          <>
            {!showAddExpense && (
              <TouchableOpacity style={[s.btn,{backgroundColor:'#F0EDE8',marginBottom:10}]} onPress={beginAddExpense}>
                <Text style={[s.btnText,{color:'#1A1917'}]}>Add Expense</Text>
              </TouchableOpacity>
            )}

            {/* Sales Listing Editor */}
            <TouchableOpacity
              style={[s.btn, {backgroundColor:'#1A1917', marginBottom:10}]}
              onPress={openListingEditor}
            >
              <Text style={s.btnText}>Create Sales Listing</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[s.btn,{backgroundColor:GREEN}]}
              onPress={() => navigation.navigate('SellProject', {projectId, project, onReturn:async()=>{await onReturn?.();await load()}})}>
              <Text style={s.btnText}>Mark as Sold</Text>
            </TouchableOpacity>
            {project.status === 'active' && !project.goal_id && (
              <TouchableOpacity style={s.assignGoalLink} onPress={beginAssignGoal} disabled={saving}>
                <Text style={s.assignGoalLinkText}>Assign to Goal</Text>
              </TouchableOpacity>
            )}
          </>
        )}
        {project.status === 'sold' && (
          <>
            <TouchableOpacity
              style={[s.btn, {backgroundColor:'#1A1917', marginBottom:10}]}
              onPress={openListingEditor}
            >
              <Text style={s.btnText}>Create Sales Listing</Text>
            </TouchableOpacity>
            <View style={s.soldBadge}><Text style={s.soldText}>✅ Sold for {formatMoney(project.sale_price)}</Text></View>
            <TouchableOpacity style={[s.btn, s.undoSaleButton, saving && s.btnDisabled]} onPress={handleUndoSale} disabled={saving}>
              {saving ? <ActivityIndicator color={ACCENT} /> : <Text style={s.undoSaleText}>Undo Sale</Text>}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <Modal visible={showAssignGoal} transparent animationType="fade" onRequestClose={() => setShowAssignGoal(false)}>
        <View style={s.assignOverlay}>
          <View style={s.assignCard}>
            <View style={s.assignHeader}>
              <Text style={s.assignTitle}>Assign to Goal</Text>
              <TouchableOpacity style={s.goalPlusButton} onPress={createGoalForProject} accessibilityRole="button" accessibilityLabel="Create new Trade-Up Goal">
                <Text style={s.goalPlusText}>+</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.assignHint}>Choose the active goal this project should update.</Text>
            {selectableGoals.map(goal => (
              <TouchableOpacity key={goal.id} style={s.assignChoice} onPress={() => assignGoal(goal.id)} disabled={saving}>
                <Text style={s.assignChoiceText}>{goal.name}</Text>
                {saving && <ActivityIndicator size="small" color={ACCENT} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.assignCancel} onPress={() => setShowAssignGoal(false)} disabled={saving}>
              <Text style={s.assignCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Listing Editor Modal */}
      <Modal visible={showListingModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={showDescriptionPreview ? closeDescriptionPreview : closeListingEditor}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modalRoot}>
            <View
              style={s.generatorBackground}
              accessibilityElementsHidden={generatorStep !== null}
              importantForAccessibility={generatorStep !== null ? 'no-hide-descendants' : 'auto'}
            >
              {showDescriptionPreview ? (
              <>
                <View style={s.modalHeader}>
                  <TouchableOpacity onPress={closeDescriptionPreview} accessibilityRole="button" accessibilityLabel="Cancel description preview"><Text style={s.modalCancel}>Cancel</Text></TouchableOpacity>
                  <Text style={s.modalTitle}>Description Preview</Text>
                  <View style={s.headerSpacer} />
                </View>
                <ScrollView
                  style={s.modalScroll}
                  contentContainerStyle={s.modalScrollContent}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                  automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
                >
                  <Text style={s.modalHint}>Your current description is unchanged until you tap Use Description. Change the options, then tap Regenerate to rewrite it.</Text>
                  <Text style={s.previewLabel}>Style</Text>
                  <View style={s.previewChoices} accessibilityRole="radiogroup">
                    {LISTING_STYLES.map(({ value, label }) => (
                      <TouchableOpacity
                        key={value}
                        disabled={generatingListing}
                        onPress={() => choosePreviewStyle(value)}
                        accessibilityRole="radio"
                        accessibilityLabel={`${label} listing style`}
                        accessibilityState={{ selected: selectedListingStyle === value, disabled: generatingListing }}
                        style={[s.previewChip, selectedListingStyle === value && s.previewChipActive]}
                      >
                        <Text style={[s.previewChipText, selectedListingStyle === value && s.previewChipTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {selectedListingStyle === 'funny' && (
                    <>
                      <Text style={s.previewLabel}>How funny?</Text>
                      <View style={s.previewChoices} accessibilityRole="radiogroup">
                        {HUMOR_LEVELS.map(({ value, label }) => (
                          <TouchableOpacity
                            key={value}
                            disabled={generatingListing}
                            onPress={() => setSelectedHumorLevel(value)}
                            accessibilityRole="radio"
                            accessibilityLabel={`${label} humor level`}
                            accessibilityState={{ selected: selectedHumorLevel === value, disabled: generatingListing }}
                            style={[s.previewChip, selectedHumorLevel === value && s.previewChipActive]}
                          >
                            <Text style={[s.previewChipText, selectedHumorLevel === value && s.previewChipTextActive]}>{label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}
                  {generatingListing && (
                    <View style={s.writingRow} accessibilityRole="progressbar" accessibilityLabel="Writing your description">
                      <ActivityIndicator size="small" color={ACCENT} />
                      <Text style={s.writingText}>Writing your description...</Text>
                    </View>
                  )}
                  <TextInput
                    style={s.listingInput}
                    value={generatedPreview}
                    onChangeText={setGeneratedPreview}
                    multiline
                    scrollEnabled
                    textAlignVertical="top"
                    accessibilityLabel="Generated description preview"
                  />
                  <TouchableOpacity style={[s.modalShareBtn, generatingListing && s.btnDisabled]} disabled={generatingListing} onPress={useGeneratedDescription} accessibilityRole="button">
                    <Text style={s.modalShareBtnText}>Use Description</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.secondaryModalButton, generatingListing && s.btnDisabled]} disabled={generatingListing} onPress={() => generateListing(selectedListingStyle, selectedHumorLevel, true)} accessibilityRole="button">
                    <Text style={s.secondaryModalButtonText}>Regenerate</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.generatorCancel} onPress={closeDescriptionPreview} accessibilityRole="button" accessibilityLabel="Cancel description preview"><Text style={s.generatorCancelText}>Cancel</Text></TouchableOpacity>
                </ScrollView>
              </>
            ) : (
              <>
                <View style={s.modalHeader}>
                  <TouchableOpacity onPress={closeListingEditor} accessibilityRole="button" accessibilityLabel="Cancel sales listing">
                    <Text style={s.modalCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={s.modalTitle}>Sales Listing</Text>
                  <TouchableOpacity disabled={!listingText.trim() || generatingListing} onPress={() => Share.share({ message: listingText.trim() })} accessibilityRole="button" accessibilityLabel="Share sales listing">
                    <Text style={[s.modalShare, (!listingText.trim() || generatingListing) && s.mutedAction]}>Share</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView
                  style={s.modalScroll}
                  contentContainerStyle={s.modalScrollContent}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                  automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
                >
                  <Text style={s.modalHint}>Write or generate a description, then edit anything before sharing.</Text>
                  <View style={s.descriptionHeader}>
                    <Text style={s.descriptionLabel}>Description</Text>
                    <TouchableOpacity
                      style={[s.generateDescriptionButton, generatingListing && s.btnDisabled]}
                      onPress={beginDescriptionGenerator}
                      disabled={generatingListing}
                      accessibilityRole="button"
                      accessibilityLabel="Generate Description"
                    >
                      <Text style={s.generateDescriptionText}>✨ Generate Description</Text>
                    </TouchableOpacity>
                  </View>
                  {generatingListing && (
                    <View style={s.writingRow} accessibilityRole="progressbar" accessibilityLabel="Writing your description">
                      <ActivityIndicator size="small" color={ACCENT} />
                      <Text style={s.writingText}>Writing your description...</Text>
                    </View>
                  )}
                  <TextInput
                    style={s.listingInput}
                    value={listingText}
                    onChangeText={handleListingTextChange}
                    multiline
                    scrollEnabled
                    textAlignVertical="top"
                    placeholder="Add the details a buyer should know..."
                    placeholderTextColor="#A8A49E"
                    accessibilityLabel="Sales listing description"
                  />
                  <TouchableOpacity
                    style={[s.modalShareBtn, (!listingText.trim() || generatingListing) && s.btnDisabled]}
                    disabled={!listingText.trim() || generatingListing}
                    onPress={() => Share.share({ message: listingText.trim() })}
                    accessibilityRole="button"
                    accessibilityLabel="Share or copy sales listing"
                  >
                    <Text style={s.modalShareBtnText}>Share / Copy Listing</Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
              )}
            </View>

            {generatorStep !== null && (
              <View style={s.generatorOverlay} accessibilityViewIsModal importantForAccessibility="yes">
                <ScrollView style={s.generatorCard} contentContainerStyle={s.generatorCardContent} keyboardShouldPersistTaps="handled" bounces={false}>
                  <Text style={s.generatorTitle}>{generatorStep === 'humor' ? 'How funny?' : 'Choose a style'}</Text>
                  {generatorStep === 'style' ? (
                    <>
                      {LISTING_STYLES.map(({ value, label }) => (
                        <TouchableOpacity
                          key={value}
                          style={s.generatorChoice}
                          onPress={() => chooseListingStyle(value)}
                          accessibilityRole="radio"
                          accessibilityLabel={`${label} listing style`}
                          accessibilityState={{ selected: selectedListingStyle === value }}
                        >
                          <Text style={s.generatorChoiceText}>{label}</Text>
                        </TouchableOpacity>
                      ))}
                    </>
                  ) : (
                    <>
                      {HUMOR_LEVELS.map(({ value, label }) => (
                        <TouchableOpacity
                          key={value}
                          style={[s.generatorChoice, value === 'balanced' && s.generatorChoiceRecommended]}
                          onPress={() => chooseHumorLevel(value)}
                          accessibilityRole="radio"
                          accessibilityLabel={`${label} humor level`}
                          accessibilityState={{ selected: selectedHumorLevel === value }}
                        >
                          <Text style={s.generatorChoiceText}>{label}</Text>
                          {value === 'balanced' && <Text style={s.recommendedText}>Recommended</Text>}
                        </TouchableOpacity>
                      ))}
                    </>
                  )}
                  <TouchableOpacity style={s.generatorCancel} onPress={() => setGeneratorStep(null)} accessibilityRole="button"><Text style={s.generatorCancelText}>Cancel</Text></TouchableOpacity>
                </ScrollView>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

function ProjectVehicleField({ label, ...props }) {
  return <View><Text style={[s.label,{marginTop:12,marginBottom:6}]}>{label}</Text><TextInput style={s.input} placeholderTextColor="#A8A49E" {...props}/></View>
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:'#FAFAF7'},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingTop:56,paddingBottom:12,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#E8E4DE'},
  backBtn:{width:60},backText:{color:ACCENT,fontSize:16,fontWeight:'600'},
  headerTitle:{flex:1,fontSize:17,fontWeight:'700',color:'#1A1917',textAlign:'center'},
  content:{padding:16,paddingBottom:60},
  statsCard:{backgroundColor:'#fff',borderRadius:12,padding:16,marginBottom:16,shadowColor:'#000',shadowOpacity:0.04,shadowRadius:8,shadowOffset:{width:0,height:2},elevation:2},
  statRow:{flexDirection:'row',justifyContent:'space-between',paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#F0EDE8'},
  statLabel:{fontSize:14,color:'#5C5850'},statValue:{fontSize:14,fontWeight:'600',color:'#1A1917'},
  profitBanner:{marginTop:12,backgroundColor:'#E8F5EE',borderRadius:8,padding:12,alignItems:'center'},
  profitBannerLoss:{backgroundColor:'#FDECEA'},
  profitLabel:{fontSize:11,color:'#2D7A4F',textTransform:'uppercase',letterSpacing:0.5,marginBottom:2},
  profitAmount:{fontSize:24,fontWeight:'800',color:'#2D7A4F'},
  sectionTitle:{fontSize:13,fontWeight:'700',color:'#8C8880',textTransform:'uppercase',letterSpacing:0.5,marginBottom:8,marginTop:8},
  card:{backgroundColor:'#fff',borderRadius:12,padding:16,marginBottom:12,shadowColor:'#000',shadowOpacity:0.04,shadowRadius:8,shadowOffset:{width:0,height:2},elevation:2},
  notesText:{fontSize:14,color:'#1A1917',lineHeight:22},
  emptyText:{fontSize:13,color:'#A8A49E',textAlign:'center',paddingVertical:8},
  expenseRow:{flexDirection:'row',alignItems:'center',paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#F0EDE8'},
  expenseEditArea:{flex:1,flexDirection:'row',alignItems:'center'},
  expenseDesc:{fontSize:14,color:'#1A1917',fontWeight:'500'},expenseCat:{fontSize:11,color:'#A8A49E',marginTop:1},
  expenseAmount:{fontSize:14,fontWeight:'700',color:'#1A1917',marginRight:10},
  expenseRemove:{fontSize:24,lineHeight:28,color:ACCENT,fontWeight:'500',paddingVertical:6,paddingHorizontal:5},
  formTitle:{fontSize:17,fontWeight:'800',color:'#1A1917',marginBottom:14},
  label:{fontSize:13,fontWeight:'600',color:'#5C5850'},
  input:{borderWidth:1,borderColor:'#E8E4DE',borderRadius:10,padding:12,fontSize:15,color:'#1A1917',backgroundColor:'#FAFAF7'},
  inputHint:{fontSize:11,color:'#8C8880',marginTop:5},
  catChip:{paddingHorizontal:10,paddingVertical:6,borderRadius:20,borderWidth:1,borderColor:'#E8E4DE',backgroundColor:'#F5F2EE'},
  catChipActive:{backgroundColor:ACCENT,borderColor:ACCENT},
  catChipText:{fontSize:12,color:'#5C5850'},catChipTextActive:{color:'#fff',fontWeight:'600'},
  btn:{backgroundColor:ACCENT,borderRadius:10,padding:14,alignItems:'center',marginBottom:4},
  btnDisabled:{opacity:0.6},btnText:{color:'#fff',fontSize:15,fontWeight:'700'},
  assignGoalLink:{alignItems:'center',paddingVertical:10},
  assignGoalLinkText:{fontSize:12,fontWeight:'700',color:ACCENT},
  assignOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.35)',justifyContent:'center',padding:24},
  assignCard:{backgroundColor:'#fff',borderRadius:16,padding:18},
  assignHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:5},
  assignTitle:{fontSize:19,fontWeight:'800',color:'#1A1917'},
  assignHint:{fontSize:13,color:'#8C8880',marginBottom:14},
  goalPlusButton:{width:34,height:34,borderRadius:17,borderWidth:1.5,borderColor:ACCENT,backgroundColor:'#FFF2EE',alignItems:'center',justifyContent:'center'},
  goalPlusText:{fontSize:23,lineHeight:25,fontWeight:'700',color:ACCENT},
  assignChoice:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderWidth:1,borderColor:'#E8E4DE',borderRadius:10,padding:14,marginBottom:8},
  assignChoiceText:{fontSize:15,fontWeight:'600',color:'#1A1917'},
  assignCancel:{alignItems:'center',paddingTop:8},assignCancelText:{fontSize:14,fontWeight:'600',color:'#8C8880'},
  soldBadge:{backgroundColor:'#E8F5EE',borderRadius:10,padding:16,alignItems:'center'},
  soldText:{fontSize:15,fontWeight:'700',color:'#2D7A4F'},
  undoSaleButton:{backgroundColor:'#fff',borderWidth:1.5,borderColor:ACCENT,marginTop:10},
  undoSaleText:{color:ACCENT,fontSize:15,fontWeight:'700'},
  modalRoot:{flex:1,backgroundColor:'#FAFAF7'},
  generatorBackground:{flex:1},
  modalHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingTop:20,paddingBottom:8},
  modalScroll:{flex:1},
  modalScrollContent:{paddingHorizontal:20,paddingBottom:48},
  modalTitle:{fontSize:17,fontWeight:'700',color:'#1A1917'},
  modalCancel:{fontSize:15,color:'#8C8880'},
  modalShare:{fontSize:15,fontWeight:'700',color:'#C8402F'},
  mutedAction:{opacity:0.4},
  modalHint:{fontSize:12,color:'#8C8880',marginBottom:12,lineHeight:17},
  descriptionHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:10},
  descriptionLabel:{fontSize:14,fontWeight:'700',color:'#1A1917'},
  generateDescriptionButton:{borderWidth:1,borderColor:ACCENT,borderRadius:18,paddingHorizontal:12,paddingVertical:7,backgroundColor:'#FFF2EE'},
  generateDescriptionText:{fontSize:13,fontWeight:'700',color:ACCENT},
  writingRow:{flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'#FFF2EE',borderRadius:10,padding:10,marginBottom:10},
  writingText:{fontSize:13,fontWeight:'600',color:ACCENT},
  listingInput:{minHeight:180,backgroundColor:'#fff',borderRadius:12,borderWidth:1,borderColor:'#E8E4DE',padding:16,fontSize:15,color:'#1A1917',lineHeight:22},
  modalShareBtn:{backgroundColor:'#C8402F',borderRadius:12,padding:16,alignItems:'center',marginTop:16},
  modalShareBtnText:{color:'#fff',fontSize:16,fontWeight:'700'},
  secondaryModalButton:{backgroundColor:'#fff',borderWidth:1.5,borderColor:ACCENT,borderRadius:12,padding:14,alignItems:'center',marginTop:10},
  secondaryModalButtonText:{color:ACCENT,fontSize:15,fontWeight:'700'},
  generatorOverlay:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(0,0,0,0.4)',justifyContent:'flex-end',zIndex:10},
  generatorCard:{maxHeight:'85%',backgroundColor:'#fff',borderTopLeftRadius:22,borderTopRightRadius:22},
  generatorCardContent:{padding:20,paddingBottom:34},
  generatorTitle:{fontSize:20,fontWeight:'800',color:'#1A1917',textAlign:'center',marginBottom:16},
  generatorChoice:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderWidth:1,borderColor:'#E8E4DE',borderRadius:12,padding:16,marginBottom:10,backgroundColor:'#FAFAF7'},
  generatorChoiceRecommended:{borderColor:ACCENT,backgroundColor:'#FFF2EE'},
  generatorChoiceText:{fontSize:16,fontWeight:'700',color:'#1A1917'},
  recommendedText:{fontSize:11,fontWeight:'700',color:ACCENT,textTransform:'uppercase'},
  generatorCancel:{alignItems:'center',paddingVertical:12,marginTop:2},
  generatorCancelText:{fontSize:15,fontWeight:'600',color:'#8C8880'},
  previewLabel:{fontSize:12,fontWeight:'700',color:'#8C8880',textTransform:'uppercase',letterSpacing:0.5,marginTop:4,marginBottom:7},
  previewChoices:{flexDirection:'row',gap:8,marginBottom:12},
  previewChip:{flex:1,borderWidth:1,borderColor:'#E8E4DE',borderRadius:18,paddingVertical:8,paddingHorizontal:8,alignItems:'center',backgroundColor:'#fff'},
  previewChipActive:{backgroundColor:ACCENT,borderColor:ACCENT},
  previewChipText:{fontSize:12,fontWeight:'600',color:'#5C5850'},
  previewChipTextActive:{color:'#fff'},
  headerSpacer:{width:48},
})
