const number = value => Number(value) || 0

export function createMutationId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

export function projectInvested(project) {
  return number(project?.purchase_price) + (project?.expenses || []).reduce((sum, expense) => sum + number(expense.amount), 0)
}

export function calculateGoalSummary(goal, projects = [], ledger = goal?.goal_ledger || []) {
  const linkedProjects = projects.filter(project => project?.goal_id === goal?.id)
  const entries = ledger.filter(entry => !entry?.goal_id || entry.goal_id === goal?.id)
  const active = linkedProjects.filter(project => project.status === 'active')
  const sold = linkedProjects.filter(project => project.status === 'sold')
  const available = entries.reduce((sum, entry) => sum + number(entry.amount), 0)
  const activeValue = active.reduce((sum, project) => sum + projectInvested(project), 0)
  const progressValue = Math.max(0, available + activeValue)
  const targetAmount = number(goal?.target_amount)
  const personalContributions = entries
    .filter(entry => entry.type === 'personal_contribution' && number(entry.amount) > 0)
    .reduce((sum, entry) => sum + number(entry.amount), 0)
  const projectOutOfPocket = linkedProjects.reduce((sum, project) => sum + number(project.out_of_pocket_amount), 0)
  const expenseOutOfPocket = linkedProjects.reduce(
    (sum, project) => sum + (project.expenses || []).reduce((expenseSum, expense) => expenseSum + number(expense.amount), 0),
    0,
  )
  const flipped = sold.reduce((sum, project) => sum + number(project.sale_price), 0)

  return {
    available,
    activeValue,
    progressValue,
    progressPercent: targetAmount > 0 ? Math.min(100, Number(((progressValue / targetAmount) * 100).toFixed(1))) : 0,
    activeCount: active.length,
    soldCount: sold.length,
    outOfPocket: personalContributions + projectOutOfPocket + expenseOutOfPocket,
    flipped,
  }
}

export function progressColor(percent) {
  const progress = Math.max(0, Math.min(100, number(percent))) / 100
  const start = [0xC8, 0x40, 0x2F]
  const end = [0x2D, 0x7A, 0x4F]
  const channel = index => Math.round(start[index] + ((end[index] - start[index]) * progress))
  return `#${[0, 1, 2].map(index => channel(index).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

export function canCreateAnotherGoal(plan, goals = []) {
  return plan === 'pro' || !goals.some(goal => goal?.status === 'active')
}
