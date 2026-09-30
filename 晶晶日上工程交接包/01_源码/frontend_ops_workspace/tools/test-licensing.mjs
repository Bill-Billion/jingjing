import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createSSRApp, effectScope, h, reactive } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
const root=fileURLToPath(new URL('..',import.meta.url)), server=await createServer({root,configFile:false,plugins:[vue()],resolve:{alias:{'@':`${root}/src`}},server:{middlewareMode:true},appType:'custom'})
const originalFetch=globalThis.fetch, id=n=>`${String(n).padStart(8,'0')}-0000-4000-8000-000000000001`, who={token:'private-token',accountId:id(1),partyId:id(2)}, reviewer={...who,partyId:null}
const stamp='2026-09-30T00:00:00.000Z', end='2027-09-30T00:00:00.000Z', hash='a'.repeat(64)
const terms=()=>({exclusive:true,rights:['ADAPT','PRODUCE'],purposes:['PRIVATE'],territories:['CN'],languages:['zh'],valid_from:stamp,development_until:end,valid_until:end,project_limit:2,episode_limit:10,terms_text:'明确约定，不自动授予发行、AI训练等权利'})
const contract=()=>({format_version:'contract-content-v1',id:id(5),contract_version_id:id(6),party_ids:[id(2),id(3)],created_at:stamp,rule_contents:[{format_version:'rule-content-v1',id:id(7),rule_key:'script',version:'1',terms:{text:'规则正文'},content_sha256:hash}],commitments:{text:'历史合同正文'},object_version:1,current_status:'SEALED',signing_method:'NOT_SIGNED',content_sha256:hash})
const base=(kind,n,status,data)=>({id:id(n),kind,owner_party_id:id(2),counterparty_id:kind==='PRODUCT'?null:id(3),work_id:id(8),parent_id:kind==='PRODUCT'?null:id(10),created_by:id(1),current_status:status,object_version:1,data})
const product=()=>base('PRODUCT',10,'LISTED',{work_version_id:id(9),title:'真实剧本',preview_text:'短试读 <script>literal</script>',terms:terms(),price:{currency:'CNY',amount_minor:12345},payment_due_minor:100,reservation_minutes:60,rule_id:id(7),review:{decision:'APPROVED',reason:'上架依据',reviewer_account_id:id(4),verification:null}})
const reservation=()=>base('RESERVATION',11,'HELD',{...product().data,contract:contract(),expires_at:end})
const grant=()=>({...base('GRANT',12,'ACTIVE',{work_version_id:id(9),terms:terms(),price:product().data.price,contract:contract(),evidence_id:id(13),activated_at:stamp,reason:'材料齐备'}),parent_id:id(11)})
const reading=()=>({...base('READING',14,'APPROVED',{work_version_id:id(9),reader_account_id:id(1),valid_until:end,basis_type:'NDA',basis_asset_id:id(15),review:{decision:'APPROVED',reason:'阅稿依据',reviewer_account_id:id(4),verification:null},allows_generation:false}),counterparty_id:id(2),owner_party_id:id(3),parent_id:null})
const response=(data,i=who)=>new Response(JSON.stringify({meta:{request_id:'license-test',actor:{account_id:i.accountId},acting_party:i.partyId},data}),{status:200,headers:{'Content-Type':'application/json'}})
const failure=(status,code)=>new Response(JSON.stringify({error:{code,message:'test-only',retryable:false,details:[]}}),{status,headers:{'Content-Type':'application/json'}})
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return{promise,resolve}}
const tests=[],test=(name,run)=>tests.push({name,run})
try{
 const api=await server.ssrLoadModule('/src/api/modules/licensing.ts'), {useLicensing}=await server.ssrLoadModule('/src/composables/useLicensing.ts'),{loginRedirect}=await server.ssrLoadModule('/src/router/loginRedirect.ts')
 const state=(review=false)=>{const context=reactive({...review?reviewer:who,revision:0,scope:'licensing'}),scope=effectScope(),ui=scope.run(()=>useLicensing(()=>context));return{context,scope,ui}}
 const write=()=>({path:'/licensing/reservations',body:{product_id:id(10)},resultKind:'RESERVATION',label:'预留'})
 test('所有正式许可入口可安全恢复，拒绝外站、查询角色、未知页面及伪编号',async()=>{
  for(const path of ['/licensing/catalog',`/licensing/catalog/${id(10)}`,'/licensing/products/new','/licensing/projects/new','/licensing/readings/new','/licensing/reservations','/licensing/evidence','/licensing/grants','/licensing/projects','/licensing/bindings','/licensing/readings',`/licensing/reviews/activation/${id(11)}`,'/licensing/reviews/projects','/licensing/reviews/bindings'])assert.equal(loginRedirect(path),path)
  for(const path of ['//host/licensing/catalog','/licensing/catalog?role=LICENSE_REVIEW','/licensing/projects/../catalog','/licensing/catalog/garbage','/licensing/reviews/admin','/licensing/catalog\n'])assert.equal(loginRedirect(path),'/workspace')
 })
 test('目录和审核查询的身份、分页及no-store准确，权限不由前端角色参数代替',async()=>{
  const calls=[];globalThis.fetch=async(url,o)=>{calls.push({url,o});return response({items:[],next_cursor:null},o.headers['X-Acting-Party']?who:reviewer)}
  await api.listLicense(who,'PRODUCT',true,id(99));await api.listLicense(reviewer,'EVIDENCE')
  assert.equal(calls[0].url,`/api/v1/licensing/records?kind=PRODUCT&limit=20&catalog=true&cursor=${id(99)}`);assert.equal(calls[0].o.cache,'no-store');assert.equal(calls[0].o.headers['X-Acting-Party'],id(2));assert.equal(calls[1].o.headers['X-Acting-Party'],undefined)
 })
 test('写入携带固定版本和幂等键，不自动重试或补商业默认值',async()=>{
  const calls=[];globalThis.fetch=async(url,o)=>{calls.push({url,o});return response(product(),reviewer)}
  await api.postLicense(reviewer,{path:`/licensing/records/${id(10)}/reviews`,body:{decision:'APPROVED',reason:'真实依据',verification:null},version:3,targetId:id(10),resultKind:'PRODUCT',label:'审核'},'fixed-license-operation')
  assert.equal(calls.length,1);assert.equal(calls[0].o.headers['If-Match'],'"3"');assert.equal(calls[0].o.headers['Idempotency-Key'],'fixed-license-operation');assert.equal(calls[0].o.headers['X-Acting-Party'],undefined);assert.deepEqual(JSON.parse(calls[0].o.body),{decision:'APPROVED',reason:'真实依据',verification:null})
 })
 test('返回记录拒绝不匹配身份、错误币种金额、范围、全文生成标志和旧格式',async()=>{
  assert.ok(api.isLicenseRecord(product()));assert.ok(api.isLicenseRecord(reservation()));assert.ok(api.isLicenseRecord(grant()));assert.ok(api.isLicenseRecord(reading()))
  for(const change of [r=>r.data.price.amount_minor=0.01,r=>r.data.terms.exclusive='yes',r=>r.data.terms.valid_until=stamp,r=>r.data.terms.rights=['UNKNOWN'],r=>r.data.review.verification={identity_verified:true}]){const r=product();change(r);assert.equal(api.isLicenseRecord(r),false)}
  globalThis.fetch=async()=>response(product(),{...who,partyId:id(99)});await assert.rejects(api.getLicense(who,id(10),'PRODUCT'),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE')
  globalThis.fetch=async()=>response({record_id:id(14),watermarked_text:'正文',allows_generation:true});await assert.rejects(api.readLicenseContent(who,id(14)),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE')
 })
 test('CNY整数分准确显示人民币，不猜未知币种，不接受浮点或超安全整数',async()=>{
  assert.equal(api.moneyText({currency:'CNY',amount_minor:12345}),'¥123.45 / CNY');assert.equal(api.moneyText({currency:'CNY',amount_minor:1}),'¥0.01 / CNY');assert.equal(api.moneyText({currency:'CNY',amount_minor:9007199254740991}),'¥90,071,992,547,409.91 / CNY');assert.match(api.moneyText({currency:'XYZ',amount_minor:123}),/最小币种单位/)
  for(const value of ['1.01','-1','1e3',' 1','9007199254740992'])assert.equal(api.minorInteger(value),null);assert.equal(api.minorInteger('0'),0)
 })
 test('ACTIVE仍受开始、有效及开发期限和用途额度限制',async()=>{
  const r=grant();assert.equal(api.grantUsable(r,Date.parse(stamp)-1),false);assert.equal(api.grantUsable(r,Date.parse(end)),false);assert.equal(api.grantUsable({...r,current_status:'SUSPENDED'},Date.parse(stamp)+1),false)
  const p={title:'项目',purpose:'PRIVATE',territory:'CN',language:'zh',episodes:5};assert.equal(api.projectFits(terms(),p,Date.parse(stamp)+1),true);assert.equal(api.projectFits(terms(),{...p,purpose:'RELEASE'},Date.parse(stamp)+1),false);assert.equal(api.projectFits(terms(),{...p,episodes:11},Date.parse(stamp)+1),false);assert.equal(api.projectFits(terms(),p,Date.parse(end)),false)
 })
 test('项目改稿要求真实绑定、来源、项目、当前负责人和有效ADAPT，不能从制作权推导',async()=>{
  const g=grant(),p=base('PROJECT',30,'ACTIVE',{title:'项目',purpose:'PRIVATE',territory:'CN',language:'zh',episodes:5}),b={...base('BINDING',31,'ACTIVE',{project_id:p.id,work_version_id:id(9),terms_sha256:hash}),parent_id:g.id}
  const now=Date.parse(stamp)+1;assert.equal(api.canAdaptBinding(b,g,p,id(2),now),true)
  for(const [binding,grantRecord,projectRecord,party] of [[{...b,parent_id:id(99)},g,p,id(2)],[{...b,data:{...b.data,work_version_id:id(99)}},g,p,id(2)],[b,{...g,current_status:'SUSPENDED'},p,id(2)],[b,{...g,data:{...g.data,terms:{...g.data.terms,rights:['PRODUCE']}}},p,id(2)],[b,g,{...p,data:{...p.data,purpose:'RELEASE'}},id(2)],[b,g,p,id(99)]])assert.equal(api.canAdaptBinding(binding,grantRecord,projectRecord,party,now),false)
  assert.equal(api.canAdaptBinding(b,g,p,id(2),Date.parse(end)),false);assert.equal(loginRedirect(`/supply/adaptations/${b.id}/new`),`/supply/adaptations/${b.id}/new`);assert.equal(loginRedirect('/supply/adaptations/invalid/new'),'/workspace')
 })
 test('未知预留结果只重试完整原请求和同一键，成功重放后重新读当前记录',async()=>{
  const {ui,scope}=state(),calls=[];let post=0
  globalThis.fetch=async(url,o)=>{calls.push({url,o});if(o.method==='POST'){if(++post===1)throw Error('connection lost');return response(reservation())}return response({...reservation(),object_version:2})}
  const body=write();await ui.write(body,()=>{});body.body.product_id=id(99);assert.equal(ui.pending.value.state,'retry');await ui.retry();assert.equal(ui.pending.value,null);assert.equal(ui.detail.value.object_version,2)
  const posts=calls.filter(x=>x.o.method==='POST');assert.equal(posts[0].o.body,posts[1].o.body);assert.equal(posts[0].o.headers['Idempotency-Key'],posts[1].o.headers['Idempotency-Key']);assert.equal(JSON.parse(posts[1].o.body).product_id,id(10));scope.stop()
 })
 test('未知写入阻止真实路由导航并保留原key/body，核对成功后才允许切换',async()=>{
  const {ui,scope}=state(),router=createRouter({history:createMemoryHistory(),routes:[{path:'/licensing/catalog',component:{render:()=>null}},{path:'/licensing/projects',component:{render:()=>null}}]});await router.push('/licensing/catalog');router.beforeEach(()=>ui.canNavigate());let posts=0;const calls=[]
  globalThis.fetch=async(url,o)=>{calls.push(o);if(o.method==='POST'){if(++posts===1)throw Error('unknown outcome');return response(reservation())}return response(reservation())}
  await ui.write(write(),()=>{});const key=ui.pending.value.key,body=JSON.stringify(ui.pending.value.command.body);await router.push('/licensing/projects');assert.equal(router.currentRoute.value.path,'/licensing/catalog');assert.equal(ui.pending.value.key,key);assert.equal(JSON.stringify(ui.pending.value.command.body),body)
  await ui.retry();assert.equal(ui.pending.value,null);assert.equal(calls.filter(o=>o.method==='POST')[1].headers['Idempotency-Key'],key);await router.push('/licensing/projects');assert.equal(router.currentRoute.value.path,'/licensing/projects');scope.stop()
 })
 test('提交已确认但刷新失败仅重新读取，不再次创建许可',async()=>{
  const {ui,scope}=state();let posts=0,gets=0;globalThis.fetch=async(url,o)=>o.method==='POST'?(posts++,response(reservation())):++gets===1?failure(503,'SERVICE_UNAVAILABLE'):response(reservation())
  await ui.write(write(),()=>{});assert.equal(ui.pending.value.state,'refresh');await ui.retry();assert.equal(posts,1);assert.equal(ui.pending.value,null);scope.stop()
 })
 test('412清除原审核决定并读取最新版本，必须重新作出决定',async()=>{
  const {ui,scope}=state(true);globalThis.fetch=async(url,o)=>o.method==='POST'?failure(412,'VERSION_CONFLICT'):response({...product(),object_version:2},reviewer)
  await ui.write({path:`/licensing/records/${id(10)}/reviews`,body:{decision:'APPROVED',reason:'依据',verification:null},version:1,targetId:id(10),resultKind:'PRODUCT',label:'审核'},()=>assert.fail());assert.equal(ui.pending.value,null);assert.equal(ui.detail.value.object_version,2);assert.equal(ui.conflictRevision.value,1);scope.stop()
 })
 test('冲突预留不可重试为成功；结束后重新核对',async()=>{
  const {ui,scope}=state();let calls=0;globalThis.fetch=async()=>{calls++;return failure(409,'LICENSE_SCOPE_CONFLICT')};await ui.write(write(),()=>assert.fail());await ui.retry();assert.equal(calls,1);assert.equal(ui.pending.value.state,'blocked');ui.acknowledgeConflict();assert.equal(ui.pending.value,null);assert.equal(ui.conflictRevision.value,1);scope.stop()
 })
 test('晚到发放HTTP200只显示人工补救，并拒绝无关许可回包',async()=>{
  const {ui,scope}=state(true),late={...reservation(),current_status:'REVIEW_REQUIRED',object_version:2,data:{...reservation().data,late_reason:'晚到'}};globalThis.fetch=async()=>response(late,reviewer)
  await ui.write({path:`/licensing/reservations/${id(11)}/activation`,body:{evidence_id:id(13),reason:'晚到'},version:1,targetId:id(11),resultKind:'ACTIVATION',label:'发放'},r=>assert.equal(r.kind,'RESERVATION'))
  assert.match(ui.notice.value,/尚未取得许可/);assert.equal(ui.detail.value.current_status,'REVIEW_REQUIRED');scope.stop()
  globalThis.fetch=async()=>response({...grant(),parent_id:id(99)},reviewer);await assert.rejects(api.postLicense(reviewer,{path:`/licensing/reservations/${id(11)}/activation`,body:{},version:1,targetId:id(11),resultKind:'ACTIVATION',label:'发放'},'key'),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE')
 })
 test('403清除私有列表、合同、全文及待操作；迟到返回不得恢复',async()=>{
  const {ui,scope}=state();ui.rows.value=[reservation()];ui.detail.value=reservation();ui.content.value='private';globalThis.fetch=async()=>failure(403,'LICENSE_PARTY_FORBIDDEN');await ui.write(write(),()=>assert.fail());assert.deepEqual(ui.rows.value,[]);assert.equal(ui.detail.value,null);assert.equal(ui.content.value,'');assert.equal(ui.pending.value,null);scope.stop()
 })
 test('身份A→B→A、退出、换页面及会话修订丢弃迟到读写',async()=>{
  for(const change of [c=>{c.partyId=id(99);c.partyId=id(2)},c=>{c.token=null},c=>{c.scope='other'},c=>{c.revision++}]){const {ui,context,scope}=state(),late=defer();globalThis.fetch=()=>late.promise;const p=ui.loadRecord(id(11),'RESERVATION');change(context);late.resolve(response(reservation()));await p;assert.equal(ui.detail.value,null);scope.stop()}
  const {ui,context,scope}=state(),late=defer();globalThis.fetch=()=>late.promise;const p=ui.write(write(),()=>assert.fail('late callback'));context.partyId=id(99);late.resolve(response(reservation()));await p;assert.equal(ui.pending.value,null);assert.equal(ui.detail.value,null);scope.stop()
 })
 test('同身份更换记录时，旧403不能清除后来的有效详情',async()=>{
  const {ui,scope}=state(),first=defer(),second=defer();let n=0;globalThis.fetch=()=>++n===1?first.promise:second.promise;const p1=ui.loadRecord(id(11),'RESERVATION'),p2=ui.loadRecord(id(12),'GRANT');first.resolve(failure(403,'LICENSE_PARTY_FORBIDDEN'));await p1;second.resolve(response(grant()));await p2;assert.equal(ui.detail.value.id,id(12));assert.equal(ui.error.value,null);scope.stop()
 })
 test('受控阅读在正文前后验证指定账号、身份、版本及期限，并禁止缓存',async()=>{
  const {ui,scope}=state(),calls=[];globalThis.fetch=async(url,o)=>{calls.push({url,o});return response(url.endsWith('/content')?{record_id:id(14),watermarked_text:'watermark <script>literal</script>',allows_generation:false}:reading())};await ui.readContent(id(14));assert.equal(calls.length,3);assert.ok(calls.every(x=>x.o.cache==='no-store'));assert.match(ui.content.value,/<script>/);assert.equal(ui.readerDeadline.value,Date.parse(end));ui.clearContent();assert.equal(ui.content.value,'');scope.stop()
  const revoked={...reading(),current_status:'REVOKED',object_version:2},s=state();let n=0;globalThis.fetch=async(url)=>response(url.endsWith('/content')?{record_id:id(14),watermarked_text:'private',allows_generation:false}:++n===1?reading():revoked);await s.ui.readContent(id(14));assert.equal(s.ui.content.value,'');assert.equal(s.ui.error.value.status,403);s.scope.stop()
 })
 test('正文迟到换身份、到期或撤销不显示，后续核验失败立即清除',async()=>{
  const {ui,scope}=state();globalThis.fetch=async(url)=>response(url.endsWith('/content')?{record_id:id(14),watermarked_text:'private',allows_generation:false}:reading());await ui.readContent(id(14));globalThis.fetch=async()=>response({...reading(),current_status:'REVOKED',object_version:2});await ui.verifyReader();assert.equal(ui.content.value,'');scope.stop()
  const s=state();globalThis.fetch=async()=>response({...reading(),data:{...reading().data,valid_until:stamp}});await s.ui.readContent(id(14));assert.equal(s.ui.content.value,'');s.scope.stop()
 })
 test('所有新旧工作区保留同一完整菜单，详情与审核仅一个正确高亮',async()=>{
  const oldWindow=globalThis.window,oldStorage=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage'),store=new Map();globalThis.window={setInterval:()=>0,clearInterval:()=>{},addEventListener:()=>{},removeEventListener:()=>{}};Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}})
  try{
   const entries=[['/workspace','账号与机构'],['/contracts','合同与规则'],['/supply/profiles','供给申请'],['/supply/works','我的作品'],['/licensing/catalog','选剧本'],['/licensing/products','许可商品'],['/licensing/reservations','许可办理'],['/licensing/projects','项目与绑定'],['/licensing/readings','受控阅稿'],['/supply/reviews/profile','供给审核'],['/supply/reviews/rights','作品审核'],['/licensing/reviews/products','许可核验']]
   for(const [path,current] of [['/licensing/catalog','/licensing/catalog'],[`/licensing/grants/${id(12)}`,'/licensing/reservations'],['/licensing/projects/new','/licensing/projects'],[`/licensing/bindings/${id(15)}`,'/licensing/projects'],[`/licensing/reviews/evidence/${id(13)}`,'/licensing/reviews/products'],['/licensing/readings/new','/licensing/readings']]){
    const {default:View}=await server.ssrLoadModule('/src/views/LicensingView.vue'),router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:View}]});const app=createSSRApp({render:()=>h(RouterView)}).use(createPinia()).use(router);await router.push(path);await router.isReady();const html=await renderToString(app),nav=html.match(/<nav\b[^>]*aria-label="工作区导航"[^>]*>([\s\S]*?)<\/nav>/)?.[1];assert.ok(nav);const links=[...nav.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([,attrs,text])=>({href:attrs.match(/\bhref="([^"]+)"/)?.[1],label:text.replace(/<[^>]*>/g,'').trim(),current:attrs.includes('aria-current="page"')}));assert.deepEqual(links.map(l=>[l.href,l.label]),entries);assert.deepEqual(links.filter(l=>l.current).map(l=>l.href),[current])
   }
  }finally{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;if(oldStorage)Object.defineProperty(globalThis,'sessionStorage',oldStorage);else delete globalThis.sessionStorage}
 })
 test('短试读和合同按纯文本渲染，核验默认项不被填成true',async()=>{
  const {default:Panel}=await server.ssrLoadModule('/src/components/LicenseRecordPanel.vue');const html=await renderToString(createSSRApp({render:()=>h(Panel,{record:product()})}));assert.ok(html.includes('&lt;script&gt;literal&lt;/script&gt;'));assert.equal(html.includes('<script>literal</script>'),false);assert.ok(html.includes('¥123.45 / CNY'));assert.ok(html.includes('独家不会自动增加发行权'))
 })
 const selected=process.env.LICENSE_CHECK_FILTER?tests.filter(t=>t.name.includes(process.env.LICENSE_CHECK_FILTER)):tests;if(!selected.length)throw Error('No licensing checks selected');for(const {name,run}of selected){await run();console.log(`✓ ${name}`)}console.log(`\n${selected.length} licensing checks passed.`)
}finally{globalThis.fetch=originalFetch;await server.close()}
