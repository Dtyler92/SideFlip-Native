export async function queryRestorablePurchases({ options, syncPurchases, getAvailablePurchases, onSyncError }) {
  try {
    await syncPurchases(options)
  } catch (error) {
    onSyncError?.(error)
  }
  return getAvailablePurchases(options)
}
