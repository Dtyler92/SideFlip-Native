import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  buildMaintenanceReminderRequest,
  maintenanceReminderId,
} from '../src/lib/maintenanceReminderModel.js'
import {
  createMaintenanceReminderRuntime,
  MAINTENANCE_REMINDER_OPT_IN_KEY,
} from '../src/lib/maintenanceReminderRuntime.js'

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')
const deriveDigest = value => Promise.resolve(createHash('sha256').update(value).digest('hex'))
const requestFor = values => buildMaintenanceReminderRequest({ ...values, deriveDigest })

const calendarSchedule = {
  id: 'schedule-42',
  enabled: true,
  tracking_type: 'calendar',
  next_due_at: '2026-09-10T00:00:00Z',
}

function notificationDouble(overrides = {}) {
  const calls = []
  return {
    calls,
    adapter: {
      async setNotificationChannelAsync(...args) { calls.push(['channel', ...args]) },
      async requestPermissionsAsync(...args) { calls.push(['request', ...args]); return { granted: true, status: 'granted' } },
      async getPermissionsAsync(...args) { calls.push(['get', ...args]); return { granted: true, status: 'granted' } },
      async scheduleNotificationAsync(...args) { calls.push(['schedule', ...args]); return args[0].identifier },
      async cancelScheduledNotificationAsync(...args) { calls.push(['cancel', ...args]) },
      ...overrides,
    },
  }
}

function storageDouble(initial = {}) {
  const values = new Map(Object.entries(initial))
  const calls = []
  return {
    calls,
    values,
    adapter: {
      async getItem(key) { calls.push(['get', key]); return values.get(key) ?? null },
      async setItem(key, value) { calls.push(['set', key, value]); values.set(key, value) },
      async removeItem(key) { calls.push(['remove', key]); values.delete(key) },
    },
  }
}

function runtimeFor({ notificationOverrides, platform = 'ios', storage = storageDouble() } = {}) {
  const notifications = notificationDouble(notificationOverrides)
  const runtime = createMaintenanceReminderRuntime({
    notifications: notifications.adapter,
    platform,
    storage: storage.adapter,
    deriveDigest,
  })
  return { runtime, notifications, storage }
}

async function grantMaintenanceConsent(runtime) {
  assert.deepEqual(await runtime.requestMaintenanceReminderPermission(), { status: 'granted' })
}

test('maintenance reminder IDs are deterministic, opaque, fixed-length, and safe for arbitrary long IDs', async () => {
  const raw = 'schedule-42'
  const first = await maintenanceReminderId(raw, deriveDigest)
  assert.equal(first, await maintenanceReminderId(raw, deriveDigest))
  assert.notEqual(first, await maintenanceReminderId('schedule-43', deriveDigest))
  assert.match(first, /^my-stuff-maintenance:[a-f0-9]{64}$/)
  assert.equal(first.length, 85)
  assert.equal(first.includes(raw), false)

  const privateLongId = `customer@example.com:${'秘密/vehicle-VIN-123/'.repeat(100_000)}`
  const longResult = await maintenanceReminderId(privateLongId, deriveDigest)
  assert.match(longResult, /^my-stuff-maintenance:[a-f0-9]{64}$/)
  assert.equal(longResult.length, 85)
  assert.equal(longResult.includes('customer@example.com'), false)
  assert.equal(await maintenanceReminderId('', deriveDigest), null)
  assert.equal(await maintenanceReminderId('valid', async () => 'not-a-sha256'), null)
})

