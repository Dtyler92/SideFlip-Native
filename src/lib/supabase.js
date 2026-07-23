import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

const SUPABASE_URL = 'https://sueeubsglcnanecvltms.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1ZWV1YnNnbGNuYW5lY3ZsdG1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MzE4NTksImV4cCI6MjEwMDMwNzg1OX0.7aJCKXxoxo3lq35dePGrlFkPfjuPIwPR6WRxKFtSnrs'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

export async function getProfile(userId) {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
  return data
}

export function isSubscribed(profile) {
  if (!profile) return false
  if (!profile.subscription_id) return false
  if (profile.subscription_status === 'active') return true
  if (profile.subscription_status === 'trialing') return true
  return false
}
