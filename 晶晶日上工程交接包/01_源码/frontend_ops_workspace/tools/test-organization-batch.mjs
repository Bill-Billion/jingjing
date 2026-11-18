import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {createServer} from 'vite'
import vue from '@vitejs/plugin-vue'
import {createSSRApp,h} from 'vue'
import {renderToString} from '@vue/server-renderer'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
const root=fileURLToPath(new URL('..',import.meta.url)),server=await createServer({root,configFile:false,plugins:[vue()],resolve:{alias:{'@':root+'/src'}},server:{middlewareMode:true,hmr:false},appType:'custom'})
const oldFetch=globalThis.fetch,oldStorage=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage'),storage=new Map()
Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}})
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),reply=data=>new Response(JSON.stringify({meta:{request_id:'test',actor:{account_id:id(1)},acting_party:id(2)},data}),{headers:{'Content-Type':'application/json'}}),failure=()=>new Response(JSON.stringify({error:{code:'COMMIT_OUTCOME_UNKNOWN',message:'lost receipt'}}),{status:503,headers:{'Content-Type':'application/json'}})
try{
 const {default:Panel}=await server.ssrLoadModule('/src/components/business/OrganizationBatchPanel.vue'),{useSessionStore}=await server.ssrLoadModule('/src/stores/session.ts'),{useOrganizationBatch}=await server.ssrLoadModule('/src/stores/organizationBatch.ts'),{validateBatch}=await server.ssrLoadModule('/src/business/organizationBatch.ts')
 const pinia=createPinia(),s=useSessionStore(pinia);s.token='synthetic';s.account={id:id(1),display_name:'测试'};s.expiresAt='2099-01-01T00:00:00Z';s.parties=[{party:{id:id(2),kind:'ORGANIZATION',current_status:'ACTIVE',display_name:'获准机构'},membership:{current_status:'ACTIVE',roles:['OWNER']}}];s.selectedId=id(2)
 const store=useOrganizationBatch(pinia),actions=['ARTIST_LISTING','STOCK_LISTING','PRICE_REVISION','MCN_ASSIGNMENT','PRODUCTION_ASSIGNMENT']
 actions.forEach((action,i)=>store.add(action,{record_id:id(10+i),expected_version:2,reason:'合成逐项内容'}));assert.equal(store.items.length,5)
 assert.throws(()=>store.add(actions[0],store.items[0].input));assert.throws(()=>store.add('DELETE_ALL',{}))
 const original=JSON.parse(JSON.stringify(store.items)),data={id:id(99),party_id:id(2),items:original.map((x,i)=>({key:x.key,action:x.action,status:i===1?'REJECTED':i===2?'RETRY_REQUIRED':'SUCCEEDED',result_id:i===1||i===2?null:id(30+i),result_status:i===1||i===2?null:'IN_REVIEW',error_code:i===1?'VERSION_CONFLICT':i===2?'BATCH_ITEM_RETRY_REQUIRED':null})),current_status:'PARTIAL',meaning:'SUBMITTED_NOT_APPROVED',retry_uses_original_request:true}
 validateBatch(data,original,id(2));assert.throws(()=>validateBatch({...data,party_id:id(9)},original,id(2)));assert.throws(()=>validateBatch({...data,items:[...data.items].reverse()},original,id(2)))
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:Panel}]});await router.push('/engagement/dashboard');await router.isReady()
 let vm;const sends=[];let current=data,reads=0,denied=false
 globalThis.fetch=async(url,o={})=>{assert.equal(o.headers['X-Acting-Party'],id(2));if(o.method==='POST'){sends.push({key:o.headers['Idempotency-Key'],body:o.body});return sends.length===1?failure():reply(current)}reads++;assert(String(url).includes('/engagement/mcn/batches'));if(denied)return new Response(JSON.stringify({error:{code:'ACCESS_DENIED'}}),{status:403,headers:{'Content-Type':'application/json'}});return reply(current)}
 const app=createSSRApp({render:()=>h(RouterView)}).use(pinia).use(router)
 app.mixin({created(){if(this.$options.__name==='OrganizationBatchPanel')vm=this.$.setupState},async serverPrefetch(){if(this.$options.__name!=='OrganizationBatchPanel')return
  vm.agreed=true;await Promise.all([vm.submit(),vm.submit()]);assert.equal(sends.length,1);assert(vm.ui.pending.value);assert(store.frozen)
  assert.throws(()=>store.add('PRICE_REVISION',{record_id:id(88)}))
  await vm.recover();assert.equal(sends.length,1)
  await vm.check();assert.equal(reads,1);assert(vm.ui.pending.value.checked);assert.equal(vm.receipt.id,id(99))
  await vm.recover();assert.equal(sends.length,2);assert(vm.ui.pending.value);assert.equal(sends[1].key,sends[0].key);assert.equal(sends[1].body,sends[0].body)
  denied=true;await vm.check();assert.equal(vm.items.length,0);assert.equal(vm.receipt,null);assert(vm.ui.pending.value);await vm.recover();assert.equal(sends.length,2);denied=false;
  current={...data,items:data.items.map((r,i)=>i===2?{...r,status:'SUCCEEDED',result_id:id(32),result_status:'IN_REVIEW',error_code:null}:r)}
  await vm.check();await vm.recover();assert.equal(sends.length,3);assert.equal(vm.ui.pending.value,null);assert.equal(vm.receipt.items[1].status,'REJECTED');assert.equal(sends[2].key,sends[0].key)
 }})
 const html=await renderToString(app);assert(html.includes('明确拒绝'));assert(html.includes('新价格不改写旧订单'));assert(storage.size===0)
 s.selectedId=id(3);assert.equal(store.items.length,0);assert.equal(store.frozen,false)
 console.log('organization batch: five-action queue, mixed receipts, duplicate guard, unknown first response, read-before-retry, identical key/body recovery and identity cleanup passed')
}finally{globalThis.fetch=oldFetch;if(oldStorage)Object.defineProperty(globalThis,'sessionStorage',oldStorage);else delete globalThis.sessionStorage;await server.close()}
