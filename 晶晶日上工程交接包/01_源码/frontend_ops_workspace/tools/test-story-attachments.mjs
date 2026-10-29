import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {createServer} from 'vite'
import vue from '@vitejs/plugin-vue'
import {createSSRApp,effectScope,h,reactive} from 'vue'
import {renderToString} from '@vue/server-renderer'
import {createPinia} from 'pinia'
import {createMemoryHistory,createRouter,RouterView} from 'vue-router'

const root=fileURLToPath(new URL('..',import.meta.url)),server=await createServer({root,configFile:false,plugins:[vue()],resolve:{alias:{'@':root+'/src'}},server:{middlewareMode:true},appType:'custom'})
const saved={fetch:globalThis.fetch,window:globalThis.window,document:globalThis.document,xhr:globalThis.XMLHttpRequest,create:URL.createObjectURL,revoke:URL.revokeObjectURL,storage:Object.getOwnPropertyDescriptor(globalThis,'sessionStorage')},storage=new Map()
Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}})
const id=n=>String(n).padStart(8,'0')+'-0000-4000-8000-000000000001',who={token:'synthetic-story-token',accountId:id(1),partyId:id(2)},operator={token:'synthetic-intake-token',accountId:id(9)},time='2026-10-29T01:00:00.000Z'
const template=()=>({title:'自由创作 · 合成模板',description:'合成资料，不是生产故事',fields:[{key:'story',label:'故事内容',type:'TEXT',required:true},{key:'file',label:'私人参考附件',type:'PRIVATE_ATTACHMENT',required:true}]})
const record=(state='DRAFT',v=1,asset='')=>({id:id(10),party_id:who.partyId,created_by:who.accountId,template_version_id:id(4),template_snapshot:template(),answers:{story:'合成故事',file:asset},current_status:state,object_version:v,submission:state==='DRAFT'?null:{id:id(11),answers:{story:'合成故事',file:asset},template_snapshot:template(),content_sha256:'a'.repeat(64),submitted_by:who.accountId,submitted_at:time},submitted_at:state==='DRAFT'?null:time,intake_at:state==='INTAKE'?time:null,intake_by:state==='INTAKE'?operator.accountId:null,allowed_actions:state==='DRAFT'?['READ','SAVE','SUBMIT']:['READ']})
const context=(v=3,state='OPEN',asset=id(30),responses={})=>({request_id:id(10),object_version:v,supplement:state?{id:id(20),base_submission_id:id(11),items:[{field_key:'file',reason:'附件需补清晰版本',instruction:'请上传新的合成文件'}],current_status:state,requested_by:operator.accountId,requested_at:time,response:state==='RESPONDED'?{submission_id:id(21),responses,submitted_at:time}:null}:null,draft:state==='OPEN'?{answers:{story:'合成故事',file:asset},responses}:null,allowed_actions:state==='OPEN'?['READ','SAVE_SUPPLEMENT','SUBMIT_SUPPLEMENT']:['READ']})
const response=(data,i=who,etag=data?.object_version)=>new Response(JSON.stringify({meta:{request_id:'synthetic',actor:{account_id:i.accountId},acting_party:i.partyId??null},data}),{headers:{'Content-Type':'application/json',...(etag?{ETag:`"${etag}"`}:{})}})
const failure=(status,code)=>new Response(JSON.stringify({error:{code,message:'synthetic error'}}),{status,headers:{'Content-Type':'application/json'}})
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}}
let xhrHandler=()=>{throw Error('unexpected upload')},xhrCalls=[]
class FakeXHR {
  headers={};upload={};responseHeaders={};status=0;responseText='';done=false
  open(method,url){this.method=method;this.url=url}
  setRequestHeader(k,v){this.headers[k]=v}
  getResponseHeader(k){return this.responseHeaders[k]??null}
  send(body){this.body=body;xhrCalls.push(this);xhrHandler(this)}
  abort(){if(!this.done){this.done=true;this.onabort?.()}}
}
globalThis.XMLHttpRequest=FakeXHR
function xhrReply(xhr,data,i=who,{status=200,code,etag=data?.object_version}={}) {
  xhr.done=true;xhr.status=status;xhr.responseHeaders={'X-Request-Id':'synthetic-upload',...(etag?{ETag:`"${etag}"`}:{})};xhr.responseText=JSON.stringify(status>=400?{error:{code,message:'synthetic error'}}:{meta:{request_id:'synthetic-upload',actor:{account_id:i.accountId},acting_party:i.partyId??null},data});xhr.onload()
}
const tests=[],test=(name,run)=>tests.push({name,run})
try {
  const api=await server.ssrLoadModule('/src/api/modules/customizationAttachments.ts'),own=await server.ssrLoadModule('/src/api/modules/customizationOwn.ts'),shared=await server.ssrLoadModule('/src/api/modules/customization.ts')
  const {useStoryAttachments}=await server.ssrLoadModule('/src/composables/useStoryAttachments.ts'),{useSessionStore}=await server.ssrLoadModule('/src/stores/session.ts'),{useOwnStoryStore}=await server.ssrLoadModule('/src/stores/customizationOwn.ts'),{useCustomizationStore}=await server.ssrLoadModule('/src/stores/customization.ts'),{customizationRoutes}=await server.ssrLoadModule('/src/router/customizationRoutes.ts')
  const file=(text='synthetic private text',name='合成资料.txt',type='text/plain')=>new File([text],name,{type})
  async function asset(source=file(),n=30,status='READY',v=2){return{id:id(n),request_id:id(10),display_name:source.name,media_type:source.type,byte_size:source.size,content_sha256:await api.storyFileHash(source),current_status:status,object_version:v}}
  function controller(asOperator=false,recovery=undefined){const ctx=reactive({...who,partyId:asOperator?undefined:who.partyId,requestId:id(10),revision:1,identityTag:who.partyId}),scope=effectScope(),uploads=[],revoked=[],denied=[];const files=scope.run(()=>useStoryAttachments(()=>({...ctx}),{recovery,canUpload:()=>!asOperator,onUploaded:(field,a)=>uploads.push({field,a}),onRevoked:a=>revoked.push(a),onForbidden:()=>denied.push(true)}));return{ctx,scope,files,uploads,revoked,denied,stop:()=>scope.stop()}}
  async function render(path,exercise,asOperator=false){const pinia=createPinia(),session=useSessionStore(pinia),i=asOperator?operator:who;session.token=i.token;session.account={id:i.accountId,display_name:'合成账号',current_status:'ACTIVE',object_version:1,allowed_actions:[]};session.parties=[{party:{id:who.partyId,kind:'PERSON',display_name:'合成主体',current_status:'ACTIVE',object_version:1,capabilities:[],allowed_actions:[]},membership:{id:id(7),account_id:i.accountId,party_id:who.partyId,current_status:'ACTIVE',roles:['OWNER'],object_version:1,allowed_actions:[]}}];session.selectParty(who.partyId);const ui=asOperator?useCustomizationStore(pinia):useOwnStoryStore(pinia),router=createRouter({history:createMemoryHistory(),routes:[...customizationRoutes,{path:'/:pathMatch(.*)*',component:{render:()=>null}}]});await router.push(path);await router.isReady();let vm;const app=createSSRApp({render:()=>h(RouterView)}).use(pinia).use(router);const name=asOperator?'CustomizationIntakeView':'CustomizationOwnView';app.mixin({created(){if(this.$options.__name===name){vm=this.$.setupState;vm.initializing=false}},serverPrefetch(){if(this.$options.__name===name)return exercise({session,ui,vm,router})}});try{return await renderToString(app)}finally{vm?.files.clear();ui.$dispose();session.$dispose()}}

  test('附件模板、正式答案与补件要求接受真实UUID，拒绝公开URL和任意编号',()=>{
    const t=template(),r=record('SUBMITTED',2,id(30));assert.ok(shared.answers(r.answers,t));assert.ok(own.isOwnStory(r));assert.ok(shared.isIntakeRequest(r));assert.ok(own.isStorySupplement(context(),t));assert.ok(shared.validSupplementItems(context().supplement.items,t))
    for(const bad of ['https://public.invalid/file','asset-fake','../../other'])assert.equal(shared.answers({story:'合成',file:bad},t),false)
    assert.ok(own.isStoryCategory({template_version_id:id(4),category_code:'FREE',template_version:1,template_snapshot:t,submission_available:true,unavailable_reason:null}))
  })
  test('选择文件校验8MiB、空文件、120字文件名和允许类型，不猜造资产',()=>{
    assert.equal(api.selectStoryFile(file()).mediaType,'text/plain');assert.equal(api.selectStoryFile(file('wave','声音.wav','')).mediaType,'audio/wav')
    for(const f of [file(''),file('x'.repeat(8*1024*1024+1)),file('x','a'.repeat(121)),file('x','run.exe','application/x-msdownload')])assert.throws(()=>api.selectStoryFile(f))
    assert.equal(api.selectStoryFile(file('x'.repeat(8*1024*1024))).file.size,8*1024*1024)
    assert.equal(api.isStoryAttachment({id:id(30),url:'https://private.invalid'}),false)
  })
  test('原字节上传有真实传输进度，100%传输不冒充服务器确认，回包核准后才绑定',async()=>{
    xhrCalls=[];const s=controller(),source=file(),a=await asset(source),ready=defer();s.files.choose('file',source);xhrHandler=x=>ready.resolve(x)
    const task=s.files.upload('file'),xhr=await ready.promise;assert.equal(xhr.headers['Content-Type'],'application/octet-stream');assert.equal(xhr.headers['X-Acting-Party'],who.partyId);assert.equal(xhr.headers.Authorization,`Bearer ${who.token}`);assert.equal(await xhr.body.text(),await source.text());assert.equal(new URL(xhr.url,'http://local').searchParams.get('display_name'),source.name)
    xhr.upload.onprogress({lengthComputable:true,loaded:source.size,total:source.size});assert.equal(s.files.progress.value.loaded,source.size);assert.equal(s.uploads.length,0);assert.ok(s.files.pending.value);assert.equal(s.files.busy.value,true)
    xhrReply(xhr,a);await task;assert.equal(s.uploads[0].a.id,a.id);assert.equal(s.files.pending.value,null);assert.equal(s.files.hasSelection.value,false);s.stop()
  })
  test('上传断线和待核对409保留原文件原key，先读后重放，重复点击不多传',async()=>{
    for(const code of ['COMMIT_OUTCOME_UNKNOWN','ASSET_UPLOAD_RECONCILIATION_REQUIRED']){
      xhrCalls=[];const s=controller(),source=file(),a=await asset(source);let n=0;globalThis.fetch=async()=>response({items:[{...a,current_status:'UPLOADING',object_version:1}],next_cursor:null});xhrHandler=x=>++n===1?xhrReply(x,null,who,{status:code.startsWith('ASSET')?409:503,code}):xhrReply(x,a)
      s.files.choose('file',source);await s.files.upload('file');assert.ok(s.files.pending.value);s.files.choose('file',file('another'));await s.files.upload('file');await s.files.retryPending();assert.equal(n,1);assert.equal(s.uploads.length,0)
      await s.files.checkPending();await s.files.retryPending();assert.equal(n,2);assert.equal(xhrCalls[0].headers['Idempotency-Key'],xhrCalls[1].headers['Idempotency-Key']);assert.equal(xhrCalls[0].body,xhrCalls[1].body);assert.equal(xhrCalls[0].url,xhrCalls[1].url);assert.equal(s.uploads[0].a.id,a.id);s.stop()
    }
  })
  test('离页重开同故事恢复原文件和key；会话或身份改变清除内存恢复资料',async()=>{
    const {useStoryAttachmentRecoveryStore}=await server.ssrLoadModule('/src/stores/storyAttachmentRecovery.ts')
    const pinia=createPinia(),session=useSessionStore(pinia);session.token=who.token;session.account={id:who.accountId};session.selectedId=who.partyId
    const cache=useStoryAttachmentRecoveryStore(pinia),source=file(),a=await asset(source);let n=0;xhrCalls=[]
    xhrHandler=x=>++n===1?xhrReply(x,null,who,{status:409,code:'ASSET_UPLOAD_RECONCILIATION_REQUIRED'}):xhrReply(x,a)
    let c=controller(false,cache);c.files.choose('file',source);await c.files.upload('file');const key=c.files.pending.value.command.key;c.stop()
    c=controller(false,cache);assert.equal(c.files.pending.value.command.key,key);assert.equal(c.files.pending.value.command.source.file,source);assert.equal(c.files.pending.value.checked,false)
    globalThis.fetch=async()=>response({items:[],next_cursor:null});await c.files.checkPending();await c.files.retryPending();assert.equal(xhrCalls[0].body,xhrCalls[1].body);assert.equal(c.uploads[0].a.id,a.id);assert.equal(cache.read(id(10)),undefined);c.stop()
    cache.write(id(10),{command:{kind:'upload',key,fieldKey:'file',source:api.selectStoryFile(source),sha256:a.content_sha256},code:'ASSET_UPLOAD_RECONCILIATION_REQUIRED'});session.revision++;assert.equal(cache.read(id(10)),undefined)
    cache.$dispose();session.$dispose()
  })
  test('上传2xx跨故事、错主体、错摘要或未就绪时不能绑定，保留原请求待核对',async()=>{
    for(const mutate of [a=>({...a,request_id:id(99)}),a=>({...a,content_sha256:'f'.repeat(64)}),a=>({...a,current_status:'UPLOADING'})]){
      const s=controller(),source=file(),a=await asset(source);xhrHandler=x=>xhrReply(x,mutate(a));s.files.choose('file',source);await s.files.upload('file');assert.equal(s.uploads.length,0);assert.ok(s.files.pending.value);s.stop()
    }
    const s=controller(),source=file(),a=await asset(source);xhrHandler=x=>xhrReply(x,a,{...who,partyId:id(99)});s.files.choose('file',source);await s.files.upload('file');assert.ok(s.files.pending.value);assert.equal(s.uploads.length,0);s.stop()
  })
  test('40记录上限是明确失败，不无限重试，也不把已选文件显示为上传成功',async()=>{
    xhrCalls=[];const s=controller();globalThis.fetch=async()=>response({items:[],next_cursor:null});xhrHandler=x=>xhrReply(x,null,who,{status:409,code:'CUSTOMIZATION_ATTACHMENT_LIMIT'});s.files.choose('file',file());await s.files.upload('file');assert.equal(xhrCalls.length,1);assert.equal(s.files.pending.value,null);assert.equal(s.uploads.length,0);assert.ok(s.files.hasSelection.value);assert.ok(s.files.notice.value.includes('40'));s.stop()
  })
  test('运营空页仍有下一页时继续读取，原游标不变且全程无主体头',async()=>{
    const s=controller(true),a=await asset(),calls=[];globalThis.fetch=async(url,o)=>{calls.push({url,o});return response(calls.length===1?{items:[],next_cursor:'opaque+/='}:{items:[a],next_cursor:null},{...who,partyId:undefined})}
    await s.files.load();assert.equal(s.files.rows.value.length,0);assert.equal(s.files.nextCursor.value,'opaque+/=');await s.files.load(true);assert.equal(s.files.rows.value[0].id,a.id);assert.ok(calls[1].url.includes('cursor=opaque%2B%2F%3D'));assert.ok(calls.every(c=>c.o.headers['X-Acting-Party']===undefined && c.o.cache==='no-store'));s.stop()
    const {default:List}=await server.ssrLoadModule('/src/components/StoryAttachmentList.vue');const html=await renderToString(createSSRApp({render:()=>h(List,{items:[],loaded:true,nextCursor:'next',locked:false,operator:true})}));assert.ok(html.includes('data-testid="story-attachments-more"'));assert.ok(html.includes('后续页面仍可能有记录'))
  })
  test('撤回仅用附件版本，空正文和原key恢复；正式保留409不删除或清绑定',async()=>{
    const s=controller(),a=await asset(),calls=[];s.files.rows.value=[a];let writes=0;globalThis.fetch=async(url,o)=>{calls.push({url,o});if(o.method==='POST'&&++writes===1)return failure(503,'COMMIT_OUTCOME_UNKNOWN');return response(o.method==='POST'?{...a,current_status:'REVOKED',object_version:3}:{items:[a],next_cursor:null})}
    await s.files.revoke(a);assert.ok(s.files.pending.value);await s.files.checkPending();await s.files.retryPending();const posts=calls.filter(c=>c.o.method==='POST');assert.equal(posts[0].o.headers['If-Match'],'"2"');assert.equal(posts[0].o.body,'{}');assert.equal(posts[0].o.headers['Idempotency-Key'],posts[1].o.headers['Idempotency-Key']);assert.equal(s.revoked.length,1);s.stop()
    const retained=controller();retained.files.rows.value=[a];globalThis.fetch=async(url,o)=>o.method==='POST'?failure(409,'CUSTOMIZATION_ATTACHMENT_RETENTION_REQUIRED'):response({items:[a],next_cursor:null});await retained.files.revoke(a);assert.equal(retained.revoked.length,0);assert.equal(retained.files.rows.value[0].current_status,'READY');assert.equal(retained.files.pending.value,null);assert.ok(retained.files.notice.value.includes('访问未被撤回'));retained.stop()
  })
  test('二进制受控下载校验大小摘要，不内嵌文件，运营下载无主体且临时URL能清理',async()=>{
    const s=controller(true),source=file(),a=await asset(source),calls=[],created=[],revoked=[],clicks=[];s.files.rows.value=[a]
    URL.createObjectURL=blob=>{created.push(blob);return'blob:synthetic-private'};URL.revokeObjectURL=url=>revoked.push(url);globalThis.document={createElement:()=>({click(){clicks.push({href:this.href,download:this.download})}})}
    globalThis.fetch=async(url,o)=>{calls.push({url,o});return new Response(source,{headers:{'Content-Type':'application/octet-stream'}})};await s.files.download(a);assert.equal(calls[0].o.headers['X-Acting-Party'],undefined);assert.equal(calls[0].o.cache,'no-store');assert.ok(calls[0].url.endsWith(`/attachments/${a.id}/content`));assert.equal(created.length,1);assert.equal(clicks[0].download,a.display_name);s.files.clear();assert.ok(revoked.includes('blob:synthetic-private'))
    s.files.rows.value=[a];globalThis.fetch=async()=>new Response('wrong',{headers:{'Content-Type':'application/octet-stream'}});await s.files.download(a);assert.equal(created.length,1);assert.equal(s.files.error.value.code,'PRIVATE_CONTENT_MISMATCH');s.stop()
  })
  test('切身份、请求故事和A到B再回A清原文件，迟到上传与下载均不可恢复',async()=>{
    for(const change of [s=>s.ctx.partyId=id(99),s=>s.ctx.accountId=id(99),s=>s.ctx.requestId=id(99),s=>{s.ctx.partyId=id(99);s.ctx.partyId=who.partyId}]){
      const s=controller(),source=file(),a=await asset(source),ready=defer();xhrHandler=x=>ready.resolve(x);s.files.choose('file',source);const task=s.files.upload('file'),xhr=await ready.promise;change(s);xhrReply(xhr,a);await task;assert.equal(s.uploads.length,0);assert.equal(s.files.pending.value,null);assert.equal(s.files.hasSelection.value,false);assert.deepEqual(s.files.rows.value,[]);s.stop()
    }
    const s=controller(),source=file(),a=await asset(source),late=defer(),urls=[];s.files.rows.value=[a];URL.createObjectURL=()=>{urls.push(true);return'blob:must-not-exist'};globalThis.fetch=()=>late.promise;const task=s.files.download(a);s.ctx.revision++;late.resolve(new Response(source,{headers:{'Content-Type':'application/octet-stream'}}));await task;assert.deepEqual(urls,[]);s.stop()
  })
  test('撤回访问时取消在途下载，迟到二进制不创建临时URL或误报下载成功',async()=>{
    const s=controller(),source=file(),a=await asset(source),late=defer(),created=[];s.files.rows.value=[a];URL.createObjectURL=()=>{created.push(true);return'blob:revoked'}
    globalThis.fetch=async(url,o)=>o.method==='POST'?response({...a,current_status:'REVOKED',object_version:3}):late.promise
    const downloading=s.files.download(a);await s.files.revoke(a);late.resolve(new Response(source,{headers:{'Content-Type':'application/octet-stream'}}));await downloading
    assert.deepEqual(created,[]);assert.equal(s.files.rows.value[0].current_status,'REVOKED');assert.ok(s.files.notice.value.includes('已撤回'));assert.equal(s.files.downloading.value,'');s.stop()
  })
  test('401/403/404读取失权清附件与选择；上传失权也不保留私人文件',async()=>{
    for(const status of [401,403,404]){const s=controller();s.files.choose('file',file());s.files.rows.value=[await asset()];globalThis.fetch=async()=>failure(status,'CUSTOMIZATION_NOT_FOUND');await s.files.load();assert.deepEqual(s.files.rows.value,[]);assert.equal(s.files.hasSelection.value,false);assert.equal(s.denied.length,1);s.stop()}
    const s=controller();xhrHandler=x=>xhrReply(x,null,who,{status:403,code:'CUSTOMIZATION_FORBIDDEN'});s.files.choose('file',file());await s.files.upload('file');assert.equal(s.files.pending.value,null);assert.equal(s.files.hasSelection.value,false);assert.equal(s.denied.length,1);s.stop()
  })
  test('真实本人页面必须先建故事，上传后绑定真实id，保存和正式提交仍分离',async()=>{
    const source=file(),a=await asset(source),calls=[];globalThis.window={confirm:()=>false};xhrCalls=[]
    await render('/operations/customization/mine/new',async({ui,vm})=>{ui.categories=[{template_version_id:id(4),category_code:'FREE',template_version:1,template_snapshot:template(),submission_available:true,unavailable_reason:null}];ui.selectCategory(id(4));vm.files.choose('file',source);assert.equal(vm.files.hasSelection.value,false);assert.equal(xhrCalls.length,0);assert.equal(ui.detail,null)})
    globalThis.fetch=async(url,o)=>{calls.push({url,o});if(url.includes('/attachments?'))return response({items:[],next_cursor:null});if(o.method==='PATCH')return response(record('DRAFT',2,JSON.parse(o.body).answers.file));return response(record())};xhrHandler=x=>xhrReply(x,a)
    const html=await render(`/operations/customization/mine/${id(10)}`,async({ui,vm})=>{await vm.loadPage();vm.files.choose('file',source);assert.equal(vm.pageCanSave,false);assert.equal(vm.allowDiscard(),false);await vm.files.upload('file');assert.equal(ui.draftAnswers.file,a.id);assert.equal(ui.dirty,true);assert.equal(vm.pageCanSubmit,false);assert.ok(vm.pageCanSave);await vm.save();assert.equal(ui.detail.current_status,'DRAFT');assert.equal(ui.detail.answers.file,a.id);assert.ok(vm.pageCanSubmit);assert.equal(ui.detail.submission,null)})
    assert.ok(html.includes(a.display_name));assert.ok(html.includes('type="file"'));const patch=calls.find(c=>c.o.method==='PATCH');assert.equal(JSON.parse(patch.o.body).answers.file,a.id);assert.equal(patch.o.headers['If-Match'],'"1"')
  })
  test('真实页面未知上传禁止保存，可确认暂离；相似文件不当成功，撤回解除本次关联',async()=>{
    const source=file(),a=await asset(source);let writes=0;globalThis.window={confirm:()=>true};globalThis.fetch=async(url,o)=>response(url.includes('/attachments?')?{items:[a],next_cursor:null}:o.method==='POST'?{...a,current_status:'REVOKED',object_version:3}:record());xhrHandler=x=>++writes===1?xhrReply(x,null,who,{status:409,code:'ASSET_UPLOAD_RECONCILIATION_REQUIRED'}):xhrReply(x,a)
    await render(`/operations/customization/mine/${id(10)}`,async({ui,vm})=>{await vm.loadPage();vm.files.choose('file',source);await vm.files.upload('file');assert.equal(vm.allowDiscard(),true);assert.equal(vm.pageCanSave,false);assert.equal(ui.draftAnswers.file,'');await vm.files.checkPending();assert.equal(ui.draftAnswers.file,'');await vm.files.retryPending();assert.equal(ui.draftAnswers.file,a.id);await vm.revokeAttachment(a);assert.equal(ui.draftAnswers.file,'');assert.ok(ui.dirty || ui.detail.answers.file==='');assert.ok(vm.files.notice.value.includes('不表示文件与备份已彻底删除'))})
  })
  test('真实上传401沿用会话失效处理，清空故事、原文件与待确认操作',async()=>{
    globalThis.fetch=async(url)=>response(url.includes('/attachments?')?{items:[],next_cursor:null}:record());xhrHandler=x=>xhrReply(x,null,who,{status:401,code:'AUTHENTICATION_REQUIRED'})
    await render(`/operations/customization/mine/${id(10)}`,async({session,ui,vm})=>{await vm.loadPage();vm.files.choose('file',file());await vm.files.upload('file');assert.equal(session.token,null);assert.equal(ui.detail,null);assert.equal(vm.files.hasSelection.value,false);assert.equal(vm.files.pending.value,null)})
  })
  test('补件换附件先存本人草稿，运营仍显示旧正式附件；正式补交后才产生新版本',async()=>{
    const oldFile=file('old','旧正式附件.txt'),newFile=file('new','新补件附件.txt'),oldAsset=await asset(oldFile,30),newAsset=await asset(newFile,31),calls=[];let saved=false,submitted=false
    xhrHandler=x=>xhrReply(x,newAsset)
    globalThis.fetch=async(url,o)=>{calls.push({url,o});if(url.includes('/attachments?'))return response({items:[oldAsset],next_cursor:null});if(url.endsWith('/supplement')&&o.method==='PATCH'){saved=true;return response(context(4,'OPEN',id(31),{file:'已更换清晰附件'}))}if(url.endsWith('/supplement-submissions')){submitted=true;const r=record('SUBMITTED',5,id(31));r.submission.id=id(21);return response(r)}if(url.endsWith('/supplement'))return response(submitted?context(5,'RESPONDED',id(31),{file:'已更换清晰附件'}):context());const r=record(submitted?'SUBMITTED':'INTAKE',submitted?5:3,submitted?id(31):id(30));if(submitted)r.submission.id=id(21);return response(r)}
    await render(`/operations/customization/mine/${id(10)}`,async({ui,vm})=>{await vm.loadPage();vm.files.choose('file',newFile);await vm.files.upload('file');ui.draftResponses={file:'已更换清晰附件'};await vm.save();assert.equal(saved,true);assert.equal(ui.detail.submission.answers.file,id(30));assert.equal(ui.supplement.draft.answers.file,id(31));vm.submitAcknowledged=true;await vm.submit();assert.equal(submitted,true);assert.equal(ui.detail.submission.answers.file,id(31));assert.equal(ui.supplement.supplement.current_status,'RESPONDED')})
    const patch=calls.find(c=>c.o.method==='PATCH');assert.deepEqual(JSON.parse(patch.o.body),{answers:{story:'合成故事',file:id(31)},responses:{file:'已更换清晰附件'}})
    const opCalls=[];globalThis.fetch=async(url,o)=>{opCalls.push({url,o});return response(url.includes('/attachments?')?{items:[oldAsset],next_cursor:null}:url.endsWith('/supplement')?{...context(4),draft:null,allowed_actions:['READ']}:record('INTAKE',4,id(30)),operator)}
    const html=await render(`/operations/customization/${id(10)}`,async({vm})=>vm.loadPage(),true);assert.ok(html.includes('旧正式附件.txt'));assert.equal(html.includes('新补件附件.txt'),false);assert.ok(opCalls.every(c=>c.o.headers['X-Acting-Party']===undefined))
    globalThis.fetch=async(url)=>response(url.includes('/attachments?')?{items:[oldAsset],next_cursor:null}:url.endsWith('/supplement')?{...context(4,null),draft:null,allowed_actions:['READ','REQUEST_SUPPLEMENT']}:record('INTAKE',4,id(30)),operator)
    const requestable=await render(`/operations/customization/${id(10)}`,async({vm})=>vm.loadPage(),true);assert.ok(requestable.includes('<option value="file"'))
  })
  test('正式内容按其版本引用显示附件名大小，历史附件仍可读但没有公开媒体标签',async()=>{
    const oldAsset=await asset(file('old','历史保留.txt'),30),newAsset=await asset(file('new','当前附件.txt'),31),{default:Submission}=await server.ssrLoadModule('/src/components/CustomizationSubmission.vue')
    const html=await renderToString(createSSRApp({render:()=>h(Submission,{request:record('SUBMITTED',2,id(30)),attachments:[oldAsset,newAsset]})}));assert.ok(html.includes('历史保留.txt'));assert.equal(html.includes('当前附件.txt'),false);assert.ok(html.includes('字节'));assert.ok(html.includes('受控下载'));assert.equal(/<(iframe|img|video|audio)\b/.test(html),false)
  })
  for(const {name,run} of tests){await run();console.log('✓ '+name)}console.log(`\n${tests.length} story-attachment checks passed.`)
} finally {
  globalThis.fetch=saved.fetch;URL.createObjectURL=saved.create;URL.revokeObjectURL=saved.revoke
  for(const [key,value] of [['window',saved.window],['document',saved.document],['XMLHttpRequest',saved.xhr]])if(value===undefined)delete globalThis[key];else globalThis[key]=value
  if(saved.storage)Object.defineProperty(globalThis,'sessionStorage',saved.storage);else delete globalThis.sessionStorage
  await server.close()
}
