export const TUTORIAL_COMPLETION_KEY = '@sideflip/tutorial:v1:completed'
export const TUTORIAL_COMPLETION_VALUE = 'true'

export const TUTORIAL_STEPS = Object.freeze([
  {
    title: 'Welcome',
    body: 'SideFlip keeps your flips, owned items, goals, and deal decisions organized in one place.',
  },
  {
    title: 'Projects',
    body: 'Track a flip from purchase through expenses and sale, with profit and labor recorded as you go.',
  },
  {
    title: 'My Stuff',
    body: 'Keep records for things you own, including details, maintenance, costs, and documents.',
  },
  {
    title: 'Goals',
    body: 'Set a trade-up target and follow the cash and active projects helping you reach it.',
  },
  {
    title: 'Analyze',
    body: 'Check a potential deal before buying with costs, fees, target profit, and break-even guidance.',
  },
  {
    title: 'Finish',
    body: 'You are ready. Open Projects when you want to add your first project—nothing is created automatically.',
  },
])

export function clampTutorialStep(step) {
  return Math.min(Math.max(Number.isInteger(step) ? step : 0, 0), TUTORIAL_STEPS.length - 1)
}

export function tutorialProgress(step) {
  const index = clampTutorialStep(step)
  const current = index + 1
  return { current, total: TUTORIAL_STEPS.length, percent: current / TUTORIAL_STEPS.length }
}

export async function hasCompletedTutorialIn(storage) {
  return (await storage.getItem(TUTORIAL_COMPLETION_KEY)) === TUTORIAL_COMPLETION_VALUE
}

export async function completeTutorialIn(storage) {
  await storage.setItem(TUTORIAL_COMPLETION_KEY, TUTORIAL_COMPLETION_VALUE)
}
