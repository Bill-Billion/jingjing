import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createSSRApp, effectScope, h, reactive } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

const root = fileURLToPath(new URL('..',import.meta.url))
const server = await createServer({root,configFile:false,plugins:[vue()],resolve:{alias:{'@':root+'/src'}},server:{middlewareMode:true},appType:'custom'})
const storageProperty = Object.getOwnPropertyDescriptor(globalThis,'sessionStorage'), storage = new Map()
Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}})
const originalFetch = globalThis.fetch, originalWindow = globalThis.window, id = n => String(n).padStart(8,'0')+'-0000-4000-8000-000000000001'
const time = '2026-10-28T08:30:00.123Z', who = {token:'isolated-story-token',accountId:id(1),partyId:id(2)}, base = '/operations/customization/mine'
const template = () => ({title:'本人家庭故事',description:'模拟问题 <script>unsafe</script>',fields:[{key:'story',label:'请讲述故事',type:'TEXT',required:true,max_length:500},{key:'style',label:'叙事方式',type:'CHOICE',required:false,options:['纪实','诗意']},{key:'note',label:'补充说明',type:'TEXT',required:false}]})
const category = (t=template()) => ({template_version_id:id(4),category_code:'FAMILY',template_version:1,template_snapshot:t,submission_available:true,unavailable_reason:null})
const story = (status='DRAFT',v=1,a={}) => ({id:id(10),party_id:who.partyId,created_by:who.accountId,template_version_id:id(4),template_snapshot:template(),answers:a,current_status:status,object_version:v,submission:status==='DRAFT'?null:{id:id(11),template_snapshot:template(),answers:a,content_sha256:'a'.repeat(64),submitted_by:who.accountId,submitted_at:time},submitted_at:status==='DRAFT'?null:time,intake_at:status==='INTAKE'?time:null,intake_by:status==='INTAKE'?id(8):null,allowed_actions:status==='DRAFT'?['READ','SAVE','SUBMIT']:['READ']})
const summary = (s=story()) => ({id:s.id,party_id:s.party_id,template_version_id:s.template_version_id,category_title:s.template_snapshot.title,current_status:s.current_status,object_version:s.object_version,submitted_at:s.submitted_at,intake_at:s.intake_at,allowed_actions:s.allowed_actions})
const supplement = (v=3,state='OPEN',a={story:'合成故事'},replies={}) => ({request_id:id(10),object_version:v,supplement:state?{id:id(20),base_submission_id:id(11),items:[{field_key:'story',reason:'缺少时间',instruction:'补充年份和地点'}],current_status:state,requested_by:id(8),requested_at:time,response:state==='RESPONDED'?{submission_id:id(21),responses:replies,submitted_at:time}:null}:null,draft:state==='OPEN'?{answers:a,responses:replies}:null,allowed_actions:state==='OPEN'?['READ','SAVE_SUPPLEMENT','SUBMIT_SUPPLEMENT']:['READ']})
const response = (data,identity=who,etag=data?.object_version) => new Response(JSON.stringify({meta:{request_id:'synthetic-request',actor:{account_id:identity.accountId},acting_party:identity.partyId??null},data}),{headers:{'Content-Type':'application/json',...(etag?{ETag:`"${etag}"`}:{})}})
const failure = (status,code) => new Response(JSON.stringify({meta:{request_id:'synthetic-request'},error:{code,message:'合成错误',retryable:false}}),{status,headers:{'Content-Type':'application/json'}})
const defer = () => {let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
const tests = [], test = (name,run) => tests.push({name,run})
try {
  const api = await server.ssrLoadModule('/src/api/modules/customizationOwn.ts')
  const shared = await server.ssrLoadModule('/src/api/modules/customization.ts')
  const {useSessionStore} = await server.ssrLoadModule('/src/stores/session.ts')
  const {useOwnStoryStore} = await server.ssrLoadModule('/src/stores/customizationOwn.ts')
  const {customizationRoutes} = await server.ssrLoadModule('/src/router/customizationRoutes.ts')
  const {loginRedirect} = await server.ssrLoadModule('/src/router/loginRedirect.ts')
  function state() {
    const pinia=createPinia(),session=useSessionStore(pinia)
    session.token=who.token;session.account={id:who.accountId,display_name:'本人合成账号',current_status:'ACTIVE',object_version:1,allowed_actions:[]}
    session.parties=[{party:{id:who.partyId,kind:'PERSON',display_name:'本人合成身份',current_status:'ACTIVE',object_version:1,capabilities:[],allowed_actions:[]},membership:{id:id(7),account_id:who.accountId,party_id:who.partyId,current_status:'ACTIVE',roles:['OWNER'],object_version:1,allowed_actions:[]}}]
    session.selectParty(who.partyId)
    const ui=useOwnStoryStore(pinia)
    return {pinia,session,ui,stop:()=>{ui.$dispose();session.$dispose()}}
  }
  function prepare(s,a={}) { s.ui.categories=[category()];s.ui.selectCategory(id(4));s.ui.draftAnswers=a }
  async function render(path,exercise) {
    const s=state(),router=createRouter({history:createMemoryHistory(),routes:[...customizationRoutes,{path:'/:pathMatch(.*)*',component:{render:()=>null}}]})
    await router.push(path);await router.isReady();let vm
    const app=createSSRApp({render:()=>h(RouterView)}).use(s.pinia).use(router)
    app.mixin({created(){if(this.$options.__name==='CustomizationOwnView'){vm=this.$.setupState;vm.initializing=false}},serverPrefetch(){if(this.$options.__name==='CustomizationOwnView')return exercise?.(s,vm,router)}})
    try {return {html:await renderToString(app),vm}} finally {s.stop()}
  }
  test('真实分类仅用账号读取，分类可空，含附件的自由创作模板按服务端显示',async()=>{
    let headers;globalThis.fetch=async(url,o)=>{assert.ok(url.endsWith('/customization-categories'));headers=o.headers;return response({items:[category()]},{...who,partyId:undefined})}
    const r=await api.listStoryCategories(who);assert.equal(r.items[0].template_snapshot.title,'本人家庭故事');assert.equal(headers['X-Acting-Party'],undefined)
    globalThis.fetch=async()=>response({items:[]},{...who,partyId:undefined});assert.deepEqual(await api.listStoryCategories(who),{items:[]})
    const t=template();t.fields.push({key:'attachment',label:'私密附件',type:'PRIVATE_ATTACHMENT',required:true});assert.ok(api.isStoryCategory(category(t)));assert.equal(api.isStoryCategory({...category(t),submission_available:true,unavailable_reason:null}),true);assert.equal(api.isStoryCategory({...category(t),submission_available:true,unavailable_reason:'ATTACHMENT_SUBMISSION_NOT_READY'}),false)
  })
  test('本人读取带当前主体且拒绝跨账号、跨主体、运营动作、正文摘要和缺失ETag',async()=>{
    const calls=[];globalThis.fetch=async(url,o)=>{calls.push({url,o});return response(url.includes('?')?{items:[summary()],next_cursor:'cursor+/='}:story())}
    await api.listOwnStories(who,'DRAFT','cursor+/=');await api.getOwnStory(who,id(10));assert.ok(calls[0].url.includes('cursor=cursor%2B%2F%3D'));assert.ok(calls.every(c=>c.o.headers['X-Acting-Party']===who.partyId&&c.o.cache==='no-store'))
    for(const r of [response({...story(),created_by:id(99)}),response(story(),{...who,partyId:id(99)}),response(story(),{...who,accountId:id(99)}),response(story(),who,null)]){globalThis.fetch=async()=>r;await assert.rejects(api.getOwnStory(who,id(10)),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE')}
    assert.equal(api.isStorySummary({...summary(),answers:{story:'private'}}),false);assert.equal(api.isOwnStory({...story('SUBMITTED',2,{story:'正文'}),allowed_actions:['READ','INTAKE']}),false)
  })
  test('空文字草稿可创建、重新打开续写、保存后正式提交，始终使用当前版本',async()=>{
    const s=state(),calls=[];prepare(s);globalThis.fetch=async(url,o)=>{calls.push({url,o});const body=o.body?JSON.parse(o.body):null;if(o.method==='POST'&&url.endsWith('/submissions'))return response(story('SUBMITTED',3,{story:'重新打开后写的故事'}));if(o.method==='POST')return response(story());if(o.method==='PATCH')return response(story('DRAFT',2,body.answers));return response(story())}
    await s.ui.save();assert.equal(s.ui.detail.id,id(10));assert.equal(s.ui.dirty,false);assert.equal(s.ui.detail.submission,null)
    s.ui.resetEditor();await s.ui.read(id(10));s.ui.draftAnswers={story:'重新打开后写的故事'};assert.equal(s.ui.canSubmit,false);await s.ui.save();assert.equal(s.ui.canSubmit,true);await s.ui.submit();assert.equal(s.ui.detail.current_status,'SUBMITTED');assert.equal(s.ui.detail.submission.answers.story,'重新打开后写的故事');assert.equal(s.ui.canEdit,false)
    const writes=calls.filter(c=>c.o.method!=='GET');assert.deepEqual(JSON.parse(writes[0].o.body),{template_version_id:id(4),answers:{}});assert.equal(writes[0].o.headers['If-Match'],undefined);assert.equal(writes[1].o.headers['If-Match'],'"1"');assert.equal(writes[2].o.headers['If-Match'],'"2"');assert.equal(writes[2].o.body,'{}');s.stop()
  })
  test('正式提交定位必填错误，非法选择和附件地址不能伪装成答案',async()=>{
    const s=state();globalThis.fetch=async()=>response(story());await s.ui.read(id(10));let posts=0;globalThis.fetch=async()=>{posts++;return response(story())};await s.ui.submit();assert.equal(posts,0);assert.equal(s.ui.fieldErrors['answers.story'],'请填写请讲述故事。')
    s.ui.draftAnswers={story:'故事',style:'非法选项'};await s.ui.save();assert.equal(posts,0);assert.ok(s.ui.fieldErrors['answers.style'])
    const t=template();t.fields.push({key:'file',label:'私密附件',type:'PRIVATE_ATTACHMENT',required:false});assert.equal(shared.answers({story:'故事',file:'https://invalid/private'},t,false),false);assert.equal(shared.answers({story:'😀'.repeat(500)},t),true);s.stop()
  })
  test('必填附件允许先存文字草稿，缺少附件时正式提交定位错误',async()=>{
    const s=state(),t=template();t.fields.push({key:'file',label:'私密附件',type:'PRIVATE_ATTACHMENT',required:true});const c=category(t);s.ui.categories=[c];s.ui.selectCategory(c.template_version_id);s.ui.draftAnswers={story:'附件未提供的文字'}
    globalThis.fetch=async()=>response({...story('DRAFT',1,{story:'附件未提供的文字'}),template_snapshot:t});await s.ui.save();assert.equal(s.ui.detail.current_status,'DRAFT');assert.equal(s.ui.canSubmit,true);await s.ui.submit();assert.ok(s.ui.fieldErrors['answers.file']);assert.equal(s.ui.pending,null);s.stop()
  })
  test('未知创建先读列表，近似故事不算成功；恢复原键和原正文且不重复发起',async()=>{
    const s=state(),calls=[];prepare(s,{story:'原故事'});let writes=0
    globalThis.fetch=async(url,o)=>{calls.push({url,o});if(o.method==='POST'&&++writes===1)return failure(503,'COMMIT_OUTCOME_UNKNOWN');return response(o.method==='POST'?story('DRAFT',1,{story:'原故事'}):{items:[summary({...story(),id:id(99)})],next_cursor:null})}
    await s.ui.save();assert.ok(s.ui.pending);s.ui.draftAnswers={story:'后来修改'};await s.ui.save();await s.ui.retryPending();assert.equal(writes,1);await s.ui.checkPending();assert.equal(s.ui.pending.checked,true);assert.equal(s.ui.detail,null);await s.ui.retryPending();assert.equal(s.ui.detail.id,id(10));assert.equal(s.ui.draftAnswers.story,'原故事');assert.equal(s.ui.pending,null)
    const commands=calls.filter(c=>c.o.method==='POST');assert.equal(commands[0].o.body,commands[1].o.body);assert.equal(commands[0].o.headers['Idempotency-Key'],commands[1].o.headers['Idempotency-Key']);s.stop()
  })
  test('重复保存仅发一次，未知保存恢复原版本不跟随后改内容',async()=>{
    const s=state();globalThis.fetch=async()=>response(story());await s.ui.read(id(10));s.ui.draftAnswers={story:'原保存'};const late=defer(),calls=[];globalThis.fetch=(url,o)=>{calls.push({url,o});return late.promise};const saving=s.ui.save();await s.ui.save();assert.equal(calls.length,1);late.resolve(failure(503,'COMMIT_OUTCOME_UNKNOWN'));await saving
    s.ui.draftAnswers={story:'不应作为原请求发送'};globalThis.fetch=async(url,o)=>{calls.push({url,o});return response(o.method==='PATCH'?story('DRAFT',2,{story:'原保存'}):story())};await s.ui.checkPending();await s.ui.retryPending();const writes=calls.filter(c=>c.o.method==='PATCH');assert.equal(writes[0].o.body,writes[1].o.body);assert.equal(writes[0].o.headers['If-Match'],writes[1].o.headers['If-Match']);assert.equal(writes[0].o.headers['Idempotency-Key'],writes[1].o.headers['Idempotency-Key']);s.stop()
  })
  test('412保留未保存内容并重读，重新核对后才可写；刷新失权立即清空',async()=>{
    const s=state();globalThis.fetch=async()=>response(story());await s.ui.read(id(10));s.ui.draftAnswers={story:'用户正在写的内容'}
    globalThis.fetch=async(url,o)=>o.method==='PATCH'?failure(412,'VERSION_CONFLICT'):response(story('DRAFT',4,{story:'另一端已保存'}));await s.ui.save();assert.equal(s.ui.detail.object_version,4);assert.equal(s.ui.draftAnswers.story,'用户正在写的内容');assert.equal(s.ui.conflicted,true);assert.equal(s.ui.dirty,true);assert.equal(s.ui.canSave,false);s.ui.reconfirmed=true;assert.equal(s.ui.canSave,true)
    globalThis.fetch=async(url,o)=>failure(o.method==='PATCH'?412:404,o.method==='PATCH'?'VERSION_CONFLICT':'CUSTOMIZATION_NOT_FOUND');await s.ui.save();assert.equal(s.ui.detail,null);assert.deepEqual(s.ui.draftAnswers,{});assert.equal(s.ui.pending,null);s.stop()
  })
  test('冲突重读网络失败仍保留脏稿，不会把已有故事误当新建',async()=>{
    const s=state();globalThis.fetch=async()=>response(story());await s.ui.read(id(10));s.ui.draftAnswers={story:'必须保留的本次内容'};globalThis.fetch=async(url,o)=>failure(o.method==='PATCH'?412:503,'synthetic');await s.ui.save();assert.equal(s.ui.detail,null);assert.equal(s.ui.dirty,true);assert.equal(s.ui.draftAnswers.story,'必须保留的本次内容');assert.equal(s.ui.canSave,false);s.stop()
  })
  test('真实页面412后读取失败仍显示原输入，刷新保留原内容并待核对后重试',async()=>{
    globalThis.window={confirm:()=>{throw Error('保留输入重读不应要求丢稿')}}
    const {html}=await render(`${base}/${id(10)}`,async(s,vm)=>{
      globalThis.fetch=async()=>response(story());await s.ui.read(id(10));s.ui.draftAnswers={story:'冲突时需要保留的新稿'}
      globalThis.fetch=async(url,o)=>failure(o.method==='PATCH'?412:503,'synthetic');await s.ui.save()
      assert.equal(s.ui.recoveryRequired,true);assert.equal(s.ui.conflicted,true);assert.equal(vm.editable,true);assert.equal(s.ui.canSave,false)
      globalThis.fetch=async()=>response(story('DRAFT',4,{story:'服务器原稿'}));await vm.refresh()
      assert.equal(s.ui.draftAnswers.story,'冲突时需要保留的新稿');assert.equal(s.ui.detail.object_version,4);assert.equal(s.ui.recoveryRequired,false);assert.equal(s.ui.canSave,false);s.ui.reconfirmed=true;assert.equal(s.ui.canSave,true)
      globalThis.fetch=async(url,o)=>failure(o.method==='PATCH'?412:503,'synthetic');await s.ui.save()
    })
    assert.ok(html.includes('data-testid="story-recovery"'));assert.ok(html.includes('冲突时需要保留的新稿'));assert.ok(html.includes('保留本次输入并重新读取'))
  })
  test('补件冲突读取失败保留逐项要求和原回复，失权仍清除私人输入',async()=>{
    const s=state();globalThis.fetch=async(url)=>response(url.endsWith('/supplement')?supplement():story('INTAKE',3,{story:'原故事'}));await s.ui.read(id(10));s.ui.draftAnswers={story:'补充正文'};s.ui.draftResponses={story:'本次回复'}
    globalThis.fetch=async(url,o)=>failure(o.method==='PATCH'?412:503,'synthetic');await s.ui.save();assert.equal(s.ui.editingSupplement.items[0].instruction,'补充年份和地点');assert.equal(s.ui.draftResponses.story,'本次回复');assert.equal(s.ui.recoveryRequired,true)
    globalThis.fetch=async()=>failure(404,'CUSTOMIZATION_NOT_FOUND');await s.ui.retryLatest();assert.equal(s.ui.editingSupplement,null);assert.deepEqual(s.ui.draftResponses,{});assert.equal(s.ui.recoveryRequired,false);s.stop()
  })
  test('补件从本人草稿读起，保存与正式补交分开，正式提交后读取响应进度',async()=>{
    const s=state(),calls=[];let currentStory=story('INTAKE',3,{story:'原正式故事'}),ctx=supplement(3,'OPEN',{story:'原正式故事'},{})
    globalThis.fetch=async(url,o)=>{calls.push({url,o});if(o.method==='PATCH'){const b=JSON.parse(o.body);ctx=supplement(4,'OPEN',b.answers,b.responses);return response(ctx)}if(o.method==='POST'){currentStory=story('SUBMITTED',5,{story:'2020年上海的合成故事'});currentStory.submission.id=id(21);ctx=supplement(5,'RESPONDED',{}, {story:'已补充年份和地点'});return response(currentStory)}return response(url.endsWith('/supplement')?ctx:currentStory)}
    await s.ui.read(id(10));assert.equal(s.ui.isSupplement,true);s.ui.draftAnswers={story:'2020年上海的合成故事'};s.ui.draftResponses={story:'已补充年份和地点'};assert.equal(s.ui.canSubmit,false);await s.ui.save();assert.equal(s.ui.detail.object_version,4);assert.equal(s.ui.detail.submission.answers.story,'原正式故事');assert.equal(s.ui.canSubmit,true);await s.ui.submit();assert.equal(s.ui.detail.submission.id,id(21));assert.equal(s.ui.supplement.supplement.current_status,'RESPONDED');assert.equal(s.ui.isSupplement,false)
    const writes=calls.filter(c=>c.o.method!=='GET');assert.ok(writes[0].url.endsWith('/supplement'));assert.equal(writes[0].o.headers['If-Match'],'"3"');assert.ok(writes[1].url.endsWith('/supplement-submissions'));assert.equal(writes[1].o.headers['If-Match'],'"4"');assert.equal(writes[1].o.body,'{}');s.stop()
  })
  test('补件空回复可存草稿但正式补交须逐项填写，过期上下文不可编辑',async()=>{
    const s=state();globalThis.fetch=async(url)=>response(url.endsWith('/supplement')?supplement():story('INTAKE',3,{story:'合成故事'}));await s.ui.read(id(10));assert.equal(s.ui.validate(false),true);await s.ui.submit();assert.ok(s.ui.fieldErrors['responses.story']);assert.equal(s.ui.pending,null)
    s.ui.supplement={...s.ui.supplement,object_version:2};assert.equal(s.ui.canSave,false);assert.equal(s.ui.canSubmit,false);s.stop()
  })
  test('未明确允许的本人操作不开放，正式故事不当成可续写草稿',async()=>{
    const s=state();globalThis.fetch=async()=>response({...story(),allowed_actions:['READ']});await s.ui.read(id(10));assert.equal(s.ui.canSave,false);assert.equal(s.ui.canSubmit,false)
    globalThis.fetch=async(url)=>response(url.endsWith('/supplement')?supplement(2,null):story('SUBMITTED',2,{story:'合成故事'}));await s.ui.read(id(10));assert.equal(s.ui.canEdit,false);assert.equal(s.ui.canSubmit,false);s.stop()
  })
  test('身份变化、A到B再到A、失权与迟到请求都不恢复私人草稿',async()=>{
    for(const change of [s=>s.session.token='other',s=>s.session.account={...s.session.account,id:id(99)},s=>{s.session.selectedId=id(99);s.session.selectedId=who.partyId},s=>s.session.revision++,s=>s.ui.clear()]){
      const s=state(),late=defer();globalThis.fetch=()=>late.promise;const reading=s.ui.read(id(10));change(s);late.resolve(response(story('DRAFT',1,{story:'旧身份内容'})));await reading;assert.equal(s.ui.detail,null);assert.deepEqual(s.ui.draftAnswers,{});assert.equal(s.ui.loading,false);s.stop()
    }
    for(const code of [401,403,404]){const s=state();prepare(s,{story:'private'});s.ui.rows=[summary()];s.ui.history=[{id:id(11)}];globalThis.fetch=async()=>failure(code,'CUSTOMIZATION_FORBIDDEN');await s.ui.read(id(10));assert.deepEqual(s.ui.draftAnswers,{});assert.deepEqual(s.ui.rows,[]);assert.deepEqual(s.ui.history,[]);assert.equal(s.ui.template,null);s.stop()}
  })
  test('分页保持原游标，重复游标不循环，列表筛选在详情往返中保留',async()=>{
    const s=state(),calls=[];globalThis.fetch=async(url)=>{calls.push(url);const q=new URL(url,'http://local').searchParams;return response({items:[summary({...story(),id:q.has('cursor')?id(12):id(10)})],next_cursor:q.has('cursor')?null:'cursor+/='})}
    await s.ui.setStatus('DRAFT');await s.ui.load(true);assert.equal(s.ui.rows.length,2);s.ui.resetEditor();assert.equal(s.ui.status,'DRAFT');assert.equal(s.ui.rows.length,2);assert.ok(calls[1].includes('cursor=cursor%2B%2F%3D'))
    s.ui.nextCursor='same';globalThis.fetch=async()=>response({items:[],next_cursor:'same'});await s.ui.load(true);assert.equal(s.ui.error.code,'UNEXPECTED_RESPONSE_SHAPE');s.stop()
  })
  test('本人历史读取保持主体，拒绝运营上下文与外部正文',async()=>{
    const rec=story('SUBMITTED',2,{story:'正式故事'}),version={request_id:id(10),submission_number:1,submission:rec.submission,supplement_response:null},calls=[]
    globalThis.fetch=async(url,o)=>{calls.push({url,o});return response(url.includes('?')?{items:[{id:id(11),submission_number:1,submitted_by:who.accountId,submitted_at:time,content_sha256:'a'.repeat(64)}],next_cursor:null}:version)}
    await shared.listSubmissions(who,id(10));await shared.getSubmission(who,id(10),id(11));assert.ok(calls.every(c=>c.o.headers['X-Acting-Party']===who.partyId));globalThis.fetch=async()=>response(version,{...who,partyId:undefined});await assert.rejects(shared.getSubmission(who,id(10),id(11)),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE')
  })
  test('反复读取历史首屏可以复用相同下一页游标，续页循环仍拒绝',async()=>{
    const s=state();globalThis.fetch=async(url)=>response(url.endsWith('/supplement')?supplement(2,null):story('SUBMITTED',2,{story:'正式故事'}));await s.ui.read(id(10));globalThis.fetch=async()=>response({items:[{id:id(11),submission_number:1,submitted_by:who.accountId,submitted_at:time,content_sha256:'a'.repeat(64)}],next_cursor:'same-first-cursor'})
    await s.ui.loadHistory();await s.ui.loadHistory();assert.equal(s.ui.error,null);assert.equal(s.ui.historyCursor,'same-first-cursor');await s.ui.loadHistory(true);assert.equal(s.ui.error.code,'UNEXPECTED_RESPONSE_SHAPE');s.stop()
  })
  test('真实本人页面选择实际模板、创建并跳转，所有子路由保留43项公共导航与单一高亮',async()=>{
    for(const path of [base,`${base}/new`,`${base}/${id(10)}`]){
      const {html}=await render(path,async(s,vm)=>{prepare(s);if(path.endsWith('/new')){globalThis.fetch=async()=>response({items:[category()]},{...who,partyId:undefined});await vm.loadPage();vm.selectCategory({target:{value:id(4)}});assert.equal(s.ui.template.title,'本人家庭故事')}})
      const nav=html.match(/<nav\b[^>]*aria-label="工作区导航"[^>]*>([\s\S]*?)<\/nav>/)?.[1];assert.ok(nav);const links=[...nav.matchAll(/<a\b([^>]*)>/g)];assert.equal(links.length,70);assert.deepEqual(links.filter(([,a])=>a.includes('aria-current="page"')).map(([,a])=>a.match(/href="([^"]+)"/)[1]),['/operations/customization'])
    }
    await render(`${base}/new`,async(s,vm,router)=>{prepare(s,{story:'真正保存的页面故事'});globalThis.fetch=async()=>response(story('DRAFT',1,{story:'真正保存的页面故事'}));await vm.save();assert.equal(router.currentRoute.value.path,`${base}/${id(10)}`);assert.equal(s.ui.pending,null)})
  })
  test('真实页面脏稿阻止离开、切模板与切身份，未知请求不可绕过离页保护',async()=>{
    globalThis.window={confirm:()=>false}
    await render(`${base}/new`,async(s,vm)=>{prepare(s,{story:'尚未保存'});assert.equal(vm.allowDiscard(),false);assert.equal(await vm.leave(),false);assert.equal(s.ui.draftAnswers.story,'尚未保存');const second={...category(),template_version_id:id(5),category_code:'OTHER'};s.ui.categories.push(second);vm.selectCategory({target:{value:id(5)}});assert.equal(s.ui.categoryId,id(4));await vm.changeIdentity({target:{value:id(99)}});assert.equal(s.session.selectedId,who.partyId);s.ui.pending={command:{kind:'create',template_version_id:id(4),answers:{},key:'same'},template:template(),checked:false};globalThis.window.confirm=()=>true;assert.equal(await vm.leave(),false);s.ui.pending=null;assert.equal(await vm.leave(),true);assert.deepEqual(s.ui.draftAnswers,{})})
  })
  test('真实页面未建故事先存草稿，附件通过受控入口且文字不当HTML',async()=>{
    const {html}=await render(`${base}/new`,async(s,vm)=>{const t=template();t.fields.push({key:'file',label:'私密附件',type:'PRIVATE_ATTACHMENT',required:true});s.ui.categories=[category(t)];s.ui.selectCategory(id(4));s.ui.fieldErrors={'answers.story':'请补充内容'};vm.initializing=false})
    assert.ok(html.includes('data-testid="story-attachment-field"'));assert.ok(html.includes('先点击“创建并保存草稿”'));assert.ok(html.includes('aria-describedby="story-count-story story-error-story"'));assert.ok(html.includes('&lt;script&gt;unsafe&lt;/script&gt;'));assert.equal(html.includes('type="file"'),false);assert.equal(html.includes('<script>unsafe</script>'),false)
  })
  test('登录返回只接受本人列表、新建与合法详情，拒绝手填权限与外链',()=>{
    for(const path of [base,`${base}/new`,`${base}/${id(10)}`])assert.equal(loginRedirect(path),path)
    for(const path of [`${base}/fake`,`${base}?admin=true`,`${base}/${id(10)}/submit`,'//foreign'+base,' '+base])assert.equal(loginRedirect(path),'/workspace')
  })
  for(const {name,run} of tests){await run();console.log('✓ '+name)}
  console.log(`\n${tests.length} own-story checks passed.`)
} finally {
  globalThis.fetch=originalFetch;if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;await server.close()
  if(storageProperty)Object.defineProperty(globalThis,'sessionStorage',storageProperty);else delete globalThis.sessionStorage
}
