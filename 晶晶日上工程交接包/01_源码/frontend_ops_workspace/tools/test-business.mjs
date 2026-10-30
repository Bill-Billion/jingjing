import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {createServer} from 'vite'
import vue from '@vitejs/plugin-vue'
import {createSSRApp,effectScope,h,reactive} from 'vue'
import {renderToString} from '@vue/server-renderer'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
const root=fileURLToPath(new URL('..',import.meta.url)),require=createRequire(import.meta.url),backend=key=>require(`${root}/../backend_server/src/modules/${key}/policy.js`)
const server=await createServer({root,configFile:false,plugins:[vue()],resolve:{alias:{'@':`${root}/src`}},server:{middlewareMode:true},appType:'custom'})
const savedFetch=globalThis.fetch,storageDescriptor=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage'),storage=new Map()
Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}})
const tests=[],test=(name,run)=>tests.push({name,run}),id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`,sha='a'.repeat(64),at='2026-10-22T08:00:00.000Z',until='2026-11-22T08:00:00.000Z'
const response=(data,party=id(2),account=id(1))=>new Response(JSON.stringify({meta:{request_id:'synthetic-request',actor:{account_id:account},acting_party:party},data}),{status:200,headers:{'Content-Type':'application/json'}})
const failure=(status,code)=>new Response(JSON.stringify({error:{code,message:'synthetic failure'}}),{status,headers:{'Content-Type':'application/json'}})
try{
 const {domains}=await server.ssrLoadModule('/src/business/index.ts'),model=await server.ssrLoadModule('/src/business/model.ts'),api=await server.ssrLoadModule('/src/api/modules/business.ts'),{useBusiness}=await server.ssrLoadModule('/src/composables/useBusiness.ts'),{businessRoutes}=await server.ssrLoadModule('/src/router/businessRoutes.ts'),{loginRedirect}=await server.ssrLoadModule('/src/router/loginRedirect.ts'),trade=await server.ssrLoadModule('/src/api/modules/trade.ts'),{useSessionStore}=await server.ssrLoadModule('/src/stores/session.ts')
 const references=await server.ssrLoadModule('/src/business/references.ts')
 const {mcnDashboardView}=await server.ssrLoadModule('/src/business/presentation.ts')
 const operation=(domain,key)=>{const o=domains[domain].operations.find(o=>o.key===key);assert(o,`${domain}/${key}`);return o},encoded=(domain,key,values)=>model.encode(operation(domain,key).fields,values)
 const state=()=>{const context=reactive({token:'synthetic-secret-token',accountId:id(1),partyId:id(2),sessionTag:until,domain:'test'}),scope=effectScope(),ui=scope.run(()=>useBusiness(()=>context));return{context,scope,ui}}
 test('8轮业务按11域注册，每域有真实读取、字段表单与独立业务按钮',()=>{assert.equal(Object.keys(domains).length,11);for(const d of Object.values(domains)){assert(d.sections.length);assert(d.operations.length);for(const o of d.operations){assert(o.label);assert(o.path.startsWith('/'));assert(!o.label.includes('POST'));assert(o.fields.every(f=>f.label));assert(['required','optional','none'].includes(o.party))}}})
 test('新路由逐域严格登录恢复，拒绝未知参数与外链',()=>{for(const d of Object.values(domains)){for(const s of d.sections){const path=`/${d.key}/${s.key}`;assert.equal(loginRedirect(path),path);assert.equal(loginRedirect(path+'/'+id(4)),path+'/'+id(4));assert.equal(loginRedirect(path+'?admin=true'),'/workspace');assert.equal(loginRedirect(path+'?action=made-up'),'/workspace')}}assert.equal(loginRedirect('//evil.test/stock/catalog'),'/workspace')})
 test('引用仅接受真实UUID，hash不能任意文本，动态路径不能注入',()=>{assert.throws(()=>model.encode([model.id('person','真人')],{person:'abc'}));assert.throws(()=>model.encode([model.hash()],{content_sha256:'x'}));assert.throws(()=>model.pathFor('/stock/purchases/:record_id',{record_id:'../../admin'}));assert.equal(model.pathFor('/stock/purchases/:record_id',{record_id:id(3)}),'/stock/purchases/'+id(3))})
 test('元金额精确编码为整数分，0与过多小数按各业务边界处理',()=>{assert.deepEqual(model.encode([model.money('refund','退款')],{refund:'12.34'}),{refund:1234});assert.equal(model.encode([model.money('refund','退款')],{refund:'0'}).refund,0);for(const value of ['1.001','NaN','-1','1e2'])assert.throws(()=>model.encode([model.money('refund','退款')],{refund:value}))})
 test('所有本人同意和独审勾选初始未勾选，无原始JSON编辑字段',()=>{for(const d of Object.values(domains))for(const o of d.operations){const visit=fs=>{const values=model.initial(fs);for(const f of fs){assert(!/JSON/.test(f.label));if(f.type==='boolean')assert.equal(values[f.key],false);if(f.fields)visit(f.fields)}};visit(o.fields)}})
 test('首次上架从已发布销售说明和当前逐人授权选择，不依赖历史作品',()=>{
 const spec=references.sourceFor('spec_id',{},'stock',id(2));assert.equal(spec.path,'/stock/sales-publications');
 const rules=references.sourceFor('rule_id',{spec_id:id(3)},'stock',id(2));assert(rules.filter({spec_id:id(3)}));assert(!rules.filter({spec_id:id(4)}));
 const source=references.sourceFor('consent_id',{person_id:id(5)},'stock',id(2));assert.equal(source.path,'/stock/participant-options?person_id='+id(5));assert.equal(source.party,'required');
 const opts=references.referenceOptions({items:[{seller_party_id:id(2),person_id:id(5),avatar_id:id(6),consent_id:id(7),person_name:'合成艺人',avatar_name:'获准形象'}]},'consent_id');assert.equal(opts[0].value,id(7));assert(opts[0].label.includes('获准形象'));
 assert.equal(references.referenceOptions({items:[{id:id(9),spec_id:id(3),rule_id:id(4),title:'销售说明',spec_title:'商品'}]},'spec_id')[0].value,id(3));
 const revise=operation('stock','revision');assert(revise.match);assert.equal(revise.path,'/stock/listings/:record_id/revisions');assert.deepEqual(revise.fields,operation('stock','listing').fields);
 assert.equal(operation('stock','publish-sales').party,'none');assert.equal(operation('stock','review-sales').party,'none');
 })
 test('现货个人许可与多人权利输入通过当前后端纯校验',()=>{const license={scope:'PERSONAL_NONCOMMERCIAL',exclusive:false,territory:'WORLDWIDE',duration:'PERPETUAL',personal_social_sharing:true,acceptance_hours:72,aftercare_terms:'synthetic aftercare'},s={version:'synthetic',stock_license:license,terms:'synthetic terms'};assert.deepEqual(backend('stock').specification(s),s);assert(trade.isSpecification(s));assert.equal(trade.isFilmSpecification(s),false);const p=[{person_id:id(1),avatar_id:id(2),consent_id:id(3)}];assert.deepEqual(backend('stock').participants(p),p)})
 test('现货内容和权利独审字段分开，退回不要求伪造通过核验',()=>{const r=operation('stock','rights'),c=operation('stock','content');assert.notDeepEqual(r.fields[3].fields.map(f=>f.key),c.fields[3].fields.map(f=>f.key));assert.equal(encoded('stock','rights',{channel:'RIGHTS',decision:'REJECTED',reason:'synthetic',verification:{}}).verification,null);assert.throws(()=>encoded('stock','rights',{decision:'APPROVED',reason:'synthetic',verification:{}}))})
 test('六类通告只提交本类字段并通过后端校验',()=>{const types={DRAMA:{synopsis:'synthetic',roles:'synthetic'},PERFORMANCE:{venue:'synthetic',schedule:'synthetic',requirements:'synthetic'},COMMERCIAL:{deliverables:'synthetic',requirements:'synthetic'},EVENT:{venue:'synthetic',schedule:'synthetic'},RECRUITMENT:{roles:'synthetic',requirements:'synthetic'},OFFICIAL:{summary:'synthetic'}};for(const[type,details]of Object.entries(types)){const key=type==='OFFICIAL'?'official':'announcement',o={rule_id:id(1),notice:{type,title:'synthetic',description:'synthetic',city:'synthetic',valid_from:at,valid_until:until,details,project_id:'',accept_submissions:false}},r=encoded('notices',key,o);assert.deepEqual(backend('notices').notice(r.notice).details,details)}})
 test('试镜方案时段、安全安排和取样按原约定数量编码',()=>{const o={offer:{person_id:id(1),avatar_id:id(2),public_consent_id:id(3),rule_id:id(4),title:'synthetic',city:'synthetic',service_area:'synthetic',mode:'OFFLINE',public_booking:false,public_price:false,unit_minor:'10.25',slots:[{starts_at:at,ends_at:'2026-10-22T09:00:00Z'}],terms:'synthetic'}},r=encoded('auditions','offer',o);assert.equal(backend('auditions').offer(r.offer).unit_minor,1025);const b=encoded('auditions','booking',{offer_id:id(5),offer_sha256:sha,invitation_id:'',appointment:{mode:'ONLINE_MATERIALS',city:'synthetic',venue:'synthetic',address:'synthetic',starts_at:at,ends_at:'2026-10-22T09:00:00Z',purpose:'synthetic'}});assert.equal(backend('auditions').appointment(b.appointment).mode,'ONLINE_MATERIALS')})
 test('试镜消息与商单媒体使用各自实际枚举，不互相替代',()=>{assert.equal(encoded('auditions','message',{kind:'DELIVERY_MEDIA',body:'',asset_id:id(5)}).kind,'DELIVERY_MEDIA');assert.equal(encoded('conversations','message',{kind:'MEDIA',body:'',asset_id:id(5)}).kind,'MEDIA');assert.deepEqual(encoded('conversations','message',{kind:'TEXT',body:'synthetic message',asset_id:''}),{kind:'TEXT',body:'synthetic message',asset_id:null})})
 test('钱包如实保留资金未接通，兑换抽奖使用独立业务接口',()=>{assert(domains.wallet.note.includes('尚未接通'));assert(!domains.wallet.operations.some(o=>o.path==='/wallet/recharges'));assert.equal(operation('redemption','draw-one').path,'/redemption/draws');assert(!domains.redemption.operations.some(o=>o.path.startsWith('/wallet/')))})
 test('MCN成员授权仅限后端允许的逐人动作',()=>{const actions=operation('engagement','staff').fields.find(f=>f.key==='actions').choices.map(x=>Array.isArray(x)?x[0]:x);assert.deepEqual(actions,['READ_PROFILE','COMMISSION_PRODUCTION','MANAGE_AUDITIONS','COMMERCIAL_MESSAGES','READ_INCOME','MANAGE_LISTINGS'])})
 test('MCN非负责人展示仅保留当前账号派单及对应订单，不显示机构关系和总额',()=>{const a={id:id(10),data:{account_id:id(1),order_id:id(20)}},b={id:id(11),data:{account_id:id(2),order_id:id(21)}},r={assignments:[a,b],relations:[{private_person:'other'}],orders:[{id:id(20)},{id:id(21)}],total_accrual_minor:9900,history_preserved:true},v=mcnDashboardView(r,id(1),false);assert.deepEqual(v.assignments,[a]);assert.deepEqual(v.orders,[{id:id(20)}]);assert(!('relations'in v));assert(!('total_accrual_minor'in v));assert(v.scope_note.includes('不展示全机构关系和收入'));assert.equal(mcnDashboardView(r,id(1),true),r)})
 test('冠军规则结构、独立权重和风险票处置使用实际契约',()=>{const rules=operation('engagement','competition').fields.find(f=>f.key==='rules');assert.equal(rules.type,'group');assert.deepEqual(rules.fields.map(f=>f.key),['official_bps','ranking_bps','vote_bps','vote_cost','daily_cap','tie_mode','void_point_policy']);assert.deepEqual(operation('engagement','vote-review').fields[0].choices.map(x=>x[0]),['SUSPEND','VOID','RESTORE','RETURN_POINTS'])})
 test('共创人数规则和额度不默认生成正式参数',()=>{const r=encoded('cocreation','rule',{rule:{version:'synthetic',source_ref:'synthetic',max_people:'40',extension_days:'3',participation_terms:'synthetic',benefit:{service_code:'synthetic',description:'synthetic',credit_minor:'100.00',valid_days:'30'}}});assert.equal(backend('cocreation').rules(r.rule).benefit.credit_minor,10000);assert.deepEqual(backend('cocreation').counts([{active:true,valid:true,person_id:id(1)},{active:true,valid:true,person_id:id(1)}]).eligible_count,1)})
 test('共创本人片段四项独审使用当前真实字段',()=>{const r=operation('cocreation','snippet-review').fields.find(f=>f.key==='verification');assert.deepEqual(r.fields.map(f=>f.key),['only_target_person','authorization_marked','ai_label_verified','content_reviewed'])})
 test('固定制作券与面试权益按后端当前约束编码',()=>{const v={template:{version:'synthetic',source_ref:'synthetic',title:'synthetic',kind:'PRODUCTION_CREDIT',valid_days:'30',exchange_points:'6000',capacity:'20',available_until:until,terms:'synthetic',production:{face_minor:'50',minimum_minor:'500',spec_ids:id(5)},interview:null,exposure:null},evidence_asset_ids:id(8)},r=encoded('redemption','stock',v);assert.equal(backend('redemption').template(r.template).production.face_minor,5000);assert.equal(r.template.interview,null);assert(!('service_code'in r.template))})
 test('单抽与十连固定合法次数，兑现结果与补救使用当前后端枚举',()=>{assert.equal(encoded('redemption','draw-one',{pool_id:id(1),rules_sha256:sha}).count,1);assert.equal(encoded('redemption','draw-ten',{pool_id:id(1),rules_sha256:sha}).count,10);assert.deepEqual(operation('redemption','finish').fields[0].choices.map(x=>x[0]),['INTERVIEWED','NOT_SELECTED','EXPOSURE_COMPLETED']);assert.deepEqual(operation('redemption','remedy-review').fields[0].choices.map(x=>x[0]),['EXTEND_ONCE','RETURN_POINTS','REJECT'])})
 test('新建素材任务先提交实际来源，不为未知新任务预造GET编号；材料入口对账号级GET保留',async()=>{storage.clear();const {vm}=await render('/media/tasks');vm.operationKey='task';vm.draft={task_kind:'MODERATE_FILE',source_kind:'SUPPLY_ASSET',source_id:id(7),variant:'final',policy_rule_id:id(8)};vm.agreed=true;assert(!vm.referenceFields.some(f=>f.key==='record_id'));const calls=[];globalThis.fetch=async(url,o)=>{calls.push({url,o});return response({id:id(9),task_kind:'MODERATE_FILE',current_status:'QUEUED'})};await vm.submit();assert.equal(calls.length,1);assert.equal(calls[0].o.method,'POST');assert.equal(calls[0].url,'/api/v1/media/tasks');assert.equal(vm.selected.id,id(9));assert.equal(references.sourceFor('source_id',{source_kind:'PRODUCTION_VERSION',project_id:id(4)},'media',id(2)).path,'/production/projects/'+id(4)+'/records?kind=VERSION');const {html}=await render('/media/tasks');assert(html.includes('准备本次私有材料'));assert(!html.includes('无新任务编号'))})
 test('参演固定片酬及独立未来收入保留完整分期和角色',()=>{const r=encoded('participation','participation',{cast:{person_id:id(1),look_version_id:id(2),voice_version_id:''},terms:{mode:'FIXED_FEE',usage:'EXISTING_MATERIAL',exclusive:false,territory:'synthetic',language:'synthetic',valid_until:until,permitted_uses:'synthetic',prohibited_uses:'synthetic',installments:[{key:'first',amount_minor:'100',milestone:'synthetic'}],start_payment_keys:'first',revenue:null,cancellation_terms:'synthetic'},rule_id:id(4),evidence_asset_id:id(5)});const p=require(`${root}/../backend_server/src/modules/projects/participation-policy.js`);assert.equal(p.terms(r.terms,10000).installments[0].amount_minor,10000);assert.equal(p.cast(r.cast).voice_version_id,null)})
 test('独立审核退回参演约定允许真实未通过项，不强迫勾选通过',()=>{const v=encoded('participation','review',{decision:'REJECTED',reason:'synthetic failure',verification:{identity_verified:false,rights_verified:false,exclusivity_reviewed:false,terms_verified:false,evidence_verified:false}});assert.equal(v.verification.rights_verified,false);assert.throws(()=>encoded('participation','review',{...v,decision:'APPROVED'}))})
 test('资料权益请求、分类留存与未执行结果不冒充全清理',()=>{const p=backend('privacy'),r=encoded('privacy','request',{type:'COPY',scopes:['PROFILE','PRIVATE_STORY'],details:'synthetic own data'});assert.deepEqual(p.request(r).scopes,['PROFILE','PRIVATE_STORY']);assert(domains.privacy.note.includes('AVATAR_MATERIAL'));assert(domains.privacy.note.includes('不显示全库已清除'));assert(!domains.media.operations.some(o=>/force|recover/.test(o.path)))})
 test('素材机审仅对明确REVIEW结果独审，不制造缺失的恢复服务',()=>{assert(operation('media','review').fields.some(f=>f.key==='result_sha256'));assert(domains.media.note.includes('未知机审结果'));assert(!operation('media','review').match)})
 test('业务返回校验账号、主体和有界数据，错误元信息不能显示为成功',async()=>{globalThis.fetch=async()=>response({id:id(3)},id(99));await assert.rejects(api.readBusiness('/stock/purchases',{token:'t',accountId:id(1),actingParty:id(2)}),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE');assert.throws(()=>api.businessData(JSON.parse('{"constructor":{"x":1}}')));assert.throws(()=>api.businessData(null));assert.deepEqual(api.businessData([{id:id(1)}]).items,[{id:id(1)}])})
 test('未知请求先核对再用原键恢复，修改输入不能改变已发原请求',async()=>{storage.clear();const {ui,scope}=state(),calls=[];let n=0;globalThis.fetch=async(url,o)=>{calls.push({url,o});return o.method==='POST'?(++n===1?failure(503,'NOT_ENABLED'):response({id:id(3),object_version:2})):response({id:id(3),object_version:1})};const body={reason:'original'},command={path:'/stock/purchases/'+id(3)+'/cases',body,method:'POST',party:'required',version:1,label:'synthetic',readPath:'/stock/purchases/'+id(3),readParty:'required'};await ui.execute(command);body.reason='changed';assert(ui.pending.value);await ui.execute();assert.equal(n,1);await ui.check('/wrong','required');await ui.execute();const writes=calls.filter(c=>c.o.method==='POST');assert.equal(writes[0].o.body,writes[1].o.body);assert.equal(writes[0].o.headers['Idempotency-Key'],writes[1].o.headers['Idempotency-Key']);assert.equal(writes[1].o.headers['If-Match'],'"1"');assert(calls.some(c=>c.url==='/api/v1/stock/purchases/'+id(3)&&c.o.method==='GET'));scope.stop()})
 test('关联主体取原项目已确认候选的owner，不拿候选编号冒充主体；本人执行使用实际账号或获准副本',async()=>{const rows={items:[{id:id(9),kind:'CANDIDATE',owner_party_id:id(7),current_status:'CONFIRMED',object_version:3,data:{}}]};assert.equal(references.referenceOptions(rows,'party_id')[0].value,id(7));assert.equal(references.sourceFor('party_id',{project_id:id(4)},'participation',id(2)).path,'/projects/projects/'+id(4)+'/records?kind=CANDIDATE');assert.equal(references.sourceFor('target_id',{request_id:id(5),action:'FILE_ERASURE'},'privacy',id(2)).path,'/privacy/requests/'+id(5)+'/file-options?kind=FILE');const {vm}=await render('/privacy/requests/'+id(5),{id:id(5),object_version:1,account_id:id(1),request:{type:'CORRECT',scopes:['PROFILE'],details:'synthetic'}});vm.draft={action:'PROFILE_CORRECTION'};await vm.loadChoices({field:model.id('target_id','本人账号'),context:vm.draft,key:'execution-target'});assert(vm.refOptions['execution-target'].some(o=>o.value===id(1)&&o.label.includes('本人账号')));vm.chosenReferences=[{id:id(9),data:{private:'synthetic'}}];vm.reset();assert.equal(vm.chosenReferences.length,0)})
 test('联系卡仅在自身合法读取后取同单会话版本；失权不借其他GET，冻结时不显示发送和开放联系卡动作',async()=>{storage.clear();const {vm}=await render('/conversations/contacts/'+id(10)),calls=[];vm.reset();globalThis.fetch=async(url,o)=>{calls.push(url);return response(url.endsWith('/contacts')?{order_id:id(10),status:'OPEN',contacts:{}}:{order_id:id(10),status:'OPEN',object_version:7,items:[]})};await vm.load();assert.equal(vm.currentVersion,7);assert.equal(vm.currentId,id(10));assert.deepEqual(calls,['/api/v1/gigs/orders/'+id(10)+'/conversation/contacts','/api/v1/gigs/orders/'+id(10)+'/conversation/messages']);calls.length=0;globalThis.fetch=async(url)=>{calls.push(url);return failure(403,'FORBIDDEN')};await vm.load();assert.equal(calls.length,1);assert.equal(vm.details,null);const m=await render('/conversations/messages/'+id(10),{order_id:id(10),status:'FROZEN',object_version:8,items:[]});assert(!m.vm.actions.some(a=>a.key==='message'));const c=await render('/conversations/contacts/'+id(10),{order_id:id(10),status:'FROZEN',object_version:8,contacts:{}});assert(!c.vm.actions.some(a=>a.key==='contact'));vm.ui.data.value={order_id:id(10),private_story:'old'};vm.reset();assert.equal(vm.ui.data.value,null)})
 test('原请求恢复存储绑定账号主体会话，不额外保存token',async()=>{storage.clear();const {ui,scope}=state();globalThis.fetch=async()=>failure(503,'UNAVAILABLE');await ui.execute({path:'/redemption/draws',body:{count:1},method:'POST',party:'required',label:'synthetic'});assert(![...storage.values()].join('').includes('synthetic-secret-token'));scope.stop();const next=state();assert(next.ui.pending.value);next.context.partyId=id(99);assert.equal(next.ui.pending.value,null);assert.equal(storage.size,0);next.scope.stop()})
 test('412保留输入并要求重新核对，独立岗位请求不带主体头',async()=>{storage.clear();const {ui,scope}=state(),calls=[];globalThis.fetch=async(url,o)=>{calls.push(o);return failure(412,'VERSION_MISMATCH')};const body={decision:'REJECT',reason:'original'};await ui.execute({path:'/stock/listings/'+id(3)+'/reviews',body,method:'POST',party:'none',version:1,label:'synthetic'});assert.equal(ui.conflict.value,true);assert.equal(ui.confirmed.value,false);assert.deepEqual(body,{decision:'REJECT',reason:'original'});assert.equal(calls[0].headers['X-Acting-Party'],undefined);assert.equal(ui.pending.value,null);scope.stop()})
 test('同身份较早GET和迟到403不能覆盖后来记录',async()=>{storage.clear();const {ui,scope}=state();let one,two,n=0;globalThis.fetch=()=>new Promise(resolve=>{if(++n===1)one=resolve;else two=resolve});const a=ui.load('/stock/catalog/'+id(3),'none'),b=ui.load('/stock/catalog/'+id(4),'none');one(failure(403,'FORBIDDEN'));await a;two(response({id:id(4)},null));await b;assert.equal(ui.data.value.id,id(4));assert.equal(ui.error.value,null);scope.stop()})
 test('失权、权利暂停或换身份清除旧私密内容与Blob',async()=>{for(const [status,code]of [[403,'FORBIDDEN'],[404,'NOT_FOUND'],[409,'STOCK_RIGHTS_HOLD'],[409,'ARTIST_CONSENT_REQUIRED']]){storage.clear();const {ui,scope}=state();ui.data.value={id:id(3),private_story:'synthetic'};globalThis.fetch=async()=>failure(status,code);await ui.load('/stock/catalog/'+id(3),'none');assert.equal(ui.data.value,null);assert(ui.securityRevision.value>0);scope.stop()}})
 async function render(path,record,exercise){const pinia=createPinia(),session=useSessionStore(pinia);session.token='synthetic-token';session.account={id:id(1),display_name:'合成账号',current_status:'ACTIVE',object_version:1,allowed_actions:[]};session.expiresAt=until;session.parties=[{party:{id:id(2),kind:'PERSON',display_name:'本人合成身份',current_status:'ACTIVE',object_version:1,capabilities:[],allowed_actions:[]},membership:{id:id(8),account_id:id(1),party_id:id(2),current_status:'ACTIVE',roles:['OWNER'],object_version:1,allowed_actions:[]}}];session.selectParty(id(2));const router=createRouter({history:createMemoryHistory(),routes:[...businessRoutes,{path:'/:pathMatch(.*)*',component:{render:()=>null}}]});await router.push(path);await router.isReady();let vm;const app=createSSRApp({render:()=>h(RouterView)}).use(pinia).use(router);app.mixin({created(){if(this.$options.__name==='BusinessView'){vm=this.$.setupState;vm.loading=false;if(record){vm.selected=record;vm.ui.data.value=record;vm.bindReferences(record)}}},serverPrefetch(){if(this.$options.__name==='BusinessView')return exercise?.(vm,session,router)}});const html=await renderToString(app);return{html,vm}}
 test('离开通用业务页时保留最后有效业务上下文，不向艺人路由读取旧业务',async()=>{
  await render('/stock/catalog',null,async(vm,_session,router)=>{
   assert.equal(vm.domain.key,'stock');
   await router.push('/wallet/summary');assert.equal(vm.domain.key,'wallet');
   await router.push('/artists/people');assert.equal(vm.domain.key,'wallet');
   assert.ok(vm.section.key);
   const before=globalThis.fetch;let reads=0;globalThis.fetch=async()=>{reads++;return response({items:[],next_cursor:null})};
   try{await vm.load();assert.equal(reads,0)}finally{globalThis.fetch=before}
  });
 })
 test('所有领域首页66项分类菜单完整保留、唯一高亮且沿刊物版式',async()=>{for(const d of Object.values(domains)){const {html}=await render(`/${d.key}/${d.sections[0].key}`);assert.equal((html.match(/<aside[^>]*>(.*?)<\/aside>/s)[1].match(/aria-current="page"/g)||[]).length,1);const nav=html.match(/<nav[^>]*class="workspace-nav"[^>]*>(.*?)<\/nav>/s)[1];assert.equal((nav.match(/<a /g)||[]).length,66);assert(html.includes('editorial-workspace'));assert(html.includes(d.journal.replaceAll('&','&amp;')))}})
 test('主体和表单哈希不允许普通用户手填，原JSON仅是折叠文本记录',async()=>{const {default:Fields}=await server.ssrLoadModule('/src/components/business/BusinessFields.vue'),html=await renderToString(createSSRApp({render:()=>h(Fields,{fields:[model.id('person_id','真实人物'),model.hash(),model.ids('materials','本人材料')],modelValue:{person_id:'',content_sha256:sha,materials:''}})}));assert(html.includes('<select'));assert.match(html,/<input[^>]*readonly/);assert(!html.includes('<textarea'));const {html:page}=await render('/stock/catalog/'+id(5),{id:id(5),title:'实际合成影片',object_version:1,offer_sha256:sha,unit_minor:1000,description:'<script>literal</script>'});assert(page.includes('business-overview'));assert(page.includes('核对原约定'));assert(page.includes('&lt;script&gt;literal&lt;/script&gt;'));assert(!page.includes('<script>literal</script>'))})
 test('只读审核校验值来自当前实际源与提案，逐项勾选不自动通过',async()=>{const source='b'.repeat(64),proposal='c'.repeat(64);const {vm}=await render('/stock/reviews/'+id(5),{id:id(5),object_version:1,current_status:'IN_REVIEW',content_sha256:sha,data:{files:{full_sha256:source}}});vm.operationKey='rights';vm.draft=model.initial(operation('stock','rights').fields);vm.prefill();assert.equal(vm.draft.verification.source_sha256,source);assert.equal(vm.draft.verification.rights_verified,false);const p=await render('/privacy/operations/'+id(6),{id:id(6),object_version:1,current_status:'AWAITING_REVIEW',proposal_sha256:proposal,request:{type:'COPY',scopes:['PROFILE'],details:'synthetic'}});p.vm.operationKey='response-review';p.vm.draft=model.initial(operation('privacy','response-review').fields);p.vm.prefill();assert.equal(p.vm.draft.proposal_sha256,proposal);assert.equal(p.vm.draft.evidence_verified,false)})
 test('新邀约使用独立表单与当前公开来源，不从历史投递取得公开资格',async()=>{const {vm}=await render('/notices/submissions');vm.operationKey='submission';const field=vm.actionFields.find(f=>f.key==='submission').fields.find(f=>f.key==='kind');assert(!field.choices.some(c=>c[0]==='INVITATION'));vm.selected={id:id(5),kind:'SUBMISSION',object_version:1,data:{submission:{consent_id:id(6)}}};assert(!vm.actionFields.find(f=>f.key==='submission').fields.find(f=>f.key==='kind').choices.some(c=>c[0]==='INVITATION'));assert(operation('notices','invitation').fields.find(f=>f.key==='submission').fields.some(f=>f.key==='source_listing_id'))})
 test('人工样片本人专用下载不依赖generic production GET，原绑定与确认分开',()=>{const sections=domains.participation.sections,source=sections.find(s=>s.key==='manual-sample'),confirmation=sections.find(s=>s.key==='manual-confirmation');assert.equal(source.path,'/customization-requests/:request_id');assert.equal(confirmation.path,'/customization-requests/:request_id/manual-sample');assert.equal(confirmation.files[0].path,'/production/projects/:project_id/manual-sample-content');assert.equal(operation('participation','manual-confirm').sections[0],'manual-confirmation')})

 const film=()=>({version:'synthetic',service_tier:'synthetic',sample_seconds:1,final_seconds:2,revision_limit:1,deliverables:['synthetic'],terms:'synthetic',customization_delivery:{version:'synthetic',source_ref:'synthetic',preview_payment_order:'PREVIEW_BEFORE_INTERIM',acceptance_hours:72,cancellation_terms:'synthetic'}})
 const line=()=>({line_id:'film',spec_id:id(4),spec_version:1,quantity:1,title:'synthetic film',provider_party_id:id(3),line_kind:'PRODUCTION',unit_minor:10000,total_minor:10000,currency:'CNY',specification:film(),product_profile:{version:'V5',type:'PRIVATE_CUSTOMIZATION'},review:null})
 const quoteData=()=>({lines:[line()],installments:[{key:'synthetic',trigger:'ORDER_ACCEPTED',allocations:[{line_id:'film',amount_minor:10000}],apple_product_id:null}],total_minor:10000,currency:'CNY',channel:'ALIPAY',transaction_model:'PLATFORM_PRINCIPAL',rule_id:id(5),expires_at:until,payment_window_minutes:30,license_reservation_id:null,review:null})
 const contract=()=>({format_version:'contract-content-v1',id:id(11),contract_version_id:id(12),party_ids:[id(2),id(3)],created_at:at,rule_contents:[{format_version:'rule-content-v1',id:id(5),rule_key:'synthetic',version:'synthetic',terms:{text:'synthetic'},content_sha256:sha}],commitments:{text:'synthetic'},object_version:1,current_status:'SEALED',signing_method:'NOT_SIGNED',content_sha256:sha})
 const order=q=>({id:id(10),kind:'ORDER',buyer_party_id:id(2),merchant_party_id:id(3),parent_id:null,order_id:null,created_by:id(1),object_version:1,current_status:'OPEN',content_sha256:sha,data:{quote:q,contract:contract(),buyer_acknowledged_by:id(1),financial:{received_minor:0,refunded_minor:0,net_minor:0}}})
 test('现货许可订单采用真实stock_license规格，保留原个人范围',()=>{const q=quoteData();q.stock_video={listing_id:id(8),offer_sha256:sha,license:{scope:'PERSONAL_NONCOMMERCIAL',exclusive:false,territory:'WORLDWIDE',duration:'PERPETUAL',personal_social_sharing:true,acceptance_hours:72,aftercare_terms:'synthetic'}};q.lines[0]={...line(),line_kind:'OTHER',specification:{version:'synthetic',stock_license:q.stock_video.license,terms:'synthetic'},product_profile:{version:'V5',type:'STOCK_VIDEO'}};assert(trade.isTradeRecord(order(q)));q.stock_video.license.exclusive=true;assert.equal(trade.isTradeRecord(order(q)),false)})
 test('试镜及独立追加订单接受真实最小规格，拒绝缺失原业务快照',()=>{const q=quoteData(),terms={version:'synthetic',terms:'synthetic',accept_hours:24,acceptance_hours:72,photo_count:1,video_count:1,payment_window_minutes:30};q.lines=[{line_id:'audition',title:'synthetic audition',provider_party_id:id(3),line_kind:'OTHER',unit_minor:10000,total_minor:10000,currency:'CNY',quantity:1,product_profile:{version:'V5',type:'AUDITION'},specification:{version:'synthetic',terms:'synthetic',audition:terms}}];q.installments[0].allocations[0].line_id='audition';q.audition={booking_id:id(8),offer_sha256:sha,person_id:id(7),avatar_id:id(6),appointment:{mode:'OFFLINE'},performance_rights_granted:false};assert(trade.isTradeRecord(order(q)));delete q.audition;assert.equal(trade.isTradeRecord(order(q)),false);q.audition_supplement={supplement_id:id(9),booking_id:id(8),original_order_id:id(10),original_contract_sha256:sha,supplement_sha256:sha,person_id:id(7),avatar_id:id(6),performance_rights_granted:false};q.lines[0].specification.additional_terms='synthetic separate scope';assert(trade.isTradeRecord(order(q)))})
 test('参演生成订单保留原会签来源，托管渠道只保存未接通事实',()=>{const q=quoteData();q.lines=[{line_id:'participation',title:'synthetic participation',provider_party_id:id(3),line_kind:'OTHER',unit_minor:10000,total_minor:10000,currency:'CNY',quantity:1,product_profile:{version:'V5',type:'COMMERCIAL'},specification:{version:'V5',terms:'synthetic'}}];q.installments[0].allocations[0].line_id='participation';q.participation={agreement_id:id(7),agreement_sha256:sha,project_id:id(8),candidate_id:id(9),terms:{text:'synthetic'},cast:{person_id:id(6)},avatar_id:id(5)};q.channel='CUSTODY';assert(trade.isTradeRecord(order(q)));delete q.participation;assert.equal(trade.isTradeRecord(order(q)),false)})
 test('全额权益订单允许零现金空分期，普通订单不得借零金额通过',()=>{const q=quoteData(),original=line();q.lines=[{...original,unit_minor:0,total_minor:0}];q.total_minor=0;q.installments=[];assert.equal(trade.isQuoteData(q),false);q.discount={hold_id:id(20),grant_id:id(21),original_quote_sha256:sha,original_total_minor:10000,original_lines:[original],discount_minor:10000,rule_snapshot:{kind:'PRODUCTION_FREE'},coverage:'FULL',source_kind:'PRODUCTION_FREE',refund_forfeit:true,cashable:false};const o=order(q);o.current_status='REWARD_FUNDED';assert(trade.isTradeRecord(o));o.data.financial.received_minor=1;o.data.financial.net_minor=1;assert.equal(trade.isTradeRecord(o),false);o.data.financial.received_minor=0;o.data.financial.net_minor=0;q.installments=quoteData().installments;assert.equal(trade.isTradeRecord(o),false)})
 test('选券组件确认准确的adjusted hash，保存与释放保留原操作',()=>{const source=readFileSync(root+'/src/components/business/TradeCouponSelector.vue','utf8'),view=readFileSync(root+'/src/views/TradeView.vue','utf8');assert(source.includes('/redemption/grants/'));assert(source.includes('/redemption/holds/'));assert(source.includes('adjusted_quote_sha256'));assert(source.includes('ui.pending.value.checked'));assert(view.includes('reward_selection:{hold_id:couponSelection.value.hold_id'));assert(view.includes('REWARD_FUNDED'))})
 test('功能树保留全部66入口、当前分类展开，搜索分类或入口并可收起',async()=>{
   const {default:Nav}=await server.ssrLoadModule('/src/components/WorkspaceNav.vue')
   async function nav(query,path='/trade/quotes',meta={}){const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{render:()=>null},meta}]});await router.push(path);await router.isReady();let vm;const app=createSSRApp({render:()=>h(Nav)}).use(router);app.mixin({created(){if(this.$options.__name==='WorkspaceNav'){vm=this.$.setupState;vm.query=query}}});return{html:await renderToString(app),vm,router}}
   const all=await nav('');assert.equal(all.vm.entries.length,66);assert.equal(all.vm.groups.length,7);assert.equal(new Set(all.vm.groups.flatMap(g=>g.entries.map(e=>e.to))).size,66);assert.equal(all.vm.groups.reduce((n,g)=>n+g.entries.length,0),66)
   assert(all.html.includes('aria-current="page"'));assert.equal((all.html.match(/aria-expanded="true"/g)||[]).length,1);assert(!all.html.includes('<dialog'));assert.equal(all.vm.isExpanded('trade'),true);assert.equal(all.vm.isExpanded('people'),false)
   all.vm.toggleGroup('trade');assert.equal(all.vm.isExpanded('trade'),false);all.vm.toggleGroup('people');assert.equal(all.vm.isExpanded('people'),true);all.vm.collapseAll();assert(all.vm.groups.every(g=>!all.vm.isExpanded(g.id)))
   const one=await nav('故事收件');assert.deepEqual(one.vm.visibleGroups.flatMap(g=>g.entries.map(e=>e.to)),['/operations/customization']);assert(one.html.includes('找到 1 个入口'));assert(!one.html.includes('href="/contracts"'))
   const category=await nav('人物与作品');assert.equal(category.vm.visibleGroups.length,1);assert.equal(category.vm.visibleGroups[0].id,'people');assert.equal(category.vm.resultCount,all.vm.groups.find(g=>g.id==='people').entries.length);assert.equal(category.vm.isExpanded('people'),true);category.vm.toggleGroup('people');assert.equal(category.vm.query,'人物与作品');assert.equal(category.vm.isExpanded('people'),false)
   const path=await nav('/finance/reviews/');assert.equal(path.vm.resultCount,1);assert(path.html.includes('独立财务核验'))
   const none=await nav('不存在的业务名称');assert.equal(none.vm.resultCount,0);assert(none.html.includes('没有匹配入口'));assert(!none.html.includes('暂无业务'))
   const own=await nav('',`/operations/customization/mine/${id(10)}`,{title:'我的故事与补件'});assert.equal(own.vm.currentLabel,'我的故事与补件');assert.equal(own.vm.isExpanded('creation'),true);assert.equal(all.vm.currentLabel,'报价订单')
  })
 test('同名获准引用保留区分编号，当前选择完整可见且不自动代选',async()=>{
  const rows={items:[{id:id(17),title:'相同名称',current_status:'ACTIVE',object_version:1},{id:id(18),title:'相同名称',current_status:'ACTIVE',object_version:1}]},options=references.referenceOptions(rows,'person_id');assert.notEqual(options[0].label,options[1].label);assert(options[0].label.includes(id(17).slice(-8)));assert.equal(options[0].value,id(17))
  const {default:Fields}=await server.ssrLoadModule('/src/components/business/BusinessFields.vue'),html=await renderToString(createSSRApp({render:()=>h(Fields,{fields:[model.id('person_id','人物')],modelValue:{person_id:id(17)},references:{'business-person_id':options}})}));assert(html.includes('<code>'+id(17)+'</code>'))
  const {default:Picker}=await server.ssrLoadModule('/src/components/RecordPicker.vue');let selected='';const blank=await renderToString(createSSRApp({render:()=>h(Picker,{modelValue:'',options,label:'原订单','onUpdate:modelValue':v=>selected=v})}));assert.equal(selected,'');assert(blank.includes('请选择已读取记录'));assert(blank.includes('…'+id(18).slice(-8)))
  const picked=await renderToString(createSSRApp({render:()=>h(Picker,{modelValue:id(17),options,label:'原订单',disabled:true})}));assert.match(picked,new RegExp('<code[^>]*>'+id(17)+'</code>'));assert.match(picked,/<input[^>]*disabled/)
  const manual=await renderToString(createSSRApp({render:()=>h(Picker,{modelValue:id(19),options:[],label:'原订单'})}));assert(manual.includes('当前填写编号，仍需读取核对'));assert(!manual.includes('<select'))
 })
 test('明确中文状态仍保留服务器原值，未知状态不猜成通过',async()=>{
  const {default:State}=await server.ssrLoadModule('/src/components/StateValue.vue'),known=await renderToString(createSSRApp({render:()=>h(State,{code:'APPROVED',label:'已审核通过'})})),unknown=await renderToString(createSSRApp({render:()=>h(State,{code:'NEW_SERVER_STATE',label:'NEW_SERVER_STATE'})}));assert(known.includes('已审核通过'));assert(known.includes('APPROVED'));assert(unknown.includes('未识别状态'));assert(unknown.includes('NEW_SERVER_STATE'));assert(!unknown.includes('通过'))
  const {default:Details}=await server.ssrLoadModule('/src/components/business/BusinessDetails.vue'),html=await renderToString(createSSRApp({render:()=>h(Details,{value:{current_status:'APPROVED',status:'NEW_SERVER_STATE'}})}));assert(html.includes('已审核通过'));assert(html.includes('APPROVED'));assert(html.includes('未识别状态'))
 })
 test('读取503/断线与提交未知文案分开，读取失败不清除原写入恢复',async()=>{
  storage.clear();const {request,requestBytes}=await server.ssrLoadModule('/src/api/client.ts'),{explainError}=await server.ssrLoadModule('/src/api/errors.ts')
  for(const read of [()=>request('/synthetic-read'),()=>requestBytes('/synthetic-file',{})]){globalThis.fetch=async()=>failure(503,'SERVICE_UNAVAILABLE');await assert.rejects(read(),e=>e.requestMethod==='GET'&&explainError(e).includes('重新读取')&&!explainError(e).includes('提交结果'))}
  globalThis.fetch=async()=>failure(503,'PRIVATE_CONTENT_MISMATCH');await assert.rejects(request('/synthetic-private'),e=>explainError(e).includes('私有内容的大小或指纹')&&!explainError(e).includes('暂时无法读取'))
  globalThis.fetch=async()=>failure(503,'NEW_UNAVAILABLE_CODE');await assert.rejects(request('/synthetic-read'),e=>explainError(e).includes('重新读取'))
  globalThis.fetch=async()=>{throw new TypeError('synthetic offline')};await assert.rejects(request('/synthetic-read'),e=>e.requestMethod==='GET'&&explainError(e).includes('读取未完成'))
  globalThis.fetch=async()=>failure(503,'SERVICE_UNAVAILABLE');await assert.rejects(request('/synthetic-write',{method:'POST',body:{reason:'original'}}),e=>e.requestMethod==='POST'&&explainError(e).includes('恢复同一次请求'))
  for(const [code,status,expected]of [['SMS_NOT_READY',503,'短信服务暂不可用'],['SMS_CHALLENGE_UNAVAILABLE',400,'验证码已失效'],['SMS_DEBUG_LOGGING_FORBIDDEN',503,'短信发送被服务器配置拦截']]){globalThis.fetch=async()=>failure(status,code);await assert.rejects(request('/auth/sms-challenges',{method:'POST',body:{phone:'synthetic'}}),e=>explainError(e).includes(expected))}
  globalThis.fetch=async()=>failure(503,'SERVICE_UNAVAILABLE')
  const {ui,scope}=state();try{await ui.execute({path:'/stock/purchases/'+id(3)+'/cases',body:{reason:'original'},method:'POST',party:'required',label:'synthetic',readPath:'/stock/purchases/'+id(3),readParty:'required'});const original=ui.pending.value;assert(original);await ui.check('/stock/purchases/'+id(3),'required');assert.equal(ui.pending.value,original);assert.equal(ui.pending.value.checked,false);assert.equal(ui.error.value.requestMethod,'GET');assert(explainError(ui.error.value).includes('重新读取'))}finally{scope.stop()}
 })
 test('首次试镜选择目录按当前人物读取规则与授权，不依赖历史方案',()=>{
  const person=id(12),ctx={person_id:person};
  for(const [field,kind] of [['rule_id','RULE'],['avatar_id','AUTHORIZATION'],['public_consent_id','AUTHORIZATION']]){const src=references.sourceFor(field,ctx,'auditions',id(2));assert.equal(src.path,'/auditions/offer-options?person_id='+person+'&kind='+kind)}
  const opts=references.referenceOptions({items:[{id:id(14),person_id:person,avatar_id:id(15),avatar_name:'当前形象',public_consent_id:id(14)}]},'public_consent_id');assert.equal(opts[0].value,id(14));
 })
 test('钱包累计已扣撤回，与可用晶钻分别展示且不把使用算成撤回',async()=>{
  const {default:Overview}=await server.ssrLoadModule('/src/components/business/BusinessOverview.vue');
  const html=await renderToString(createSSRApp({render:()=>h(Overview,{domain:'wallet',record:{available_points:2,cumulative_points:{version:'NET_ISSUED_V1',issued:120,withdrawn:20,net_issued:100}}})}));
  assert(html.includes('累计获得（已扣除撤回）'));assert(html.includes('100 晶钻'));assert(html.includes('使用和到期不减少累计'));
 })

 test('字段校验保留嵌套行路径，错误文案和控件关联可定位',async()=>{
  const fields=[model.group('offer','方案',[model.rows('slots','时段',[model.date('starts_at','开始时间')])])]
  let error;try{model.encode(fields,{offer:{slots:[{starts_at:'invalid'}]}})}catch(e){error=e}
  assert(error instanceof model.BusinessFormError);assert.deepEqual(error.fieldPath,['offer','slots','0','starts_at'])
  const {explainError}=await server.ssrLoadModule('/src/api/errors.ts');assert(explainError(error).includes('开始时间'))
  const {default:Fields}=await server.ssrLoadModule('/src/components/business/BusinessFields.vue'),html=await renderToString(createSSRApp({render:()=>h(Fields,{fields,modelValue:{offer:{slots:[{starts_at:'invalid'}]}},prefix:'offer',errors:{'offer-offer-slots-0-starts_at':error.message}})}))
  assert(html.includes('aria-invalid="true"'));assert(html.includes('aria-describedby="offer-offer-slots-0-starts_at-error"'));assert(html.includes('id="offer-offer-slots-0-starts_at-field"'));assert(html.includes('请核对“开始时间”'))
 })
 test('未提交草稿在切换动作和离页时保护，取消确认不丢输入，待核对原请求仍阻止离开',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'window');let confirms=0,discard=false
  Object.defineProperty(globalThis,'window',{configurable:true,value:{confirm:()=>{confirms++;return discard}}})
  try{await render('/stock/listings/'+id(5),{id:id(5),seller_party_id:id(2),current_status:'LISTED',object_version:2,data:{rule_id:id(6)}},async vm=>{
   vm.chooseAction('listing');assert.equal(vm.dirty,false);assert.equal(vm.draft.rule_id,'');vm.draft.description='本次未提交影片介绍';assert.equal(vm.dirty,true)
   vm.chooseAction('unlist');assert.equal(vm.operationKey,'listing');assert.equal(vm.draft.description,'本次未提交影片介绍');assert.equal(vm.leave(),false);assert.equal(confirms,2)
   let prevented=false;vm.unload({preventDefault:()=>prevented=true,returnValue:undefined});assert(prevented)
   discard=true;vm.chooseAction('unlist');assert.equal(vm.operationKey,'unlist');assert.equal(vm.dirty,false)
   vm.ui.pending.value={label:'original'};assert.equal(vm.leave(),false);assert.equal(confirms,3)
  })}finally{if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else delete globalThis.window}
 })
 test('列表支持前后页与过滤位置恢复，重筛从第一页开始',async()=>{
  storage.clear();const {vm}=await render('/stock/listings',{items:[],next_cursor:id(7)});vm.filters={city:'北京'};const urls=[]
  globalThis.fetch=async url=>{urls.push(String(url));return response({items:[],next_cursor:null})}
  await vm.page('next');assert.equal(vm.cursor,id(7));assert.deepEqual(vm.previousCursors,['']);assert(urls[0].includes('cursor='+id(7)))
  vm.reset();assert.equal(vm.cursor,id(7));assert.equal(vm.filters.city,'北京');await vm.page('previous');assert.equal(vm.cursor,'');assert.deepEqual(vm.previousCursors,[])
  vm.cursor=id(7);vm.previousCursors=[''];await vm.applyFilters();assert.equal(vm.cursor,'');assert.deepEqual(vm.previousCursors,[])
  const navigation=await server.ssrLoadModule('/src/business/navigation.ts');navigation.clearBusinessLists();vm.reset();assert.equal(vm.cursor,'')
 })
 test('默认城市通过各目录现有city参数读取，不引入搜索或定位参数',async()=>{
  const city=await server.ssrLoadModule('/src/business/directoryCity.ts'),navigation=await server.ssrLoadModule('/src/business/navigation.ts')
  navigation.clearBusinessLists();city.setDirectoryCity(' 杭州 ')
  try{for(const path of ['/stock/catalog','/notices/catalog','/auditions/catalog','/engagement/buyers']){
   const urls=[];globalThis.fetch=async url=>{urls.push(String(url));return response({items:[],next_cursor:null},null)}
   await render(path,null,async vm=>{vm.reset();await vm.load();assert.equal(vm.filters.city,'杭州')})
   assert.equal(urls.length,1);const query=new URL(urls[0],'https://test.invalid').searchParams;assert.equal(query.get('city'),'杭州');assert.equal(query.has('q'),false)
  }}finally{city.setDirectoryCity('');navigation.clearBusinessLists()}
 })
 test('返回目录保留局部过滤与页码，默认城市改变只重置跟随目录的游标',async()=>{
  const city=await server.ssrLoadModule('/src/business/directoryCity.ts'),navigation=await server.ssrLoadModule('/src/business/navigation.ts')
  navigation.clearBusinessLists();city.setDirectoryCity('杭州')
  try{await render('/stock/catalog',null,async vm=>{
   const urls=[];globalThis.fetch=async url=>{urls.push(String(url));return response({items:[],next_cursor:id(7)},null)}
   vm.reset();vm.filters.person_id=id(9);await vm.load();await vm.page('next');assert.equal(vm.cursor,id(7));vm.reset();assert.equal(vm.cursor,id(7));assert.equal(vm.filters.person_id,id(9))
   city.setDirectoryCity('北京');vm.reset();assert.equal(vm.filters.city,'北京');assert.equal(vm.filters.person_id,id(9));assert.equal(vm.cursor,'');assert.deepEqual(vm.previousCursors,[])
   vm.filters.city='南京';await vm.applyFilters();await vm.page('next');assert.equal(vm.localCity,true);city.setDirectoryCity('上海');vm.reset();assert.equal(vm.filters.city,'南京');assert.equal(vm.cursor,id(7))
   await vm.useDefaultCity();assert.equal(vm.localCity,false);assert.equal(vm.filters.city,'上海');assert.equal(vm.cursor,'');assert.equal(vm.filters.person_id,id(9));assert(!urls.at(-1).includes('cursor='))
  })}finally{city.setDirectoryCity('');navigation.clearBusinessLists()}
 })
 test('同页改默认城市先保护未提交内容和未知写入，取消不改全局或游标',async()=>{
  const city=await server.ssrLoadModule('/src/business/directoryCity.ts'),navigation=await server.ssrLoadModule('/src/business/navigation.ts'),descriptor=Object.getOwnPropertyDescriptor(globalThis,'window')
  let discard=false,confirms=0,reads=0
  Object.defineProperty(globalThis,'window',{configurable:true,value:{confirm:()=>{confirms++;return discard}}})
  navigation.clearBusinessLists();city.setDirectoryCity('杭州');globalThis.fetch=async()=>{reads++;return response({items:[],next_cursor:null},null)}
  try{await render('/engagement/buyers',null,async vm=>{
   vm.reset();vm.operationKey='buyer-city';vm.draft.city='尚未提交城市';vm.cursor=id(7)
   await vm.changeDefaultCity('北京');assert.equal(city.directoryCity.value,'杭州');assert.equal(vm.cursor,id(7));assert.equal(vm.draft.city,'尚未提交城市');assert.equal(reads,0);assert.equal(confirms,1)
   discard=true;await vm.changeDefaultCity('北京');assert.equal(city.directoryCity.value,'北京');assert.equal(vm.operationKey,'');assert.equal(vm.cursor,'');assert.equal(reads,1)
   vm.ui.pending.value={label:'原请求'};await vm.changeDefaultCity('上海');assert.equal(city.directoryCity.value,'北京');assert.equal(reads,1);assert(vm.ui.notice.value.includes('先在本页完成核对'))
  })}finally{city.setDirectoryCity('');navigation.clearBusinessLists();if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else delete globalThis.window}
 })
 test('默认城市仍服从当前目录字段上限，不截断也不发送非法过滤',async()=>{
  const city=await server.ssrLoadModule('/src/business/directoryCity.ts'),navigation=await server.ssrLoadModule('/src/business/navigation.ts');navigation.clearBusinessLists();city.setDirectoryCity('杭州');let reads=0
  globalThis.fetch=async()=>{reads++;return response({items:[],next_cursor:null},null)}
  try{await render('/notices/catalog',null,async vm=>{vm.reset();await vm.changeDefaultCity('城'.repeat(81));assert.equal(city.directoryCity.value,'杭州');assert.equal(vm.ui.error.value.code,'BUSINESS_FORM_INVALID');assert.equal(reads,0)})}finally{city.setDirectoryCity('');navigation.clearBusinessLists()}
 })
 test('换默认城市后旧分页响应不能覆盖结果或恢复旧游标',async()=>{
  const city=await server.ssrLoadModule('/src/business/directoryCity.ts'),navigation=await server.ssrLoadModule('/src/business/navigation.ts');navigation.clearBusinessLists();city.setDirectoryCity('杭州')
  try{await render('/stock/catalog',null,async vm=>{
   vm.reset();globalThis.fetch=async()=>response({items:[],next_cursor:id(7)},null);await vm.load()
   let resolve;const waiting=new Promise(done=>{resolve=done});globalThis.fetch=()=>waiting
   const oldPage=vm.page('next');assert.equal(vm.cursor,id(7))
   globalThis.fetch=async()=>response({items:[{id:id(9),title:'北京结果'}],next_cursor:null},null)
   await vm.changeDefaultCity('北京');assert.equal(vm.cursor,'')
   resolve(response({items:[{id:id(8),title:'杭州旧页'}],next_cursor:null},null));await oldPage
   assert.equal(vm.filters.city,'北京');assert.equal(vm.ui.data.value.items[0].title,'北京结果');assert.equal(vm.cursor,'');assert.deepEqual(vm.previousCursors,[])
  })}finally{city.setDirectoryCity('');navigation.clearBusinessLists()}
 })
 test('手动城市尚未重新筛选时，下一页重新读首屏而不混用旧游标',async()=>{
  const city=await server.ssrLoadModule('/src/business/directoryCity.ts'),navigation=await server.ssrLoadModule('/src/business/navigation.ts');navigation.clearBusinessLists();city.setDirectoryCity('杭州')
  try{await render('/stock/catalog',null,async vm=>{
   vm.reset();const urls=[];globalThis.fetch=async url=>{urls.push(String(url));return response({items:[],next_cursor:id(7)},null)};await vm.load();vm.filters.city='北京';await vm.page('next')
   const query=new URL(urls.at(-1),'https://test.invalid').searchParams;assert.equal(query.get('city'),'北京');assert.equal(query.has('cursor'),false);assert.equal(vm.cursor,'')
  })}finally{city.setDirectoryCity('');navigation.clearBusinessLists()}
 })
 test('可办动作遵从明确权限和业务状态，缺权限清单不显示为已确认可办',async()=>{
  const {actionAvailability}=await server.ssrLoadModule('/src/business/availability.ts'),ctx={accountId:id(1),partyId:id(2),membershipActive:true,owner:true}
  assert(actionAvailability('cocreation',operation('cocreation','invite'),{id:id(5),object_version:2,current_status:'OPEN',allowed_actions:['READ','SUBMIT_OWN']},ctx).blocked)
  const uncertain=actionAvailability('stock',operation('stock','unlist'),{id:id(5),object_version:2,current_status:'LISTED',seller_party_id:id(2)},ctx);assert(!uncertain.blocked);assert.equal(uncertain.explicit,false);assert(uncertain.reason.includes('未提供完整可办清单'))
  assert(actionAvailability('stock',operation('stock','unlist'),{id:id(5),object_version:2,current_status:'RIGHTS_HOLD',data:{rights_hold:true}},ctx).blocked)
  for(const record of [null,{items:[]},{id:id(5),current_status:'UNLISTED'}])assert(actionAvailability('stock',operation('stock','checkout'),record,ctx).blocked)
  assert(!actionAvailability('stock',operation('stock','checkout'),{id:id(5),object_version:3,offer_sha256:sha},ctx).blocked)
  assert(actionAvailability('stock',operation('stock','rights'),{id:id(5),object_version:2,current_status:'IN_REVIEW',created_by:id(1)},ctx).blocked)
  assert(!actionAvailability('auditions',operation('auditions','checkout'),{id:id(5),object_version:2,current_status:'READY_TO_PAY',kind:'BOOKING',owner_party_id:id(2)},ctx).blocked)
  assert(actionAvailability('auditions',operation('auditions','decision'),{id:id(5),object_version:2,current_status:'AWAITING_ACCEPTANCE',kind:'BOOKING',owner_party_id:id(2)},ctx).blocked)
  assert(actionAvailability('notices',operation('notices','decision'),{id:id(5),object_version:2,current_status:'SENT',counterparty_id:id(9)},ctx).blocked)
 })
 test('首次供给读取新目录，不能从旧记录推断规则；共创改用当前建房目录',async()=>{
  const {businessPrerequisite}=await server.ssrLoadModule('/src/business/prerequisites.ts')
  assert.equal(businessPrerequisite('stock','listing'),null);assert.equal(businessPrerequisite('auditions','offer'),null);assert.equal(businessPrerequisite('cocreation','room'),null)
  await render('/stock/listings/'+id(5),{id:id(5),object_version:2,current_status:'LISTED',data:{rule_id:id(6)}},async vm=>{
   vm.operationKey='listing';vm.prefill();assert.equal(vm.draft.rule_id,'');assert.equal(vm.prerequisite,null)
   let writes=0;globalThis.fetch=async()=>{writes++;return response({})};vm.agreed=true;await vm.submit();assert.equal(writes,0)
   vm.chosenReferences=[{id:id(5),rule_id:id(6)}];const urls=[];globalThis.fetch=async url=>{urls.push(String(url));return response({items:[],next_cursor:urls.length===1?id(20):null})};await vm.loadChoices({field:model.id('rule_id','规则'),context:{spec_id:id(8)},key:'listing-rule_id'});assert.deepEqual(vm.refOptions['listing-rule_id'],[]);assert.equal(urls.length,2);assert(urls.every(u=>u.includes('/stock/sales-publications')))
  })
 })
 test('通告投稿授权只读取当前人物和通告的匹配上下文，拒绝错人回包',async()=>{
  const source=references.sourceFor('consent_id',{person_id:id(3),notice_id:id(4)},'notices',id(2));assert(source.path.startsWith('/notices/submission-options?'));assert.equal(references.sourceFor('consent_id',{person_id:id(3)},'notices',id(2)).path,'/artists/people/'+id(3)+'/records?kind=CONSENT')
  const data={notice_id:id(4),rule_id:id(5),items:[{person_id:id(3),avatar_id:id(6),consent_id:id(7),target_party_id:id(8),valid_from:at,valid_until:until}],next_cursor:null}
  globalThis.fetch=async()=>response(data);const result=await references.readReferences(source,{token:'test',accountId:id(1),partyId:id(2)});const choice=references.referenceOptions(result.items,'consent_id')[0];assert.equal(choice.value,id(7));assert.equal(choice.record.rule_id,id(5));assert.equal(choice.record.notice_id,id(4))
  globalThis.fetch=async()=>response({...data,items:[{...data.items[0],person_id:id(9)}]});await assert.rejects(references.readReferences(source,{token:'test',accountId:id(1),partyId:id(2)}),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE')
 })
 test('公开邀约通过当前上下文绑定来源，换来源清除旧授权，过期失败不保留旧资格',async()=>{
  storage.clear();await render('/notices/submissions',null,async vm=>{vm.operationKey='invitation';vm.draft.rule_id=id(5);vm.draft.submission.source_listing_id=id(6)
  const context={rule_id:id(5),listing_id:id(6),person_id:id(7),avatar_id:id(8),consent_id:id(9),target_party_id:id(10),display_name:'当前公开艺人'};let path=''
  globalThis.fetch=async url=>{path=String(url);return response(context)};await vm.readInvitationContext();assert(path.includes('/notices/invitation-context?'));assert.equal(vm.draft.submission.person_id,id(7));assert.equal(vm.draft.submission.consent_id,id(9));assert(vm.invitationContext)
  vm.draft.submission.source_listing_id=id(11);assert.equal(vm.invitationContext,null);assert.equal(vm.draft.submission.consent_id,'')
  globalThis.fetch=async()=>failure(409,'NOTICE_ARTIST_NOT_PUBLIC');await vm.readInvitationContext();assert.equal(vm.invitationContext,null);assert.equal(vm.draft.submission.person_id,'')})
  assert.equal(loginRedirect('/notices/submissions?action=invitation&sourceListing='+id(6)),'/notices/submissions?action=invitation&sourceListing='+id(6));assert.equal(loginRedirect('/notices/submissions?action=invitation&sourceListing=https://example.com'),'/workspace')
 })
 test('隐私展示名只适用于资料更正，删除或注销明确提交null',()=>{
  const fields=operation('privacy','propose').fields,value={action:'FILE_ERASURE',target_id:id(3),policy_rule_id:id(4),details:{display_name:'不应带入',target_kind:'ASSET',reason:'本人请求'}}
  assert.equal(model.encode(fields,value).details.display_name,null);assert.equal(model.encode(fields,{...value,action:'PROFILE_CORRECTION'}).details.display_name,'不应带入')
 })


 test('迟到邀约响应不能覆盖新规则、新来源或切换后的身份',async()=>{
  storage.clear();await render('/notices/submissions',null,async(vm,session)=>{
   vm.operationKey='invitation';vm.draft.rule_id=id(5);vm.draft.submission.source_listing_id=id(6)
   const context=(listing,rule=id(5))=>({rule_id:rule,listing_id:listing,person_id:id(7),avatar_id:id(8),consent_id:id(9),target_party_id:id(10),display_name:'合成公开艺人'})
   let releaseOld;globalThis.fetch=()=>new Promise(resolve=>releaseOld=resolve);const old=vm.readInvitationContext()
   vm.draft.submission.source_listing_id=id(11);vm.draft.rule_id=id(12);globalThis.fetch=async()=>response(context(id(11),id(12)));await vm.readInvitationContext();assert.equal(vm.invitationContext.listing_id,id(11))
   releaseOld(response(context(id(6))));await old;assert.equal(vm.invitationContext.listing_id,id(11));assert.equal(vm.draft.rule_id,id(12));assert.equal(vm.refBusy,false)
   let releaseIdentity;globalThis.fetch=()=>new Promise(resolve=>releaseIdentity=resolve);const changing=vm.readInvitationContext();session.selectedId=id(99);releaseIdentity(response(context(id(11),id(12))));await changing;assert.equal(vm.invitationContext,null);assert.equal(vm.operationKey,'');assert.deepEqual(vm.draft,{})
  })
 })
 test('合法共创入组与试镜后续状态保持可填写，已证实错误身份或阶段阻止提交',async()=>{
  await render('/cocreation/rooms/'+id(5),{id:id(5),object_version:1,current_status:'OPEN',participation_sha256:sha,allowed_actions:['READ','SUBMIT_OWN','WITHDRAW']},async vm=>{
   assert(vm.actions.some(a=>a.key==='join'));vm.chooseAction('join');assert.equal(vm.operationKey,'join');assert.equal(vm.actionUnavailable,false);assert.equal(vm.availability(vm.action).explicit,false);assert.equal(vm.draft.participation_sha256,sha)
   vm.ui.pending.value={label:'original'};assert.equal(vm.leave(),false)
  })
  await render('/auditions/bookings/'+id(5),{id:id(5),kind:'BOOKING',object_version:1,current_status:'ACCEPTED',owner_party_id:id(3),counterparty_id:id(2),data:{appointment:{mode:'ONLINE_MATERIALS'},departed_at:null,reschedule:null,dispute:null}},async vm=>{
   vm.chooseAction('travel');assert.equal(vm.operationKey,'travel');assert.equal(vm.actionUnavailable,false)
   vm.chooseAction('delivery');assert.equal(vm.operationKey,'delivery');assert.equal(vm.actionUnavailable,false)
   vm.chooseAction('reschedule');assert.equal(vm.operationKey,'reschedule');assert.equal(vm.actionUnavailable,false)
   vm.selected={...vm.selected,current_status:'DEPARTED',data:{...vm.selected.data,departed_at:at}};assert.equal(vm.actionUnavailable,true)
  })
  await render('/auditions/bookings/'+id(5),{id:id(5),kind:'BOOKING',object_version:1,current_status:'AWAITING_ACCEPTANCE',owner_party_id:id(3),counterparty_id:id(2),data:{}},async vm=>{vm.chooseAction('decision');assert.equal(vm.operationKey,'decision');assert.equal(vm.actionUnavailable,false)})
 })


 test('读取邀约资格期间修改用途和内容，结果合并到当前表单且保留新文本',async()=>{
  storage.clear();await render('/notices/submissions',null,async vm=>{
   vm.operationKey='invitation';vm.draft.rule_id=id(5);vm.draft.submission.source_listing_id=id(6)
   let release;globalThis.fetch=()=>new Promise(resolve=>release=resolve);const reading=vm.readInvitationContext()
   vm.draft={...vm.draft,submission:{...vm.draft.submission,purpose:'等待期间填写的新用途',content:'等待期间填写的新合作内容'}}
   release(response({rule_id:id(5),listing_id:id(6),person_id:id(7),avatar_id:id(8),consent_id:id(9),target_party_id:id(10),display_name:'合成公开艺人'}));await reading
   assert.equal(vm.draft.submission.purpose,'等待期间填写的新用途');assert.equal(vm.draft.submission.content,'等待期间填写的新合作内容');assert.equal(vm.draft.submission.person_id,id(7));assert.equal(vm.draft.submission.consent_id,id(9));assert.equal(vm.invitationContext.listing_id,id(6))
  })
 })


 test('本人主动投稿可不挂通告，从本人当前可读合作授权带入接收方和数字人',async()=>{
  storage.clear();await render('/notices/submissions',null,async vm=>{
   vm.operationKey='submission';vm.draft.submission.person_id=id(3);vm.draft.rule_id=id(5);vm.draft.submission.kind='PROFILE';vm.draft.submission.purpose='本人合作用途';vm.draft.submission.content='本人主动投递内容'
   const fields=vm.actionFields.find(f=>f.key==='submission').fields;assert(!fields.find(f=>f.key==='target_party_id').readonly);assert(!fields.find(f=>f.key==='avatar_id').readonly)
   const consent={id:id(7),kind:'CONSENT',person_id:id(3),avatar_id:id(6),object_version:1,current_status:'APPROVED',data:{grantee_party_id:id(8),purposes:['COOPERATION_SUBMISSION'],valid_from:at,valid_until:until}}
   let url='';globalThis.fetch=async path=>{url=String(path);return response({items:[consent],next_cursor:null})};await vm.loadChoices({field:model.id('consent_id','投稿授权'),context:vm.draft.submission,key:'submission-submission-consent_id'});assert(url.includes('/artists/people/'+id(3)+'/records?kind=CONSENT'));assert.equal(vm.refOptions['submission-submission-consent_id'][0].value,id(7))
   vm.selectedReference({field:model.id('consent_id','投稿授权'),record:consent});const payload=model.encode(vm.actionFields,vm.draft);assert.equal(payload.submission.notice_id,null);assert.equal(payload.submission.target_party_id,id(8));assert.equal(payload.submission.avatar_id,id(6));assert.equal(payload.submission.consent_id,id(7))
   vm.draft.submission.notice_id=id(4);const scoped=vm.actionFields.find(f=>f.key==='submission').fields;assert.equal(scoped.find(f=>f.key==='target_party_id').readonly,true);assert.equal(scoped.find(f=>f.key==='avatar_id').readonly,true);assert.equal(vm.draft.submission.consent_id,'')
  })
 })


 test('选择人物只清本行依赖选项，保留本人友好名、规则和其他人物行',async()=>{
  storage.clear();let snapshot
  await render('/notices/submissions',null,async(vm,session)=>{
   vm.operationKey='submission';const person={id:id(3),display_name:'本人友好名称',current_status:'ACTIVE'},personKey='submission-submission-person_id'
   vm.refOptions={[personKey]:[{value:id(3),label:'本人友好名称',record:person}], 'submission-rule_id':[{value:id(5),label:'已读取规则',record:{id:id(5)}}], 'submission-submission-avatar_id':[{value:id(6),label:'旧数字人',record:{id:id(6)}}], 'submission-submission-consent_id':[{value:id(7),label:'旧授权',record:{id:id(7)}}], 'other-person-avatar_id':[{value:id(8),label:'另一人物数字人',record:{id:id(8)}}]}
   vm.refCursor={[personKey]:id(20),'submission-rule_id':id(21),'submission-submission-consent_id':id(22)};vm.referenceSources={[personKey]:'/artists/people','submission-rule_id':'/notices/rules','submission-submission-consent_id':'old-person'}
   vm.draft.submission.person_id=id(3);vm.selectedReference({field:model.id('person_id','本人'),record:person,key:personKey})
   assert.equal(vm.refOptions[personKey][0].label,'本人友好名称');assert.equal(vm.refCursor[personKey],id(20));assert.equal(vm.referenceSources[personKey],'/artists/people');assert.equal(vm.refOptions['submission-rule_id'][0].label,'已读取规则');assert.equal(vm.refOptions['other-person-avatar_id'][0].label,'另一人物数字人');assert.equal(vm.refOptions['submission-submission-avatar_id'],undefined);assert.equal(vm.refOptions['submission-submission-consent_id'],undefined);assert.equal(vm.refCursor['submission-submission-consent_id'],undefined)
   snapshot={value:{person_id:id(3)},options:JSON.parse(JSON.stringify(vm.refOptions))};session.selectedId=id(99);assert.deepEqual(vm.refOptions,{})
  })
  const {default:Fields}=await server.ssrLoadModule('/src/components/business/BusinessFields.vue'),html=await renderToString(createSSRApp({render:()=>h(Fields,{fields:[model.id('person_id','本人')],modelValue:snapshot.value,prefix:'submission-submission',references:snapshot.options})}));assert(html.includes('本人友好名称'));assert(!html.includes('当前关联编号，仍需读取核对'));assert(!html.includes('原记录已关联'))
 })
 test('投稿匹配上下文为只读绑定提供已核对标签，变更来源仅清依赖标签',async()=>{
  storage.clear();let snapshot
  await render('/notices/submissions',null,async vm=>{
   vm.operationKey='submission';vm.draft.submission.person_id=id(3);vm.draft.submission.notice_id=id(4)
   vm.refOptions={'submission-submission-person_id':[{value:id(3),label:'已读取本人姓名',record:{id:id(3)}}],'submission-rule_id':[{value:id(5),label:'已读取规则一',record:{id:id(5)}},{value:id(9),label:'已读取规则二',record:{id:id(9)}}]};vm.referenceSources={'submission-rule_id':'/notices/rules'}
   const option={person_id:id(3),notice_id:id(4),rule_id:id(5),avatar_id:id(6),consent_id:id(7),target_party_id:id(8)};vm.selectedReference({field:model.id('consent_id','授权'),record:option,key:'submission-submission-consent_id'})
   assert.equal(vm.refOptions['submission-submission-avatar_id'][0].label,'本次获准投稿的数字人');assert.equal(vm.refOptions['submission-submission-target_party_id'][0].label,'本通告接收方（本次授权已核对）');assert.equal(vm.refOptions['submission-rule_id'].length,2);assert.equal(vm.referenceSources['submission-rule_id'],'/notices/rules')
   snapshot={value:JSON.parse(JSON.stringify(vm.draft.submission)),options:JSON.parse(JSON.stringify(vm.refOptions))};vm.draft.submission.notice_id=id(10);assert.equal(vm.refOptions['submission-submission-avatar_id'],undefined);assert.equal(vm.refOptions['submission-submission-target_party_id'],undefined);assert.equal(vm.refOptions['submission-submission-person_id'][0].label,'已读取本人姓名');assert.equal(vm.refOptions['submission-rule_id'].length,2)
  })
  const {default:Fields}=await server.ssrLoadModule('/src/components/business/BusinessFields.vue'),html=await renderToString(createSSRApp({render:()=>h(Fields,{fields:[{...model.id('avatar_id','数字人'),readonly:true},{...model.id('target_party_id','接收方'),readonly:true}],modelValue:snapshot.value,prefix:'submission-submission',references:snapshot.options})}));assert(html.includes('本次获准投稿的数字人'));assert(html.includes('本通告接收方（本次授权已核对）'));assert(!html.includes('当前关联编号，仍需读取核对'));assert(!html.includes('原记录已关联'))
 })
 test('邀约上下文绑定有明确标签，换规则或读取失败清绑定但不清公开来源与规则选项',async()=>{
  storage.clear();await render('/notices/submissions',null,async vm=>{
   vm.operationKey='invitation';vm.draft.rule_id=id(5);vm.draft.submission.source_listing_id=id(6)
   vm.refOptions={'invitation-rule_id':[{value:id(5),label:'规则一',record:{id:id(5)}},{value:id(12),label:'规则二',record:{id:id(12)}}],'invitation-submission-source_listing_id':[{value:id(6),label:'公开艺人甲',record:{listing_id:id(6)}},{value:id(11),label:'公开艺人乙',record:{listing_id:id(11)}}]}
   globalThis.fetch=async()=>response({rule_id:id(5),listing_id:id(6),person_id:id(7),avatar_id:id(8),consent_id:id(9),target_party_id:id(10),display_name:'公开艺人甲'});await vm.readInvitationContext()
   assert(vm.refOptions['invitation-submission-person_id'][0].label.includes('公开艺人甲'));assert.equal(vm.refOptions['invitation-submission-avatar_id'][0].label,'本次公开展示对应的数字人');assert.equal(vm.refOptions['invitation-submission-target_party_id'][0].label,'本次邀约的艺人接收方');assert.equal(vm.refOptions['invitation-submission-source_listing_id'].length,2)
   vm.draft.rule_id=id(12);assert.equal(vm.refOptions['invitation-submission-person_id'],undefined);assert.equal(vm.refOptions['invitation-submission-avatar_id'],undefined);assert.equal(vm.refOptions['invitation-submission-source_listing_id'].length,2);assert.equal(vm.refOptions['invitation-rule_id'].length,2)
   globalThis.fetch=async()=>failure(409,'NOTICE_ARTIST_NOT_PUBLIC');await vm.readInvitationContext();assert.equal(vm.invitationContext,null);assert.equal(vm.refOptions['invitation-submission-consent_id'],undefined);assert.equal(vm.refOptions['invitation-submission-source_listing_id'][0].label,'公开艺人甲')
  })
 })


 const creation=await server.ssrLoadModule('/src/business/cocreationCreation.ts')
 const creationRule={version:'SYNTHETIC-1',source_ref:'LOCAL-TEST',max_people:30,extension_days:7,participation_terms:'本人独立确认本次参加与授权。',benefit:{service_code:'SYNTHETIC',description:'合成测试服务额度',credit_minor:5000,valid_days:30}}
 const ruleOption={id:id(4),content_sha256:require(`${root}/../backend_server/src/modules/governance/content.js`).digest({rule:creationRule,review:{decision:'APPROVE',reason:'synthetic'}}),rule:creationRule}
 const producerOption={id:id(3),display_name:'本次平台承制方',role:'PLATFORM_CONTRACTING_PARTY'}
 const storyOption=(n,status='SUBMITTED')=>({id:id(n),party_id:id(2),template_version_id:id(90),category_title:'本人的合成故事'+n,current_status:status,object_version:status==='DRAFT'?1:2,submitted_at:status==='DRAFT'?null:at,intake_at:status==='INTAKE'?at:null,allowed_actions:status==='DRAFT'?['READ','SAVE','SUBMIT']:['READ']})
 const roomBody=()=>({request_id:id(5),producer_party_id:id(3),rule_id:id(4),title:'本次共同故事',deadline:until,purpose:'共同制作与约定分享',territory:'中国'})
 const roomReply=(body=roomBody())=>({id:id(20),object_version:1,current_status:'OPEN',title:body.title,deadline:body.deadline,producer_party_id:body.producer_party_id,purpose:body.purpose,territory:body.territory,rule_snapshot:creationRule,participation_sha256:sha,counts:{joined_count:0,eligible_count:0,minimum_people:10,benefit_people:20,people_remaining:10,benefit_remaining:20},cutoff:null,order_id:null,project_id:null,members:[],allowed_actions:['READ','INVITE','CLOSE','REQUEST_EXTENSION','REQUEST_CANCEL']})
 const creationResponse=url=>{const u=new URL(url,'http://local');return response({items:u.searchParams.get('kind')==='PRODUCER'?[producerOption]:[ruleOption],next_cursor:null,unavailable_reason:null})}
 async function readyCreation(vm){vm.operationKey='room';vm.draft={...roomBody(),producer_party_id:'',rule_id:''};await vm.readCreationContext();vm.draft.producer_party_id=id(3);vm.draft.rule_id=id(4);vm.agreed=true;assert(vm.creationReady)}
 test('首次共创按故事读取当前目录，不拿本人机构或全局规则作获准选项',async()=>{
  assert.equal(references.sourceFor('rule_id',{},'cocreation',id(2)),null)
  assert.equal(references.sourceFor('producer_party_id',{},'cocreation',id(2)),null)
  for(const [field,kind]of [['rule_id','RULE'],['producer_party_id','PRODUCER']]){const source=references.sourceFor(field,{request_id:id(5)},'cocreation',id(2)),url=new URL(source.path,'http://local');assert.equal(source.party,'required');assert.equal(url.pathname,'/cocreation/creation-options');assert.equal(url.searchParams.get('request_id'),id(5));assert.equal(url.searchParams.get('kind'),kind)}
  storage.clear();await render('/cocreation/rooms',null,async vm=>{
   vm.operationKey='room';vm.chosenReferences=[{id:id(80),rule_id:id(81),producer_party_id:id(2)}];let reads=0;globalThis.fetch=async url=>{reads++;return creationResponse(url)}
   await vm.loadChoices({field:model.id('producer_party_id','承制方'),context:vm.draft,key:'room-producer_party_id'});assert.equal(reads,0);assert.equal(vm.refOptions['room-producer_party_id'],undefined)
   vm.draft.request_id=id(5);await vm.loadChoices({field:model.id('rule_id','规则'),context:vm.draft,key:'room-rule_id'});assert.equal(reads,2);assert.equal(vm.refOptions['room-producer_party_id'][0].value,id(3));assert.equal(vm.refOptions['room-rule_id'][0].value,id(4));assert(!vm.creationReady)
  })
  assert.equal(operation('cocreation','room').fields.find(f=>f.key==='purpose').max,100)
 })
 test('建房故事目录过滤草稿且空页继续，规则分页保留全部真实选项',async()=>{
  storage.clear();await render('/cocreation/rooms',null,async vm=>{
   vm.operationKey='room';const calls=[];globalThis.fetch=async url=>{const u=new URL(url,'http://local');calls.push(u);if(u.pathname==='/api/v1/customization-requests')return response(u.searchParams.has('cursor')?{items:[storyOption(5),storyOption(6,'INTAKE')],next_cursor:null}:{items:[storyOption(7,'DRAFT')],next_cursor:'signed-story-cursor'});if(u.searchParams.get('kind')==='RULE')return response(u.searchParams.has('cursor')?{items:[ruleOption],next_cursor:null,unavailable_reason:null}:{items:[],next_cursor:id(9),unavailable_reason:null});return creationResponse(url)}
   await vm.readCreationStories();assert.deepEqual(vm.refOptions['room-request_id'].map(o=>o.value),[id(5),id(6)]);assert(vm.refOptions['room-request_id'][0].label.includes('本人的合成故事'));vm.draft.request_id=id(5);await vm.readCreationContext();assert.equal(vm.refOptions['room-rule_id'][0].value,id(4));assert(calls.some(u=>u.searchParams.get('cursor')==='signed-story-cursor'));assert(calls.some(u=>u.searchParams.get('cursor')===id(9)))
  })
 })
 test('生效规则摘要包含审核数据，校验格式与结构而不误算为仅rule的摘要',()=>{
  assert.notEqual(ruleOption.content_sha256,require(`${root}/../backend_server/src/modules/governance/content.js`).digest({rule:creationRule}))
  assert.equal(creation.creationPage({items:[ruleOption],next_cursor:null,unavailable_reason:null},'RULE').items[0].id,id(4))
  for(const invalid of [{...ruleOption,content_sha256:'fake'},{...ruleOption,rule:{...creationRule,max_people:10}}])assert.throws(()=>creation.creationPage({items:[invalid],next_cursor:null,unavailable_reason:null},'RULE'))
  assert.throws(()=>creation.creationPage({items:[{...producerOption,role:'PUBLIC_PROFILE'}],next_cursor:null,unavailable_reason:null},'PRODUCER'))
  assert.throws(()=>creation.creationPage({items:[],next_cursor:'external',unavailable_reason:null},'RULE'))
  assert.throws(()=>creation.creationPage({items:[],next_cursor:id(9),unavailable_reason:null},'RULE',id(9)))
 })
 test('换故事清依赖但保留文本，迟到旧目录与拒绝响应不能覆盖新故事',async()=>{
  storage.clear();await render('/cocreation/rooms',null,async vm=>{
   vm.operationKey='room';vm.draft=roomBody();const old=[];globalThis.fetch=()=>new Promise(resolve=>old.push(resolve));const reading=vm.readCreationContext();assert.equal(old.length,2)
   vm.draft.title='等待期间的新名称';vm.draft.purpose='等待期间的新用途';vm.draft.request_id=id(6);assert.equal(vm.draft.rule_id,'');assert.equal(vm.draft.producer_party_id,'');assert.equal(vm.creationVerifiedRequest,'')
   globalThis.fetch=async url=>creationResponse(url);await vm.readCreationContext();assert.equal(vm.creationVerifiedRequest,id(6));old[0](failure(403,'CUSTOMIZATION_MERCHANT_FORBIDDEN'));old[1](response({items:[ruleOption],next_cursor:null,unavailable_reason:null}));await reading
   assert.equal(vm.creationVerifiedRequest,id(6));assert.equal(vm.draft.title,'等待期间的新名称');assert.equal(vm.draft.purpose,'等待期间的新用途');assert.equal(vm.creationProblem,null);assert.equal(vm.refBusy,false)
  })
 })
 test('身份改变清掉建房私有选择，旧身份目录回包不恢复资格',async()=>{
  storage.clear();await render('/cocreation/rooms',null,async(vm,session)=>{
   vm.operationKey='room';vm.draft=roomBody();const old=[];globalThis.fetch=async url=>String(url).includes('creation-options')?new Promise(resolve=>old.push(resolve)):response({items:[],next_cursor:null},session.selectedId)
   const reading=vm.readCreationContext();session.selectedId=id(99);old[0](response({items:[producerOption],next_cursor:null,unavailable_reason:null}));old[1](response({items:[ruleOption],next_cursor:null,unavailable_reason:null}));await reading
   assert.equal(vm.operationKey,'');assert.deepEqual(vm.draft,{});assert.equal(vm.creationVerifiedRequest,'');assert.equal(vm.refOptions['room-rule_id'],undefined)
  })
 })
 test('服务端前置拒绝清获准选择，给原故事报价房间去向且保留本页文本',async()=>{
  for(const code of ['COCREATION_STORY_SUPPLEMENT_PENDING','COCREATION_BEFORE_QUOTE_REQUIRED','CUSTOMIZATION_ORDER_EXISTS','COCREATION_ROOM_EXISTS','MANUAL_SAMPLE_COCREATION_NOT_ALLOWED']){
   storage.clear();await render('/cocreation/rooms',null,async vm=>{
    globalThis.fetch=async url=>creationResponse(url);await readyCreation(vm);globalThis.fetch=async()=>failure(409,code);await vm.readCreationContext()
    assert.equal(vm.draft.title,'本次共同故事');assert.equal(vm.draft.rule_id,'');assert.equal(vm.draft.producer_party_id,'');assert(!vm.creationReady);assert(vm.creationProblem.links.some(link=>link.to==='/operations/customization/mine/'+id(5)))
    if(code==='COCREATION_ROOM_EXISTS')assert(vm.creationProblem.links.some(link=>link.to==='/cocreation/rooms'))
    if(code==='COCREATION_BEFORE_QUOTE_REQUIRED'||code==='CUSTOMIZATION_ORDER_EXISTS')assert(vm.creationProblem.links.some(link=>link.to==='/trade/quotes'))
   })
  }
 })
 test('未配置平台或无生效规则明确不可创建，不自动代选或补规则',async()=>{
  storage.clear();await render('/cocreation/rooms',null,async vm=>{
   vm.operationKey='room';vm.draft=roomBody();globalThis.fetch=async url=>new URL(url,'http://local').searchParams.get('kind')==='PRODUCER'?response({items:[],next_cursor:null,unavailable_reason:'CUSTOMIZATION_MERCHANT_NOT_CONFIGURED'}):creationResponse(url);await vm.readCreationContext();assert(!vm.creationReady);assert(vm.creationProblem.message.includes('尚未配置'));vm.agreed=true;let writes=0;globalThis.fetch=async()=>{writes++;return response({})};await vm.submit();assert.equal(writes,0)
  })
 })
 test('当前目录选择后创建使用真实7字段，回执无request_id也可进入新房间',async()=>{
  storage.clear();await render('/cocreation/rooms',null,async vm=>{
   const calls=[];let body;globalThis.fetch=async(url,o)=>{calls.push({url,o});if(o.method==='POST'){body=JSON.parse(o.body);return response(roomReply(body))}return String(url).includes('creation-options')?creationResponse(url):response(roomReply(body||roomBody()))}
   await readyCreation(vm);await vm.submit();const write=calls.find(c=>c.o.method==='POST');assert.deepEqual(body,roomBody());assert.equal(write.url,'/api/v1/cocreation/rooms');assert.equal(write.o.headers['X-Acting-Party'],id(2));assert.equal(write.o.headers['If-Match'],undefined);assert.equal(vm.route.fullPath,'/cocreation/rooms/'+id(20));assert.equal(vm.ui.pending.value,null)
  })
 })
 test('建房POST遭已有房间拒绝保留文字，不自动重建第二个房间',async()=>{
  storage.clear();await render('/cocreation/rooms',null,async vm=>{
   let writes=0;globalThis.fetch=async(url,o)=>o.method==='POST'?(writes++,failure(409,'COCREATION_ROOM_EXISTS')):creationResponse(url);await readyCreation(vm);await vm.submit();assert.equal(writes,1);assert.equal(vm.ui.pending.value,null);assert.equal(vm.draft.title,'本次共同故事');assert.equal(vm.draft.rule_id,'');assert(vm.creationProblem.links.some(link=>link.to==='/cocreation/rooms'));vm.agreed=true;await vm.submit();assert.equal(writes,1)
  })
 })
 test('承制方配置403清掉失效资格，同时保留原始日期控件值与文字',async()=>{
  storage.clear();await render('/cocreation/rooms',null,async vm=>{
   globalThis.fetch=async(url,o)=>o.method==='POST'?failure(403,'CUSTOMIZATION_MERCHANT_FORBIDDEN'):creationResponse(url);await readyCreation(vm);vm.draft.deadline='2026-11-22T16:00';vm.agreed=true;await vm.submit();assert.equal(vm.operationKey,'room');assert.equal(vm.draft.title,'本次共同故事');assert.equal(vm.draft.deadline,'2026-11-22T16:00');assert.equal(vm.draft.rule_id,'');assert.equal(vm.draft.producer_party_id,'');assert.equal(vm.creationVerifiedRequest,'');assert.equal(vm.ui.pending.value,null)
  })
 })
 test('建房未知结果重开后先核对房间索引再原key恢复，不依赖旧目录资格',async()=>{
  storage.clear();const writes=[];globalThis.fetch=async(url,o)=>{if(o.method==='POST'){writes.push({url,o});return writes.length===1?failure(503,'COMMIT_OUTCOME_UNKNOWN'):response(roomReply(JSON.parse(o.body)))}if(String(url).includes('creation-options'))return creationResponse(url);return response({items:[],next_cursor:null})}
  await render('/cocreation/rooms',null,async vm=>{await readyCreation(vm);await vm.submit();assert(vm.ui.pending.value);assert.equal(vm.ui.pending.value.readPath,'/cocreation/rooms');vm.draft.title='不能替换原请求';vm.agreed=true;await vm.submit();assert.equal(writes.length,1)})
  await render('/cocreation/rooms',null,async vm=>{assert(vm.ui.pending.value);assert.equal(vm.operationKey,'');await vm.checkPending();assert(vm.ui.pending.value.checked);await vm.recover();assert.equal(writes.length,2);assert.equal(writes[0].o.body,writes[1].o.body);assert.equal(writes[0].o.headers['Idempotency-Key'],writes[1].o.headers['Idempotency-Key']);assert.equal(vm.route.fullPath,'/cocreation/rooms/'+id(20));assert.equal(vm.ui.pending.value,null)})
 })
 test('错房间成功回包保持未知原key，重新核对后才能接受匹配回执',async()=>{
  storage.clear();await render('/cocreation/rooms',null,async vm=>{
   const writes=[];globalThis.fetch=async(url,o)=>{if(o.method==='POST'){writes.push(o);return response({...roomReply(JSON.parse(o.body)),...(writes.length===1?{producer_party_id:id(99)}:{})})}return String(url).includes('creation-options')?creationResponse(url):response({items:[],next_cursor:null})}
   await readyCreation(vm);await vm.submit();assert.equal(vm.ui.error.value.code,'UNEXPECTED_RESPONSE_SHAPE');assert(vm.ui.pending.value);assert.equal(vm.route.fullPath,'/cocreation/rooms');await vm.checkPending();await vm.recover();assert.equal(writes[0].headers['Idempotency-Key'],writes[1].headers['Idempotency-Key']);assert.equal(vm.route.fullPath,'/cocreation/rooms/'+id(20))
  })
 })
 test('故事入口只接受严格UUID并核对预选故事，现货退回提示已支持关联修订',async()=>{
  const entry='/cocreation/rooms?action=room&requestId='+id(5);assert.equal(loginRedirect(entry),entry);assert.equal(loginRedirect('/cocreation/rooms?action=room&requestId=evil'),'/workspace');assert.equal(loginRedirect(entry+'&admin=true'),'/workspace')
  storage.clear();await render(entry,null,async vm=>{
   globalThis.fetch=async url=>String(url).includes('creation-options')?creationResponse(url):String(url).includes('/customization-requests')?response({items:[storyOption(5)],next_cursor:null}):response({items:[],next_cursor:null});vm.routeAction();await vm.load();assert.equal(vm.draft.request_id,id(5));assert.equal(vm.creationVerifiedRequest,id(5));assert(vm.refOptions['room-request_id'][0].label.includes('本人的合成故事'));assert(!vm.creationReady)
  })
  const {html}=await render('/stock/listings/'+id(5),{id:id(5),object_version:1,current_status:'REJECTED',data:{}});assert(!html.includes('关联新版本尚未开放'));assert(html.includes('修改材料并重新提交'))
 })

 for(const {name,run}of tests){await run();console.log(`✓ ${name}`)}console.log(`\n${tests.length} business checks passed.`)
}finally{globalThis.fetch=savedFetch;if(storageDescriptor)Object.defineProperty(globalThis,'sessionStorage',storageDescriptor);else delete globalThis.sessionStorage;await server.close()}
