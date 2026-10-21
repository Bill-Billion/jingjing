import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createSSRApp,effectScope,h,reactive } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createPinia } from 'pinia'
import { createMemoryHistory,createRouter,RouterView } from 'vue-router'

const root=fileURLToPath(new URL('..',import.meta.url)),server=await createServer({root,configFile:false,plugins:[vue()],resolve:{alias:{'@':`${root}/src`}},server:{middlewareMode:true},appType:'custom'})
const originalFetch=globalThis.fetch,oldStorage=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage'),storage=new Map()
Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}})
const id=n=>`${String(n).padStart(8,'0')}-0000-4000-8000-000000000001`,who={token:'artists-isolated-test',accountId:id(1),partyId:id(2)},reviewer={...who,partyId:null},hash='a'.repeat(64),stamp='2026-10-01T00:00:00.000Z',end='2030-10-01T00:00:00.000Z'
const person=()=>({id:id(10),owner_party_id:id(2),display_name:'本人真实档案 <script>literal</script>',current_status:'ACTIVE',identity_status:'VERIFIED',age_band:'ADULT',identity_valid_until:end,object_version:2})
const avatar=()=>({id:id(11),person_id:id(10),owner_party_id:id(2),object_version:1,data:{display_name:'明确数字人',material_asset_ids:[],provider_asset_ref:null,artist_person_id:id(10),archive_status:'EMPTY',long_lived_model_status:'NOT_ENABLED'}})
const detail=()=>({person:person(),avatars:[avatar()],halo_level:1})
const review=()=>({decision:'APPROVE',reason:'实际核验依据',reviewed_by:id(8),reviewed_at:stamp})
const base=(kind,n,status,data,avatarId=id(11))=>({id:id(n),person_id:id(10),kind,avatar_id:avatarId,counterparty_id:null,created_by:id(1),current_status:status,object_version:2,content_sha256:hash,data})
const consent=()=>base('CONSENT',20,'APPROVED',{features:['FACE','VOICE'],purposes:['PRIVATE_ARCHIVE'],grantee_party_id:id(2),territories:['CN'],valid_from:stamp,valid_until:end,terms:'本人明确用途 <script>literal</script>',evidence_asset_ids:[id(30)],declared_by:id(1),declared_at:stamp,review:review()})
const variant=()=>base('LOOK',21,'RECORDED',{previous_version_id:null,display_name:'明确造型版',material_asset_ids:[id(31)],consent_id:id(20),revision:1})
const listing=()=>base('LISTING',22,'APPROVED',{display_name:'获准公开名称',city:'上海',introduction:'已批准公开介绍',tags:['表演'],consent_id:id(20),look_version_id:id(21),voice_version_id:null,audition_public:false,preview_asset_ids:[id(31)]})
const spec=(kind='AVATAR_HOSTING')=>({version:'approved-v1',service_tier:'实际服务',service:{kind,unit:kind==='AVATAR_HOSTING'?'AVATAR_MONTH':kind==='AVATAR_CREATION'?'PERSON_FIRST':'HALO_APPLICATION',rule_version:'actual-v1',source_ref:'approved-source',retry_limit:kind==='AVATAR_CREATION'?2:0,hosting_months:kind==='AVATAR_HOSTING'?3:null,halo_level:kind==='HALO_REVIEW'?2:null,failure_policy:'REFUND_UNDELIVERED'},deliverables:['按原约定交付'],terms:'明确已审服务条款'})
const service=(kind='AVATAR_HOSTING')=>({...base('SERVICE',23,'REQUESTED',{kind,spec_id:id(40),specification:spec(kind),price_minor:kind==='AVATAR_HOSTING'?8700:kind==='AVATAR_CREATION'?6000:1000,currency:'CNY',renewal_reminder:false,auto_debit_enabled:false,delivery:null,hosting_period:null,refund:null,attempts:0},kind==='HALO_REVIEW'?null:id(11)),counterparty_id:id(3)})
const services=()=>({identity:{current_status:'NOT_ENABLED',reason_code:'PROVIDER_NOT_CONFIGURED'},long_lived_model:{current_status:'NOT_ENABLED',reason_code:'PROVIDER_NOT_IMPLEMENTED'},offers:{items:[{spec_id:id(40),merchant_party_id:id(3),title:'原已审托管服务',price_minor:8700,currency:'CNY',specification:spec(),product_profile:{version:'V5',type:'AVATAR_HOSTING'}}],current_status:'CONFIGURED',reason_code:null}})
const catalog=()=>({listing_id:id(22),person_id:id(10),avatar_id:id(11),display_name:'获准公开名称',city:'上海',introduction:'已批准公开介绍',tags:['表演'],audition_public:false,preview_asset_ids:[id(31)],halo_level:1})
const response=(data,i=who,etag=data?.object_version)=>new Response(JSON.stringify({meta:{request_id:'artists-isolated',actor:{account_id:i.accountId},acting_party:i.partyId},data}),{status:200,headers:{'Content-Type':'application/json',...(etag?{ETag:`"${etag}"`}:{})}})
const failure=(status,code)=>new Response(JSON.stringify({error:{code,message:'isolated-only',retryable:false,details:[]}}),{status,headers:{'Content-Type':'application/json'}})
const defer=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)}}
const tests=[],test=(name,run)=>tests.push({name,run})
try{
 const api=await server.ssrLoadModule('/src/api/modules/artists.ts'),{useArtists}=await server.ssrLoadModule('/src/composables/useArtists.ts'),{ApiError,outcomeUnknown}=await server.ssrLoadModule('/src/api/client.ts'),{artistsRoutes}=await server.ssrLoadModule('/src/router/artistsRoutes.ts'),{loginRedirect}=await server.ssrLoadModule('/src/router/loginRedirect.ts')
 const state=(account=false)=>{const context=reactive({...account?reviewer:who,revision:0,scope:'artists'}),scope=effectScope(),ui=scope.run(()=>useArtists(()=>context));return {ui,context,scope}}
 const command=()=>({path:`/artists/people/${id(10)}/consents`,personId:id(10),ownerPartyId:id(2),body:{avatar_id:id(11),consent:{terms:'原本人的明确内容'}},resultKind:'CONSENT',label:'本人同意'})
 const asset=async(blob,purpose='AVATAR_MATERIAL',media='image/png')=>({id:id(31),owner_party_id:id(2),purpose,media_type:media,byte_size:blob.size,content_sha256:await api.sha256(blob),current_status:'READY'})
 test('本人、多数字人绑定与九类真实DTO；不接纳伪实名、模型或交叉归属',async()=>{
  assert.ok(api.isArtistDetail(detail()));const bad=detail();bad.avatars[0].person_id=id(99);assert.equal(api.isArtistDetail(bad),false)
  const records=[consent(),variant(),{...variant(),kind:'VOICE'},listing(),service(),base('IDENTITY',24,'PENDING',{session_ref:'real-session',request_key:'original-provider-key',person_id:id(10),account_id:id(1),result:null},null),{...base('DELEGATION',25,'ACTIVE',{organization_party_id:id(3),relation_id:id(44),actions:['READ_PROFILE'],valid_from:stamp,valid_until:end,evidence_asset_ids:[],terms:'机构可见的委托范围',accepted_by:id(1),accepted_at:stamp},null),counterparty_id:id(3)},base('HALO',26,'SUBMITTED',{level:1,service_id:null,ownership_promise:true,evidence_asset_ids:[id(30)],rule_version:'rule-v1',review:null,valid_from:null,valid_until:null},null),base('APPEAL',27,'SUBMITTED',{target_id:id(22),target_sha256:hash,reason:'原拒绝的异议',evidence_asset_ids:[id(30)],review:null},null)]
  for(const r of records)assert.ok(api.isArtistRecord(r),r.kind)
  for(const change of [p=>p.age_band='UNKNOWN',p=>p.identity_valid_until=null,p=>p.owner_party_id='bad']){const p=person();change(p);assert.equal(api.isArtistPerson(p),false)}
  const a=avatar();a.data.long_lived_model_status='READY';assert.equal(api.isArtistAvatar(a),false)
 })
 test('HALO_REVIEW按真人办理且不填数字人，冻结服务规格结构必须一致',async()=>{
  assert.ok(api.isArtistRecord(service('HALO_REVIEW')));assert.ok(api.isArtistServices(services()))
  for(const change of [r=>r.avatar_id=id(11),r=>r.data.auto_debit_enabled=true,r=>r.data.price_minor=10.5,r=>r.data.specification.service.kind='AVATAR_CREATION']){const r=service('HALO_REVIEW');change(r);assert.equal(api.isArtistRecord(r),false)}
  const r={...service(),order:{id:id(50),current_status:'PAID',financial:{received_minor:8700,refunded_minor:1000,net_minor:7700}}};assert.ok(api.isArtistServiceDetail(r));r.order.financial.net_minor++;assert.equal(api.isArtistServiceDetail(r),false)
 })
 test('主体与账号请求分别传身份；目录/服务/独审无acting且全部no-store',async()=>{
  const calls=[];globalThis.fetch=async(url,o)=>{calls.push({url,o});const i=o.headers['X-Acting-Party']?who:reviewer;return response(url.endsWith('/services')?services():{items:[],next_cursor:null},i)}
  await api.listArtistPeople(who,id(90));await api.listArtistRecords(who,id(10),'LOOK');await api.getArtistServices(reviewer);await api.listArtistReviews(reviewer,'CONSENT');await api.listArtistCatalog(reviewer,{city:'上海',tag:'表演',audition:'true'})
  assert.equal(calls[0].o.headers['X-Acting-Party'],id(2));assert(calls[0].url.includes('cursor='+id(90)));assert.equal(calls[1].o.headers['X-Acting-Party'],id(2));assert(calls.slice(2).every(c=>c.o.headers['X-Acting-Party']===undefined));assert(calls.every(c=>c.o.cache==='no-store'))
  await assert.rejects(api.getArtistServices(who),e=>e.code==='CLIENT_IDENTITY_REQUIRED')
 })
 test('GET严格核对meta、person/record关联和ETag，错误版本不采用',async()=>{
  globalThis.fetch=async()=>response(consent());assert.equal((await api.getArtistRecord(who,id(10),id(20))).id,id(20))
  for(const data of [response(consent(),{...who,partyId:id(90)}),response({...consent(),person_id:id(90)}),response(consent(),who,99),response(consent(),{...who,accountId:id(90)})]){globalThis.fetch=async()=>data;await assert.rejects(api.getArtistRecord(who,id(10),id(20)),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE')}
  await assert.rejects(api.getArtistRecord(who,id(10),'bad'))
 })
 test('审核/results按账号且保留If-Match，拒绝错记录与错kind',async()=>{
  const calls=[];globalThis.fetch=async(url,o)=>{calls.push({url,o});return response(consent(),reviewer)}
  await api.postArtist(reviewer,{...command(),path:`/artists/people/${id(10)}/records/${id(20)}/reviews`,targetId:id(20),version:2,body:{decision:'APPROVE',reason:'原材料核对'}},'original-key')
  assert.equal(calls[0].o.headers['X-Acting-Party'],undefined);assert.equal(calls[0].o.headers['If-Match'],'"2"');assert.equal(calls[0].o.headers['Idempotency-Key'],'original-key')
  await assert.rejects(api.postArtist(who,{...command(),targetId:id(99)},'original-key'),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE')
 })
 test('原文件以Blob上传，核对真实归属、字节、用途、媒体与SHA',async()=>{
  const blob=new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'}),stored=await asset(blob),calls=[]
  globalThis.fetch=async(url,o)=>{calls.push({url,o});return response(stored)}
  const c={path:`/artists/people/${id(10)}/assets?purpose=AVATAR_MATERIAL&media_type=image%2Fpng`,personId:id(10),ownerPartyId:id(2),resultKind:'ASSET',label:'原素材',blob,purpose:'AVATAR_MATERIAL',mediaType:'image/png'}
  assert.equal((await api.postArtist(who,c,'same-upload')).id,stored.id);assert.equal(calls[0].o.body,blob);assert.equal(calls[0].o.headers['Content-Type'],'application/octet-stream')
  globalThis.fetch=async()=>response({...stored,content_sha256:hash});await assert.rejects(api.postArtist(who,c,'same-upload'),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE')
  globalThis.fetch=async()=>response({...stored,owner_party_id:id(90)});await assert.rejects(api.postArtist(who,c,'same-upload'))
 })
 test('503未知恢复保留原body/key/version；原输入后来改动不改变原请求',async()=>{
  const {ui,scope}=state(),calls=[];let posts=0;globalThis.fetch=async(url,o)=>{calls.push({url,o});return o.method==='POST'?++posts===1?failure(503,'SERVICE_UNAVAILABLE'):response(consent()):response(url.includes('?')?{items:[consent()],next_cursor:null}:consent())}
  const c=command();c.version=4;await ui.write(c);assert.equal(ui.pending.value.state,'unknown');const key=ui.pending.value.key;c.body.consent.terms='后改内容';await ui.retry();assert.equal(posts,1);await ui.checkPending();assert(ui.pending.value.checked);await ui.retry();assert.equal(ui.pending.value,null);const writes=calls.filter(c=>c.o.method==='POST');assert.equal(writes.length,2);assert.equal(writes[0].o.body,writes[1].o.body);assert.equal(writes[1].o.headers['Idempotency-Key'],key);assert.equal(writes[1].o.headers['If-Match'],'"4"');scope.stop()
 })
 test('409上传待核对也是未知结果，保留同一Blob/key并先查当前状态',async()=>{
  const blob=new Blob(['original-private-file']),stored=await asset(blob,'AVATAR_MATERIAL','text/plain'),{ui,scope}=state(),calls=[];let posts=0
  const c={path:`/artists/people/${id(10)}/assets?purpose=AVATAR_MATERIAL&media_type=text%2Fplain`,personId:id(10),ownerPartyId:id(2),resultKind:'ASSET',label:'原文件',blob,purpose:'AVATAR_MATERIAL',mediaType:'text/plain'}
  globalThis.fetch=async(url,o)=>{calls.push({url,o});return o.method==='POST'?++posts===1?failure(409,'ASSET_UPLOAD_RECONCILIATION_REQUIRED'):response(stored):response(url.includes('/assets/')?stored:detail())}
  await ui.write(c);assert.equal(ui.pending.value.command.blob,blob);const key=ui.pending.value.key;await ui.checkPending();await ui.retry();assert.equal(ui.pending.value,null);const writes=calls.filter(c=>c.o.method==='POST');assert.equal(writes[1].o.body,blob);assert.equal(writes[1].o.headers['Idempotency-Key'],key);assert(outcomeUnknown(new ApiError({status:409,code:'ASSET_UPLOAD_RECONCILIATION_REQUIRED',message:'待核对'})));scope.stop()
 })
 test('POST已有编号但GET失败时只继续GET，不重新POST或建立第二份记录',async()=>{
  const {ui,scope}=state();let posts=0;globalThis.fetch=async(url,o)=>o.method==='POST'?(posts++,response(consent())):failure(503,'SERVICE_UNAVAILABLE');await ui.write(command());assert.equal(ui.pending.value.resultId,id(20));assert.equal(ui.record.value.id,id(20));globalThis.fetch=async()=>response(consent());await ui.checkPending();assert.equal(posts,1);assert.equal(ui.pending.value,null);scope.stop()
 })
 test('412保留原输入对象，重读最新记录并要求再次明确确认',async()=>{
  const {ui,scope}=state();let posts=0;const c={...command(),path:`/artists/people/${id(10)}/records/${id(20)}/withdrawals`,targetId:id(20),version:2,body:{reason:'保留本人原理由'}}
  globalThis.fetch=async(url,o)=>o.method==='POST'?(posts++,failure(412,'VERSION_CONFLICT')):response({...consent(),object_version:3});await ui.write(c);assert.equal(ui.pending.value,null);assert.equal(ui.conflicted.value,true);assert.equal(ui.reconfirmed.value,false);assert.equal(ui.record.value.object_version,3);assert.equal(c.body.reason,'保留本人原理由');await ui.write(c);assert.equal(posts,1);ui.reconfirmed.value=true;await ui.write({...c,version:3});assert.equal(posts,2);scope.stop()
 })
 test('401/403/404或委托撤销清本人、记录、原请求及私有预览',async()=>{
  for(const status of [401,403,404]){const {ui,scope}=state();ui.person.value=detail();ui.record.value=consent();ui.catalog.value=[catalog()];ui.assets.value=[{id:id(31)}];globalThis.fetch=async()=>failure(status,'ARTIST_DELEGATION_INACTIVE');await ui.write(command());assert.equal(ui.person.value,null);assert.equal(ui.record.value,null);assert.deepEqual(ui.assets.value,[]);assert.deepEqual(ui.catalog.value,[]);assert.equal(ui.pending.value,null);scope.stop()}
 })
 test('身份A→B→A、会话修订、退出及换页，迟到响应不能恢复私有资料',async()=>{
  for(const change of [c=>{c.partyId=id(99);c.partyId=id(2)},c=>c.token=null,c=>c.revision++,c=>c.scope='other']){const {ui,context,scope}=state(),late=defer();globalThis.fetch=()=>late.promise;const waiting=ui.loadPerson(id(10));change(context);late.resolve(response(detail()));await waiting;assert.equal(ui.person.value,null);scope.stop()}
 })
 test('同页重复读取采用最新请求；旧403不能清掉新记录',async()=>{
  const {ui,scope}=state(),a=defer(),b=defer();let n=0;globalThis.fetch=()=>++n===1?a.promise:b.promise;const old=ui.loadRecord(id(10),id(20)),fresh=ui.loadRecord(id(10),id(22));a.resolve(failure(403,'ARTIST_REVIEW_FORBIDDEN'));await old;b.resolve(response(listing()));await fresh;assert.equal(ui.record.value.id,id(22));assert.equal(ui.error.value,null);scope.stop()
 })
 test('目录和长列表分页，重复cursor不能陷入循环或重复显示',async()=>{
  const {ui,scope}=state();globalThis.fetch=async()=>response({items:[person()],next_cursor:id(90)});await ui.loadPeople();await ui.loadPeople(true);assert.equal(ui.people.value.length,1);assert.equal(ui.error.value.code,'UNEXPECTED_RESPONSE_SHAPE');scope.stop()
 })
 test('私有字节核对大小与SHA；目录和独审材料每次重新GET且无acting',async()=>{
  const blob=new Blob([new Uint8Array([137,80,78,71,13,10,26,10])]),stored=await asset(blob),calls=[];globalThis.fetch=async(url,o)=>{calls.push({url,o});return new Response(blob,{headers:{'Content-Type':'application/octet-stream'}})}
  assert.equal((await api.artistAssetBytes(who,stored)).type,'image/png');await api.artistReviewBytes(reviewer,id(10),id(20),id(31));await api.artistCatalogBytes(reviewer,id(22),id(31));await api.artistCatalogBytes(reviewer,id(22),id(31));assert.equal(calls.length,4);assert(calls.slice(1).every(c=>c.o.headers['X-Acting-Party']===undefined));assert(calls.every(c=>c.o.cache==='no-store'));await assert.rejects(api.artistAssetBytes(who,{...stored,content_sha256:hash}))
 })
 test('替换预览、撤权或上下文切换立即回收BlobURL，不执行HTML内容',async()=>{
  const {ui,context,scope}=state(true),blob=new Blob(['<script>private</script>'],{type:'application/octet-stream'}),oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL,created=[],revoked=[]
  URL.createObjectURL=()=>{const u='blob:isolated-'+created.length;created.push(u);return u};URL.revokeObjectURL=u=>revoked.push(u)
  try{globalThis.fetch=async()=>new Response(blob);await ui.previewCatalog(id(22),id(31));assert.equal(ui.preview.value.type,'application/octet-stream');await ui.previewCatalog(id(22),id(31));assert.deepEqual(revoked,['blob:isolated-0']);context.revision++;assert.equal(ui.preview.value,null);assert.deepEqual(revoked,['blob:isolated-0','blob:isolated-1']);globalThis.fetch=async()=>failure(403,'ARTIST_CONSENT_REQUIRED');await ui.previewCatalog(id(22),id(31));assert.equal(ui.preview.value,null);assert.equal(ui.catalog.value.length,0)}finally{scope.stop();URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke}
 })
 test('同意撤回或托管过期以409拒绝预览时同步清除已过期目录与私有详情',async()=>{
  for(const code of ['ARTIST_CONSENT_REQUIRED','ARTIST_HOSTING_REQUIRED']){const {ui,scope}=state(true);ui.catalog.value=[catalog()];ui.record.value=consent();globalThis.fetch=async()=>failure(409,code);await ui.previewCatalog(id(22),id(31));assert.equal(ui.catalog.value.length,0);assert.equal(ui.record.value,null);assert.equal(ui.preview.value,null);assert.equal(ui.error.value.code,code);scope.stop()}
 })
 test('十四类领域表单不使用原始JSON，不预先勾选同意，L3和长期模型不启用',async()=>{
  const {default:Form}=await server.ssrLoadModule('/src/components/artists/ArtistForm.vue')
  for(const action of ['PERSON','AVATAR','IDENTITY','CONSENT','DELEGATION','VARIANT','HALO','LISTING','SERVICE','SUPPLEMENT','APPEAL','WITHDRAW','REVIEW','RESULT']){const html=await renderToString(createSSRApp({render:()=>h(Form,{action,disabled:false,person:detail(),services:services(),record:consent()})}));assert(html.includes('artists-form-'+action));assert.equal(html.includes('原始JSON'),false);assert.equal(/type="checkbox"[^>]*checked/.test(html),false);assert.equal(/<option value="3"/.test(html),false);if(action==='CONSENT')assert.match(html,/<input[^>]*disabled[^>]*value="LONG_LIVED_MODEL"|<input[^>]*value="LONG_LIVED_MODEL"[^>]*disabled/)}
 })
 test('SERVICE表单真实HALO_REVIEW提交null数字人及false提醒，已审规格不填价',async()=>{
  const {default:Form}=await server.ssrLoadModule('/src/components/artists/ArtistForm.vue'),s=services();s.offers.items=[{...s.offers.items[0],specification:spec('HALO_REVIEW'),price_minor:1000,product_profile:{version:'V5',type:'HALO_REVIEW'}}];let vm
  const app=createSSRApp({render:()=>h(Form,{action:'SERVICE',disabled:false,person:detail(),services:s})});app.mixin({created(){if(this.$options.__name==='ArtistForm')vm=this.$.setupState}});await renderToString(app);vm.form.spec_id=id(40);vm.form.renewal_reminder='true';assert.deepEqual(vm.payload,{avatar_id:null,spec_id:id(40),renewal_reminder:false});assert.equal(vm.fields.some(f=>f.key==='avatar_id'),false);assert.equal(vm.fields.some(f=>f.key==='price_minor'),false)
 })
 test('本人同意的实际表单逐项选定，checkbox数组替换后立即更新准确payload',async()=>{
  const {default:Form}=await server.ssrLoadModule('/src/components/artists/ArtistForm.vue');let vm
  const app=createSSRApp({render:()=>h(Form,{action:'CONSENT',disabled:false,person:detail()})});app.mixin({created(){if(this.$options.__name==='ArtistForm')vm=this.$.setupState}});await renderToString(app)
  Object.assign(vm.form,{avatar_id:id(11),grantee_party_id:id(2),territories:'CN',valid_from:'2026-10-01T00:00',valid_until:'2030-10-01T00:00',terms:'本人明确的原用途',evidence_asset_ids:id(30)})
  assert.equal(vm.payload,null);vm.selectedFeatures=['FACE'];vm.selectedPurposes=['PRIVATE_ARCHIVE'];assert.deepEqual(vm.payload.consent.features,['FACE']);vm.selectedFeatures=['FACE','VOICE'];vm.selectedPurposes=['PUBLIC_DISPLAY'];assert.deepEqual(vm.payload.consent.features,['FACE','VOICE']);assert.deepEqual(vm.payload.consent.purposes,['PUBLIC_DISPLAY']);assert.equal(vm.form.terms,'本人明确的原用途');assert.equal(vm.confirmed.checked,false)
 })
 test('异步读取签名时换身份，迟到Blob不能创建或恢复预览',async()=>{
  const {ui,context,scope}=state(true),entered=defer(),finish=defer(),oldArrayBuffer=Blob.prototype.arrayBuffer,oldCreate=URL.createObjectURL;let creations=0
  Blob.prototype.arrayBuffer=function(){entered.resolve();return finish.promise};URL.createObjectURL=()=>{creations++;return 'blob:must-not-exist'}
  try{globalThis.fetch=async()=>({ok:true,status:200,headers:new Headers({'Content-Type':'application/octet-stream'}),blob:async()=>new Blob(['private'])});const waiting=ui.previewCatalog(id(22),id(31));await entered.promise;context.partyId=id(99);finish.resolve(new Uint8Array([137,80,78,71]).buffer);await waiting;assert.equal(creations,0);assert.equal(ui.preview.value,null)}finally{scope.stop();Blob.prototype.arrayBuffer=oldArrayBuffer;URL.createObjectURL=oldCreate}
 })
 test('记录按纯文本展示，退款待办与实退分开，原订单仅采用服务详情真实关联',async()=>{
  const {default:Panel}=await server.ssrLoadModule('/src/components/artists/ArtistRecordPanel.vue'),r=service();r.current_status='REFUND_REQUIRED';r.data.refund={order_id:id(50),amount_minor:8700,status:'REQUEST_REQUIRED'};const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{render:()=>null}}]});await router.push('/artists/people');await router.isReady();const render=(record,service)=>renderToString(createSSRApp({render:()=>h(Panel,{record,service})}).use(router));const html=await render(r,{...r,order:{id:id(50),current_status:'PAID',financial:{received_minor:8700,refunded_minor:0,net_minor:8700}}});assert(html.includes('原订单退款待办理'));assert(html.includes('artists-original-order'));assert(html.includes('¥87.00'));assert(html.includes('artistService='+id(23)));const escaped=await render(consent());assert(escaped.includes('&lt;script&gt;literal&lt;/script&gt;'));assert.equal(escaped.includes('<script>literal</script>'),false);assert.equal((await render(r)).includes('尚未关联正式订单'),false)
 })
 test('所有新路由安全登录返回；43入口保留旧41且每页只有一个实际高亮',async()=>{
  const paths=['/artists/people','/artists/people/new','/artists/catalog','/artists/services',`/artists/people/${id(10)}`,`/artists/people/${id(10)}/records/${id(20)}`,...['avatars','identity','consents','delegations','variants','halos','listings','services'].map(a=>`/artists/people/${id(10)}/${a}/new`),...Object.keys(api.reviewKinds).flatMap(k=>[`/artists/reviews/${k}`,`/artists/reviews/${k}/people/${id(10)}/records/${id(20)}`])]
  for(const path of paths){assert.equal(loginRedirect(path),path);const router=createRouter({history:createMemoryHistory(),routes:[...artistsRoutes,{path:'/:pathMatch(.*)*',component:{render:()=>null}}]});await router.push(path);await router.isReady();assert(router.currentRoute.value.name,path);const html=await renderToString(createSSRApp({render:()=>h(RouterView)}).use(createPinia()).use(router)),nav=html.match(/<nav\b[^>]*aria-label="工作区导航"[^>]*>([\s\S]*?)<\/nav>/)?.[1];assert(nav);if(path==='/artists/catalog'){assert.equal(html.includes('<option value="false"'),false);assert.ok(html.includes('<option value="true"'))}const links=[...nav.matchAll(/<a\b([^>]*)>/g)];assert.equal(links.length,43);assert.deepEqual(links.filter(([,attrs])=>attrs.includes('aria-current="page"')).map(([,attrs])=>attrs.match(/href="([^"]+)"/)[1]),[path.startsWith('/artists/reviews/')?'/artists/reviews/CONSENT':'/artists/people']);for(const old of ['账号与机构','故事收件与受理','合同与规则','供给申请','独立财务核验','项目独立核验'])assert(nav.includes(old))}
  const quote=`/trade/quotes/new?artistService=${id(23)}&personId=${id(10)}`;assert.equal(loginRedirect(quote),quote)
  for(const bad of ['/artists','/artists/people/bad','/artists/reviews/ADMIN','/artists/people?grant=REVIEW',`/artists/people/${id(10)}/identity/new?verified=true`,`/trade/quotes/new?artistService=${id(23)}&grant=REVIEW`,'//external/artists/catalog'])assert.equal(loginRedirect(bad),'/workspace')
 })
 test('本人、受托机构和独审实际View采用各自上下文与表单边界',async()=>{
  const {useSessionStore}=await server.ssrLoadModule('/src/stores/session.ts'),pinia=createPinia(),session=useSessionStore(pinia);session.token=who.token;session.account={id:id(1),display_name:'本次账号',current_status:'ACTIVE',object_version:1,allowed_actions:[]};session.parties=[{party:{id:id(2),kind:'PERSON',current_status:'ACTIVE',display_name:'本人',object_version:1,capabilities:[],allowed_actions:[]},membership:{id:id(80),account_id:id(1),party_id:id(2),current_status:'ACTIVE',roles:['OWNER'],object_version:1,allowed_actions:[]}}];session.selectParty(id(2))
  const router=createRouter({history:createMemoryHistory(),routes:[...artistsRoutes,{path:'/:pathMatch(.*)*',component:{render:()=>null}}]});await router.push(`/artists/people/${id(10)}/consents/new`);await router.isReady();let vm;const app=createSSRApp({render:()=>h(RouterView)}).use(pinia).use(router);app.mixin({created(){if(this.$options.__name==='ArtistsView')vm=this.$.setupState}});await renderToString(app);globalThis.fetch=async()=>response(detail());await vm.loadPage();assert.equal(vm.self,true);assert.equal(vm.canWrite,true);session.parties[0].party.kind='ORGANIZATION';assert.equal(vm.canWrite,false);assert.equal(vm.commandFor('CONSENT',{x:'actual'}).ownerPartyId,id(2));await router.push(`/artists/reviews/CONSENT/people/${id(10)}/records/${id(20)}`);await renderToString(app);globalThis.fetch=async()=>response({...consent(),current_status:'SUBMITTED'},reviewer);await vm.loadPage();vm.inlineAction='REVIEW';assert.equal(vm.canWrite,true);const calls=[];globalThis.fetch=async(url,o)=>{calls.push({url,o});return response(consent(),reviewer)};await vm.submit({decision:'APPROVE',reason:'独立核验原内容'});assert.equal(calls.find(c=>c.o.method==='POST').o.headers['X-Acting-Party'],undefined);session.token=null
 })
 test('PENDING_REVIEW个人和机构主体的有效OWNER仍实际读取本人或获托名单',async()=>{
  const {useSessionStore}=await server.ssrLoadModule('/src/stores/session.ts')
  for(const kind of ['PERSON','ORGANIZATION']){
   const pinia=createPinia(),session=useSessionStore(pinia);session.token=who.token;session.account={id:id(1),display_name:'实际有效成员',current_status:'ACTIVE',object_version:1,allowed_actions:[]};session.parties=[{party:{id:id(2),kind,current_status:'PENDING_REVIEW',display_name:'待审主体',object_version:1,capabilities:[],allowed_actions:[]},membership:{id:id(80),account_id:id(1),party_id:id(2),current_status:'ACTIVE',roles:['OWNER'],object_version:1,allowed_actions:[]}}];session.selectParty(id(2))
   const router=createRouter({history:createMemoryHistory(),routes:[...artistsRoutes,{path:'/:pathMatch(.*)*',component:{render:()=>null}}]});await router.push('/artists/people');await router.isReady();let vm;const app=createSSRApp({render:()=>h(RouterView)}).use(pinia).use(router);app.mixin({created(){if(this.$options.__name==='ArtistsView')vm=this.$.setupState}});await renderToString(app);const calls=[];globalThis.fetch=async(url,o)=>{calls.push({url,o});return response({items:[{...person(),owner_party_id:kind==='PERSON'?id(2):id(9)}],next_cursor:null})};await vm.loadPage();assert.equal(vm.ownerActive,true);assert.equal(vm.people.length,1);assert.equal(calls.length,1);assert(calls[0].url.startsWith('/api/v1/artists/people?'));assert.equal(calls[0].o.headers['X-Acting-Party'],id(2));session.parties[0].party.current_status='SUSPENDED';assert.equal(vm.ownerActive,false);session.token=null
  }
 })
 for(const {name,run}of tests){await run();console.log(`✓ ${name}`)}console.log(`\n${tests.length} artists checks passed.`)
}finally{globalThis.fetch=originalFetch;if(oldStorage)Object.defineProperty(globalThis,'sessionStorage',oldStorage);else delete globalThis.sessionStorage;await server.close()}
