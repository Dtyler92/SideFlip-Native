import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native'
import { useIAP } from 'expo-iap'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const PRODUCT_IDS = ['com.sideflip.app.pro.monthly', 'com.sideflip.app.pro.annual']

async function verifyWithSideFlip(purchase) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token || !purchase?.purchaseToken) throw new Error('Please sign in again before verifying your purchase.')
  const response = await fetch('https://sideflip.org/api/verify-apple-purchase', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ signedTransaction: purchase.purchaseToken }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || !body.entitlement?.verified) throw new Error(body.error || 'Your purchase could not be verified yet. Please try Restore Purchases.')
}

export default function ProScreen() {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const { connected, subscriptions, fetchProducts, requestPurchase, restorePurchases, finishTransaction } = useIAP({
    onPurchaseSuccess: async purchase => {
      try {
        await verifyWithSideFlip(purchase)
        await finishTransaction({ purchase, isConsumable: false })
        Alert.alert('SideFlip Pro is active', 'Your verified Pro access is ready.')
      } catch (error) { Alert.alert('Purchase received', error.message) } finally { setBusy(false) }
    },
    onPurchaseError: error => { setBusy(false); if (error?.code !== 'E_USER_CANCELLED') Alert.alert('Purchase not completed', error?.message || 'Please try again.') },
  })

  useEffect(() => { if (connected) fetchProducts({ skus: PRODUCT_IDS, type: 'subs' }).catch(error => Alert.alert('Store unavailable', error.message)) }, [connected, fetchProducts])
  const product = id => subscriptions.find(item => item.id === id)
  async function buy(id) { setBusy(true); try { await requestPurchase({ type: 'subs', request: { apple: { sku: id, appAccountToken: user.id, andDangerouslyFinishTransactionAutomatically: false } } }) } catch (error) { setBusy(false); Alert.alert('Purchase not started', error.message) } }
  async function restore() { setBusy(true); try { await restorePurchases({ alsoPublishToEventListenerIOS: true }); Alert.alert('Restore complete', 'Any eligible Apple purchases were sent for verification.') } catch (error) { Alert.alert('Restore failed', error.message) } finally { setBusy(false) } }

  return <ScrollView style={s.root} contentContainerStyle={s.content}>
    <Text style={s.title}>SideFlip Pro</Text><Text style={s.sub}>Unlock analytics, AI tools, reports, more Trade-Up Goals, and upcoming receipt scanning.</Text>
    {PRODUCT_IDS.map(id => { const annual = id.endsWith('.annual'); const item = product(id); return <View key={id} style={[s.card, annual && s.featured]}><Text style={s.plan}>{annual ? 'Annual' : 'Monthly'}</Text><Text style={s.price}>{annual ? '$8.33' : (item?.displayPrice || '$12.99')}<Text style={s.unit}>/month</Text></Text><Text style={s.detail}>{annual ? '$99.99 billed annually' : 'Billed monthly'}</Text><TouchableOpacity disabled={!connected || busy || !item} onPress={() => buy(id)} style={s.button}><Text style={s.buttonText}>{busy ? 'Working…' : `Choose ${annual ? 'Annual' : 'Monthly'}`}</Text></TouchableOpacity></View> })}
    <TouchableOpacity disabled={busy} onPress={restore} style={s.restore}><Text style={s.restoreText}>Restore Purchases</Text></TouchableOpacity>
    <Text style={s.legal}>Payment is charged to your Apple ID. Subscriptions renew automatically unless canceled at least 24 hours before the current period ends. Manage subscriptions in your Apple ID settings.</Text>
  </ScrollView>
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:'#FAFAF7'},content:{padding:24},title:{fontSize:30,fontWeight:'800',color:'#1A1917'},sub:{color:'#5C5850',lineHeight:21,marginTop:8,marginBottom:20},card:{backgroundColor:'#fff',padding:18,borderRadius:14,marginBottom:12,borderWidth:1,borderColor:'#E8E4DE'},featured:{borderColor:'#C8402F',borderWidth:2},plan:{fontSize:17,fontWeight:'800',color:'#1A1917'},price:{fontSize:28,fontWeight:'800',color:'#C8402F',marginTop:6},unit:{fontSize:15,fontWeight:'700',color:'#C8402F'},detail:{color:'#8C8880',marginTop:3},button:{backgroundColor:'#C8402F',alignItems:'center',padding:14,borderRadius:10,marginTop:15},buttonText:{color:'#fff',fontWeight:'800'},restore:{alignItems:'center',padding:16},restoreText:{color:'#C8402F',fontWeight:'700'},legal:{fontSize:12,color:'#8C8880',textAlign:'center',lineHeight:18,marginTop:8}})
