import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { createSession, getCurrentAccount, listMyParties, getParty, revokeCurrentSession, sendCommand } from '@/api/modules/account'
import { ApiError, newIdempotencyKey, onUnauthorized, outcomeUnknown } from '@/api/client'
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
  let generation = 0
  let partyRequest = 0
  let logoutPromise: Promise<void> | null = null
  const isLoggedIn = computed(() => Boolean(token.value))
  const selected = computed(() => parties.value.find(p => p.party.id === selectedId.value) || null)
  const capture = () => ({ token: token.value, generation, revision: revision.value })
  const current = (s: ReturnType<typeof capture>, partyScoped = false) => s.token === token.value && s.generation === generation && (!partyScoped || s.revision === revision.value)
  function savePrivate() {
    sessionStorage.setItem(keys.receipts, JSON.stringify(receipts.value))
    if (pending.value) sessionStorage.setItem(keys.pending, JSON.stringify(pending.value))
    else sessionStorage.removeItem(keys.pending)
  }
  function clearLocal(message = '') {
    generation++; partyRequest++; revision.value++
    token.value = expiresAt.value = null; account.value = null; parties.value = []; nextCursor.value = null; selectedId.value = ''
    receipts.value = []; pending.value = null; commandBusy.value = false
    loadingAccount.value = loadingParties.value = false
    Object.values(keys).forEach(key => sessionStorage.removeItem(key))
    notice.value = message
  }
  onUnauthorized(t => { if (t === token.value) clearLocal('登录已失效，请重新登录。') })
  function selectParty(id: string) {
    if (!parties.value.some(p => p.party.id === id)) return
    if (selectedId.value !== id) revision.value++
    selectedId.value = id; sessionStorage.setItem(keys.selected, id)
  }
  async function loginByCode(input: { phone: string; challengeId: string; code: string; idempotencyKey: string }) {
    const s = capture()
    const res = await createSession(input, input.idempotencyKey)
    if (!current(s)) throw new ApiError({ status: 0, code: 'CLIENT_REQUEST_CANCELLED', message: '登录操作已取消。' })
    clearLocal()
    token.value = res.data.access_token; expiresAt.value = res.data.expires_at; account.value = res.data.account
    sessionStorage.setItem(keys.token, token.value); sessionStorage.setItem(keys.expires, expiresAt.value)
    return res
  }
  async function loadAccount() {
    const s = capture(); if (!s.token) return null
    loadingAccount.value = true
    try { const res = await getCurrentAccount(s.token); if (current(s)) account.value = res.data; return res }
    finally { if (current(s)) loadingAccount.value = false }
  }
  async function loadParties(more = false) {
    const s = capture(); if (!s.token || (more && !nextCursor.value)) return null
    const ticket = ++partyRequest; loadingParties.value = true
    try {
      const res = await listMyParties(s.token, { cursor: more ? nextCursor.value : null })
      if (!current(s) || ticket !== partyRequest) return null
      const rows = more ? [...parties.value, ...res.data.items] : res.data.items
      // Preserve the selected identity only after fetching its latest server state. A refresh
      // of page one must not silently replace an identity chosen from a later page.
      const oldSelected = selected.value
      if (!more && oldSelected && !rows.some(p => p.party.id === oldSelected.party.id)) {
        try {
          const detail = await getParty(s.token, oldSelected.party.id)
          if (!current(s) || ticket !== partyRequest) return null
          rows.push({ party: detail.data, membership: oldSelected.membership })
        } catch (e) { if (!(e instanceof ApiError) || ![403, 404].includes(e.status)) throw e }
      }
      if (!current(s) || ticket !== partyRequest) return null
      parties.value = [...new Map(rows.map(p => [p.party.id, p])).values()]; nextCursor.value = res.data.next_cursor
      if (!parties.value.some(p => p.party.id === selectedId.value)) selectParty(parties.value[0]?.party.id || '')
      return res
    } finally { if (current(s) && ticket === partyRequest) loadingParties.value = false }
  }
  const loadMoreParties = () => loadParties(true)
  async function refreshSelected() {
    const s = capture(), id = selectedId.value
    if (!s.token || !id) return
    const res = await getParty(s.token, id)
    if (!current(s, true)) return
    const row = parties.value.find(p => p.party.id === id); if (row) row.party = res.data
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
  return { token, expiresAt, account, parties, nextCursor, selectedId, selected, receipts, pending, commandBusy, loadingAccount, loadingParties, revision, notice, isLoggedIn, capture, current, selectParty, loginByCode, loadAccount, loadParties, loadMoreParties, refreshSelected, execute, logout, clearLocal }
})
