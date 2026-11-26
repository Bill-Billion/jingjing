import { removeWrite, savedWrite, saveWrite, type SavedWrite } from './pendingWrites'
import type { TradeKind, TradeWrite } from './modules/trade'
import type { SupplyContext } from '@/composables/useSupply'

interface TradeRecovery extends SavedWrite {
  trade: { targetId?: string; resultId?: string; resultKind: TradeKind; label: string }
}
const kinds = ['SPEC', 'QUOTE', 'ORDER', 'PAYMENT', 'REFUND', 'LEGACY']
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

/** Reuse the session's account/identity invalidation; never persist authentication. */
export function saveTradeRecovery(c: SupplyContext, command: TradeWrite, key: string, resultId?: string) {
  const saved: TradeRecovery = {
    namespace: 'trade', accountId: c.accountId, selectedId: c.partyId || '', partyId: c.partyId,
    authority: 'trade', route: c.scope, path: command.path, method: 'POST', key,
    body: command.body, ifMatch: command.version,
    trade: { targetId: command.targetId, resultKind: command.resultKind, label: command.label, resultId },
  }
  saveWrite(saved)
}
export function readTradeRecovery(c: SupplyContext) {
  const saved = savedWrite('trade', c.accountId, c.partyId, c.scope) as TradeRecovery | null
  if (!saved) return null
  if (saved.method !== 'POST' || !/^\/trade\/[a-zA-Z0-9/-]+$/.test(saved.path) ||
      !saved.key || !saved.trade || !kinds.includes(saved.trade.resultKind) ||
      typeof saved.trade.label !== 'string' ||
      [saved.trade.targetId, saved.trade.resultId].some(id => id !== undefined && !uuid.test(id))) {
    throw Error('INVALID_TRADE_RECOVERY')
  }
  const command: TradeWrite = {
    path: saved.path, body: saved.body, version: saved.ifMatch,
    targetId: saved.trade.targetId, resultKind: saved.trade.resultKind, label: saved.trade.label,
  }
  return { command, key: saved.key, resultId: saved.trade.resultId }
}
export const removeTradeRecovery = removeWrite
