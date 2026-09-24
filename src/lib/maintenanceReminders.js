import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Crypto from 'expo-crypto'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { buildMaintenanceReminderValues } from './maintenanceReminderModel'
import { createMaintenanceReminderRuntime } from './maintenanceReminderRuntime'

const deriveDigest = value => Crypto.digestStringAsync(
  Crypto.CryptoDigestAlgorithm.SHA256,
  value,
  { encoding: Crypto.CryptoEncoding.HEX },
)

const maintenanceReminderRuntime = createMaintenanceReminderRuntime({
  notifications: Notifications,
  platform: Platform.OS,
  storage: AsyncStorage,
  deriveDigest,
})

// Call only from an explicit user opt-in action.
export function requestMaintenanceReminderPermission() {
  return maintenanceReminderRuntime.requestMaintenanceReminderPermission()
}

export function getMaintenanceReminderStatus() {
  return maintenanceReminderRuntime.getMaintenanceReminderStatus()
}

export async function syncMaintenanceReminders({ definitions = [], dueStates = [], item = {} } = {}) {
  const dueByDefinition = new Map(dueStates.map(value => [value.definition_id,value]))
  const results = []
  for (const definition of definitions) {
    results.push(await maintenanceReminderRuntime.updateMaintenanceReminder(
      buildMaintenanceReminderValues(definition,dueByDefinition.get(definition.id),item),
    ))
  }
  return results
}

export function createMaintenanceReminder(values) {
  return maintenanceReminderRuntime.createMaintenanceReminder(values)
}

export function updateMaintenanceReminder(values) {
  return maintenanceReminderRuntime.updateMaintenanceReminder(values)
}

export function cancelMaintenanceReminder(scheduleId) {
  return maintenanceReminderRuntime.cancelMaintenanceReminder(scheduleId)
}
