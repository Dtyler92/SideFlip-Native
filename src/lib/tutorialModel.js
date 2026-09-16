export const TUTORIAL_VERSION = 1
export const TUTORIAL_COMPLETION_KEY = `@sideflip/tutorial/v${TUTORIAL_VERSION}/completed`

export const TUTORIAL_STEPS = Object.freeze([
  {
    title: 'Welcome',
    eyebrow: 'SideFlip basics',
    body: 'Take a quick tour of the tools that help you plan, track, and learn from every flip.',
  },
  {
    title: 'Projects',
    eyebrow: 'Track every flip',
    body: 'Keep purchase price, expenses, photos, sale details, and profit together in one project.',
  },
  {
    title: 'My Stuff',
    eyebrow: 'Know what you own',
    body: 'Keep the vehicles, tools, and other items you work on organized with their history.',
  },
  {
    title: 'Goals',
    eyebrow: 'Build momentum',
    body: 'Create a Trade-Up Goal and connect projects to see how each flip moves you forward.',
  },
  {
    title: 'Analyze',
    eyebrow: 'Learn from results',
    body: 'Review profit, return, time, and category trends to make more informed decisions.',
  },
  {
    title: 'Finish',
    eyebrow: 'Start when ready',
    body: 'Add your first project whenever you are ready. This tour will not create anything or start a purchase.',
  },
])

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
