export function excludeTransferredItems(items = [], transfers = []) {
  const transferredIds = new Set(transfers.map(value => value?.item_id).filter(Boolean))
  return items.filter(value => !transferredIds.has(value.id))
}
