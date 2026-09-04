import { supabase } from './supabase'
import { adaptSqlItem } from './myStuffAdapters'

export async function listMyStuffItems(userId) {
  const { data, error } = await supabase
    .from('my_stuff_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

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
  const { error } = await supabase
    .from('my_stuff_schedules')
    .delete()
    .eq('id', scheduleId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function completeMyStuffMaintenance(values) {
  const { data, error } = await supabase.rpc('complete_my_stuff_maintenance', {
    p_schedule_id: values.scheduleId,
    p_completed_at: values.completedAt,
    p_reading: values.reading,
    p_cost: values.cost,
    p_notes: values.notes,
    p_mutation_id: values.mutationId,
  })
  if (error) throw error
  return data
}

export async function listMyStuffItemsV2(userId, { includeArchived = true } = {}) {
  let query = supabase
    .from('my_stuff_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (!includeArchived) query = query.is('archived_at', null)
  const { data, error } = await query
  if (error) throw error
  return (data || []).map(adaptSqlItem)
}

export async function getMyStuffItemV2(itemId, userId, { asOf = new Date().toISOString() } = {}) {
  const [itemResult, readingsResult, definitionsResult, occurrencesResult, dueResult] = await Promise.all([
    supabase.from('my_stuff_items').select('*').eq('user_id', userId).eq('id', itemId).single(),
    // The correction RPC defines "latest" by append order, not business date.
    supabase.from('my_stuff_readings').select('*').eq('user_id', userId).eq('item_id', itemId).order('created_at', { ascending: false }).order('id', { ascending: false }),
    supabase.from('my_stuff_maintenance_definitions').select('*').eq('user_id', userId).eq('item_id', itemId).order('created_at', { ascending: true }),
    supabase.from('my_stuff_service_occurrences').select('*').eq('user_id', userId).eq('item_id', itemId).order('completed_at', { ascending: false }),
    supabase.rpc('get_my_stuff_due_state_v2', { p_item_id: itemId, p_as_of: asOf }),
  ])
  for (const result of [itemResult, readingsResult, definitionsResult, occurrencesResult, dueResult]) {
    if (result.error) throw result.error
  }
  return {
    item: adaptSqlItem(itemResult.data),
    readings: readingsResult.data || [],
    definitions: definitionsResult.data || [],
    occurrences: occurrencesResult.data || [],
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
  const { data, error } = await supabase.rpc('record_my_stuff_reading_v2', {
    ...wirePayload,
    p_mutation_id: mutationId,
  })
  if (error) throw error
  return data
}

export async function getMyStuffDueStateV2(itemId, asOf = new Date().toISOString()) {
  const { data, error } = await supabase.rpc('get_my_stuff_due_state_v2', {
    p_item_id: itemId,
    p_as_of: asOf,
  })
  if (error) throw error
  return data || []
}
