import AsyncStorage from '@react-native-async-storage/async-storage'
import PostHog, { PostHogPersistedProperty } from 'posthog-react-native'
import { Platform } from 'react-native'
import { NATIVE_ANALYTICS_EVENTS, buildRuntimeAnalyticsProperties, extractAttribution, resolveAnalyticsPreference } from './analyticsModel'
import { supabase } from './supabase'

const PROJECT_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'
const OPT_OUT_KEY_PREFIX = 'sideflip_analytics_opt_out_v2'
const ATTRIBUTION_KEY_PREFIX = 'sideflip_analytics_attribution_v2'
const QUEUE_PROPERTIES = [
  PostHogPersistedProperty.Queue,
  PostHogPersistedProperty.AiQueue,
  PostHogPersistedProperty.LogsQueue,
]

let posthog = null
let runtimePreferenceReady = false
let runtimeAnalyticsEnabled = false
let activeUserId = null
let identityEpoch = 0
let identityResetQueue = Promise.resolve()
let pendingAttribution = null

const analyticsPreferenceKey = userId => `${OPT_OUT_KEY_PREFIX}:${userId}`
const attributionKey = userId => `${ATTRIBUTION_KEY_PREFIX}:${userId}`
const canSendAnalytics = () => Boolean(posthog && activeUserId && runtimePreferenceReady && runtimeAnalyticsEnabled)

function buildPostHog() {
  if (!PROJECT_KEY) return null
  return new PostHog(PROJECT_KEY, {
    host: HOST,
    persistence: 'memory',
    defaultOptIn: false,
    preloadFeatureFlags: false,
    disableRemoteFeatureFlags: true,
    // Retained for SDK versions where this option still suppresses remote config.
    disableRemoteConfig: true,
    disableSurveys: true,
    captureAppLifecycleEvents: false,
    enableSessionReplay: false,
    sessionReplayConfig: { captureLog: false, captureNetworkTelemetry: false },
    errorTracking: { autocapture: false, exceptionSteps: { enabled: false } },
    logs: { beforeSend: () => null },
    capturePushNotificationSubscriptions: false,
    capturePushNotificationOpened: false,
    setDefaultPersonProperties: false,
    customAppProperties: properties => ({
      $app_version: properties.$app_version,
      $app_build: properties.$app_build,
      $app_namespace: properties.$app_namespace,
      $os_name: properties.$os_name,
    }),
  })
}

async function discardPostHog(instance = posthog) {
  if (!instance) {
    posthog = null
    return
  }

  // The runtime gate is already closed by callers. Purge queued work before
  // resetting identity, then make opt-out the final persisted SDK state.
  for (const property of QUEUE_PROPERTIES) {
    try { instance.setPersistedProperty(property, null) } catch { /* unsupported by older SDK */ }
  }
  try { instance.reset() } catch { /* analytics must never block auth */ }
  try { await instance.optOut() } catch { /* continue best-effort cleanup */ }
  if (posthog === instance) posthog = null
}

async function createPostHog(epoch, userId) {
  const instance = buildPostHog()
  if (!instance) return null
  try {
    await instance.ready()
    if (epoch !== identityEpoch || activeUserId !== userId) {
      await discardPostHog(instance)
      return null
    }
    await instance.optIn()
    if (epoch !== identityEpoch || activeUserId !== userId) {
      await discardPostHog(instance)
      return null
    }
    posthog = instance
    return instance
  } catch {
    await discardPostHog(instance)
    return null
  }
}

export function initializeAnalytics() {
  runtimePreferenceReady = false
  runtimeAnalyticsEnabled = false
  return Promise.resolve(false)
}

export function isAnalyticsReady() {
  return runtimePreferenceReady
}

export function captureEvent(event, properties = {}) {
  if (!canSendAnalytics() || !NATIVE_ANALYTICS_EVENTS.has(event)) return false
  try {
    posthog.capture(event, buildRuntimeAnalyticsProperties(properties, Platform.OS))
    return true
  } catch { return false }
}

export function identifyAnalytics(userId, properties = {}) {
  if (!canSendAnalytics() || userId !== activeUserId) return false
  try {
    posthog.identify(userId, buildRuntimeAnalyticsProperties(properties, Platform.OS))
    return true
  } catch { return false }
}

export function beginAnalyticsIdentityTransition(userId) {
  const nextUserId = typeof userId === 'string' && userId ? userId : null
  const previousUserId = activeUserId
  activeUserId = nextUserId
  runtimePreferenceReady = false
  runtimeAnalyticsEnabled = false
  const epoch = ++identityEpoch
  if (previousUserId !== nextUserId && !(previousUserId === null && nextUserId)) pendingAttribution = null

  identityResetQueue = identityResetQueue.then(async () => {
    await discardPostHog()
    const keys = new Set([previousUserId, nextUserId].filter(Boolean).map(attributionKey))
    await Promise.all([...keys].map(key => AsyncStorage.removeItem(key).catch(() => {})))
    if (epoch === identityEpoch && nextUserId === null) runtimePreferenceReady = true
    return epoch
  }).catch(() => epoch)
  return identityResetQueue
}

export async function resetAnalytics() {
  await beginAnalyticsIdentityTransition(null)
}

export async function isAnalyticsEnabled(userId = activeUserId) {
  return Boolean(userId && userId === activeUserId && runtimePreferenceReady && runtimeAnalyticsEnabled)
}

