#!/usr/bin/env node
/** Normal Flutter UI → isolated real PR20 HTTP/MySQL. Never native/production. */
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
let chromium
for(const packagePath of [resolve(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'),'/Users/yanghaoran/Code/jingjing-pr19-pages/晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json']){
 try{({chromium}=createRequire(packagePath)('playwright-core'));break}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e}
}
assert(chromium,'Existing cached playwright-core is required; no dependency installation')
const state=JSON.parse(await readFile(resolve(root,process.env.PR20_UI_STATE_FILE||'.local/pr20-ui-runtime.json'),'utf8'))
assert.equal(state.testOnly,true);assert.equal(state.syntheticOnly,true)
const base=process.env.PR20_APP_URL||'http://127.0.0.1:8779'
for(const url of [base,state.apiUrl,state.controlUrl])assert.equal(new URL(url).hostname,'127.0.0.1')
const evidence=resolve(root,'docs/ux/pr20-ui/evidence'),shots=resolve(evidence,'screenshots'),resultPath=resolve(evidence,'app-browser-results.json')
await mkdir(shots,{recursive:true})
const buildHash=createHash('sha256').update(await readFile(resolve(root,'.local/pr20-app-web/main.dart.js'))).digest('hex')
const results=[],pageErrors=[],screenshots=[],routes=[],requests=[],verification=[],resumeHistory=[]
let facts={comments:{},responses:[]},resumedPasses=0,terminalError=null,verificationComplete=false,revokedByCheck=false,page
if(process.argv.includes('--resume')){
 const prior=JSON.parse(await readFile(resultPath,'utf8'));assert.equal(prior.build_sha256,buildHash);assert.equal(prior.fixture.pid,state.pid);assert.equal(prior.fixture.schema,state.schema)
 results.push(...prior.results.filter(r=>r.result==='PASS'));screenshots.push(...prior.screenshots);routes.push(...prior.routes);pageErrors.push(...prior.pageErrors);verification.push(...prior.verification);facts=prior.facts||facts;requests.push(...(prior.requests||[]));resumedPasses=results.length;resumeHistory.push(...(prior.resume_history||[]),resumedPasses)
}
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const actors={}
const redact=v=>String(v).replaceAll(state.controlToken,'[REDACTED]').replace(/Bearer\s+\S+/g,'Bearer [REDACTED]')
async function save(){await writeFile(resultPath,JSON.stringify({synthetic_only:true,native_device:'CANCELLED_BY_USER_NOT_VERIFIED',source:'Flutter Web normal UI → isolated real HTTP/MySQL',build_sha256:buildHash,fixture:{pid:state.pid,schema:state.schema,apiUrl:state.apiUrl},gallery_mapping:{"original_commit":"acd5f99","new_App_views":["APP-32-01","APP-32-02"],"screenshot_mapping":{"notifications":"APP-32-01","notification-detail":"APP-32-01 detail subflow","productionproject-comments":"APP-32-02","scriptversion-comments":"APP-32-02 reused for exact production version","commentproject-comments":"APP-32-02","order-comments":"APP-14-01-v2 + APP-32-02 reused object comment flow"}},resumed_passes:resumedPasses,resume_history:resumeHistory,verification_complete:verificationComplete,error:terminalError,results,routes,pageErrors,screenshots,verification:[...new Map(verification.map(v=>[JSON.stringify(v),v])).values()],facts,requests,total:results.length,passed:results.filter(r=>r.result==='PASS').length},null,2)+'\n')}
async function check(label,task){if(results.some(r=>r.label===label&&r.result==='PASS'))return;console.log('→ '+label);const started=Date.now();try{await task();results.push({label,result:'PASS',elapsed_ms:Date.now()-started});console.log('✓ '+label);await save()}catch(e){results.push({label,result:'FAIL',error:redact(e.message).slice(0,1600)});await save();throw e}}
async function control(route,method='POST'){const r=await fetch(state.controlUrl+route,{method,headers:{Authorization:'Bearer '+state.controlToken}});assert(r.ok);return r.json()}
const id=k=>state.records[k].id
const handled=p=>{p.catch(()=>{});return p}
const response=(method,path)=>handled(page.waitForResponse(r=>r.request().method()===method&&new URL(r.url()).pathname==='/api/v1'+path))
const get=path=>response('GET',path),post=path=>response('POST',path)
async function data(r){const j=await r.json();assert(r.ok(),`Actual HTTP ${r.status()} ${j.error?.code||''}`);return j.data}
async function top(){await page.mouse.move(180,350);await page.mouse.wheel(0,-20000);await page.waitForTimeout(250)}
async function text(value){await top();const l=page.getByText(value,{exact:false}).or(page.getByRole('textbox',{name:value,exact:true})).or(page.getByLabel(value,{exact:false})).first();for(let n=0;n<45;n++){if(await l.count()&&await l.isVisible())return;await page.mouse.move(180,520);await page.mouse.wheel(0,250);await page.waitForTimeout(300)}throw Error('Actual Flutter scroll text missing: '+value)}
async function visible(l){for(let n=0;n<45;n++){const b=await l.count()?await l.boundingBox({timeout:300}).catch(()=>null):null;const footer=b&&await l.innerText().catch(()=> '')==='发送';if(b&&b.y+b.height/2>=60&&b.y+b.height/2<=page.viewportSize().height-(footer?20:70))return l;await page.mouse.move(180,520);await page.mouse.wheel(0,b?.y<50?-250:250);await page.waitForTimeout(300)}throw Error('Actual Flutter control did not enter viewport')}
async function press(l){await visible(l);await page.waitForTimeout(300);const b=await l.boundingBox();await page.mouse.click(b.x+b.width/2,b.y+b.height/2);await page.waitForTimeout(200)}
const button=name=>page.getByRole('button',{name,exact:true})
const click=name=>button(name).click()
async function fill(name,value){
 const l=page.getByRole('textbox',{name}).first();
 const merged=await l.evaluate(n=>!!n.parentElement?.querySelector('[role="checkbox"]'));
 let focused=false;
 for(let n=0;n<45;n++){const b=await l.boundingBox();const y=b.y+(merged?b.height-15:b.height/2);if(y>=65&&y<=page.viewportSize().height-(name==='留言说明'?25:80)){await page.mouse.click(b.x+b.width/2,y);focused=true;break}await page.mouse.move(180,520);await page.mouse.wheel(0,y<65?-250:250);await page.waitForTimeout(300)}
 assert(focused,'Actual canvas field must enter viewport');await page.waitForTimeout(250);await page.keyboard.press(process.platform==='darwin'?'Meta+A':'Control+A');await page.keyboard.insertText(value);await page.waitForTimeout(250)
 assert(await page.getByRole('textbox',{name}).evaluateAll((ns,v)=>ns.some(n=>n.value===v),value),'Flutter canvas-established edit should contain exact typed value');await page.keyboard.press('Tab');await page.waitForTimeout(250)
}
async function enable(){const n=page.locator('flt-semantics-placeholder');await n.waitFor({state:'attached'});await n.evaluate(e=>e.click());await button(/^Back/).or(page.getByRole('button')).first().waitFor()}
async function go(route,first=false){await page.goto(base+'/#'+route);if(first)await enable();routes.push(route);await page.waitForTimeout(450)}
async function shot(name,{scrollTop=true}={}){if(scrollTop)await top();await page.waitForTimeout(500);const file='screenshots/pr20-app-'+name+'-mobile.png';await page.screenshot({path:resolve(evidence,file)});screenshots.push({file,viewport:page.viewportSize()})}
async function login(name){
 if(actors[name]){page=actors[name].page;return page}
 const person=state.accounts[name],context=await browser.newContext({viewport:{width:390,height:844},locale:'zh-CN',timezoneId:'Asia/Shanghai'});page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>pageErrors.push(redact(e.message)))
 page.on('request',r=>{const path=new URL(r.url()).pathname;if(r.method()==='POST'&&path.startsWith('/api/v1/operations/'))requests.push({path,key:r.headers()['idempotency-key'],version:r.headers()['if-match']||null,party:r.headers()['x-acting-party'],body:r.postData()})})
 await go('/messages',true);await click('前往账号与身份');await text('手机号登录');await fill(/手机号/,person.phone);await click('获取验证码');await text('验证码已发送');await fill(/验证码/,(await control('/code?phone='+person.phone,'GET')).code);await click('同意用户协议与隐私政策');await click('登录 / 注册');await text('刷新通知')
 if(['payer','member'].includes(name)){await go('/account');await text('选择办事身份');const group=page.getByRole('group',{name:/清风合成项目发起机构/});const choice=group.getByRole('button',{name:/^(正在)?使用此身份$/}).first();await visible(choice);if(await choice.innerText()==='使用此身份')await press(choice);await page.getByRole('button',{name:/^Back/}).first().click();await text('刷新通知')}
 actors[name]={page,context};return page
}
const commentsPath=(domain,rid)=>'/operations/objects/'+domain+'/'+rid+'/comments'
const commentRoute=(domain,rid)=>'/operations/comments?domain='+domain+'&recordId='+rid
async function comments(domain,rid){const received=get(commentsPath(domain,rid));await go(commentRoute(domain,rid));const d=await data(await received);await text('刷新留言');assert.equal(await page.getByRole('tab').count(),0);return d.items}
async function cardPress(body,label){
 // Shared SelectableText body is painted on the canvas but absent from the
 // Flutter semantic text DOM. Exact real GET fixtures determine the visible
 // chronological action row; screenshots prove its rendered original body.
 await top();
 const index=body===state.records.appVisibleComment.body&&label==='回复这条'?0:body===state.records.appWithdrawReadyComment.body&&label==='撤回我的留言'?1:-1;
 assert(index>=0,'Only the known exact original object/action row is selected');
 await press(button(label).nth(index));
}
async function send(domain,rid,body,{replyTo=null,factKey=domain+rid+body}={}){
 if(facts.comments[factKey]){const rows=await comments(domain,rid),found=rows.find(c=>c.id===facts.comments[factKey].id);assert(found);assert.equal(found.body,body);assert.equal(found.reply_to,replyTo);return found}
 await fill('留言说明',body);const r=post(commentsPath(domain,rid));await press(button('发送'));const c=await data(await r);assert.equal(c.body,body);assert.equal(c.reply_to,replyTo);assert.equal(c.record_id,rid);assert.equal(c.domain,domain);assert.equal(c.author_account_id,state.accounts.payer.accountId);facts.comments[factKey]=c;await save();await text('刷新留言');return c
}
async function blockedBack(){const before=new URL(page.url()).hash;await page.getByRole('button',{name:/^Back/}).first().click();assert.equal(new URL(page.url()).hash,before);await text('操作结果尚未确认，请先恢复原请求核对。')}
async function restoredWarnings(){await page.waitForTimeout(600);assert.equal(await page.getByText('操作结果尚未确认，请先恢复原请求核对。',{exact:true}).count(),0);assert.equal(await button('恢复原请求核对').count(),0)}
async function allNotifications(){let received=get('/operations/notifications');await go('/messages');let d=await data(await received),rows=[...d.items];for(let n=0;d.next_cursor!==null;n++){assert(n<40);received=get('/operations/notifications');await press(button('加载更多'));d=await data(await received);rows.push(...d.items)}return rows}
async function run(){
 await login('payer')
 await check('正常短信机构OWNER、header bell真实通知与单条原业务重读，无总数或全读',async()=>{
  await go('/home');assert.equal(await page.getByRole('tab').count(),5);const feed=get('/operations/notifications');await click('通知');const d=await data(await feed);assert.deepEqual(Object.keys(d).sort(),['items','next_cursor']);await text('刷新通知');assert.equal(await page.getByText('全部已读',{exact:true}).count(),0);assert.equal(await page.getByRole('tab').count(),0);await shot('notifications')
  const all=await allNotifications();const notice=all.find(n=>n.record_id===id('appProductionOrder')&&!n.read);assert(notice,'Own App order must have actual unread event');facts.event=notice;await save();const record=get('/trade/records/'+notice.record_id);await go('/operations/notification?eventId='+notice.id);assert.equal((await data(await record)).id,notice.record_id);await text('查看对应业务');await shot('notification-detail');const again=get('/trade/records/'+notice.record_id);await press(button('查看对应业务'));assert.equal((await data(await again)).id,notice.record_id);await text('订单留言')
 })
 await check('标记已读真实commit后503，Back拦截，原key空body恢复且本人已读',async()=>{
  const n=facts.event;assert(n);await go('/operations/notification?eventId='+n.id);await text('标记已读');await control('/response-loss?operation=markRead&mode=503');const start=requests.length;let r=post('/operations/notifications/'+n.id+'/read');await press(button('标记已读'));assert.equal((await r).status(),503);await text('恢复原请求核对');await blockedBack();await shot('mark-read-unknown');r=post('/operations/notifications/'+n.id+'/read');await press(button('恢复原请求核对'));assert.deepEqual(await data(await r),{id:n.id,read:true});await text('已读');await restoredWarnings();const sent=requests.slice(start);assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);assert.deepEqual(JSON.parse(sent[0].body),{});assert.equal(sent[0].version,null);verification.push({check:'markRead commit then503 same key/body/account+party recovery',event_id:n.id,requests:sent});await shot('mark-read-recovered')
 })
 await check('订单留言正常纯文本发送、同对象真实回复、非作者无撤回或运营隐藏',async()=>{
  const rid=id('appProductionOrder'),received=get(commentsPath('TRADE',rid));await go('/trade/record?recordId='+rid);await text('订单留言');await press(button('订单留言'));const rows=(await data(await received)).items;assert(rows.some(c=>c.id===id('appVisibleComment')));await top();assert.equal(await button('隐藏').count(),0);assert.equal(await button('上传附件').count(),0);await shot('order-comments');await send('TRADE',rid,'App真实画布发送的合成订单说明 <script>不执行</script>。',{factKey:'order'});await cardPress(state.records.appVisibleComment.body,'回复这条');await send('TRADE',rid,'App对同一订单原留言的真实合成回复。',{replyTo:id('appVisibleComment'),factKey:'reply'});await shot('order-reply')
 })
 await check('订单留言503原内容保留，Back挡住，原key恢复只产生一条真实留言',async()=>{
  const rid=id('appProductionOrder'),body='App合成留言实际提交成功后一次503，恢复不得重复。';let rows=await comments('TRADE',rid)
  if(facts.comments.unknown){assert.equal(rows.filter(c=>c.body===body).length,1);return}
  await fill('留言说明',body);await control('/response-loss?operation=comment&mode=503');const start=requests.length;let r=post(commentsPath('TRADE',rid));await press(button('发送'));assert.equal((await r).status(),503);await text('恢复原请求核对');assert.equal(await page.getByRole('textbox',{name:'留言说明'}).inputValue(),body);await blockedBack();await shot('comment-unknown');r=post(commentsPath('TRADE',rid));await press(button('恢复原请求核对'));const c=await data(await r);assert.equal(c.body,body);facts.comments.unknown=c;await save();await text('刷新留言');await restoredWarnings();const sent=requests.slice(start);assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);rows=await comments('TRADE',rid);assert.equal(rows.filter(x=>x.body===body).length,1);verification.push({check:'comment commit then503 exact original key/body and one current record',comment_id:c.id,requests:sent});await shot('comment-recovered')
 })
 await check('制作项目/具体版本/成角工作区四来源bridge与实际同对象留言',async()=>{
  for(const [domain,key,route,label,seed,body] of [['PRODUCTION','appProductionProject','/production/project?projectId=','项目留言','appProductionComment','App当前制作项目的合成留言。'],['PRODUCTION','appSCRIPTVersion','/production/version?versionId=','版本留言','appVersionComment','App准确SCRIPT版本的合成说明。'],['PROJECTS','appCommentProject','/projects/project?projectId=','项目留言','appProjectComment','App成角当前项目的合成留言。']]){
   const rid=id(key),r=get(commentsPath(domain,rid));await go(route+rid);await text(label);await press(button(label));const rows=(await data(await r)).items;assert(rows.some(c=>c.id===id(seed)));await send(domain,rid,body,{factKey:key});await shot(key.replace('app','').toLowerCase()+'-comments');await page.getByRole('button',{name:/^Back/}).first().click();await text(label);assert.equal(await page.getByRole('tab').count(),0)
  }
 })
 await check('本人撤回IfMatch与503暂隐藏原文，原key/body/version恢复后body=null',async()=>{
  const rid=id('appProductionOrder'),original=state.records.appWithdrawReadyComment;let rows=await comments('TRADE',rid),current=rows.find(c=>c.id===original.id);assert(current)
  if(current.current_status==='WITHDRAWN'){assert.equal(current.body,null);assert(facts.withdrawn);return}
  await cardPress(original.body,'撤回我的留言');await fill('撤回原因','本人撤回合成测试文字，保留原记录。');await control('/response-loss?operation=commentAction&mode=503');const start=requests.length,path='/operations/comments/'+original.id+'/actions';let r=post(path);await press(button('确认撤回'));assert.equal((await r).status(),503);await text('撤回结果待核实，原正文已暂时隐藏。');assert.equal(await page.getByText(original.body,{exact:false}).count(),0);await blockedBack();await shot('withdraw-unknown');r=post(path);await press(button('恢复原请求核对'));const c=await data(await r);assert.equal(c.current_status,'WITHDRAWN');assert.equal(c.body,null);assert.equal(c.object_version,original.objectVersion+1);facts.withdrawn=c;await save();await text('这条留言已撤回。');await restoredWarnings();const sent=requests.slice(start);assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);assert.equal(sent[0].version,'"'+original.objectVersion+'"');rows=await comments('TRADE',rid);assert.equal(rows.find(c=>c.id===original.id).body,null);verification.push({check:'withdraw actual IfMatch/commit then503 original request recovery and null exposed body',comment_id:c.id,requests:sent});await shot('withdraw-recovered')
 })
 await check('五栏目稳定，旧messages/chat映射真实域，320宽留言与子页无底栏',async()=>{
  await go('/my');for(const name of ['首页','入戏','培育','成角','我的']){await page.getByRole('tab',{name,exact:true}).click();assert.equal(await page.getByRole('tab').count(),5)}await go('/chat');await text('查看制作项目');assert.equal(await page.getByRole('tab').count(),0);await shot('business-comment-entry');await page.setViewportSize({width:320,height:693});await comments('PROJECTS',id('appCommentProject'));await shot('project-comments-320');assert.equal(await button('发送').count(),1);await page.setViewportSize({width:390,height:844})
 })
 await check('普通member403、outsider404与真实失效凭据401清私有页面',async()=>{
  await login('member');await go(commentRoute('TRADE',id('appProductionOrder')));await text('记录不存在或当前身份无权查看，私有内容已清空。');assert.equal(await button('回复这条').count(),0);assert.equal(await button('撤回我的留言').count(),0);if(await page.getByRole('textbox',{name:'留言说明'}).count())assert(await page.getByRole('textbox',{name:'留言说明'}).isDisabled());await shot('member-source-denied');verification.push({check:'Actual selected MEMBER is rejected before source HTTP by inherited TradeApi OWNER gate; no private rows/actions',actor:'member',local_owner_gate:true});
  await login('outsider');const denied=get('/trade/records/'+id('appProductionOrder'));await go(commentRoute('TRADE',id('appProductionOrder')));assert.equal((await denied).status(),404);await text('记录不存在或当前身份无权查看，私有内容已清空。');assert.equal(await button('回复这条').count(),0);assert.equal(await button('撤回我的留言').count(),0);if(await page.getByRole('textbox',{name:'留言说明'}).count()){assert(await page.getByRole('textbox',{name:'留言说明'}).isDisabled());assert.equal(await page.getByRole('textbox',{name:'留言说明'}).inputValue(),'');}await shot('outsider-source-denied');verification.push({check:'Actual typed source permission denial',actor:'outsider',status:404});
  page=actors.payer.page;await comments('TRADE',id('appProductionOrder'));await fill('留言说明','401后必须清除的合成草稿');const path='**/api/v1/operations/objects/TRADE/'+id('appProductionOrder')+'/comments*';await page.route(path,async route=>{await route.continue({headers:{...route.request().headers(),authorization:'Bearer invalid-isolated-test'}})});const r=get(commentsPath('TRADE',id('appProductionOrder')));await press(button('刷新留言'));assert.equal((await r).status(),401);await page.unroute(path);await text('先确认办事身份');assert.equal(await page.getByRole('textbox').count(),0);await shot('authentication-cleared');verification.push({check:'Actual server401 from deliberately invalid isolated credential clears body/draft, no mocked HTTP status',status:401});await actors.payer.context.close();delete actors.payer;await login('payer')
 })
 await check('真实机构membership撤销清正文草稿与原未知依据，恢复权限重读',async()=>{
  page=actors.payer.page;const revokedBody='撤权前已实际提交但结果待核实的合成说明。',prior=await comments('TRADE',id('appProductionOrder'));const committed=prior.filter(c=>c.body===revokedBody);let r,unknownInThisRun=false;
  if(committed.length){assert.equal(committed.length,1);assert.equal(requests.filter(x=>JSON.parse(x.body).body===revokedBody).length,1);assert(facts.prior_unknown_revocation,'Resume keeps the original actual after503/403 screenshot and semantic proof');await fill('留言说明','恢复登录后再次撤权必须清空的未发送合成草稿。');verification.push({check:'GET confirms one original committed unknown comment; resume never reposts it',comment_id:committed[0].id,original_request:requests.find(x=>JSON.parse(x.body).body===revokedBody),prior_unknown_revocation:facts.prior_unknown_revocation})}
  else{await fill('留言说明',revokedBody);await control('/response-loss?operation=comment&mode=503');r=post(commentsPath('TRADE',id('appProductionOrder')));await press(button('发送'));assert.equal((await r).status(),503);await text('恢复原请求核对');unknownInThisRun=true}
  await control('/party-permission?account=payer&enabled=false');revokedByCheck=true;r=get('/trade/records/'+id('appProductionOrder'));await press(button(unknownInThisRun?'恢复原请求核对':'刷新留言'));assert.equal((await r).status(),403);await text(/先确认办事身份|记录不存在或当前身份无权查看，私有内容已清空。/);assert.equal(await button('回复这条').count(),0);assert.equal(await button('撤回我的留言').count(),0);if(await page.getByRole('textbox',{name:'留言说明'}).count()){assert(await page.getByRole('textbox',{name:'留言说明'}).isDisabled());assert.equal(await page.getByRole('textbox',{name:'留言说明'}).inputValue(),'');}assert.equal(await button('恢复原请求核对').count(),0);assert.equal(await page.getByText(state.records.appVisibleComment.body,{exact:false}).count(),0);await shot('permission-revoked');await control('/party-permission?account=payer&enabled=true');revokedByCheck=false;await go('/account');await text('选择办事身份');await press(button('使用此身份').first());const choice=page.getByRole('group',{name:/清风合成项目发起机构/}).getByRole('button',{name:/^(正在)?使用此身份$/}).first();await press(choice);await page.getByRole('button',{name:/^Back/}).first().click();await comments('TRADE',id('appProductionOrder'));assert.equal(await button('恢复原请求核对').count(),0);verification.push({check:'Actual organization membership revoke while original operation unknown clears original private body/pending, restore rereads',status:403});await shot('permission-restored')
 })
}
async function verifyReads(){
 page=actors.payer.page
 for(const [domain,key] of [['TRADE','appProductionOrder'],['PRODUCTION','appProductionProject'],['PRODUCTION','appSCRIPTVersion'],['PROJECTS','appCommentProject']]){const rows=await comments(domain,id(key));for(const c of Object.values(facts.comments).filter(c=>c.domain===domain&&c.record_id===id(key))){const fresh=rows.find(x=>x.id===c.id);assert(fresh);assert.equal(fresh.body,c.body);assert.equal(fresh.reply_to,c.reply_to);verification.push({check:'GET exact UI-created current object comment',domain,record_id:id(key),comment_id:c.id,reply_to:c.reply_to,body:c.body})}}
 assert.equal(requests.filter(r=>/\/audit|\/reports|\/hide/.test(r.path)).length,0)
 const final=await control('/state','GET');assert.equal(final.pid,state.pid);assert.equal(final.controls.nextResponseLoss,null);assert.equal(final.controls.workerEnabled,false);assert.equal(final.controls.storageAvailable,true);assert.equal(final.controls.evidenceIntact,true);assert.equal(final.controls.membershipEnabled,true);verification.push({check:'Isolated refs/control cleanup preserved; no worker/report audit/hide App writes',pid:final.pid,controls:final.controls})
}
try{await run();await verifyReads();assert.equal(pageErrors.length,0,pageErrors.join('\n'));verificationComplete=true;console.log('✓ actual current GET proofs and original fixture controls restored')}catch(e){terminalError=redact(e.message).slice(0,1600);console.error(redact(e.stack));process.exitCode=1;if(page){await page.screenshot({path:resolve(shots,'debug-app.png')}).catch(()=>{});console.error(JSON.stringify(await page.locator('[role],[aria-label]').evaluateAll(ns=>ns.map(n=>({role:n.getAttribute('role'),label:n.getAttribute('aria-label'),text:n.textContent?.slice(0,160)}))).catch(()=>[])))}}finally{if(revokedByCheck)await control('/party-permission?account=payer&enabled=true').catch(()=>{});await control('/response-loss?operation=NONE').catch(()=>{});await save();await browser.close()}
