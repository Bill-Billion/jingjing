<script setup lang="ts">
import {computed,onMounted,onUnmounted} from 'vue'
import {useRestUsageStore} from '@/stores/restUsage'
import {usageDuration} from '@/usage/controller'
const props=defineProps<{summary?:boolean}>(),store=useRestUsageStore()
const c=computed(()=>{void store.revision;const x=store.controller;return{data:x.data,error:x.error,busy:x.busy,pending:x.pending,acknowledge:(recover=false)=>x.acknowledge(recover)}})
const visibility=()=>store.controller.setVisible(document.visibilityState==='visible')
const refresh=()=>void store.controller.refresh()
onMounted(()=>{if(!props.summary){document.addEventListener('visibilitychange',visibility);window.addEventListener('privacy-preferences-changed',refresh);visibility()}})
onUnmounted(()=>{if(!props.summary){document.removeEventListener('visibilitychange',visibility);window.removeEventListener('privacy-preferences-changed',refresh);store.controller.stop()}})
</script>
<template>
 <section v-if="summary||c.data?.rest_due||c.pending" :class="summary?'supply-card usage-summary':'usage-reminder'" aria-label="定时休息" data-testid="rest-usage">
  <template v-if="summary"><h2>使用时长估计</h2><p v-if="c.data">{{c.data.enabled?`今天约 ${usageDuration(c.data.day_seconds)}；连续约 ${usageDuration(c.data.reminder_seconds)}`:'定时休息已关闭，不报告使用状态。'}}</p><p>依据前台心跳估算，并非精确屏幕时长。短于90秒的离开或网络延迟可能计入；后台不补发。提醒不阻止必要业务办理。</p></template>
  <p v-if="c.data?.rest_due" role="status">已连续使用一段时间，建议休息。</p><p v-if="c.error" role="status">{{c.error}}</p>
  <button v-if="c.pending" class="outline" :disabled="c.busy" @click="c.acknowledge(true)">恢复同一次提醒确认</button>
  <button v-else-if="c.data?.rest_due" class="outline" :disabled="c.busy" @click="c.acknowledge()">知道了</button>
  <button v-if="summary" class="outline" :disabled="c.busy" @click="refresh">刷新本人统计</button>
 </section>
</template>
<style scoped>.usage-reminder{position:fixed;bottom:12px;right:12px;z-index:1000;background:#f1efea;color:#171717;border:1px solid #171717;padding:12px;max-width:min(400px,90vw);box-shadow:0 3px 15px #0002}.usage-reminder p{margin:4px 0 8px}.usage-summary p{line-height:1.7}</style>
