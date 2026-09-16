import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Crypto from 'expo-crypto'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
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

export function createMaintenanceReminder(values) {
  return maintenanceReminderRuntime.createMaintenanceReminder(values)
}

export function updateMaintenanceReminder(values) {
  return maintenanceReminderRuntime.updateMaintenanceReminder(values)
}

export function cancelMaintenanceReminder(scheduleId) {
  return maintenanceReminderRuntime.cancelMaintenanceReminder(scheduleId)
}
