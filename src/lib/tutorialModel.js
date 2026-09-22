export const TUTORIAL_VERSION = 2
export const TUTORIAL_COMPLETION_KEY = `@sideflip/tutorial/v${TUTORIAL_VERSION}/completed`

export const TUTORIAL_TABS = Object.freeze([
  Object.freeze({
    routeName: 'Projects',
    label: 'Projects',
    description: 'Projects keeps purchase details, expenses, photos, sale information, and profit together for each flip.',
  }),
  Object.freeze({
    routeName: 'Analyze',
    label: 'Analyze',
    description: 'Analyze helps you check a potential purchase and estimate the numbers before you commit to a flip.',
  }),
  Object.freeze({
    routeName: 'Goals',
    label: 'Goals',
    description: 'Goals tracks your Trade-Up Goal and shows how completed flips move you toward the item you want.',
  }),
  Object.freeze({
    routeName: 'Analytics',
    label: 'Analytics',
    description: 'Analytics summarizes profit, return, time, and category trends from your project results.',
  }),
  Object.freeze({
    routeName: 'MyStuff',
    label: 'My Stuff',
    description: 'My Stuff organizes the vehicles, tools, and other items you own, including their maintenance history.',
  }),
])

export function getTutorialPrompt(stepIndex) {
  const normalizedIndex = Number.isInteger(stepIndex)
    ? Math.max(0, Math.min(TUTORIAL_TABS.length, stepIndex))
    : 0
  return {
    selected: normalizedIndex > 0 ? TUTORIAL_TABS[normalizedIndex - 1] : null,
    expected: normalizedIndex < TUTORIAL_TABS.length ? TUTORIAL_TABS[normalizedIndex] : null,
    finished: normalizedIndex === TUTORIAL_TABS.length,
  }
}

export function advanceTutorial(stepIndex, routeName) {
  const prompt = getTutorialPrompt(stepIndex)
  if (prompt.finished || prompt.expected?.routeName !== routeName) {
    return { accepted: false, nextStepIndex: prompt.finished ? TUTORIAL_TABS.length : Math.max(0, TUTORIAL_TABS.indexOf(prompt.expected)), finished: prompt.finished }
  }
  const nextStepIndex = TUTORIAL_TABS.indexOf(prompt.expected) + 1
  return {
    accepted: true,
    nextStepIndex,
    finished: nextStepIndex === TUTORIAL_TABS.length,
  }
}

export async function hasCompletedTutorial(storage) {
  try {
    return await storage.getItem(TUTORIAL_COMPLETION_KEY) === '1'
  } catch {
    return false
  }
}

export function markTutorialCompleted(storage) {
  return storage.setItem(TUTORIAL_COMPLETION_KEY, '1')
}
