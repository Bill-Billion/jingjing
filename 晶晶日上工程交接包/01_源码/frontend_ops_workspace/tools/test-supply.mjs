import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createSSRApp, effectScope, h, reactive } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
const root = fileURLToPath(new URL('..', import.meta.url))
const server = await createServer({ root, configFile: false, plugins: [vue()], resolve: { alias: { '@': `${root}/src` } }, server: { middlewareMode: true }, appType: 'custom' })
const originalFetch = globalThis.fetch
const id = n => `${String(n).padStart(8,'0')}-0000-4000-8000-000000000001`
const who = { token: 'supply-test-token', accountId: id(1), partyId: id(2) }
const reviewIdentity = { ...who, partyId: null }
const stamp = '2026-09-29T00:00:00.000Z', bytes = new Blob(['Private text <script>literal</script>'])
const digest = createHash('sha256').update(await bytes.text()).digest('hex')
const asset = (purpose = 'RIGHTS_EVIDENCE') => ({ id: id(3), owner_party_id: id(2), purpose, media_type: 'text/plain', byte_size: bytes.size, content_sha256: digest, current_status: 'READY' })
const profile = (revision = 1) => ({ id: id(10 + revision), kind: 'PROFILE', stream_ref: id(2), revision, owner_party_id: id(2), created_by: id(1), current_status: 'PENDING_REVIEW', object_version: 1, data: { display_name: '测试供给', description: '私有资料', evidence_asset_ids: [id(3)], review: null } })
const work = () => ({ id: id(20), kind: 'WORK_VERSION', stream_ref: id(21), revision: 1, owner_party_id: id(2), created_by: id(1), current_status: 'DRAFT', object_version: 1, data: { version: { content: { id: id(20), work_id: id(21), revision: 1, kind: 'ORIGINAL', source_version_id: null, project_id: null, owner_party_id: id(2), title: '测试作品', content_asset_id: id(3), content_sha256: digest, evidence_ids: [id(3)] }, object_version: 1, current_status: 'DRAFT', submitted_at: null, reviews: [], withdrawal: null }, credits: [{ party_id: id(2), role: 'RIGHTS_HOLDER', evidence_asset_ids: [id(3)] }] } })
const submitted = () => { const r = work(); r.current_status = 'AWAITING_REVIEW'; r.object_version = r.data.version.object_version = 2; r.data.version.current_status = 'SUBMITTED'; r.data.version.submitted_at = stamp; return r }
const response = (data, identity = who) => new Response(JSON.stringify({ meta: { request_id: 'supply-test', actor: { account_id: identity.accountId }, acting_party: identity.partyId }, data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
const failed = (status, code) => new Response(JSON.stringify({ meta: { request_id: 'supply-test' }, error: { code, message: 'test-only', retryable: false, details: [] } }), { status, headers: { 'Content-Type': 'application/json' } })
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const tests = [], test = (name, run) => tests.push({ name, run })
try {
  const api = await server.ssrLoadModule('/src/api/modules/supply.ts')
  const { useSupply } = await server.ssrLoadModule('/src/composables/useSupply.ts')
  const { loginRedirect } = await server.ssrLoadModule('/src/router/loginRedirect.ts')
  const { onUnauthorized } = await server.ssrLoadModule('/src/api/client.ts')
  const state = (reviewer = false) => {
    const context = reactive({ ...(reviewer ? reviewIdentity : who), revision: 0, scope: 'supply' })
    const scope = effectScope(), ui = scope.run(() => useSupply(() => context))
    return { context, scope, ui }
  }
  const profileWrite = () => ({ path: '/supply/profiles', kind: 'PROFILE', label: '提交申请', body: { display_name: '真实输入', description: '权利来源说明', evidence_asset_ids: [id(3)], previous_profile_id: null } })
  test('安全登录返回覆盖本批各路由，拒绝外站和伪编号', async () => {
    for (const path of ['/supply/profiles', `/supply/profiles/${id(11)}`, '/supply/works', '/supply/works/new', `/supply/adaptations/${id(15)}/new`, `/supply/works/${id(20)}`, `/supply/works/${id(20)}/revision`, '/supply/reviews/profile', `/supply/reviews/rights/${id(20)}`, '/supply/reviews/content']) assert.equal(loginRedirect(path), path)
    for (const path of ['//host/supply/works', '/supply/works/new?role=OWNER', '/supply/works/../new', '/supply/works/' + '-'.repeat(36), '/supply/reviews/admin', '/supply/works\n', ['/supply/works']]) assert.equal(loginRedirect(path), '/workspace')
  })
  test('负责人列表准确带身份头，审核列表不带身份且只用kind/cursor/limit', async () => {
    const calls = []
    globalThis.fetch = async (url, options) => { calls.push({ url, options }); return response({ items: [], next_cursor: null }, options.headers['X-Acting-Party'] ? who : reviewIdentity) }
    await api.listSupply(who, 'WORK_VERSION', id(5)); await api.listSupply(reviewIdentity, 'PROFILE')
    assert.equal(calls[0].url, `/api/v1/supply/records?kind=WORK_VERSION&limit=20&cursor=${id(5)}`)
    assert.equal(calls[1].url, '/api/v1/supply/records?kind=PROFILE&limit=20')
    assert.equal(calls[0].options.headers['X-Acting-Party'], id(2)); assert.equal(calls[1].options.headers['X-Acting-Party'], undefined)
    for (const c of calls) { assert.equal(c.options.cache,'no-store'); assert.equal(c.options.headers.Authorization, 'Bearer supply-test-token'); assert.equal(c.options.headers['If-Match'],undefined) }
  })
  test('记录DTO允许声明中的空证据，但拒绝错主体、错类型和状态错配', async () => {
    assert.equal(api.isSupplyRecord(profile()), true); assert.equal(api.isSupplyRecord(work()), true); assert.equal(api.isSupplyRecord(submitted()), true)
    const emptyEvidence = work(); emptyEvidence.data.version.content.evidence_ids = []; assert.equal(api.isSupplyRecord(emptyEvidence), true)
    for (const mutate of [r => { r.data.version.content.id = id(99) }, r => { r.current_status = 'REVIEWS_COMPLETE' }, r => { r.data.version.current_status = 'SUBMITTED' }, r => { r.data.credits = [] }, r => { r.data.credits[0].role = 'AUTHOR' }, r => { r.data.version.content.source_version_id = id(10) }, r => { r.data.version.content.content_sha256 = 'wrong' }]) { const r = work(); mutate(r); assert.equal(api.isSupplyRecord(r), false) }
    globalThis.fetch = async () => response({ ...work(), owner_party_id: id(99) })
    await assert.rejects(api.getSupply(who,id(20),'WORK_VERSION'),e => e.code === 'UNEXPECTED_RESPONSE_SHAPE')
    globalThis.fetch = async () => response({ items: [profile()], next_cursor: null })
    await assert.rejects(api.listSupply(who,'WORK_VERSION'),e => e.code === 'UNEXPECTED_RESPONSE_SHAPE')
  })
  test('新投稿写请求仍要求非空证明，不因历史读取兼容而放宽', async () => {
    let called = false; globalThis.fetch = async () => { called = true; return response(work()) }
    await assert.rejects(api.postSupply(who,{path:'/supply/work-versions',kind:'WORK_VERSION',label:'保存草稿',body:{work_id:null,previous_version_id:null,title:'标题',kind:'ORIGINAL',source_version_id:null,project_id:null,content_asset_id:id(3),evidence_ids:[],credits:work().data.credits}},'work-key'),e=>e.code==='CLIENT_RIGHTS_EVIDENCE_REQUIRED')
    assert.equal(called,false)
  })
  test('原始二进制上传准确query及Content-Type，READY才可引用', async () => {
    let call
    globalThis.fetch = async (url,options) => { call = { url,options }; return response(asset()) }
    const command = { path: '/supply/assets?' + new URLSearchParams({ purpose: 'RIGHTS_EVIDENCE', media_type: 'text/plain' }), kind: 'ASSET', label: '上传', purpose: 'RIGHTS_EVIDENCE', mediaType: 'text/plain', blob: bytes }
    await api.postSupply(who,command,'fixed-upload-key')
    assert.equal(call.url,'/api/v1/supply/assets?purpose=RIGHTS_EVIDENCE&media_type=text%2Fplain'); assert.equal(call.options.body,bytes)
    assert.equal(call.options.headers['Content-Type'],'application/octet-stream'); assert.equal(call.options.headers['Idempotency-Key'],'fixed-upload-key')
    globalThis.fetch = async () => response({ ...asset(), current_status: 'UPLOADING' })
    await assert.rejects(api.postSupply(who,command,'fixed-upload-key'), e => e.code === 'UNEXPECTED_RESPONSE_SHAPE')
    for (const blob of [new Blob([]),new Blob([new Uint8Array(8388609)])]) await assert.rejects(api.postSupply(who,{ ...command,blob },'fixed-upload-key'),e => e.code === 'CLIENT_ASSET_INVALID')
  })
  test('下载是受控字节，验证大小与指纹，拒绝公开URL或HTML假成功', async () => {
    let options,requestUrl
    globalThis.fetch = async (url,opt) => { requestUrl=url;options = opt; return new Response(bytes,{ headers: { 'Content-Type':'application/octet-stream' } }) }
    assert.equal((await api.downloadSupplyAsset(reviewIdentity,asset())).size,bytes.size)
    assert.equal(requestUrl,`/api/v1/supply/assets/${id(3)}/content`)
    assert.equal(options.headers['X-Acting-Party'],undefined); assert.equal(options.cache,'no-store'); assert.equal(options.credentials,'omit')
    globalThis.fetch = async () => new Response('wrong',{ headers: { 'Content-Type':'application/octet-stream' } })
    await assert.rejects(api.downloadSupplyAsset(who,asset()),e => e.code === 'UNEXPECTED_RESPONSE_SHAPE')
    globalThis.fetch = async () => new Response(bytes,{ headers: { 'Content-Type':'application/octet-stream' } })
    await assert.rejects(api.downloadSupplyAsset(who,{ ...asset(), content_sha256: 'a'.repeat(64) }),e => e.code === 'UNEXPECTED_RESPONSE_SHAPE')
    globalThis.fetch = async () => response({ url: 'https://example.com/private' })
    await assert.rejects(api.downloadSupplyAsset(who,asset()),e => e.code === 'UNEXPECTED_RESPONSE_SHAPE')
  })
  test('审核POST不携身份头，使用准确轨道、理由和原If-Match', async () => {
    let call
    globalThis.fetch = async (url,options) => { call = { url,options }; return response(submitted(),reviewIdentity) }
    await api.postSupply(reviewIdentity,{ path:`/supply/work-versions/${id(20)}/reviews`,kind:'WORK_VERSION',targetId:id(20),version:2,label:'权属审核',body:{channel:'RIGHTS',decision:'APPROVED',reason:'已核对'} },'review-key')
    assert.equal(call.options.headers['X-Acting-Party'],undefined); assert.equal(call.options.headers['If-Match'],'"2"'); assert.deepEqual(JSON.parse(call.options.body),{channel:'RIGHTS',decision:'APPROVED',reason:'已核对'})
  })
  test('分页合并去重，完整记录可按修订判新旧，重复游标拒绝', async () => {
    const { ui,scope } = state(); let n=0
    globalThis.fetch = async () => response(++n===1 ? {items:[profile(2)],next_cursor:id(7)} : {items:[profile(1),profile(3)],next_cursor:null})
    const all=await ui.loadAll('PROFILE'); assert.equal(Math.max(...all.map(r=>r.revision)),3)
    n=0;globalThis.fetch = async()=>response(++n===1 ? {items:[profile(1)],next_cursor:id(7)} : {items:[profile(1),profile(2)],next_cursor:null})
    await ui.loadList('PROFILE');await ui.loadList('PROFILE',true);assert.equal(ui.rows.value.length,2)
    globalThis.fetch = async()=>response({items:[],next_cursor:id(7)});assert.equal(await ui.loadAll('PROFILE'),null);assert.equal(ui.error.value.code,'UNEXPECTED_RESPONSE_SHAPE');scope.stop()
  })
  test('失败后重试保留同一幂等键和完整payload，成功后GET最新状态', async () => {
    const {ui,scope}=state();const command=profileWrite();const calls=[];let count=0,done
    globalThis.fetch=async(url,options)=>{calls.push({url,options});if(options.method==='POST'&&++count===1)throw new TypeError('uncertain');return response(profile())}
    await ui.write(command,r=>{done=r});assert.equal(ui.pending.value.state,'retry');command.body.description='later editing'
    await ui.retry();assert.equal(ui.pending.value,null);assert.equal(done.id,id(11))
    const posts=calls.filter(c=>c.options.method==='POST');assert.equal(posts[0].options.headers['Idempotency-Key'],posts[1].options.headers['Idempotency-Key']);assert.equal(posts[0].options.body,posts[1].options.body)
    assert.equal(calls.at(-1).url,`/api/v1/supply/records/${id(11)}`);scope.stop()
  })
  test('写入已成功但GET失败时只重读，不再次POST', async()=>{
    const {ui,scope}=state();let posts=0,gets=0
    globalThis.fetch=async(_url,o)=>{if(o.method==='POST'){posts++;return response(profile())}if(++gets===1)return failed(503,'SERVICE_UNAVAILABLE');return response(profile())}
    await ui.write(profileWrite(),()=>{});assert.equal(ui.pending.value.state,'refresh');await ui.retry();assert.equal(posts,1);assert.equal(gets,2);scope.stop()
  })
  test('提交、撤回和独立审核后详情、列表及历史使用同一最新状态，保留其他版本意见', async()=>{
    const withdrawn=submitted();withdrawn.current_status='WITHDRAWN';withdrawn.object_version=withdrawn.data.version.object_version=3;withdrawn.data.version.current_status='WITHDRAWN';withdrawn.data.version.withdrawal={reason:'补正后再提交',recorded_at:stamp}
    const rights=submitted();rights.current_status='CHANGES_REQUESTED';rights.object_version=rights.data.version.object_version=3;rights.data.version.reviews=[{channel:'RIGHTS',decision:'CHANGES_REQUESTED',reason:'请补充权利证明',reviewer_account_id:id(8),recorded_at:stamp,evidence_ref:'review-rights',version_id:id(20)}]
    const content=submitted();content.current_status='REVIEWS_COMPLETE';content.object_version=content.data.version.object_version=4;content.data.version.reviews=['RIGHTS','CONTENT'].map(channel=>({channel,decision:'APPROVED',reason:`${channel}已核对`,reviewer_account_id:id(8),recorded_at:stamp,evidence_ref:`review-${channel}`,version_id:id(20)}))
    const approved=profile();approved.current_status='APPROVED';approved.object_version=2;approved.data.review={decision:'APPROVED',reason:'供给材料已核对',reviewer_account_id:id(8),recorded_at:stamp}
    for(const [before,after,body,reviewer] of [[work(),submitted(),{action:'SUBMIT',reason:null},false],[submitted(),withdrawn,{action:'WITHDRAW',reason:'补正后再提交'},false],[submitted(),rights,{channel:'RIGHTS',decision:'CHANGES_REQUESTED',reason:'请补充权利证明'},true],[submitted(),content,{channel:'CONTENT',decision:'APPROVED',reason:'内容已核对'},true],[profile(),approved,{decision:'APPROVED',reason:'供给材料已核对'},true]]){
      const {ui,scope}=state(reviewer),identity=reviewer?reviewIdentity:who
      const historical=structuredClone(after);historical.id=id(99);historical.revision=1
      if(historical.kind==='WORK_VERSION'){historical.data.version.content.id=id(99);historical.data.version.reviews.forEach(review=>{review.version_id=id(99)})}
      assert.equal(api.isSupplyRecord(historical),true)
      const historicalSnapshot=structuredClone(historical)
      ui.detail.value=before;ui.rows.value=[before];ui.history.value=[before,historical]
      globalThis.fetch=async(_url,options)=>response(options.method==='POST'?before:after,identity)
      const family=before.kind==='PROFILE'?'profiles':'work-versions',operation='action' in body?'actions':'reviews'
      await ui.write({path:`/supply/${family}/${before.id}/${operation}`,kind:before.kind,targetId:before.id,version:before.object_version,label:'更新记录',body},()=>{})
      assert.deepEqual(ui.detail.value,after);assert.deepEqual(ui.rows.value,[after]);assert.deepEqual(ui.history.value,[after,historicalSnapshot]);scope.stop()
    }
  })
  test('409处理中原键可重试，上传需核对和确定冲突禁止盲重试', async()=>{
    for(const code of ['IDEMPOTENCY_IN_PROGRESS','UPLOAD_RECONCILIATION_REQUIRED','PREVIOUS_VERSION_MISMATCH']){
      const {ui,scope}=state();let calls=0;globalThis.fetch=async()=>{calls++;return failed(409,code)}
      await ui.write(profileWrite(),()=>{});const key=ui.pending.value.key
      assert.equal(ui.pending.value.state,code==='IDEMPOTENCY_IN_PROGRESS'?'retry':'blocked')
      await ui.retry();assert.equal(calls,code==='IDEMPOTENCY_IN_PROGRESS'?2:1);assert.equal(ui.pending.value.key,key);scope.stop()
    }
  })
  test('412刷新目标且要求重新确认，不自动重放旧决定', async()=>{
    const {ui,scope}=state(true);let posts=0
    ui.rows.value=[work()];ui.history.value=[work()]
    globalThis.fetch=async(_url,o)=>{if(o.method==='POST'){posts++;return failed(412,'VERSION_CONFLICT')}return response(submitted(),reviewIdentity)}
    await ui.write({path:`/supply/work-versions/${id(20)}/reviews`,kind:'WORK_VERSION',targetId:id(20),version:1,label:'审核',body:{channel:'RIGHTS',decision:'APPROVED',reason:'已核对'}},()=>assert.fail('must reconfirm'))
    assert.equal(ui.pending.value,null);assert.equal(ui.conflictRevision.value,1);assert.equal(ui.detail.value.object_version,2);assert.deepEqual(ui.rows.value,[submitted()]);assert.deepEqual(ui.history.value,[submitted()]);assert.equal(posts,1);scope.stop()
  })
  test('403清除申请、详情、材料、上传和待操作，不用别的身份回退', async()=>{
    const {ui,scope}=state();ui.rows.value=[profile()];ui.history.value=[work()];ui.detail.value=work();ui.assets.value={[id(3)]:asset()}
    globalThis.fetch=async()=>failed(403,'SUPPLY_PARTY_FORBIDDEN');await ui.write(profileWrite(),()=>assert.fail())
    assert.deepEqual(ui.rows.value,[]);assert.deepEqual(ui.history.value,[]);assert.equal(ui.detail.value,null);assert.deepEqual(ui.assets.value,{});assert.equal(ui.pending.value,null);scope.stop()
  })
  test('身份A→B→A、换轨道、退出均清理且丢弃迟到上传与记录', async()=>{
    for(const change of [c=>{c.partyId=id(99);c.partyId=id(2)},c=>{c.scope='review-content'},c=>{c.token=null},c=>{c.revision++}]){
      const {ui,context,scope}=state();const late=defer();globalThis.fetch=()=>late.promise;const pending=ui.loadRecord(id(11),'PROFILE');change(context);late.resolve(response(profile()));await pending;assert.equal(ui.detail.value,null);scope.stop()
    }
    const {ui,context,scope}=state();const late=defer();globalThis.fetch=()=>late.promise;const pending=ui.write({path:'/supply/assets?purpose=RIGHTS_EVIDENCE&media_type=text%2Fplain',kind:'ASSET',purpose:'RIGHTS_EVIDENCE',mediaType:'text/plain',blob:bytes,label:'上传'},()=>assert.fail('stale upload'))
    context.partyId=id(99);late.resolve(response(asset()));await pending;assert.deepEqual(ui.assets.value,{});assert.equal(ui.pending.value,null);scope.stop()
  })
  test('同身份更换记录，旧成功、错误与收尾不得覆盖新请求', async()=>{
    const {ui,scope}=state();const first=defer(),second=defer();let n=0;globalThis.fetch=()=>++n===1?first.promise:second.promise
    const p1=ui.loadRecord(id(11),'PROFILE'),p2=ui.loadRecord(id(12),'PROFILE');first.resolve(failed(403,'SUPPLY_PARTY_FORBIDDEN'));await p1;assert.equal(ui.reading.value.detail,true)
    second.resolve(response(profile(2)));await p2;assert.equal(ui.detail.value.id,id(12));assert.equal(ui.error.value,null);scope.stop()
  })
  test('旧401不退出新会话，当前401清理私有内容', async()=>{
    const {ui,context,scope}=state();onUnauthorized(token=>{if(token===context.token)context.token=null})
    const late=defer();globalThis.fetch=()=>late.promise;const p=ui.loadRecord(id(11),'PROFILE');context.token='new-token';late.resolve(failed(401,'AUTHENTICATION_REQUIRED'));await p;assert.equal(context.token,'new-token')
    globalThis.fetch=async()=>failed(401,'AUTHENTICATION_REQUIRED');await ui.loadRecord(id(11),'PROFILE');assert.equal(context.token,null);assert.equal(ui.detail.value,null);scope.stop();onUnauthorized(()=>{})
  })
  test('账号、合同、供给及审核页面保留同一菜单，详情和内容审核正确标记当前入口', async()=>{
    const previousWindow = globalThis.window
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
    const storage = new Map()
    // This application runs in a browser. SSR here only checks its rendered
    // navigation, with an isolated anonymous session on every Node version.
    globalThis.window = { setInterval:()=>0, clearInterval:()=>{} }
    Object.defineProperty(globalThis, 'sessionStorage', { configurable:true, value:{
      getItem:key=>storage.get(key) ?? null,
      setItem:(key,value)=>storage.set(key,String(value)),
      removeItem:key=>storage.delete(key),
      clear:()=>storage.clear(),
    } })
    try {
    const entries = [['/workspace','账号与机构'],['/contracts','合同与规则'],['/supply/profiles','供给申请'],['/supply/works','我的作品'],['/licensing/catalog','选剧本'],['/licensing/products','许可商品'],['/licensing/reservations','许可办理'],['/licensing/projects','项目与绑定'],['/licensing/readings','受控阅稿'],['/trade/specifications','商品规格'],['/trade/quotes','报价订单'],['/gigs/catalogue','商单需求与提案'],['/gigs/relations','直接 MCN 合作'],['/gigs/commissions','佣金计提'],['/gigs/rankings','商单榜单'],['/trade/payments','付款退款'],['/production/projects','制作项目'],['/projects/projects','项目选角'],['/projects/plans','项目会签'],['/projects/releases','项目发行'],['/projects/channels','渠道档案'],['/finance/agreements','结算约定与余额'],['/finance/payouts','财务付款'],['/finance/income','渠道收入与对账'],['/finance/disputes','争议与账务调整'],['/operations/notifications','业务通知与留言'],['/operations/reports','经营报表'],['/operations/moderation','留言独立管理'],['/operations/audit','操作审计'],['/finance/reviews/agreements','独立财务核验'],['/gigs/reviews/requests','商单与提案核验'],['/gigs/reviews/rules','商单规则核验'],['/supply/reviews/profile','供给审核'],['/supply/reviews/rights','作品审核'],['/licensing/reviews/products','许可核验'],['/trade/reviews/specifications','规格审核'],['/trade/reviews/quotes','报价审核'],['/trade/reviews/refunds','退款与旧单核对'],['/production/reviews/projects','制作独立核验'],['/projects/reviews/plans','项目独立核验']]
    for (const [view,path,current] of [
      ['ContractsView','/contracts','/contracts'],
      ['WorkspaceView','/workspace','/workspace'],
      ['SupplyView','/supply/profiles','/supply/profiles'],
      ['SupplyView','/supply/works/new','/supply/works'],
      ['SupplyView',`/supply/adaptations/${id(15)}/new`,'/supply/works'],
      ['SupplyView',`/supply/works/${id(20)}/revision`,'/supply/works'],
      ['SupplyView',`/supply/reviews/profile/${id(11)}`,'/supply/reviews/profile'],
      ['SupplyView',`/supply/reviews/content/${id(20)}`,'/supply/reviews/rights'],
    ]) {
      const {default:View} = await server.ssrLoadModule(`/src/views/${view}.vue`)
      const router = createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:View}]})
      const app = createSSRApp({render:()=>h(RouterView)}).use(createPinia()).use(router)
      await router.push(path); await router.isReady()
      const html = await renderToString(app)
      const nav = html.match(/<nav\b[^>]*aria-label="工作区导航"[^>]*>([\s\S]*?)<\/nav>/)?.[1]
      assert.ok(nav,`${path} 缺少统一导航`)
      const links = [...nav.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([,attrs,text])=>({
        href:attrs.match(/\bhref="([^"]+)"/)?.[1],
        label:text.replace(/<[^>]*>/g,'').trim(),
        current:attrs.includes('aria-current="page"'),
      }))
      assert.deepEqual(links.map(link=>[link.href,link.label]),entries,`${path} 菜单发生变化`)
      assert.deepEqual(links.filter(link=>link.current).map(link=>link.href),[current],`${path} 当前入口标记错误`)
    }
    } finally {
      if (previousWindow === undefined) delete globalThis.window
      else globalThis.window = previousWindow
      if (previousStorage) Object.defineProperty(globalThis, 'sessionStorage', previousStorage)
      else delete globalThis.sessionStorage
    }
  })
  test('实际组件缩略编号保留完整title，内容审核正文优先且权属顺序不变', async()=>{
    const {default:Panel}=await server.ssrLoadModule('/src/components/SupplyRecordPanel.vue')
    const {default:Upload}=await server.ssrLoadModule('/src/components/SupplyUpload.vue')
    const render=component=>renderToString(createSSRApp({render:()=>component}))
    const record=submitted(),snapshot=structuredClone(record)
    for(const contentFirst of [false,true]){
      const html=await render(h(Panel,{record,assets:{},contentFirst}))
      const identifiers=html.match(/<details\b([^>]*)>([\s\S]*?)<\/details>/)
      assert.ok(identifiers,'完整编号应可由用户主动展开')
      assert.doesNotMatch(identifiers[1],/\bopen(?:\s|=|$)/,'完整编号默认折叠')
      assert.ok(identifiers[2].includes('查看完整记录与身份编号'))
      for(const value of [record.id,record.stream_ref,record.created_by,record.owner_party_id])assert.ok(identifiers[2].includes(value))
      // SSR includes closed details in the markup; only its summary is visible.
      const visible=html.replace(/<details\b[^>]*>[\s\S]*?<summary\b[^>]*>([\s\S]*?)<\/summary>[\s\S]*?<\/details>/g,'$1').replace(/<[^>]*>/g,'')
      assert.equal(html.indexOf('当前版本正文')<html.indexOf('作者、权利人和代理'),contentFirst)
      assert.ok(html.indexOf('记录编号')<html.indexOf('当前版本正文'))
      for(const value of [record.id,record.stream_ref,record.created_by,id(2),id(3)]){assert.ok(html.includes(`title="${value}"`));assert.ok(visible.includes(api.shortSupplyId(value)));assert.equal(visible.includes(value),false)}
      assert.ok(visible.includes('权属审核'));assert.ok(visible.includes('内容审核'));assert.ok(visible.includes('下载当前正文'))
    }
    const upload=await render(h(Upload,{label:'私有证明',ids:[id(3)]}));assert.ok(upload.includes(`title="${id(3)}"`));assert.ok(upload.includes(api.shortSupplyId(id(3))))
    assert.deepEqual(record,snapshot)
  })
  for(const {name,run} of tests){await run();console.log(`✓ ${name}`)}
  console.log(`\n${tests.length} supply checks passed.`)
} finally {globalThis.fetch=originalFetch;await server.close()}
