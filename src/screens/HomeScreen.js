import { useEffect, useState, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, TextInput, Alert, Image } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const ACCENT = '#C8402F'
const fmt = n => '$' + Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const getTotalInvested = p => (p.expenses||[]).reduce((s,e)=>s+Number(e.amount),0) + (Number(p.purchase_price)||0)
const getProfit = p => p.sale_price ? Number(p.sale_price) - getTotalInvested(p) : null
const ICONS = {mower:'🚜',car:'🚗',motorcycle:'🏍️',atv:'🏎️',boat:'⛵',bicycle:'🚲',watch:'⌚',electronics:'📱',gaming:'🎮',tool:'🔧',exercise:'💪',instrument:'🎸',furniture:'🪑',other:'📦'}

export default function HomeScreen({ navigation }) {
  const { user, signOut } = useAuth()
  const [projects, setProjects] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState('active')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('projects').select('*, expenses(*)').eq('user_id', user.id).order('created_at', { ascending: false })
    setProjects(data || [])
    setRefreshing(false)
  }, [user])

  useEffect(() => { load() }, [load])

  const active = projects.filter(p => p.status === 'active')
  const sold = projects.filter(p => p.status === 'sold')
  const all = tab === 'active' ? active : sold
  const shown = search ? all.filter(p => p.title?.toLowerCase().includes(search.toLowerCase()) || p.category?.toLowerCase().includes(search.toLowerCase())) : all
  const totalInvested = active.reduce((s,p) => s + getTotalInvested(p), 0)
  const totalProfit = sold.reduce((s,p) => s + (getProfit(p)||0), 0)

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.logo}><Text style={s.logoSide}>Side</Text><Text style={s.logoFlip}>Flip</Text></Text>
        <TouchableOpacity onPress={() => Alert.alert('Account', user?.email, [{text:'Sign Out',style:'destructive',onPress:signOut},{text:'Cancel',style:'cancel'}])} style={s.avatar}>
          <Text style={s.avatarText}>{user?.email?.[0]?.toUpperCase()}</Text>
        </TouchableOpacity>
      </View>
      <View style={s.summaryBar}>
        {[['Active', active.length, ACCENT], ['In Projects', fmt(totalInvested), ACCENT], ['Total Profit', fmt(totalProfit), totalProfit>=0?'#2D7A4F':ACCENT]].map(([l,v,c]) => (
          <View key={l} style={s.summaryItem}><Text style={s.summaryLabel}>{l}</Text><Text style={[s.summaryValue,{color:c}]}>{v}</Text></View>
        ))}
      </View>
      <View style={s.tabs}>
        {[['active', `Active (${active.length})`], ['sold', `Sold (${sold.length})`]].map(([k,label]) => (
          <TouchableOpacity key={k} style={[s.tab, tab===k && s.tabActive]} onPress={() => setTab(k)}>
            <Text style={[s.tabText, tab===k && s.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {all.length > 4 && (
        <View style={s.searchWrap}>
          <Text style={{fontSize:14,marginRight:4}}>🔍</Text>
          <TextInput style={s.searchInput} placeholder="Search projects…" placeholderTextColor="#A8A49E" value={search} onChangeText={setSearch} />
          {!!search && <TouchableOpacity onPress={() => setSearch('')}><Text style={{color:'#A8A49E',fontSize:16,paddingHorizontal:8}}>✕</Text></TouchableOpacity>}
        </View>
      )}
      <FlatList
        data={shown} keyExtractor={p => p.id}
        contentContainerStyle={shown.length===0 ? s.emptyContainer : {paddingHorizontal:16,paddingBottom:100}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true);load()}} tintColor={ACCENT} />}
        renderItem={({ item: p }) => {
          const profit = getProfit(p)
          return (
            <TouchableOpacity style={s.card} onPress={() => navigation.navigate('ProjectDetail', {projectId:p.id, onReturn:load})}>
            {p.photo
              ? <Image source={{ uri: p.photo }} style={s.cardPhoto} resizeMode="cover" />
              : <View style={s.cardIcon}><Text style={{fontSize:28}}>{ICONS[p.category]||'📦'}</Text></View>
            }
              <View style={s.cardBody}>
                <Text style={s.cardCat}>{p.category}</Text>
                <Text style={s.cardTitle} numberOfLines={1}>{p.title}</Text>
                <View style={s.cardMeta}>
                  <Text style={s.cardInvested}>{fmt(getTotalInvested(p))} in</Text>
                  {p.status==='sold' && profit!==null && <Text style={[s.badge, profit<0 && s.badgeLoss]}>{profit>=0?'+':''}{fmt(profit)}</Text>}
                </View>
              </View>
              <Text style={s.chevron}>›</Text>
            </TouchableOpacity>
          )
        }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyIcon}>{tab==='active'?'🔧':'🏷️'}</Text>
            <Text style={s.emptyTitle}>{tab==='active'?'No active projects':'Nothing sold yet'}</Text>
            <Text style={s.emptySub}>{tab==='active'?'Tap + to add your first project':'Mark a project as sold to see it here'}</Text>
          </View>
        }
      />
      <TouchableOpacity style={s.fab} onPress={() => navigation.navigate('NewProject', {onReturn:load})}>
        <Text style={s.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:'#FAFAF7'},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingTop:56,paddingBottom:12,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#E8E4DE'},
  logo:{fontSize:30,fontWeight:'800'},logoSide:{color:'#1A1917'},logoFlip:{color:'#C8402F'},
  avatar:{width:36,height:36,borderRadius:18,backgroundColor:ACCENT,alignItems:'center',justifyContent:'center'},
  avatarText:{color:'#fff',fontWeight:'700',fontSize:15},
  summaryBar:{flexDirection:'row',backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#E8E4DE'},
  summaryItem:{flex:1,alignItems:'center',paddingVertical:14},
  summaryLabel:{fontSize:10,color:'#8C8880',textTransform:'uppercase',letterSpacing:0.5,marginBottom:3},
  summaryValue:{fontSize:16,fontWeight:'700'},
  tabs:{flexDirection:'row',paddingHorizontal:16,paddingTop:12,gap:8},
  tab:{flex:1,paddingVertical:8,borderRadius:8,alignItems:'center',backgroundColor:'#F0EDE8'},
  tabActive:{backgroundColor:'#1A1917'},tabText:{fontSize:13,fontWeight:'600',color:'#8C8880'},tabTextActive:{color:'#fff'},
  searchWrap:{flexDirection:'row',alignItems:'center',marginHorizontal:16,marginTop:10,backgroundColor:'#fff',borderRadius:10,borderWidth:1,borderColor:'#E8E4DE',paddingHorizontal:10},
  searchInput:{flex:1,paddingVertical:10,fontSize:14,color:'#1A1917'},
  card:{flexDirection:'row',alignItems:'center',backgroundColor:'#fff',borderRadius:12,marginBottom:10,marginTop:4,padding:14,shadowColor:'#000',shadowOpacity:0.04,shadowRadius:8,shadowOffset:{width:0,height:2},elevation:2},
  cardIcon:{width:56,height:56,borderRadius:12,backgroundColor:'#F5F2EE',alignItems:'center',justifyContent:'center',marginRight:12},
  cardPhoto:{width:56,height:56,borderRadius:12,marginRight:12},
  cardBody:{flex:1},cardCat:{fontSize:10,color:'#A8A49E',textTransform:'uppercase',letterSpacing:0.5,marginBottom:2},
  cardTitle:{fontSize:16,fontWeight:'700',color:'#1A1917',marginBottom:4},
  cardMeta:{flexDirection:'row',alignItems:'center',gap:8},cardInvested:{fontSize:13,color:'#8C8880'},
  badge:{backgroundColor:'#E8F5EE',color:'#2D7A4F',fontSize:12,fontWeight:'700',paddingHorizontal:8,paddingVertical:2,borderRadius:6},
  badgeLoss:{backgroundColor:'#FDECEA',color:'#C8402F'},
  chevron:{fontSize:22,color:'#D4CDC1',paddingLeft:8},
  emptyContainer:{flex:1,justifyContent:'center'},
  empty:{alignItems:'center',padding:40},emptyIcon:{fontSize:48,marginBottom:16},
  emptyTitle:{fontSize:18,fontWeight:'700',color:'#1A1917',marginBottom:8},
  emptySub:{fontSize:14,color:'#8C8880',textAlign:'center'},
  fab:{position:'absolute',bottom:32,right:24,width:56,height:56,borderRadius:28,backgroundColor:ACCENT,alignItems:'center',justifyContent:'center',shadowColor:ACCENT,shadowOpacity:0.4,shadowRadius:12,shadowOffset:{width:0,height:4},elevation:6},
  fabText:{color:'#fff',fontSize:28,fontWeight:'300',marginTop:-2},
})
