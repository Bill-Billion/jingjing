import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { createSession, getCurrentAccount, getMyPartyAccess, listMyParties, revokeCurrentSession, sendCommand } from '@/api/modules/account'
import { clearSavedWrites, retainSavedAccount, recoveryIdentity, invalidateSavedIdentity } from '@/api/pendingWrites'
import { ApiError, newIdempotencyKey, onUnauthorized, outcomeUnknown, type UnauthorizedRecovery } from '@/api/client'
import type { Account, AccountCommand, PartyAccess, Invitation } from '@/api/types'

const keys = { token: 'ops.session.token', expires: 'ops.session.expires_at', selected: 'ops.session.selected', receipts: 'ops.session.receipts', pending: 'ops.session.pending' }
const read = <T>(key: string, fallback: T): T => { try { return JSON.parse(sessionStorage.getItem(key) || 'null') ?? fallback } catch { return fallback } }

export const useSessionStore = defineStore('session', () => {
  const token = ref<string | null>(sessionStorage.getItem(keys.token))
  const expiresAt = ref<string | null>(sessionStorage.getItem(keys.expires))
  const account = ref<Account | null>(null)
  const parties = ref<PartyAccess[]>([])
  const nextCursor = ref<string | null>(null)
  const selectedId = ref(sessionStorage.getItem(keys.selected) || '')
  const receipts = ref<Invitation[]>(token.value ? read(keys.receipts, []) : [])
  const pending = ref<AccountCommand | null>(token.value ? read(keys.pending, null) : null)
  const commandBusy = ref(false)
  const loadingAccount = ref(false)
  const loadingParties = ref(false)
  const revision = ref(0)
  const notice = ref('')
  const loginRecovery = ref<UnauthorizedRecovery | null>(null)
  const loginExpired = ref(false)
  let generation = 0
  let partyRequest = 0
  let logoutPromise: Promise<void> | null = null
  const isLoggedIn = computed(() => Boolean(token.value))
  const selected = computed(() => parties.value.find(p => p.party.id === selectedId.value) || null)
  const authority = computed(() => {
    const row = selected.value
    return JSON.stringify([selectedId.value, row?.party.current_status, row?.membership.current_status,
      [...(row?.membership.roles ?? [])].sort(), [...(row?.membership.allowed_actions ?? [])].sort(), [...(row?.party.allowed_actions ?? [])].sort(),
      (row?.party.capabilities ?? []).map(c => [c.code,c.current_status,[...(c.allowed_actions ?? [])].sort()]).sort()])
  })
  watch(authority, (_value,previous) => {
    // Initial hydration has no previous private context. Live changes must
    // also invalidate commands whose page is currently unmounted.
    const old=JSON.parse(previous)
    if(token.value&&account.value&&old[1])invalidateSavedIdentity(account.value.id,old[0])
    revision.value++
  }, { flush: 'sync' })
  const capture = () => ({ token: token.value, generation, revision: revision.value })
  const current = (s: ReturnType<typeof capture>, partyScoped = false) => s.token === token.value && s.generation === generation && (!partyScoped || s.revision === revision.value)
  function savePrivate() {
    sessionStorage.setItem(keys.receipts, JSON.stringify(receipts.value))
    if (pending.value) sessionStorage.setItem(keys.pending, JSON.stringify(pending.value))
    else sessionStorage.removeItem(keys.pending)
  }
  function clearLocal(message = '', preserveWrites = false) {
    // Clear the token first: an expired login may retain a hidden command until
    // the same account authenticates again; explicit logout deletes it.
    token.value = null
    generation++; partyRequest++; revision.value++
    token.value = expiresAt.value = null; account.value = null; parties.value = []; nextCursor.value = null; selectedId.value = ''
    receipts.value = []; pending.value = null; commandBusy.value = false
    loadingAccount.value = loadingParties.value = false
    Object.values(keys).forEach(key => sessionStorage.removeItem(key))
    notice.value = message
    loginRecovery.value = null
    loginExpired.value = false
    if (!preserveWrites) clearSavedWrites()
  }
  onUnauthorized((t,recovery) => { if (t === token.value) { clearLocal('登录已失效，请重新登录。', true); loginRecovery.value = recovery ?? null; loginExpired.value = true } })
  function selectParty(id: string) {
    if (id && !parties.value.some(p => p.party.id === id)) return
    selectedId.value = id; sessionStorage.setItem(keys.selected, id)
  }
  async function loginByCode(input: { phone: string; challengeId: string; code: string; idempotencyKey: string }) {
    const s = capture()
    const res = await createSession(input, input.idempotencyKey)
    if (!current(s)) throw new ApiError({ status: 0, code: 'CLIENT_REQUEST_CANCELLED', message: '登录操作已取消。' })
    clearLocal('', true)
    retainSavedAccount(res.data.account.id)
    // Only an authenticated matching account may restore the saved identity;
    // loadParties still verifies its current membership before any dispatch.
    selectedId.value = recoveryIdentity(res.data.account.id)
    sessionStorage.setItem(keys.selected, selectedId.value)
    token.value = res.data.access_token; expiresAt.value = res.data.expires_at; account.value = res.data.account
    sessionStorage.setItem(keys.token, token.value); sessionStorage.setItem(keys.expires, expiresAt.value)
    return res
  }
  async function loadAccount() {
    const s = capture(); if (!s.token) return null
    loadingAccount.value = true
    try { const res = await getCurrentAccount(s.token); if (current(s)) { retainSavedAccount(res.data.id); account.value = res.data }; return res }
    finally { if (current(s)) loadingAccount.value = false }
  }
  async function loadParties(more = false) {
    const s = capture(); if (!s.token || (more && !nextCursor.value)) return null
    const wanted = selectedId.value
    const ticket = ++partyRequest; loadingParties.value = true
    try {
      const res = await listMyParties(s.token, { cursor: more ? nextCursor.value : null })
      if (!current(s, true) || ticket !== partyRequest) return null
      const rows = more ? [...parties.value, ...res.data.items] : res.data.items
      // A full reload has only the saved ID. Fetch the current membership too,
      // rather than reusing an earlier role or selecting the first page's owner.
      if (!more && wanted && !rows.some(p => p.party.id === wanted)) {
        const detail = await getMyPartyAccess(s.token, wanted)
        if (!current(s, true) || ticket !== partyRequest) return null
        if (detail.data.party.id === wanted) rows.push(detail.data)
      }
      if (!current(s, true) || ticket !== partyRequest) return null
      parties.value = [...new Map(rows.map(p => [p.party.id, p])).values()]; nextCursor.value = res.data.next_cursor
      if (wanted && !parties.value.some(p => p.party.id === wanted)) { selectParty(''); notice.value = '原办理身份已无法访问，请重新选择可用身份。' }
      else if (!wanted) selectParty(parties.value[0]?.party.id || '')
      return res
    } catch (e) {
      if (current(s, true) && e instanceof ApiError && [403,404].includes(e.status)) {
        parties.value=[];selectParty('');notice.value='原办理身份已无法访问，请重新选择可用身份。'
      }
      throw e
    } finally { if (current(s) && ticket === partyRequest) loadingParties.value = false }
  }
  const loadMoreParties = () => loadParties(true)
  async function refreshSelected() {
    const s = capture(), id = selectedId.value
    if (!s.token || !id) return
    try {
      const res = await getMyPartyAccess(s.token, id)
      if (!current(s, true)) return
      const fresh = res.data.party.id === id ? res.data : null
      if (!fresh) throw new ApiError({ status: 404, code: 'PARTY_NOT_FOUND', message: '当前办理身份已无法访问。' })
      parties.value = parties.value.map(p => p.party.id === id ? fresh : p)
    } catch (e) {
      if (current(s, true) && e instanceof ApiError && [403,404].includes(e.status)) {
        parties.value = parties.value.filter(p => p.party.id !== id); selectParty('')
        notice.value = '原办理身份已无法访问，请重新选择可用身份。'
      }
      throw e
    }
  }
  /** An uncertain command is saved before dispatch. Only retrying that exact command is allowed. */
  async function execute(input?: Omit<AccountCommand, 'key'>) {
    if (commandBusy.value || !token.value) return null
    if (input && pending.value) throw new ApiError({ status: 409, code: 'CLIENT_PENDING_OPERATION', message: '上一项操作的结果尚未确认，请先重试原操作。' })
    const command = input ? { ...input, key: newIdempotencyKey() } : pending.value
    if (!command) return null
    const s = capture(); pending.value = command; savePrivate(); commandBusy.value = true
    try {
      const res = await sendCommand(s.token!, command)
      if (!current(s)) return null
      pending.value = null
      if (command.kind === 'invite') receipts.value.unshift(res.data as Invitation)
      if (command.kind === 'revoke') {
        const row = receipts.value.find(r => r.invitation_id === command.invitation)
        if (row) Object.assign(row, res.data)
      }
      savePrivate()
      return { command, data: res.data }
    } catch (e) {
      if (current(s) && !outcomeUnknown(e)) {
        pending.value = null
        if (command.kind === 'revoke' && e instanceof ApiError && [403,404,409,412,422].includes(e.status)) {
          const row = receipts.value.find(r => r.invitation_id === command.invitation); if (row) row.needsRefresh = true
        }
        savePrivate()
      }
      throw e
    } finally { if (current(s)) commandBusy.value = false }
  }
  async function logout() {
    if (logoutPromise) return logoutPromise
    const oldToken = token.value
    clearLocal()
    logoutPromise = (async () => {
      if (!oldToken) return
      try { await revokeCurrentSession(oldToken, newIdempotencyKey()) }
      catch { if (!token.value) notice.value = '本机已退出，服务器注销尚未确认。若使用共用设备，请关闭此标签页。' }
    })().finally(() => { logoutPromise = null })
    return logoutPromise
  }
  return { token, expiresAt, account, parties, nextCursor, selectedId, selected, authority, receipts, pending, commandBusy, loadingAccount, loadingParties, revision, notice, loginRecovery, loginExpired, isLoggedIn, capture, current, selectParty, loginByCode, loadAccount, loadParties, loadMoreParties, refreshSelected, execute, logout, clearLocal }
})
