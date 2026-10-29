import type { StoryAttachmentRecovery } from '@/stores/storyAttachmentRecovery'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { ApiError, asApiError, newIdempotencyKey, outcomeUnknown } from '@/api/client'
import { attachmentErrorMessage, downloadStoryAttachment, listStoryAttachments, revokeStoryAttachment, selectStoryFile, storyFileHash, uploadStoryAttachment, type AttachmentCommand, type AttachmentIdentity, type StoryAttachment, type StoryFile } from '@/api/modules/customizationAttachments'

interface AttachmentContext {token:string|null;accountId:string;partyId?:string;requestId:string;revision:number;identityTag:string}
export function useStoryAttachments(context:()=>AttachmentContext, hooks:{canUpload:()=>boolean;onUploaded:(field:string,asset:StoryAttachment)=>void;onRevoked:(asset:StoryAttachment)=>void;onForbidden:()=>void;recovery?:{read:(id:string)=>StoryAttachmentRecovery|undefined;write:(id:string,value:StoryAttachmentRecovery|null)=>void}}) {
  const rows = ref<StoryAttachment[]>([]), nextCursor = ref<string|null>(null), loaded = ref(false)
  const selected = shallowRef<Record<string,StoryFile>>({}), progress = ref<{loaded:number;total:number}|null>(null)
  const busy = ref(false), reading = ref(false), error = ref<ApiError|null>(null), notice = ref(''), downloading = ref('')
  const pending = shallowRef<{command:AttachmentCommand;checked:boolean}|null>(null)
  const locked = computed(() => busy.value || reading.value || !!pending.value)
  const hasSelection = computed(() => Object.keys(selected.value).length > 0)
  let generation = 0, ticket = 0, downloadTicket = 0, downloadController:AbortController|null = null
  const requests = new Set<AbortController>(), urls = new Set<string>(), cursors = new Set<string>()
  const snapshot = () => JSON.stringify(context())
  function cancelDownload() {
    downloadTicket++; downloadController?.abort(); downloadController = null; downloading.value = ''
    for (const url of urls) URL.revokeObjectURL(url); urls.clear()
  }
  function clear() {
    generation++; ticket++; for (const c of requests) c.abort(); requests.clear()
    cancelDownload(); cursors.clear()
    rows.value = []; nextCursor.value = null; loaded.value = false; selected.value = {}; progress.value = null; pending.value = null
    busy.value = reading.value = false; downloading.value = ''; error.value = null; notice.value = ''
  }
  function restore() {
    const saved = hooks.recovery?.read(context().requestId)
    if (!saved) return
    pending.value = {command:saved.command,checked:false}
    if (saved.command.kind === 'upload') selected.value = {[saved.command.fieldKey]:saved.command.source}
    error.value = new ApiError({status:409,code:saved.code,message:'原附件请求尚未确认。'})
    notice.value = attachmentErrorMessage(error.value)
  }
  watch(snapshot,()=>{clear();restore()},{flush:'sync'}); onScopeDispose(clear); restore()
  const capture = () => ({...context(),generation,snapshot:snapshot()})
  const current = (s:ReturnType<typeof capture>) => s.generation === generation && s.snapshot === snapshot()
  const identity = (s:ReturnType<typeof capture>):AttachmentIdentity => ({token:s.token!,accountId:s.accountId,...(s.partyId ? {partyId:s.partyId} : {})})
  function failure(e:unknown) {
    const value = asApiError(e), message = attachmentErrorMessage(value)
    if ([401,403,404].includes(value.status)) { hooks.recovery?.write(context().requestId,null); clear(); hooks.onForbidden() }
    error.value = value; notice.value = message; return value
  }
  function choose(field:string,file:File|null) {
    if (locked.value || !hooks.canUpload()) return
    error.value = null; notice.value = ''
    if (!file) { const next = {...selected.value}; delete next[field]; selected.value = next; return }
    const next = {...selected.value}; delete next[field]; selected.value = next
    try { selected.value = {...selected.value,[field]:selectStoryFile(file)} }
    catch(e) { failure(e) }
  }
  async function load(more=false,checking=false) {
    if (busy.value || pending.value && !checking || more && !nextCursor.value) return false
    const s = capture(); if (!s.token || !s.accountId || !s.requestId) return false
    const id = ++ticket, cursor = more ? nextCursor.value : null, controller = new AbortController(); requests.add(controller)
    reading.value = true; error.value = null
    if (!more) { rows.value = []; nextCursor.value = null; loaded.value = false; cursors.clear() }
    try {
      const r = await listStoryAttachments(identity(s),s.requestId,cursor,controller.signal)
      if (!current(s) || id !== ticket) return false
      if (r.next_cursor && (r.next_cursor === cursor || cursors.has(r.next_cursor))) throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'附件分页未前进，请重新读取清单。'})
      if (r.next_cursor) cursors.add(r.next_cursor)
      rows.value = more ? [...new Map([...rows.value,...r.items].map(a=>[a.id,a])).values()] : r.items
      nextCursor.value = r.next_cursor; loaded.value = true; return true
    } catch(e) { if (current(s) && id === ticket) failure(e); return false }
    finally { requests.delete(controller); if (current(s) && id === ticket) reading.value = false }
  }
  async function dispatch(command:AttachmentCommand) {
    const s = capture(); if (!s.token || !s.accountId || !s.partyId || !s.requestId || busy.value) return
    const controller = new AbortController(); requests.add(controller); busy.value = true; error.value = null; notice.value = ''; progress.value = null
    try {
      const result = command.kind === 'upload'
        ? await uploadStoryAttachment(identity(s),s.requestId,command,(sent,total)=>{if(current(s))progress.value={loaded:sent,total}},controller.signal)
        : await revokeStoryAttachment(identity(s),s.requestId,command,controller.signal)
      if (!current(s)) return
      rows.value = [...new Map([...rows.value,result].map(a=>[a.id,a])).values()]; pending.value = null; hooks.recovery?.write(s.requestId,null)
      if (command.kind === 'upload') {
        const next = {...selected.value}; delete next[command.fieldKey]; selected.value = next
        hooks.onUploaded(command.fieldKey,result)
        notice.value = '附件上传已确认，已关联到本次输入。请保存草稿；正式提交后平台才能读取此文件。'
      } else { hooks.onRevoked(result); notice.value = '已撤回此附件的访问。关联输入已解除，请保存草稿；这不表示文件与备份已彻底删除。' }
    } catch(e) {
      if (!current(s)) return
      const value = asApiError(e)
      if (outcomeUnknown(value)) {
        hooks.recovery?.write(s.requestId,{command,code:value.code})
        if (pending.value) pending.value = {...pending.value,checked:false}
        failure(value)
        if (value.code !== 'ASSET_UPLOAD_RECONCILIATION_REQUIRED') notice.value = '附件操作结果尚未确认，原文件、内容与请求编号已保留。请先核对，再恢复原请求。'
      } else {
        pending.value = null; hooks.recovery?.write(s.requestId,null); failure(value)
        if ([409,412].includes(value.status)) {
          busy.value = false; await load()
          if (current(s)) { error.value = value; notice.value = attachmentErrorMessage(value) }
        }
      }
    } finally { requests.delete(controller); if (current(s)) { busy.value = false; progress.value = null } }
  }
  async function upload(field:string) {
    if (locked.value || !hooks.canUpload()) return
    const source = selected.value[field], s = capture(); if (!source || !s.requestId || !s.partyId) return
    busy.value = true; error.value = null
    try {
      const hash = await storyFileHash(source.file)
      if (!current(s)) return
      const command:AttachmentCommand = {kind:'upload',key:newIdempotencyKey(),fieldKey:field,source,sha256:hash}
      pending.value = {command,checked:false}; hooks.recovery?.write(s.requestId,{command,code:'COMMIT_OUTCOME_UNKNOWN'}); busy.value = false; await dispatch(command)
    } catch(e) { if (current(s)) failure(e) } finally { if (current(s)) busy.value = false }
  }
  async function revoke(asset:StoryAttachment) {
    if (locked.value || !context().partyId || asset.current_status === 'REVOKED' || !rows.value.some(a=>a.id===asset.id && a.request_id===context().requestId && a.object_version===asset.object_version)) return
    cancelDownload()
    const command:AttachmentCommand = {kind:'revoke',key:newIdempotencyKey(),asset:{...asset}}
    pending.value = {command,checked:false}; hooks.recovery?.write(context().requestId,{command,code:'COMMIT_OUTCOME_UNKNOWN'}); await dispatch(command)
  }
  async function checkPending() {
    const p = pending.value; if (!p || busy.value || reading.value) return
    if (await load(false,true) && pending.value === p) { pending.value = {...p,checked:true}; notice.value = '已读取当前附件记录。可恢复原请求；即使清单有相同文件，也不会另建上传请求或凭列表推断成功。' }
  }
  async function retryPending() { if (pending.value?.checked && !busy.value && !reading.value) await dispatch(pending.value.command) }
  async function download(asset:StoryAttachment) {
    if (locked.value || downloading.value || asset.current_status !== 'READY' || !rows.value.some(a=>a.id===asset.id && a.request_id===context().requestId && a.current_status==='READY' && a.object_version===asset.object_version)) return
    const s = capture(), controller = new AbortController(), ticket = ++downloadTicket; downloadController=controller; requests.add(controller); downloading.value = asset.id; error.value = null
    try {
      const blob = await downloadStoryAttachment(identity(s),s.requestId,asset,controller.signal)
      if (!current(s) || ticket !== downloadTicket) return
      const url = URL.createObjectURL(blob); urls.add(url)
      const link = document.createElement('a'); link.href = url; link.download = asset.display_name.replace(/[\\/]/g,'_'); link.click()
      setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url)},0)
      notice.value = '已按当前权限核对附件并发起下载。文件不会作为公开链接或内嵌页面显示。'
    } catch(e) { if (current(s) && ticket === downloadTicket) failure(e) }
    finally { requests.delete(controller); if (current(s) && ticket === downloadTicket) { downloading.value = ''; downloadController=null } }
  }
  return {rows,nextCursor,loaded,selected,progress,busy,reading,error,notice,downloading,pending,locked,hasSelection,choose,load,upload,revoke,checkPending,retryPending,download,clear}
}
