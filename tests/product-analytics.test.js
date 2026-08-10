import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { extractAttribution, normalizeScreenName, resolveAnalyticsPreference, sanitizeAnalyticsProperties } from '../src/lib/analyticsModel.js'

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

test('native analytics strips sensitive and high-cardinality values', () => {
  assert.deepEqual(sanitizeAnalyticsProperties({
    platform: 'ios', screen: 'project_detail', plan: 'annual', is_pro: true,
    email: 'private@example.com', title: 'Project name', description: 'private notes',
    amount: 123, signedTransaction: 'signed', transactionId: 'tx', photo: 'https://photo',
    extra: 'no',
  }), { platform: 'ios', screen: 'project_detail', plan: 'annual', is_pro: true })
})

test('native campaign attribution accepts only bounded UTM and referral fields', () => {
  const attribution = extractAttribution('sideflip://open?utm_source=Meta&utm_medium=paid&utm_campaign=launch&ref=TYLER&email=nope')
  assert.deepEqual(attribution, { utm_source: 'Meta', utm_medium: 'paid', utm_campaign: 'launch', referral_code: 'TYLER' })
  assert.equal(extractAttribution('sideflip://open?utm_campaign=' + encodeURIComponent('launch ' + 'x'.repeat(100))).utm_campaign.length, 80)
})

test('native attribution rejects contact details, URLs, credentials, and opaque tokens', () => {
  assert.deepEqual(extractAttribution('sideflip://open?utm_campaign=person%40example.com&ref=https%3A%2F%2Fevil.test'), {})
  assert.deepEqual(extractAttribution('sideflip://open?utm_source=token%3Dabc123&utm_medium=pk_live_abcdefghijklmnopqrstuvwxyz'), {})
  assert.deepEqual(extractAttribution('sideflip://open?utm_source=summer&utm_campaign=launch_2026&ref=FRIEND-20'), {
    utm_source: 'summer', utm_campaign: 'launch_2026', referral_code: 'FRIEND-20',
  })
})

test('screen names contain no record identifiers', () => {
  assert.equal(normalizeScreenName('ProjectDetail'), 'project_detail')
  assert.equal(normalizeScreenName('SellProject'), 'sell_project')
  assert.equal(normalizeScreenName('unexpected-value'), 'unknown')
})

test('server opt-out always wins and unknown server state stays disabled', () => {
  assert.equal(resolveAnalyticsPreference(false, 'false'), false)
  assert.equal(resolveAnalyticsPreference(false, null), false)
  assert.equal(resolveAnalyticsPreference(null, 'false'), false)
  assert.equal(resolveAnalyticsPreference(true, 'true'), false)
  assert.equal(resolveAnalyticsPreference(true, 'false'), true)
  assert.equal(resolveAnalyticsPreference(true, null), true)
})

test('native activation and StoreKit funnels are instrumented', () => {
  assert.match(source('App.js'), /screen_viewed/)
  assert.match(source('src/context/AuthContext.js'), /identifyAnalytics/)
  assert.match(source('src/screens/SignUpScreen.js'), /signup_started/)
  assert.match(source('src/screens/SignUpScreen.js'), /signup_completed/)
  assert.match(source('src/screens/OnboardingScreen.js'), /onboarding_started/)
  assert.match(source('src/screens/OnboardingScreen.js'), /onboarding_completed/)
  assert.match(source('src/screens/NewProjectScreen.js'), /project_created/)
  assert.match(source('src/screens/ProjectDetailScreen.js'), /expense_added/)
  assert.match(source('src/screens/ProjectDetailScreen.js'), /ai_listing_succeeded/)
  assert.match(source('src/screens/SellProjectScreen.js'), /project_marked_sold/)
  assert.match(source('src/screens/TradeUpGoalsScreen.js'), /goal_created/)
  const pro = source('src/screens/ProScreen.js')
  for (const event of ['paywall_viewed', 'plan_selected', 'apple_purchase_started', 'apple_purchase_cancelled', 'apple_purchase_failed', 'apple_store_products_fetch_failed', 'apple_purchase_verification_failed', 'apple_entitlement_activated', 'apple_restore_started', 'apple_restore_completed', 'apple_restore_failed']) {
    assert.match(pro, new RegExp(event))
  }
})

test('native Settings provides analytics opt-out with accurate wording', () => {
  const settings = source('src/screens/SettingsScreen.js')
  assert.match(settings, /Share usage analytics/)
  assert.match(settings, /setAnalyticsEnabled/)
  assert.match(settings, /stable pseudonymous account ID/)
  assert.match(settings, /campaign\/referral attribution/)
  assert.match(settings, /subscription plan\/status/)
  assert.match(settings, /does not send card or payment details/)
  assert.match(settings, /project financials/)
  assert.match(settings, /session recordings/)
  assert.match(source('src/lib/analytics.js'), /\/api\/analytics-preference/)
  assert.match(source('src/context/AuthContext.js'), /reconcileAnalyticsPreference/)
  assert.match(settings, /serverSynced/)
  assert.match(settings, /turned off on this device/)
  assert.match(settings, /account setting could not be updated/)
  assert.match(settings, /Analytics remains off/)
})

