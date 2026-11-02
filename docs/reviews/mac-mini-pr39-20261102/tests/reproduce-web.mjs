// Diagnostic-only tests. Imports the exact PR source; every HTTP response is synthetic.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {fileURLToPath} from 'node:url'
import {createServer} from 'vite'
import vue from '@vitejs/plugin-vue'
import {createRenderer,effectScope,ssrContextKey,nextTick,h} from 'vue'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory} from 'vue-router'
const root=fileURLToPath(new URL('../repo/晶晶日上工程交接包/01_源码/frontend_ops_workspace',import.meta.url))
const server=await createServer({root,configFile:false,plugins:[vue()],resolve:{alias:{'@':root+'/src'}},server:{middlewareMode:true,hmr:false},appType:'custom'})
const storage=new Map()
Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}})
const id=n=>String(n).padStart(8,'0')+'-0000-4000-8000-000000000001'
const response=(data,status=200)=>new Response(JSON.stringify(status<300?{meta:{request_id:'diagnostic',actor:{account_id:id(1)},acting_party:id(2)},data}:{error:{code:status===401?'AUTHENTICATION_REQUIRED':'PARTY_FORBIDDEN',message:'synthetic',retryable:false}}),{status,headers:{'Content-Type':'application/json'}})
const row=(n=2,status='ACTIVE',roles=['OWNER'])=>({party:{id:id(n),kind:'ORGANIZATION',display_name:'合成身份'+n,current_status:status,object_version:1,allowed_actions:status==='ACTIVE'?['READ_PARTY','MANAGE_MEMBERS']:[],capabilities:[]},membership:{roles,current_status:'ACTIVE'}})
const snapshot={format_version:'contract-content-v1',id:id(3),contract_version_id:id(5),party_ids:[id(2)],created_at:'2026-11-01T00:00:00.000Z',rule_contents:[{format_version:'rule-content-v1',id:id(4),rule_key:'synthetic',version:'v1',terms:{synthetic:true},content_sha256:'a'.repeat(64)}],commitments:{private:'SYNTHETIC_PRIVATE_CONTRACT'},object_version:1,current_status:'SEALED',signing_method:'NOT_SIGNED',content_sha256:'b'.repeat(64)}
const renderer=createRenderer({createElement:()=>({}),createText:text=>({text}),createComment:()=>({}),setText(){},setElementText(){},parentNode:()=>null,nextSibling:()=>null,insert(){},remove(){},patchProp(){}})
const results=[]
let app,scope
try{
 const {useSessionStore}=await server.ssrLoadModule('/src/stores/session.ts')
 const {useContractReader}=await server.ssrLoadModule('/src/composables/useContractReader.ts')
 const client=await server.ssrLoadModule('/src/api/client.ts')
 const {useServiceContext}=await server.ssrLoadModule('/src/composables/useServiceContext.ts')
 const {loginRedirect}=await server.ssrLoadModule('/src/router/loginRedirect.ts')
 const make=()=>{storage.clear();const pinia=createPinia(),s=useSessionStore(pinia);s.token='synthetic-only';s.account={id:id(1),display_name:'合成用户',current_status:'ACTIVE',allowed_actions:[]};s.parties=[row(),row(9)];s.selectParty(id(2));return{pinia,s}}
 const readContract=async s=>{scope=effectScope();const reader=scope.run(()=>useContractReader(()=>({token:s.token,accountId:s.account?.id||'',partyId:s.selectedId,revision:s.revision})));reader.snapshotId.value=id(3);globalThis.fetch=async()=>response(snapshot);await reader.loadSnapshot();assert(reader.snapshot.value);return reader}
 // Same selected ID, but fresh server state explicitly suspends that identity.
 {
  const {s}=make(),reader=await readContract(s),rev=s.revision
  globalThis.fetch=async()=>response({items:[row(2,'SUSPENDED'),row(9)],next_cursor:null})
  await s.loadParties()
  const actual={selectedStatus:s.selected.party.current_status,revisionChanged:s.revision!==rev,oldContentRetained:reader.snapshot.value?.commitments.private==='SYNTHETIC_PRIVATE_CONTRACT'}
  assert.equal(actual.selectedStatus,'SUSPENDED');assert.equal(actual.revisionChanged,false);assert.equal(actual.oldContentRetained,true)
  results.push({id:'R1',case:'同一身份变为停用，旧合同缓存仍保留',actual});scope.stop()
 }
 // Explicit 403 from selected identity refresh does not invalidate the session scope.
 {
  const {s}=make(),reader=await readContract(s),rev=s.revision
  globalThis.fetch=async()=>response(null,403)
  await assert.rejects(s.refreshSelected(),e=>e.status===403)
  const actual={selectedId:s.selectedId,revisionChanged:s.revision!==rev,oldContentRetained:!!reader.snapshot.value}
  assert.equal(actual.oldContentRetained,true);assert.equal(actual.revisionChanged,false)
  results.push({id:'R1b',case:'身份详情明确拒绝后未清理旧上下文',actual});scope.stop()
 }
 // The actual global App watcher drops the business route on an ordinary 401.
 {
  const {s,pinia}=make(),target='/invoices/requests/'+id(10)
  const router=createRouter({history:createMemoryHistory(),routes:[{path:target,component:{render:()=>null}},{path:'/login',meta:{public:true},component:{render:()=>null}}]})
  await router.push(target);await router.isReady()
  const App=(await server.ssrLoadModule('/src/App.vue')).default
  app=renderer.createApp({...App,render:()=>null}).use(pinia).use(router);app.provide(ssrContextKey,{});app.mount({})
  globalThis.fetch=async()=>response(null,401)
  await assert.rejects(client.request('/invoices/requests/'+id(10),{token:s.token,actingParty:id(2)}),e=>e.status===401)
  await nextTick();await new Promise(r=>setTimeout(r,0))
  const actual={route:router.currentRoute.value.fullPath,redirect:router.currentRoute.value.query.redirect??null,afterLogin:loginRedirect(router.currentRoute.value.query.redirect),sessionCleared:s.token===null}
  assert.equal(actual.route,'/login');assert.equal(actual.afterLogin,'/workspace');assert(actual.sessionCleared)
  results.push({id:'R2',case:'普通会话过期丢失开票原页返回地址',expected:{redirect:target},actual});app.unmount();app=null
 }
 // A page reload discards in-memory unknown-result state; a new submit gets a new key.
 {
  const {s,pinia}=make(),target='/invoices/orders/'+id(11)+'/new'
  const router=createRouter({history:createMemoryHistory(),routes:[{path:target,component:{render:()=>null}}]})
  await router.push(target);await router.isReady();let ui
  const mount=()=>{app=renderer.createApp({setup(){ui=useServiceContext(()=>s.selectedId);return()=>null}}).use(pinia).use(router);app.mount({})}
  mount();const keys=[];globalThis.fetch=async(_url,opts)=>{keys.push(opts.headers['Idempotency-Key']);throw new TypeError('synthetic response loss after commit')}
  const body={order_id:id(11),amount_minor:1000,header:{kind:'PERSON',title:'合成抬头',tax_id:null},text:'合成开票',asset_ids:[]}
  await ui.write('/invoices/requests',body,()=>true,()=>{});assert(ui.pending.value)
  const before={pending:true,key:keys[0]};app.unmount();mount()
  const pendingAfterReload=!!ui.pending.value
  await ui.write('/invoices/requests',body,()=>true,()=>{})
  const actual={pendingAfterReload,newKey:keys[1],differentKey:keys[0]!==keys[1],posts:keys.length}
  assert.equal(pendingAfterReload,false);assert(actual.differentKey);assert.equal(keys.length,2)
  results.push({id:'R3',case:'开票未知结果在页面重建后丢失，原操作变成新key',before,actual,limit:'仅证实前端key丢失；真实数据库重复记录需整链验证'});app.unmount();app=null
 }
 // Restoring a selected party from page two after a full page reload.
 {
  storage.clear();storage.set('ops.session.token','synthetic-only');storage.set('ops.session.selected',id(9))
  const s=useSessionStore(createPinia());s.account={id:id(1),display_name:'synthetic',current_status:'ACTIVE'}
  const before=s.selectedId,requested=[]
  globalThis.fetch=async url=>{requested.push(url);return response({items:[row(2)],next_cursor:id(2)})}
  await s.loadParties()
  assert.equal(before,id(9));assert.equal(s.selectedId,id(2));assert.equal(requested.length,1)
  results.push({id:'R4',case:'刷新后第二页已选身份被自动换回第一页首身份',actual:{before,after:s.selectedId,requested},expected:'读取持久化选中身份详情或明确提示重新选择'})
 }
 // Positive control: A -> B -> A discards an older A response.
 {
  const {s}=make(),reader=await readContract(s);let finish
  globalThis.fetch=()=>new Promise(r=>{finish=r})
  const old=reader.loadSnapshot();s.selectParty(id(9));s.selectParty(id(2));finish(response(snapshot));await old
  assert.equal(reader.snapshot.value,null)
  results.push({id:'C1',case:'普通A→B→A迟到响应隔离',actual:'通过'});scope.stop()
 }
 fs.writeFileSync(new URL('../evidence/reproductions.json',import.meta.url),JSON.stringify({head:'8df249b59d3c83cdd8ca9aee0db08068b546d296',tested_at:new Date().toISOString(),type:'real Vue/Pinia source with synthetic HTTP; no live services',results},null,2))
 console.log(JSON.stringify(results,null,2))
}finally{app?.unmount();scope?.stop();await server.close()}
