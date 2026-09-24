import { useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { synchronizeMaintenanceReminders, visibleMaintenanceReminders } from '../lib/maintenanceReminderListModel'
import {
  cancelMaintenanceReminder,
  getMaintenanceReminderOptInStatus,
  requestMaintenanceReminderPermission,
  updateMaintenanceReminder,
} from '../lib/maintenanceReminders'

const nativeRuntime = {
  cancelMaintenanceReminder,
  getMaintenanceReminderOptInStatus,
  requestMaintenanceReminderPermission,
  updateMaintenanceReminder,
}

function scheduleLabel(schedule) {
  return schedule.name || schedule.task_name || schedule.title || 'Maintenance task'
}

function dueDescription(schedule) {
  if (schedule.due_status != null) {
    const details=[]
    if (schedule.next_due_at) details.push(`Date ${String(schedule.next_due_at).slice(0,10)}`)
    if (schedule.next_due_mileage!=null) details.push(`${Number(schedule.next_due_mileage).toLocaleString()} mi`)
    if (schedule.next_due_hours!=null) details.push(`${Number(schedule.next_due_hours).toLocaleString()} hr`)
    if (schedule.next_due_cycles!=null) details.push(`${Number(schedule.next_due_cycles).toLocaleString()} cycles`)
    return details.join(' · ')
  }
  if (schedule.tracking_type === 'calendar') return `Due ${String(schedule.next_due_at || '').slice(0,10)}`
  const suffix = schedule.tracking_type === 'mileage' ? 'mi' : 'hr'
  return `Due at ${Number(schedule.next_due_value).toLocaleString()} ${suffix}`
}

export default function MaintenanceReminderPanel({ schedules = [], item = {}, now, runtime = nativeRuntime }) {
  const [permissionState,setPermissionState] = useState('checking')
  const [syncState,setSyncState] = useState('idle')
  const previousScheduleIds = useRef([])
  const syncQueue = useRef(Promise.resolve())
  const mounted = useRef(true)
  const due = useMemo(
    () => visibleMaintenanceReminders(schedules,item,now || new Date()),
    [schedules,item,now],
  )

  function queueSynchronization() {
    const nextSchedules = schedules
    const nextItem = item
    setSyncState('syncing')
    syncQueue.current = syncQueue.current
      .catch(() => null)
      .then(() => synchronizeMaintenanceReminders({
        schedules:nextSchedules,
        previousScheduleIds:previousScheduleIds.current,
        item:nextItem,
        runtime,
      }))
      .then(result => {
        previousScheduleIds.current = result.scheduleIds
        if (!mounted.current) return
        const unavailable = result.results.some(entry => entry?.status === 'unavailable' || entry?.status === 'permission-denied')
        setSyncState(unavailable ? 'unavailable' : 'synced')
        if (result.results.some(entry => entry?.status === 'permission-denied')) setPermissionState('denied')
      })
      .catch(() => { if (mounted.current) setSyncState('unavailable') })
    return syncQueue.current
  }

  async function enableLocalReminders() {
    setPermissionState('requesting')
    const result = await runtime.requestMaintenanceReminderPermission()
    if (!mounted.current) return
    if (result.status === 'granted') setPermissionState('enabled')
    else setPermissionState(result.status === 'denied' ? 'denied' : 'unavailable')
  }

  useEffect(() => {
    mounted.current = true
    let active = true
    runtime.getMaintenanceReminderOptInStatus()
      .then(result => { if (active) setPermissionState(result.status === 'opted-in' ? 'enabled' : result.status === 'unavailable' ? 'unavailable' : 'idle') })
      .catch(() => { if (active) setPermissionState('unavailable') })
    return () => { active = false;mounted.current = false }
  }, [runtime])

  useEffect(() => {
    if (permissionState === 'enabled') queueSynchronization()
  }, [permissionState,schedules,item,runtime])

  const requesting = permissionState === 'requesting'
  const remindersEnabled = permissionState === 'enabled'
  return <View style={s.card} accessibilityLabel="Maintenance reminders">
    <View style={s.headingRow}>
      <Text style={s.heading} accessibilityRole="header">Maintenance reminders</Text>
      <TouchableOpacity
        style={[s.enableButton,(requesting||remindersEnabled)&&s.disabled]}
        onPress={enableLocalReminders}
        disabled={requesting||remindersEnabled}
        accessibilityRole="button"
        accessibilityLabel="Enable local reminders"
        accessibilityHint="Requests notification permission and schedules private reminders on this device"
        accessibilityState={{disabled:requesting||remindersEnabled,busy:requesting}}
      >
        <Text style={s.enableText}>{requesting?'Requesting…':permissionState==='enabled'?'Local reminders enabled':'Enable local reminders'}</Text>
      </TouchableOpacity>
    </View>
    <Text style={s.help}>Due and overdue items always appear here in SideFlip. Local notifications stay on this device, use generic private wording, and require your permission.</Text>
    {permissionState==='denied'&&<Text style={s.warning} accessibilityRole="alert">Local reminders are blocked in system settings. The in-app list still works.</Text>}
    {permissionState==='unavailable'&&<Text style={s.warning} accessibilityRole="alert">Local reminders are unavailable right now. The in-app list still works.</Text>}
    {permissionState==='enabled'&&syncState==='unavailable'&&<Text style={s.warning} accessibilityRole="alert">Some local reminders could not be updated. The in-app list still works.</Text>}
    {due.length===0?<Text style={s.help}>No maintenance schedules are due or overdue.</Text>:due.map(schedule=>{const stateLabel=schedule.dueState==='overdue'?'Overdue':'Due now';return <View key={schedule.id} style={s.row} accessibilityLabel={`${scheduleLabel(schedule)}, ${stateLabel}, ${dueDescription(schedule)}`}>
      <View style={s.flex}><Text style={s.task}>{scheduleLabel(schedule)}</Text><Text style={s.help}>{dueDescription(schedule)}</Text></View>
      <Text style={[s.badge,schedule.dueState==='overdue'&&s.overdue]}>{stateLabel}</Text>
    </View>})}
  </View>
}

const s=StyleSheet.create({
  card:{backgroundColor:'#fff',borderRadius:14,padding:16,borderWidth:1,borderColor:'#E8E4DE',marginBottom:10},
  headingRow:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:10},
  heading:{fontSize:17,fontWeight:'800',color:'#1A1917',flexShrink:1},
  enableButton:{minHeight:44,justifyContent:'center',paddingHorizontal:12,borderRadius:10,borderWidth:1,borderColor:'#C8402F'},
  enableText:{color:'#C8402F',fontWeight:'800'},
  disabled:{opacity:.6},
  help:{color:'#6B665E',lineHeight:20,marginTop:6,flexShrink:1},
  warning:{color:'#8B3328',lineHeight:20,marginTop:8},
  row:{flexDirection:'row',alignItems:'center',gap:10,borderTopWidth:1,borderTopColor:'#E8E4DE',paddingTop:12,marginTop:12},
  flex:{flex:1},
  task:{fontWeight:'800',color:'#1A1917',fontSize:15},
  badge:{color:'#6B4B16',backgroundColor:'#FFF1C9',fontWeight:'800',paddingHorizontal:9,paddingVertical:6,borderRadius:12,overflow:'hidden'},
  overdue:{color:'#8B3328',backgroundColor:'#FDE0DB'},
})
