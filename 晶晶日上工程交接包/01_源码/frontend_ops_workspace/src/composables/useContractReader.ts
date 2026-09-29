import { computed, onScopeDispose, ref, watch } from 'vue'
import { ApiError, asApiError } from '@/api/client'
import { isContractId, readSnapshot, readSnapshotRule, readServiceReadiness, type ReaderIdentity, type RuleContent, type ServiceAction, type ServiceReadiness, type SnapshotContent } from '@/api/modules/contracts'

/** All private content lives in this view's scope. Every context/target change cancels its old work. */
export function useContractReader(context: () => { token: string | null; partyId: string; accountId: string; revision: number }) {
  const snapshotId = ref(''), ruleId = ref(''), action = ref<ServiceAction>('START_PAYMENT')
  const snapshot = ref<SnapshotContent | null>(null), rule = ref<RuleContent | null>(null), readiness = ref<ServiceReadiness | null>(null)
  const retryAt = ref(0)
  const error = ref<ApiError | null>(null), busy = ref<'snapshot' | 'rule' | 'readiness' | null>(null)
  let epoch = 0, controller: AbortController | null = null, disposed = false
  const canRead = computed(() => !!context().token && !!context().accountId && !!context().partyId && isContractId(snapshotId.value))
  function invalidate() { epoch++; controller?.abort(); controller = null; busy.value = null; error.value = null }
  function clearContent() { snapshot.value = null; rule.value = null; readiness.value = null }
  function clear() { invalidate(); clearContent() }
  watch(() => [context().token, context().partyId, context().accountId, context().revision], () => { clear(); retryAt.value = 0 }, { flush: 'sync' })
  watch(snapshotId, () => { clear(); ruleId.value = '' }, { flush: 'sync' })
  watch(ruleId, () => { invalidate(); rule.value = null }, { flush: 'sync' })
  watch(action, () => { invalidate(); readiness.value = null }, { flush: 'sync' })
  onScopeDispose(() => { disposed = true; clear() })

  async function load(kind: 'snapshot' | 'rule' | 'readiness') {
    if (retryAt.value > Date.now()) return
    retryAt.value = 0
    invalidate()
    if (kind === 'snapshot') clearContent()
    else if (kind === 'rule') rule.value = null
    else readiness.value = null
    const ctx = context(), id = snapshotId.value
    if (!ctx.token || !ctx.accountId || !ctx.partyId) {
      clearContent(); error.value = new ApiError({ status: 400, code: 'CLIENT_IDENTITY_REQUIRED', message: '请先选择读取合同所用的身份。' }); return
    }
    if (!isContractId(id)) {
      clearContent(); error.value = new ApiError({ status: 400, code: 'CLIENT_CONTRACT_ID_INVALID', message: '请填写完整的合同编号。' }); return
    }
    const original = snapshot.value
    if (kind !== 'snapshot' && (!original || original.id !== id)) {
      clearContent(); error.value = new ApiError({ status: 400, code: 'CLIENT_CONTRACT_REQUIRED', message: '请先读取这份合同，再查看规则或核对服务条件。' }); return
    }
    const selectedRule = original?.rule_contents.find(item => item.id === ruleId.value)
    if (kind === 'rule' && !selectedRule) {
      error.value = new ApiError({ status: 400, code: 'CLIENT_RULE_REQUIRED', message: '请选择这份合同采用的规则。' }); return
    }
    const identity: ReaderIdentity = { token: ctx.token, partyId: ctx.partyId, accountId: ctx.accountId }
    const ticket = epoch, abort = new AbortController()
    controller = abort; busy.value = kind
    const current = () => !disposed && epoch === ticket
    try {
      if (kind === 'snapshot') {
        const result = await readSnapshot(identity, id, abort.signal)
        if (!current()) return
        snapshot.value = result.data
        // Choosing a rule is a new target. Populate the initial selection before marking the request done.
        ruleId.value = result.data.rule_contents[0]?.id || ''
      } else if (kind === 'rule') {
        const result = await readSnapshotRule(identity, id, selectedRule!.id, abort.signal)
        if (!current()) return
        if (result.data.content_sha256 !== selectedRule!.content_sha256 || result.data.rule_key !== selectedRule!.rule_key || result.data.version !== selectedRule!.version) {
          throw new ApiError({ status: 200, code: 'UNEXPECTED_RESPONSE_SHAPE', message: '规则内容与这份合同不一致，请重新读取合同。', requestId: result.requestId })
        }
        rule.value = result.data
      } else {
        const result = await readServiceReadiness(identity, id, action.value, abort.signal)
        if (current()) readiness.value = result.data
      }
    } catch (cause) {
      if (current()) { clearContent(); error.value = asApiError(cause); retryAt.value = error.value.retryAfterAt || 0 }
    } finally {
      if (current()) { busy.value = null; controller = null }
    }
  }
  return { snapshotId, ruleId, action, snapshot, rule, readiness, error, busy, retryAt, canRead, clear,
    loadSnapshot: () => load('snapshot'), loadRule: () => load('rule'), checkReadiness: () => load('readiness') }
}
