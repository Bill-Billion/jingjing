import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useSessionStore } from './session'
import { ApiError, asApiError, newIdempotencyKey, outcomeUnknown } from '@/api/client'
import { getIntake, listIntake, startIntake, type IntakeCommand, type IntakeIdentity, type IntakeRequest, type IntakeStatus, type IntakeSummary, getSupplement, requestSupplement, listSubmissions, getSubmission, listCustomizationQuotes, validSupplementItems, type SupplementContext, type SupplementItem, type SupplementCommand, type SubmissionSummary, type SubmissionVersion, type CustomizationQuoteSummary } from '@/api/modules/customization'

export const useCustomizationStore = defineStore('customization-intake', () => {
  const session = useSessionStore()
  const rows = ref<IntakeSummary[]>([]), nextCursor = ref<string|null>(null), detail = ref<IntakeRequest|null>(null)
  const status = ref<IntakeStatus|''>('SUBMITTED'), error = ref<ApiError|null>(null), notice = ref('')
  const loading = ref(false), busy = ref(false), conflicted = ref(false), reconfirmed = ref(false)
  type Command = IntakeCommand & { kind?: 'intake'|'supplement'; items?: SupplementItem[] }
  const pending = ref<(Command & { checked: boolean })|null>(null)
  const supplement = ref<SupplementContext|null>(null), supplementItems = ref<SupplementItem[]>([{field_key:'',reason:'',instruction:''}])
  const history = ref<SubmissionSummary[]>([]), historyCursor = ref<string|null>(null), historyVersion = ref<SubmissionVersion|null>(null)
  const quotes = ref<CustomizationQuoteSummary[]>([]), quotesCursor = ref<string|null>(null)
  const canSupplement = computed(() => !locked.value && (!conflicted.value || reconfirmed.value) && detail.value?.current_status === 'INTAKE' && supplement.value?.object_version === detail.value.object_version && supplement.value.allowed_actions.includes('REQUEST_SUPPLEMENT') && validSupplementItems(supplementItems.value,detail.value.template_snapshot))
  let generation = 0, readTicket = 0, readController: AbortController | null = null
  const seenCursors = new Set<string>()
  const locked = computed(() => loading.value || busy.value || !!pending.value)
  const canIntake = computed(() => !locked.value && (!conflicted.value || reconfirmed.value) && detail.value?.current_status === 'SUBMITTED' && detail.value.allowed_actions.includes('INTAKE'))
  function clear() {
    generation++; readTicket++; readController?.abort(); readController = null
    rows.value = []; nextCursor.value = null; detail.value = null; pending.value = null
    supplement.value = null; supplementItems.value = [{field_key:'',reason:'',instruction:''}]; history.value = []; historyCursor.value = null; historyVersion.value = null; quotes.value = []; quotesCursor.value = null
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
    supplement.value = null; quotes.value = []; quotesCursor.value = null; history.value = []; historyCursor.value = null; historyVersion.value = null
    try {
      const r = await getIntake(identity(s),id,readController.signal)
      if (!current(s) || ticket !== readTicket) return null
      detail.value = r; return r
    } catch(e) { if (current(s) && ticket === readTicket) failure(e); return null }
    finally { if (current(s) && ticket === readTicket) loading.value = false }
  }
  async function dispatch(command: Command) {
    const s = capture(); if (!s.token || !s.accountId || busy.value) return
    busy.value = true; error.value = null; notice.value = ''
    try {
      const result = command.kind === 'supplement' ? await requestSupplement(identity(s),command as SupplementCommand) : await startIntake(identity(s),command)
      if (!current(s)) return
      const r = command.kind === 'supplement' ? await getIntake(identity(s),command.id) : result as IntakeRequest
      if (!current(s)) return
      if (command.kind === 'supplement') { supplement.value = result as SupplementContext; supplementItems.value = [{field_key:'',reason:'',instruction:''}] }
      else supplement.value = null
      detail.value = r; rows.value = []; nextCursor.value = null; pending.value = null
      conflicted.value = reconfirmed.value = false; notice.value = command.kind === 'supplement' ? '补充要求已发送，等待用户正式重提后重新受理。' : '已开始受理，操作人和时间已记录。'
    } catch(e) {
      if (!current(s)) return
      const value = asApiError(e)
      if (outcomeUnknown(value)) {
        if (pending.value) pending.value.checked = false
        detail.value = null; error.value = value; notice.value = '操作结果尚未确认。先核对当前记录，再恢复同一次请求。'
      } else {
        pending.value = null; failure(value)
        if ([409,412].includes(value.status)) {
          busy.value = false
          const r = await read(command.id)
          if (!current(s) || !r) return
          conflicted.value = value.status === 412; reconfirmed.value = false
          error.value = value
          if (command.kind === 'supplement') await readSupplement(command.id)
          notice.value = value.status === 412 ? '提交版本已变化。补件输入仍保留，请核对最新故事和要求后重新确认。' : '当前状态已变化，已读取最新记录。请按最新状态继续。'
        }
      }
    } finally { if (current(s)) busy.value = false }
  }
  async function intake() {
    if (!canIntake.value || !detail.value) return
    const command = {id:detail.value.id,version:detail.value.object_version,key:newIdempotencyKey(),kind:'intake' as const}
    pending.value = {...command,checked:false}; await dispatch(command)
  }
  async function checkPending() {
    const command = pending.value; if (!command || loading.value || busy.value) return
    const r = await read(command.id,true)
    if (r && command.kind === 'supplement') await readSupplement(command.id,true)
    if (r && pending.value === command) {
      command.checked = true
      notice.value = '已核对当前提交。恢复原请求会沿用原内容和原版本，不会另建操作。'
    }
  }
  async function retryPending() {
    if (!pending.value?.checked || loading.value || busy.value) return
    await dispatch({...pending.value})
  }
  async function readSupplement(id: string, checking = false) {
    if (busy.value || pending.value && !checking) return
    const s = capture(); if (!s.token || !s.accountId) return
    supplement.value = null; loading.value = true
    try {
      const r = await getSupplement(identity(s),id)
      if (current(s) && detail.value?.id === id) {
        if (r.object_version !== detail.value.object_version) throw new ApiError({status:412,code:'VERSION_CONFLICT',message:'故事与补充要求在读取期间发生变化，请刷新核对。'})
        supplement.value = r
      }
    } catch(e) { if (current(s)) failure(e) }
    finally { if (current(s)) loading.value = false }
  }
  async function supplementRequest() {
    if (!canSupplement.value || !detail.value) return
    const command: Command = {kind:'supplement',id:detail.value.id,version:detail.value.object_version,key:newIdempotencyKey(),items:JSON.parse(JSON.stringify(supplementItems.value))}
    pending.value = {...command,checked:false}; await dispatch(command)
  }
  async function loadHistory(more = false) {
    const id = detail.value?.id; if (!id || locked.value || more && !historyCursor.value) return
    const s = capture(); if (!s.token || !s.accountId) return
    const cursor = more ? historyCursor.value : null; loading.value = true
    try { const r = await listSubmissions(identity(s),id,cursor); if (!current(s) || detail.value?.id !== id) return
      if (r.next_cursor && (r.next_cursor === cursor || history.value.some(x => x.id === r.next_cursor))) throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'历史分页没有前进，请重新读取。'})
      history.value = more ? [...new Map([...history.value,...r.items].map(x => [x.id,x])).values()] : r.items; historyCursor.value = r.next_cursor
    } catch(e) { if (current(s)) failure(e) } finally { if (current(s)) loading.value = false }
  }
  async function readHistory(submissionId: string) {
    const id = detail.value?.id; if (!id || locked.value) return
    const s = capture(); if (!s.token || !s.accountId) return
    loading.value = true; historyVersion.value = null
    try { const r = await getSubmission(identity(s),id,submissionId); if (current(s) && detail.value?.id === id) historyVersion.value = r }
    catch(e) { if (current(s)) failure(e) } finally { if (current(s)) loading.value = false }
  }
  async function loadQuotes(more = false) {
    const id = detail.value?.id; if (!id || locked.value || more && !quotesCursor.value) return
    const s = capture(); if (!s.token || !s.accountId) return
    const cursor = more ? quotesCursor.value : null; loading.value = true
    try { const r = await listCustomizationQuotes(identity(s),id,cursor); if (!current(s) || detail.value?.id !== id) return
      if (r.next_cursor && r.next_cursor === cursor) throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'报价分页没有前进，请重新读取。'})
      quotes.value = more ? [...new Map([...quotes.value,...r.items].map(x => [x.id,x])).values()] : r.items; quotesCursor.value = r.next_cursor
    } catch(e) { if (current(s)) failure(e) } finally { if (current(s)) loading.value = false }
  }
  function setStatus(value: IntakeStatus|'') {
    if (locked.value || !['','SUBMITTED','INTAKE'].includes(value)) return
    status.value = value; notice.value = ''; conflicted.value = reconfirmed.value = false
    return load()
  }
  return { supplement,supplementItems,canSupplement,history,historyCursor,historyVersion,quotes,quotesCursor,readSupplement,supplementRequest,loadHistory,readHistory,loadQuotes,rows,nextCursor,detail,status,error,notice,loading,busy,pending,locked,conflicted,reconfirmed,canIntake,clear,load,read,intake,checkPending,retryPending,setStatus }
})
