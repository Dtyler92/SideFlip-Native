import { useEffect, useState } from 'react'
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { markTutorialCompleted, TUTORIAL_STEPS } from '../lib/tutorialModel'

const ACCENT = '#C8402F'

export default function TutorialScreen({ navigation, route, onComplete }) {
  const insets = useSafeAreaInsets()
  const [stepIndex, setStepIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const step = TUTORIAL_STEPS[stepIndex]
  const stepNumber = stepIndex + 1
  const isFirst = stepIndex === 0
  const isLast = stepIndex === TUTORIAL_STEPS.length - 1
  const mode = route?.params?.mode === 'replay' ? 'replay' : 'first-run'

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      `Step ${stepNumber} of ${TUTORIAL_STEPS.length}: ${step.title}`,
    )
  }, [step.title, stepNumber])

  async function completeTutorial() {
    if (saving) return
    setSaving(true)
    try {
      await markTutorialCompleted(AsyncStorage)
      if (mode === 'replay') navigation.goBack()
      else onComplete?.()
    } catch {
      if (mode === 'replay') {
        navigation.goBack()
        return
      }
      Alert.alert('Could not finish the tutorial', 'SideFlip could not save your progress. Please try again.')
      setSaving(false)
    }
  }

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={s.topBar}>
        <Text style={s.wordmark} accessibilityRole="header">
          <Text style={s.wordmarkSide}>Side</Text><Text style={s.wordmarkFlip}>Flip</Text>
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Skip tutorial"
          accessibilityState={{ disabled: saving }}
          disabled={saving}
          onPress={completeTutorial}
          style={s.skipButton}
        >
          <Text style={s.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Tutorial progress"
        accessibilityValue={{ min: 1, max: TUTORIAL_STEPS.length, now: stepNumber, text: `Step ${stepNumber} of ${TUTORIAL_STEPS.length}` }}
        style={s.progressArea}
      >
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${(stepNumber / TUTORIAL_STEPS.length) * 100}%` }]} />
        </View>
        <Text style={s.progressText}>Step {stepNumber} of {TUTORIAL_STEPS.length}</Text>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.stepBadge} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={s.stepBadgeText}>{stepNumber}</Text>
        </View>
        <Text style={s.eyebrow}>{step.eyebrow}</Text>
        <Text style={s.title} accessibilityRole="header">{step.title}</Text>
        <Text style={s.body}>{step.body}</Text>
      </ScrollView>

      <View style={s.actions}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Previous tutorial step"
          accessibilityState={{ disabled: isFirst || saving }}
          disabled={isFirst || saving}
          onPress={() => setStepIndex(index => Math.max(0, index - 1))}
          style={[s.secondaryButton, isFirst && s.buttonDisabled]}
        >
          <Text style={[s.secondaryButtonText, isFirst && s.disabledText]}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Finish tutorial' : 'Next tutorial step'}
          accessibilityState={{ disabled: saving }}
          disabled={saving}
          onPress={isLast ? completeTutorial : () => setStepIndex(index => Math.min(TUTORIAL_STEPS.length - 1, index + 1))}
          style={[s.primaryButton, saving && s.buttonDisabled]}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.primaryButtonText}>{isLast ? 'Finish' : 'Next'}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAF7' },
  topBar: { minHeight: 64, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { fontSize: 27, fontWeight: '800' },
  wordmarkSide: { color: '#1A1917' },
  wordmarkFlip: { color: ACCENT },
  skipButton: { minWidth: 56, minHeight: 48, alignItems: 'flex-end', justifyContent: 'center' },
  skipText: { color: ACCENT, fontSize: 16, fontWeight: '700' },
  progressArea: { paddingHorizontal: 24, paddingBottom: 16 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: '#E8E4DE', overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: ACCENT },
  progressText: { marginTop: 8, color: '#716D66', fontSize: 13, fontWeight: '600', textAlign: 'right' },
  scroll: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, paddingVertical: 24 },
  stepBadge: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FDF1EF', marginBottom: 28 },
  stepBadgeText: { color: ACCENT, fontSize: 36, fontWeight: '800' },
  eyebrow: { color: ACCENT, fontSize: 13, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, textAlign: 'center' },
  title: { color: '#1A1917', fontSize: 34, lineHeight: 41, fontWeight: '800', textAlign: 'center', marginBottom: 16 },
  body: { color: '#5C5850', fontSize: 18, lineHeight: 28, textAlign: 'center', maxWidth: 420 },
  actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  secondaryButton: { minHeight: 52, minWidth: 104, borderRadius: 13, borderWidth: 1.5, borderColor: '#D7D2CB', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  secondaryButtonText: { color: '#5C5850', fontSize: 16, fontWeight: '700' },
  primaryButton: { flex: 1, minHeight: 52, borderRadius: 13, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  buttonDisabled: { opacity: 0.45 },
  disabledText: { color: '#A8A49E' },
})
