import { useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert, ActivityIndicator, Share, Modal, KeyboardAvoidingView, Platform } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import MultiPhotoPicker from '../components/MultiPhotoPicker'

const ACCENT = '#C8402F'
const GREEN = '#2D7A4F'
const fmt = n => '$' + Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const getTotalInvested = p => (p.expenses||[]).reduce((s,e)=>s+Number(e.amount),0) + (Number(p.purchase_price)||0)

const EXPENSE_CATS = [
  {value:'parts',label:'🔩 Parts'},{value:'supplies',label:'🧰 Supplies'},
  {value:'labor',label:'👷 Labor'},{value:'transport',label:'🚚 Transport'},
  {value:'fees',label:'💳 Fees'},{value:'other',label:'📦 Other'},
]

export default function ProjectDetailScreen({ navigation, route }) {
  const { user } = useAuth()
  const { projectId, onReturn } = route.params || {}
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [expense, setExpense] = useState({ description: '', amount: '', category: 'parts' })
  const [saving, setSaving] = useState(false)
  const [generatingListing, setGeneratingListing] = useState(false)
  const [listingText, setListingText] = useState('')
  const [showListingModal, setShowListingModal] = useState(false)
  const [photos, setPhotos] = useState([])

  async function load() {
    const { data } = await supabase.from('projects').select('*, expenses(*)').eq('id', projectId).single()
    setProject(data)
    setPhotos((data?.photos?.length > 0) ? data.photos : (data?.photo ? [data.photo] : []))
    setLoading(false)
  }

  useEffect(() => { load() }, [projectId])

  async function handlePhotosUpdate(urls) {
    const photo = urls[0] || null
    const { error } = await supabase.from('projects').update({ photo, photos: urls }).eq('id', projectId)
    if (error) {
      await supabase.from('projects').update({ photo }).eq('id', projectId)
    }
    setProject(p => ({ ...p, photo, photos: urls }))
    setPhotos(urls)
  }

  async function handleAddExpense() {
    if (!expense.description.trim() || !expense.amount) return Alert.alert('Fill in description and amount')
    setSaving(true)
    await supabase.from('expenses').insert({
      project_id: projectId, user_id: user.id,
      description: expense.description.trim(),
      amount: Number(expense.amount),
      category: expense.category,
    })
    setExpense({ description: '', amount: '', category: 'parts' })
    setShowAddExpense(false)
    setSaving(false)
    load()
  }

  async function handleDeleteExpense(id) {
    Alert.alert('Remove expense?', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        await supabase.from('expenses').delete().eq('id', id)
        load()
      }}
    ])
  }

  async function handleDelete() {
    Alert.alert(`Delete "${project?.title}"?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await supabase.from('projects').delete().eq('id', projectId)
        onReturn?.()
        navigation.goBack()
      }}
    ])
  }

  async function handleUndoSold() {
    Alert.alert('Undo Sale', 'Move this project back to active?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Undo Sale', style: 'destructive', onPress: async () => {
        await supabase.from('projects').update({ sale_price: null, sold_at: null, status: 'active' }).eq('id', projectId)
        onReturn?.()
        load()
      }}
    ])
  }

  async function generateListing() {
    setGeneratingListing(true)
    try {
      const res = await fetch('https://sideflip.org/api/generate-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: project.title,
          category: project.category,
          expenses: project.expenses || [],
          notes: project.notes,
        })
      })
      const data = await res.json()
      if (!res.ok || !data.listing) throw new Error(data.error || 'Could not generate listing')
      setListingText(data.listing)
      setShowListingModal(true)
    } catch (err) {
      Alert.alert('Could not generate listing', err.message)
    } finally {
      setGeneratingListing(false)
    }
  }

  if (loading) return <View style={{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:'#FAFAF7'}}><ActivityIndicator color={ACCENT} /></View>
  if (!project) return <View style={{flex:1,padding:24}}><Text>Project not found.</Text></View>

  const totalInvested = getTotalInvested(project)
  const profit = project.sale_price ? Number(project.sale_price) - totalInvested : null

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

      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
      <ScrollView contentContainerStyle={s.content}>
        {/* Multi Photo */}
        <MultiPhotoPicker userId={user.id} photos={photos} onUpdate={handlePhotosUpdate} />

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

        {/* Vehicle Info */}
        {project.vin && (
          <>
            <Text style={s.sectionTitle}>Vehicle Info</Text>
            <View style={s.card}>
              {(project.vehicle_year || project.vehicle_make || project.vehicle_model) && (
                <Text style={[s.notesText, {fontWeight:'700', marginBottom:4}]}>
                  {project.vehicle_year} {project.vehicle_make} {project.vehicle_model}
                </Text>
              )}
              <Text style={[s.notesText, {color:'#8C8880', fontSize:13}]}>VIN: {project.vin}</Text>
            </View>
          </>
        )}

        {/* Expenses */}
        <Text style={s.sectionTitle}>Expenses ({project.expenses?.length || 0})</Text>
        <View style={s.card}>
          {(!project.expenses || project.expenses.length === 0) ? (
            <Text style={s.emptyText}>No expenses yet</Text>
          ) : (
            project.expenses.map(e => (
              <TouchableOpacity key={e.id} style={s.expenseRow} onPress={() => handleDeleteExpense(e.id)}>
                <View style={{flex:1}}>
                  <Text style={s.expenseDesc}>{e.description}</Text>
                  <Text style={s.expenseCat}>{e.category}</Text>
                </View>
                <Text style={s.expenseAmount}>{fmt(e.amount)}</Text>
                <Text style={s.expenseDelete}>🗑</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Add expense form */}
        {showAddExpense && (
          <View style={s.card}>
            <Text style={[s.label,{marginBottom:6}]}>Description</Text>
            <TextInput style={s.input} placeholder="e.g. Carburetor" placeholderTextColor="#A8A49E"
              value={expense.description} onChangeText={v => setExpense(e=>({...e,description:v}))} autoFocus />
            <Text style={[s.label,{marginTop:12,marginBottom:6}]}>Amount</Text>
            <TextInput style={s.input} placeholder="0.00" placeholderTextColor="#A8A49E"
              value={expense.amount} onChangeText={v => setExpense(e=>({...e,amount:v}))} keyboardType="decimal-pad" />
            <View style={{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:12}}>
              {EXPENSE_CATS.map(c => (
                <TouchableOpacity key={c.value} onPress={() => setExpense(e=>({...e,category:c.value}))}
                  style={[s.catChip, expense.category===c.value && s.catChipActive]}>
                  <Text style={[s.catChipText, expense.category===c.value && s.catChipTextActive]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{flexDirection:'row',gap:8,marginTop:16}}>
              <TouchableOpacity style={[s.btn,{flex:1,backgroundColor:'#F0EDE8'}]} onPress={() => setShowAddExpense(false)}>
                <Text style={[s.btnText,{color:'#5C5850'}]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn,{flex:1},saving&&s.btnDisabled]} onPress={handleAddExpense} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>Add</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Actions */}
        {project.status === 'active' && (
          <>
            {!showAddExpense && (
              <TouchableOpacity style={[s.btn,{backgroundColor:'#F0EDE8',marginBottom:10}]} onPress={() => setShowAddExpense(true)}>
                <Text style={[s.btnText,{color:'#1A1917'}]}>+ Add Expense</Text>
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
                : <Text style={s.btnText}>Generate FB Listing</Text>
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
                : <Text style={s.btnText}>Generate FB Listing</Text>
              }
            </TouchableOpacity>
            <View style={s.soldBadge}><Text style={s.soldText}>✅ Sold for {fmt(project.sale_price)}</Text></View>
            <TouchableOpacity style={s.undoBtn} onPress={handleUndoSold}>
              <Text style={s.undoText}>Undo Sale</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

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
                <Text style={s.modalShare}>Share ↗</Text>
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
              <Text style={s.modalShareBtnText}>📋 Share / Copy Listing</Text>
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
  expenseDesc:{fontSize:14,color:'#1A1917',fontWeight:'500'},expenseCat:{fontSize:11,color:'#A8A49E',marginTop:1},
  expenseAmount:{fontSize:14,fontWeight:'700',color:'#1A1917',marginRight:8},
  expenseDelete:{fontSize:16,color:'#A8A49E'},
  label:{fontSize:13,fontWeight:'600',color:'#5C5850'},
  input:{borderWidth:1,borderColor:'#E8E4DE',borderRadius:10,padding:12,fontSize:15,color:'#1A1917',backgroundColor:'#FAFAF7'},
  catChip:{paddingHorizontal:10,paddingVertical:6,borderRadius:20,borderWidth:1,borderColor:'#E8E4DE',backgroundColor:'#F5F2EE'},
  catChipActive:{backgroundColor:ACCENT,borderColor:ACCENT},
  catChipText:{fontSize:12,color:'#5C5850'},catChipTextActive:{color:'#fff',fontWeight:'600'},
  btn:{backgroundColor:ACCENT,borderRadius:10,padding:14,alignItems:'center',marginBottom:4},
  btnDisabled:{opacity:0.6},btnText:{color:'#fff',fontSize:15,fontWeight:'700'},
  soldBadge:{backgroundColor:'#E8F5EE',borderRadius:10,padding:16,alignItems:'center'},
  soldText:{fontSize:15,fontWeight:'700',color:'#2D7A4F'},
  undoBtn:{alignItems:'center',paddingVertical:10},
  undoText:{fontSize:13,color:'#A8A49E',fontWeight:'600',textDecorationLine:'underline'},
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
