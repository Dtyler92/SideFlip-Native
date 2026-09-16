export async function runMutationThenRefresh({
  mutate,
  onMutationSuccess,
  refresh,
  onMutationError,
  onRefreshError,
}) {
  try {
    await mutate()
  } catch (error) {
    onMutationError(error)
    return { mutationSucceeded: false, refreshSucceeded: false }
  }

  onMutationSuccess()

  try {
    await refresh()
    return { mutationSucceeded: true, refreshSucceeded: true }
  } catch (error) {
    onRefreshError(error)
    return { mutationSucceeded: true, refreshSucceeded: false }
  }
}
