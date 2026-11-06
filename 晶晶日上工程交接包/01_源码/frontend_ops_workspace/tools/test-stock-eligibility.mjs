import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {createServer} from 'vite'
import {effectScope,reactive} from 'vue'
const root=fileURLToPath(new URL('..',import.meta.url)),server=await createServer({root,configFile:false,resolve:{alias:{'@':root+'/src'}},server:{middlewareMode:true}})
const saved=globalThis.fetch,id=n=>String(n).padStart(8,'0')+'-0000-4000-8000-000000000001'
const row=(person=id(3),approved=true,party=id(2))=>({person_id:person,seller_party_id:party,identity_verified:true,l1_verified:true,manual_review_approved:approved,eligible:approved,blocking_reasons:approved?[]:['STOCK_HALO_REVIEW_REQUIRED'],policy_version:'CONTRACT_20261029'})
const response=(data,party=id(2))=>new Response(JSON.stringify({meta:{request_id:'synthetic-admission',actor:{account_id:id(1)},acting_party:party},data}),{headers:{'Content-Type':'application/json'}})
const tests=[],test=(name,run)=>tests.push({name,run})
try {
 const {stockEligibility,getStockEligibility}=await server.ssrLoadModule('/src/api/modules/stockEligibility.ts'),{useStockEligibility}=await server.ssrLoadModule('/src/composables/useStockEligibility.ts')
 const state=()=>{const ctx=reactive({token:'synthetic',accountId:id(1),partyId:id(2),revision:1,enabled:true,people:[id(3)]}),scope=effectScope(),ui=scope.run(()=>useStockEligibility(()=>ctx));return{ctx,scope,ui}}
 test('三项缺项独立核对；不接受矛盾通过、其他艺人或机构结果',()=>{
  assert(stockEligibility(row(),id(3),id(2)).eligible);assert(!stockEligibility(row(id(3),false),id(3),id(2)).eligible)
  for(const change of [r=>r.person_id=id(4),r=>r.seller_party_id=id(4),r=>r.manual_review_approved=false,r=>r.eligible=false,r=>r.blocking_reasons=['OTHER'],r=>r.identity_verified=null,r=>r.policy_version='OLD']) {const r=row();change(r);assert.throws(()=>stockEligibility(r,id(3),id(2)))}
 })
 test('当前身份只读查询禁缓存；回复的账号/身份必须匹配',async()=>{
  let options;globalThis.fetch=async(u,o)=>{options=o;assert.equal(u,'/api/v1/stock/seller-eligibility?person_id='+id(3));return response(row())}
  await getStockEligibility(id(3),{token:'synthetic',accountId:id(1),actingParty:id(2)});assert.equal(options.cache,'no-store');assert.equal(options.headers['X-Acting-Party'],id(2));assert.equal(options.method,'GET')
  globalThis.fetch=async()=>response(row(),id(9));await assert.rejects(getStockEligibility(id(3),{token:'synthetic',accountId:id(1),actingParty:id(2)}))
 })
 test('多人逐人核对，另一人缺人工审核不能沿用卖家通过',async()=>{
  const s=state();s.ctx.people=[id(3),id(4),id(3)];const calls=[];globalThis.fetch=async u=>{const p=new URL(u,'http://localhost').searchParams.get('person_id');calls.push(p);return response(row(p,p!==id(4)))}
  assert.equal(await s.ui.load(),false);assert.deepEqual(calls,[id(3),id(4)]);assert.equal(s.ui.entries.value[id(3)].eligible,true);assert.equal(s.ui.entries.value[id(4)].eligible,false);s.scope.stop()
 })
 test('切身份/艺人/权限/离开立即清结果，迟到成功不能写回，无自动请求循环',async()=>{
  for(const mutate of [c=>c.partyId=id(8),c=>c.people=[id(9)],c=>c.revision++,c=>c.enabled=false,c=>c.token=null]) {
   const s=state();globalThis.fetch=async()=>response(row());await s.ui.load();let finish,calls=0;globalThis.fetch=()=>{calls++;return new Promise(r=>finish=r)}
   const pending=s.ui.load();assert.deepEqual(s.ui.entries.value,{});mutate(s.ctx);assert.equal(s.ui.ready.value,false);finish(response(row()));await pending;assert.deepEqual(s.ui.entries.value,{});assert.equal(calls,1);assert.equal(s.ui.busy.value,false);s.scope.stop()
  }
 })
 test('断网和403清除旧通过，只有手动重读恢复；重复点击不发重复查询',async()=>{
  const s=state();globalThis.fetch=async()=>response(row());await s.ui.load();let finish,calls=0;globalThis.fetch=()=>{calls++;return new Promise(r=>finish=r)}
  const pending=s.ui.load();assert.equal(await s.ui.load(),false);finish(new Response(JSON.stringify({error:{code:'FORBIDDEN',message:'synthetic'}}),{status:403,headers:{'Content-Type':'application/json'}}));await pending;assert.equal(calls,1);assert.equal(s.ui.ready.value,false);assert.deepEqual(s.ui.entries.value,{});assert.equal(s.ui.errors.value[id(3)].status,403)
  globalThis.fetch=async()=>{throw new TypeError('synthetic offline')};assert.equal(await s.ui.load(),false);globalThis.fetch=async()=>response(row());assert.equal(await s.ui.load(),true);s.scope.stop()
 })
 test('已有购买页面不查询卖家新资格',async()=>{const s=state();s.ctx.enabled=false;let calls=0;globalThis.fetch=async()=>{calls++;return response(row())};assert.equal(await s.ui.load(),false);assert.equal(calls,0);s.scope.stop()})
 for(const {name,run}of tests){await run();console.log('PASS '+name)}console.log(`${tests.length} stock eligibility checks passed`)
} finally {globalThis.fetch=saved;await server.close()}
