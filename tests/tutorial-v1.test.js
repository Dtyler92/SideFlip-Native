import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  TUTORIAL_COMPLETION_KEY,
  TUTORIAL_STEPS,
  clampTutorialStep,
  completeTutorialIn,
  hasCompletedTutorialIn,
  tutorialProgress,
} from '../src/lib/tutorialModel.js'

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

test('tutorial v1 defines the versioned completion key and six concise steps', () => {
  assert.match(TUTORIAL_COMPLETION_KEY, /v1/)
  assert.deepEqual(TUTORIAL_STEPS.map(step => step.title), [
    'Welcome', 'Projects', 'My Stuff', 'Goals', 'Analyze', 'Finish',
  ])
  assert.ok(TUTORIAL_STEPS.every(step => step.body.length > 0 && step.body.length <= 150))
  assert.match(TUTORIAL_STEPS.at(-1).body, /first project/i)
})

test('tutorial step and progress helpers stay within the six-step flow', () => {
  assert.equal(clampTutorialStep(-1), 0)
  assert.equal(clampTutorialStep(99), 5)
  assert.equal(clampTutorialStep(2), 2)
  assert.deepEqual(tutorialProgress(0), { current: 1, total: 6, percent: 1 / 6 })
  assert.deepEqual(tutorialProgress(5), { current: 6, total: 6, percent: 1 })
})

test('tutorial completion persists against the versioned install-local key', async () => {
  const values = new Map()
  const storage = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => values.set(key, value),
  }
  assert.equal(await hasCompletedTutorialIn(storage), false)
  await completeTutorialIn(storage)
  assert.equal(values.get(TUTORIAL_COMPLETION_KEY), 'true')
  assert.equal(await hasCompletedTutorialIn(storage), true)
})


test('first-run tutorial waits for account onboarding and persisted completion lookup', () => {
  const app = source('App.js')
  assert.match(app, /needsOnboarding === false/)
  assert.match(app, /hasCompletedTutorial\(\)/)
  assert.match(app, /Platform\.OS !== 'android'/)
  assert.match(app, /needsOnboarding == null/)
  assert.match(app, /catch\(\(\) => \{ if \(active\) setTutorialState\('complete'\) \}\)/)
  assert.match(app, /if \(needsOnboarding\)/)
  assert.match(app, /<TutorialScreen mode="firstRun"/)
  assert.ok(app.indexOf('if (needsOnboarding)') < app.indexOf('<TutorialScreen mode="firstRun"'))
  assert.match(app, /<Stack\.Screen name="Tutorial" component=\{TutorialScreen\}/)
  assert.match(app, /if \(routeName === 'Tutorial'\) return/)
})

test('skip and finish persist completion while replay always returns to Settings', () => {
  const tutorial = source('src/screens/TutorialScreen.js')
  const storage = source('src/lib/tutorialStorage.js')
  const settings = source('src/screens/SettingsScreen.js')
  assert.match(storage, /hasCompletedTutorialIn\(AsyncStorage\)/)
  assert.match(storage, /completeTutorialIn\(AsyncStorage\)/)
  assert.match(tutorial, /await completeTutorial\(\)/)
  assert.match(tutorial, /onPress=\{handleSkip\}/)
  assert.match(tutorial, /isLast \? 'Finish' : 'Next'/)
  assert.match(tutorial, /navigation\?\.goBack\(\)/)
  assert.match(tutorial, /BackHandler\.addEventListener\('hardwareBackPress'/)
  assert.match(tutorial, /savingRef\.current/)
  assert.match(tutorial, /The tutorial may appear again next time/)
  assert.match(settings, /Platform\.OS === 'android' && <>[\s\S]*>Replay Tutorial<\/Text>/)
  assert.match(settings, /navigation\.navigate\('Tutorial', \{ mode: 'replay' \}\)/)
  assert.match(settings, />Replay Tutorial<\/Text>/)
})

test('tutorial controls and progress expose screen-reader semantics and safe areas', () => {
  const tutorial = source('src/screens/TutorialScreen.js')
  assert.match(tutorial, /SafeAreaView/)
  assert.match(tutorial, /edges=\{\['top', 'bottom'\]\}/)
  assert.match(tutorial, /accessibilityRole="progressbar"/)
  assert.match(tutorial, /accessibilityValue=/)
  assert.match(tutorial, /accessibilityLiveRegion="polite"/)
  assert.match(tutorial, /AccessibilityInfo\.announceForAccessibility/)
  assert.ok((tutorial.match(/accessibilityRole="button"/g) || []).length >= 3)
  assert.match(tutorial, /footer: \{[\s\S]*paddingBottom: 16/)
})
