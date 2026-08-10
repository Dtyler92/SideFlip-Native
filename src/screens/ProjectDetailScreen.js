import { useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert, ActivityIndicator, Share, Modal, KeyboardAvoidingView, Platform } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import MultiPhotoPicker from '../components/MultiPhotoPicker'
import { roundLaborHours } from './laborModel'
import { captureEvent } from '../lib/analytics'

const ACCENT = '#C8402F'
const GREEN = '#2D7A4F'
const fmt = n => '$' + Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const getTotalInvested = p => (p.expenses||[]).reduce((s,e)=>s+Number(e.amount),0) + (Number(p.purchase_price)||0)

const EXPENSE_CATS = [
  {value:'parts',label:'Parts'},{value:'supplies',label:'Supplies'},
  {value:'labor',label:'Labor'},{value:'transport',label:'Transport'},
  {value:'fees',label:'Fees'},{value:'other',label:'Other'},
]

const EMPTY_EXPENSE = { description: '', amount: '', category: 'parts', laborHours: '' }

export default function ProjectDetailScreen({ navigation, route }) {
  const { user, isPro } = useAuth()
  const { projectId, onReturn } = route.params || {}
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [editingExpenseId, setEditingExpenseId] = useState(null)
  const [expense, setExpense] = useState(EMPTY_EXPENSE)
  const [saving, setSaving] = useState(false)
  const [generatingListing, setGeneratingListing] = useState(false)
  const [listingText, setListingText] = useState('')
  const [showListingModal, setShowListingModal] = useState(false)

  async function load() {
    const { data, error } = await supabase.from('projects').select('*, expenses(*)').eq('id', projectId).single()
    if (error) {
      Alert.alert('Could not load project', error.message)
      setLoading(false)
      return
    }
    setProject(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [projectId])

  async function handlePhotosUpdate(urls) {
    const photo = urls[0] || null
    const photos = urls
    const { error } = await supabase.from('projects').update({ photo, photos }).eq('id', projectId)
    if (error) throw new Error(`Could not save project photos: ${error.message}`)
    setProject(p => ({ ...p, photo, photos }))
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
          onReturn?.()
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

  async function generateListing() {
    captureEvent('ai_listing_requested', { project_category: project?.category, is_pro: isPro })
    if (!isPro) {
      navigation.navigate('Pro')
      return
    }
    setGeneratingListing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Please sign in again to use the AI Listing Generator.')
      const res = await fetch('https://sideflip.org/api/generate-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          title: project.title,
          category: project.category,
          expenses: project.expenses || [],
          notes: project.notes,
        })
      })
      const data = await res.json()
      if (!res.ok || !data.listing) throw new Error(data.error || 'Could not generate listing')
      captureEvent('ai_listing_succeeded', { project_category: project.category })
      setListingText(data.listing)
      setShowListingModal(true)
    } catch (err) {
      captureEvent('ai_listing_failed', { project_category: project?.category, error_type: 'generation_failed' })
      Alert.alert('Could not generate listing', err.message)
    } finally {
      setGeneratingListing(false)
    }
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
            <Text style={s.statValue}>{fmt(project.purchase_price)}</Text>
          </View>
          <View style={s.statRow}>
            <Text style={s.statLabel}>Expenses</Text>
            <Text style={s.statValue}>{fmt(totalInvested - Number(project.purchase_price||0))}</Text>
          </View>
          <View style={[s.statRow,{borderBottomWidth:0}]}>
            <Text style={[s.statLabel,{fontWeight:'700'}]}>Total Invested</Text>
            <Text style={[s.statValue,{color:ACCENT,fontWeight:'700'}]}>{fmt(totalInvested)}</Text>
          </View>
          {profit !== null && (
            <View style={[s.profitBanner, profit<0 && s.profitBannerLoss]}>
              <Text style={s.profitLabel}>{profit>=0?'Profit':'Loss'}</Text>
              <Text style={s.profitAmount}>{profit>=0?'+':''}{fmt(profit)}</Text>
            </View>
          )}
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
                  <Text style={s.expenseAmount}>{fmt(e.amount)}</Text>
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

            {/* AI Listing Generator */}
            <TouchableOpacity
              style={[s.btn, {backgroundColor:'#1A1917', marginBottom:10}, generatingListing && s.btnDisabled]}
              onPress={generateListing}
              disabled={generatingListing}
            >
              {generatingListing
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnText}>Generate Sales Listing</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={[s.btn,{backgroundColor:GREEN}]}
              onPress={() => navigation.navigate('SellProject', {projectId, project, onReturn:()=>{onReturn?.();load()}})}>
              <Text style={s.btnText}>Mark as Sold</Text>
            </TouchableOpacity>
          </>
        )}
        {project.status === 'sold' && (
          <>
            <TouchableOpacity
              style={[s.btn, {backgroundColor:'#1A1917', marginBottom:10}, generatingListing && s.btnDisabled]}
              onPress={generateListing}
              disabled={generatingListing}
            >
              {generatingListing
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnText}>Generate Sales Listing</Text>
              }
            </TouchableOpacity>
            <View style={s.soldBadge}><Text style={s.soldText}>✅ Sold for {fmt(project.sale_price)}</Text></View>
            <TouchableOpacity style={[s.btn, s.undoSaleButton, saving && s.btnDisabled]} onPress={handleUndoSale} disabled={saving}>
              {saving ? <ActivityIndicator color={ACCENT} /> : <Text style={s.undoSaleText}>Undo Sale</Text>}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Listing Editor Modal */}
      <Modal visible={showListingModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modalRoot}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setShowListingModal(false)}>
                <Text style={s.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={s.modalTitle}>FB Listing</Text>
              <TouchableOpacity onPress={() => Share.share({ message: listingText })}>
                <Text style={s.modalShare}>Share</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.modalHint}>Edit the listing below before sharing</Text>
            <TextInput
              style={s.listingInput}
              value={listingText}
              onChangeText={setListingText}
              multiline
              autoFocus
              scrollEnabled
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={s.modalShareBtn}
              onPress={() => Share.share({ message: listingText })}
            >
              <Text style={s.modalShareBtnText}>Share / Copy Listing</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
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
  soldBadge:{backgroundColor:'#E8F5EE',borderRadius:10,padding:16,alignItems:'center'},
  soldText:{fontSize:15,fontWeight:'700',color:'#2D7A4F'},
  undoSaleButton:{backgroundColor:'#fff',borderWidth:1.5,borderColor:ACCENT,marginTop:10},
  undoSaleText:{color:ACCENT,fontSize:15,fontWeight:'700'},
  modalRoot:{flex:1,backgroundColor:'#FAFAF7',padding:20},
  modalHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:8,paddingTop:8},
  modalTitle:{fontSize:17,fontWeight:'700',color:'#1A1917'},
  modalCancel:{fontSize:15,color:'#8C8880'},
  modalShare:{fontSize:15,fontWeight:'700',color:'#C8402F'},
  modalHint:{fontSize:12,color:'#A8A49E',marginBottom:12},
  listingInput:{flex:1,backgroundColor:'#fff',borderRadius:12,borderWidth:1,borderColor:'#E8E4DE',padding:16,fontSize:15,color:'#1A1917',lineHeight:22},
  modalShareBtn:{backgroundColor:'#C8402F',borderRadius:12,padding:16,alignItems:'center',marginTop:16},
  modalShareBtnText:{color:'#fff',fontSize:16,fontWeight:'700'},
})
