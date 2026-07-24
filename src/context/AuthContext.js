import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, getProfile, isSubscribed } from '../lib/supabase'

const AuthContext = createContext(null)

const CURRENCY_SYMBOLS = {
  USD: '$', CAD: 'CA$', GBP: '£', EUR: '€',
  AUD: 'A$', MXN: 'MX$', JPY: '¥', INR: '₹',
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId) {
    const p = await getProfile(userId)
    setProfile(p)
    return p
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) loadProfile(u.id).finally(() => setLoading(false))
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) loadProfile(u.id)
      else setProfile(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  async function resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://sideflip.org'
    })
    if (error) throw error
  }

  async function refreshProfile() {
    if (user) {
      const p = await loadProfile(user.id)
      return p
    }
  }

  // Currency formatter based on user profile
  const currency = profile?.currency || 'USD'
  const language = profile?.language || 'en'
  const currencySymbol = CURRENCY_SYMBOLS[currency] || '$'

  function formatMoney(amount) {
    const n = Number(amount || 0)
    // JPY has no decimal places
    const decimals = currency === 'JPY' ? 0 : 2
    return currencySymbol + n.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  }

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      subscribed: isSubscribed(profile),
      currency, language, currencySymbol, formatMoney,
      signIn, signOut, resetPassword, refreshProfile,
      needsOnboarding: profile && !profile.onboarded,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() { return useContext(AuthContext) }
