import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, ActivityIndicator, Alert, BackHandler, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { TUTORIAL_STEPS, clampTutorialStep, tutorialProgress } from '../lib/tutorialModel'
import { completeTutorial } from '../lib/tutorialStorage'

const ACCENT = '#C8402F'

export default function TutorialScreen({ navigation, route, mode, onComplete }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const index = clampTutorialStep(stepIndex)
  const step = TUTORIAL_STEPS[index]
  const progress = tutorialProgress(index)
  const isLast = progress.current === progress.total
  const isReplay = mode === 'replay' || route?.params?.mode === 'replay'

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${step.title}. ${step.body}. Step ${progress.current} of ${progress.total}.`)
  }, [progress.current, progress.total, step.body, step.title])

  useEffect(() => {
    if (!isReplay) return undefined
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (savingRef.current) return true
      navigation?.goBack()
      return true
    })
    return () => subscription.remove()
  }, [isReplay, navigation])

  function exitTutorial() {
    savingRef.current = false
    if (isReplay) navigation?.goBack()
    else onComplete?.()
  }

  async function completeAndExit() {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      await completeTutorial()
    } catch {
      Alert.alert('Could not save tutorial progress', 'The tutorial may appear again next time, but you can continue using SideFlip now.')
    } finally {
      exitTutorial()
    }
  }

  function handleSkip() {
    completeAndExit()
  }

  function handleNext() {
    if (isLast) completeAndExit()
    else setStepIndex(current => clampTutorialStep(current + 1))
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.topRow}>
        <Text style={s.brand} accessibilityRole="header">Side<Text style={s.brandAccent}>Flip</Text></Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Skip tutorial"
          disabled={saving}
          onPress={handleSkip}
          style={s.skipButton}
        >
          <Text style={s.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Tutorial progress, step ${progress.current} of ${progress.total}`}
        accessibilityValue={{ min: 1, max: progress.total, now: progress.current, text: `Step ${progress.current} of ${progress.total}` }}
        style={s.progressTrack}
      >
        <View style={[s.progressFill, { width: `${progress.percent * 100}%` }]} />
      </View>
      <Text style={s.progressText} accessibilityLiveRegion="polite">
        Step {progress.current} of {progress.total}
      </Text>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.stepMarker} accessible={false}>
          <Text style={s.stepMarkerText}>{progress.current}</Text>
        </View>
        <Text style={s.title} accessibilityRole="header">{step.title}</Text>
        <Text style={s.body}>{step.body}</Text>
        {isLast && <Text style={s.note}>No purchase or project creation is required.</Text>}
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Previous tutorial step"
          accessibilityState={{ disabled: index === 0 || saving }}
          disabled={index === 0 || saving}
          onPress={() => setStepIndex(current => clampTutorialStep(current - 1))}
          style={[s.backButton, index === 0 && s.buttonDisabled]}
        >
          <Text style={[s.backText, index === 0 && s.backTextDisabled]}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Finish tutorial' : 'Next tutorial step'}
          accessibilityState={{ disabled: saving }}
          disabled={saving}
          onPress={handleNext}
          style={[s.nextButton, saving && s.buttonDisabled]}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.nextText}>{isLast ? 'Finish' : 'Next'}</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAF7' },
  topRow: { minHeight: 60, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: '#1A1917', fontSize: 22, fontWeight: '800' },
  brandAccent: { color: ACCENT },
  skipButton: { minHeight: 44, minWidth: 64, alignItems: 'flex-end', justifyContent: 'center' },
  skipText: { color: ACCENT, fontSize: 15, fontWeight: '700' },
  progressTrack: { height: 6, marginHorizontal: 24, borderRadius: 3, backgroundColor: '#E8E4DE', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: ACCENT },
  progressText: { marginTop: 10, textAlign: 'center', color: '#716D66', fontSize: 13, fontWeight: '600' },
  scroll: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, paddingVertical: 28 },
  stepMarker: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FDF1EF', marginBottom: 28 },
  stepMarkerText: { color: ACCENT, fontSize: 30, fontWeight: '800' },
  title: { color: '#1A1917', fontSize: 30, fontWeight: '800', textAlign: 'center', marginBottom: 16 },
  body: { color: '#5C5850', fontSize: 17, lineHeight: 26, textAlign: 'center', maxWidth: 420 },
  note: { color: '#8C8880', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 20 },
  footer: { flexDirection: 'row', gap: 12, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16, backgroundColor: '#FAFAF7' },
  backButton: { minHeight: 52, flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: '#D7D2CB', alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#5C5850', fontSize: 16, fontWeight: '700' },
  backTextDisabled: { color: '#B9B5AE' },
  nextButton: { minHeight: 52, flex: 1.6, borderRadius: 12, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  nextText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  buttonDisabled: { opacity: 0.5 },
})
