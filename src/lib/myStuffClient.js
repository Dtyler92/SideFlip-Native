import { supabase } from './supabase'
import { adaptSqlItem } from './myStuffAdapters'
import { createMyStuffMaintenanceApi } from './myStuffMaintenanceApi'
import { createMyStuffV3Client } from './myStuffV3Client'
import { excludeTransferredItems } from '../domain/myStuff/transferVisibility'

const maintenanceApi = createMyStuffMaintenanceApi(supabase)

export async function listMyStuffItems(userId) {
  const { data, error } = await supabase
    .from('my_stuff_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// Kept for released V1 call-site compatibility. New detail screens reuse the
// V2 item payload and call getMyStuffLegacyMaintenance to avoid a duplicate
// item query.
export async function getMyStuffItem(itemId, userId) {
  const [itemResult, schedulesResult, logsResult] = await Promise.all([
    supabase.from('my_stuff_items').select('*').eq('id', itemId).eq('user_id', userId).single(),
    supabase.from('my_stuff_schedules').select('*').eq('item_id', itemId).eq('user_id', userId).order('created_at', { ascending: true }),
    supabase.from('my_stuff_service_logs').select('*').eq('item_id', itemId).eq('user_id', userId).order('completed_at', { ascending: false }),
  ])
  if (itemResult.error) throw itemResult.error
  if (schedulesResult.error) throw schedulesResult.error
  if (logsResult.error) throw logsResult.error
  return { item: itemResult.data, schedules: schedulesResult.data || [], logs: logsResult.data || [] }
}

export async function getMyStuffLegacyMaintenance(itemId, userId) {
  const [schedulesResult, logsResult] = await Promise.all([
    supabase.from('my_stuff_schedules').select('*').eq('item_id', itemId).eq('user_id', userId).order('created_at', { ascending: true }),
    supabase.from('my_stuff_service_logs').select('*').eq('item_id', itemId).eq('user_id', userId).order('completed_at', { ascending: false }),
  ])
  if (schedulesResult.error) throw schedulesResult.error
  if (logsResult.error) throw logsResult.error
  return { schedules: schedulesResult.data || [], logs: logsResult.data || [] }
}

export async function createMyStuffItem(values) {
  const { data, error } = await supabase.rpc('create_my_stuff_item', {
    p_name: values.name,
    p_category: values.category,
    p_acquired_on: values.acquiredOn,
    p_notes: values.notes,
    p_current_mileage: values.currentMileage,
    p_current_hours: values.currentHours,
    p_mutation_id: values.mutationId,
  })
  if (error) throw error
  return data
}

export async function updateMyStuffItem(itemId, userId, values) {
  const { data, error } = await supabase
    .from('my_stuff_items')
    .update(values)
    .eq('id', itemId)
    .eq('user_id', userId)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteMyStuffItem(itemId, userId) {
  const { error } = await supabase
    .from('my_stuff_items')
    .delete()
    .eq('id', itemId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function createMyStuffSchedule(values) {
  const { data, error } = await supabase.rpc('create_my_stuff_schedule', {
    p_item_id: values.itemId,
    p_name: values.name,
    p_tracking_type: values.trackingType,
    p_interval_value: values.intervalValue,
    p_last_completed_at: values.lastCompletedAt,
    p_last_completed_value: values.lastCompletedValue,
    p_mutation_id: values.mutationId,
  })
  if (error) throw error
  return data
}

export async function deleteMyStuffSchedule(scheduleId, userId) {
  return maintenanceApi.deleteLegacySchedule(scheduleId, userId)
}

export async function completeMyStuffMaintenance(values) {
  return maintenanceApi.completeLegacySchedule(values)
}

export async function listMyStuffItemsV2(userId, { includeArchived = true, excludeTransferred = false } = {}) {
  let query = supabase
    .from('my_stuff_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (!includeArchived) query = query.is('archived_at', null)
  const [itemResult, transferResult] = await Promise.all([
    query,
    excludeTransferred
      ? supabase.from('my_stuff_to_project_transfers').select('item_id').eq('user_id', userId)
      : Promise.resolve({ data:[], error:null }),
  ])
  const { data, error } = itemResult
  if (error) throw error
  if (transferResult.error) throw transferResult.error
  return excludeTransferredItems(data || [], transferResult.data || []).map(adaptSqlItem)
}

export async function getMyStuffItemV2(itemId, userId, { asOf = new Date().toISOString() } = {}) {
  const [itemResult, readingsResult, definitionsResult, occurrencesResult, revisionsResult, dueResult] = await Promise.all([
    supabase.from('my_stuff_items').select('*').eq('user_id', userId).eq('id', itemId).single(),
    // The correction RPC defines "latest" by append order, not business date.
    supabase.from('my_stuff_readings').select('*').eq('user_id', userId).eq('item_id', itemId).order('created_at', { ascending: false }).order('id', { ascending: false }),
    supabase.from('my_stuff_maintenance_definitions').select('*').eq('user_id', userId).eq('item_id', itemId).order('created_at', { ascending: true }),
    supabase.from('my_stuff_service_occurrences').select('*').eq('user_id', userId).eq('item_id', itemId).order('completed_at', { ascending: false }),
    supabase.from('my_stuff_service_occurrence_revisions').select('*').eq('user_id', userId).eq('item_id', itemId).order('revision_number', { ascending: false }),
    supabase.rpc('get_my_stuff_due_state_v2', { p_item_id: itemId, p_as_of: asOf }),
  ])
  for (const result of [itemResult, readingsResult, definitionsResult, occurrencesResult, revisionsResult, dueResult]) {
    if (result.error) throw result.error
  }
  const latestRevisionByOccurrence = new Map()
  for (const revision of revisionsResult.data || []) {
    if (!latestRevisionByOccurrence.has(revision.occurrence_id)) latestRevisionByOccurrence.set(revision.occurrence_id, revision)
  }
  return {
    item: adaptSqlItem(itemResult.data),
    readings: readingsResult.data || [],
    definitions: definitionsResult.data || [],
    occurrences: (occurrencesResult.data || []).map(occurrence => ({
      ...occurrence,
      latest_revision: latestRevisionByOccurrence.get(occurrence.id) || null,
    })),
    dueStates: dueResult.data || [],
  }
}

export async function createMyStuffItemV2(wirePayload, mutationId) {
  const { data, error } = await supabase.rpc('create_my_stuff_item_v2', {
    ...wirePayload,
    p_mutation_id: mutationId,
  })
  if (error) throw error
  return data
}

export async function updateMyStuffItemV2(wirePayload, mutationId) {
  const { data, error } = await supabase.rpc('update_my_stuff_item_v2', {
    ...wirePayload,
    p_mutation_id: mutationId,
  })
  if (error) throw error
  return data
}

export async function setMyStuffItemArchivedV2(values) {
  const { data, error } = await supabase.rpc('set_my_stuff_item_archived_v2', {
    p_item_id: values.itemId,
    p_archived: values.archived,
    p_reason: values.reason || null,
    p_mutation_id: values.mutationId,
  })
  if (error) throw error
  return data
}

export async function recordMyStuffReadingV2(wirePayload, mutationId) {
  return maintenanceApi.recordReading(wirePayload, mutationId)
}

export async function getMyStuffDueStateV2(itemId, asOf = new Date().toISOString()) {
  return maintenanceApi.getDueState(itemId, asOf)
}

export async function createMyStuffMaintenanceDefinitionV2(wirePayload, mutationId) {
  return maintenanceApi.createDefinition(wirePayload, mutationId)
}

export async function updateMyStuffMaintenanceDefinitionV2(wirePayload, mutationId) {
  return maintenanceApi.updateDefinition(wirePayload, mutationId)
}

export async function recordMyStuffServiceOccurrenceV2(wirePayload, mutationId) {
  return maintenanceApi.recordServiceOccurrence(wirePayload, mutationId)
}

const v3Api = createMyStuffV3Client(supabase)

export const createMyStuffExpenseV3 = (...args) => v3Api.createExpense(...args)
export const reviseMyStuffExpenseV3 = (...args) => v3Api.reviseExpense(...args)
export const voidMyStuffExpenseV3 = (...args) => v3Api.voidExpense(...args)
export const getMyStuffExpensesV3 = (...args) => v3Api.getExpenses(...args)
export const getMyStuffFinancialSummaryV3 = (...args) => v3Api.getFinancialSummary(...args)
export const listMyStuffScheduleGroupsV3 = (...args) => v3Api.listScheduleGroups(...args)
export const getMyStuffDueViewsV3 = (...args) => v3Api.getDueViews(...args)
export const recordMyStuffServiceWithExpenseV3 = (...args) => v3Api.recordServiceWithExpense(...args)
export const reviseMyStuffServiceExpenseV3 = (...args) => v3Api.reviseServiceExpense(...args)
export const setMyStuffOccurrenceStatusV3 = (...args) => v3Api.transitionOccurrenceStatus(...args)
export const confirmMyStuffVehicleIdentityV3 = (...args) => v3Api.confirmVehicleIdentity(...args)

export const transferProjectToMyStuffV3 = (...args) => v3Api.transferProject(...args)
export const transferMyStuffToProjectV1 = (...args) => v3Api.transferItemToProject(...args)
