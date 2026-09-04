function throwIfError(result) {
  if (result.error) throw result.error
  return result.data
}

export function createMyStuffMaintenanceApi(client) {
  return {
    async completeLegacySchedule(values) {
      return throwIfError(await client.rpc('complete_my_stuff_maintenance', {
        p_schedule_id: values.scheduleId,
        p_completed_at: values.completedAt,
        p_reading: values.reading,
        p_cost: values.cost,
        p_notes: values.notes,
        p_mutation_id: values.mutationId,
      }))
    },

    async deleteLegacySchedule(scheduleId, userId) {
      return throwIfError(await client
        .from('my_stuff_schedules')
        .delete()
        .eq('id', scheduleId)
        .eq('user_id', userId))
    },

    async createDefinition(wirePayload, mutationId) {
      return throwIfError(await client.rpc('create_my_stuff_maintenance_definition_v2', {
        ...wirePayload,
        p_mutation_id: mutationId,
      }))
    },

    async updateDefinition(wirePayload, mutationId) {
      return throwIfError(await client.rpc('update_my_stuff_maintenance_definition_v2', {
        ...wirePayload,
        p_mutation_id: mutationId,
      }))
    },

    async recordReading(wirePayload, mutationId) {
      return throwIfError(await client.rpc('record_my_stuff_reading_v2', {
        ...wirePayload,
        p_mutation_id: mutationId,
      }))
    },

    async recordServiceOccurrence(wirePayload, mutationId) {
      return throwIfError(await client.rpc('record_my_stuff_service_occurrence_v2', {
        ...wirePayload,
        p_mutation_id: mutationId,
      }))
    },

    async getDueState(itemId, asOf = new Date().toISOString()) {
      const data = throwIfError(await client.rpc('get_my_stuff_due_state_v2', {
        p_item_id: itemId,
        p_as_of: asOf,
      }))
      return data || []
    },
  }
}
