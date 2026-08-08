const number = value => Number(value) || 0

export function roundLaborHours(value) {
  const hours = Number(value)
  if (!Number.isFinite(hours) || hours <= 0) return null
  return Math.ceil((hours * 4) - 1e-9) / 4
}

export function projectProfit(project) {
  if (project?.status !== 'sold' || project?.sale_price === null || project?.sale_price === undefined) return null
  const expenses = (project.expenses || []).reduce((sum, expense) => sum + number(expense.amount), 0)
  return number(project.sale_price) - number(project.purchase_price) - expenses
}

export function calculateHourlyEarnings(projects = []) {
  const tracked = projects
    .filter(project => project?.status === 'sold')
    .map(project => ({
      project,
      laborHours: (project.expenses || []).reduce(
        (total, expense) => total + number(expense.labor_hours),
        0,
      ),
    }))
    .filter(item => item.laborHours > 0)
  const totalProfit = tracked.reduce((sum, item) => sum + (projectProfit(item.project) || 0), 0)
  const totalLaborHours = tracked.reduce((sum, item) => sum + item.laborHours, 0)

  return {
    totalProfit,
    totalLaborHours,
    hourlyEarnings: totalLaborHours > 0 ? totalProfit / totalLaborHours : null,
  }
}
