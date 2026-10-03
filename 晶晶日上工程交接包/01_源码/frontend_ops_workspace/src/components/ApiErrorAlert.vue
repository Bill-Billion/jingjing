<script setup lang="ts">
/**
 * 请求出错的提示。
 *
 * 排版分两层：
 *   第一层给人看 —— 一句话说清出了什么事、下一步怎么办。
 *   第二层给联调用 —— 错误码和请求号，灰色等宽小字放在下面。
 *
 * 第二层不能删。项目硬约束要求错误如实展示，不许笼统说一句"操作失败"；
 * 但也用不着把机器值摆在用户脸前，所以做成视觉上明显次要的一行。
 */
import { computed } from 'vue'
import type { ApiError } from '@/api/client'
import { explainError, type ErrorLike } from '@/api/errors'

const props = defineProps<{
  error: ApiError | ErrorLike | null
  /** 同一页可能有多处错误位，用不同的 testid 区分，便于自动化验收定位 */
  testid?: string
}>()

const plain = computed(() => (props.error ? explainError(props.error as ErrorLike) : null))
const code = computed(() => props.error?.code || (props.error ? `HTTP ${props.error.status}` : ''))
</script>

<template>
  <div v-if="props.error" class="err" role="alert" :data-testid="props.testid || 'api-error'">
    <p class="msg">{{ plain || '请求失败，请稍后重试。' }}</p>
    <p class="trace">
      <span class="code">{{ code }}</span>
      <span v-if="props.error.requestId" class="rid" :title="props.error.requestId">
        {{ props.error.requestId }}
      </span>
    </p>
  </div>
</template>

<style scoped>
.err {
  border-left: 2px solid var(--ops-danger);
  padding: 2px 0 2px 12px;
  margin-top: 4px;
}

.msg {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--ops-danger);
}

.trace {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 14px;
  margin: 5px 0 0;
  font-family: var(--ops-mono);
  font-size: 12px;
  line-height: 1.5;
}

.code {
  color: var(--ops-danger);
  overflow-wrap: anywhere;
}

.rid {
  color: var(--ops-text-3);
  word-break: break-all;
}
</style>
