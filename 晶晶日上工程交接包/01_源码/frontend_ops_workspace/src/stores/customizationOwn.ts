import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useSessionStore } from './session'
import { ApiError, asApiError, newIdempotencyKey, outcomeUnknown } from '@/api/client'
import { answers, listSubmissions, getSubmission, type CustomizationTemplate, type SubmissionSummary, type SubmissionVersion, type Supplement } from '@/api/modules/customization'
import { getOwnStory, getOwnSupplement, listOwnStories, listStoryCategories, sendStoryCommand, hasRequiredAttachment, validStoryResponses, type OwnStory, type StoryCategory, type StoryCommand, type StoryIdentity, type StoryStatus, type StorySummary, type StorySupplement } from '@/api/modules/customizationOwn'

export const useOwnStoryStore = defineStore('customization-own', () => {
  const session = useSessionStore()
  const categories = ref<StoryCategory[]>([]), categoryId = ref(''), rows = ref<StorySummary[]>([]), nextCursor = ref<string | null>(null)
  const status = ref<StoryStatus | ''>(''), listLoaded = ref(false), detail = ref<OwnStory | null>(null), supplement = ref<StorySupplement | null>(null)
  const draftAnswers = ref<Record<string,string>>({}), draftResponses = ref<Record<string,string>>({}), baseline = ref('')
  const editorTemplate = ref<CustomizationTemplate | null>(null), editorRequestId = ref('')
  const editorSupplement = ref<Supplement | null>(null), recoveryRequired = ref(false)
  const fieldErrors = ref<Record<string,string>>({}), error = ref<ApiError | null>(null), notice = ref('')
  const loading = ref(false), busy = ref(false), conflicted = ref(false), reconfirmed = ref(false)
  const pending = ref<{command:StoryCommand;template:CustomizationTemplate;checked:boolean} | null>(null)
  const history = ref<SubmissionSummary[]>([]), historyCursor = ref<string | null>(null), historyVersion = ref<SubmissionVersion | null>(null)
  const selectedCategory = computed(() => categories.value.find(c => c.template_version_id === categoryId.value) || null)
  const template = computed(() => detail.value?.template_snapshot || editorTemplate.value || selectedCategory.value?.template_snapshot || null)
  const fingerprint = () => JSON.stringify([categoryId.value,draftAnswers.value,draftResponses.value])
  const dirty = computed(() => !!template.value && fingerprint() !== baseline.value)
  const locked = computed(() => loading.value || busy.value || !!pending.value)
  const activeIdentity = computed(() => !!session.token && !!session.account?.id && !!session.selectedId && session.selected?.membership.current_status === 'ACTIVE')
  const isSupplement = computed(() => supplement.value?.supplement?.current_status === 'OPEN' && supplement.value.object_version === detail.value?.object_version)
  const preservedDraft = computed(() => recoveryRequired.value || conflicted.value && dirty.value)
  const editingSupplement = computed(() => isSupplement.value ? supplement.value!.supplement : preservedDraft.value ? editorSupplement.value : null)
  const canEdit = computed(() => activeIdentity.value && !locked.value && (!detail.value && !editorRequestId.value || detail.value?.current_status === 'DRAFT' && detail.value.allowed_actions.includes('SAVE') || isSupplement.value && supplement.value!.allowed_actions.includes('SAVE_SUPPLEMENT')))
  const canSave = computed(() => canEdit.value && !!template.value && (!conflicted.value || reconfirmed.value))
  const canSubmit = computed(() => activeIdentity.value && !locked.value && !dirty.value && !!detail.value && !!template.value && !hasRequiredAttachment(template.value) && (!conflicted.value || reconfirmed.value) && (isSupplement.value ? supplement.value!.allowed_actions.includes('SUBMIT_SUPPLEMENT') : detail.value.current_status === 'DRAFT' && detail.value.allowed_actions.includes('SUBMIT')))
  let generation = 0, readTicket = 0, controller: AbortController | null = null
  const seenCursors = new Set<string>(), historyCursors = new Set<string>()
  function resetEditor() {
    generation++; readTicket++; controller?.abort(); controller = null; loading.value = false
    detail.value = null; supplement.value = null; categoryId.value = ''; draftAnswers.value = {}; draftResponses.value = {}; baseline.value = fingerprint()
    editorTemplate.value = null; editorRequestId.value = ''; editorSupplement.value = null; recoveryRequired.value = false
    history.value = []; historyCursor.value = null; historyVersion.value = null; historyCursors.clear(); fieldErrors.value = {}; conflicted.value = reconfirmed.value = false
  }
  function clear() {
    generation++; readTicket++; controller?.abort(); controller = null
    resetEditor(); categories.value = []; rows.value = []; nextCursor.value = null; status.value = ''; listLoaded.value = false; seenCursors.clear()
    pending.value = null; error.value = null; notice.value = ''; loading.value = busy.value = false
  }
  watch(() => [session.token,session.account?.id,session.selectedId,session.revision], clear, {flush:'sync'})
  const capture = () => ({token:session.token,accountId:session.account?.id || '',partyId:session.selectedId,revision:session.revision,generation})
  const current = (s: ReturnType<typeof capture>) => s.token === session.token && s.accountId === session.account?.id && s.partyId === session.selectedId && s.revision === session.revision && s.generation === generation
  const identity = (s: ReturnType<typeof capture>): StoryIdentity => ({token:s.token!,accountId:s.accountId,partyId:s.partyId})
  function failure(e: unknown) {
    const value = asApiError(e)
    if ([401,403,404].includes(value.status)) clear()
    error.value = value
    if ([403,404].includes(value.status)) notice.value = '当前身份无法查看这份私人故事，已清除此前内容。'
    return value
  }
  function fillDraft() {
    editorTemplate.value = detail.value?.template_snapshot || null; editorRequestId.value = detail.value?.id || ''
    editorSupplement.value = supplement.value?.supplement?.current_status === 'OPEN' ? supplement.value.supplement : null
    categoryId.value = detail.value?.template_version_id || categoryId.value
    draftAnswers.value = {...(supplement.value?.draft?.answers || detail.value?.answers || {})}
    draftResponses.value = {...(supplement.value?.draft?.responses || {})}; baseline.value = fingerprint(); fieldErrors.value = {}
  }
  function selectCategory(id: string) {
    if (locked.value || detail.value || !categories.value.some(c => c.template_version_id === id)) return
    categoryId.value = id; draftAnswers.value = {}; draftResponses.value = {}; baseline.value = fingerprint(); fieldErrors.value = {}; error.value = null
  }
  async function loadCategories() {
    if (locked.value) return
    const s = capture(); if (!s.token || !s.accountId) return
    const ticket = ++readTicket; controller?.abort(); controller = new AbortController(); loading.value = true; error.value = null
    try { const r = await listStoryCategories(identity(s),controller.signal); if (current(s) && ticket === readTicket) categories.value = r.items }
    catch(e) { if (current(s) && ticket === readTicket) failure(e) }
    finally { if (current(s) && ticket === readTicket) loading.value = false }
  }
  async function load(more = false, checking = false) {
    if (busy.value || pending.value && !checking || more && !nextCursor.value) return false
    const s = capture(); if (!s.token || !s.accountId || !s.partyId) return false
    const filter = status.value, cursor = more ? nextCursor.value : null, ticket = ++readTicket
    controller?.abort(); controller = new AbortController(); loading.value = true; error.value = null
    if (!more) { rows.value = []; nextCursor.value = null; seenCursors.clear(); listLoaded.value = false }
    try {
      const page = await listOwnStories(identity(s),filter,cursor,controller.signal)
      if (!current(s) || ticket !== readTicket || filter !== status.value) return false
      if (page.next_cursor && (page.next_cursor === cursor || seenCursors.has(page.next_cursor))) throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'分页位置没有更新，请重新读取故事列表。'})
      if (page.next_cursor) seenCursors.add(page.next_cursor)
      rows.value = more ? [...new Map([...rows.value,...page.items].map(r => [r.id,r])).values()] : page.items
      nextCursor.value = page.next_cursor; listLoaded.value = true; return true
    } catch(e) { if (current(s) && ticket === readTicket) failure(e); return false }
    finally { if (current(s) && ticket === readTicket) loading.value = false }
  }
  async function read(id: string, preserveDraft = false, checking = false) {
    if (busy.value || pending.value && !checking) return null
    const s = capture(); if (!s.token || !s.accountId || !s.partyId) return null
    const ticket = ++readTicket; controller?.abort(); controller = new AbortController(); loading.value = true; error.value = null
    detail.value = null; supplement.value = null; history.value = []; historyCursor.value = null; historyVersion.value = null; historyCursors.clear()
    if (!preserveDraft) { draftAnswers.value = {}; draftResponses.value = {}; categoryId.value = ''; fieldErrors.value = {}; editorTemplate.value = null; editorRequestId.value = id }
    try {
      const r = await getOwnStory(identity(s),id,controller.signal)
      if (!current(s) || ticket !== readTicket) return null
      const context = r.current_status === 'DRAFT' ? null : await getOwnSupplement(identity(s),r,controller.signal)
      if (!current(s) || ticket !== readTicket) return null
      detail.value = r; supplement.value = context; recoveryRequired.value = false
      if (!preserveDraft) fillDraft()
      else baseline.value = JSON.stringify([r.template_version_id,context?.draft?.answers || r.answers,context?.draft?.responses || {}])
      return r
    } catch(e) { if (current(s) && ticket === readTicket) failure(e); return null }
    finally { if (current(s) && ticket === readTicket) loading.value = false }
  }
  function validate(submitted: boolean) {
    const t = template.value, errors: Record<string,string> = {}
    if (!t) return false
    for (const f of t.fields) {
      const value = draftAnswers.value[f.key] || ''
      if (f.type === 'PRIVATE_ATTACHMENT') { if (value || submitted && f.required) errors[`answers.${f.key}`] = '附件上传尚未开放，当前不能正式提交此必填附件。' }
      else if (submitted && f.required && !value.trim()) errors[`answers.${f.key}`] = `请填写${f.label}。`
      else if (Array.from(value).length > (f.max_length ?? 12000)) errors[`answers.${f.key}`] = `最多填写 ${f.max_length ?? 12000} 个字。`
      else if (f.type === 'CHOICE' && value && !f.options?.includes(value)) errors[`answers.${f.key}`] = '请选择该模板提供的选项。'
    }
    if (isSupplement.value) for (const item of supplement.value!.supplement!.items) {
      const value = draftResponses.value[item.field_key] || ''
      if (submitted && !value.trim()) errors[`responses.${item.field_key}`] = '请说明本次如何补充或更正。'
      else if (Array.from(value).length > 2000) errors[`responses.${item.field_key}`] = '补充说明最多 2000 个字。'
    }
    fieldErrors.value = errors
    if (Object.keys(errors).length || !answers(draftAnswers.value,t,submitted) || isSupplement.value && !validStoryResponses(draftResponses.value,supplement.value!.supplement!,submitted)) {
      error.value = new ApiError({status:400,code:'CLIENT_STORY_INVALID',message:Object.keys(errors).length ? '请修正标出的故事字段。' : '故事正文最多 48 KiB，补充说明最多 16 KiB，请缩短后再保存。'}); return false
    }
    error.value = null; return true
  }
  async function dispatch(p: NonNullable<typeof pending.value>) {
    const s = capture(); if (!s.token || !s.accountId || !s.partyId || busy.value) return
    const c = p.command; busy.value = true; error.value = null; notice.value = ''; let submittedSupplement = false
    try {
      const r = await sendStoryCommand(identity(s),c,p.template)
      if (!current(s)) return
      if ('request_id' in r) {
        supplement.value = r
        if (detail.value?.id === r.request_id) detail.value = {...detail.value,object_version:r.object_version}
      } else { detail.value = r; supplement.value = null }
      pending.value = null; conflicted.value = reconfirmed.value = false; rows.value = []; nextCursor.value = null; listLoaded.value = false
      fillDraft(); notice.value = c.kind === 'submit' || c.kind === 'submit-supplement' ? '故事已正式提交，等待平台查看。正式内容已保存为独立版本。' : '草稿已保存，可稍后返回继续填写；尚未正式提交。'
      submittedSupplement = c.kind === 'submit-supplement'
    } catch(e) {
      if (!current(s)) return
      const value = asApiError(e)
      if (outcomeUnknown(value)) {
        if (pending.value) pending.value.checked = false
        error.value = value; notice.value = '本次操作结果尚未确认。请先核对，再恢复原请求；不要重新创建故事。'
      } else {
        pending.value = null; failure(value)
        if ([409,412].includes(value.status) && c.kind !== 'create') {
          recoveryRequired.value = true; conflicted.value = true; reconfirmed.value = false
          notice.value = '故事状态或版本已变化。本次输入仍保留，正在重新读取；读取失败时可保留输入重试。'
          busy.value = false; const r = await read(c.id,true)
          if (!current(s) || !r) return
          error.value = value
          notice.value = '故事状态或版本已变化，已读取最新记录。本次输入仍保留，请核对后再继续。'
        }
      }
    } finally { if (current(s)) busy.value = false }
    if (submittedSupplement && current(s) && detail.value) await read(detail.value.id)
  }
  async function save() {
    if (!canSave.value || !validate(false) || !template.value) return
    const common = {key:newIdempotencyKey(),answers:{...draftAnswers.value}}, r = detail.value
    const command: StoryCommand = !r ? {...common,kind:'create',template_version_id:categoryId.value} : isSupplement.value ? {...common,kind:'save-supplement',id:r.id,version:r.object_version,responses:{...draftResponses.value}} : {...common,kind:'save',id:r.id,version:r.object_version}
    pending.value = {command,template:JSON.parse(JSON.stringify(template.value)),checked:false}; await dispatch(pending.value)
  }
  async function submit() {
    if (!canSubmit.value || !detail.value || !template.value || !validate(true)) return
    const command: StoryCommand = {kind:isSupplement.value ? 'submit-supplement' : 'submit',id:detail.value.id,version:detail.value.object_version,key:newIdempotencyKey()}
    pending.value = {command,template:JSON.parse(JSON.stringify(template.value)),checked:false}; await dispatch(pending.value)
  }
  async function checkPending() {
    const p = pending.value; if (!p || busy.value || loading.value) return
    const result = p.command.kind === 'create' ? await load(false,true) : await read(p.command.id,true,true)
    if (result && pending.value === p) { p.checked = true; notice.value = '已核对当前记录。恢复会沿用原来的内容、版本和请求编号；列表中的相似内容不会被当作本次操作的证明。' }
  }
  async function retryPending() { if (pending.value?.checked && !loading.value && !busy.value) await dispatch(pending.value) }
  async function retryLatest() {
    if (locked.value || !editorRequestId.value) return
    const r = await read(editorRequestId.value,true)
    if (r) notice.value = '已重新读取最新记录，本次输入保持原样。请核对最新状态、正式内容与补件要求后继续。'
  }
  async function loadHistory(more = false) {
    const id = detail.value?.id; if (!id || locked.value || more && !historyCursor.value) return
    const s = capture(), cursor = more ? historyCursor.value : null; loading.value = true; error.value = null
    if (!more) historyCursors.clear()
    try {
      const r = await listSubmissions(identity(s),id,cursor)
      if (!current(s) || detail.value?.id !== id) return
      if (r.next_cursor && (r.next_cursor === cursor || historyCursors.has(r.next_cursor))) throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'历史分页没有前进，请重新读取。'})
      if (r.next_cursor) historyCursors.add(r.next_cursor)
      history.value = more ? [...new Map([...history.value,...r.items].map(x => [x.id,x])).values()] : r.items; historyCursor.value = r.next_cursor
    } catch(e) { if (current(s)) failure(e) } finally { if (current(s)) loading.value = false }
  }
  async function readHistory(id: string) {
    const requestId = detail.value?.id; if (!requestId || locked.value) return
    const s = capture(); loading.value = true; historyVersion.value = null
    try { const r = await getSubmission(identity(s),requestId,id); if (current(s) && detail.value?.id === requestId) historyVersion.value = r }
    catch(e) { if (current(s)) failure(e) } finally { if (current(s)) loading.value = false }
  }
  async function setStatus(value: StoryStatus | '') { if (locked.value || !['','DRAFT','SUBMITTED','INTAKE'].includes(value)) return; status.value = value; await load() }
  return {categories,categoryId,selectedCategory,rows,nextCursor,status,listLoaded,detail,supplement,draftAnswers,draftResponses,fieldErrors,error,notice,loading,busy,conflicted,reconfirmed,recoveryRequired,preservedDraft,editingSupplement,pending,history,historyCursor,historyVersion,template,dirty,locked,activeIdentity,isSupplement,canEdit,canSave,canSubmit,clear,resetEditor,selectCategory,loadCategories,load,read,save,submit,checkPending,retryPending,retryLatest,loadHistory,readHistory,setStatus,validate}
})
