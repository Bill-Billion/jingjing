<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ApiError, asApiError, newIdempotencyKey } from '@/api/client'
import { sandboxSigningLabels, sandboxSigningRequest, type SnapshotContent } from '@/api/modules/contracts'
import { useSessionStore } from '@/stores/session'
import ApiErrorAlert from '@/components/ApiErrorAlert.vue'

const props = defineProps<{snapshot: SnapshotContent}>()
const session = useSessionStore()
const record = ref<Awaited<ReturnType<typeof sandboxSigningRequest>>['data'] | null>(null)
const failure = ref<ApiError | null>(null)
const confirmed = ref(false)
const busy = ref(false)
const controller = new AbortController()
let originalKey: string | undefined
const receipt = computed(() => record.value?.receipt)
const pending = computed(() => receipt.value?.current_status === 'PENDING' || receipt.value?.current_status === 'OUTCOME_UNKNOWN')
async function run(action: 'read' | 'start' | 'reconcile') {
  if (busy.value || !session.token || !session.account || !session.selectedId) return
  if (action === 'start' && (!confirmed.value || record.value?.receipt !== null)) return
  const captured = session.capture()
  const identity = {token:session.token, accountId:session.account.id, partyId:session.selectedId}
  busy.value = true
  failure.value = null
  try {
    if (action === 'start') originalKey ??= newIdempotencyKey()
    const result = await sandboxSigningRequest(identity, props.snapshot, action,
      action === 'start' ? originalKey : undefined, controller.signal)
    if (!controller.signal.aborted && session.current(captured, true)) record.value = result.data
  } catch (cause) {
    if (!controller.signal.aborted && session.current(captured, true)) {
      record.value = null
      failure.value = asApiError(cause)
    }
  } finally {
    if (!controller.signal.aborted && session.current(captured, true)) busy.value = false
  }
}
onMounted(() => run('read'))
onUnmounted(() => controller.abort())
</script>

<template>
  <section class="content-card supply-card" data-testid="sandbox-signing">
    <h2>电子签隔离演练</h2>
    <p>仅记录模拟回执，原封存合同保持未签署。</p>
    <ApiErrorAlert :error="failure" />
    <p v-if="receipt" data-testid="sandbox-signing-state" role="status">{{ sandboxSigningLabels[receipt.current_status] }}</p>
    <p v-if="receipt?.receipt_ref">{{ receipt.receipt_ref }}</p>
    <template v-if="record?.receipt === null">
      <label><input v-model="confirmed" type="checkbox" :disabled="busy">确认在隔离环境演练当前合同</label>
      <button :disabled="busy || !confirmed" data-testid="sandbox-signing-start" @click="run('start')">提交模拟签署</button>
    </template>
    <button v-if="pending" :disabled="busy" data-testid="sandbox-signing-reconcile" @click="run('reconcile')">核对原模拟签署结果</button>
    <button :disabled="busy" data-testid="sandbox-signing-read" @click="run('read')">读取模拟签署记录</button>
  </section>
</template>
