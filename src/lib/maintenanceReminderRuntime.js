import {
  buildMaintenanceReminderRequest,
  maintenanceReminderId,
} from './maintenanceReminderModel.js'

export const MAINTENANCE_REMINDER_CHANNEL_ID = 'maintenance-reminders'
export const MAINTENANCE_REMINDER_OPT_IN_KEY = '@sideflip/maintenance-reminders/opt-in-v1'
const OPTED_IN = 'granted'
const OPTED_OUT = 'denied'

export function createMaintenanceReminderRuntime({
  notifications,
  platform = 'ios',
  storage,
  deriveDigest,
} = {}) {
  // A denial in this process blocks scheduling even if persisting it fails.
  let locallyBlocked = false

  async function persistOptIn(value) {
    if (!storage?.setItem) return false
    try {
      await storage.setItem(MAINTENANCE_REMINDER_OPT_IN_KEY, value)
      return true
    } catch {
      return false
    }
  }

  async function denyOptIn() {
    locallyBlocked = true
    await persistOptIn(OPTED_OUT)
  }

  async function requestMaintenanceReminderPermission() {
    try {
      if (!notifications?.requestPermissionsAsync || !storage?.setItem) {
        await denyOptIn()
        return { status: 'unavailable' }
      }
      if (platform === 'android') {
        if (!notifications.setNotificationChannelAsync) {
          await denyOptIn()
          return { status: 'unavailable' }
        }
        await notifications.setNotificationChannelAsync(MAINTENANCE_REMINDER_CHANNEL_ID, {
          name: 'Maintenance reminders',
          importance: notifications.AndroidImportance?.DEFAULT ?? 3,
        })
      }

      const permission = await notifications.requestPermissionsAsync()
      if (!permission?.granted) {
        await denyOptIn()
        return { status: 'denied' }
      }
      if (!await persistOptIn(OPTED_IN)) {
        locallyBlocked = true
        return { status: 'unavailable' }
      }
      locallyBlocked = false
      return { status: 'granted' }
    } catch {
      await denyOptIn()
      return { status: 'unavailable' }
    }
  }

  async function hasMaintenanceOptIn() {
    if (locallyBlocked) return { status: 'not-opted-in' }
    if (!storage?.getItem) return { status: 'unavailable' }
    try {
      const value = await storage.getItem(MAINTENANCE_REMINDER_OPT_IN_KEY)
      return { status: value === OPTED_IN ? 'opted-in' : 'not-opted-in' }
    } catch {
      return { status: 'unavailable' }
    }
  }

  async function cancelMaintenanceReminder(scheduleId) {
    const reminderId = await maintenanceReminderId(scheduleId, deriveDigest)
    if (!reminderId) return { status: 'invalid' }
    try {
      if (!notifications?.cancelScheduledNotificationAsync) return { status: 'unavailable', reminderId }
      await notifications.cancelScheduledNotificationAsync(reminderId)
      return { status: 'cancelled', reminderId }
    } catch {
      return { status: 'unavailable', reminderId }
    }
  }

  async function syncMaintenanceReminder(values = {}) {
    const reminderId = await maintenanceReminderId(values.schedule?.id, deriveDigest)
    if (!reminderId) return { status: 'invalid' }

    const cancelled = await cancelMaintenanceReminder(values.schedule.id)
    if (cancelled.status !== 'cancelled') return cancelled

    const request = await buildMaintenanceReminderRequest({
      ...values,
      platform,
      channelId: MAINTENANCE_REMINDER_CHANNEL_ID,
      deriveDigest,
    })
    if (!request) return cancelled

    const optIn = await hasMaintenanceOptIn()
    if (optIn.status === 'unavailable') return { status: 'unavailable', reminderId }
    if (optIn.status !== 'opted-in') return { status: 'consent-required', reminderId }

    try {
      if (!notifications?.getPermissionsAsync || !notifications?.scheduleNotificationAsync) {
        return { status: 'unavailable', reminderId }
      }
      const permission = await notifications.getPermissionsAsync()
      if (!permission?.granted) {
        await denyOptIn()
        return { status: 'permission-denied', reminderId }
      }
      await notifications.scheduleNotificationAsync(request)
      return { status: 'scheduled', reminderId }
    } catch {
      return { status: 'unavailable', reminderId }
    }
  }

  return {
    requestMaintenanceReminderPermission,
    createMaintenanceReminder: syncMaintenanceReminder,
    updateMaintenanceReminder: syncMaintenanceReminder,
    cancelMaintenanceReminder,
  }
}
