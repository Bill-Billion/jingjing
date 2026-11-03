<script setup lang="ts">
import {computed,ref,watch,onUnmounted} from 'vue'
import {useRoute} from 'vue-router'
import {useSessionStore} from '@/stores/session'
import {ApiError,directRequest,installConsumptionGate,newIdempotencyKey} from '@/api/client'
import {isTradeRecord} from '@/api/modules/trade'
import {uuid} from '@/business/model'
import {publishConsumerRecovery} from '@/consumer/recovery'
import {ConsumerController} from '@/consumer/controller'
const session=useSessionStore(),route=useRoute(),revision=ref(0),read=ref(false),key='ops.consumer.confirmation.v1'
const context=()=>{const capture=session.capture(),party=session.selected;if(!session.token||!session.account||!party||party.membership.current_status!=='ACTIVE')return null;return{scope:JSON.stringify([session.account.id,session.selectedId]),token:session.token,party:session.selectedId,personal:party.party.kind==='PERSON',current:()=>session.current(capture,true)}}
const controller=new ConsumerController({context,send:directRequest,newKey:newIdempotencyKey,validate:(r,c)=>{const d=r.data as Record<string,unknown>;if(r.meta?.actor?.account_id!==session.account?.id||r.meta?.acting_party!==c.party||!uuid(d?.id)||typeof d?.current_status!=='string'||c.path.startsWith('/trade/')&&!isTradeRecord(d))throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'原消费返回无法核对，请保留原请求恢复。'})},recovered:(c,r)=>publishConsumerRecovery({accountId:session.account!.id,partyId:c.party,key:c.key,path:c.path,recordId:(r.data as {id:string}).id}),load:()=>JSON.parse(sessionStorage.getItem(key)||'{"receipts":[]}'),save:x=>sessionStorage.setItem(key,JSON.stringify(x)),changed:()=>revision.value++,route:()=>route.fullPath})
installConsumptionGate((p,o)=>controller.intercept(p,o))
watch(()=>[session.token,session.account?.id,session.selectedId,session.revision],()=>{read.value=false;controller.contextChanged()},{flush:'sync'})
const c=computed(()=>{void revision.value;const x=controller;return{blocked:x.blocked,command:x.command,preview:x.preview,phase:x.phase,busy:x.busy,message:x.message,result:x.result}})
watch(()=>c.value.phase,()=>read.value=false)
const reasonNames:Record<string,string>={FREQUENT_CASH_REQUESTS:'短时多笔消费',LARGE_RECHARGE:'单次大额充值',LARGE_NIGHT_SPENDING:'夜间大额消费',RATIONAL_LOTTERY_PARTICIPATION:'抽奖前理性参与提示',FREQUENT_LOTTERY:'频繁抽奖'}
const amount=computed(()=>{const p=c.value.preview;if(!p?.target||!Number.isSafeInteger(p.target.amount_minor))return '';return p.target.kind==='LOTTERY'?`${p.target.amount_minor} 晶钻`:`¥ ${(Number(p.target.amount_minor)/100).toFixed(2)}`})
const refresh=()=>window.location.reload()
onUnmounted(()=>{installConsumptionGate(null);controller.contextChanged()})
</script>
<template>
 <div v-if="c.phase&&c.phase!=='resume'" class="consumer-backdrop">
  <section class="consumer-dialog" role="dialog" aria-modal="true" aria-labelledby="consumer-title" data-testid="consumer-confirmation">
   <h2 id="consumer-title">本次消费提示</h2><p>{{c.message}}</p>
   <template v-if="c.phase==='read'&&c.preview"><p class="consumer-message">{{c.preview.message}}</p><p v-if="amount">本次 {{amount}}</p><ul><li v-for="r in c.preview.reasons" :key="r">{{reasonNames[r]||r}}</li></ul><p>依据规则 {{c.preview.rule_id}}；确认 {{c.preview.expires_in_seconds}} 秒内有效。最终结果仍以原业务记录为准。</p><label><input v-model="read" type="checkbox"/>我已阅读本次提示，愿意继续原操作</label></template>
   <div class="consumer-actions"><button :disabled="c.busy" @click="controller.choose(false)">暂不继续</button><button :disabled="c.busy||c.phase==='read'&&!read" @click="controller.choose(true)">{{c.phase==='read'?'已阅读，继续原操作':c.phase==='recover'?'恢复原阅读确认':'重新读取当前提示'}}</button></div>
  </section>
 </div>
 <aside v-else-if="c.phase==='resume'&&!c.busy||c.result||c.blocked" class="consumer-pending" role="status" data-testid="consumer-recovery"><p>{{c.message}}</p><template v-if="c.result"><p>原记录 {{c.result.id}} · {{c.result.current_status}}</p><button @click="refresh">刷新当前业务记录</button></template><button v-else-if="!c.blocked" @click="controller.resume()">恢复原消费操作</button></aside>
</template>
<style scoped>.consumer-backdrop{position:fixed;inset:0;background:#0008;display:flex;align-items:center;justify-content:center;z-index:3000;padding:20px}.consumer-dialog{background:#f1efea;color:#171717;border:1px solid;max-width:620px;max-height:85vh;overflow:auto;padding:24px;line-height:1.7}.consumer-dialog h2{font-family:'Noto Serif SC',serif}.consumer-dialog button,.consumer-pending button{border:1px solid;background:transparent;padding:10px 16px;cursor:pointer}.consumer-dialog button:disabled{opacity:.45;cursor:default}.consumer-actions{display:flex;gap:12px;margin-top:20px;flex-wrap:wrap}.consumer-message{white-space:pre-wrap;font-weight:700}.consumer-pending{position:fixed;left:12px;bottom:12px;max-width:min(480px,90vw);background:#f1efea;color:#171717;border:1px solid;padding:16px;z-index:2100}</style>
