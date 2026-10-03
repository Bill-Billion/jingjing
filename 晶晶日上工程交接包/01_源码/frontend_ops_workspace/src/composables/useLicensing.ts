import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { ApiError, asApiError, newIdempotencyKey, outcomeUnknown } from '@/api/client'
import { getLicense, listLicense, postLicense, readLicenseContent, readEvidenceBytes, type LicenseKind, type LicenseRecord, type LicenseWrite } from '@/api/modules/licensing'
import type { SupplyContext } from './useSupply'
import type { SupplyIdentity } from '@/api/modules/supply'

interface Pending { command: LicenseWrite; key: string; state: 'sending' | 'retry' | 'blocked' | 'refresh'; resultId?: string; done: (record: LicenseRecord) => void }
/** Every request is scoped to the actor, party, navigation and session revision. Private state never leaves this page. */
export function useLicensing(context: () => SupplyContext) {
  const rows = ref<LicenseRecord[]>([]), detail = ref<LicenseRecord | null>(null), related = ref<LicenseRecord[]>([]), nextCursor = ref<string | null>(null)
  const error = ref<ApiError | null>(null), notice = ref(''), content = ref(''), readerDeadline = ref(0), readerId = ref('')
  const pending = shallowRef<Pending | null>(null), writing = ref(false), reading = ref<Record<string,boolean>>({}), securityRevision = ref(0), conflictRevision = ref(0), retryAt = ref(0)
  let epoch = 0, disposed = false
  const tickets = new Map<string,number>(), aborts = new Map<string,AbortController>(), urls = new Set<string>()
  const busy = computed(() => writing.value || Object.values(reading.value).some(Boolean))
  function clearContent() { content.value = ''; readerId.value = ''; readerDeadline.value = 0; aborts.get('content')?.abort(); tickets.set('content',(tickets.get('content') || 0) + 1) }
  function clear() { epoch++; for (const a of aborts.values()) a.abort(); aborts.clear(); rows.value = []; detail.value = null; related.value = []; nextCursor.value = null; pending.value = null; writing.value = false; reading.value = {}; error.value = null; notice.value = ''; retryAt.value = 0; clearContent(); for (const u of urls) URL.revokeObjectURL(u); urls.clear(); securityRevision.value++ }
  watch(() => [context().token,context().accountId,context().partyId,context().revision,context().scope],clear,{flush:'sync'})
  onScopeDispose(() => { disposed = true; clear() })
  function identity(): SupplyIdentity { const c = context(); if (!c.token || !c.accountId || c.partyId === '') throw new ApiError({status:400,code:'CLIENT_IDENTITY_REQUIRED',message:'请先读取账号并选择工作身份。'}); return {token:c.token,accountId:c.accountId,partyId:c.partyId} }
  function failure(cause: unknown) { const e = asApiError(cause); if ([401,403,404].includes(e.status)) clear(); error.value = e; retryAt.value = e.retryAfterAt || 0 }
  function applyRecord(r: LicenseRecord) { detail.value = r; rows.value = rows.value.map(x => x.id === r.id ? r : x); related.value = related.value.map(x => x.id === r.id ? r : x); if (readerId.value === r.id && (r.kind !== 'READING' || r.current_status !== 'APPROVED' || Date.parse(r.data.valid_until) <= Date.now())) clearContent() }
  async function read<T>(name: string, task: (i: SupplyIdentity, signal: AbortSignal) => Promise<T>, apply?: (v: T) => void): Promise<T | null> {
    if (retryAt.value > Date.now()) return null
    const ticket = (tickets.get(name) || 0) + 1; tickets.set(name,ticket); aborts.get(name)?.abort()
    const a = new AbortController(), generation = epoch; aborts.set(name,a)
    const current = () => !disposed && epoch === generation && tickets.get(name) === ticket
    reading.value = {...reading.value,[name]:true}; error.value = null
    try { const v = await task(identity(),a.signal); if (!current()) return null; apply?.(v); return v }
    catch (cause) { if (current()) failure(cause); return null }
    finally { if (current()) { reading.value = {...reading.value,[name]:false}; aborts.delete(name) } }
  }
  async function loadList(kind: LicenseKind, catalog = false, more = false) {
    const cursor = more ? nextCursor.value : null; if (more && !cursor) return
    if (!more) {rows.value = []; nextCursor.value = null}
    return read('list',(i,s) => listLicense(i,kind,catalog,cursor,s),page => { if (page.next_cursor && page.next_cursor === cursor) throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'列表没有前进，请从第一页重新读取。'}); rows.value = more ? [...new Map([...rows.value,...page.items].map(x=>[x.id,x])).values()] : page.items; nextCursor.value = page.next_cursor })
  }
  async function loadAll(kind: LicenseKind, catalog = false) { return read('all-'+kind,async(i,s) => {const rows: LicenseRecord[] = [], seen = new Set<string>(); let cursor: string | null = null; do {const page = await listLicense(i,kind,catalog,cursor,s); rows.push(...page.items); cursor = page.next_cursor; if (cursor && seen.has(cursor)) throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'分页位置没有更新，请重新核对。'}); if (cursor) seen.add(cursor)} while (cursor); return [...new Map(rows.map(x=>[x.id,x])).values()]}) }
  function loadRecord(id: string, kind?: LicenseKind) { detail.value = null; clearContent(); return read('detail',(i,s)=>getLicense(i,id,kind,s),applyRecord) }
  async function runPending() {
    const p = pending.value; if (!p || writing.value || p.state === 'blocked' || retryAt.value > Date.now()) return
    const generation = epoch, a = new AbortController(); aborts.set('write',a)
    const current = () => !disposed && generation === epoch && pending.value === p
    writing.value = true; error.value = null; notice.value = ''
    try {
      const i = identity()
      if (!p.resultId) { p.state = 'sending'; const r = await postLicense(i,p.command,p.key,a.signal); if (!current()) return; p.resultId = r.id }
      p.state = 'refresh'; const fresh = await getLicense(i,p.resultId,undefined,a.signal); if (!current()) return
      // Activation and binding change or relate to their parent. Refresh that version too.
      if (p.command.targetId && p.command.targetId !== fresh.id) { const parent = await getLicense(i,p.command.targetId,undefined,a.signal); if (!current()) return; rows.value = rows.value.map(x=>x.id===parent.id?parent:x); related.value = related.value.map(x=>x.id===parent.id?parent:x) }
      pending.value = null; applyRecord(fresh)
      notice.value = fresh.kind === 'RESERVATION' && fresh.current_status === 'REVIEW_REQUIRED' ? '本次预留已进入人工补救，尚未取得许可。' : `${p.command.label}已处理，已读取当前状态。`
      p.done(fresh)
    } catch (cause) {
      if (!current()) return
      const e = asApiError(cause)
      if ([401,403,404].includes(e.status)) {failure(e);return}
      if (e.status === 412) { pending.value = null; conflictRevision.value++; clearContent(); notice.value = '记录已有变化。请核对最新内容后重新作出决定。'; if (p.command.targetId) { const fresh = await getLicense(identity(),p.command.targetId,undefined,a.signal).catch(cause=>{if(generation===epoch && !disposed)failure(cause);return null}); if (generation===epoch && !disposed) {if(fresh)applyRecord(fresh);else detail.value=null} } }
      else if (e.code === 'IDEMPOTENCY_IN_PROGRESS') p.state = 'retry'
      else if (p.resultId) p.state = 'refresh'
      else if (e.status === 409) p.state = 'blocked'
      else if (outcomeUnknown(e)) p.state = 'retry'
      else pending.value = null
      if (generation===epoch && !disposed) {error.value=e;retryAt.value=e.retryAfterAt||0}
    } finally {if(generation===epoch && !disposed){writing.value=false;aborts.delete('write')}}
  }
  async function write(command: LicenseWrite, done: Pending['done']) { if(pending.value||writing.value||retryAt.value>Date.now())return; const snapshot = {...command,body:JSON.parse(JSON.stringify(command.body))}; pending.value={command:snapshot,key:newIdempotencyKey(),state:'sending',done};await runPending() }
  function acknowledgeConflict(){if(pending.value?.state==='blocked'){pending.value=null;error.value=null;conflictRevision.value++;notice.value='已结束本次操作。请刷新记录后重新填写。'}}
  async function readContent(id: string) {
    clearContent()
    return read('content',async(i,s)=>{
      const before = await getLicense(i,id,'READING',s)
      if(before.kind!=='READING'||before.current_status!=='APPROVED'||before.data.reader_account_id!==i.accountId||before.counterparty_id!==i.partyId||Date.parse(before.data.valid_until)<=Date.now())throw new ApiError({status:403,code:'READING_FORBIDDEN',message:'此阅稿授权当前不可读取。'})
      const text = await readLicenseContent(i,id,s), after = await getLicense(i,id,'READING',s)
      if(after.kind!=='READING'||after.object_version!==before.object_version||after.current_status!=='APPROVED'||Date.parse(after.data.valid_until)<=Date.now())throw new ApiError({status:403,code:'READING_FORBIDDEN',message:'阅稿授权已改变，请重新核对。'})
      return {text,record:after}
    },({text,record})=>{if(record.kind!=='READING')return;content.value=text.watermarked_text;readerDeadline.value=Date.parse(record.data.valid_until);readerId.value=id;applyRecord(record)})
  }
  async function verifyReader() {const id=readerId.value;if(!id)return;if(readerDeadline.value<=Date.now()){clearContent();return}await read('reader-validation',(i,s)=>getLicense(i,id,'READING',s),r=>{if(readerId.value!==id)return;if(r.kind!=='READING'||r.current_status!=='APPROVED'||Date.parse(r.data.valid_until)<=Date.now()){clearContent();return}readerDeadline.value=Date.parse(r.data.valid_until)});if(error.value)clearContent()}
  async function downloadEvidence(recordId: string, assetId: string) { await read('evidence-'+assetId,(i,s)=>readEvidenceBytes(i,recordId,assetId,s),bytes=>{const u=URL.createObjectURL(bytes);urls.add(u);const a=document.createElement('a');a.href=u;a.download=`${assetId}.bin`;a.click();window.setTimeout(()=>{URL.revokeObjectURL(u);urls.delete(u)},0)}) }
  function canNavigate() { return pending.value === null }
  return { rows,detail,related,nextCursor,error,notice,content,readerDeadline,readerId,pending,writing,reading,busy,securityRevision,conflictRevision,retryAt,clear,clearContent,read,loadList,loadAll,loadRecord,write,retry:runPending,acknowledgeConflict,readContent,verifyReader,downloadEvidence,canNavigate }
}