test('analytics stays hard-gated until scoped server preference reconciliation', () => {
  const analytics = source('src/lib/analytics.js')
  assert.match(analytics, /runtimePreferenceReady/)
  assert.match(analytics, /runtimePreferenceReady && runtimeAnalyticsEnabled/)
  assert.match(analytics, /analyticsPreferenceKey\(userId\)/)
  assert.match(analytics, /await fetchAnalyticsPreference/)
  assert.doesNotMatch(analytics, /syncAnalyticsPreference\(localChoice/)
  assert.match(analytics, /serverEnabled === false/)
  assert.doesNotMatch(analytics, /const posthog\s*=\s*PROJECT_KEY\s*\?\s*new PostHog/)
  assert.match(analytics, /serverEnabled === true[\s\S]*createPostHog/)
  assert.match(analytics, /persistence: 'memory'/)
  assert.match(analytics, /defaultOptIn: false/)
  assert.match(analytics, /preloadFeatureFlags: false/)
  assert.match(analytics, /disableRemoteFeatureFlags: true/)
  assert.match(analytics, /disableRemoteConfig: true/)
  assert.match(analytics, /captureAppLifecycleEvents: false/)
  assert.match(analytics, /disableSurveys: true/)
  assert.match(analytics, /enableSessionReplay: false/)
  assert.match(analytics, /capturePushNotificationSubscriptions: false/)
  assert.match(analytics, /capturePushNotificationOpened: false/)
  for (const property of ['Queue', 'AiQueue', 'LogsQueue']) assert.match(analytics, new RegExp(`PostHogPersistedProperty\\.${property}`))
  assert.match(analytics, /for \(const property of QUEUE_PROPERTIES\)[\s\S]*setPersistedProperty\(property, null\)[\s\S]*reset\(\)[\s\S]*optOut\(\)[\s\S]*posthog = null/)
  assert.match(analytics, /map\(attributionKey\)[\s\S]*AsyncStorage\.removeItem\(key\)/)
  assert.match(analytics, /pendingAttribution/)
  assert.match(analytics, /neither[\s\S]*persisted nor transmitted until server consent/)
})

test('preference writes distinguish effective state from server synchronization', () => {
  const analytics = source('src/lib/analytics.js')
  assert.match(analytics, /effectiveEnabled: false, serverSynced/)
  assert.match(analytics, /effectiveEnabled: true, serverSynced: true/)
  assert.match(analytics, /postAnalyticsPreference\(true, session\)[\s\S]*createPostHog/)
})

test('auth transitions reset identity before reconciliation and always clean up sign-out', () => {
  const auth = source('src/context/AuthContext.js')
  assert.match(auth, /beginAnalyticsIdentityTransition\(nextUser\?\.id \|\| null\)/)
  assert.match(auth, /await analyticsReset[\s\S]*reconcileAnalyticsPreference/)
  assert.match(auth, /async function signOut\(\)[\s\S]*finally[\s\S]*beginAnalyticsIdentityTransition\(null/)
  const app = source('App.js')
  assert.match(app, /isAnalyticsReady\(\)/)
  assert.match(app, /analyticsReady/)
})

test('iOS privacy manifest discloses linked app and analytics data without tracking', () => {
  const config = JSON.parse(source('app.json')).expo
  assert.equal(config.ios.buildNumber, '13')
  const manifest = config.ios.privacyManifests
  assert.equal(manifest.NSPrivacyTracking, false)
  assert.deepEqual(manifest.NSPrivacyTrackingDomains, [])
  const types = new Map(manifest.NSPrivacyCollectedDataTypes.map(entry => [entry.NSPrivacyCollectedDataType, entry]))
  const expected = [
    'NSPrivacyCollectedDataTypeEmailAddress',
    'NSPrivacyCollectedDataTypePhotosorVideos',
    'NSPrivacyCollectedDataTypeOtherUserContent',
    'NSPrivacyCollectedDataTypeOtherFinancialInfo',
    'NSPrivacyCollectedDataTypePurchaseHistory',
    'NSPrivacyCollectedDataTypeUserID',
    'NSPrivacyCollectedDataTypeDeviceID',
    'NSPrivacyCollectedDataTypeProductInteraction',
    'NSPrivacyCollectedDataTypeOtherUsageData',
  ]
  assert.deepEqual([...types.keys()], expected)
  for (const entry of types.values()) {
    assert.equal(entry.NSPrivacyCollectedDataTypeLinked, true)
    assert.equal(entry.NSPrivacyCollectedDataTypeTracking, false)
  }
  assert.deepEqual(types.get('NSPrivacyCollectedDataTypeEmailAddress').NSPrivacyCollectedDataTypePurposes, [
    'NSPrivacyCollectedDataTypePurposeAppFunctionality',
  ])
  assert.deepEqual(types.get('NSPrivacyCollectedDataTypeProductInteraction').NSPrivacyCollectedDataTypePurposes, [
    'NSPrivacyCollectedDataTypePurposeAnalytics',
  ])
})
