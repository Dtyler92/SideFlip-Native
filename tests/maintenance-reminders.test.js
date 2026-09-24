import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  buildMaintenanceReminderRequest,
  classifyMaintenanceReminder,
  maintenanceReminderId,
} from '../src/lib/maintenanceReminderModel.js'
import {
  createMaintenanceReminderRuntime,
  MAINTENANCE_REMINDER_OPT_IN_KEY,
} from '../src/lib/maintenanceReminderRuntime.js'
import { synchronizeMaintenanceReminders, visibleMaintenanceReminders } from '../src/lib/maintenanceReminderListModel.js'
import {
  buildV2MaintenanceReminderSchedules,
  listedMaintenanceReminders,
} from '../src/lib/maintenanceReminderProjection.js'
import { addCommonMaintenancePresets } from '../src/lib/commonMaintenancePresetWorkflow.js'

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
  assert.equal((await requestFor({ schedule, item: { currentUsage: { miles: 12000 } } })).trigger, null)
})

test('in-app reminder list is local, deduplicated, and prioritizes overdue schedules', () => {
  const schedules = [
    { id:'due', name:'Due today', enabled:true, tracking_type:'calendar', next_due_at:'2026-09-08' },
    { id:'future', name:'Later', enabled:true, tracking_type:'calendar', next_due_at:'2026-09-10' },
    { id:'overdue', name:'Past due', enabled:true, tracking_type:'mileage', next_due_value:100 },
    { id:'due', name:'Duplicate', enabled:true, tracking_type:'calendar', next_due_at:'2026-09-08' },
  ]
  assert.deepEqual(visibleMaintenanceReminders(schedules,{measurements:['miles'],currentUsage:{miles:101}},new Date(2026,8,8,12)).map(row=>[row.id,row.dueState]),[
    ['overdue','overdue'],['due','due'],
  ])
})

