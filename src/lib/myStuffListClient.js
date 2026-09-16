import { adaptSqlItem } from './myStuffAdapters.js'

export function createMyStuffListClient(database) {
  return {
    async list({ includeArchived = true, excludeTransferred = false } = {}) {
      const { data, error } = await database.rpc('list_my_stuff_items_v4', {
        p_include_archived: includeArchived,
        p_exclude_transferred: excludeTransferred,
      })
      if (error) throw error
      if (!Array.isArray(data)) throw new Error('My Stuff list did not return rows.')
      return data.map(adaptSqlItem)
    },
  }
}
