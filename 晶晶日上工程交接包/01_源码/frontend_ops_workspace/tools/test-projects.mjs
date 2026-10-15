import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {readFile} from 'node:fs/promises'
import {createServer} from 'vite'
import vue from '@vitejs/plugin-vue'
import {createSSRApp,effectScope,h,reactive} from 'vue'
import {renderToString} from '@vue/server-renderer'
import {createPinia} from 'pinia'
import {createMemoryHistory,createRouter,RouterView} from 'vue-router'
const root=fileURLToPath(new URL('..',import.meta.url))
const server=await createServer({root,configFile:false,plugins:[vue()],resolve:{alias:{'@':root+'/src'}},server:{middlewareMode:true},appType:'custom'})
const originalFetch=globalThis.fetch,id=n=>String(n).padStart(8,'0')+'-0000-4000-8000-000000000001'
const who={token:'projects-private-test',accountId:id(1),partyId:id(2)},reviewer={...who,partyId:null},hash='a'.repeat(64)
const scope=()=>({purpose:'RELEASE',territory:'CN',language:'zh',valid_until:'2030-10-03T00:00:00.000Z'})
const base=(kind,n,status,data)=>({id:id(n),kind,project_id:['PROJECT','CHANNEL'].includes(kind)?null:id(10),owner_party_id:id(2),created_by:id(1),current_status:status,object_version:1,content_sha256:hash,data})
const signers=()=>[{party_id:id(2),responsibility:'发起方准确权利确认',after_party_ids:[]},{party_id:id(3),responsibility:'本人角色内容确认',after_party_ids:[id(2)]}]
const project=()=>base('PROJECT',10,'PREPARING',{title:'真实项目 <script>private</script>',scope:scope(),current_plan_id:id(13),current_edition_id:null,cancel_reason:null})
const role=()=>base('ROLE',11,'OPEN',{title:'真实招募角色',capacity:1,pricing:'FIXED',amount_minor:12505,terms:'原角色条款 <script>private</script>'})
const candidate=()=>base('CANDIDATE',12,'CONFIRMED',{role_id:id(11),avatar_id:id(30),consent_id:id(31),amount_minor:12505,note:'实际报名材料说明',terms:role().data.terms,final_confirmed_by:id(1)})
const plan=()=>base('PLAN',13,'APPROVED',{production_project_id:id(40),rights:['FACE_VOICE','ORIGINAL','SCRIPT','MUSIC','ADAPTATION','FINAL'].map(layer=>({layer,holder_party_id:id(2),evidence_asset_id:id(32),purpose:'RELEASE',territory:'CN',valid_until:scope().valid_until,terms:'真实六层条款 <script>private</script>'})),confirmers:signers(),funding:[{candidate_id:id(12),order_id:id(41),line_id:'role-other-line'}],terms:'明确方案原条款',roster_sha256:hash,review:null})
const edition=()=>base('EDITION',14,'IN_REVIEW',{plan_id:id(13),final_version_id:id(42),final_content_sha256:hash,material_asset_ids:[id(32)],confirmers:signers(),note:'本版准确成片与实际材料',review:null})
const channel=()=>base('CHANNEL',15,'IN_REVIEW',{name:'真实渠道',channel_reference:'actual-channel-reference',submission_requirements:'渠道实际条款',evidence_asset_id:id(32),review:null})
const release=()=>base('RELEASE',16,'INTERNAL_PENDING',{edition_id:id(14),channel_id:id(15),prior_release_id:null,material_asset_ids:[id(32)],note:'本次实际送出申请',review:null,last_external_event_id:null})
const external=()=>base('EXTERNAL_EVENT',17,'IN_REVIEW',{release_id:id(16),outcome:'PUBLISHED',external_reference:'actual-external-ref',occurred_at:'2026-10-01T12:00:00.000Z',evidence_asset_id:id(32),note:'实际外部结果待核验',review:null,provenance:'EXTERNAL_MANUAL_EVIDENCE'})
const asset=()=>({id:id(32),owner_party_id:id(2),purpose:'RIGHTS_EVIDENCE',media_type:'text/plain',byte_size:7,content_sha256:hash,current_status:'READY'})
const catalogue=()=>({items:[{id:id(10),kind:'PROJECT',title:project().data.title,scope:scope(),channel_reference:null,roles:[{id:id(11),object_version:7,...role().data}]},{id:id(15),kind:'CHANNEL',title:'实际已核验渠道',scope:null,channel_reference:'actual-channel-reference',roles:[]}]})
const confirmation=(party=id(2))=>({party_id:party,account_id:id(1),content_sha256:hash,decision:'APPROVED',reason:'本方准确决定'})
const response=(data,i=who)=>new Response(JSON.stringify({meta:{request_id:'projects-test',actor:{account_id:i.accountId},acting_party:i.partyId},data}),{status:200,headers:{'Content-Type':'application/json'}})
const failure=(status,code)=>new Response(JSON.stringify({error:{code,message:'test',retryable:false,details:[]}}),{status,headers:{'Content-Type':'application/json'}})
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
const tests=[],test=(name,run)=>tests.push({name,run})
try{
 const api=await server.ssrLoadModule('/src/api/modules/projects.ts')
 const {useProject}=await server.ssrLoadModule('/src/composables/useProjects.ts')
 const {projectsRoutes}=await server.ssrLoadModule('/src/router/projectsRoutes.ts')
 const {loginRedirect}=await server.ssrLoadModule('/src/router/loginRedirect.ts')
 const {explainError}=await server.ssrLoadModule('/src/api/errors.ts')
 const state=(admin=false)=>{const context=reactive({...admin?reviewer:who,revision:0,scope:'projects'}),effect=effectScope(),ui=effect.run(()=>useProject(()=>context));return {ui,context,effect}}
 const command=()=>({path:'/projects/projects/'+id(10)+'/plans',body:{production_project_id:id(40),rights:plan().data.rights,confirmers:signers(),funding:plan().data.funding,terms:'原准确方案'},version:2,targetId:id(10),projectId:id(10),resultKind:'PLAN',label:'提交方案'})
 const confirmCommand=()=>({path:'/projects/records/'+id(13)+'/confirmations',body:{content_sha256:hash,decision:'APPROVED',reason:'本方准确决定'},version:1,targetId:id(13),projectId:id(10),resultKind:'PLAN',label:'确认本版',confirmation:true})
 test('八类真实DTO逐kind严格解析；六层、整数金额、指纹及手工核验准确',()=>{
  for(const make of [project,role,candidate,plan,edition,channel,release,external])assert.ok(api.isProjectRecord(make()),make().kind)
  for(const mutate of [r=>r.allowed_actions=['PROJECT_REVIEW'],r=>r.data.scope.valid_until='2030-02-30T00:00:00.000Z',r=>r.data.scope.purpose='COMMERCIAL',r=>r.project_id=id(99),r=>r.data.created_at='fake']){const r=project();mutate(r);assert.equal(api.isProjectRecord(r),false)}
  for(const mutate of [r=>r.data.rights[5].layer='MUSIC',r=>r.data.rights[0].terms='',r=>r.data.confirmers[0].after_party_ids=[id(3),id(3)],r=>r.data.review={decision:'APPROVED',reason:'fake',verification:{identity_verified:true},reviewer_account_id:id(4),method:'MANUAL_EVIDENCE_REVIEW'}]){const r=plan();mutate(r);assert.equal(api.isProjectRecord(r),false)}
  for(const amount of [-1,0.1,Number.MAX_SAFE_INTEGER]){const r=candidate();r.data.amount_minor=amount;assert.equal(api.isProjectRecord(r),false)}
  const quote=role();quote.data.pricing='QUOTE';quote.data.amount_minor=null;assert.ok(api.isProjectRecord(quote));quote.data.amount_minor=0;assert.equal(api.isProjectRecord(quote),false)
  const e=edition();e.data.final_content_sha256='fake';assert.equal(api.isProjectRecord(e),false)
 })
 test('公开目录只取角色版本与摘要，拒绝候选、身份、证据及额外私有字段',()=>{
  assert.ok(api.isCatalogue(catalogue()))
  for(const mutate of [r=>r.items[0].candidates=[candidate()],r=>r.items[0].roles[0].evidence_asset_id=id(32),r=>r.items[0].roles[0].object_version=0,r=>r.items[0].roles[0].amount_minor=null,r=>r.items[1].scope=scope()]){const c=catalogue();mutate(c);assert.equal(api.isCatalogue(c),false)}
 })
 test('元转整数分无浮点舍入、空白无价格；零元须明确输入',()=>{
  for(const [s,n] of [['0',0],['0.01',1],['125.05',12505],['9000000000.00',900000000000]])assert.equal(api.parseMoney(s),n)
  for(const s of ['', ' ', '-1','1.005','1e3','01.2','9000000000.01'])assert.equal(api.parseMoney(s),null)
 })
 test('列表实际cursor/limit及kind范围；普通身份带party，独立核验不带party',async()=>{
  const calls=[];globalThis.fetch=async(url,o)=>{calls.push({url,o});return response({items:[],next_cursor:null},o.headers['X-Acting-Party']?who:reviewer)}
  await api.listProjects(who,undefined,undefined,id(90))
  for(const kind of ['ROLE','CANDIDATE','PLAN','EDITION','RELEASE','EXTERNAL_EVENT'])await api.listProjects(reviewer,id(10),kind)
  assert.equal(calls[0].url,'/api/v1/projects/projects?limit=20&cursor='+id(90));assert.ok(calls.slice(1).every(c=>!c.o.headers['X-Acting-Party']));assert.ok(calls.every(c=>c.o.cache==='no-store'))
  globalThis.fetch=async()=>response({items:[{...plan(),project_id:id(99)}],next_cursor:null});await assert.rejects(api.listProjects(who,id(10),'PLAN'),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE')
  globalThis.fetch=async()=>response({items:[candidate()],next_cursor:null});await assert.rejects(api.listProjects(who,id(10),'PLAN'),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE')
 })
 test('目录仅账号请求、读取与会签回复核验actor和当前party；wrong ID/kind不接受',async()=>{
  let call;globalThis.fetch=async(url,o)=>{call={url,o};return response(catalogue(),reviewer)};await api.projectCatalogue(who);assert.equal(call.o.headers['X-Acting-Party'],undefined);assert.equal(call.url,'/api/v1/projects/catalogue')
  for(const bad of [()=>response(plan(),reviewer),()=>response({...plan(),id:id(99)}),()=>response(edition())]){globalThis.fetch=async()=>bad();await assert.rejects(api.getProject(who,id(13),'PLAN'),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE')}
  globalThis.fetch=async()=>response({items:[{...confirmation(),created_at:'fake'}]});await assert.rejects(api.projectConfirmations(who,id(13)),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE')
 })
 test('15个POST均传原内容、key与If-Match，独审完全不传party',async()=>{
  const commands=[
   {path:'/projects/projects',body:{title:'真实项目',scope:scope()},record:project()},
   {path:'/projects/projects/'+id(10)+'/roles',targetId:id(10),body:role().data,record:role()},
   {path:'/projects/roles/'+id(11)+'/invitations',targetId:id(11),body:{invitee_party_id:id(3)},record:candidate()},
   {path:'/projects/roles/'+id(11)+'/applications',targetId:id(11),body:{avatar_id:id(30),consent_id:id(31),amount_minor:12505,note:'本人报名'},record:candidate()},
   {path:'/projects/candidates/'+id(12)+'/responses',targetId:id(12),body:{decision:'DECLINE',avatar_id:null,consent_id:null,amount_minor:null,note:'真实谢绝'},record:candidate()},
   {path:'/projects/candidates/'+id(12)+'/decisions',targetId:id(12),body:{decision:'CONFIRM',content_sha256:hash,reason:'本人准确确认'},record:candidate()},
   {...command(),record:plan()},
   {path:'/projects/projects/'+id(10)+'/start',targetId:id(10),body:{},record:project()},
   {path:'/projects/projects/'+id(10)+'/editions',targetId:id(10),body:{final_version_id:id(42),material_asset_ids:[id(32)],note:'准确成片'},record:edition()},
   {...confirmCommand(),record:plan()},
   {path:'/projects/projects/'+id(10)+'/cancellation',targetId:id(10),body:{reason:'实际取消'},record:project()},
   {path:'/projects/channels',body:{name:'真实渠道',channel_reference:'actual-reference',submission_requirements:'原实际要求',evidence_asset_id:id(32)},record:channel()},
   {path:'/projects/records/'+id(13)+'/reviews',targetId:id(13),body:{decision:'APPROVED',reason:'实际独立核验',verification:{identity_verified:true,signatures_verified:true,rights_verified:true,production_verified:true}},record:plan(),admin:true},
   {path:'/projects/projects/'+id(10)+'/releases',targetId:id(10),body:{channel_id:id(15),prior_release_id:null,material_asset_ids:[id(32)],note:'首次实际申请'},record:release()},
   {path:'/projects/releases/'+id(16)+'/external-events',targetId:id(16),body:{outcome:'PUBLISHED',external_reference:'actual',occurred_at:'2026-10-01T12:00:00.000Z',evidence_asset_id:id(32),note:'真实外部报告'},record:external()}
  ]
  for(const c of commands){let call;globalThis.fetch=async(url,o)=>{call={url,o};return response(c.record,c.admin?reviewer:who)};await api.postProject(c.admin?reviewer:who,{...c,resultKind:c.record.kind,version:c.targetId?5:undefined,label:'真实操作'},'original-key');assert.equal(call.url,'/api/v1'+c.path);assert.deepEqual(JSON.parse(call.o.body),c.body);assert.equal(call.o.headers['Idempotency-Key'],'original-key');assert.equal(call.o.headers['If-Match'],c.targetId?'"5"':undefined);assert.equal(call.o.headers['X-Acting-Party'],c.admin?undefined:id(2))}
 })
 test('7种GET路径包括受控私有证明，不接受HTML/publicURL且no-store',async()=>{
  const calls=[];globalThis.fetch=async(url,o)=>{calls.push({url,o});return url.includes('/evidence/')?new Response('private',{headers:{'Content-Type':'application/octet-stream'}}):response(url.endsWith('/confirmations')?{items:[confirmation()]}:url.endsWith('/readiness')?{current_status:'BLOCKED',reason_code:'PROJECT_PLAN_REQUIRED'}:plan())}
  await api.getProject(who,id(13),'PLAN');await api.projectConfirmations(who,id(13));const r=await api.projectReadiness(who,id(10));assert.equal(r.reason_code,'PROJECT_PLAN_REQUIRED');assert.equal(await(await api.projectEvidence(reviewer,id(13),id(32))).text(),'private')
  assert.deepEqual(calls.map(c=>c.url),['/api/v1/projects/records/'+id(13),'/api/v1/projects/records/'+id(13)+'/confirmations','/api/v1/projects/projects/'+id(10)+'/readiness','/api/v1/projects/records/'+id(13)+'/evidence/'+id(32)])
  assert.ok(calls.every(c=>c.o.cache==='no-store'));assert.equal(calls[3].o.headers['X-Acting-Party'],undefined)
  globalThis.fetch=async()=>new Response('<html>fake</html>',{headers:{'Content-Type':'text/html'}});await assert.rejects(api.projectEvidence(who,id(13),id(32)),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE')
 })
 test('readiness只返回一个阻止原因，不虚构全量通过或制作完成',async()=>{
  globalThis.fetch=async()=>response({current_status:'AVAILABLE',reason_code:null});assert.equal((await api.projectReadiness(who,id(10))).current_status,'AVAILABLE')
  for(const r of [{current_status:'READY',reason_code:null},{current_status:'BLOCKED',reason_code:null},{current_status:'AVAILABLE',reason_code:'PROJECT_PLAN_REQUIRED'},{current_status:'AVAILABLE',reason_code:null,checks:{all:true}}]){globalThis.fetch=async()=>response(r);await assert.rejects(api.projectReadiness(who,id(10)),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE')}
  assert.match(explainError({status:409,code:'PROJECT_CONFIRMATIONS_REQUIRED',message:'',retryable:false}),/准确内容/)
  assert.match(api.projectStatus({...release(),current_status:'READY_TO_SUBMIT'}),/可向外部送出/)
  assert.match(api.projectStatus(external()),/待独立核验/)
 })
 test('会签必须指定本方、准确hash、批准前置顺序；旧版/拒绝不能解锁',()=>{
  const r=plan();assert.equal(api.confirmationGate(r,id(3),[]).can,false);assert.equal(api.confirmationGate(r,id(3),[confirmation()]).can,true)
  for(const c of [{...confirmation(),content_sha256:'b'.repeat(64)},{...confirmation(),decision:'REJECTED'}])assert.equal(api.confirmationGate(r,id(3),[c]).can,false)
  assert.equal(api.confirmationGate(r,id(99),[]).can,false);assert.equal(api.confirmationGate({...r,current_status:'IN_REVIEW'},id(2),[]).can,false)
  assert.equal(api.confirmationGate(r,id(2),[{...confirmation(),decision:'REJECTED'}]).can,false);assert.equal(api.confirmationGate({...edition(),current_status:'APPROVED'},id(3),[confirmation()]).can,true)
 })
 test('POST确认不升版：必须GET真实确认列表；已知结果核对失败只GET',async()=>{
  const {ui,effect}=state();let posts=0,visible=false,done=0;globalThis.fetch=async(url,o)=>o.method==='POST'?(posts++,response(plan())):response(url.endsWith('/confirmations')?{items:visible?[confirmation()]:[]}:plan())
  await ui.write(confirmCommand(),()=>done++);assert.equal(ui.pending.value.state,'refresh');assert.equal(ui.pending.value.resultId,id(13));assert.equal(done,0)
  visible=true;await ui.retry();assert.equal(ui.pending.value,null);assert.equal(posts,1);assert.equal(done,1);assert.equal(plan().object_version,1);effect.stop()
 })
 test('会签after-commit503以准确party/hash/decision/reason证据结束，不重复写',async()=>{
  const {ui,effect}=state();let posts=0,done=0;globalThis.fetch=async(url,o)=>o.method==='POST'?(posts++,failure(503,'SERVICE_UNAVAILABLE')):response(url.endsWith('/confirmations')?{items:[confirmation()]}:plan())
  await ui.write(confirmCommand(),()=>done++);assert.equal(ui.pending.value.state,'unknown');assert.equal(ui.canNavigate(),false);await ui.checkPending();assert.equal(ui.pending.value,null);assert.equal(posts,1);assert.equal(done,1);effect.stop()
  for(const wrong of [{...confirmation(),reason:'其他理由'},{...confirmation(),decision:'REJECTED'},{...confirmation(),content_sha256:'b'.repeat(64)},{...confirmation(),party_id:id(3)}]){const s=state();globalThis.fetch=async(url,o)=>o.method==='POST'?failure(503,'SERVICE_UNAVAILABLE'):response(url.endsWith('/confirmations')?{items:[wrong]}:plan());await s.ui.write(confirmCommand());await s.ui.checkPending();assert.ok(s.ui.pending.value);assert.equal(s.ui.pending.value.checked,true);s.effect.stop()}
 })
 test('503/网络/断流保留原body/key/version，必须先核对再同key重试且阻止导航',async()=>{
  for(const broken of [()=>failure(503,'SERVICE_UNAVAILABLE'),()=>{throw Error('network')},()=>({ok:true,status:200,headers:new Headers(),text:async()=>{throw Error('stream')}})]){
   const {ui,effect}=state(),calls=[];let posts=0;globalThis.fetch=async(url,o)=>{calls.push({url,o});return o.method==='POST'?++posts===1?broken():response(plan()):response(url.endsWith(id(10))?project():plan())}
   const c=command();await ui.write(c);assert.equal(ui.pending.value.state,'unknown');assert.equal(ui.canNavigate(),false);c.body.terms='later mutation';await ui.retry();assert.equal(posts,1);await ui.checkPending();assert.equal(ui.pending.value.checked,true);await ui.retry()
   const writes=calls.filter(c=>c.o.method==='POST');assert.equal(posts,2);assert.equal(writes[0].o.body,writes[1].o.body);assert.equal(writes[0].o.headers['Idempotency-Key'],writes[1].o.headers['Idempotency-Key']);assert.equal(writes[1].o.headers['If-Match'],'"2"');assert.equal(ui.pending.value,null);effect.stop()
  }
 })
 test('公开报名unknown核对目录版本，不读取尚无授权的私有ROLE；412清旧确认',async()=>{
  const {ui,effect}=state(),calls=[];let posts=0;const c={path:'/projects/roles/'+id(11)+'/applications',targetId:id(11),projectId:id(10),resultKind:'CANDIDATE',version:7,catalogueRecovery:true,label:'本人报名',body:{avatar_id:id(30),consent_id:id(31),amount_minor:12505,note:'本人实际申请'}}
  globalThis.fetch=async(url,o)=>{calls.push({url,o});return o.method==='POST'?++posts===1?failure(503,'SERVICE_UNAVAILABLE'):response(candidate()):url.endsWith('/catalogue')?response(catalogue(),reviewer):url.endsWith(id(12))?response(candidate()):failure(404,'PROJECT_NOT_FOUND')}
  await ui.write(c);await ui.checkPending();assert.ok(ui.pending.value.checked);assert.equal(calls.some(c=>c.url.endsWith('/records/'+id(11))),false);await ui.retry();assert.equal(ui.pending.value,null);effect.stop()
  const s=state();globalThis.fetch=async(url,o)=>o.method==='POST'?failure(412,'VERSION_CONFLICT'):assert.fail('应由页面重读公开目录，不读私有ROLE');await s.ui.write(c);assert.equal(s.ui.pending.value,null);assert.equal(s.ui.conflictRevision.value,1);s.effect.stop()
 })
 test('私有上传503保留同一个Blob，核对原操作后同key重放不新建文件',async()=>{
  const {ui,effect}=state(),blob=new Blob(['private']),calls=[];let posts=0;const path='/supply/assets?purpose=RIGHTS_EVIDENCE&media_type=text%2Fplain'
  globalThis.fetch=async(url,o)=>{calls.push({url,o});return o.method==='POST'?++posts===1?failure(503,'SERVICE_UNAVAILABLE'):response(asset()):url.endsWith('/catalogue')?response(catalogue(),reviewer):response(asset())}
  await ui.write({path,resultKind:'ASSET',label:'上传私有证明',supply:{path,blob,mediaType:'text/plain',purpose:'RIGHTS_EVIDENCE',kind:'ASSET',label:'上传私有证明'}})
  assert.equal(ui.pending.value.command.supply.blob,blob);await ui.checkPending();await ui.retry();const writes=calls.filter(c=>c.o.method==='POST');assert.equal(writes.length,2);assert.ok(writes.every(c=>c.o.body===blob));assert.equal(writes[0].o.headers['Idempotency-Key'],writes[1].o.headers['Idempotency-Key']);assert.equal(ui.pending.value,null);effect.stop()
 })
 test('已知新增记录ID刷新503只GET，412重读新版本并要求重新确认',async()=>{
  const s=state();let posts=0;globalThis.fetch=async(url,o)=>o.method==='POST'?(posts++,response(plan())):failure(503,'SERVICE_UNAVAILABLE');await s.ui.write(command());assert.equal(s.ui.pending.value.resultId,id(13));globalThis.fetch=async()=>response(plan());await s.ui.retry();assert.equal(s.ui.pending.value,null);assert.equal(posts,1);s.effect.stop()
  const t=state();globalThis.fetch=async(url,o)=>o.method==='POST'?failure(412,'VERSION_CONFLICT'):response({...project(),object_version:9});await t.ui.write(command());assert.equal(t.ui.pending.value,null);assert.equal(t.ui.detail.value.object_version,9);assert.equal(t.ui.conflictRevision.value,1);await t.ui.retry();t.effect.stop()
 })
 test('401/403/404立即清私有记录、原上传payload及blobURL，不保留伪成功',async()=>{
  const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;let revokes=0;URL.createObjectURL=()=> 'blob:projects-private';URL.revokeObjectURL=()=>revokes++
  try{for(const status of [401,403,404]){const {ui,effect}=state();ui.detail.value=plan();ui.rows.value=[project()];ui.objectUrl(new Blob(['private']));globalThis.fetch=async()=>failure(status,'PROJECT_NOT_FOUND');await ui.write(command());assert.equal(ui.pending.value,null);assert.equal(ui.detail.value,null);assert.deepEqual(ui.rows.value,[]);effect.stop()}assert.equal(revokes,3)}finally{URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke}
 })
 test('身份A→B→A、会话修订、路由及注销忽略迟到读写和上传回调',async()=>{
  for(const change of [c=>{c.partyId=id(99);c.partyId=id(2)},c=>c.token=null,c=>c.revision++,c=>c.scope='other']){const {ui,context,effect}=state(),late=defer();globalThis.fetch=()=>late.promise;const reading=ui.loadRecord(id(13));change(context);late.resolve(response(plan()));await reading;assert.equal(ui.detail.value,null);effect.stop()}
  const {ui,context,effect}=state(),late=defer();globalThis.fetch=()=>late.promise;const writing=ui.write(command(),()=>assert.fail('late write callback'));context.partyId=id(99);late.resolve(response(plan()));await writing;assert.equal(ui.pending.value,null);assert.equal(ui.detail.value,null);effect.stop()
 })
 test('旧请求403不清新记录；过滤后的空页继续翻页，分页循环拒绝',async()=>{
  const {ui,effect}=state(),first=defer(),second=defer();let reads=0;globalThis.fetch=()=>++reads===1?first.promise:second.promise
  const a=ui.loadRecord(id(13)),b=ui.loadRecord(id(14));first.resolve(failure(403,'PROJECT_PARTY_FORBIDDEN'));await a;second.resolve(response(edition()));await b;assert.equal(ui.detail.value.id,id(14))
  let pages=0;globalThis.fetch=async()=>response(++pages===1?{items:[],next_cursor:id(99)}:{items:[plan()],next_cursor:null});assert.equal((await ui.loadAll(id(10),'PLAN')).length,1)
  globalThis.fetch=async()=>response({items:[plan()],next_cursor:id(99)});assert.equal(await ui.loadAll(id(10),'PLAN'),null);assert.equal(ui.error.value.code,'UNEXPECTED_RESPONSE_SHAPE');effect.stop()
 })
 test('真实SSR事实组件安全转义六层/条款，技术字段折叠，外部报告不冒充发行成功',async()=>{
  const {default:Panel}=await server.ssrLoadModule('/src/components/ProjectRecordPanel.vue')
  for(const r of [project(),role(),plan(),edition(),release(),external()]){const html=await renderToString(createSSRApp({render:()=>h(Panel,{record:r})}));assert.ok(html.includes('<details'));assert.equal(html.includes('<script>private</script>'),false);if(['PROJECT','ROLE','PLAN'].includes(r.kind))assert.ok(html.includes('&lt;script&gt;private&lt;/script&gt;'));if(r.kind==='ROLE')assert.ok(html.includes('125.05'));if(r.kind==='EXTERNAL_EVENT')assert.ok(html.includes('独立核实通过后才改变发行事实'))}
 })
 test('真实六层分组表单无商业默认，OTHER费用来源与确认顺序都显式填写',async()=>{
  const {default:Form}=await server.ssrLoadModule('/src/components/ProjectPlanForm.vue')
  const props={rights:Object.keys(api.layers).map(layer=>({layer,holder:'',purpose:'',territory:'',until:'',terms:'',asset:''})),signers:[{party:'',responsibility:'',after:''}],funding:[],production:'',terms:'',productions:[],orders:[],candidates:[],assets:[],disabled:false}
  const html=await renderToString(createSSRApp({render:()=>h(Form,props)}));assert.equal(html.includes('value="0"'),false);assert.equal(html.includes('checked'),false);assert.ok(html.includes('角色费用的真实订单来源'));assert.ok(html.includes('前置主体编号'));assert.ok(html.includes('待明确选择'))
  for(const layer of Object.keys(api.layers))for(const field of ['holder','asset','purpose','territory','until','terms'])assert.ok(html.includes('right-'+layer+'-'+field))
  const o={id:id(41),kind:'ORDER',current_status:'PAID',data:{quote:{lines:[{line_id:'production-fee',line_kind:'PRODUCTION',title:'不充当角色费',total_minor:12505},{line_id:'role-fee',line_kind:'OTHER',title:'明确实际角色费',total_minor:12505}]}}}
  const filled=await renderToString(createSSRApp({render:()=>h(Form,{...props,funding:[{candidate:id(12),order:id(41),line:''}],orders:[o],candidates:[candidate()]})}));assert.ok(filled.includes('明确实际角色费'));assert.equal(filled.includes('不充当角色费'),false)
 })
 test('全部实际项目路由安全登录返回，SSR25项同菜单且始终唯一正确高亮',async()=>{
  const oldWindow=globalThis.window,oldStorage=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage')
  globalThis.window={setInterval:()=>0,clearInterval:()=>{},addEventListener:()=>{},removeEventListener:()=>{}}
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}})
  try{
   const entries=[
    ['/projects/projects','/projects/projects'],['/projects/catalogue','/projects/projects'],['/projects/projects/new','/projects/projects'],['/projects/projects/'+id(10),'/projects/projects'],['/projects/projects/'+id(10)+'/roles','/projects/projects'],
    ['/projects/roles/'+id(11)+'/apply','/projects/projects'],['/projects/candidates/'+id(12)+'/select','/projects/projects'],['/projects/candidates/'+id(12)+'/respond','/projects/projects'],
    ['/projects/plans','/projects/plans'],['/projects/projects/'+id(10)+'/plans/new','/projects/plans'],['/projects/plans/'+id(13)+'/confirm','/projects/plans'],['/projects/projects/'+id(10)+'/readiness','/projects/plans'],
    ['/projects/releases','/projects/releases'],['/projects/projects/'+id(10)+'/editions/new','/projects/releases'],['/projects/editions/'+id(14)+'/confirm','/projects/releases'],['/projects/projects/'+id(10)+'/releases/new','/projects/releases'],['/projects/releases/'+id(16)+'/external','/projects/releases'],
    ['/projects/channels','/projects/channels'],['/projects/channels/new','/projects/channels'],['/projects/channels/'+id(15),'/projects/channels'],['/projects/records/'+id(17),'/projects/projects']
   ]
   for(const section of ['plans','editions','channels','releases','external-events'])for(const suffix of ['', '/'+id(section==='plans'?13:section==='editions'?14:section==='channels'?15:section==='releases'?16:17)])entries.push(['/projects/reviews/'+section+suffix,'/projects/reviews/plans'])
   for(const [path,active] of entries){assert.equal(loginRedirect(path),path);const router=createRouter({history:createMemoryHistory(),routes:[...projectsRoutes,{path:'/:pathMatch(.*)*',component:{render:()=>null}}]}),app=createSSRApp({render:()=>h(RouterView)}).use(createPinia()).use(router);await router.push(path);await router.isReady();assert.ok(router.currentRoute.value.name,path);const html=await renderToString(app),nav=html.match(/<nav\b[^>]*aria-label="工作区导航"[^>]*>([\s\S]*?)<\/nav>/)?.[1];assert.ok(nav);const links=[...nav.matchAll(/<a\b([^>]*)>/g)];assert.equal(links.length,40);assert.deepEqual(links.filter(([,attrs])=>attrs.includes('aria-current="page"')).map(([,attrs])=>attrs.match(/href="([^"]+)"/)?.[1]),[active],path);for(const label of ['项目选角','项目会签','项目发行','渠道档案','项目独立核验','制作项目','制作独立核验','商品规格','报价订单','付款退款'])assert.ok(nav.includes(label))}
   for(const path of ['/projects/admin','//foreign/projects/projects','/projects/projects/bad','/projects/projects/new?fake=true','/projects/reviews/roles','/projects/editions','/projects/roles/'+id(11)+'/select',' /projects/projects'])assert.equal(loginRedirect(path),'/workspace')
  }finally{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;if(oldStorage)Object.defineProperty(globalThis,'sessionStorage',oldStorage);else delete globalThis.sessionStorage}
 })
 test('真实制作链保留项目桥接、失权清理及412重确认；权限由服务器授予',async()=>{
  const source=await readFile(root+'/src/views/ProjectsView.vue','utf8'),production=await readFile(root+'/src/views/ProductionView.vue','utf8')
  assert.ok(production.includes('to="/projects/projects/new"'));assert.ok(source.includes("watch(securityRevision,reset,{flush:'sync'})"));assert.ok(source.includes('project-reconfirm'));assert.ok(source.includes('catalogueRecovery:true'));assert.ok(source.includes("void loadPage()},{flush:'sync'})"));assert.ok(source.includes('loadRelated(r)'))
  const {canDisplay}=await server.ssrLoadModule('/src/config/actions.ts');assert.equal(canDisplay([], 'PROJECT_REVIEW'),false);assert.equal(canDisplay(['PRODUCTION_REVIEW'],'PROJECT_REVIEW'),false);assert.equal(canDisplay(['PROJECT_REVIEW'],'PROJECT_REVIEW'),true)
 })
 for(const {name,run} of tests){await run();console.log('✓ '+name)}
 console.log('\n'+tests.length+' projects checks passed.')
}finally{globalThis.fetch=originalFetch;await server.close()}