async function postAnalyticsPreference(enabled, session) {
  if (!session?.access_token) return false
  try {
    const response = await fetch('https://sideflip.org/api/analytics-preference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify({ enabled }),
    })
    return response.ok
  } catch { return false }
}

async function fetchAnalyticsPreference(session) {
  if (!session?.access_token) return null
  try {
    const response = await fetch('https://sideflip.org/api/analytics-preference', {
      headers: { Authorization: 'Bearer ' + session.access_token },
    })
    if (!response.ok) return null
    const body = await response.json()
    return typeof body.enabled === 'boolean' ? body.enabled : null
  } catch { return null }
}

export async function setAnalyticsEnabled(enabled, userId = activeUserId) {
  if (!userId || userId !== activeUserId) return { effectiveEnabled: false, serverSynced: false }
  const epoch = identityEpoch
  const key = analyticsPreferenceKey(userId)

  if (!enabled) {
    runtimeAnalyticsEnabled = false
    runtimePreferenceReady = true
    try { await AsyncStorage.setItem(key, 'true') } catch { /* runtime state remains off */ }
    await discardPostHog()
    const { data: { session } } = await supabase.auth.getSession()
    const identityStillCurrent = epoch === identityEpoch && session?.user?.id === userId
    const serverSynced = Boolean(identityStillCurrent && await postAnalyticsPreference(false, session))
    return { effectiveEnabled: false, serverSynced }
  }

  runtimeAnalyticsEnabled = false
  runtimePreferenceReady = true
  await discardPostHog()
  const { data: { session } } = await supabase.auth.getSession()
  const serverSynced = Boolean(session?.user?.id === userId && await postAnalyticsPreference(true, session))
  if (!serverSynced || epoch !== identityEpoch || activeUserId !== userId) {
    return { effectiveEnabled: false, serverSynced: false }
  }

  const instance = await createPostHog(epoch, userId)
  if (!instance) return { effectiveEnabled: false, serverSynced: true }
  try { await AsyncStorage.setItem(key, 'false') } catch { /* server remains authoritative */ }
  runtimeAnalyticsEnabled = true
  runtimePreferenceReady = true
  return { effectiveEnabled: true, serverSynced: true }
}

export async function reconcileAnalyticsPreference(userId = activeUserId) {
  if (!userId || userId !== activeUserId) return false
  const epoch = identityEpoch
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user?.id !== userId || epoch !== identityEpoch) return false

  const serverEnabled = await fetchAnalyticsPreference(session)
  let localChoice = null
  try { localChoice = await AsyncStorage.getItem(analyticsPreferenceKey(userId)) } catch { /* default disabled */ }
  if (epoch !== identityEpoch || activeUserId !== userId) return false

  // Server consent must be explicitly enabled. A local opt-out can only be stricter.
  const enabled = resolveAnalyticsPreference(serverEnabled, localChoice)
  if (serverEnabled === false) {
    try { await AsyncStorage.setItem(analyticsPreferenceKey(userId), 'true') } catch { /* runtime state remains off */ }
  }

  if (!enabled) {
    runtimeAnalyticsEnabled = false
    runtimePreferenceReady = true
    await discardPostHog()
    return false
  }

  // Construction is deliberately deferred until authoritative server consent is true.
  if (serverEnabled === true) {
    const instance = await createPostHog(epoch, userId)
    if (!instance) {
      runtimeAnalyticsEnabled = false
      runtimePreferenceReady = true
      return false
    }
  }
  if (epoch !== identityEpoch || activeUserId !== userId) {
    await discardPostHog()
    return false
  }
  runtimeAnalyticsEnabled = true
  runtimePreferenceReady = true
  if (pendingAttribution && (pendingAttribution.owner === null || pendingAttribution.owner === userId)) {
    const pending = pendingAttribution.current
    pendingAttribution = null
    await persistAttribution(pending)
  }
  return true
}

async function persistAttribution(current) {
  const userId = activeUserId
  if (!Object.keys(current).length) return current
  const key = attributionKey(userId)
  let stored = {}
  try { stored = JSON.parse(await AsyncStorage.getItem(key) || '{}') } catch { stored = {} }
  if (!canSendAnalytics() || activeUserId !== userId) return {}
  const next = { first: stored.first || current, last: current }
  try { await AsyncStorage.setItem(key, JSON.stringify(next)) } catch { /* storage can fail */ }
  try {
    await posthog.register({
      ...Object.fromEntries(Object.entries(next.first).map(([name, value]) => [`first_${name}`, value])),
      ...Object.fromEntries(Object.entries(next.last).map(([name, value]) => [`last_${name}`, value])),
    })
  } catch { /* analytics must never break deep links */ }
  captureEvent('attribution_captured', { ...current, has_campaign: true })
  return current
}

export async function captureAttribution(url) {
  const current = extractAttribution(url)
  if (!Object.keys(current).length) return current
  if (!canSendAnalytics()) {
    // Keep only sanitized campaign labels in process memory. They are neither
    // persisted nor transmitted until server consent is confirmed.
    pendingAttribution = { owner: activeUserId, current }
    return current
  }
  return persistAttribution(current)
}

export async function flushAnalytics() {
  if (!canSendAnalytics()) return
  try { await posthog.flush() } catch { /* best effort while consent remains enabled */ }
}
