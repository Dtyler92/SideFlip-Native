import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  TUTORIAL_COMPLETION_KEY,
  TUTORIAL_TABS,
  advanceTutorial,
  getTutorialPrompt,
  hasCompletedTutorial,
  markTutorialCompleted,
} from '../src/lib/tutorialModel.js'
import { getTutorialContentAccessibilityProps } from '../src/lib/tutorialAccessibility.js'

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

test('walkthrough v2 follows every real app tab in navigation order', () => {
  assert.equal(TUTORIAL_COMPLETION_KEY, '@sideflip/tutorial/v2/completed')
  assert.deepEqual(TUTORIAL_TABS.map(step => [step.routeName, step.label]), [
    ['Projects', 'Projects'],
    ['Analyze', 'Analyze'],
    ['Goals', 'Goals'],
    ['Analytics', 'Analytics'],
    ['MyStuff', 'My Stuff'],
  ])
  for (const step of TUTORIAL_TABS) {
    assert.ok(step.description.length > 30)
  }
})

test('only the expected real tab advances the walkthrough', () => {
  assert.deepEqual(advanceTutorial(0, 'Goals'), { accepted: false, nextStepIndex: 0, finished: false })
  assert.deepEqual(advanceTutorial(0, 'Projects'), { accepted: true, nextStepIndex: 1, finished: false })
  assert.deepEqual(advanceTutorial(1, 'Analyze'), { accepted: true, nextStepIndex: 2, finished: false })
  assert.deepEqual(advanceTutorial(4, 'MyStuff'), { accepted: true, nextStepIndex: 5, finished: true })
  assert.deepEqual(advanceTutorial(5, 'Projects'), { accepted: false, nextStepIndex: 5, finished: true })
})

test('prompt explains the selected tab and directs the next tap', () => {
  assert.deepEqual(getTutorialPrompt(0), {
    selected: null,
    expected: TUTORIAL_TABS[0],
    finished: false,
  })
  assert.deepEqual(getTutorialPrompt(3), {
    selected: TUTORIAL_TABS[2],
    expected: TUTORIAL_TABS[3],
    finished: false,
  })
  assert.deepEqual(getTutorialPrompt(5), {
    selected: TUTORIAL_TABS[4],
    expected: null,
    finished: true,
  })
})

test('v1 completion upgrades into the corrected walkthrough and v2 persists independently', async () => {
  const writes = []
  const oldCompletion = {
    getItem: async key => key === '@sideflip/tutorial/v1/completed' ? '1' : null,
    setItem: async (...args) => writes.push(args),
  }
  assert.equal(await hasCompletedTutorial(oldCompletion), false)
  await markTutorialCompleted(oldCompletion)
  assert.deepEqual(writes, [[TUTORIAL_COMPLETION_KEY, '1']])
  assert.equal(await hasCompletedTutorial({ getItem: async key => key === TUTORIAL_COMPLETION_KEY ? '1' : null }), true)
})

test('storage failures are conservative and failed completion remains retryable', async () => {
  assert.equal(await hasCompletedTutorial({ getItem: async () => { throw new Error('offline') } }), false)
  await assert.rejects(markTutorialCompleted({ setItem: async () => { throw new Error('full') } }), /full/)
})

test('first-run walkthrough overlays HomeTabs after account onboarding', () => {
  const app = source('App.js')
  assert.match(app, /if \(needsOnboarding\)[\s\S]*<OnboardingScreen/)
  assert.match(app, /hasCompletedTutorial\(AsyncStorage\)/)
  assert.match(app, /Platform\.OS !== 'ios'/)
  assert.match(app, /<HomeTabs[\s\S]*tutorialMode="first-run"[\s\S]*onTutorialComplete=/)
  assert.doesNotMatch(app, /import TutorialScreen|component=\{TutorialScreen\}|<TutorialScreen(?:\s|\/|>)/)
  assert.doesNotMatch(app, /name="Tutorial"/)
})

