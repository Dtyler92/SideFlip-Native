import { useCallback, useRef, useState } from 'react'
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'
import { listMyStuffItems } from '../lib/myStuffClient'
import { canCreateMyStuffItem } from './myStuffModel'

const ACCENT = '#C8402F'

export default function MyStuffScreen({ navigation }) {
  const { user, isPro } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const requestGeneration = useRef(0)

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!user?.id) return
    const generation = ++requestGeneration.current
    if (!quiet) setLoading(true)
    setError('')
    try {
      const nextItems = await listMyStuffItems(user.id)
      if (generation !== requestGeneration.current) return
      setItems(nextItems)
    } catch (nextError) {
      if (generation !== requestGeneration.current) return
      setError(nextError.message || 'Could not load your items.')
    } finally {
      if (generation !== requestGeneration.current) return
      setLoading(false)
      setRefreshing(false)
    }
  }, [user?.id])

  useFocusEffect(useCallback(() => {
    load()
    return () => { requestGeneration.current += 1 }
  }, [load]))

  const canCreate = canCreateMyStuffItem({ isPro, itemCount: items.length })
  function startCreate() {
    navigation.navigate('MyStuffCreate')
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={ACCENT} /></View>

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load({ quiet: true }) }} tintColor={ACCENT} />}
      >
        <Text style={s.heading}>My Stuff</Text>
        <Text style={s.subheading}>Keep maintenance, readings, and service history for the things you own.</Text>

        {!!error && <View style={s.errorCard}><Text style={s.errorText}>{error}</Text><TouchableOpacity onPress={() => load()} accessibilityRole="button" accessibilityLabel="Retry loading My Stuff"><Text style={s.retry}>Try Again</Text></TouchableOpacity></View>}

        <TouchableOpacity style={s.primary} onPress={startCreate} accessibilityRole="button" accessibilityLabel="Add a My Stuff item">
          <Text style={s.primaryText}>Add an Item</Text>
        </TouchableOpacity>
        {!canCreate && (
          <View style={s.proCard}>
            <Text style={s.proEyebrow}>SIDEFLIP PRO</Text>
            <Text style={s.proTitle}>Free includes one My Stuff item.</Text>
            <Text style={s.muted}>Your existing items and maintenance history always remain available. SideFlip Pro supports additional items.</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Pro')} accessibilityRole="button" accessibilityLabel="View SideFlip Pro information"><Text style={s.proLink}>View SideFlip Pro</Text></TouchableOpacity>
          </View>
        )}

        <Text style={s.sectionTitle}>Your items</Text>
        {items.length === 0 ? (
          <View style={s.empty}><Text style={s.emptyTitle}>Nothing here yet</Text><Text style={s.muted}>Add an item to start tracking maintenance.</Text></View>
        ) : items.map(item => (
          <TouchableOpacity
            key={item.id}
            style={s.itemCard}
            onPress={() => navigation.navigate('MyStuffDetail', { itemId: item.id })}
            accessibilityRole="button"
          >
            <View style={s.row}>
              <View style={s.flex}>
                <Text style={s.itemName}>{item.name}</Text>
                <Text style={s.category}>{item.category || 'Other'}</Text>
              </View>
              <Text style={s.chevron}>›</Text>
            </View>
            <View style={s.readingRow}>
              {item.current_mileage != null && <Text style={s.reading}>{Number(item.current_mileage).toLocaleString()} mi</Text>}
              {item.current_hours != null && <Text style={s.reading}>{Number(item.current_hours).toLocaleString()} hr</Text>}
              {item.acquired_on && <Text style={s.reading}>Acquired {item.acquired_on}</Text>}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:'#FAFAF7'},center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#FAFAF7'},content:{padding:20,paddingBottom:90},
  heading:{fontSize:30,fontWeight:'800',color:'#1A1917'},subheading:{fontSize:15,color:'#6B665E',lineHeight:22,marginTop:6,marginBottom:20},
  primary:{backgroundColor:ACCENT,borderRadius:12,padding:16,alignItems:'center'},primaryText:{color:'#fff',fontWeight:'700',fontSize:16},
  proCard:{backgroundColor:'#FFF4E5',borderWidth:1,borderColor:'#F0D4A5',borderRadius:14,padding:16},proEyebrow:{fontSize:11,fontWeight:'800',letterSpacing:1,color:ACCENT},proTitle:{fontSize:17,fontWeight:'700',color:'#1A1917',marginTop:4},proLink:{color:ACCENT,fontWeight:'700',marginTop:12},
  sectionTitle:{fontSize:18,fontWeight:'800',color:'#1A1917',marginTop:26,marginBottom:10},empty:{backgroundColor:'#fff',borderRadius:14,padding:22,borderWidth:1,borderColor:'#E8E4DE',alignItems:'center'},emptyTitle:{fontWeight:'700',fontSize:17,color:'#1A1917',marginBottom:5},muted:{color:'#6B665E',lineHeight:20},
  itemCard:{backgroundColor:'#fff',borderRadius:14,padding:16,borderWidth:1,borderColor:'#E8E4DE',marginBottom:10},row:{flexDirection:'row',alignItems:'center'},flex:{flex:1},itemName:{fontSize:18,fontWeight:'700',color:'#1A1917'},category:{fontSize:13,color:'#6B665E',marginTop:3,textTransform:'capitalize'},chevron:{fontSize:30,color:'#A8A49E'},readingRow:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:12},reading:{fontSize:12,color:'#5C5850',backgroundColor:'#F3F1EC',paddingHorizontal:9,paddingVertical:5,borderRadius:12},
  errorCard:{backgroundColor:'#FDEDEA',borderRadius:12,padding:14,marginBottom:14},errorText:{color:'#8D2C20'},retry:{color:ACCENT,fontWeight:'700',marginTop:8},
})
