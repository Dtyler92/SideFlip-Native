import { AppState } from 'react-native'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import * as Linking from 'expo-linking'
import { supabase, getProfile } from '../lib/supabase'

const AuthContext = createContext(null)
const AUTH_CALLBACK_URL = 'sideflip://auth/callback'
const CURRENCY_SYMBOLS = { USD: '$', CAD: 'CA$', GBP: '£', EUR: '€', AUD: 'A$', MXN: 'MX$', JPY: '¥', INR: '₹' }

function tokensFromUrl(url) {
  const query = url?.split('?')[1]?.split('#')[0] || ''
  const fragment = url?.split('#')[1] || ''
  const params = new URLSearchParams(`${query}&${fragment}`)
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  return access_token && refresh_token ? { access_token, refresh_token } : null
}

async function getServerPlan(accessToken) {
  if (!accessToken) return 'free'
  const response = await fetch('https://sideflip.org/api/entitlement', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) return 'free'
  const body = await response.json().catch(() => ({}))
  return body.plan === 'pro' ? 'pro' : 'free'
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [plan, setPlan] = useState('free')
  const [loading, setLoading] = useState(true)
  const generation = useRef(0)

  async function syncSession(session) {
    const request = ++generation.current
    const nextUser = session?.user ?? null
    setLoading(true)
    setUser(nextUser)
    setProfile(null)
    setPlan('free')
    if (!nextUser) {
      if (request === generation.current) setLoading(false)
      return
    }
    const [nextProfile, nextPlan] = await Promise.all([
      getProfile(nextUser.id),
      getServerPlan(session?.access_token).catch(() => 'free'),
    ])
    if (request !== generation.current) return
    setProfile(nextProfile)
    setPlan(nextPlan)
    setLoading(false)
  }

  async function handleAuthUrl(url) {
    const tokens = tokensFromUrl(url)
    if (tokens) await supabase.auth.setSession(tokens)
  }

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data: { session } }) => { if (mounted) syncSession(session) })
    Linking.getInitialURL().then(url => { if (url) handleAuthUrl(url).catch(() => {}) })
    const linkSubscription = Linking.addEventListener('url', ({ url }) => handleAuthUrl(url).catch(() => {}))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { if (mounted) syncSession(session) })
    return () => { mounted = false; linkSubscription.remove(); subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active' && user) refreshEntitlement().catch(() => {})
    })
    return () => appStateSubscription.remove()
  }, [user?.id])

  async function signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: AUTH_CALLBACK_URL } })
    if (error) throw error
    return data
  }
  async function signIn(email, password) { const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error }
  async function signOut() { await supabase.auth.signOut(); setUser(null); setProfile(null); setPlan('free') }
  async function resetPassword(email) { const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: AUTH_CALLBACK_URL }); if (error) throw error }
  async function refreshProfile() { if (user) return getProfile(user.id).then(p => { setProfile(p); return p }) }
  async function refreshEntitlement() {
    const { data: { session } } = await supabase.auth.getSession()
    const nextPlan = await getServerPlan(session?.access_token).catch(() => 'free')
    setPlan(nextPlan)
    return nextPlan
  }

  const currency = profile?.currency || 'USD'
  const language = profile?.language || 'en'
  const currencySymbol = CURRENCY_SYMBOLS[currency] || '$'
  function formatMoney(amount) { const n = Number(amount || 0); const decimals = currency === 'JPY' ? 0 : 2; return currencySymbol + n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) }

  return <AuthContext.Provider value={{ user, profile, plan, isPro: plan === 'pro', loading, currency, language, currencySymbol, formatMoney, signUp, signIn, signOut, resetPassword, refreshProfile, refreshEntitlement, needsOnboarding: profile && !profile.onboarded }}>{children}</AuthContext.Provider>
}
export function useAuth() { return useContext(AuthContext) }
