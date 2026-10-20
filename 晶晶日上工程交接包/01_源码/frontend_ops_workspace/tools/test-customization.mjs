import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

const root = fileURLToPath(new URL('..',import.meta.url))
const server = await createServer({root,configFile:false,plugins:[vue()],resolve:{alias:{'@':root+'/src'}},server:{middlewareMode:true},appType:'custom'})
const storageProperty = Object.getOwnPropertyDescriptor(globalThis,'sessionStorage'), storage = new Map()
Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}})
const originalFetch = globalThis.fetch, id = n => String(n).padStart(8,'0')+'-0000-4000-8000-000000000001'
const time = '2026-10-17T08:30:00.123Z', who = {token:'isolated-operator-token',accountId:id(1)}
const template = () => ({title:'家庭故事',description:'合成资料，仅用于测试',fields:[{key:'story',label:'请讲述故事',type:'TEXT',required:true,max_length:500},{key:'style',label:'叙事方式',type:'CHOICE',required:false,options:['纪实','诗意']},{key:'note',label:'补充说明',type:'TEXT',required:false}]})
const record = (status='SUBMITTED',version=2) => ({id:id(10),party_id:id(2),created_by:id(3),template_version_id:id(4),template_snapshot:template(),answers:{story:'合成故事 <script>unsafe</script>',style:'纪实',note:''},current_status:status,object_version:version,submission:{id:id(11),template_snapshot:template(),answers:{story:'合成故事 <script>unsafe</script>',style:'纪实',note:''},content_sha256:'a'.repeat(64),submitted_by:id(3),submitted_at:time},submitted_at:time,intake_at:status==='INTAKE'?time:null,intake_by:status==='INTAKE'?who.accountId:null,allowed_actions:status==='SUBMITTED'?['READ','INTAKE']:['READ']})
const summary = (n=10,status='SUBMITTED') => ({id:id(n),party_id:id(2),template_version_id:id(4),category_title:'家庭故事',current_status:status,object_version:2,submitted_at:time,intake_at:status==='INTAKE'?time:null,allowed_actions:status==='SUBMITTED'?['READ','INTAKE']:['READ']})
const response = (data,identity=who,etag=data?.object_version) => new Response(JSON.stringify({meta:{request_id:'synthetic-request',actor:{account_id:identity.accountId},acting_party:null},data}),{headers:{'Content-Type':'application/json',...(etag?{ETag:`"${etag}"`}:{})}})
const failure = (status,code) => new Response(JSON.stringify({meta:{request_id:'synthetic-request'},error:{code,message:'合成错误',retryable:false}}),{status,headers:{'Content-Type':'application/json'}})
const defer = () => {let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
const tests = [], test = (name,run) => tests.push({name,run})
try {
  const api = await server.ssrLoadModule('/src/api/modules/customization.ts')
  const {useSessionStore} = await server.ssrLoadModule('/src/stores/session.ts')
  const {useCustomizationStore} = await server.ssrLoadModule('/src/stores/customization.ts')
  const {customizationRoutes} = await server.ssrLoadModule('/src/router/customizationRoutes.ts')
  const {loginRedirect} = await server.ssrLoadModule('/src/router/loginRedirect.ts')
  const state = () => {
    const pinia=createPinia(),session=useSessionStore(pinia)
    session.token=who.token;session.account={id:who.accountId,display_name:'测试收件员',current_status:'ACTIVE',object_version:1,allowed_actions:[]}
    const ui=useCustomizationStore(pinia)
    return {pinia,session,ui,stop:()=>{ui.$dispose();session.$dispose()}}
  }
  test('运营列表、详情和受理只带Bearer，保留原游标、空正文和强版本',async()=>{
    const calls=[];globalThis.fetch=async(url,o)=>{calls.push({url,o});return response(url.includes('?')?{items:[summary()],next_cursor:'opaque+/cursor='}:o.method==='POST'?record('INTAKE',3):record())}
    await api.listIntake(who,'SUBMITTED','opaque+/cursor=');await api.getIntake(who,id(10));await api.startIntake(who,{id:id(10),version:2,key:'same-command-key'})
    assert.ok(calls[0].url.includes('cursor=opaque%2B%2Fcursor%3D'))
    for(const c of calls){assert.equal(c.o.headers.Authorization,`Bearer ${who.token}`);assert.equal(c.o.headers['X-Acting-Party'],undefined);assert.equal(c.o.cache,'no-store')}
    assert.equal(calls[2].o.headers['If-Match'],'"2"');assert.equal(calls[2].o.headers['Idempotency-Key'],'same-command-key');assert.equal(calls[2].o.body,'{}')
  })
  test('草稿、正文混入摘要、身份错配和缺失ETag不得作为正式提交展示',async()=>{
    for(const bad of [{...record(),current_status:'DRAFT',submission:null},{...record(),intake_by:who.accountId},{...record(),allowed_actions:['READ','SAVE']},{...record(),submission:{...record().submission,submitted_at:'bad'}}])assert.equal(api.isIntakeRequest(bad),false)
    assert.equal(api.isIntakeSummary({...summary(),answers:{story:'私人草稿'}}),false)
    for(const r of [response(record(),{...who,accountId:id(99)}),response(record(),who,99),response(record(),who,null)]){globalThis.fetch=async()=>r;await assert.rejects(api.getIntake(who,id(10)),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE')}
    globalThis.fetch=async()=>response({items:[{...summary(),current_status:'DRAFT'}],next_cursor:null});await assert.rejects(api.listIntake(who,''),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE')
  })
  test('提交模板和答案必须一致，拒绝未声明字段、非法选择与附件冒充',()=>{
    for(const mutate of [v=>v.answers.story='被另一内容替换',v=>v.submission.template_snapshot.title='另一模板',v=>v.answers.extra='越界字段',v=>v.answers.style='未批准选项',v=>v.template_snapshot.fields.push(v.template_snapshot.fields[0]),v=>v.answers.story='a'.repeat(501)]){const r=record();mutate(r);assert.equal(api.isIntakeRequest(r),false)}
    const r=record();r.template_snapshot.fields.push({key:'proof',label:'附件',type:'PRIVATE_ATTACHMENT',required:false});r.submission.template_snapshot=structuredClone(r.template_snapshot);assert.ok(api.isIntakeRequest(r));r.answers.proof='';r.submission.answers.proof='';assert.ok(api.isIntakeRequest(r));r.answers.proof='https://public.invalid/private';r.submission.answers.proof=r.answers.proof;assert.equal(api.isIntakeRequest(r),false)
    const unicode=record();unicode.answers.story='😀'.repeat(500);unicode.submission.answers.story=unicode.answers.story;assert.ok(api.isIntakeRequest(unicode))
  })
  test('状态切换从首屏读取，游标原值传递且不接受重复游标',async()=>{
    const {ui,stop}=state(),calls=[];globalThis.fetch=async(url)=>{calls.push(url);const q=new URL(url,'http://local').searchParams;return response({items:[summary(q.has('cursor')?12:10,q.get('current_status')||'SUBMITTED')],next_cursor:q.has('cursor')?null:'opaque+=token'})}
    await ui.load();await ui.load(true);assert.equal(ui.rows.length,2);await ui.setStatus('INTAKE');assert.equal(ui.rows.length,1);assert.equal(ui.rows[0].current_status,'INTAKE');assert.equal(new URL(calls[2],'http://local').searchParams.has('cursor'),false)
    globalThis.fetch=async()=>response({items:[],next_cursor:'opaque+=token'});await ui.load(true);assert.equal(ui.error.code,'UNEXPECTED_RESPONSE_SHAPE');stop()
  })
  test('受理按钮使用服务端动作权限，重复点击只发送一次',async()=>{
    const {ui,stop}=state();ui.detail={...record(),allowed_actions:['READ']};assert.equal(ui.canIntake,false);ui.detail=record();assert.equal(ui.canIntake,true)
    const wait=defer();let posts=0;globalThis.fetch=()=>{posts++;return wait.promise};const first=ui.intake();await ui.intake();assert.equal(posts,1);wait.resolve(response(record('INTAKE',3)));await first;assert.equal(ui.detail.intake_by,who.accountId);assert.equal(ui.pending,null);stop()
  })
  test('网络未知结果先查询，再用原key、原空正文、原版本恢复',async()=>{
    for(const network of [true,false]){
      const {ui,stop}=state(),calls=[];ui.detail=record();let posts=0
      globalThis.fetch=async(url,o)=>{calls.push({url,o});if(o.method==='POST'&&++posts===1){if(network)throw Error('lost response');return failure(503,'COMMIT_OUTCOME_UNKNOWN')}return response(o.method==='POST'?record('INTAKE',3):record())}
      await ui.intake();assert.ok(ui.pending);assert.equal(ui.detail,null);await ui.retryPending();assert.equal(posts,1);await ui.checkPending();assert.equal(ui.pending.checked,true);await ui.retryPending();assert.equal(ui.pending,null)
      const writes=calls.filter(c=>c.o.method==='POST');assert.equal(writes[0].o.headers['Idempotency-Key'],writes[1].o.headers['Idempotency-Key']);assert.equal(writes[0].o.headers['If-Match'],writes[1].o.headers['If-Match']);assert.equal(writes[0].o.body,writes[1].o.body);stop()
    }
  })
  test('412刷新原提交并要求重新核对，409已受理不再创建受理',async()=>{
    const {ui,stop}=state();ui.detail=record();globalThis.fetch=async(url,o)=>o.method==='POST'?failure(412,'VERSION_CONFLICT'):response(record('SUBMITTED',4));await ui.intake();assert.equal(ui.detail.object_version,4);assert.equal(ui.pending,null);assert.equal(ui.canIntake,false);assert.equal(ui.conflicted,true);ui.reconfirmed=true;assert.equal(ui.canIntake,true)
    globalThis.fetch=async(url,o)=>o.method==='POST'?failure(409,'CUSTOMIZATION_ALREADY_INTAKE'):response(record('INTAKE',5));await ui.intake();assert.equal(ui.canIntake,false);assert.equal(ui.detail.current_status,'INTAKE');assert.equal(ui.pending,null);stop()
  })
  test('读写失权401/403/404清空提交、列表、游标及未知操作',async()=>{
    for(const status of [401,403,404]){
      const {ui,stop}=state();ui.rows=[summary()];ui.nextCursor='private-cursor';ui.detail=record();globalThis.fetch=async()=>failure(status,'CUSTOMIZATION_FORBIDDEN');await ui.read(id(10));assert.equal(ui.detail,null);assert.deepEqual(ui.rows,[]);assert.equal(ui.nextCursor,null);assert.equal(ui.pending,null);stop()
      const s=state();s.ui.rows=[summary()];s.ui.detail=record();await s.ui.intake();assert.equal(s.ui.detail,null);assert.deepEqual(s.ui.rows,[]);assert.equal(s.ui.pending,null);s.stop()
    }
  })
  test('412后的重新读取若失权，不能残留旧正文和旧确认',async()=>{
    const {ui,stop}=state();ui.detail=record();globalThis.fetch=async(url,o)=>failure(o.method==='POST'?412:404,o.method==='POST'?'VERSION_CONFLICT':'CUSTOMIZATION_NOT_FOUND');await ui.intake();assert.equal(ui.detail,null);assert.equal(ui.error.status,404);assert.equal(ui.conflicted,false);assert.equal(ui.pending,null);stop()
  })
  test('账号、主体、revision及离页清理隔离迟到读取，A到B再到A也不恢复旧正文',async()=>{
    for(const change of [s=>s.session.token='other-token',s=>s.session.account={...s.session.account,id:id(99)},s=>{s.session.selectedId=id(99);s.session.selectedId=''},s=>s.session.revision++,s=>s.ui.clear()]){
      const s=state(),late=defer();globalThis.fetch=()=>late.promise;const task=s.ui.read(id(10));change(s);late.resolve(response(record()));await task;assert.equal(s.ui.detail,null);assert.equal(s.ui.loading,false);s.stop()
    }
    const s=state(),late=defer();s.ui.detail=record();globalThis.fetch=()=>late.promise;const write=s.ui.intake();s.session.revision++;late.resolve(response(record('INTAKE',3)));await write;assert.equal(s.ui.detail,null);assert.equal(s.ui.pending,null);assert.equal(s.ui.busy,false);s.stop()
  })
  test('详情切换时先清旧内容，较早响应不覆盖较新记录',async()=>{
    const {ui,stop}=state(),a=defer(),b=defer();ui.detail=record();let n=0;globalThis.fetch=()=>++n===1?a.promise:b.promise
    const first=ui.read(id(10));assert.equal(ui.detail,null);const second=ui.read(id(12));b.resolve(response({...record(),id:id(12)}));await second;a.resolve(response(record()));await first;assert.equal(ui.detail.id,id(12));stop()
  })
  test('登录安全返回只接受列表及UUID详情，拒绝外链、query、伪岗位及不完整编号',()=>{
    for(const path of ['/operations/customization',`/operations/customization/${id(10)}`])assert.equal(loginRedirect(path),path)
    for(const bad of ['/operations/customization/none','/operations/customization?grant=CUSTOMIZATION_INTAKE','//foreign/operations/customization',`/operations/customization/${id(10)}/intake`,' /operations/customization','/operations/customization/'])assert.equal(loginRedirect(bad),'/workspace')
  })
  test('提交内容和模板按纯文本渲染，空值不回填；受理人员和时间独立展示',async()=>{
    const {default:Submission}=await server.ssrLoadModule('/src/components/CustomizationSubmission.vue')
    const html=await renderToString(createSSRApp({render:()=>h(Submission,{request:record()})}));assert.ok(html.includes('&lt;script&gt;unsafe&lt;/script&gt;'));assert.equal(html.includes('<script>unsafe</script>'),false);assert.ok(html.includes('（用户留空）'));assert.ok(html.includes('请讲述故事'));assert.ok(html.includes('提交版本与核对信息'))
    const s=state(),router=createRouter({history:createMemoryHistory(),routes:[...customizationRoutes,{path:'/:pathMatch(.*)*',component:{render:()=>null}}]});await router.push(`/operations/customization/${id(10)}`);await router.isReady();s.ui.detail=record('INTAKE',3);const app=createSSRApp({render:()=>h(RouterView)}).use(s.pinia).use(router),page=await renderToString(app);assert.ok(page.includes('data-testid="customization-intake-by"'));assert.ok(page.includes(who.accountId));assert.ok(page.includes(time));assert.ok(page.includes('返回故事收件'));assert.equal(page.includes('data-testid="customization-intake"'),false);s.stop()
  })
  test('两个路由都沿用共享菜单，收件入口唯一高亮且保留旧工作区',async()=>{
    for(const path of ['/operations/customization',`/operations/customization/${id(10)}`]){
      const s=state(),router=createRouter({history:createMemoryHistory(),routes:[...customizationRoutes,{path:'/:pathMatch(.*)*',component:{render:()=>null}}]});await router.push(path);await router.isReady();const html=await renderToString(createSSRApp({render:()=>h(RouterView)}).use(s.pinia).use(router)),nav=html.match(/<nav\b[^>]*aria-label="工作区导航"[^>]*>([\s\S]*?)<\/nav>/)?.[1];assert.ok(nav);const links=[...nav.matchAll(/<a\b([^>]*)>/g)];assert.deepEqual(links.filter(([,a])=>a.includes('aria-current="page"')).map(([,a])=>a.match(/href="([^"]+)"/)[1]),['/operations/customization']);for(const title of ['账号与机构','合同与规则','制作项目','经营报表'])assert.ok(nav.includes(title));s.stop()
    }
  })
  const items = () => [{field_key:'story',reason:'请说明发生时间 <script>test</script>',instruction:'补充年份、地点以及为什么重要'}]
  const context = (v=3,status=null) => ({request_id:id(10),object_version:v,supplement:status?{id:id(20),base_submission_id:id(11),items:items(),current_status:status,requested_by:who.accountId,requested_at:time,response:status==='RESPONDED'?{submission_id:id(21),responses:{story:'已在故事中补充年份'},submitted_at:time}:null}:null,draft:null,allowed_actions:status==='OPEN'?['READ']:['READ','REQUEST_SUPPLEMENT']})
  test('补件上下文和写入只带账号，无用户草稿；严格原版本及逐项要求',async()=>{
    const calls=[];globalThis.fetch=async(url,o)=>{calls.push({url,o});return response(o.method==='POST'?context(4,'OPEN'):context())}
    await api.getSupplement(who,id(10));await api.requestSupplement(who,{id:id(10),version:3,key:'original-supplement',items:items()})
    assert.ok(calls[0].url.endsWith('/supplement'));assert.ok(calls[1].url.endsWith('/supplements'));assert.equal(calls[1].o.headers['If-Match'],'"3"');assert.equal(calls[1].o.headers['Idempotency-Key'],'original-supplement');assert.deepEqual(JSON.parse(calls[1].o.body),{items:items()});assert.ok(calls.every(c=>c.o.headers['X-Acting-Party']===undefined&&c.o.cache==='no-store'))
    for(const bad of [{...context(),draft:{answers:{story:'私人草稿'},responses:{}}},{...context(3,'OPEN'),allowed_actions:['READ','REQUEST_SUPPLEMENT']},{...context(),allowed_actions:['READ','SAVE_SUPPLEMENT']}])assert.equal(api.isSupplementContext(bad),false)
    for(const bad of [[],[...items(),...items()],[{...items()[0],field_key:'constructor'}],[{...items()[0],reason:' '}],[{...items()[0],instruction:'😀'.repeat(1001)}]])assert.equal(api.validSupplementItems(bad,template()),false)
    assert.equal(api.validSupplementItems([{...items()[0],field_key:'missing'}],template()),false)
  })
  test('补件可写权限来自当前上下文，禁止未受理、开放补件、重复字段和重复提交',async()=>{
    const s=state();s.ui.detail=record('INTAKE',3);s.ui.supplement=context();s.ui.supplementItems=items();assert.equal(s.ui.canSupplement,true)
    s.ui.supplement=context(3,'OPEN');assert.equal(s.ui.canSupplement,false);s.ui.supplement=context(2);assert.equal(s.ui.canSupplement,false);s.ui.supplement=context();s.ui.supplementItems=[...items(),...items()];assert.equal(s.ui.canSupplement,false);s.ui.supplementItems=items()
    const late=defer();let posts=0;globalThis.fetch=async(url,o)=>o.method==='POST'?(posts++,await late.promise):response(record('INTAKE',4));const first=s.ui.supplementRequest();await s.ui.supplementRequest();assert.equal(posts,1);late.resolve(response(context(4,'OPEN')));await first;assert.equal(s.ui.pending,null);assert.equal(s.ui.supplement.supplement.current_status,'OPEN');assert.equal(s.ui.canSupplement,false);s.stop()
  })
  test('补件未知结果保留原逐项正文、版本与键，先核对后重放不跟随后改输入',async()=>{
    const s=state(),calls=[];s.ui.detail=record('INTAKE',3);s.ui.supplement=context();s.ui.supplementItems=items();let posts=0
    globalThis.fetch=async(url,o)=>{calls.push({url,o});if(o.method==='POST'&&++posts===1)throw Error('unknown after commit');return response(url.endsWith('/supplement')?context(4,'OPEN'):o.method==='POST'?context(4,'OPEN'):record('INTAKE',4))}
    await s.ui.supplementRequest();assert.ok(s.ui.pending);s.ui.supplementItems[0].reason='later edit';await s.ui.retryPending();assert.equal(posts,1);await s.ui.checkPending();assert.equal(s.ui.pending.checked,true);await s.ui.retryPending();assert.equal(s.ui.pending,null)
    const writes=calls.filter(c=>c.o.method==='POST');assert.equal(writes.length,2);assert.equal(writes[0].o.headers['Idempotency-Key'],writes[1].o.headers['Idempotency-Key']);assert.equal(writes[0].o.headers['If-Match'],writes[1].o.headers['If-Match']);assert.equal(writes[0].o.body,writes[1].o.body);assert.deepEqual(JSON.parse(writes[1].o.body),{items:items()});s.stop()
  })
  test('补件412保留输入、重读故事与上下文，明确核对后才允许再发',async()=>{
    const s=state();s.ui.detail=record('INTAKE',3);s.ui.supplement=context();s.ui.supplementItems=items();let posts=0
    globalThis.fetch=async(url,o)=>o.method==='POST'?(posts++,failure(412,'VERSION_CONFLICT')):response(url.endsWith('/supplement')?context(5):record('INTAKE',5))
    await s.ui.supplementRequest();assert.equal(posts,1);assert.deepEqual(s.ui.supplementItems,items());assert.equal(s.ui.detail.object_version,5);assert.equal(s.ui.supplement.object_version,5);assert.equal(s.ui.pending,null);assert.equal(s.ui.conflicted,true);assert.equal(s.ui.canSupplement,false);s.ui.reconfirmed=true;assert.equal(s.ui.canSupplement,true);s.stop()
  })
  test('补件、历史与报价读取失权清除所有私人上下文和编辑输入，迟到响应不恢复',async()=>{
    for(const status of [401,403,404]){const s=state();s.ui.detail=record('INTAKE',3);s.ui.supplement=context();s.ui.supplementItems=items();s.ui.history=[{id:id(11)}];s.ui.quotes=[{id:id(30)}];globalThis.fetch=async()=>failure(status,'CUSTOMIZATION_FORBIDDEN');await s.ui.readSupplement(id(10));assert.equal(s.ui.supplement,null);assert.deepEqual(s.ui.history,[]);assert.deepEqual(s.ui.quotes,[]);assert.equal(s.ui.supplementItems[0].reason,'');s.stop()}
    const s=state(),late=defer();s.ui.detail=record('INTAKE',3);globalThis.fetch=()=>late.promise;const p=s.ui.readSupplement(id(10));s.session.revision++;late.resolve(response(context()));await p;assert.equal(s.ui.supplement,null);s.stop()
  })
  test('正式历史保留原版本和要求回复，分页游标原样传递；摘要不接受私有正文',async()=>{
    const hist={id:id(11),submission_number:1,submitted_by:id(3),submitted_at:time,content_sha256:'a'.repeat(64)},ver={request_id:id(10),submission_number:2,submission:record().submission,supplement_response:{supplement_id:id(20),base_submission_id:id(9),items:items(),responses:{story:'正式说明 <img onerror=test>'},requested_by:who.accountId,requested_at:time}},calls=[]
    globalThis.fetch=async(url,o)=>{calls.push({url,o});return response(url.includes('?')?{items:[hist],next_cursor:'cursor+/='}:ver)}
    await api.listSubmissions(who,id(10),'cursor+/=');assert.ok(calls[0].url.includes('cursor=cursor%2B%2F%3D'));assert.ok(api.isSubmissionVersion(await api.getSubmission(who,id(10),id(11))));assert.ok(calls.every(c=>c.o.headers['X-Acting-Party']===undefined))
    assert.equal(api.isSubmissionVersion({...ver,supplement_response:{...ver.supplement_response,responses:{story:''}}}),false)
    globalThis.fetch=async()=>response({items:[{...hist,answers:{story:'private'}}],next_cursor:null});await assert.rejects(api.listSubmissions(who,id(10)),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE')
  })
  test('故事报价摘要不含正文和价格；旧故事只显示来源状态而不推导付款',async()=>{
    const quote={id:id(30),submission_id:id(11),source_content_sha256:'a'.repeat(64),source_is_current:false,current_status:'APPROVED',object_version:2,content_sha256:'b'.repeat(64),order_id:null}
    globalThis.fetch=async()=>response({items:[quote],next_cursor:null});const page=await api.listCustomizationQuotes(who,id(10));assert.equal(page.items[0].source_is_current,false);assert.equal(page.items[0].order_id,null)
    globalThis.fetch=async()=>response({items:[{...quote,story:'私人内容'}],next_cursor:null});await assert.rejects(api.listCustomizationQuotes(who,id(10)),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE')
    assert.equal(loginRedirect(`/trade/quotes/new?customizationRequest=${id(10)}`),`/trade/quotes/new?customizationRequest=${id(10)}`);for(const bad of [`/trade/quotes/new?customizationRequest=${id(10)}&grant=OWNER`,'/trade/quotes/new?customizationRequest=bad'])assert.equal(loginRedirect(bad),'/workspace');assert.equal(loginRedirect('/finance/marketplace-preview'),'/finance/marketplace-preview')
  })
  test('运营真实页面补件和历史只渲染正式纯文本，原故事入口自动带来源而不允许手填',async()=>{
    const s=state(),router=createRouter({history:createMemoryHistory(),routes:[...customizationRoutes,{path:'/:pathMatch(.*)*',component:{render:()=>null}}]});await router.push(`/operations/customization/${id(10)}`);await router.isReady();s.ui.detail=record('INTAKE',3);s.ui.supplement=context(3,'RESPONDED');s.ui.supplementItems=items();const html=await renderToString(createSSRApp({render:()=>h(RouterView)}).use(s.pinia).use(router));assert.ok(html.includes('&lt;script&gt;test&lt;/script&gt;'));assert.ok(html.includes('用户正式回复：已在故事中补充年份'));assert.ok(html.includes('data-testid="customization-supplement-field-0"'));assert.ok(html.includes(`/trade/quotes/new?customizationRequest=${id(10)}`));assert.ok(html.includes('data-testid="customization-load-history"'));assert.ok(html.includes('草稿'));s.stop()
  })
  test('同故事刷新新版提交清除旧报价来源标记和历史选择，同时保留未发送补件输入',async()=>{
    const s=state();s.ui.detail=record('INTAKE',3);s.ui.supplement=context();s.ui.supplementItems=items();s.ui.quotes=[{id:id(30),source_is_current:true}];s.ui.quotesCursor='old-quotes';s.ui.history=[{id:id(11)}];s.ui.historyVersion={submission_number:1};const fresh=record('SUBMITTED',5);fresh.submission.id=id(21);fresh.submission.content_sha256='b'.repeat(64);globalThis.fetch=async()=>response(fresh);await s.ui.read(id(10));assert.equal(s.ui.detail.submission.id,id(21));assert.deepEqual(s.ui.quotes,[]);assert.equal(s.ui.quotesCursor,null);assert.equal(s.ui.historyVersion,null);assert.equal(s.ui.supplement,null);assert.deepEqual(s.ui.supplementItems,items());s.stop()
  })
  for(const {name,run} of tests){await run();console.log('✓ '+name)}
  console.log(`\n${tests.length} customization checks passed.`)
} finally {
  globalThis.fetch=originalFetch;await server.close()
  if(storageProperty)Object.defineProperty(globalThis,'sessionStorage',storageProperty);else delete globalThis.sessionStorage
}
