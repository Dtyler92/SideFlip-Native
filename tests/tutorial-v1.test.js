import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  TUTORIAL_COMPLETION_KEY,
  TUTORIAL_STEPS,
  hasCompletedTutorial,
  markTutorialCompleted,
} from '../src/lib/tutorialModel.js'

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

test('tutorial v1 uses an install-scoped versioned completion key and six required steps', () => {
  assert.equal(TUTORIAL_COMPLETION_KEY, '@sideflip/tutorial/v1/completed')
  assert.deepEqual(TUTORIAL_STEPS.map(step => step.title), [
    'Welcome',
    'Projects',
    'My Stuff',
    'Goals',
    'Analyze',
    'Finish',
  ])
  assert.equal(TUTORIAL_STEPS.length, 6)
})

test('tutorial completion reads and writes only the current version', async () => {
  const writes = []
  const incompleteStorage = {
    getItem: async key => key === '@sideflip/tutorial/v0/completed' ? '1' : null,
    setItem: async (...args) => writes.push(args),
  }
  assert.equal(await hasCompletedTutorial(incompleteStorage), false)
  await markTutorialCompleted(incompleteStorage)
  assert.deepEqual(writes, [[TUTORIAL_COMPLETION_KEY, '1']])

  const completeStorage = { getItem: async key => key === TUTORIAL_COMPLETION_KEY ? '1' : null }
  assert.equal(await hasCompletedTutorial(completeStorage), true)
})

test('an unreadable completion flag shows the tutorial and a failed write does not complete it', async () => {
  assert.equal(await hasCompletedTutorial({ getItem: async () => { throw new Error('offline') } }), false)
  await assert.rejects(
    markTutorialCompleted({ setItem: async () => { throw new Error('full') } }),
    /full/,
  )
})

test('first-run tutorial waits for account onboarding and completion enters Main', () => {
  const app = source('App.js')
  assert.match(app, /if \(needsOnboarding\)[\s\S]*<OnboardingScreen/)
  assert.match(app, /hasCompletedTutorial\(AsyncStorage\)/)
  assert.match(app, /Platform\.OS !== 'ios'/)
  assert.match(app, /<TutorialScreen[\s\S]*onComplete=/)
  assert.match(app, /<Stack\.Screen name="Tutorial" component=\{TutorialScreen\}/)
})

test('Settings exposes iOS tutorial replay without clearing completion', () => {
  const settings = source('src/screens/SettingsScreen.js')
  assert.match(settings, /Replay Tutorial/)
  assert.match(settings, /navigation\.navigate\('Tutorial', \{ mode: 'replay' \}\)/)
  assert.doesNotMatch(settings, /removeItem/)
})

test('tutorial supports accessible progress, navigation, skip, and safe-area controls', () => {
  const tutorial = source('src/screens/TutorialScreen.js')
  assert.match(tutorial, /accessibilityRole="progressbar"/)
  assert.match(tutorial, /accessibilityValue=/)
  assert.match(tutorial, /accessibilityLabel="Tutorial progress"/)
  assert.match(tutorial, /accessibilityRole="header"/)
  assert.match(tutorial, /accessibilityRole="button"/)
  assert.match(tutorial, />Back</)
  assert.match(tutorial, /'Next'/)
  assert.match(tutorial, />Skip</)
  assert.match(tutorial, /'Finish'/)
  assert.match(tutorial, /useSafeAreaInsets/)
  assert.match(tutorial, /markTutorialCompleted\(AsyncStorage\)/)
  assert.match(tutorial, /mode === 'replay'[\s\S]*navigation\.goBack\(\)/)
  assert.doesNotMatch(tutorial, /navigate\('(?:NewProject|Pro)'/)
})
