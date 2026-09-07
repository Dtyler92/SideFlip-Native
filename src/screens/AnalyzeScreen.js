import { useCallback, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, InputAccessoryView, Keyboard, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'
import { formatMoneyForCurrency } from '../lib/currencyModel'
import { supabase } from '../lib/supabase'
import { deleteSavedAnalysis, loadSavedAnalyses, saveAnalysis } from '../lib/analysisStore'
import { MAX_CURRENCY_AMOUNT, MAX_PLATFORM_FEE_PERCENT, MAX_ROI_PERCENT, analyzeDeal, calculateListPrice, calculateMaximumBuyPrice, calculateProfit, normalizeCurrencyAmount, projectAnalysisDraft, quickDealCheck } from '../domain/analyzeModel'

const ACCENT = '#C8402F'
const GREEN = '#2D7A4F'
const BG = '#FAFAF7'
const INK = '#1A1917'
const MUTED = '#6B675F'
const TOOLS = [
  ['deal', 'Deal Analyzer'], ['quick', 'Quick Deal Check'], ['list', 'List Price Calculator'],
  ['max', 'Maximum Buy Price'], ['profit', 'Profit Calculator'],
]
const PLATFORM_PRESETS = [
  ['none', 'None', '0'], ['facebook', 'Facebook', '0'], ['ebay', 'eBay', '13'],
  ['craigslist', 'Craigslist', '0'], ['custom', 'Custom', ''],
]
const ROI_PRESETS = ['10', '25', '50', '100', '150']
const ANALYZE_NUMERIC_ACCESSORY_ID = 'analyze-numeric-keyboard'

const emptyDeal = {
  itemName:'', projectId:null, purchasePrice:'', repairsMaterials:'', parts:'', fuelTravel:'', shippingCost:'', otherExpenses:'',
  expectedSellingPrice:'', platformFeePct:'0', sellerPaidShipping:'', salesTaxOtherFees:'', desiredMinimumProfit:'',
}
const emptyQuick = { askingPrice:'', estimatedRepairs:'', expectedResaleValue:'', desiredMinimumProfit:'' }
const emptyList = { totalInvested:'', targetMode:'profit', targetValue:'', platformFeePct:'0', sellerPaidShipping:'', additionalSellingCosts:'' }
const emptyMax = { expectedSellingPrice:'', nonPurchaseExpenses:'', desiredMinimumProfit:'', platformFeePct:'0', sellerPaidShipping:'', otherSellingCosts:'' }
const emptyProfit = { totalInvested:'', sellingPrice:'', platformFeePct:'0', sellerPaidShipping:'', additionalSellingCosts:'' }

function boundedNumericText(value, maximum) {
  const text = String(value ?? '')
  const parsed = Number(text)
  return Number.isFinite(parsed) && parsed > maximum ? String(maximum) : text
}

function Field({ label, value, onChangeText, placeholder='0.00', money=true, currencySymbol='$', hint, testID, keyboardType, maximum=money ? MAX_CURRENCY_AMOUNT : null }) {
  const numeric = money || keyboardType === 'decimal-pad'
  const change = text => onChangeText(maximum == null ? text : boundedNumericText(text, maximum))
  return <View style={s.field}>
    <Text style={s.label}>{label}</Text>
    <View style={s.inputWrap}>{money && <Text style={s.prefix}>{currencySymbol}</Text>}<TextInput
      testID={testID} style={s.input} value={String(value ?? '')} onChangeText={change} placeholder={placeholder}
      placeholderTextColor="#737069" keyboardType={keyboardType || (money ? 'decimal-pad' : 'default')} maxLength={numeric ? 14 : 120}
      inputAccessoryViewID={numeric ? ANALYZE_NUMERIC_ACCESSORY_ID : undefined}
      accessibilityLabel={label} accessibilityHint={maximum == null ? undefined : `Maximum ${maximum}`}
    /></View>
    {!!hint && <Text style={s.hint}>{hint}</Text>}
  </View>
}

function CurrencyField(props) {
  const { currencySymbol } = useAuth()
  return <Field {...props} currencySymbol={currencySymbol}/>
}

function ChipRow({ options, value, onChange }) {
  return <View style={s.chipRow}>{options.map(([key,label]) => <TouchableOpacity key={key} accessibilityRole="button"
    accessibilityState={{selected:value===key}} onPress={()=>onChange(key)} style={[s.chip,value===key&&s.chipActive]}>
    <Text style={[s.chipText,value===key&&s.chipTextActive]}>{label}</Text>
  </TouchableOpacity>)}</View>
}

function PlatformPicker({ preset, setPreset, fee, setFee }) {
  function select(next) {
    setPreset(next)
    const found = PLATFORM_PRESETS.find(([key])=>key===next)
    if (next !== 'custom') setFee(found?.[2] || '0')
  }
  return <View style={s.field}>
    <Text style={s.label}>Selling Platform / Fee</Text>
    <ChipRow options={PLATFORM_PRESETS.map(([key,label])=>[key,label])} value={preset} onChange={select}/>
    {preset === 'custom' && <View style={[s.inputWrap,{marginTop:8}]}><TextInput style={s.input} value={fee} onChangeText={value=>setFee(boundedNumericText(value,MAX_PLATFORM_FEE_PERCENT))}
      placeholder="Custom fee" placeholderTextColor="#737069" keyboardType="decimal-pad" maxLength={5} inputAccessoryViewID={ANALYZE_NUMERIC_ACCESSORY_ID} accessibilityLabel="Custom platform fee percentage" accessibilityHint={`Maximum ${MAX_PLATFORM_FEE_PERCENT} percent`}/><Text style={s.suffix}>%</Text></View>}
    {preset !== 'custom' && <Text style={s.hint}>{fee || '0'}% estimated platform fee. You can choose Custom to edit it.</Text>}
  </View>
}

function Metric({ label, value, tone='default', primary=false }) {
  const color = tone==='positive'?GREEN:tone==='negative'?ACCENT:INK
  return <View style={[s.metric,primary&&s.metricPrimary]}><Text style={s.metricLabel}>{label}</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={[s.metricValue,{color},primary&&s.metricValuePrimary]}>{value}</Text></View>
}

function Rating({ result }) {
  if (!result) return null
  const color = result.ratingTone==='negative'?ACCENT:result.ratingTone==='caution'?'#9A6500':GREEN
  return <View accessibilityLiveRegion="polite" style={[s.rating,{borderColor:color}]}><Text style={[s.ratingTitle,{color}]}>{result.dealRating}</Text><Text style={s.ratingText}>{result.ratingExplanation}</Text></View>
}

function ResultCard({ children }) { return <View style={s.resultCard}>{children}</View> }

export default function AnalyzeScreen({ navigation, route }) {
  const insets = useSafeAreaInsets()
  const { user, formatMoney, currency } = useAuth()
  const loadGeneration = useRef(0)
  const saveInFlight = useRef(false)
  const deleteInFlight = useRef(false)
  const [tool,setTool] = useState('deal')
  const [deal,setDeal] = useState(emptyDeal)
  const [quick,setQuick] = useState(emptyQuick)
  const [list,setList] = useState(emptyList)
  const [maxBuy,setMaxBuy] = useState(emptyMax)
  const [profit,setProfit] = useState(emptyProfit)
  const [platformPreset,setPlatformPreset] = useState('none')
  const [listPlatformPreset,setListPlatformPreset] = useState('none')
  const [maxPlatformPreset,setMaxPlatformPreset] = useState('none')
  const [profitPlatformPreset,setProfitPlatformPreset] = useState('none')
  const [profitPreset,setProfitPreset] = useState('custom')
  const [projects,setProjects] = useState([])
  const [projectSearch,setProjectSearch] = useState('')
  const [showProjects,setShowProjects] = useState(false)
  const [saved,setSaved] = useState([])
  const [saving,setSaving] = useState(false)
  const [deletingId,setDeletingId] = useState(null)

  const loadData = useCallback(async generation => {
    const requestedId = route?.params?.projectId
    try {
      const [projectResult, savedRows] = await Promise.all([
        supabase.from('projects').select('id,title,status,purchase_price,expenses(id,category,amount,description)').eq('user_id', user.id).order('created_at',{ascending:false}),
        loadSavedAnalyses(user.id),
      ])
      if (generation !== loadGeneration.current) return
      if (projectResult.error) Alert.alert('Could not load projects', projectResult.error.message)
      else {
        const rows = projectResult.data || []
        setProjects(rows)
        if (requestedId) {
          const selected = rows.find(row=>row.id===requestedId)
          if (selected) applyProject(selected,{fromLoad:true})
          else {
            setDeal(emptyDeal)
            setList(emptyList)
            Alert.alert('Project unavailable','That Project could not be loaded. Choose another Project to analyze.')
          }
          if (requestedId === route?.params?.projectId) navigation.setParams({projectId:undefined})
        }
      }
      setSaved(savedRows)
    } catch (error) {
      if (generation === loadGeneration.current) Alert.alert('Could not load Analyze data', error.message)
    }
  },[navigation,route?.params?.projectId,user.id])

  useFocusEffect(useCallback(()=>{
    const generation = ++loadGeneration.current
    loadData(generation)
    return () => { if (loadGeneration.current === generation) loadGeneration.current += 1 }
  },[loadData]))

  function applyProject(project,{fromLoad=false}={}) {
    if (!fromLoad) {
      loadGeneration.current += 1
      if (route?.params?.projectId) navigation.setParams({projectId:undefined})
    }
    const draft = projectAnalysisDraft(project)
    const values = Object.fromEntries(Object.entries(draft).map(([key,value])=>[key,value==null?'':String(value)]))
    setDeal({...emptyDeal,...values})
    setList({...emptyList,totalInvested:String(draft.totalInvested)})
    setPlatformPreset('none')
    setListPlatformPreset('none')
    setTool('deal')
    setShowProjects(false)
    setProjectSearch('')
  }

  const dealResult = useMemo(()=>analyzeDeal(deal),[deal])
  const quickResult = useMemo(()=>quickDealCheck(quick),[quick])
  const listResult = useMemo(()=>calculateListPrice(list),[list])
  const maxResult = useMemo(()=>calculateMaximumBuyPrice(maxBuy),[maxBuy])
  const profitResult = useMemo(()=>calculateProfit(profit),[profit])
  const money = value=>formatMoney(Number(value)||0)
  const pct = value=>value==null?'N/A':`${Number(value).toFixed(1)}%`
  const shownProjects = projects.filter(p=>!projectSearch||p.title?.toLowerCase().includes(projectSearch.toLowerCase()))

  async function saveCurrentDeal() {
    if (!deal.itemName.trim()) return Alert.alert('Name this analysis','Enter an item or project name before saving.')
    if (saveInFlight.current) return
    saveInFlight.current = true
    setSaving(true)
    try {
      const purchasePrice = normalizeCurrencyAmount(deal.purchasePrice)
      const record = await saveAnalysis(user.id,{
        itemName:deal.itemName.trim(),projectId:deal.projectId||null,purchasePrice,
        estimatedExpenses:dealResult.totalInvestment-purchasePrice,expectedSellingPrice:dealResult.expectedRevenue,
        platform:platformPreset,currency,platformFeePct:Number(deal.platformFeePct)||0,projectedProfit:dealResult.expectedProfit,
        projectedRoi:dealResult.roiPct,maximumPurchasePrice:dealResult.maximumPurchasePrice,
        recommendedListPrice:calculateListPrice({totalInvested:dealResult.totalInvestment,targetMode:'profit',targetValue:deal.desiredMinimumProfit,platformFeePct:deal.platformFeePct,sellerPaidShipping:deal.sellerPaidShipping,additionalSellingCosts:deal.salesTaxOtherFees}).recommendedListPrice,
        schemaVersion:1,estimateSource:'user_entered',inputs:{...deal},
      })
      loadGeneration.current += 1
      setSaved(rows=>[record,...rows.filter(row=>row.id!==record.id)])
      Alert.alert('Analysis saved','Saved on this device. Your Project and expense records were not changed.')
    } catch (error) { Alert.alert('Could not save analysis',error.message) }
    finally { saveInFlight.current=false; setSaving(false) }
  }

  function loadAnalysis(record) {
    if (record.currency !== currency) return Alert.alert('Currency changed',`This snapshot was saved in ${record.currency}. Change your profile currency to ${record.currency} before loading it.`)
    setDeal({...emptyDeal,...record.inputs,projectId:record.projectId||null,itemName:record.itemName||''})
    const preset = PLATFORM_PRESETS.find(([, ,fee])=>fee===String(record.inputs.platformFeePct) && record.platform!=='custom')?.[0] || 'custom'
    setPlatformPreset(record.platform||preset)
    setTool('deal')
  }

  async function removeAnalysis(record) {
    if (deleteInFlight.current) return
    deleteInFlight.current = true
    setDeletingId(record.id)
    try {
      const rows = await deleteSavedAnalysis(user.id,record.id)
      loadGeneration.current += 1
      setSaved(rows)
    } catch (error) {
      Alert.alert('Could not delete analysis', error.message)
    } finally {
      deleteInFlight.current=false
      setDeletingId(null)
    }
  }

  return <View style={s.root}><ScrollView contentContainerStyle={[s.content,{paddingTop:insets.top+18,paddingBottom:100+insets.bottom}]}
    keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS==='ios'?'interactive':'on-drag'} automaticallyAdjustKeyboardInsets={Platform.OS==='ios'}>
    <Text style={s.heading}>Analyze</Text><Text style={s.sub}>Know what to pay, what to list for, and whether the flip is worth it.</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={s.toolRow} accessibilityLabel="Analyze tools">{TOOLS.map(([key,label])=><TouchableOpacity key={key}
      style={[s.toolCard,tool===key&&s.toolCardActive]} onPress={()=>setTool(key)} accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Opens this analysis tool" accessibilityState={{selected:tool===key}}>
      <Text style={s.toolIcon}>{key==='deal'?'📈':key==='quick'?'⚡':key==='list'?'🏷️':key==='max'?'🎯':'💵'}</Text><Text style={[s.toolText,tool===key&&s.toolTextActive]}>{label}</Text>
    </TouchableOpacity>)}</ScrollView>

    {tool==='deal'&&<>
      <View style={s.hero}><Text style={s.heroEyebrow}>PRIMARY TOOL</Text><Text style={s.heroTitle}>Deal Analyzer</Text><Text style={s.heroText}>Evaluate a potential flip before you buy it.</Text></View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Analyze existing Project" style={s.projectButton} onPress={()=>setShowProjects(true)}><Text style={s.projectButtonText}>🔎 Analyze Existing Project</Text></TouchableOpacity>
      <View style={s.card}>
        <CurrencyField label="Item / Project Name" money={false} value={deal.itemName} onChangeText={v=>setDeal(d=>({...d,itemName:v}))} placeholder="What are you flipping?"/>
        {!!deal.projectId&&<View style={s.linkedBadge}><Text style={s.linkedBadgeText}>Linked Project · values are a private analysis copy</Text></View>}
        <Text style={s.sectionTitle}>Investment</Text>
        <CurrencyField label="Purchase Price" value={deal.purchasePrice} onChangeText={v=>setDeal(d=>({...d,purchasePrice:v}))}/>
        <CurrencyField label="Estimated Repairs / Materials" value={deal.repairsMaterials} onChangeText={v=>setDeal(d=>({...d,repairsMaterials:v}))}/>
        <CurrencyField label="Parts" value={deal.parts} onChangeText={v=>setDeal(d=>({...d,parts:v}))}/>
        <CurrencyField label="Fuel / Travel" value={deal.fuelTravel} onChangeText={v=>setDeal(d=>({...d,fuelTravel:v}))}/>
        <CurrencyField label="Shipping Cost" value={deal.shippingCost} onChangeText={v=>setDeal(d=>({...d,shippingCost:v}))}/>
        <CurrencyField label="Other Expenses" value={deal.otherExpenses} onChangeText={v=>setDeal(d=>({...d,otherExpenses:v}))}/>
        <Text style={s.sectionTitle}>Sale Estimate</Text>
        <CurrencyField label="Expected Selling Price" value={deal.expectedSellingPrice} onChangeText={v=>setDeal(d=>({...d,expectedSellingPrice:v}))}/>
        <PlatformPicker preset={platformPreset} setPreset={setPlatformPreset} fee={deal.platformFeePct} setFee={v=>setDeal(d=>({...d,platformFeePct:v}))}/>
        <CurrencyField label="Seller-Paid Shipping (optional)" value={deal.sellerPaidShipping} onChangeText={v=>setDeal(d=>({...d,sellerPaidShipping:v}))}/>
        <CurrencyField label="Sales Tax / Other Selling Fees (optional)" value={deal.salesTaxOtherFees} onChangeText={v=>setDeal(d=>({...d,salesTaxOtherFees:v}))}/>
        <CurrencyField label="Desired Minimum Profit" value={deal.desiredMinimumProfit} onChangeText={v=>setDeal(d=>({...d,desiredMinimumProfit:v}))}/>
        <Text style={s.futureNote}>Estimated resale values are entered by you. This field can later accept verified comparable-sales research without changing the calculation engine.</Text>
      </View>
      {Number(deal.expectedSellingPrice)>0&&<ResultCard><Rating result={dealResult}/><View style={s.metricGrid}>
        <Metric primary label="Expected Profit" value={money(dealResult.expectedProfit)} tone={dealResult.expectedProfit>=0?'positive':'negative'}/>
        <Metric primary label="ROI" value={pct(dealResult.roiPct)} tone={dealResult.roiPct>=0?'positive':'negative'}/>
        <Metric label="Maximum Buy Price" value={money(dealResult.maximumPurchasePrice)} />
        <Metric label="Break-Even Price" value={money(dealResult.breakEvenSellingPrice)} />
        <Metric label="Total Investment" value={money(dealResult.totalInvestment)} />
        <Metric label="Expected Revenue" value={money(dealResult.expectedRevenue)} />
        <Metric label="Platform Fees" value={money(dealResult.platformFees)} />
        <Metric label="Total Selling Costs" value={money(dealResult.totalSellingCosts)} />
        <Metric label="Profit Margin" value={pct(dealResult.profitMarginPct)} />
      </View><TouchableOpacity accessibilityRole="button" accessibilityLabel="Save analysis" disabled={saving} onPress={saveCurrentDeal} style={[s.primaryButton,saving&&s.disabled]}>{saving?<ActivityIndicator color="#fff"/>:<Text style={s.primaryButtonText}>Save Analysis</Text>}</TouchableOpacity></ResultCard>}
    </>}

    {tool==='quick'&&<><View style={s.hero}><Text style={s.heroEyebrow}>UNDER 10 SECONDS</Text><Text style={s.heroTitle}>Quick Deal Check</Text><Text style={s.heroText}>Four numbers for a fast buy-or-pass decision.</Text></View><View style={s.card}>
      <CurrencyField label="Asking Price" value={quick.askingPrice} onChangeText={v=>setQuick(q=>({...q,askingPrice:v}))}/><CurrencyField label="Estimated Repairs" value={quick.estimatedRepairs} onChangeText={v=>setQuick(q=>({...q,estimatedRepairs:v}))}/><CurrencyField label="Expected Resale Value" value={quick.expectedResaleValue} onChangeText={v=>setQuick(q=>({...q,expectedResaleValue:v}))}/><CurrencyField label="Desired Minimum Profit" value={quick.desiredMinimumProfit} onChangeText={v=>setQuick(q=>({...q,desiredMinimumProfit:v}))}/></View>
      {Number(quick.expectedResaleValue)>0&&<ResultCard><Rating result={quickResult}/><View style={s.metricGrid}><Metric primary label="Expected Profit" value={money(quickResult.expectedProfit)} tone={quickResult.expectedProfit>=0?'positive':'negative'}/><Metric primary label="ROI" value={pct(quickResult.roiPct)} tone={quickResult.roiPct>=0?'positive':'negative'}/><Metric label="Maximum Buy Price" value={money(quickResult.maximumBuyPrice)}/><Metric label="Expected Investment" value={money(quickResult.expectedInvestment)}/></View></ResultCard>}</>}

    {tool==='list'&&<><View style={s.hero}><Text style={s.heroTitle}>List Price Calculator</Text><Text style={s.heroText}>Set a profit target and account for selling costs.</Text></View><View style={s.card}>
      <CurrencyField label="Total Invested" value={list.totalInvested} onChangeText={v=>setList(x=>({...x,totalInvested:v}))}/><Text style={s.label}>Desired Profit</Text><ChipRow options={[["profit","Profit Amount"],["roi","ROI %"]]} value={list.targetMode} onChange={v=>{setProfitPreset(v==='roi'?'10':'custom');setList(x=>({...x,targetMode:v,targetValue:v==='roi'?'10':''}))}}/>
      {list.targetMode==='roi'&&<><Text style={[s.label,{marginTop:14}]}>ROI Target</Text><ChipRow options={[...ROI_PRESETS.map(v=>[v,`${v}%`]),['custom','Custom']]} value={profitPreset} onChange={v=>{setProfitPreset(v);setList(x=>({...x,targetValue:v==='custom'?'':v}))}}/>{profitPreset === 'custom'&&<CurrencyField label="Custom ROI %" money={false} keyboardType="decimal-pad" maximum={MAX_ROI_PERCENT} value={list.targetValue} onChangeText={v=>setList(x=>({...x,targetValue:v}))} placeholder="Enter ROI percentage"/>}</>}
      {list.targetMode==='profit'&&<CurrencyField label="Target Profit" value={list.targetValue} onChangeText={v=>setList(x=>({...x,targetValue:v}))}/>}<PlatformPicker preset={listPlatformPreset} setPreset={setListPlatformPreset} fee={list.platformFeePct} setFee={v=>setList(x=>({...x,platformFeePct:v}))}/><CurrencyField label="Seller-Paid Shipping" value={list.sellerPaidShipping} onChangeText={v=>setList(x=>({...x,sellerPaidShipping:v}))}/><CurrencyField label="Additional Selling Costs" value={list.additionalSellingCosts} onChangeText={v=>setList(x=>({...x,additionalSellingCosts:v}))}/></View>
      {Number(list.totalInvested)>0&&<ResultCard><View style={s.metricGrid}><Metric primary label="Recommended List Price" value={money(listResult.recommendedListPrice)} tone="positive"/><Metric primary label="Suggested Minimum Offer" value={money(listResult.suggestedMinimumOffer)}/><Metric label="Expected Profit" value={money(listResult.expectedProfit)} tone="positive"/><Metric label="Expected ROI" value={pct(listResult.expectedRoiPct)} tone="positive"/><Metric label="Break-Even Price" value={money(listResult.breakEvenPrice)}/></View><Text style={s.resultNote}>{listResult.minimumOfferBasis==='negotiation_floor'?'The suggested minimum is a negotiation floor at 92% of list price.':'Break-even is higher than 92% of list price, so the suggested minimum was raised to avoid a projected loss.'} At that price, projected profit is {money(listResult.minimumOfferExpectedProfit)} ({pct(listResult.minimumOfferExpectedRoiPct)} ROI), which is {listResult.minimumOfferTargetComparison} your target.</Text></ResultCard>}</>}

    {tool==='max'&&<><View style={s.hero}><Text style={s.heroTitle}>Maximum Buy Price</Text><Text style={s.heroText}>Work backward from resale value and your minimum profit.</Text></View><View style={s.card}><CurrencyField label="Expected Resale Value" value={maxBuy.expectedSellingPrice} onChangeText={v=>setMaxBuy(x=>({...x,expectedSellingPrice:v}))}/><CurrencyField label="Estimated Expenses (excluding purchase)" value={maxBuy.nonPurchaseExpenses} onChangeText={v=>setMaxBuy(x=>({...x,nonPurchaseExpenses:v}))}/><CurrencyField label="Desired Minimum Profit" value={maxBuy.desiredMinimumProfit} onChangeText={v=>setMaxBuy(x=>({...x,desiredMinimumProfit:v}))}/><PlatformPicker preset={maxPlatformPreset} setPreset={setMaxPlatformPreset} fee={maxBuy.platformFeePct} setFee={v=>setMaxBuy(x=>({...x,platformFeePct:v}))}/><CurrencyField label="Seller-Paid Shipping" value={maxBuy.sellerPaidShipping} onChangeText={v=>setMaxBuy(x=>({...x,sellerPaidShipping:v}))}/><CurrencyField label="Other Selling Costs" value={maxBuy.otherSellingCosts} onChangeText={v=>setMaxBuy(x=>({...x,otherSellingCosts:v}))}/></View>{Number(maxBuy.expectedSellingPrice)>0&&<ResultCard><Metric primary label={maxResult.feasible?'Maximum Buy Price':'No Feasible Buy Price'} value={money(maxResult.maximumPurchasePrice)} tone={maxResult.feasible?'positive':'negative'}/><Metric label="Platform Fees" value={money(maxResult.platformFees)}/>{!maxResult.feasible&&<Text style={s.resultNote}>Even a free purchase would not meet the selected profit target after expenses and selling costs.</Text>}</ResultCard>}</>}

    {tool==='profit'&&<><View style={s.hero}><Text style={s.heroTitle}>Profit Calculator</Text><Text style={s.heroText}>See the bottom line after every selling cost.</Text></View><View style={s.card}><CurrencyField label="Total Invested" value={profit.totalInvested} onChangeText={v=>setProfit(x=>({...x,totalInvested:v}))}/><CurrencyField label="Selling Price" value={profit.sellingPrice} onChangeText={v=>setProfit(x=>({...x,sellingPrice:v}))}/><PlatformPicker preset={profitPlatformPreset} setPreset={setProfitPlatformPreset} fee={profit.platformFeePct} setFee={v=>setProfit(x=>({...x,platformFeePct:v}))}/><CurrencyField label="Seller-Paid Shipping" value={profit.sellerPaidShipping} onChangeText={v=>setProfit(x=>({...x,sellerPaidShipping:v}))}/><CurrencyField label="Additional Selling Costs" value={profit.additionalSellingCosts} onChangeText={v=>setProfit(x=>({...x,additionalSellingCosts:v}))}/></View>{Number(profit.sellingPrice)>0&&<ResultCard><View style={s.metricGrid}><Metric primary label="Expected Profit" value={money(profitResult.expectedProfit)} tone={profitResult.expectedProfit>=0?'positive':'negative'}/><Metric primary label="ROI" value={pct(profitResult.roiPct)} tone={profitResult.roiPct>=0?'positive':'negative'}/><Metric label="Profit Margin" value={pct(profitResult.profitMarginPct)}/><Metric label="Break-Even Price" value={money(profitResult.breakEvenPrice)}/><Metric label="Platform Fees" value={money(profitResult.platformFees)}/><Metric label="Total Selling Costs" value={money(profitResult.totalSellingCosts)}/></View></ResultCard>}</>}

    {!!saved.length&&<View style={s.card}><Text style={s.sectionTitle}>Saved Analyses on This Device</Text>{saved.map(record=><View key={record.id} style={s.savedRow}><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Load ${record.itemName} analysis`} style={s.savedLoad} onPress={()=>loadAnalysis(record)}><Text style={s.savedTitle}>{record.itemName}</Text><Text style={s.savedMeta}>{formatMoneyForCurrency(record.projectedProfit,record.currency)} profit · {pct(record.projectedRoi)} ROI · {new Date(record.analyzedAt).toLocaleDateString()}</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Delete ${record.itemName} analysis`} disabled={!!deletingId} onPress={()=>Alert.alert('Delete analysis?',record.itemName,[{text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',onPress:()=>removeAnalysis(record)}])}>{deletingId===record.id?<ActivityIndicator color={ACCENT}/>:<Text style={s.deleteText}>Delete</Text>}</TouchableOpacity></View>)}</View>}
  </ScrollView>

  {Platform.OS === 'ios' && <InputAccessoryView nativeID={ANALYZE_NUMERIC_ACCESSORY_ID}><View style={s.keyboardToolbar}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Dismiss number keyboard" style={s.keyboardDone} onPress={()=>Keyboard.dismiss()}><Text style={s.keyboardDoneText}>Done</Text></TouchableOpacity></View></InputAccessoryView>}

  <Modal visible={showProjects} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setShowProjects(false)}><View style={[s.modal,{paddingTop:Math.max(insets.top,20)}]}><View style={s.modalHeader}><Text style={s.modalTitle}>Analyze Existing Project</Text><TouchableOpacity style={s.closeButton} accessibilityRole="button" accessibilityLabel="Close Project picker" onPress={()=>setShowProjects(false)}><Text style={s.close}>Done</Text></TouchableOpacity></View><TextInput accessibilityLabel="Search Projects" style={s.search} value={projectSearch} onChangeText={setProjectSearch} placeholder="Search projects" placeholderTextColor="#737069"/><ScrollView contentContainerStyle={{padding:16,paddingBottom:40}} keyboardShouldPersistTaps="handled">{shownProjects.map(project=>{const draft=projectAnalysisDraft(project);return <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Analyze ${project.title}`} key={project.id} style={s.projectRow} onPress={()=>applyProject(project)}><View style={{flex:1}}><Text style={s.projectTitle}>{project.title}</Text><Text style={s.projectMeta}>{project.status==='sold'?'Sold':'Active'} · {money(draft.totalInvested)} invested</Text></View><Text style={s.chevron}>›</Text></TouchableOpacity>})}{!shownProjects.length&&<Text style={s.empty}>No matching projects.</Text>}</ScrollView></View></Modal>
  </View>
}

const s=StyleSheet.create({
  root:{flex:1,backgroundColor:BG},content:{paddingHorizontal:16},heading:{fontSize:30,fontWeight:'800',color:INK},sub:{fontSize:14,color:MUTED,lineHeight:20,marginTop:4,marginBottom:14},
  toolRow:{gap:9,paddingBottom:16},toolCard:{width:116,minHeight:76,borderRadius:14,padding:12,backgroundColor:'#fff',borderWidth:1,borderColor:'#E8E4DE'},toolCardActive:{backgroundColor:INK,borderColor:INK},toolIcon:{fontSize:20,marginBottom:6},toolText:{fontSize:12,fontWeight:'700',color:'#5C5850'},toolTextActive:{color:'#fff'},
  hero:{backgroundColor:'#FFF1EC',borderRadius:16,padding:18,marginBottom:12},heroEyebrow:{fontSize:10,fontWeight:'800',letterSpacing:1,color:ACCENT,marginBottom:5},heroTitle:{fontSize:22,fontWeight:'800',color:INK},heroText:{fontSize:13,color:'#5C5850',lineHeight:19,marginTop:4},
  projectButton:{backgroundColor:INK,borderRadius:12,padding:14,alignItems:'center',marginBottom:12},projectButtonText:{color:'#fff',fontWeight:'700',fontSize:14},card:{backgroundColor:'#fff',borderRadius:16,padding:16,marginBottom:14,shadowColor:'#000',shadowOpacity:.04,shadowRadius:8,shadowOffset:{width:0,height:2},elevation:2},
  sectionTitle:{fontSize:12,fontWeight:'800',color:MUTED,textTransform:'uppercase',letterSpacing:.7,marginTop:8,marginBottom:12},field:{marginBottom:14},label:{fontSize:13,fontWeight:'700',color:'#5C5850',marginBottom:7},inputWrap:{flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:'#E8E4DE',borderRadius:11,backgroundColor:BG,minHeight:48},prefix:{fontSize:17,fontWeight:'700',color:MUTED,paddingLeft:13},suffix:{fontSize:16,fontWeight:'700',color:MUTED,paddingRight:13},input:{flex:1,paddingHorizontal:12,paddingVertical:12,fontSize:16,color:INK},hint:{fontSize:11,color:MUTED,lineHeight:16,marginTop:6},futureNote:{fontSize:11,color:MUTED,lineHeight:17,backgroundColor:'#F5F2EE',padding:11,borderRadius:9},
  chipRow:{flexDirection:'row',flexWrap:'wrap',gap:7},chip:{borderWidth:1,borderColor:'#E8E4DE',backgroundColor:'#F5F2EE',paddingVertical:10,paddingHorizontal:12,borderRadius:22,minHeight:44,justifyContent:'center'},chipActive:{backgroundColor:ACCENT,borderColor:ACCENT},chipText:{fontSize:12,fontWeight:'700',color:'#5C5850'},chipTextActive:{color:'#fff'},linkedBadge:{backgroundColor:'#E8F5EE',borderRadius:8,padding:9,marginBottom:12},linkedBadgeText:{fontSize:11,color:GREEN,fontWeight:'700'},
  resultCard:{backgroundColor:'#fff',borderRadius:16,padding:16,marginBottom:14,borderWidth:1,borderColor:'#E8E4DE'},rating:{borderWidth:2,borderRadius:13,padding:14,marginBottom:14},ratingTitle:{fontSize:20,fontWeight:'900',letterSpacing:.5},ratingText:{fontSize:12,color:'#5C5850',lineHeight:18,marginTop:4},metricGrid:{flexDirection:'row',flexWrap:'wrap',gap:9},metric:{width:'48%',backgroundColor:'#F5F2EE',borderRadius:12,padding:12,minHeight:78},metricPrimary:{backgroundColor:'#FFF1EC'},metricLabel:{fontSize:10,color:MUTED,textTransform:'uppercase',fontWeight:'700',letterSpacing:.4},metricValue:{fontSize:18,fontWeight:'800',marginTop:7},metricValuePrimary:{fontSize:22},resultNote:{fontSize:12,color:'#5C5850',lineHeight:18,marginTop:12},primaryButton:{backgroundColor:ACCENT,borderRadius:11,padding:14,alignItems:'center',marginTop:14,minHeight:48},primaryButtonText:{color:'#fff',fontWeight:'800'},disabled:{opacity:.55},
  savedRow:{flexDirection:'row',alignItems:'center',paddingVertical:8,borderBottomWidth:1,borderBottomColor:'#F0EDE8'},savedLoad:{flex:1,minHeight:48,justifyContent:'center'},savedTitle:{fontSize:15,fontWeight:'700',color:INK},savedMeta:{fontSize:11,color:MUTED,marginTop:3},deleteText:{color:ACCENT,fontSize:12,fontWeight:'700',padding:14,minHeight:44},
  modal:{flex:1,backgroundColor:BG},modalHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',padding:16,borderBottomWidth:1,borderBottomColor:'#E8E4DE'},modalTitle:{fontSize:20,fontWeight:'800',color:INK},closeButton:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'},close:{color:ACCENT,fontWeight:'800',padding:8},search:{margin:16,marginBottom:0,borderWidth:1,borderColor:'#E8E4DE',borderRadius:11,backgroundColor:'#fff',padding:12,fontSize:15,color:INK},projectRow:{flexDirection:'row',alignItems:'center',backgroundColor:'#fff',borderRadius:12,padding:15,marginBottom:9},projectTitle:{fontSize:15,fontWeight:'700',color:INK},projectMeta:{fontSize:12,color:MUTED,marginTop:3},chevron:{fontSize:26,color:'#B8B2A9'},empty:{textAlign:'center',color:MUTED,padding:30},
  keyboardToolbar:{backgroundColor:'#F5F2EE',borderTopWidth:1,borderTopColor:'#D5D0C8',alignItems:'flex-end',paddingHorizontal:12,paddingVertical:6},keyboardDone:{minWidth:60,minHeight:44,alignItems:'center',justifyContent:'center'},keyboardDoneText:{color:ACCENT,fontSize:16,fontWeight:'800'},
})
