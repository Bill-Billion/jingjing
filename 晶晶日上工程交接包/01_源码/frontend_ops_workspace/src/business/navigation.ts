/** Keep only list position, never records or drafts. A new login/identity clears this memory. */
export interface BusinessListPosition {
  filters: Record<string, unknown>
  cursor: string
  previous: string[]
  loadedPages?: number
  city?: { local: boolean; defaultValue: string }
}
const positions = new Map<string, BusinessListPosition>()
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
export function rememberBusinessList(key: string, position: BusinessListPosition) {
  positions.delete(key)
  positions.set(key, copy(position))
  if (positions.size > 32) positions.delete(positions.keys().next().value!)
}
export function restoreBusinessList(key: string, defaultCity?: string): BusinessListPosition | null {
  const value = positions.get(key)
  if (!value) return null
  const position = copy(value)
  // A cursor belongs to the complete query. Never reuse one after a change
  // to the shared city, including when returning from a different directory.
  if (defaultCity !== undefined && position.city && !position.city.local && position.city.defaultValue !== defaultCity) {
    position.filters.city = defaultCity
    position.cursor = ''
    position.previous = []
    if (position.loadedPages !== undefined) position.loadedPages = 1
    position.city.defaultValue = defaultCity
  }
  return position
}
export function clearBusinessLists() { positions.clear() }
export function draftFingerprint(draft: Record<string, unknown>): string { return JSON.stringify(draft) }
