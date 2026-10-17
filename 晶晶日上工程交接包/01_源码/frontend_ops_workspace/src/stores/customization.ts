import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useSessionStore } from './session'
import { ApiError, asApiError, newIdempotencyKey, outcomeUnknown } from '@/api/client'
import { getIntake, listIntake, startIntake, type IntakeCommand, type IntakeIdentity, type IntakeRequest, type IntakeStatus, type IntakeSummary } from '@/api/modules/customization'

export const useCustomizationStore = defineStore('customization-intake', () => {
  const session = useSessionStore()
  const rows = ref<IntakeSummary[]>([]), nextCursor = ref<string|null>(null), detail = ref<IntakeRequest|null>(null)
  const status = ref<IntakeStatus|''>('SUBMITTED'), error = ref<ApiError|null>(null), notice = ref('')
  const loading = ref(false), busy = ref(false), conflicted = ref(false), reconfirmed = ref(false)
  const pending = ref<(IntakeCommand & { checked: boolean })|null>(null)
  let generation = 0, readTicket = 0, readController: AbortController | null = null
  const seenCursors = new Set<string>()
  const locked = computed(() => loading.value || busy.value || !!pending.value)
  const canIntake = computed(() => !locked.value && (!conflicted.value || reconfirmed.value) && detail.value?.current_status === 'SUBMITTED' && detail.value.allowed_actions.includes('INTAKE'))
  function clear() {
    generation++; readTicket++; readController?.abort(); readController = null
    rows.value = []; nextCursor.value = null; detail.value = null; pending.value = null
    error.value = null; notice.value = ''; loading.value = busy.value = conflicted.value = reconfirmed.value = false; seenCursors.clear()
  }
  watch(() => [session.token,session.account?.id,session.selectedId,session.revision], clear, {flush:'sync'})
  const capture = () => ({token:session.token,accountId:session.account?.id || '',revision:session.revision,partyId:session.selectedId,generation})
  const current = (s: ReturnType<typeof capture>) => s.token === session.token && s.accountId === session.account?.id && s.revision === session.revision && s.partyId === session.selectedId && s.generation === generation
  const identity = (s: ReturnType<typeof capture>): IntakeIdentity => ({token:s.token!,accountId:s.accountId})
  function failure(e: unknown) {
    const value = asApiError(e)
    if ([401,403,404].includes(value.status)) clear()
    error.value = value
    if ([403,404].includes(value.status)) notice.value = '这份提交不存在或当前账号无权查看，已清除此前内容。'
    return value
  }
  async function load(more = false) {
    if (busy.value || pending.value || more && !nextCursor.value) return
    const s = capture(); if (!s.token || !s.accountId) return
    const filter = status.value, cursor = more ? nextCursor.value : null, ticket = ++readTicket
    readController?.abort(); readController = new AbortController(); loading.value = true; error.value = null
    detail.value = null
    if (!more) { rows.value = []; nextCursor.value = null; seenCursors.clear() }
    try {
      const page = await listIntake(identity(s),filter,cursor,readController.signal)
      if (!current(s) || ticket !== readTicket || filter !== status.value) return
      if (page.next_cursor && (page.next_cursor === cursor || seenCursors.has(page.next_cursor))) throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'分页位置没有更新，请从第一页重新读取。'})
      if (page.next_cursor) seenCursors.add(page.next_cursor)
      rows.value = more ? [...new Map([...rows.value,...page.items].map(r => [r.id,r])).values()] : page.items
      nextCursor.value = page.next_cursor
    } catch(e) { if (current(s) && ticket === readTicket) failure(e) }
    finally { if (current(s) && ticket === readTicket) loading.value = false }
  }
  async function read(id: string, checking = false): Promise<IntakeRequest|null> {
    if (busy.value || pending.value && !checking) return null
    const s = capture(); if (!s.token || !s.accountId) return null
    const ticket = ++readTicket; readController?.abort(); readController = new AbortController()
    loading.value = true; error.value = null; detail.value = null
    try {
      const r = await getIntake(identity(s),id,readController.signal)
      if (!current(s) || ticket !== readTicket) return null
      detail.value = r; return r
    } catch(e) { if (current(s) && ticket === readTicket) failure(e); return null }
    finally { if (current(s) && ticket === readTicket) loading.value = false }
  }
  async function dispatch(command: IntakeCommand) {
    const s = capture(); if (!s.token || !s.accountId || busy.value) return
    busy.value = true; error.value = null; notice.value = ''
    try {
      const r = await startIntake(identity(s),command)
      if (!current(s)) return
      detail.value = r; rows.value = []; nextCursor.value = null; pending.value = null
      conflicted.value = reconfirmed.value = false; notice.value = '已开始受理，操作人和时间已记录。'
    } catch(e) {
      if (!current(s)) return
      const value = asApiError(e)
      if (outcomeUnknown(value)) {
        if (pending.value) pending.value.checked = false
        detail.value = null; error.value = value; notice.value = '受理结果尚未确认。先核对当前记录，再恢复同一次请求。'
      } else {
        pending.value = null; failure(value)
        if ([409,412].includes(value.status)) {
          busy.value = false
          const r = await read(command.id)
          if (!current(s) || !r) return
          conflicted.value = value.status === 412; reconfirmed.value = false
          error.value = value
          notice.value = value.status === 412 ? '提交版本已变化。已刷新当前版本，请核对后重新确认受理。' : '当前状态已变化，已读取最新记录。请按最新状态继续。'
        }
      }
    } finally { if (current(s)) busy.value = false }
  }
  async function intake() {
    if (!canIntake.value || !detail.value) return
    const command = {id:detail.value.id,version:detail.value.object_version,key:newIdempotencyKey()}
    pending.value = {...command,checked:false}; await dispatch(command)
  }
  async function checkPending() {
    const command = pending.value; if (!command || loading.value || busy.value) return
    const r = await read(command.id,true)
    if (r && pending.value === command) {
      command.checked = true
      notice.value = '已核对当前提交。恢复原请求会沿用原内容和原版本，不会新建受理。'
    }
  }
  async function retryPending() {
    if (!pending.value?.checked || loading.value || busy.value) return
    await dispatch({...pending.value})
  }
  function setStatus(value: IntakeStatus|'') {
    if (locked.value || !['','SUBMITTED','INTAKE'].includes(value)) return
    status.value = value; notice.value = ''; conflicted.value = reconfirmed.value = false
    return load()
  }
  return { rows,nextCursor,detail,status,error,notice,loading,busy,pending,locked,conflicted,reconfirmed,canIntake,clear,load,read,intake,checkPending,retryPending,setStatus }
})
