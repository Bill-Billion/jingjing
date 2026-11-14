import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {readFileSync} from 'node:fs'
import {createServer} from 'vite'
import vue from '@vitejs/plugin-vue'
import {createSSRApp,effectScope,h,reactive} from 'vue'
import {renderToString} from '@vue/server-renderer'
import {createPinia} from 'pinia'
import {createMemoryHistory,createRouter,RouterView} from 'vue-router'

const root=fileURLToPath(new URL('..',import.meta.url)),server=await createServer({root,configFile:false,plugins:[vue()],resolve:{alias:{'@':root+'/src'}},server:{middlewareMode:true},appType:'custom'})
const old={fetch:globalThis.fetch,create:URL.createObjectURL,revoke:URL.revokeObjectURL,storage:Object.getOwnPropertyDescriptor(globalThis,'sessionStorage')}
Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}})
const id=n=>String(n).padStart(8,'0')+'-0000-4000-8000-000000000001',identity={token:'synthetic-stock-token',accountId:id(1)},record=(n=20)=>({id:id(n),object_version:3,offer_sha256:'a'.repeat(64),title:'合成影片',description:'合成视频说明',unit_minor:500,currency:'CNY'})
const jpeg=new Blob([new Uint8Array([255,216,255,224,0,4,0,0,255,217])],{type:'image/jpeg'}),digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await jpeg.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('')
const media=(n=20)=>({listing_id:id(n),listing_version:3,source_sha256:'b'.repeat(64),preview_sha256:'c'.repeat(64),duration_ms:2000,preview_duration_ms:1000,preview_width:640,preview_height:360,cover:{media_type:'image/jpeg',byte_size:jpeg.size,content_sha256:digest,width:640,height:360,frame_ms:0,source:'REVIEWED_PREVIEW'}})
const response=(data,meta={request_id:'synthetic-stock-read',actor:{account_id:id(1)},acting_party:null})=>new Response(JSON.stringify({meta,data}),{headers:{'Content-Type':'application/json'}})
const failure=(status)=>new Response(JSON.stringify({error:{code:'SYNTHETIC_UNAVAILABLE',message:'本次合成失败'}}),{status,headers:{'Content-Type':'application/json'}})
const deferred=()=>{let resolve;return{promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)}}
const settle=async(check)=>{for(let n=0;n<50&&!check();n++)await new Promise(setImmediate);assert.ok(check(),'pending state did not settle')}
let urls=0,revoked=[]
URL.createObjectURL=()=>`blob:stock-${++urls}`;URL.revokeObjectURL=url=>revoked.push(url)
const tests=[],test=(name,run)=>tests.push({name,run})
try {
 const api=await server.ssrLoadModule('/src/api/modules/stockMedia.ts'),{useStockPublicMedia}=await server.ssrLoadModule('/src/composables/useStockPublicMedia.ts'),{useSessionStore}=await server.ssrLoadModule('/src/stores/session.ts')
 const mock=()=>globalThis.fetch=async(url)=>url.endsWith('/cover')?new Response(jpeg,{headers:{'Content-Type':'image/jpeg'}}):response(media(Number(url.match(/catalog\/(\d+)/)?.[1]||20)))
 function state(n=20){const ctx=reactive({...identity,partyId:id(2),revision:1,scope:'stock/catalog',record:record(n)}),scope=effectScope(),ui=scope.run(()=>useStockPublicMedia(()=>ctx));return {ctx,scope,ui}}
 async function load(s){s.ui.visible.value=true;await s.ui.load()}
 function sessionFor(pinia){const s=useSessionStore(pinia);s.token=identity.token;s.account={id:id(1),display_name:'合成账号',current_status:'ACTIVE',object_version:1,allowed_actions:[]};s.selectedId=id(2);return s}
 test('现货媒体严格验证完整字段、范围、预览来源和版本；拒绝多余字段与伪时长',()=>{
  assert.ok(api.isStockPublicMedia(media()));assert.ok(api.isStockMediaRecord(record()))
  for(const mutate of [m=>m.duration_ms=0,m=>m.preview_duration_ms=1.2,m=>m.preview_duration_ms=1800001,m=>m.preview_width=4097,m=>m.listing_version=0,m=>m.listing_id='not-id',m=>m.cover.byte_size=2097152,m=>m.cover.width=641,m=>m.cover.frame_ms=1,m=>m.cover.source='FULL_PRIVATE_VIDEO',m=>m.cover.media_type='text/html',m=>m.cover.content_sha256='B'.repeat(64),m=>m.extra='untrusted',m=>m.cover.extra=true]){const m=media();mutate(m);assert.equal(api.isStockPublicMedia(m),false)}
  for(const r of [{...record(),offer_sha256:'bad'},{...record(),object_version:0},{...record(),id:'bad'}])assert.equal(api.isStockMediaRecord(r),false)
 })
 test('媒体与JPEG请求只有账号凭证，核对身份和版本且禁缓存',async()=>{
  const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});return url.endsWith('/cover')?new Response(jpeg,{headers:{'Content-Type':'image/jpeg'}}):response(media())}
  const m=await api.getStockPublicMedia({...identity,partyId:id(2)},record());assert.equal((await api.getStockCover({...identity,partyId:id(2)},m)).size,jpeg.size)
  assert.deepEqual(calls.map(c=>c.url),['/api/v1/stock/catalog/'+id(20)+'/media','/api/v1/stock/catalog/'+id(20)+'/cover'])
  for(const {options:o} of calls){assert.equal(o.headers.Authorization,'Bearer '+identity.token);assert.equal(o.headers['X-Acting-Party'],undefined);assert.equal(o.cache,'no-store');assert.equal(o.credentials,'omit')}
 })
 test('错账号、主体、影片或新版本的媒体回复均不采用',async()=>{
  for(const r of [response(media(),{request_id:'synthetic',actor:{account_id:id(9)},acting_party:null}),response(media(),{request_id:'synthetic',actor:{account_id:id(1)},acting_party:id(2)}),response(media(99)),response({...media(),listing_version:4}),response(media(),{})]){globalThis.fetch=async()=>r;await assert.rejects(api.getStockPublicMedia(identity,record()),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE')}
 })
 test('封面核对JPEG类型、大小、摘要和签名后才可解码，拒绝HTML或其他字节',async()=>{
  for(const [blob,type,m] of [[jpeg,'text/html',media()],[new Blob(['bad']),'image/jpeg',media()],[jpeg,'image/jpeg',{...media(),cover:{...media().cover,content_sha256:'f'.repeat(64)}}]]){globalThis.fetch=async()=>new Response(blob,{headers:{'Content-Type':type}});await assert.rejects(api.getStockCover(identity,m),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE')}
  const blob=new Blob(['0123456789']),sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');globalThis.fetch=async()=>new Response(blob,{headers:{'Content-Type':'image/jpeg'}});await assert.rejects(api.getStockCover(identity,{...media(),cover:{...media().cover,content_sha256:sha}}))
 })
 test('完整片和预览时长独立显示，保留亚秒数值，无默认0秒',()=>{
  assert.equal(api.stockDuration(2000),'2 秒');assert.equal(api.stockDuration(1000),'1 秒');assert.equal(api.stockDuration(1),'0.001 秒');assert.equal(api.stockDuration(61050),'1 分 1.05 秒');assert.equal(api.stockDuration(0),'暂不可读取')
 })
 test('未进入可见区域不请求，成功后仅保留内存URL，离开即释放',async()=>{
  let reads=0;mock();const fetch=globalThis.fetch;globalThis.fetch=(...args)=>{reads++;return fetch(...args)}
  const s=state();await s.ui.load();assert.equal(reads,0);s.ui.setVisible(true);await settle(()=>!s.ui.busy.value);assert.equal(reads,2);assert.equal(s.ui.media.value.duration_ms,2000);const oldUrl=s.ui.url.value;s.ui.setVisible(false);assert.equal(s.ui.url.value,'');assert.equal(s.ui.media.value,null);assert.ok(revoked.includes(oldUrl));s.scope.stop()
 })
 test('作品下架、授权和媒体版本变化给出读取指引，不误导重新提交或购买',async()=>{
  const {explainError}=await server.ssrLoadModule('/src/api/errors.ts'),{default:Alert}=await server.ssrLoadModule('/src/components/ApiErrorAlert.vue')
  const messages={STOCK_NOT_LISTED:'作品当前未公开销售，请返回选购影片列表查看当前作品。',STOCK_RIGHTS_CHANGED:'作品授权依据已变化，当前版本暂不可使用。请返回选购影片列表查看当前作品。',STOCK_SALE_CONSENT_REQUIRED:'作品当前授权未覆盖现货销售和公开展示，请返回选购影片列表查看其他作品。',MEDIA_SOURCE_CHANGED:'媒体版本在读取期间发生变化，请刷新作品详情后重新读取封面与时长。'}
  for(const [code,message] of Object.entries(messages)){
   const error={status:409,code,message:'internal stock failure',retryable:false,requestId:'synthetic-stock-read',requestMethod:'GET'}
   assert.equal(explainError(error),message)
   const html=await renderToString(createSSRApp({render:()=>h(Alert,{error})}))
   assert.ok(html.includes(message));assert.ok(html.includes(code));assert.ok(html.includes(error.requestId));assert.equal(html.includes('重新发起'),false)
  }
  assert.equal(explainError({status:503,code:'STORED_CONTENT_MISMATCH',message:'internal mismatch',retryable:false,requestMethod:'GET'}),'保存文件的大小或校验值不一致，已停止使用本材料。')
 })
 test('重试先清旧图时长；401/403/404/409/503明确失败，之后能手动恢复',async()=>{
  for(const status of [401,403,404,409,503]){mock();const s=state();await load(s);const oldUrl=s.ui.url.value;globalThis.fetch=async()=>failure(status);const retry=s.ui.load();assert.equal(s.ui.url.value,'');assert.equal(s.ui.media.value,null);await retry;assert.equal(s.ui.error.value.status,status);assert.ok(revoked.includes(oldUrl));mock();await s.ui.load();assert.ok(s.ui.url.value);s.scope.stop()}
 })
 test('新版本/换影片/换身份/会话修订/路径切换立即清旧图并忽略迟到回复',async()=>{
  for(const change of [c=>c.record=record(21),c=>c.record={...record(),object_version:4},c=>c.record={...record(),offer_sha256:'d'.repeat(64)},c=>c.partyId=id(3),c=>c.revision++,c=>c.scope='stock/catalog?city=next']){
   mock();const s=state();await load(s);const before=s.ui.url.value,late=deferred();globalThis.fetch=async()=>late.promise;const pending=s.ui.load();await new Promise(setImmediate);change(s.ctx);assert.equal(s.ui.url.value,'');assert.equal(s.ui.media.value,null);assert.ok(revoked.includes(before));s.ui.setVisible(false);late.resolve(response(media()));await pending;await settle(()=>!s.ui.busy.value);assert.equal(s.ui.url.value,'');s.scope.stop()
  }
 })
 test('退出或账号变化时清资料，读取摘要期间的旧结果不能再生成对象URL',async()=>{
  const original=Blob.prototype.arrayBuffer,entered=deferred(),finish=deferred(),s=state();let creations=urls
  mock();Blob.prototype.arrayBuffer=function(){entered.resolve();return finish.promise}
  try{const reading=load(s);await entered.promise;s.ctx.token=null;s.ctx.accountId='';finish.resolve(new Uint8Array([255,216,255,224,0,4,0,0,255,217]).buffer);await reading;assert.equal(urls,creations);assert.equal(s.ui.url.value,'');assert.equal(s.ui.media.value,null)}finally{Blob.prototype.arrayBuffer=original;s.scope.stop()}
 })
 test('可见封面处理最多两个并行，排队项离开不发请求且不占用后续槽位',async()=>{
  const gates=new Map(),calls=[];globalThis.fetch=async url=>{calls.push(url);if(url.endsWith('/cover'))return new Response(jpeg,{headers:{'Content-Type':'image/jpeg'}});const n=Number(url.match(/catalog\/(\d+)/)[1]),g=deferred();gates.set(n,g);return g.promise}
  const a=state(20),b=state(21),c=state(22),d=state(23);const p=[load(a),load(b),load(c)];await settle(()=>gates.size===2);assert.equal(calls.length,2);c.ui.setVisible(false);gates.get(20).resolve(response(media(20)));gates.get(21).resolve(response(media(21)));await Promise.all(p);assert.equal(calls.some(url=>url.includes(id(22))),false)
  const next=load(d);await settle(()=>gates.has(23));gates.get(23).resolve(response(media(23)));await next;assert.ok(d.ui.url.value);for(const s of[a,b,c,d])s.scope.stop()
 })
 test('图片解码失败或实际尺寸不符立即撤销；旧图片事件不清新图',async()=>{
  mock();const s=state();await load(s);const oldUrl=s.ui.url.value;s.ui.imageFailed('blob:previous');assert.equal(s.ui.url.value,oldUrl);s.ui.imageLoaded(oldUrl,1,1);assert.equal(s.ui.url.value,'');assert.equal(s.ui.media.value,null);assert.ok(revoked.includes(oldUrl));assert.equal(s.ui.error.value.code,'STOCK_COVER_DECODE_FAILED');await s.ui.load();s.ui.imageLoaded(s.ui.url.value,640,360);assert.ok(s.ui.url.value);s.ui.imageFailed(s.ui.url.value);assert.equal(s.ui.url.value,'');s.scope.stop()
 })
 test('真实媒体组件渲染两种时长、真实封面及重试提示，文案安全转义',async()=>{
  const {default:Panel}=await server.ssrLoadModule('/src/components/business/StockPublicMedia.vue');let vm
  async function render(fail=false){const pinia=createPinia(),session=sessionFor(pinia);if(fail)globalThis.fetch=async()=>failure(503);else mock();const app=createSSRApp({render:()=>h(Panel,{record:record(),name:'<script>合成</script>',scope:'stock/catalog',compact:true})}).use(pinia);app.mixin({created(){if(this.$options.__name==='StockPublicMedia')vm=this.$.setupState},serverPrefetch(){if(this.$options.__name==='StockPublicMedia'){vm.ui.visible.value=true;return vm.ui.load()}}});try{return await renderToString(app)}finally{vm.ui.clear();session.$dispose()}}
  const ready=await render();assert.ok(ready.includes('完整影片'));assert.ok(ready.includes('2 秒'));assert.ok(ready.includes('1 秒'));assert.ok(ready.includes('blob:stock-'));assert.ok(ready.includes('&lt;script&gt;'));assert.equal(ready.includes('<script>'),false)
  const failed=await render(true);assert.ok(failed.includes('封面或时长暂不可读取'));assert.ok(failed.includes('重新读取封面与时长'));assert.equal(failed.includes('<img'),false);assert.equal(failed.includes('0 秒'),false)
 })
 test('实际BusinessView的现货目录和详情都接组件，预览入口仍独立可用',async()=>{
  const {default:View}=await server.ssrLoadModule('/src/views/BusinessView.vue');const cases=[['catalog',false,1],['catalog',true,1],['listings',false,0]]
  for(const [section,detail,count] of cases){const pinia=createPinia(),session=sessionFor(pinia),router=createRouter({history:createMemoryHistory(),routes:[{path:'/stock/:section/:recordId?',component:View,meta:{domain:'stock'}},{path:'/:pathMatch(.*)*',component:{render:()=>null}}]});await router.push(`/stock/${section}${detail?'/'+id(20):''}`);await router.isReady();let vm;const app=createSSRApp({render:()=>h(RouterView)}).use(pinia).use(router);app.mixin({created(){if(this.$options.__name==='BusinessView')vm=this.$.setupState},serverPrefetch(){if(this.$options.__name==='BusinessView')vm.ui.data.value=detail?record():{items:[record()],next_cursor:null}}});const html=await renderToString(app);assert.equal((html.match(/data-testid="stock-public-media"/g)||[]).length,count);if(section==='catalog'&&detail)assert.ok(html.includes('播放影片预览'));vm.ui.clear();session.$dispose()}
  const source=readFileSync(root+'/src/components/business/StockPublicMedia.vue','utf8');assert.ok(source.includes('IntersectionObserver'));assert.ok(source.includes('visibilitychange'));assert.ok(source.includes('object-fit:contain'))
 })
 for(const {name,run}of tests){await run();console.log('✓ '+name)}console.log(`\n${tests.length} stock-media checks passed.`)
} finally {
 globalThis.fetch=old.fetch;URL.createObjectURL=old.create;URL.revokeObjectURL=old.revoke
 if(old.storage)Object.defineProperty(globalThis,'sessionStorage',old.storage);else delete globalThis.sessionStorage
 await server.close()
}
