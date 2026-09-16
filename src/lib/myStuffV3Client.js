import { normalizeExpenseRows } from '../domain/myStuff/v3Model.js'

function rpcData(result) {
  if (result.error) throw result.error
  return result.data
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== '' && entry != null))
}

function vehicleIdentityPayload(identity = {}) {
  return compactObject({
    model_year: identity.year ?? identity.model_year,
    manufacturer: identity.manufacturer,
    make: identity.make,
    model: identity.model,
    trim: identity.trim,
    engine_model: identity.engineModel ?? identity.engine_model,
    engine_displacement_liters: identity.engineDisplacementLiters ?? identity.engine_displacement_liters,
    engine_cylinders: identity.engineCylinders ?? identity.engine_cylinders,
    transmission: identity.transmission,
    drivetrain: identity.drivetrain,
    fuel_power_type: identity.fuelType ?? identity.fuel_power_type,
    vehicle_type: identity.vehicleType ?? identity.vehicle_type,
    body_style: identity.bodyStyle ?? identity.body_style,
    plant_name: identity.plantName ?? identity.plant_name,
    plant_country: identity.plantCountry ?? identity.plant_country,
    vehicle_market: identity.vehicleMarket ?? identity.vehicle_market,
    vin_decoder_source: identity.vinDecoderSource ?? identity.vin_decoder_source,
    vin_decoder_version: identity.vinDecoderVersion ?? identity.vin_decoder_version,
  })
}

function transferOptionsPayload(options = {}) {
  return compactObject({
    project_disposition: options.projectDisposition ?? options.project_disposition,
    current_mileage: options.currentMileage ?? options.current_mileage,
    current_hours: options.currentHours ?? options.current_hours,
    current_cycles: options.currentCycles ?? options.current_cycles,
    usage_dimensions: options.usageDimensions ?? options.usage_dimensions,
    service_expense_ids: options.serviceExpenseIds ?? options.service_expense_ids ?? [],
  })
}

export function createMyStuffV3Client(database) {
  const call = async (name, payload) => rpcData(await database.rpc(name, payload))
  return {
    createExpense: (itemId, expense, mutationId) => call('create_my_stuff_expense_v3', { p_item_id:itemId, p_expense:expense, p_mutation_id:mutationId }),
    reviseExpense: (expenseId, patch, reason, mutationId) => call('revise_my_stuff_expense_v3', { p_expense_id:expenseId, p_patch:patch, p_reason:reason, p_mutation_id:mutationId }),
    voidExpense: (expenseId, reason, mutationId) => call('void_my_stuff_expense_v3', { p_expense_id:expenseId, p_reason:reason, p_mutation_id:mutationId }),
    getExpenses: async itemId => normalizeExpenseRows((await call('get_my_stuff_expenses_v3', { p_item_id:itemId })) || []),
    getFinancialSummary: itemId => call('get_my_stuff_financial_summary_v3', { p_item_id:itemId }),
    listScheduleGroups: itemId => call('list_my_stuff_schedule_groups_v3', { p_item_id:itemId }),
    getDueViews: (itemId, asOf = new Date().toISOString()) => call('get_my_stuff_due_views_v3', { p_item_id:itemId, p_as_of:asOf }),
    recordServiceWithExpense: ({ itemId, plannedOccurrenceId=null, definitionId=null, service, expense=null, mutationId }) => call('record_my_stuff_service_with_expense_v3', {
      p_item_id:itemId, p_planned_occurrence_id:plannedOccurrenceId, p_definition_id:definitionId,
      p_service:service, p_expense:expense, p_mutation_id:mutationId,
    }),
    reviseServiceExpense: ({ occurrenceId, expenseId, servicePatch, expensePatch, reason, mutationId }) => call('revise_my_stuff_service_expense_v3', {
      p_occurrence_id:occurrenceId, p_expense_id:expenseId, p_service_patch:servicePatch,
      p_expense_patch:expensePatch, p_reason:reason, p_mutation_id:mutationId,
    }),
    transitionOccurrenceStatus: (occurrenceId, status, reason, mutationId) => call('transition_my_stuff_occurrence_status_v3', {
      p_occurrence_id:occurrenceId, p_status:status, p_reason:reason, p_mutation_id:mutationId,
    }),
    confirmVehicleIdentity: (itemId, identity, mutationId) => call('confirm_my_stuff_vehicle_identity_v3', { p_item_id:itemId, p_identity:vehicleIdentityPayload(identity), p_mutation_id:mutationId }),

    transferProject: (projectId, options, mutationId) => call('transfer_project_to_my_stuff_v3', { p_project_id:projectId, p_options:transferOptionsPayload(options), p_mutation_id:mutationId }),
    transferItemToProject: (itemId, mutationId) => call('transfer_my_stuff_to_project_v1', { p_item_id:itemId, p_mutation_id:mutationId }),
  }
}