test('calendar reminders use local 9 AM and generic private content', async () => {
  const request = await requestFor({
    schedule: {
      ...calendarSchedule,
      name: 'Oil change VIN 1M8GDM9AXKP042788',
      notes: 'Registration ABC-123; cost $999; serial SECRET',
      cost: 999,
    },
    item: {
      name: 'Tyler’s truck', vin: '1M8GDM9AXKP042788', serial_number: 'SECRET',
      registration: 'ABC-123', notes: 'private free text',
    },
    now: new Date(2026, 8, 3, 12),
    platform: 'android',
    channelId: 'maintenance-reminders',
  })

  assert.match(request.identifier, /^my-stuff-maintenance:[a-f0-9]{64}$/)
  assert.equal(request.identifier.includes(calendarSchedule.id), false)
  assert.equal(request.content.title, 'Maintenance reminder')
  assert.equal(request.content.body, 'A maintenance task is due in My Stuff.')
  assert.deepEqual(request.content.data, { type: 'my-stuff-maintenance' })
  assert.equal(request.trigger.type, 'date')
  assert.equal(request.trigger.channelId, 'maintenance-reminders')
  assert.deepEqual(request.trigger.date, new Date(2026, 8, 10, 9))
  const serialized = JSON.stringify(request)
  for (const unsafe of ['Oil change', '1M8GDM9AXKP042788', 'ABC-123', '$999', 'SECRET', 'Tyler', 'private free text', 'schedule-42']) {
    assert.equal(serialized.includes(unsafe), false)
  }
})

test('Android immediate mileage, hours, and overdue calendar triggers carry the maintenance channel', async () => {
  const cases = [
    { schedule: { id: 'mileage', enabled: true, tracking_type: 'mileage', next_due_value: 12000 }, item: { current_mileage: 12000 } },
    { schedule: { id: 'hours', enabled: true, tracking_type: 'hours', next_due_value: 250 }, item: { current_hours: 251 } },
    { schedule: { ...calendarSchedule, id: 'overdue', next_due_at: '2026-09-01' }, item: {} },
  ]
  for (const values of cases) {
    const request = await requestFor({ ...values, now: new Date(2026, 8, 3, 12), platform: 'android', channelId: 'maintenance-reminders' })
    assert.deepEqual(request.trigger, { channelId: 'maintenance-reminders' })
  }
  const ios = await requestFor({ ...cases[0], platform: 'ios' })
  assert.equal(ios.trigger, null)
})

test('reading reminders only become immediate when the reading reaches its due value', async () => {
  const schedule = { id: 'reading-1', enabled: true, tracking_type: 'mileage', next_due_value: 12000 }
  assert.equal(await requestFor({ schedule, item: { current_mileage: 11999 } }), null)
  assert.equal((await requestFor({ schedule, item: { current_mileage: 12000 } })).trigger, null)
})

test('disabled, deleted, malformed, and incomplete schedules produce no reminder', async () => {
  assert.equal(await requestFor({ schedule: { ...calendarSchedule, enabled: false } }), null)
  assert.equal(await requestFor({ schedule: { ...calendarSchedule, deleted_at: '2026-09-03T00:00:00Z' } }), null)
  assert.equal(await requestFor({ schedule: { ...calendarSchedule, id: '' } }), null)
  assert.equal(await requestFor({ schedule: { ...calendarSchedule, next_due_at: 'not-a-date' } }), null)
  assert.equal(await requestFor({ schedule: { id: 'reading', enabled: true, tracking_type: 'mileage', next_due_value: 100 }, item: {} }), null)
})

test('explicit permission persists maintenance-specific opt-in after Android channel setup', async () => {
  const { runtime, notifications, storage } = runtimeFor({ platform: 'android' })
  assert.deepEqual(notifications.calls, [])
  await grantMaintenanceConsent(runtime)
  assert.equal(notifications.calls[0][0], 'channel')
  assert.equal(notifications.calls[0][1], 'maintenance-reminders')
  assert.equal(notifications.calls[1][0], 'request')
  assert.equal(storage.values.get(MAINTENANCE_REMINDER_OPT_IN_KEY), 'granted')
})

test('OS permission granted for another feature cannot schedule without maintenance opt-in', async () => {
  const { runtime, notifications } = runtimeFor()
  const result = await runtime.createMaintenanceReminder({ schedule: calendarSchedule })
  assert.equal(result.status, 'consent-required')
  assert.equal(notifications.calls.some(call => call[0] === 'schedule'), false)
})

