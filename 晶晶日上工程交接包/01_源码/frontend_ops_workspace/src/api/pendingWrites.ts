/** Tab-local recovery commands. No bearer token or verification code is stored here. */
export interface SavedWrite {
  namespace: string
  accountId: string
  selectedId: string
  partyId: string | null
  authority: string
  route: string
  path: string
  method: 'POST' | 'PATCH' | 'DELETE'
  key: string
  body: unknown
  ifMatch?: number
}
const storageKey = 'ops.service.commands'
function commands(): SavedWrite[] {
  const raw = sessionStorage.getItem(storageKey)
  if (!raw) return []
  const value: unknown = JSON.parse(raw)
  if (!Array.isArray(value) || value.length > 32 || value.some(c => !c || typeof c !== 'object' ||
    !['namespace','accountId','selectedId','authority','route','path','key'].every(k => typeof c[k] === 'string') ||
    !(c.partyId === null || typeof c.partyId === 'string') || !['POST','PATCH','DELETE'].includes(c.method) ||
    !(c.ifMatch === undefined || Number.isSafeInteger(c.ifMatch) && c.ifMatch > 0))) throw Error('INVALID_RECOVERY_STORAGE')
  return value as SavedWrite[]
}
const sameSlot = (a: SavedWrite, b: SavedWrite) => a.namespace === b.namespace && a.accountId === b.accountId && a.route === b.route && a.partyId === b.partyId
export function saveWrite(command: SavedWrite) {
  const rows = commands(), old = rows.find(c => sameSlot(c, command))
  if (old && old.key !== command.key) throw Error('UNRESOLVED_RECOVERY_COMMAND')
  const next = [...rows.filter(c => !sameSlot(c, command)), command]
  if (next.length > 32) throw Error('RECOVERY_STORAGE_FULL')
  sessionStorage.setItem(storageKey, JSON.stringify(next))
}
export function savedWrite(namespace: string, accountId: string, partyId: string | null, route: string) {
  return commands().find(c => c.namespace === namespace && c.accountId === accountId && c.partyId === partyId && c.route === route) ?? null
}
export function recoveryIdentity(accountId: string) {
  try { return commands().find(c => c.accountId === accountId)?.selectedId || '' } catch { return '' }
}
export function removeWrite(key: string) {
  const next = commands().filter(c => c.key !== key)
  if (next.length) sessionStorage.setItem(storageKey, JSON.stringify(next))
  else sessionStorage.removeItem(storageKey)
}
export function clearSavedWrites() { try { sessionStorage.removeItem(storageKey) } catch { /* The next dispatch fails closed if recovery storage is unavailable. */ } }
export function retainSavedAccount(accountId: string) {
  try {
    const next = commands().filter(c => c.accountId === accountId)
    if (next.length) sessionStorage.setItem(storageKey, JSON.stringify(next))
    else clearSavedWrites()
  } catch { /* Keep unreadable recovery state so a new write fails closed until explicit logout. */ }
}

export function invalidateSavedIdentity(accountId:string,selectedId:string) {
  try {
    const next=commands().filter(c=>c.accountId!==accountId||c.selectedId!==selectedId)
    if(next.length)sessionStorage.setItem(storageKey,JSON.stringify(next))
    else clearSavedWrites()
  } catch { /* Keep unreadable recovery state so a new write fails closed until explicit logout. */ }
}
