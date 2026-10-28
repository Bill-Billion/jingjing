<script setup lang="ts">
import { nextTick, ref, useId, watch } from 'vue'

const props = defineProps<{ city: string; disabled?: boolean }>()
const emit = defineEmits<{ change: [city: string] }>()
const inputId = useId(), candidate = ref(props.city)
watch(() => props.city, city => { candidate.value = city })
async function apply() {
  emit('change', candidate.value.trim())
  await nextTick()
  candidate.value = props.city
}
</script>

<template>
  <section class="supply-card directory-city" aria-label="目录默认城市">
    <div class="section-heading"><h2>目录默认城市</h2><span class="business-muted">当前：{{ city || '未设置' }}</span></div>
    <p>手动设置后，支持城市筛选的艺人、影片、通告与试镜等目录默认使用此城市。各页仍可单独筛选；留空表示不设默认城市，仍按各目录的必填条件读取。</p>
    <form class="supply-actions" @submit.prevent="apply">
      <label :for="inputId">城市名称<input :id="inputId" v-model="candidate" maxlength="100" :disabled="disabled" autocomplete="off" placeholder="例如：杭州；可留空"></label>
      <button class="outline" :disabled="disabled">应用默认城市</button>
    </form>
  </section>
</template>

<style scoped>
.directory-city p { line-height: 1.7; }
.directory-city label { display: flex; flex: 1 1 14rem; flex-direction: column; gap: .5rem; }
.directory-city input { min-width: 0; width: 100%; box-sizing: border-box; }
.directory-city form { align-items: end; }
</style>