test('schedule synchronization cancels removed IDs and updates each current ID once', async () => {
  const calls=[]
  const runtime={
    cancelMaintenanceReminder:async id=>{calls.push(['cancel',id]);return {status:'cancelled'}},
    updateMaintenanceReminder:async values=>{calls.push(['update',values.schedule.id]);return {status:'scheduled'}},
  }
  const result=await synchronizeMaintenanceReminders({
    schedules:[calendarSchedule,{...calendarSchedule},{...calendarSchedule,id:'next'}],
    previousScheduleIds:['removed','schedule-42'],item:{id:'item-private'},runtime,
  })
  assert.deepEqual(result.scheduleIds,['schedule-42','next'])
  assert.deepEqual(calls,[['cancel','removed'],['update','schedule-42'],['update','next']])
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

test('maintenance UI mounts the native reminder panel without requesting permission on mount', () => {
  const detail = source('src/screens/MyStuffDetailScreen.js')
  const panel = source('src/components/MaintenanceReminderPanel.js')
  assert.match(detail,/import MaintenanceReminderPanel/)
  assert.match(detail,/<MaintenanceReminderPanel schedules=\{reminderSchedules\} item=\{item\}/)
  assert.match(detail,/setReminderDueStates\(result\.dueStates\)/)
  assert.match(detail,/definitions,dueStates:reminderDueStates,plannedOccurrences/)
  assert.match(panel,/Enable local reminders/)
  assert.match(panel,/Due and overdue items always appear here/)
  assert.match(panel,/visibleMaintenanceReminders/)
  assert.doesNotMatch(panel,/listedMaintenanceReminders/)
  assert.match(panel,/generic private wording/)
  assert.doesNotMatch(panel,/useEffect\([^]*requestMaintenanceReminderPermission/)
  const permissionCall=panel.indexOf('requestMaintenanceReminderPermission()')
  const explicitHandler=panel.indexOf('async function enableLocalReminders()')
  assert.ok(explicitHandler>=0&&permissionCall>explicitHandler)
})

test('V2 reminder projection uses authoritative due state and never invents a due value', () => {
  const definitions = [
    { id:'oil',name:'Oil and filter change',enabled:true,due_semantics:'whichever_first',active_profile:'severe',normal_interval_miles:5000,severe_interval_miles:3000,normal_calendar_months:6 },
    { id:'all',name:'Inspect everything',enabled:true,due_semantics:'all',normal_interval_miles:1000,normal_calendar_months:12 },
    { id:'unknown',name:'No calculated due',enabled:true,normal_interval_miles:5000 },
    { id:'archived',name:'Old task',enabled:false,normal_calendar_months:6 },
  ]
  const dueStates = [
    { definition_id:'oil',next_due_at:'2026-10-01T00:00:00Z',next_due_mileage:13000,next_due_hours:null,next_due_cycles:null,due_status:'due_now' },
    { definition_id:'all',next_due_at:'2027-01-01T00:00:00Z',next_due_mileage:9000,next_due_hours:null,next_due_cycles:null,due_status:'upcoming' },
    { definition_id:'unknown',next_due_at:null,next_due_mileage:null,next_due_hours:null,next_due_cycles:null,due_status:'overdue' },
    { definition_id:'archived',next_due_at:'2026-09-01T00:00:00Z',due_status:'overdue' },
  ]
  const item = { measurements:['miles'],currentUsage:{miles:14000} }
  const rows = buildV2MaintenanceReminderSchedules({ definitions,dueStates,item })

  assert.deepEqual(rows.map(row=>row.id),['oil','all'])
  assert.deepEqual(rows[0],{
    id:'oil',definition_id:'oil',name:'Oil and filter change',enabled:true,
    due_semantics:'whichever_first',due_status:'due_now',next_due_at:'2026-10-01T00:00:00Z',
    next_due_mileage:13000,next_due_hours:null,next_due_cycles:null,required_axes:['miles','calendar'],planned_occurrence_id:null,
  })
  assert.equal(rows[0].next_due_value,undefined)
  assert.equal(rows[0].tracking_type,undefined)
  assert.equal(classifyMaintenanceReminder(rows[0],item,new Date(2026,8,8,12)),'due')
  assert.equal(classifyMaintenanceReminder(rows[1],item,new Date(2026,8,8,12)),'upcoming','authoritative all-axis semantics win over one exceeded meter')
})

test('all-axis semantics do not schedule a future calendar alert before every axis is due', async () => {
  const item={measurements:['miles'],currentUsage:{miles:1500}}
  const schedule={
    id:'all-axes',enabled:true,due_semantics:'all',due_status:'upcoming',
    required_axes:['miles','calendar'],
    next_due_at:'2026-10-01',next_due_mileage:1000,next_due_hours:null,next_due_cycles:null,
  }
  assert.equal(await requestFor({schedule,item,now:new Date(2026,8,8,12)}),null)
  assert.equal((await requestFor({schedule:{...schedule,due_status:'due_now'},item,now:new Date(2026,8,8,12)})).trigger,null)
})

test('multi-axis all fails closed when authoritative due state only has a calendar value', async () => {
  const item={measurements:['miles','hours','cycles'],currentUsage:{miles:1200,hours:120,cycles:12}}
  const [schedule]=buildV2MaintenanceReminderSchedules({
    definitions:[{
      id:'all-partial',name:'All axes',enabled:true,due_semantics:'all',
      normal_interval_miles:1000,normal_interval_hours:100,normal_interval_cycles:10,normal_calendar_months:12,
    }],
    dueStates:[{definition_id:'all-partial',next_due_at:'2026-09-08',due_status:'due_now'}],
    item,
  })
  assert.deepEqual(schedule.required_axes,['miles','hours','cycles','calendar'])
  assert.equal(classifyMaintenanceReminder(schedule,item,new Date(2026,8,8,12)),'unknown')
  assert.equal(await requestFor({schedule,item,now:new Date(2026,8,8,12)}),null)
})

test('multi-axis all only notifies with complete concrete axes and an authoritative all-axis due status', async () => {
  const item={measurements:['miles','hours','cycles'],currentUsage:{miles:1200,hours:120,cycles:12}}
  const base={
    id:'all-complete',enabled:true,due_semantics:'all',required_axes:['miles','hours','cycles','calendar'],
    next_due_at:'2026-10-01',next_due_mileage:1000,next_due_hours:100,next_due_cycles:10,
  }
  const upcoming={...base,due_status:'upcoming'}
  const due={...base,due_status:'due_now'}
  const overdue={...base,due_status:'overdue'}
  assert.equal(classifyMaintenanceReminder(upcoming,item,new Date(2026,8,8,12)),'upcoming')
  assert.equal(await requestFor({schedule:upcoming,item,now:new Date(2026,8,8,12)}),null)
  assert.equal((await requestFor({schedule:due,item,now:new Date(2026,8,8,12)})).trigger,null)
  assert.equal((await requestFor({schedule:overdue,item,now:new Date(2026,8,8,12)})).trigger,null)
})

test('whichever-first may use any one authoritative concrete due axis', async () => {
  const item={measurements:['miles'],currentUsage:{miles:1200}}
  const calendarOnly={
    id:'whichever-calendar',enabled:true,due_semantics:'whichever_first',required_axes:['miles','calendar'],
    due_status:'upcoming',next_due_at:'2026-10-01',next_due_mileage:null,next_due_hours:null,next_due_cycles:null,
  }
  const meterOnly={
    id:'whichever-meter',enabled:true,due_semantics:'whichever_first',required_axes:['miles','calendar'],
    due_status:'due_now',next_due_at:null,next_due_mileage:1000,next_due_hours:null,next_due_cycles:null,
  }
  const scheduled=await requestFor({schedule:calendarOnly,item,now:new Date(2026,8,8,12)})
  assert.deepEqual(scheduled.trigger,{type:'date',date:new Date(2026,9,1,9)})
  assert.equal((await requestFor({schedule:meterOnly,item,now:new Date(2026,8,8,12)})).trigger,null)
})

test('actual active planned occurrence is a safe fallback when a V2 due row is absent', () => {
  const rows = buildV2MaintenanceReminderSchedules({
    definitions:[{id:'brakes',name:'Brake inspection',enabled:true,due_semantics:'whichever_first'}],
    dueStates:[],
    plannedOccurrences:[
      {id:'completed',definition_id:'brakes',status:'completed',due_at:'2026-09-01',due_status:'overdue'},
      {id:'plan-2',definition_id:'brakes',status:'not_completed',due_at:'2026-10-01',due_mileage:22000,due_status:'due_soon'},
    ],
    item:{measurements:['miles'],currentUsage:{miles:21000}},
  })
  assert.deepEqual(rows.map(row=>[row.id,row.planned_occurrence_id,row.next_due_at,row.next_due_mileage,row.due_status]),[
    ['brakes','plan-2','2026-10-01',22000,'due_soon'],
  ])
})

test('an authoritative uncalculated V2 row blocks a conflicting planned-occurrence fallback', () => {
  assert.deepEqual(buildV2MaintenanceReminderSchedules({
    definitions:[{id:'needs-usage',name:'Usage task',enabled:true,due_semantics:'whichever_first'}],
    dueStates:[{definition_id:'needs-usage',next_due_mileage:null,due_status:'needs_usage_update'}],
    plannedOccurrences:[{id:'stale-plan',definition_id:'needs-usage',status:'not_completed',due_mileage:5000,due_status:'overdue'}],
    item:{measurements:['miles'],currentUsage:{miles:6000}},
  }),[])
})

test('preset create refresh feeds the panel list and explicit opt-in schedules the eligible reminder', async () => {
  let definitions=[]
  const preset={id:'oil-filter',name:'Oil and filter change',persistedAction:'service'}
  const result=await addCommonMaintenancePresets({
    presets:[preset],readDefinitions:async()=>definitions,
    mutationIdForPreset:()=> 'preset-mutation',
    createDefinition:async()=>{definitions=[{id:'definition-oil',name:preset.name,service_action:'service',enabled:true,due_semantics:'whichever_first'}]},
  })
  assert.deepEqual(result.created,['oil-filter'])

  const item={measurements:['miles'],currentUsage:{miles:5000}}
  const schedules=buildV2MaintenanceReminderSchedules({definitions,dueStates:[{
    definition_id:'definition-oil',next_due_at:null,next_due_mileage:5000,next_due_hours:null,next_due_cycles:null,due_status:'due_now',
  }],item})
  assert.deepEqual(listedMaintenanceReminders(schedules,item,new Date(2026,8,8)).map(row=>row.name),['Oil and filter change'])

  const storage=storageDouble()
  const {runtime,notifications}=runtimeFor({storage})
  assert.deepEqual(notifications.calls,[],'mounting the model performs no permission or network work')
  assert.equal((await runtime.updateMaintenanceReminder({schedule:schedules[0],item})).status,'consent-required')
  assert.equal(notifications.calls.some(call=>call[0]==='schedule'),false)
  await grantMaintenanceConsent(runtime)
  assert.equal((await runtime.updateMaintenanceReminder({schedule:schedules[0],item})).status,'scheduled')
  assert.equal(notifications.calls.filter(call=>call[0]==='request').length,1)
  assert.equal(notifications.calls.filter(call=>call[0]==='schedule').length,1)
})

test('V2 reminder edit updates one stable ID and archive cancels it', async () => {
  const item={measurements:[],currentUsage:{}}
  const definition={id:'definition-1',name:'Brake fluid service',enabled:true,due_semantics:'whichever_first'}
  const original=buildV2MaintenanceReminderSchedules({definitions:[definition],dueStates:[{definition_id:definition.id,next_due_at:'2026-10-01',due_status:'upcoming'}],item})
  const edited=buildV2MaintenanceReminderSchedules({definitions:[{...definition,name:'Brake fluid'}],dueStates:[{definition_id:definition.id,next_due_at:'2026-11-01',due_status:'upcoming'}],item})
  const archived=buildV2MaintenanceReminderSchedules({definitions:[{...definition,enabled:false}],dueStates:[],item})
  const calls=[]
  const runtime={
    cancelMaintenanceReminder:async id=>{calls.push(['cancel',id]);return {status:'cancelled'}},
    updateMaintenanceReminder:async ({schedule})=>{calls.push(['update',schedule.id,schedule.next_due_at]);return {status:'scheduled'}},
  }
  const first=await synchronizeMaintenanceReminders({schedules:original,item,runtime})
  const second=await synchronizeMaintenanceReminders({schedules:edited,previousScheduleIds:first.scheduleIds,item,runtime})
  await synchronizeMaintenanceReminders({schedules:archived,previousScheduleIds:second.scheduleIds,item,runtime})
  assert.deepEqual(calls,[
    ['update','definition-1','2026-10-01'],['update','definition-1','2026-11-01'],['cancel','definition-1'],
  ])
})