test('guided mode uses real tab presses, blocks wrong tabs, and leaves app actions untouched', () => {
  const app = source('App.js')
  assert.match(app, /listeners=\{\{[\s\S]*tabPress:/)
  assert.match(app, /handleTutorialTabPress\('Projects'/)
  assert.match(app, /handleTutorialTabPress\('Analyze'/)
  assert.match(app, /handleTutorialTabPress\('Goals'/)
  assert.match(app, /handleTutorialTabPress\('Analytics'/)
  assert.match(app, /handleTutorialTabPress\('MyStuff'/)
  assert.match(app, /event\.preventDefault\(\)/)
  assert.match(app, /<TutorialOverlay/)
  assert.doesNotMatch(app, /navigate\('(?:NewProject|GoalCreate|MyStuffCreate|Pro)'/)
})

test('walkthrough exposes accessible instructions, progress, skip, finish, and tab hints', () => {
  const walkthrough = source('src/components/TutorialOverlay.js')
  assert.match(walkthrough, /AccessibilityInfo\.announceForAccessibility/)
  assert.match(walkthrough, /accessibilityRole="progressbar"/)
  assert.match(walkthrough, /accessibilityValue=/)
  assert.match(walkthrough, /accessibilityRole="header"/)
  assert.match(walkthrough, /accessibilityLabel="Skip walkthrough"/)
  assert.match(walkthrough, /accessibilityLabel="Finish walkthrough"/)
  assert.match(walkthrough, /Tap the .* tab below/)
  assert.match(walkthrough, /pointerEvents="auto"/)
})

test('tutorial accessibility state hides screen descendants and restores them afterward', () => {
  assert.deepEqual(getTutorialContentAccessibilityProps(true), {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  })
  assert.deepEqual(getTutorialContentAccessibilityProps(false), {
    accessibilityElementsHidden: false,
    importantForAccessibility: 'auto',
  })
})

test('stable screen layout isolates tab content without hiding overlay or real tab buttons', () => {
  const app = source('App.js')
  const walkthrough = source('src/components/TutorialOverlay.js')

  assert.match(app, /function TutorialScreenContent\(\{ children \}\)/)
  assert.match(app, /function tutorialScreenLayout\(\{ children \}\)/)
  assert.match(app, /screenLayout=\{tutorialScreenLayout\}/)
  assert.match(app, /<TutorialModeContext\.Provider value=\{Boolean\(mode\)\}>[\s\S]*<Tab\.Navigator[\s\S]*<\/Tab\.Navigator>[\s\S]*<\/TutorialModeContext\.Provider>[\s\S]*\{mode && \([\s\S]*<TutorialOverlay/)
  assert.match(app, /accessibilityElementsHidden=\{accessibilityElementsHidden\}/)
  assert.match(app, /importantForAccessibility=\{importantForAccessibility\}/)
  assert.equal((app.match(/<Tab\.Screen name=/g) || []).length, 5)
  assert.equal((app.match(/tabBarAccessibilityLabel:/g) || []).length, 5)
  assert.match(app, /name="Projects" component=\{HomeScreen\}/)
  assert.match(app, /name="Analyze" component=\{AnalyzeScreen\}/)
  assert.match(app, /name="Goals" component=\{TradeUpGoalsScreen\}/)
  assert.match(app, /name="Analytics" component=\{AnalyticsScreen\}/)
  assert.match(app, /name="MyStuff" component=\{MyStuffScreen\}/)
  assert.doesNotMatch(app, /<Tab\.Screen[^>]*children=/)
  assert.doesNotMatch(walkthrough, /accessibilityViewIsModal|accessibilityElementsHidden/)
  assert.match(walkthrough, /accessibilityRole="(?:progressbar|header|button)"/)
})

test('Settings replay starts Main guided mode without deleting or rewriting completion', () => {
  const settings = source('src/screens/SettingsScreen.js')
  assert.match(settings, /Replay Walkthrough/)
  assert.match(settings, /navigation\.popTo\('Main', \{ tutorialMode: 'replay'/)
  assert.doesNotMatch(settings, /removeItem|markTutorialCompleted/)

  const app = source('App.js')
  assert.match(app, /mode === 'replay'[\s\S]*navigation\.setParams/)
  assert.match(app, /mode !== 'first-run'[\s\S]*markTutorialCompleted\(AsyncStorage\)/)
})

test('root safe area, routes, and analytics behavior remain present', () => {
  const app = source('App.js')
  assert.match(app, /<SafeAreaProvider initialMetrics=\{initialWindowMetrics\}>/)
  assert.match(app, /name="GoalCreate" component=\{GoalCreateScreen\}/)
  assert.match(app, /name="Settings" component=\{SettingsScreen\}/)
  assert.match(app, /captureEvent\('screen_viewed'/)
  assert.match(app, /if \(screen === 'analytics'\) captureEvent\('analytics_viewed'/)
})