test('persisted maintenance opt-in permits create and update without re-requesting permission', async () => {
  const storage = storageDouble({ [MAINTENANCE_REMINDER_OPT_IN_KEY]: 'granted' })
  const { runtime, notifications } = runtimeFor({ platform: 'android', storage })
  const created = await runtime.createMaintenanceReminder({ schedule: calendarSchedule, now: new Date(2026, 8, 3, 12) })
  const updated = await runtime.updateMaintenanceReminder({ schedule: { ...calendarSchedule, next_due_at: '2026-09-12' }, now: new Date(2026, 8, 3, 12) })
  assert.equal(created.status, 'scheduled')
  assert.deepEqual(updated, created)
  assert.equal(created.reminderId.includes(calendarSchedule.id), false)
  assert.equal(notifications.calls.filter(call => call[0] === 'request').length, 0)
  const schedules = notifications.calls.filter(call => call[0] === 'schedule')
  assert.equal(schedules.length, 2)
  assert.equal(schedules[0][1].identifier, schedules[1][1].identifier)
})

test('permission denial, OS revocation, and storage failure fail closed', async () => {
  const deniedStorage = storageDouble({ [MAINTENANCE_REMINDER_OPT_IN_KEY]: 'granted' })
  const denied = runtimeFor({ storage: deniedStorage, notificationOverrides: {
    async requestPermissionsAsync() { return { granted: false, status: 'denied' } },
  } })
  assert.deepEqual(await denied.runtime.requestMaintenanceReminderPermission(), { status: 'denied' })
  assert.equal(deniedStorage.values.get(MAINTENANCE_REMINDER_OPT_IN_KEY), 'denied')
  assert.equal((await denied.runtime.createMaintenanceReminder({ schedule: calendarSchedule })).status, 'consent-required')

  const revokedStorage = storageDouble({ [MAINTENANCE_REMINDER_OPT_IN_KEY]: 'granted' })
  const revoked = runtimeFor({ storage: revokedStorage, notificationOverrides: {
    async getPermissionsAsync() { return { granted: false, status: 'denied' } },
  } })
  assert.equal((await revoked.runtime.createMaintenanceReminder({ schedule: calendarSchedule })).status, 'permission-denied')
  assert.equal(revokedStorage.values.get(MAINTENANCE_REMINDER_OPT_IN_KEY), 'denied')
  assert.equal(revoked.notifications.calls.some(call => call[0] === 'schedule'), false)

  const brokenStorage = storageDouble()
  brokenStorage.adapter.getItem = async () => { throw new Error('storage unavailable') }
  const broken = runtimeFor({ storage: brokenStorage })
  assert.equal((await broken.runtime.createMaintenanceReminder({ schedule: calendarSchedule })).status, 'unavailable')
  assert.equal(broken.notifications.calls.some(call => call[0] === 'schedule'), false)
})

test('cancellation remains deterministic and does not require consent', async () => {
  const { runtime } = runtimeFor()
  const first = await runtime.cancelMaintenanceReminder('schedule-42')
  const second = await runtime.cancelMaintenanceReminder('schedule-42')
  assert.equal(first.status, 'cancelled')
  assert.deepEqual(second, first)
  assert.match(first.reminderId, /^my-stuff-maintenance:[a-f0-9]{64}$/)
  assert.equal(first.reminderId.includes('schedule-42'), false)
  assert.deepEqual(await runtime.cancelMaintenanceReminder(''), { status: 'invalid' })
})

test('Expo dependencies are SDK-pinned and native adapter injects crypto and persistence', () => {
  const pkg = JSON.parse(source('package.json'))
  const app = JSON.parse(source('app.json'))
  const adapter = source('src/lib/maintenanceReminders.js')
  const startup = [source('index.js'), source('App.js')].join('\n')

  assert.match(pkg.dependencies['expo-notifications'], /^~0\.32\./)
  assert.match(pkg.dependencies['expo-crypto'], /^~15\./)
  assert.equal(pkg.dependencies['@react-native-async-storage/async-storage'], '2.2.0')
  assert.ok(app.expo.plugins.some(plugin => plugin === 'expo-notifications'))
  assert.match(adapter, /CryptoDigestAlgorithm\.SHA256/)
  assert.match(adapter, /AsyncStorage/)
  assert.doesNotMatch(startup, /requestMaintenanceReminderPermission|requestPermissionsAsync|setNotificationChannelAsync/)
})
