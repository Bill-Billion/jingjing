import { defineStore } from 'pinia'
import { shallowRef,watch } from 'vue'
import { request,newIdempotencyKey } from '@/api/client'
import { savedWrite,saveWrite,removeWrite } from '@/api/pendingWrites'
import { UsageController,type UsageAck } from '@/usage/controller'
import { useSessionStore } from './session'
export const useRestUsageStore=defineStore('rest-usage',()=>{
 const session=useSessionStore(),revision=shallowRef(0)
 const route='/privacy/preferences',path='/privacy/usage/acknowledge'
 const controller=new UsageController({
  read:async()=>(await request('/privacy/usage',{token:session.token,cache:'no-store'})).data,
  pulse:async()=>(await request('/privacy/usage/pulse',{token:session.token,method:'POST',body:{}})).data,
  ack:async(c:UsageAck)=>(await request(path,{token:session.token,method:'POST',body:{},ifMatch:c.version,idempotencyKey:c.key})).data,
  newKey:newIdempotencyKey,
  nightSeen:date=>localStorage.getItem('ops.night-seen.'+session.account!.id)===date,
  markNightSeen:date=>localStorage.setItem('ops.night-seen.'+session.account!.id,date),
  restore:()=>{const c=savedWrite('rest-usage',session.account!.id,null,route);return c?{version:c.ifMatch!,key:c.key}:null},
  save:c=>saveWrite({namespace:'rest-usage',accountId:session.account!.id,selectedId:'',partyId:null,authority:'ACCOUNT',route,path,method:'POST',key:c.key,body:{},ifMatch:c.version}),
  remove:c=>removeWrite(c.key),changed:()=>revision.value++
 })
 watch(()=>[session.token,session.account?.id],()=>{controller.stop();if(session.token&&session.account?.id){controller.start();controller.setVisible(document.visibilityState==='visible')}},{immediate:true,flush:'sync'})
 return{controller,revision}
})
