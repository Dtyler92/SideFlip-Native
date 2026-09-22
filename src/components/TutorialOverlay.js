import { useEffect } from 'react'
import {
  AccessibilityInfo,
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { getTutorialPrompt, TUTORIAL_TABS } from '../lib/tutorialModel'

const ACCENT = '#C8402F'

export default function TutorialOverlay({ bottom, stepIndex, saving, onSkip, onFinish }) {
  const prompt = getTutorialPrompt(stepIndex)
  const instruction = prompt.finished
    ? `${prompt.selected.label}: ${prompt.selected.description} The walkthrough is complete.`
    : prompt.selected
      ? `${prompt.selected.label}: ${prompt.selected.description} Next, tap the ${prompt.expected.label} tab below.`
      : `Tap the ${prompt.expected.label} tab below to begin.`

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(instruction)
  }, [instruction])

  return (
    <View pointerEvents="auto" style={[s.overlay, { bottom }]}>
      <View style={s.scrim} />
      <View style={s.card} accessibilityLiveRegion="polite">
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Walkthrough progress"
          accessibilityValue={{
            min: 0,
            max: TUTORIAL_TABS.length,
            now: stepIndex,
            text: `${stepIndex} of ${TUTORIAL_TABS.length} tabs visited`,
          }}
          style={s.progressArea}
        >
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${(stepIndex / TUTORIAL_TABS.length) * 100}%` }]} />
          </View>
          <Text style={s.progressText}>{stepIndex} of {TUTORIAL_TABS.length} tabs</Text>
        </View>

        <Text accessibilityRole="header" style={s.title}>
          {prompt.selected ? prompt.selected.label : 'Quick tab walkthrough'}
        </Text>
        {prompt.selected && <Text style={s.description}>{prompt.selected.description}</Text>}
        {!prompt.finished && (
          <Text style={s.instruction}>Tap the <Text style={s.tabName}>{prompt.expected.label}</Text> tab below.</Text>
        )}
        {prompt.finished && (
          <Text style={s.instruction}>You have visited every tab. No projects, goals, purchases, or other data were changed.</Text>
        )}

        <View style={s.actions}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Skip walkthrough"
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            onPress={onSkip}
            style={s.skipButton}
          >
            <Text style={s.skipText}>Skip</Text>
          </TouchableOpacity>
          {prompt.finished && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Finish walkthrough"
              accessibilityState={{ disabled: saving }}
              disabled={saving}
              onPress={onFinish}
              style={s.finishButton}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.finishText}>Finish</Text>}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(26, 25, 23, 0.42)' },
  card: { margin: 16, padding: 20, borderRadius: 18, backgroundColor: '#FAFAF7', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  progressArea: { marginBottom: 14 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: '#E8E4DE', overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: ACCENT },
  progressText: { marginTop: 6, color: '#716D66', fontSize: 12, fontWeight: '600', textAlign: 'right' },
  title: { color: '#1A1917', fontSize: 24, lineHeight: 30, fontWeight: '800', marginBottom: 8 },
  description: { color: '#5C5850', fontSize: 16, lineHeight: 23, marginBottom: 12 },
  instruction: { color: '#1A1917', fontSize: 16, lineHeight: 23, fontWeight: '600' },
  tabName: { color: ACCENT, fontWeight: '800' },
  actions: { minHeight: 48, marginTop: 16, flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  skipButton: { minWidth: 72, minHeight: 48, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  skipText: { color: ACCENT, fontSize: 16, fontWeight: '700' },
  finishButton: { minWidth: 116, minHeight: 48, paddingHorizontal: 20, borderRadius: 12, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  finishText: { color: '#fff', fontSize: 16, fontWeight: '800' },
})
