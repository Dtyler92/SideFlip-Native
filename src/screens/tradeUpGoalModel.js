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

  return {
    available,
    activeValue,
    progressValue,
    progressPercent: targetAmount > 0 ? Math.min(100, Number(((progressValue / targetAmount) * 100).toFixed(1))) : 0,
    activeCount: active.length,
    soldCount: sold.length,
  }
}

export function canCreateAnotherGoal(plan, goals = []) {
  return plan === 'pro' || !goals.some(goal => goal?.status === 'active')
}
