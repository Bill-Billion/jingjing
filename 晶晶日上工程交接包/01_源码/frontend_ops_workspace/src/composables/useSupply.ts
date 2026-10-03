import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { ApiError, asApiError, newIdempotencyKey, outcomeUnknown } from '@/api/client'
import { downloadSupplyAsset, getSupply, getSupplyAsset, listSupply, postSupply, type SupplyAsset, type SupplyIdentity, type SupplyKind, type SupplyRecord, type SupplyWrite } from '@/api/modules/supply'

export interface SupplyContext { token: string | null; accountId: string; partyId: string | null; revision: number; scope: string }
interface Pending { command: SupplyWrite; key: string; state: 'sending' | 'retry' | 'blocked' | 'refresh'; resultId?: string; done: (result: SupplyRecord | SupplyAsset) => void }
/** Per-page private state, including uncertain commands and upload bytes. Never persisted. */
export function useSupply(context: () => SupplyContext) {
  const rows = ref<SupplyRecord[]>([]), history = ref<SupplyRecord[]>([]), detail = ref<SupplyRecord | null>(null), nextCursor = ref<string | null>(null)
  const assets = ref<Record<string, SupplyAsset>>({}), error = ref<ApiError | null>(null), notice = ref('')
  const pending = shallowRef<Pending | null>(null), writing = ref(false), reading = ref<Record<string, boolean>>({}), securityRevision = ref(0), conflictRevision = ref(0), retryAt = ref(0)
  let epoch = 0, disposed = false
  const tickets = new Map<string, number>(), aborts = new Map<string, AbortController>(), urls = new Set<string>()
  const busy = computed(() => writing.value || Object.values(reading.value).some(Boolean))
  function cancel() { epoch++; for (const abort of aborts.values()) abort.abort(); aborts.clear(); reading.value = {}; writing.value = false }
  function clear() { cancel(); rows.value = []; history.value = []; detail.value = null; nextCursor.value = null; assets.value = {}; pending.value = null; error.value = null; notice.value = ''; retryAt.value = 0; for (const url of urls) URL.revokeObjectURL(url); urls.clear(); securityRevision.value++ }
  watch(() => [context().token, context().accountId, context().partyId, context().revision, context().scope], clear, { flush: 'sync' })
  onScopeDispose(() => { disposed = true; clear() })
  function identity(): SupplyIdentity {
    const value = context()
    if (!value.token || !value.accountId || value.partyId === '') throw new ApiError({ status: 400, code: 'CLIENT_IDENTITY_REQUIRED', message: '请先读取账号并选择工作身份。' })
    return { token: value.token, accountId: value.accountId, partyId: value.partyId }
  }
  function failure(cause: unknown) {
    const e = asApiError(cause)
    if ([401,403,404].includes(e.status)) clear()
    error.value = e; retryAt.value = e.retryAfterAt || 0
  }
  function applyRecord(record: SupplyRecord) {
    detail.value = record
    // A confirmed GET updates every visible copy of this revision, including its review reasons.
    rows.value = rows.value.map(row => row.id === record.id ? record : row)
    history.value = history.value.map(row => row.id === record.id ? record : row)
  }
  async function read<T>(name: string, task: (i: SupplyIdentity, signal: AbortSignal) => Promise<T>, apply?: (value: T) => void): Promise<T | null> {
    if (retryAt.value > Date.now()) return null
    const ticket = (tickets.get(name) || 0) + 1; tickets.set(name, ticket)
    aborts.get(name)?.abort(); const abort = new AbortController(); aborts.set(name, abort)
    const generation = epoch; const current = () => !disposed && epoch === generation && tickets.get(name) === ticket
    reading.value = { ...reading.value, [name]: true }; error.value = null
    try { const result = await task(identity(), abort.signal); if (!current()) return null; apply?.(result); return result }
    catch (e) { if (current()) failure(e); return null }
    finally { if (current()) { reading.value = { ...reading.value, [name]: false }; aborts.delete(name) } }
  }
  async function loadList(kind: SupplyKind, more = false) {
    const cursor = more ? nextCursor.value : null
    if (more && !cursor) return
    if (!more) { rows.value = []; nextCursor.value = null }
    await read('list', (i, signal) => listSupply(i, kind, cursor, signal), result => {
      if (result.next_cursor && result.next_cursor === cursor) throw new ApiError({ status: 200, code: 'UNEXPECTED_RESPONSE_SHAPE', message: '下一页位置未更新，请刷新记录。' })
      rows.value = more ? [...new Map([...rows.value, ...result.items].map(r => [r.id, r])).values()] : result.items
      nextCursor.value = result.next_cursor
    })
  }
  async function loadRecord(id: string, kind: SupplyKind) {
    detail.value = null
    return read('detail', (i, signal) => getSupply(i, id, kind, signal), applyRecord)
  }
  async function loadAll(kind: SupplyKind): Promise<SupplyRecord[] | null> {
    return read('all-' + kind, async (i, signal) => {
      const result: SupplyRecord[] = [], seen = new Set<string>(); let cursor: string | null = null
      do {
        const page = await listSupply(i, kind, cursor, signal); result.push(...page.items); cursor = page.next_cursor
        if (cursor && seen.has(cursor)) throw new ApiError({ status: 200, code: 'UNEXPECTED_RESPONSE_SHAPE', message: '记录分页未更新，请重新核对。' })
        if (cursor) seen.add(cursor)
      } while (cursor)
      return [...new Map(result.map(r => [r.id, r])).values()]
    })
  }
  async function runPending() {
    const operation = pending.value
    if (!operation || writing.value || operation.state === 'blocked' || retryAt.value > Date.now()) return
    const generation = epoch, abort = new AbortController(); aborts.set('write', abort)
    const current = () => !disposed && epoch === generation && pending.value === operation
    writing.value = true; error.value = null; notice.value = ''
    try {
      const i = identity()
      if (!operation.resultId) {
        operation.state = 'sending'
        const result = await postSupply(i, operation.command, operation.key, abort.signal)
        if (!current()) return
        operation.resultId = result.id
      }
      operation.state = 'refresh'
      // Replays return the original response; always read the current state before display.
      const fresh = operation.command.kind === 'ASSET' ? await getSupplyAsset(i, operation.resultId, abort.signal) : await getSupply(i, operation.resultId, operation.command.kind, abort.signal)
      if (!current()) return
      pending.value = null
      if ('purpose' in fresh) assets.value = { ...assets.value, [fresh.id]: fresh }
      else applyRecord(fresh)
      notice.value = `${operation.command.label}已完成，已读取当前状态。`
      operation.done(fresh)
    } catch (cause) {
      if (!current()) return
      const e = asApiError(cause)
      if ([401,403,404].includes(e.status)) { failure(e); return }
      if (e.status === 412) {
        pending.value = null; conflictRevision.value++; notice.value = '记录已有变化，请核对最新内容后重新选择并确认。'
        if (operation.command.targetId && operation.command.kind !== 'ASSET') {
          const fresh = await getSupply(identity(), operation.command.targetId, operation.command.kind, abort.signal).catch(cause => { if (epoch === generation && !disposed) failure(cause); return null })
          if (epoch === generation && !disposed) { if (fresh) applyRecord(fresh); else detail.value = null }
        }
      } else if (e.code === 'IDEMPOTENCY_IN_PROGRESS') operation.state = 'retry'
      else if (e.status === 409) operation.state = 'blocked'
      else if (operation.resultId) operation.state = 'refresh'
      else if (outcomeUnknown(e)) operation.state = 'retry'
      else pending.value = null
      if (epoch === generation && !disposed) { error.value = e; retryAt.value = e.retryAfterAt || 0 }
    } finally { if (epoch === generation && !disposed) { writing.value = false; aborts.delete('write') } }
  }
  async function write(command: SupplyWrite, done: Pending['done']) {
    if (pending.value || writing.value || retryAt.value > Date.now()) return
    // Clone the complete JSON payload before dispatch; files are immutable Blob objects.
    const snapshot: SupplyWrite = { ...command, body: command.body ? JSON.parse(JSON.stringify(command.body)) : undefined }
    pending.value = { command: snapshot, key: newIdempotencyKey(), state: 'sending', done }
    await runPending()
  }
  function acknowledgeConflict() { if (pending.value?.state === 'blocked') { pending.value = null; error.value = null; notice.value = '已结束本次核对，请先刷新记录，再重新填写。'; conflictRevision.value++ } }
  async function assetInfo(id: string) { return read('asset-' + id, (i, signal) => getSupplyAsset(i, id, signal), asset => { assets.value = { ...assets.value, [id]: asset } }) }
  async function download(id: string) {
    await read('download-' + id, async (i, signal) => {
      const asset = await getSupplyAsset(i, id, signal); return { asset, bytes: await downloadSupplyAsset(i, asset, signal) }
    }, ({ asset, bytes }) => {
      assets.value = { ...assets.value, [id]: asset }
      const url = URL.createObjectURL(bytes); urls.add(url)
      const a = document.createElement('a'); a.href = url; a.download = `${id}.bin`; a.click()
      window.setTimeout(() => { URL.revokeObjectURL(url); urls.delete(url) }, 0)
      notice.value = '已读取获准材料并发起下载。'
    })
  }
  return { rows, history, detail, nextCursor, assets, error, notice, pending, writing, reading, busy, securityRevision, conflictRevision, retryAt, clear, read, loadList, loadRecord, loadAll, write, retry: runPending, acknowledgeConflict, assetInfo, download }
}
