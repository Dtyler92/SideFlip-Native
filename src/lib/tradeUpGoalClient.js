export function createTradeUpGoalClient(database) {
  return {
    async update(goalId, status, targetAmount, mutationId) {
      const { data, error } = await database.rpc('update_trade_up_goal', {
        p_goal_id: goalId,
        p_status: status,
        p_target_amount: targetAmount,
        p_mutation_id: mutationId,
      })
      if (error) throw error
      if (data !== goalId) {
        throw new Error('The update did not return the matching goal ID.')
      }
      return data
    },
  }
}
