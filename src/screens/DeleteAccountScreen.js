import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { clearSavedAnalyses } from '../lib/analysisStore'

const API_URL = 'https://sideflip.org/api/delete-account'
const IS_ANDROID = Platform.OS === 'android'
const BILLING_NOTICE = IS_ANDROID
  ? 'Deleting SideFlip data does not cancel subscriptions. If you have a subscription, cancel it through the original billing provider, such as Google Play, Apple, or the web.'
  : 'Deleting SideFlip data does not cancel Apple billing. Manage or cancel an Apple subscription in your Apple ID subscription settings.'

export default function DeleteAccountScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const { user, signOut } = useAuth()
  const [confirmation, setConfirmation] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function deleteAccount() {
    setDeleting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Please sign in again before deleting your account.')
      const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ confirmation: 'DELETE' }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.deleted) throw new Error(body.error || 'Could not delete your account. Please try again.')
      let localCleanupFailed = false
      try { await clearSavedAnalyses(user.id) } catch { localCleanupFailed = true }
      try { await signOut() } catch { /* The server account is already deleted. */ }
      if (localCleanupFailed) {
        Alert.alert('Account deleted, but local cleanup is incomplete', 'Saved analyses may remain on this device. Retry cleanup now or clear SideFlip app storage.', [
          { text: 'Close', style: 'cancel' },
          { text: 'Retry Cleanup', onPress: async () => {
            try { await clearSavedAnalyses(user.id); Alert.alert('Local data removed', 'Saved analyses were removed from this device.') }
            catch { Alert.alert('Cleanup still incomplete', 'Clear SideFlip app storage from your device settings.') }
          } },
        ])
      } else Alert.alert('Account deleted', 'Your SideFlip account and associated app data have been deleted.')
    } catch (error) {
      Alert.alert('Account not deleted', error.message)
    } finally { setDeleting(false) }
  }

  function confirmDeletion() {
    if (confirmation !== 'DELETE') return Alert.alert('Type DELETE to continue', 'Enter DELETE exactly in the confirmation field.')
    Alert.alert('Delete SideFlip account?', `This permanently deletes your SideFlip account, projects, photos, receipts, goals, and app data. ${BILLING_NOTICE}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete Account', style: 'destructive', onPress: deleteAccount },
    ])
  }

  return <ScrollView style={s.root} contentContainerStyle={[s.content, { paddingTop: insets.top + 28 }]}>
    <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}><Text style={s.backText}>‹ Back to Settings</Text></TouchableOpacity>
    <Text style={s.title}>Delete Account</Text>
    <Text style={s.warning}>This action is permanent.</Text>
    <Text style={s.copy}>Deleting your account removes your SideFlip profile, projects, project photos, receipts, expenses, and Trade-Up Goal data. This cannot be undone.</Text>
    <Text style={s.copy}>{BILLING_NOTICE}</Text>
    <Text style={s.label}>Type DELETE to confirm</Text>
    <TextInput value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" autoCorrect={false} placeholder="DELETE" style={s.input} editable={!deleting} />
    <TouchableOpacity disabled={deleting || confirmation !== 'DELETE'} onPress={confirmDeletion} style={[s.button, (deleting || confirmation !== 'DELETE') && s.disabled]}>
      {deleting ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Permanently Delete Account</Text>}
    </TouchableOpacity>
  </ScrollView>
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:'#FAFAF7'},content:{padding:24,paddingBottom:48},back:{alignSelf:'flex-start',paddingVertical:8,marginBottom:12},backText:{color:'#C8402F',fontSize:15,fontWeight:'700'},title:{fontSize:28,fontWeight:'800',color:'#1A1917'},warning:{fontSize:17,fontWeight:'800',color:'#B3261E',marginTop:12},copy:{fontSize:15,color:'#5C5850',lineHeight:22,marginTop:14},label:{fontSize:14,fontWeight:'700',color:'#1A1917',marginTop:26,marginBottom:8},input:{backgroundColor:'#fff',borderWidth:1,borderColor:'#D5D0C8',borderRadius:10,padding:14,fontSize:16,color:'#1A1917'},button:{marginTop:18,backgroundColor:'#B3261E',borderRadius:10,padding:16,alignItems:'center'},disabled:{opacity:.45},buttonText:{color:'#fff',fontWeight:'800',fontSize:15}})
