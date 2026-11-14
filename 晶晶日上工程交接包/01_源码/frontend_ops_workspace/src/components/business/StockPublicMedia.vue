<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useStockPublicMedia } from '@/composables/useStockPublicMedia'
import { stockDuration } from '@/api/modules/stockMedia'
import type { BusinessData } from '@/api/modules/business'
const props=defineProps<{record:BusinessData;name:string;scope:string;compact?:boolean}>()
const session=useSessionStore(),element=ref<HTMLElement|null>(null)
const ui=useStockPublicMedia(()=>({token:session.token,accountId:session.account?.id||'',partyId:session.selectedId,revision:session.revision,scope:props.scope,record:props.record}))
let observer:IntersectionObserver|null=null,inViewport=false
function visibility(){ui.setVisible(inViewport&&document.visibilityState!=='hidden')}
function loaded(event:Event){const image=event.target as HTMLImageElement;ui.imageLoaded(image.currentSrc,image.naturalWidth,image.naturalHeight)}
function failed(event:Event){ui.imageFailed((event.target as HTMLImageElement).currentSrc)}
onMounted(()=>{
  document.addEventListener('visibilitychange',visibility)
  if(typeof IntersectionObserver==='undefined'){inViewport=true;visibility();return}
  observer=new IntersectionObserver(entries=>{inViewport=entries.some(entry=>entry.isIntersecting);visibility()})
  if(element.value)observer.observe(element.value)
})
onUnmounted(()=>{observer?.disconnect();document.removeEventListener('visibilitychange',visibility)})
</script>
<template>
 <section ref="element" class="stock-public-media" :class="{'stock-public-media-compact':compact}" data-testid="stock-public-media" :aria-label="name+'封面与时长'" :aria-busy="ui.busy.value">
  <div class="stock-cover-frame">
   <img v-if="ui.url.value" :src="ui.url.value" :alt="name+'已审核预览封面'" @load="loaded" @error="failed">
   <p v-else role="status">{{ui.busy.value?'正在读取封面与时长…':ui.error.value?'封面或时长暂不可读取':'进入可见区域后读取封面与时长'}}</p>
  </div>
  <dl v-if="ui.media.value" class="stock-media-durations"><div><dt>完整影片</dt><dd>{{stockDuration(ui.media.value.duration_ms)}}</dd></div><div><dt>预览</dt><dd>{{stockDuration(ui.media.value.preview_duration_ms)}}</dd></div></dl>
  <p v-if="ui.error.value" class="stock-media-error" role="status">{{ui.error.value.code==='UNEXPECTED_RESPONSE_SHAPE'?'影片版本或文件校验未通过，请刷新当前影片后重试。':'本次未能读取封面或时长，可重试；影片预览单独读取。'}}</p>
  <button v-if="ui.error.value" type="button" class="outline" :disabled="ui.busy.value" @click="ui.load">重新读取封面与时长</button>
 </section>
</template>
<style scoped>
.stock-public-media{width:min(100%,480px);margin:16px 0;min-width:0}.stock-cover-frame{aspect-ratio:16/9;display:grid;place-items:center;overflow:hidden;background:var(--ops-accent-soft);border:1px solid var(--ops-border)}.stock-cover-frame img{display:block;width:100%;height:100%;object-fit:contain}.stock-cover-frame p{margin:0;padding:20px;line-height:1.7;font-size:13px;color:var(--ops-text-2);text-align:center}.stock-media-durations{display:flex;flex-wrap:wrap;gap:12px 24px;margin:12px 0 0}.stock-media-durations div{display:flex;gap:8px;align-items:baseline}.stock-media-durations dt{font-size:12px;color:var(--ops-text-2)}.stock-media-durations dd{margin:0;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums}.stock-public-media-compact{width:min(100%,300px)}.stock-media-error{font-size:13px;line-height:1.7;color:var(--ops-text-2)}.stock-public-media button{max-width:100%;white-space:normal;margin-top:8px}
</style>
