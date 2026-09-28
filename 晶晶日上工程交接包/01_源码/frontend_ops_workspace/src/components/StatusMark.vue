<script setup lang="ts">
/**
 * 状态标记：一个语气点 + 中文说法 + 原值。
 *
 * 为什么原值一定要留在界面上：这一层是翻译不是改写。后端返回 ACTIVE，
 * 界面写"正常"没问题；但如果哪天返回一个词表里没有的值，界面绝不能
 * 自己编一个中文糊过去——那时把它原样显示出来、标成"未识别"，
 * 才是正确的行为（项目硬约束：不假装成功）。
 */
import { computed } from 'vue'
import { resolveLabel, type LabelKind } from '@/config/labels'

const props = defineProps<{
  kind: LabelKind
  code: string
}>()

const hit = computed(() => resolveLabel(props.kind, props.code))

/**
 * 原值什么时候才需要显示？
 * 中文和原值一样的时候（= 词表没命中）就不重复显示第二遍。
 */
const showCode = computed(() => hit.value.known && hit.value.text !== hit.value.code)
</script>

<template>
  <span class="mark" :data-tone="hit.tone" :data-known="hit.known" :title="hit.code">
    <i class="dot" aria-hidden="true" />
    <span class="text">{{ hit.text }}</span>
    <span v-if="showCode" class="code ops-mono">{{ hit.code }}</span>
    <span v-if="!hit.known" class="unknown">未识别的取值</span>
  </span>
</template>

<style scoped>
.mark {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  line-height: 1.5;
  white-space: nowrap;
}

.dot {
  flex: none;
  width: 5px;
  height: 5px;
  background: var(--tone-color, var(--ops-text-3));
}

.text {
  color: var(--tone-color, var(--ops-text));
}

.code {
  font-size: 11px;
  color: var(--ops-text-3);
  letter-spacing: 0.02em;
}

.unknown {
  font-size: 11px;
  color: var(--ops-text-3);
}

.mark[data-tone='ok'] {
  --tone-color: var(--ops-success);
}

.mark[data-tone='warn'] {
  --tone-color: var(--ops-warning);
}

.mark[data-tone='bad'] {
  --tone-color: var(--ops-danger);
}

.mark[data-tone='off'] {
  --tone-color: var(--ops-text-2);
}
</style>
