import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  calculateGoalSummary,
  canCreateAnotherGoal,
  createMutationId,
  projectInvested,
} from './tradeUpGoalModel'

const ACCENT = '#C8402F'
const GREEN = '#2D7A4F'
const EMPTY_FORM = {
  name: '',
  goalType: 'item',
  targetItem: '',
  targetAmount: '',
  startingAmount: '',
  description: '',
}

export default function TradeUpGoalsScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const { user, formatMoney, plan } = useAuth()
  const [goals, setGoals] = useState([])
  const [projects, setProjects] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [mutationId, setMutationId] = useState(createMutationId)
  const [adjustmentType, setAdjustmentType] = useState('personal_contribution')
  const [adjustmentAmount, setAdjustmentAmount] = useState('')
  const [adjustmentNote, setAdjustmentNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!user?.id) return
    if (!quiet) setLoading(true)
    setErrorMessage('')
    try {
      const [goalResult, projectResult] = await Promise.all([
        supabase
          .from('trade_up_goals')
          .select('*, goal_ledger(*)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('projects')
          .select('id,title,status,purchase_price,sale_price,goal_id,expenses(amount)')
          .eq('user_id', user.id),
      ])
      if (goalResult.error) throw goalResult.error
      if (projectResult.error) throw projectResult.error
      setGoals(goalResult.data || [])
      setProjects(projectResult.data || [])
    } catch (error) {
      setErrorMessage(error.message || 'Could not load Trade-Up Goals.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user?.id])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const selected = goals.find(goal => goal.id === selectedId)
  const canCreate = canCreateAnotherGoal(plan, goals)

  function updateForm(key, value) {
    setForm(current => ({ ...current, [key]: value }))
  }

  async function createGoal() {
    const name = form.name.trim()
    const targetAmount = Number(form.targetAmount || 0)
    const startingAmount = Number(form.startingAmount || 0)
    if (!canCreate) return Alert.alert('SideFlip Pro', 'Free includes one active Trade-Up Goal. Upgrade in the App Store to track additional active goals.', [
      { text: 'Not Now', style: 'cancel' },
      { text: 'View Pro', onPress: () => navigation.navigate('Pro') },
    ])
    if (!name) return Alert.alert('Goal name required', 'Give your Trade-Up Goal a name.')
    if (form.goalType === 'item' && !form.targetItem.trim()) return Alert.alert('Target item required', 'Enter the item you are working toward.')
    if (form.goalType === 'amount' && targetAmount <= 0) return Alert.alert('Target amount required', 'Enter an amount greater than zero.')
    if (targetAmount < 0 || startingAmount < 0) return Alert.alert('Check amounts', 'Goal amounts cannot be negative.')

    setSaving(true)
    try {
      const { data: goalId, error } = await supabase.rpc('create_trade_up_goal', {
        p_name: name,
        p_goal_type: form.goalType,
        p_target_item: form.goalType === 'item' ? form.targetItem.trim() : null,
        p_target_amount: targetAmount,
        p_description: form.description.trim() || null,
        p_starting_amount: startingAmount,
        p_mutation_id: mutationId,
      })
      if (error) throw error
      setForm(EMPTY_FORM)
      setMutationId(createMutationId())
      setShowCreate(false)
      await load({ quiet: true })
      setSelectedId(goalId)
    } catch (error) {
      Alert.alert('Could not create goal', error.message || 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function saveStatus(status) {
    if (!selected || saving) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('trade_up_goals')
        .update({ status, completed_at: status === 'completed' ? new Date().toISOString() : null })
        .eq('id', selected.id)
        .eq('user_id', user.id)
      if (error) throw error
      await load({ quiet: true })
    } catch (error) {
      Alert.alert('Could not update goal', error.message || 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function confirmStatus(status) {
    const completing = status === 'completed'
    Alert.alert(
      completing ? 'Complete this goal?' : 'Reopen this goal?',
      completing ? 'You can still view its history after marking it complete.' : 'This will make the goal active again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: completing ? 'Mark Complete' : 'Reopen', onPress: () => saveStatus(status) },
      ],
    )
  }

  async function adjustBalance() {
    if (!selected || saving) return
    const amount = Number(adjustmentAmount)
    const summary = calculateGoalSummary(selected, projects)
    if (amount <= 0) return Alert.alert('Enter an amount', 'The adjustment must be greater than zero.')
    if (adjustmentType === 'cash_out' && amount > summary.available) return Alert.alert('Amount too high', `You currently have ${formatMoney(summary.available)} available toward this goal.`)

    setSaving(true)
    try {
      const { error } = await supabase.rpc('adjust_trade_up_goal', {
        p_goal_id: selected.id,
        p_type: adjustmentType,
        p_amount: amount,
        p_note: adjustmentNote.trim() || null,
        p_mutation_id: createMutationId(),
      })
      if (error) throw error
      setAdjustmentAmount('')
      setAdjustmentNote('')
      await load({ quiet: true })
    } catch (error) {
      Alert.alert('Could not update amount', error.message || 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteGoal() {
    if (!selected || saving) return
    setSaving(true)
    try {
      const { error } = await supabase.rpc('delete_trade_up_goal', { p_goal_id: selected.id })
      if (error) throw error
      setSelectedId(null)
      await load({ quiet: true })
    } catch (error) {
      Alert.alert('Could not delete goal', error.message || 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function confirmDelete() {
    Alert.alert('Delete this goal?', 'Linked projects will remain in SideFlip but will no longer belong to this goal.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete Goal', style: 'destructive', onPress: deleteGoal },
    ])
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={ACCENT} /></View>

  if (selected) {
    const summary = calculateGoalSummary(selected, projects)
    const linkedProjects = projects.filter(project => project.goal_id === selected.id)
    const activeGoal = selected.status === 'active'
    return (
      <ScrollView
        style={s.root}
        contentContainerStyle={[s.content, { paddingTop: insets.top + 12 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load({ quiet: true }) }} tintColor={ACCENT} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.detailHeader}>
          <TouchableOpacity style={s.backButton} onPress={() => setSelectedId(null)}><Text style={s.backText}>‹</Text></TouchableOpacity>
          <Text style={s.detailTitle} numberOfLines={2}>{selected.name}</Text>
        </View>

        <View style={s.card}>
          <View style={s.rowBetween}>
            <View style={s.flex}>
              <Text style={s.eyebrow}>{selected.goal_type === 'item' ? 'Target item' : 'Target amount'}</Text>
              <Text style={s.target}>{selected.goal_type === 'item' ? selected.target_item : formatMoney(selected.target_amount)}</Text>
              {selected.goal_type === 'item' && Number(selected.target_amount) > 0 && <Text style={s.muted}>Estimated target: {formatMoney(selected.target_amount)}</Text>}
            </View>
            <StatusPill status={selected.status} />
          </View>
          {Number(selected.target_amount) > 0 && <Progress summary={summary} target={selected.target_amount} formatMoney={formatMoney} />}
          {!!selected.description && <Text style={s.description}>{selected.description}</Text>}
          <Text style={s.disclaimer}>SideFlip tracks these amounts for your records. SideFlip does not hold, transfer, or process money.</Text>
        </View>

        <View style={s.statGrid}>
          <Stat label="Available" value={formatMoney(summary.available)} />
          <Stat label="Active items" value={formatMoney(summary.activeValue)} />
          <Stat label="Current progress" value={formatMoney(summary.progressValue)} />
          <Stat label="Completed steps" value={String(summary.soldCount)} />
        </View>

        {activeGoal && <View style={s.card}>
          <Text style={s.sectionTitle}>Update available amount</Text>
          <Text style={s.muted}>Track personal money added or money you have taken out.</Text>
          <View style={s.choiceRow}>
            <Choice label="Add Money" selected={adjustmentType === 'personal_contribution'} onPress={() => setAdjustmentType('personal_contribution')} />
            <Choice label="Take Out" selected={adjustmentType === 'cash_out'} onPress={() => setAdjustmentType('cash_out')} />
          </View>
          <Field label="Amount">
            <TextInput style={s.input} value={adjustmentAmount} onChangeText={setAdjustmentAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#A8A49E" />
          </Field>
          <Field label="Note (optional)">
            <TextInput style={s.input} value={adjustmentNote} onChangeText={setAdjustmentNote} placeholder="What changed?" placeholderTextColor="#A8A49E" maxLength={160} />
          </Field>
          <PrimaryButton disabled={saving} label={saving ? 'Saving…' : adjustmentType === 'cash_out' ? 'Take Money Out' : 'Add to Goal'} onPress={adjustBalance} />
        </View>}

        <Text style={s.listHeading}>Linked projects ({linkedProjects.length})</Text>
        {linkedProjects.length === 0
          ? <Text style={s.emptyInline}>No projects are linked to this goal yet.</Text>
          : linkedProjects.map(project => (
            <TouchableOpacity key={project.id} style={s.projectRow} onPress={() => navigation.navigate('ProjectDetail', { projectId: project.id, onReturn: () => load({ quiet: true }) })}>
              <View style={s.flex}><Text style={s.projectTitle}>{project.title}</Text><Text style={s.muted}>{formatMoney(projectInvested(project))} invested · {project.status}</Text></View>
            </TouchableOpacity>
          ))}

        <TouchableOpacity style={s.completeButton} disabled={saving} onPress={() => confirmStatus(activeGoal ? 'completed' : 'active')}>
          <Text style={s.completeText}>{activeGoal ? 'Mark Goal Complete' : 'Reopen Goal'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.deleteButton} disabled={saving} onPress={confirmDelete}><Text style={s.deleteText}>Delete Goal</Text></TouchableOpacity>
      </ScrollView>
    )
  }

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 18 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load({ quiet: true }) }} tintColor={ACCENT} />}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={s.heading}>Trade-Up Goals</Text>
      <Text style={s.subheading}>Connect your flips and track each step toward a specific item or dollar amount.</Text>

      {!!errorMessage && <View style={s.errorCard}><Text style={s.errorText}>{errorMessage}</Text><TouchableOpacity onPress={() => load()}><Text style={s.retryText}>Try Again</Text></TouchableOpacity></View>}

      {goals.length === 0 && <View style={s.hero}><Text style={s.heroIcon}>🎯</Text><Text style={s.heroTitle}>Start with what you have.</Text><Text style={s.heroText}>Free includes one active goal. Complete it, then start your next trade-up journey.</Text></View>}

      {canCreate
        ? <PrimaryButton label={showCreate ? 'Cancel' : '+ Create a Goal'} onPress={() => setShowCreate(value => !value)} secondary={showCreate} />
        : <View style={s.proCard}>
            <Text style={s.proEyebrow}>SIDEFLIP PRO</Text>
            <Text style={s.proTitle}>Free includes one active goal.</Text>
            <Text style={s.muted}>Upgrade with Apple in the app to track additional goals at the same time.</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Pro')}><Text style={s.proLink}>View SideFlip Pro</Text></TouchableOpacity>
          </View>}

      {showCreate && canCreate && <View style={s.card}>
        <Text style={s.sectionTitle}>New Trade-Up Goal</Text>
        <Field label="Goal name">
          <TextInput style={s.input} value={form.name} onChangeText={value => updateForm('name', value)} placeholder="Trade up to my dream truck" placeholderTextColor="#A8A49E" maxLength={120} />
        </Field>
        <Field label="Goal type">
          <View style={s.choiceRow}>
            <Choice label="Specific Item" selected={form.goalType === 'item'} onPress={() => updateForm('goalType', 'item')} />
            <Choice label="Dollar Amount" selected={form.goalType === 'amount'} onPress={() => updateForm('goalType', 'amount')} />
          </View>
        </Field>
        {form.goalType === 'item' && <Field label="Item you want">
          <TextInput style={s.input} value={form.targetItem} onChangeText={value => updateForm('targetItem', value)} placeholder="Ford F-250" placeholderTextColor="#A8A49E" />
        </Field>}
        <Field label={form.goalType === 'item' ? 'Estimated target value (optional)' : 'Target amount'}>
          <TextInput style={s.input} value={form.targetAmount} onChangeText={value => updateForm('targetAmount', value)} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#A8A49E" />
        </Field>
        <Field label="Starting amount (optional)">
          <TextInput style={s.input} value={form.startingAmount} onChangeText={value => updateForm('startingAmount', value)} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#A8A49E" />
        </Field>
        <Field label="Notes (optional)">
          <TextInput style={[s.input, s.textArea]} value={form.description} onChangeText={value => updateForm('description', value)} placeholder="Why this goal matters…" placeholderTextColor="#A8A49E" multiline maxLength={500} />
        </Field>
        <PrimaryButton disabled={saving} label={saving ? 'Creating…' : 'Create Trade-Up Goal'} onPress={createGoal} />
      </View>}

      <Text style={s.listHeading}>Your goals</Text>
      {goals.length === 0
        ? <View style={s.empty}><Text style={s.emptyTitle}>No Trade-Up Goals yet</Text><Text style={s.muted}>Create your first goal to begin tracking progress.</Text></View>
        : goals.map(goal => {
          const summary = calculateGoalSummary(goal, projects)
          return <TouchableOpacity key={goal.id} style={s.goalCard} onPress={() => setSelectedId(goal.id)}>
            <View style={s.rowBetween}>
              <View style={s.flex}><Text style={s.eyebrow}>{goal.goal_type === 'item' ? goal.target_item : 'Amount goal'}</Text><Text style={s.goalName}>{goal.name}</Text></View>
              <StatusPill status={goal.status} />
            </View>
            {Number(goal.target_amount) > 0 && <Progress summary={summary} target={goal.target_amount} formatMoney={formatMoney} compact />}
            <Text style={s.goalMeta}>{summary.activeCount} active item{summary.activeCount === 1 ? '' : 's'} · {summary.soldCount} completed step{summary.soldCount === 1 ? '' : 's'}</Text>
          </TouchableOpacity>
        })}
    </ScrollView>
  )
}

function Field({ label, children }) {
  return <View style={s.field}><Text style={s.label}>{label}</Text>{children}</View>
}

function Choice({ label, selected, onPress }) {
  return <TouchableOpacity style={[s.choice, selected && s.choiceSelected]} onPress={onPress}><Text style={[s.choiceText, selected && s.choiceTextSelected]}>{label}</Text></TouchableOpacity>
}

function PrimaryButton({ label, onPress, disabled, secondary }) {
  return <TouchableOpacity style={[s.primaryButton, secondary && s.secondaryButton, disabled && s.disabled]} onPress={onPress} disabled={disabled}><Text style={[s.primaryText, secondary && s.secondaryText]}>{label}</Text></TouchableOpacity>
}

function StatusPill({ status }) {
  const completed = status === 'completed'
  return <View style={[s.status, completed && s.statusCompleted]}><Text style={[s.statusText, completed && s.statusTextCompleted]}>{status}</Text></View>
}

function Progress({ summary, target, formatMoney, compact }) {
  return <View style={compact ? s.progressCompact : s.progressBlock}>
    <View style={s.progressTrack}><View style={[s.progressFill, { width: `${summary.progressPercent}%` }]} /></View>
    <View style={s.rowBetween}><Text style={s.progressText}>{formatMoney(summary.progressValue)} of {formatMoney(target)}</Text><Text style={s.progressPercent}>{summary.progressPercent}%</Text></View>
  </View>
}

function Stat({ label, value }) {
  return <View style={s.stat}><Text style={s.eyebrow}>{label}</Text><Text style={s.statValue}>{value}</Text></View>
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAF7' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAFAF7' },
  content: { paddingHorizontal: 18, paddingBottom: 120 },
  heading: { fontSize: 30, fontWeight: '800', color: '#1A1917' },
  subheading: { color: '#6F6A62', lineHeight: 20, marginTop: 6, marginBottom: 18 },
  hero: { backgroundColor: '#1A1917', borderRadius: 16, padding: 20, marginBottom: 14 },
  heroIcon: { fontSize: 28, marginBottom: 10 },
  heroTitle: { color: '#fff', fontSize: 21, fontWeight: '800', marginBottom: 6 },
  heroText: { color: '#D4CDC1', lineHeight: 20 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginTop: 14, marginBottom: 8, borderWidth: 1, borderColor: '#E8E4DE' },
  goalCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#E8E4DE' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  flex: { flex: 1 },
  eyebrow: { fontSize: 10, color: '#8C8880', textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: '700', marginBottom: 4 },
  goalName: { color: '#1A1917', fontSize: 18, fontWeight: '800' },
  goalMeta: { color: '#8C8880', fontSize: 12, marginTop: 10 },
  status: { borderRadius: 999, backgroundColor: '#FDF1EF', paddingHorizontal: 9, paddingVertical: 5 },
  statusCompleted: { backgroundColor: '#E8F5EE' },
  statusText: { color: ACCENT, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  statusTextCompleted: { color: GREEN },
  progressBlock: { marginTop: 18 },
  progressCompact: { marginTop: 14 },
  progressTrack: { height: 8, backgroundColor: '#EEEAE3', borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: ACCENT, borderRadius: 999 },
  progressText: { color: '#8C8880', fontSize: 12, marginTop: 6 },
  progressPercent: { color: '#5C5850', fontSize: 12, fontWeight: '700', marginTop: 6 },
  primaryButton: { backgroundColor: ACCENT, borderRadius: 12, padding: 15, alignItems: 'center', marginBottom: 8 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryButton: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: ACCENT },
  secondaryText: { color: ACCENT },
  disabled: { opacity: 0.55 },
  field: { marginTop: 14 },
  label: { color: '#5C5850', fontSize: 12, fontWeight: '700', marginBottom: 7 },
  input: { backgroundColor: '#FAFAF7', borderWidth: 1, borderColor: '#DED9D0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: '#1A1917' },
  textArea: { minHeight: 82, textAlignVertical: 'top' },
  choiceRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  choice: { flex: 1, borderWidth: 1, borderColor: '#DED9D0', borderRadius: 10, paddingVertical: 11, alignItems: 'center', backgroundColor: '#FAFAF7' },
  choiceSelected: { borderColor: ACCENT, borderWidth: 2, backgroundColor: '#FDF1EF' },
  choiceText: { color: '#6F6A62', fontSize: 13, fontWeight: '700' },
  choiceTextSelected: { color: ACCENT },
  sectionTitle: { color: '#1A1917', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  listHeading: { color: '#1A1917', fontSize: 16, fontWeight: '800', marginTop: 22, marginBottom: 10 },
  empty: { alignItems: 'center', padding: 24 },
  emptyTitle: { color: '#1A1917', fontSize: 16, fontWeight: '700', marginBottom: 5 },
  emptyInline: { color: '#8C8880', paddingVertical: 12 },
  muted: { color: '#8C8880', fontSize: 13, lineHeight: 19 },
  proCard: { backgroundColor: '#FDF1EF', borderRadius: 14, padding: 16, marginBottom: 8 },
  proEyebrow: { color: ACCENT, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 6 },
  proTitle: { color: '#1A1917', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  proLink: { color: ACCENT, fontSize: 14, fontWeight: '800', marginTop: 10 },
  errorCard: { backgroundColor: '#FDECEA', borderRadius: 12, padding: 14, marginBottom: 14 },
  errorText: { color: '#8D241B', lineHeight: 18 },
  retryText: { color: ACCENT, fontWeight: '800', marginTop: 8 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  backText: { color: ACCENT, fontSize: 34, lineHeight: 36, marginTop: -3 },
  detailTitle: { flex: 1, color: '#1A1917', fontSize: 25, fontWeight: '800' },
  target: { color: '#1A1917', fontSize: 20, fontWeight: '800', marginBottom: 3 },
  description: { color: '#5C5850', lineHeight: 20, marginTop: 14 },
  disclaimer: { color: '#8C8880', fontSize: 11, lineHeight: 16, marginTop: 14 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  stat: { width: '48.5%', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E8E4DE', borderRadius: 12, padding: 13 },
  statValue: { color: '#1A1917', fontSize: 16, fontWeight: '800' },
  projectRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#E8E4DE' },
  projectTitle: { color: '#1A1917', fontSize: 15, fontWeight: '700', marginBottom: 3 },
  chevron: { color: '#D4CDC1', fontSize: 24 },
  completeButton: { backgroundColor: GREEN, borderRadius: 12, alignItems: 'center', padding: 15, marginTop: 22 },
  completeText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  deleteButton: { alignItems: 'center', padding: 16, marginTop: 6 },
  deleteText: { color: ACCENT, fontWeight: '700' },
})
