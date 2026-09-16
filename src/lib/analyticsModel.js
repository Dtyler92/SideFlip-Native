export const NATIVE_ANALYTICS_EVENTS = new Set([
  'app_opened', 'signup_started', 'signup_completed', 'signin_completed',
  'onboarding_started', 'onboarding_completed', 'screen_viewed', 'analytics_viewed',
  'project_created', 'project_deleted', 'project_marked_sold', 'project_sale_undone',
  'expense_added', 'expense_updated', 'expense_deleted',
  'goal_created', 'goal_completed',
  'ai_listing_requested', 'ai_listing_succeeded', 'ai_listing_failed',
  'ai_listing_regenerated', 'ai_listing_accepted',
  'paywall_viewed', 'plan_selected',
  'apple_purchase_started', 'apple_purchase_cancelled', 'apple_purchase_failed',
  'apple_store_products_fetch_failed',
  'apple_purchase_verification_failed', 'apple_entitlement_activated',
  'apple_entitlement_activation_failed',
  'apple_restore_started', 'apple_restore_completed', 'apple_restore_failed',
  'attribution_captured',
  'my_stuff_opened', 'my_stuff_item_created', 'my_stuff_project_transferred',
  'my_stuff_free_limit_reached', 'my_stuff_upgrade_prompt_viewed',
  'my_stuff_research_started', 'my_stuff_research_completed', 'my_stuff_research_failed',
  'my_stuff_maintenance_completed', 'my_stuff_report_generated', 'project_report_generated',
  'vin_decode_requested', 'vin_decode_succeeded', 'vin_decode_failed',
])

const ALLOWED_PROPERTIES = new Set([
  'platform', 'app_version', 'app_build', 'screen', 'plan', 'provider', 'status',
  'source', 'feature', 'result', 'error_type', 'project_category', 'expense_category',
  'item_category', 'tracking_mode', 'source_class',
  'goal_type', 'is_pro', 'is_goal_linked', 'billing_period', 'product_id',
  'is_restore', 'verified_count', 'has_campaign',
  'listing_style', 'humor_level', 'had_existing_description',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'referral_code',
])
const ATTRIBUTION_KEYS = new Map([
  ['utm_source', 'utm_source'], ['utm_medium', 'utm_medium'],
  ['utm_campaign', 'utm_campaign'], ['utm_content', 'utm_content'],
  ['utm_term', 'utm_term'], ['ref', 'referral_code'],
])
const ATTRIBUTION_PROPERTIES = new Set([...ATTRIBUTION_KEYS.values()])
const ENUM_PROPERTIES = new Map([
  ['item_category', new Set([
    'vehicle', 'car', 'truck', 'motorcycle', 'atv', 'side_by_side', 'boat', 'airplane', 'aircraft',
    'mower', 'tractor', 'trailer', 'generator', 'rv', 'equipment', 'home',
    'appliance', 'tool', 'electronics', 'recreation', 'other',
  ])],
  ['tracking_mode', new Set(['mileage', 'miles', 'hours', 'cycles', 'calendar', 'combined'])],
  ['source_class', new Set(['official', 'manufacturer', 'trusted_secondary', 'user_entered', 'user_uploaded'])],
])
const SCREEN_NAMES = {
  Login: 'login', SignUp: 'signup', ForgotPassword: 'forgot_password',
  Onboarding: 'onboarding', Projects: 'projects', Home: 'projects', Main: 'projects',
  Analyze: 'analyze', Calculator: 'calculator', Goals: 'goals', Analytics: 'analytics', Settings: 'settings',
  NewProject: 'new_project', ProjectDetail: 'project_detail', SellProject: 'sell_project',
  GoalCreate: 'goal_create', Pro: 'paywall', DeleteAccount: 'delete_account',
}

function bounded(value, max = 80) {
  if (typeof value !== 'string') return null
  const clean = value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max)
  return clean || null
}

export function sanitizeAttributionValue(property, value) {
  if (!ATTRIBUTION_PROPERTIES.has(property) || typeof value !== 'string') return null
  const candidate = value.trim().replace(/[\u0000-\u001f\u007f]/g, '')
  if (!candidate) return null
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(candidate)) return null
  if (/^(?:\+?[\d\s().-]){7,}$/.test(candidate) && (candidate.match(/\d/g) || []).length >= 7) return null
  if (/(?:https?:\/\/|www\.)/i.test(candidate)) return null
  if (/(?:^|[\s;&?])(bearer\s+|(?:password|passwd|secret|token|api[_-]?key)\s*[:=])/i.test(candidate)) return null
  if (/^(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]+$/i.test(candidate)) return null
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(candidate)) return null
  if (/^[A-Za-z0-9_-]{64,}$/.test(candidate)) return null
  const pattern = property === 'referral_code'
    ? /^[A-Za-z0-9][A-Za-z0-9_-]*$/
    : /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/
  if (!pattern.test(candidate)) return null
  return candidate.slice(0, 80) || null
}

export function sanitizeAnalyticsProperties(properties = {}) {
  const result = {}
  for (const [key, value] of Object.entries(properties || {})) {
    if (!ALLOWED_PROPERTIES.has(key)) continue
    if (ATTRIBUTION_PROPERTIES.has(key)) {
      const clean = sanitizeAttributionValue(key, value)
      if (clean !== null) result[key] = clean
    } else if (ENUM_PROPERTIES.has(key)) {
      if (typeof value === 'string' && ENUM_PROPERTIES.get(key).has(value)) result[key] = value
    } else if (typeof value === 'boolean') result[key] = value
    else if (typeof value === 'number' && Number.isFinite(value)) result[key] = value
    else {
      const clean = bounded(value)
      if (clean !== null) result[key] = clean
    }
  }
  return result
}

export function buildRuntimeAnalyticsProperties(properties = {}, platform = 'unknown') {
  return {
    ...sanitizeAnalyticsProperties(properties),
    platform: bounded(platform) || 'unknown',
    $geoip_disable: true,
  }
}

export function extractAttribution(input) {
  let url
  try { url = new URL(input) } catch { return {} }
  const result = {}
  for (const [queryKey, propertyKey] of ATTRIBUTION_KEYS) {
    const clean = sanitizeAttributionValue(propertyKey, url.searchParams.get(queryKey))
    if (clean !== null) result[propertyKey] = clean
  }
  return result
}

export function normalizeScreenName(routeName) {
  return SCREEN_NAMES[routeName] || 'unknown'
}

export function resolveAnalyticsPreference(serverEnabled, localChoice) {
  return serverEnabled === true && localChoice !== 'true'
}
