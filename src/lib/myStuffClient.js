import { supabase } from './supabase'

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
