#!/usr/bin/env node
/** Normal browser UI → isolated real HTTP/MySQL. Business writes never bypass UI. */
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const require=createRequire(resolve(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))
const {chromium}=require('playwright-core')
const state=JSON.parse(await readFile(resolve(root,'.local/pr20-ui-runtime.json'),'utf8'))
assert.equal(state.testOnly,true)
const base=process.env.PR20_WEB_URL||'http://127.0.0.1:5211'
for(const u of [base,state.apiUrl,state.controlUrl])assert.equal(new URL(u).hostname,'127.0.0.1')
const index=await fetch(base+'/');assert(index.ok)
const indexHtml=await index.text(),entryPath=indexHtml.match(/<script[^>]+src="([^"]+)"/)?.[1];assert(entryPath)
const entry=await fetch(new URL(entryPath,base));assert(entry.ok)
const sha=b=>createHash('sha256').update(b).digest('hex')
const build={index_sha256:sha(indexHtml),entry_path:entryPath,entry_sha256:sha(Buffer.from(await entry.arrayBuffer()))}
const evidence=resolve(root,'docs/ux/pr20-ui/evidence'),shots=resolve(evidence,'screenshots'),resultPath=resolve(evidence,'web-browser-results.json')
await mkdir(shots,{recursive:true})
const results=[],screenshots=[],verification=[],pageErrors=[],requests=[],actors={},facts={},resumeHistory=[]
let page,complete=false,error=null,resumed=0
const alteredGrants=new Set();let membershipChanged=false
const previous=process.argv.includes('--resume')?JSON.parse(await readFile(resultPath,'utf8')):null
if(previous){
 assert.equal(previous.fixture.pid,state.pid);assert.equal(previous.fixture.schema,state.schema)
 results.push(...previous.results.filter(r=>r.result==='PASS'));screenshots.push(...previous.screenshots)
 verification.push(...previous.verification);pageErrors.push(...previous.pageErrors);requests.push(...previous.requests)
 Object.assign(facts,previous.facts);resumed=results.length;resumeHistory.push(...(previous.resume_history||[]),resumed)
}
const redact=v=>String(v).replaceAll(state.controlToken,'[REDACTED]').replace(/Bearer\s+\S+/g,'Bearer [REDACTED]')
const expectedGalleries=['WEB-32-01','WEB-32-02-v2','WEB-32-03','WEB-32-04','WEB-33-01','WEB-33-02']
const id=k=>state.records[k].id,party=a=>a.actingPartyId||a.personalPartyId
const scenario=state.scenarios.web
const handled=p=>{p.catch(()=>{});return p}
const commentPath=(domain,rid)=>`/operations/objects/${domain}/${rid}/comments`
const commentRoute=(domain,rid,operator=false)=>`/operations/${operator?'operator/':''}objects/${domain}/${rid}/comments`
const reportRoute=(rid,operator=true)=>`/operations/${operator?'operator/':''}reports/${rid}`
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})

async function save(){
 await writeFile(resultPath,JSON.stringify({synthetic_only:true,native_device:'NOT_VERIFIED',source:'Normal SMS / explicit OWNER or independent no-acting browser UI → isolated HTTP/MySQL',web_build:build,fixture:{pid:state.pid,schema:state.schema,apiUrl:state.apiUrl},resumed_passes:resumed,resume_history:resumeHistory,complete,error,facts,results,verification,requests,pageErrors,screenshots:[...new Map(screenshots.map(s=>[s.file,s])).values()],gallery_coverage:[...new Set(screenshots.map(s=>s.gallery).filter(g=>expectedGalleries.includes(g)))],reused_gallery_coverage:[...new Set(screenshots.map(s=>s.gallery).filter(g=>!expectedGalleries.includes(g)))],total:results.length,passed:results.filter(r=>r.result==='PASS').length},null,2)+'\n')
}
async function check(label,task){
 if(results.some(r=>r.label===label&&r.result==='PASS'))return
 console.log('→ '+label);const start=Date.now()
 try{await task();results.push({label,result:'PASS',build_sha256:build.entry_sha256,elapsed_ms:Date.now()-start});await save();console.log('✓ '+label)}
 catch(e){results.push({label,result:'FAIL',error:redact(e.message).slice(0,1500)});await save();throw e}
}
async function control(route,method='POST'){
 const r=await fetch(state.controlUrl+route,{method,headers:{Authorization:'Bearer '+state.controlToken}});assert(r.ok);return r.json()
}
async function grant(action,enabled){alteredGrants.add(action);return control('/reviewer-permission?action='+action+'&enabled='+enabled)}
function wait(p,method,path){return handled(p.waitForResponse(r=>r.request().method()===method&&new URL(r.url()).pathname==='/api/v1'+path))}
async function data(r){const j=await r.json();assert(r.ok(),`UI HTTP ${r.status()} ${j.error?.code||''}`);return j.data}
async function apiGet(a,path,{operator=false,status=200}={}){
 const r=await fetch(state.apiUrl+'/api/v1'+path,{headers:{Authorization:'Bearer '+a.token,...(operator?{}:{'X-Acting-Party':party(a)})}})
 const j=await r.json();assert.equal(r.status,status,`GET ${path}: ${j.error?.code||''}`);return j.data||j.error
}
async function login(name,{second=false}={}){
 if(actors[name]&&!second){page=actors[name].page;return actors[name]}
 const person=state.accounts[name],context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',timezoneId:'Asia/Shanghai'})
 await context.addInitScript(()=>{window.__pr20Blobs=new Set();const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);URL.createObjectURL=b=>{const u=create(b);window.__pr20Blobs.add(u);return u};URL.revokeObjectURL=u=>{window.__pr20Blobs.delete(u);revoke(u)}})
 const p=await context.newPage();page=p;p.setDefaultTimeout(20000)
 p.on('pageerror',e=>pageErrors.push(redact(e.message)))
 p.on('request',r=>{const path=new URL(r.url()).pathname;if(r.method()==='POST'&&path.startsWith('/api/v1/operations/'))requests.push({path:path.slice('/api/v1'.length),key:r.headers()['idempotency-key'],version:r.headers()['if-match']||null,party:r.headers()['x-acting-party']||null,account_id:person.accountId,body:r.postData()})})
 await p.goto(base+'/login');await p.getByTestId('phone-input').fill(person.phone)
 let response=wait(p,'POST','/auth/sms-challenges');await p.getByTestId('send-code').click();assert.equal((await response).status(),200)
 await p.getByTestId('code-input').fill((await control('/code?phone='+person.phone,'GET')).code)
 await p.getByTestId('submit-login').click();await p.waitForURL(u=>u.pathname==='/workspace')
 await p.locator(`[data-party="${party(person)}"]`).click()
 const token=await p.evaluate(()=>sessionStorage.getItem('ops.session.token'));assert(token)
 const a={...person,page:p,context,token};if(!second)actors[name]=a;return a
}
async function ready(p=page){await p.getByText('正在读取实际记录…',{exact:true}).waitFor({state:'hidden'});await p.getByTestId('ops-refresh').waitFor({state:'visible'});await p.waitForTimeout(120)}
async function go(p,path){page=p;await p.goto(base+path);await p.locator('.workspace-nav').waitFor();if(path.startsWith('/operations/'))await ready(p);else await p.getByRole('heading',{level:1}).waitFor()}
async function shot(p,name,gallery){if(new URL(p.url()).pathname.startsWith('/operations/'))await ready(p);const actual=await p.locator('[data-gallery]').first().getAttribute('data-gallery');if(gallery)assert.equal(actual,gallery);const file='screenshots/pr20-web-'+name+'.png';await p.screenshot({path:resolve(evidence,file),fullPage:true});screenshots.push({file,gallery:gallery||actual,viewport:p.viewportSize()});await save()}
const fill=(p,key,v)=>p.getByTestId(key).fill(String(v))
async function notificationPage(p,cursor,action){
 // Track the request created by this navigation/click, not a late response to an
 // earlier page read. Match pagination explicitly before trusting next_cursor.
 const pending=handled(p.waitForRequest(r=>{
  const u=new URL(r.url());return r.method()==='GET'&&u.pathname==='/api/v1/operations/notifications'
   &&u.searchParams.get('cursor')===(cursor===null?null:String(cursor))
   &&u.searchParams.get('limit')==='30'&&u.searchParams.get('unread_only')==='false'
 }))
 await action();const request=await pending,response=await request.response();assert(response,'Notification request was aborted')
 const d=await data(response);await response.finished()
 // A response alone does not prove Vue applied it. Require the actual rows and
 // pagination control to agree with that page; a missing page still fails.
 try{await p.waitForFunction(({ids,more})=>{
  const refresh=document.querySelector('[data-testid="ops-refresh"]')
  const next=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='继续读取更早事件')
  return refresh&&!refresh.disabled&&!!next===more&&ids.every(id=>document.querySelector('[data-testid="ops-open-event-'+id+'"]'))
 },{ids:d.items.map(x=>x.id),more:d.next_cursor!==null})
 }catch(cause){
  const observed=await p.evaluate(()=>({path:location.pathname,refreshDisabled:document.querySelector('[data-testid="ops-refresh"]')?.disabled,rows:[...document.querySelectorAll('[data-testid^="ops-open-event-"]')].map(n=>n.getAttribute('data-testid')),nextVisible:[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='继续读取更早事件'),alerts:[...document.querySelectorAll('[role="alert"]')].map(n=>n.textContent.trim())})).catch(()=>({unavailable:true}))
  throw new Error('Notification page did not apply its response: '+JSON.stringify({expected:{ids:d.items.map(x=>x.id),next_cursor:d.next_cursor},observed,pageErrors})+'; '+cause.message)
 }
 return d
}
async function allNotifications(a){
 const p=a.page;let d=await notificationPage(p,null,()=>go(p,'/operations/notifications')),rows=[...d.items]
 for(let n=0;d.next_cursor!==null;n++){
  assert(n<40);const cursor=d.next_cursor
  d=await notificationPage(p,cursor,()=>p.getByRole('button',{name:'继续读取更早事件',exact:true}).click())
  assert.notEqual(d.next_cursor,cursor,'Notification cursor must advance');rows.push(...d.items)
 }
 assert.equal(new Set(rows.map(x=>x.id)).size,rows.length);return rows
}
async function comments(a,domain,rid,{operator=false}={}){
 const p=a.page,received=wait(p,'GET',commentPath(domain,rid));await go(p,commentRoute(domain,rid,operator));const d=await data(await received);await ready(p);return d.items
}
async function send(a,domain,rid,body,name,{replyTo=null,operator=false}={}){
 const p=a.page
 if(facts[name]){const rows=await comments(a,domain,rid,{operator});const c=rows.find(x=>x.id===facts[name].id);assert(c);assert.equal(c.body,body);assert.equal(c.reply_to,replyTo);return c}
 await p.getByTestId('ops-reply-to').selectOption(replyTo||'');await fill(p,'ops-comment-body',body)
 const response=wait(p,'POST',commentPath(domain,rid));await p.getByTestId('ops-comment-submit').click();const c=await data(await response)
 assert.equal(c.body,body);assert.equal(c.reply_to,replyTo);assert.equal(c.domain,domain);assert.equal(c.record_id,rid);assert.equal(c.author_account_id,a.accountId);assert.equal(c.party_id,operator?null:party(a))
 facts[name]=c;await save();await ready(p);return c
}
async function select(p,c){await p.getByTestId('ops-select-comment-'+c.id).click();await p.getByTestId('ops-comment-reason').waitFor()}
async function action(a,c,action,name,{unknown=false}={}){
 const p=a.page,operator=action==='HIDE';let rows=await comments(a,c.domain,c.record_id,{operator});let current=rows.find(x=>x.id===c.id);assert(current)
 const desired=action==='HIDE'?'HIDDEN':'WITHDRAWN'
 if(current.current_status===desired){assert.equal(current.body,null);assert(facts[name]);return current}
 if(operator){await go(p,`/operations/moderation/${c.domain}/${c.record_id}/${c.id}`);await ready(p)}else await select(p,current)
 await fill(p,'ops-comment-reason','仅合成测试：保留准确原对象、作者、版本与操作历史。')
 const path='/operations/comments/'+c.id+'/actions',start=requests.length
 if(unknown)await control('/response-loss?operation=commentAction&mode=503')
 let response=wait(p,'POST',path);await p.getByTestId('ops-comment-action').click()
 if(unknown){assert.equal((await response).status(),503);await p.getByTestId('ops-pending').waitFor();await shot(p,name+'-unknown-desktop',operator?'WEB-32-03':'WEB-32-02-v2');await blockedNavigation(p);await p.getByTestId('ops-check-pending').click();await ready(p);response=wait(p,'POST',path);await p.getByTestId('ops-retry-pending').click()}
 const out=await data(await response);assert.equal(out.current_status,desired);assert.equal(out.body,null);assert.equal(out.object_version,current.object_version+1);facts[name]=out;await save();await ready(p)
 if(unknown){const sent=requests.slice(start);assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);assert.equal(sent[0].version,'"'+current.object_version+'"');verification.push({check:'actual comment action503 same original key/body/IfMatch',comment_id:c.id,action,requests:sent})}
 rows=await comments(a,c.domain,c.record_id,{operator});assert.equal(rows.find(x=>x.id===c.id).body,null)
 assert.equal(await p.getByText(current.body,{exact:true}).count(),0);await shot(p,name+'-recovered-desktop',operator?'WEB-32-02-v2':'WEB-32-02-v2');return out
}
async function blockedNavigation(p){const before=new URL(p.url()).pathname;await p.locator('.workspace-nav').getByRole('link',{name:'合同与规则',exact:true}).click();assert.equal(new URL(p.url()).pathname,before);await p.getByText('原请求结果尚未核实，请先核对并恢复原操作后再离开。',{exact:true}).waitFor()}
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v
function reportValid(r){
 assert.equal(r.current_status,'SUCCEEDED');assert(r.result);assert.equal(sha(JSON.stringify(canonical(r.result))),r.content_sha256)
 assert.equal(r.result.row_count,r.result.rows.length);assert.equal(r.result.environment,r.request.environment);assert.equal(r.result.period_start,r.request.period_start);assert.equal(r.result.period_end,r.request.period_end)
 const keys=new Set(r.result.sources.map(s=>s.domain+':'+s.record_id));for(const row of r.result.rows){assert(keys.has(row.domain+':'+row.record_id));assert(row.occurred_at>=r.request.period_start&&row.occurred_at<r.request.period_end)}
}
async function report(a,rid,{operator=true}={}){const p=a.page,response=wait(p,'GET','/operations/reports/'+rid);await go(p,reportRoute(rid,operator));const r=await data(await response);await ready(p);assert.equal(r.id,rid);assert.equal(r.party_id,operator?null:party(a));return r}
async function refresh(a,rid){const response=wait(a.page,'GET','/operations/reports/'+rid);await a.page.getByTestId('ops-report-refresh').click();const r=await data(await response);await ready(a.page);return r}
const reportBody=(kind,environment='SANDBOX')=>({kind,environment,period_start:state.creation.common.report.period_start.slice(0,16)+':00.000Z',period_end:state.creation.common.report.period_end.slice(0,16)+':00.000Z'})
async function fillReport(a,kind,{operator=true,environment='SANDBOX'}={}){const p=a.page;await go(p,reportRoute('new',operator));const body=reportBody(kind,environment);await p.getByTestId('ops-report-kind-'+kind).check();await p.getByTestId('ops-report-environment').selectOption(environment);await fill(p,'ops-report-start',body.period_start.slice(0,16));await fill(p,'ops-report-end',body.period_end.slice(0,16));return body}
async function requestReport(a,kind,name,{operator=true,unknown=false,environment='SANDBOX'}={}){
 if(facts[name])return report(a,facts[name].id,{operator})
 const p=a.page,body=await fillReport(a,kind,{operator,environment});await shot(p,name+'-request-desktop','WEB-33-01')
 const start=requests.length;if(unknown)await control('/response-loss?operation=report&mode=503')
 let response=wait(p,'POST','/operations/reports');await p.getByTestId('ops-report-submit').click()
 if(unknown){assert.equal((await response).status(),503);await p.getByTestId('ops-pending').waitFor();await blockedNavigation(p);await shot(p,name+'-unknown-desktop','WEB-33-01');await p.getByTestId('ops-check-pending').click();await ready(p);assert.equal(await p.getByTestId('ops-retry-pending').isEnabled(),true);response=wait(p,'POST','/operations/reports');await p.getByTestId('ops-retry-pending').click()}
 const r=await data(await response);assert.equal(r.current_status,'PENDING');assert.equal(r.result,null);assert.equal(r.party_id,operator?null:party(a));assert.deepEqual(Object.fromEntries(Object.entries(r.request).filter(([k])=>k!=='metric_version')),body);facts[name]=r;await save()
 await p.waitForURL(u=>u.pathname===reportRoute(r.id,operator));await ready(p)
 if(unknown){const sent=requests.slice(start);assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);verification.push({check:'report503 reuses original key/body and one real returned task',report_id:r.id,requests:sent})}
 assert.equal(await p.getByTestId('ops-download-csv').count(),0);await shot(p,name+'-pending-desktop','WEB-33-02');return r
}
function csvParse(text){
 const rows=[];let row=[],value='',quoted=false,inQuotes=false,start=true
 for(let n=0;n<text.length;n++){const ch=text[n];if(start&&ch==='"'){quoted=inQuotes=true;start=false;continue}start=false;if(inQuotes){if(ch==='"'&&text[n+1]==='"'){value+='"';n++}else if(ch==='"')inQuotes=false;else value+=ch;continue}if(ch===','){row.push({value,quoted});value='';quoted=false;start=true}else if(ch==='\r'&&text[n+1]==='\n'){row.push({value,quoted});rows.push(row);row=[];value='';quoted=false;start=true;n++}else value+=ch}
 assert.equal(inQuotes,false);assert.equal(value,'');assert.equal(row.length,0);return rows
}
const money=n=>(n<0?'-':'')+'¥'+(Math.abs(n)/100).toFixed(2)
async function csv(a,r,{operator=true}={}){
 const p=a.page;reportValid(r);await report(a,r.id,{operator})
 const response=wait(p,'GET','/operations/reports/'+r.id+'/content'),download=handled(p.waitForEvent('download'));await p.getByTestId('ops-download-csv').click()
 const raw=await response;assert.equal(raw.status(),200);assert.equal(raw.headers()['cache-control'],'no-store');assert.equal(raw.headers()['x-content-type-options'],'nosniff');assert(raw.headers()['content-type'].startsWith('text/csv'))
 const downloaded=await download,bytes=await readFile(await downloaded.path());assert(bytes.length>0);assert(bytes.subarray(0,3).equals(Buffer.from([239,187,191])));const text=bytes.toString('utf8');assert(text.includes('\r\n'));assert(!text.replaceAll('\r\n','').includes('\n'))
 const rows=csvParse(text.slice(1)),columns=['domain','record_id','source_id','category','amount_minor','currency','status','occurred_at'],heading=rows.findIndex(row=>row.map(c=>c.value).join(',')===columns.join(','));assert(heading>0)
 for(const k of ['metric_version','environment','period_start','period_end','generated_at','row_count']){const line=rows.find(row=>row[0]?.value===k);assert(line);assert.equal(line[1].value,String(r.result[k]))}
 const csvRows=rows.slice(heading+1);assert.equal(csvRows.length,r.result.row_count)
 for(let n=0;n<csvRows.length;n++)for(let c=0;c<columns.length;c++){const expected=r.result.rows[n][columns[c]]??'';assert.equal(csvRows[n][c].value,String(expected));if(typeof expected==='number')assert.equal(csvRows[n][c].quoted,false)}
 for(const row of rows)for(const cell of row){if(cell.quoted)assert(!/^[\s]*[=+\-@]|^[\t\r\n]/u.test(cell.value),'CSV text must not start executable formula syntax')}
 assert.notEqual(sha(bytes),r.content_sha256);assert.equal(await p.locator('.ops-report-panel tbody tr').count(),r.result.row_count)
 for(let n=0;n<r.result.rows.length;n++){const row=r.result.rows[n];assert.equal((await p.locator('.ops-report-panel tbody tr').nth(n).locator('td').nth(2).innerText()).trim(),row.amount_minor===null?'1 个项目':money(row.amount_minor))}
 verification.push({check:'actual UI CSV bytes: BOM CRLF metadata minor-unit numeric cells safe text current source links; JSON hash differs',report_id:r.id,kind:r.request.kind,byte_size:bytes.length,csv_sha256:sha(bytes),json_sha256:r.content_sha256,row_count:r.result.row_count})
 await shot(p,r.request.kind.toLowerCase()+'-result-csv-desktop','WEB-33-02');return bytes
}
async function privateProof(a){
 const p=a.page,g=id('webAgreement'),asset=scenario.financeEvidenceId,response=wait(p,'GET','/finance/records/'+g);await go(p,'/finance/agreements/'+g);await data(await response);await p.getByTestId('finance-proof-'+asset).waitFor();return {p,g,asset,path:`/finance/records/${g}/evidence/${asset}`}
}

async function run(){
 const payer=await login('payer'),recipient=await login('recipient'),reviewer=await login('independentReviewer')
 await check('正常短信OWNER与个人通知按account+party读取，单条原业务重读与旧通知入口',async()=>{
  const p=payer.page;await go(p,'/workspace');let received=wait(p,'GET','/operations/notifications');await p.getByTestId('workspace-operations-notifications').click();const d=await data(await received);assert.deepEqual(Object.keys(d).sort(),['items','next_cursor']);await ready(p);assert.equal(await p.getByRole('button',{name:'全部已读',exact:true}).count(),0);await shot(p,'notifications-desktop','WEB-32-01')
  const all=await allNotifications(payer),other=await allNotifications(recipient),n=all.find(x=>x.record_id===scenario.tradeOrderId&&!x.read&&other.some(o=>o.id===x.id&&!o.read));assert(n,'Independent Web shared order event is initially unread to both parties');facts.event=n;await save()
  await go(p,'/operations/notifications/'+n.id);await shot(p,'notification-detail-desktop','WEB-32-01');received=wait(p,'GET','/trade/records/'+n.record_id);await p.getByTestId('ops-open-event-'+n.id).click();assert.equal((await data(await received)).id,n.record_id);await p.waitForURL(u=>u.pathname==='/trade/orders/'+n.record_id);await p.getByTestId('trade-operations-comments').waitFor()
 })
 await check('已读commit后503，GET本人原事件核实且另一主体仍未读，不能换页',async()=>{
  const p=payer.page,n=facts.event;assert(n);await go(p,'/operations/notifications/'+n.id);const start=requests.length;await control('/response-loss?operation=markRead&mode=503');const response=wait(p,'POST','/operations/notifications/'+n.id+'/read');await p.getByTestId('ops-read-event-'+n.id).click();assert.equal((await response).status(),503);await p.getByTestId('ops-pending').waitFor();await blockedNavigation(p);await shot(p,'mark-read-unknown-desktop','WEB-32-01');await p.getByTestId('ops-check-pending').click();await p.getByTestId('ops-pending').waitFor({state:'hidden'});await ready(p)
  assert.equal((await allNotifications(payer)).find(x=>x.id===n.id).read,true);assert.equal((await allNotifications(recipient)).find(x=>x.id===n.id).read,false);const sent=requests.slice(start);assert.equal(sent.length,1);assert.equal(sent[0].body,'{}');assert.equal(sent[0].party,party(payer));assert.equal(sent[0].version,null);verification.push({check:'read unknown retains original request and GET exact account+party confirms; other party remains unread',event_id:n.id,requests:sent});facts.read=true;await save();await shot(p,'mark-read-recovered-desktop','WEB-32-01')
 })
 await check('四种真实原对象入口桥接、来源编号与版本准确，正常UI发送纯文本',async()=>{
  for(const [domain,key,route,testid,seed] of [['TRADE','webProductionOrder','/trade/orders/','trade-operations-comments','webVisibleComment'],['PRODUCTION','webProductionProject','/production/projects/','production-project-comments','webProductionComment'],['PRODUCTION','webSCRIPTVersion','/production/versions/','production-version-comments','webVersionComment'],['PROJECTS','webCommentProject','/projects/projects/','project-operations-comments','webProjectComment']]){
   const p=payer.page,rid=id(key);await go(p,route+rid);const response=wait(p,'GET',commentPath(domain,rid));await p.getByTestId(testid).click();const rows=(await data(await response)).items;await ready(p);assert(rows.some(c=>c.id===id(seed)));assert(rows.every(c=>c.domain===domain&&c.record_id===rid));await send(payer,domain,rid,'Web真实纯文本：'+key+' <script>不执行</script>。',key+'Comment');assert.equal(await p.locator('.ops-text script').count(),0);await shot(p,key+'-comments-desktop','WEB-32-02-v2');await p.getByRole('link',{name:'返回原业务对象',exact:true}).click();await p.waitForURL(u=>u.pathname===route+rid)
  }
 })
 await check('同对象回复与4000字界限、非作者不能撤回，纯文本不执行HTML',async()=>{
  const p=payer.page;await comments(payer,'TRADE',scenario.tradeOrderId);assert.equal(await p.getByTestId('ops-comment-body').getAttribute('maxlength'),'4000');await p.getByTestId('ops-select-comment-'+id('webReplyComment')).click();await p.getByTestId('ops-comment-action').waitFor();assert.equal(await p.getByTestId('ops-comment-action').isDisabled(),true);await send(payer,'TRADE',scenario.tradeOrderId,'Web同一订单的真实合成回复 <script>不执行</script>。','reply',{replyTo:id('webVisibleComment')});assert.equal(await p.locator('.ops-text script').count(),0);const p2=recipient.page;const rows=await comments(recipient,'PROJECTS',scenario.projectId);assert(rows.some(c=>c.id===id('webProjectReplyComment')));await shot(p,'same-object-reply-desktop','WEB-32-02-v2')
 })
 await check('留言503原key/body不变恢复仅一条，锁定导航及切换身份',async()=>{
  const p=payer.page,body='Web合成留言真实commit后一次503；必须原key恢复，不重复。';let rows=await comments(payer,'TRADE',scenario.tradeOrderId)
  if(facts.unknownComment){assert.equal(rows.filter(c=>c.body===body).length,1);return}
  await fill(p,'ops-comment-body',body);await control('/response-loss?operation=comment&mode=503');const start=requests.length;let response=wait(p,'POST',commentPath('TRADE',scenario.tradeOrderId));await p.getByTestId('ops-comment-submit').click();assert.equal((await response).status(),503);await p.getByTestId('ops-pending').waitFor();assert.equal(await p.getByTestId('ops-comment-body').inputValue(),body);assert.equal(await p.getByTestId('ops-party').isDisabled(),true);await blockedNavigation(p);await shot(p,'comment-unknown-desktop','WEB-32-02-v2');await p.getByTestId('ops-check-pending').click();await ready(p);response=wait(p,'POST',commentPath('TRADE',scenario.tradeOrderId));await p.getByTestId('ops-retry-pending').click();const c=await data(await response);facts.unknownComment=c;await save();await ready(p);const sent=requests.slice(start);assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);rows=await comments(payer,'TRADE',scenario.tradeOrderId);assert.equal(rows.filter(c=>c.body===body).length,1);verification.push({check:'comment503 original key/body and one real current comment',comment_id:c.id,requests:sent});await shot(p,'comment-recovered-desktop','WEB-32-02-v2')
 })
 await check('本人撤回503原IfMatch恢复，接口及界面body=null不保留旧正文',async()=>{await action(payer,{...state.records.webWithdrawReadyComment,domain:'TRADE',record_id:scenario.tradeOrderId},'WITHDRAW','withdrawn',{unknown:true})})
 await check('独立无acting隐藏503原key/body/version恢复，不能隐藏自身留言',async()=>{
  await action(reviewer,{...state.records.webHideReadyComment,domain:'TRADE',record_id:scenario.tradeOrderId},'HIDE','hidden',{unknown:true});const p=reviewer.page;await comments(reviewer,'TRADE',scenario.tradeOrderId,{operator:true});const self=await send(reviewer,'TRADE',scenario.tradeOrderId,'Web独立账号自己的合成留言，禁止自己隐藏。','operatorComment',{operator:true});await go(p,`/operations/moderation/TRADE/${scenario.tradeOrderId}/${self.id}`);await ready(p);await p.getByText('不能独立隐藏本人创建的留言。',{exact:true}).waitFor();assert.equal(await p.getByTestId('ops-comment-action').isDisabled(),true);assert.equal(requests.filter(r=>r.path==='/operations/comments/'+id('webHideReadyComment')+'/actions').every(r=>r.party===null),true);await shot(p,'moderation-self-denied-desktop','WEB-32-03')
 })
 await check('两位正常独立会话实际留言412，清旧选择和理由后要求重读确认',async()=>{
  const p=reviewer.page,c=facts.webProductionOrderComment;await go(p,`/operations/moderation/TRADE/${scenario.tradeOrderId}/${c.id}`);await ready(p);await fill(p,'ops-comment-reason','旧会话合成理由，竞争后必须清除。');const second=await login('independentReviewer',{second:true});await action(second,c,'HIDE','raceHidden');page=p;const response=wait(p,'POST','/operations/comments/'+c.id+'/actions');await p.getByTestId('ops-comment-action').click();assert.equal((await response).status(),412);await p.getByTestId('ops-reconfirm').waitFor();assert.equal(await p.getByTestId('ops-comment-reason').count(),0);assert.equal(await p.getByTestId('ops-comment-action').count(),0);assert.equal(await p.getByTestId('ops-pending').count(),0);await shot(p,'version-conflict-desktop','WEB-32-03');verification.push({check:'real412 clears selected original comment and reason',comment_id:c.id});await second.context.close()
 })
 await check('运营审计只读来源过滤、四类原业务历史和独立权限撤销实拒绝',async()=>{
  const p=reviewer.page,response=wait(p,'GET','/operations/audit');await go(p,'/operations/audit');const all=await data(await response);assert(all.items.length);await fill(p,'ops-audit-object-id',id('webHideReadyComment'));let received=wait(p,'GET','/operations/audit');await p.getByTestId('ops-audit-refresh').click();const filtered=await data(await received);assert(filtered.items.length);assert(filtered.items.every(r=>r.object_id===id('webHideReadyComment')));assert(filtered.items.some(r=>r.event_code==='COMMENT_HIDE'));await ready(p);assert.equal(await p.getByRole('button',{name:/授予|grant/i}).count(),0);await shot(p,'audit-filtered-desktop','WEB-32-04')
  for(const [domain,rid] of [['TRADE',scenario.tradeOrderId],['PRODUCTION',scenario.productionProjectId],['PRODUCTION',scenario.productionVersionId],['PROJECTS',scenario.projectId]]){received=wait(p,'GET',`/operations/objects/${domain}/${rid}/audit`);await go(p,`/operations/audit/${domain}/${rid}`);const d=await data(await received);assert(d.items.length);assert(d.items.every(r=>r.record_id===rid))}
  await grant('OPERATIONS_AUDIT',false);received=wait(p,'GET','/operations/audit');await p.getByTestId('ops-refresh').click();assert.equal((await received).status(),403);await ready(p);assert.equal(await p.locator('tbody tr').count(),0);await shot(p,'audit-revoked-desktop','WEB-32-04');await grant('OPERATIONS_AUDIT',true)
 })
 await check('报表无默认环境期间，明确UTC366天界限与三个类别',async()=>{
  const p=reviewer.page;await go(p,reportRoute('new'));assert.equal(await p.getByTestId('ops-report-environment').inputValue(),'');assert.equal(await p.getByTestId('ops-report-start').inputValue(),'');assert.equal(await p.getByTestId('ops-report-submit').isDisabled(),true);for(const kind of ['CASH','SETTLEMENT','WORKLOAD'])await p.getByTestId('ops-report-kind-'+kind).check();await p.getByTestId('ops-report-environment').selectOption('SANDBOX');await fill(p,'ops-report-start','2026-01-01T00:00');await fill(p,'ops-report-end','2027-02-01T00:00');assert.equal(await p.getByTestId('ops-report-submit').isDisabled(),true);await shot(p,'report-period-validation-desktop','WEB-33-01')
 })
 await check('三个Web报表真实入队worker关闭保持PENDING，无CSV或假成功',async()=>{
  const controlState=await control('/state','GET');assert.equal(controlState.controls.workerEnabled,false)
  for(const kind of ['CASH','SETTLEMENT','WORKLOAD']){const r=await requestReport(reviewer,kind,'queued'+kind);assert.equal(r.current_status,'PENDING');const current=await refresh(reviewer,r.id);assert.equal(current.current_status,'PENDING');assert.equal(current.result,null)}
 })
 await check('OWNER本方结算报表原主体申请，未知503保留原key参数取回同任务',async()=>{
  const r=await requestReport(payer,'SETTLEMENT','ownerSettlement',{operator:false,unknown:true});assert.equal(r.party_id,party(payer));const sent=requests.filter(x=>x.path==='/operations/reports'&&JSON.parse(x.body).kind==='SETTLEMENT'&&x.account_id===payer.accountId);assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1])
 })
 await check('原后台worker真实生成三类结果，JSON指纹与业务来源逐行核对',async()=>{
  await control('/worker?enabled=true')
  for(const [name,actor,operator] of [...['CASH','SETTLEMENT','WORKLOAD'].map(k=>['queued'+k,reviewer,true]),['ownerSettlement',payer,false]]){
   let r=await report(actor,facts[name].id,{operator});for(let n=0;r.current_status!=='SUCCEEDED';n++){assert(n<60);await actor.page.waitForTimeout(250);r=await refresh(actor,r.id)}reportValid(r);facts[name]=r;await save();if(name==='queuedCASH'){assert.equal(r.result.totals.RECEIPT,20000);assert.equal(r.result.totals.REFUND,100)}if(name==='queuedSETTLEMENT')assert.equal(r.result.totals.PAYOUT,-2000);if(name==='queuedWORKLOAD'){assert.equal(r.result.row_count,2);assert.equal(r.result.totals.ACCEPTED,2)}if(name==='ownerSettlement')assert(r.result.rows.every(row=>row.party_id===party(payer)))
  }
  await control('/worker?enabled=false');verification.push({check:'original leased worker generated four UI-requested reports',reports:['queuedCASH','queuedSETTLEMENT','queuedWORKLOAD','ownerSettlement'].map(k=>facts[k].id)})
 })
 await check('真实CSV三类别BOM/CRLF/元数据/数值分、页面元和JSON不同指纹，完成不可变',async()=>{
  for(const kind of ['CASH','SETTLEMENT','WORKLOAD']){const r=facts['queued'+kind],bytes=await csv(reviewer,r);assert(bytes.length);assert.equal(await reviewer.page.getByTestId('ops-report-retry').count(),0);const refreshed=await refresh(reviewer,r.id);assert.equal(refreshed.content_sha256,r.content_sha256);assert.deepEqual(refreshed.result,r.result)}
  await csv(payer,facts.ownerSettlement,{operator:false});assert(facts.ownerSettlement.result.rows.every(r=>r.party_id===party(payer)))
 })
 await check('真实BLOCKED具体错误与同任务retry503原key恢复，再由worker生成',async()=>{
  const p=reviewer.page;let r=await report(reviewer,scenario.blockedReportId);if(r.current_status==='SUCCEEDED'){assert(facts.retriedReport);return}assert.equal(r.current_status,'BLOCKED');assert.equal(r.error_code,'OPERATIONS_FORBIDDEN');assert.equal(r.result,null);await p.getByText(/实际阻塞原因：OPERATIONS_FORBIDDEN/).waitFor();await shot(p,'report-blocked-desktop','WEB-33-02');await fill(p,'ops-report-retry-reason','已恢复合成授权，沿用原任务原期间，不重建报表。');await control('/response-loss?operation=reportRetry&mode=503');const start=requests.length,path='/operations/reports/'+r.id+'/retries';let response=wait(p,'POST',path);await p.getByTestId('ops-report-retry').click();assert.equal((await response).status(),503);await p.getByTestId('ops-pending').waitFor();await p.getByTestId('ops-check-pending').click();await ready(p);response=wait(p,'POST',path);await p.getByTestId('ops-retry-pending').click();const retried=await data(await response);assert.equal(retried.id,r.id);assert.equal(retried.current_status,'RETRY');assert.deepEqual(retried.request,r.request);await ready(p);const sent=requests.slice(start);assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);await shot(p,'report-retry-recovered-desktop','WEB-33-02');await control('/worker-run');r=await refresh(reviewer,r.id);reportValid(r);facts.retriedReport=r;await save();verification.push({check:'actual BLOCKED/OPERATIONS_FORBIDDEN original report retry exact key/body, original worker succeeds',report_id:r.id,requests:sent})
 })
 await check('明确PRODUCTION环境不混入沙盒流水，零行真实报表仍可下载',async()=>{
  let r=await requestReport(reviewer,'CASH','productionEmpty',{environment:'PRODUCTION'});if(r.current_status!=='SUCCEEDED'){await control('/worker-run');r=await refresh(reviewer,r.id)}reportValid(r);assert.equal(r.result.row_count,0);assert.deepEqual(r.result.totals,{});facts.productionEmpty=r;await save();await csv(reviewer,r)
 })
 await check('失去一个PRODUCTION来源权限拒整份WORKLOAD CSV及JSON、回收Blob，CASH仍可读',async()=>{
  const r=facts.queuedWORKLOAD,p=reviewer.page;await csv(reviewer,r);assert.equal(await p.evaluate(()=>window.__pr20Blobs.size),1);await grant('PRODUCTION_REVIEW',false);let response=wait(p,'GET','/operations/reports/'+r.id+'/content');await p.getByTestId('ops-download-csv').click();assert.equal((await response).status(),403);await ready(p);assert.equal(await p.locator('.ops-report-panel').count(),0);assert.equal(await p.evaluate(()=>window.__pr20Blobs.size),0);await shot(p,'workload-csv-source-revoked-desktop','WEB-33-02');response=wait(p,'GET','/operations/reports/'+r.id);await go(p,reportRoute(r.id));assert.equal((await response).status(),403);assert.equal(await p.locator('.ops-report-panel').count(),0);await shot(p,'workload-json-source-revoked-desktop','WEB-33-02');const cash=await report(reviewer,facts.queuedCASH.id);reportValid(cash);await csv(reviewer,cash);await grant('PRODUCTION_REVIEW',true);await report(reviewer,r.id);verification.push({check:'one current PRODUCTION source grant revoked denies complete WORKLOAD JSON/CSV while CASH still readable',statuses:[403,403],report_id:r.id})
 })
 await check('OPERATIONS_REPORT与COMMENT_MODERATE失权实拒绝，外部404/MEMBER403不泄露私有记录',async()=>{
  const p=reviewer.page;await report(reviewer,facts.queuedCASH.id);await grant('OPERATIONS_REPORT',false);let response=wait(p,'GET','/operations/reports/'+facts.queuedCASH.id);await p.getByTestId('ops-report-refresh').click();assert.equal((await response).status(),403);await ready(p);assert.equal(await p.locator('.ops-report-panel').count(),0);await shot(p,'report-grant-revoked-desktop','WEB-33-02');await grant('OPERATIONS_REPORT',true)
  const c=facts.webProductionProjectComment;await go(p,`/operations/moderation/PRODUCTION/${scenario.productionProjectId}/${c.id}`);await fill(p,'ops-comment-reason','只有真正运营授权才可独立隐藏。');await grant('COMMENT_MODERATE',false);response=wait(p,'POST','/operations/comments/'+c.id+'/actions');await p.getByTestId('ops-comment-action').click();assert.equal((await response).status(),403);await ready(p);assert.equal(await p.locator('.ops-comment').count(),0);assert.equal(await p.getByTestId('ops-pending').count(),0);await shot(p,'moderation-grant-revoked-desktop','WEB-32-03');await grant('COMMENT_MODERATE',true)
  for(const name of ['outsider','member']){const a=await login(name),received=wait(a.page,'GET','/trade/records/'+scenario.tradeOrderId);await go(a.page,commentRoute('TRADE',scenario.tradeOrderId));assert.equal((await received).status(),name==='outsider'?404:403);assert.equal(await a.page.locator('.ops-comment').count(),0);assert.equal(await a.page.getByTestId('ops-comment-body').count(),0);await shot(a.page,name+'-denied-desktop','WEB-32-02-v2')}
  const other=await apiGet(payer,'/operations/reports/'+facts.queuedCASH.id,{status:404});assert.equal(other.code,'REPORT_NOT_FOUND')
 })
 await check('真实membership撤权及退出清正文草稿、下载Blob和身份，恢复正常读取',async()=>{
  const p=payer.page;await comments(payer,'TRADE',scenario.tradeOrderId);await fill(p,'ops-comment-body','撤权后必须清空的未发送合成草稿。');await control('/party-permission?account=payer&enabled=false');membershipChanged=true;const response=wait(p,'GET','/trade/records/'+scenario.tradeOrderId);await p.getByTestId('ops-refresh').click();assert.equal((await response).status(),403);await ready(p);assert.equal(await p.locator('.ops-comment').count(),0);assert.equal(await p.getByTestId('ops-comment-body').count(),0);await shot(p,'membership-revoked-desktop','WEB-32-02-v2');await control('/party-permission?account=payer&enabled=true');membershipChanged=false;await comments(payer,'TRADE',scenario.tradeOrderId);assert.equal(await p.getByTestId('ops-comment-body').inputValue(),'');await shot(p,'membership-restored-desktop','WEB-32-02-v2');await csv(payer,facts.ownerSettlement,{operator:false});assert.equal(await p.evaluate(()=>window.__pr20Blobs.size),1);await p.getByRole('button',{name:'退出',exact:true}).click();await p.waitForURL(u=>u.pathname==='/login');assert.equal(await p.evaluate(()=>window.__pr20Blobs.size),0);assert.equal(await p.evaluate(()=>sessionStorage.getItem('ops.session.token')),null);await payer.context.close();delete actors.payer;await login('payer')
 })
 await check('真实私有来源材料损坏或storage不可用拒绝，恢复下载按原大小hash核对',async()=>{
  const {p,g,asset,path}=await privateProof(recipient)
  for(const kind of ['evidence','storage']){await control('/'+kind+'?enabled=false');const response=wait(p,'GET',path);await p.getByTestId('finance-proof-'+asset).click();assert.equal((await response).status(),503);await control('/'+kind+'?enabled=true')}
  const response=wait(p,'GET',path),download=handled(p.waitForEvent('download'));await p.getByTestId('finance-proof-'+asset).click();const raw=await response;assert.equal(raw.status(),200);assert.equal(raw.headers()['cache-control'],'no-store');assert.equal(raw.headers()['x-content-type-options'],'nosniff');const bytes=await readFile(await (await download).path()),known=Object.values(state.assets).find(a=>a.id===asset);assert.equal(bytes.length,known.byteSize);assert.equal(sha(bytes),known.contentSha256);verification.push({check:'actual private source proof rejects corruption/storage fault then exact restored download',record_id:g,asset_id:asset,byte_size:bytes.length,sha256:sha(bytes)});await shot(p,'source-proof-recovered-desktop')
 })
 await check('完整40主菜单每入口新版有效无404、高亮稳定及390宽通知留言报告',async()=>{
  const a=actors.payer,p=a.page;await go(p,'/operations/notifications');const links=await p.locator('.workspace-nav a').evaluateAll(ns=>ns.map(n=>({href:n.getAttribute('href'),text:n.textContent.trim()})));assert.equal(links.length,40)
  for(const link of links){await go(p,link.href);assert.equal(new URL(p.url()).pathname,link.href);assert.equal(await p.locator('.workspace-nav a').count(),40);assert.deepEqual(await p.locator('.workspace-nav a').evaluateAll(ns=>ns.map(n=>({href:n.getAttribute('href'),text:n.textContent.trim()}))),links);assert.equal(await p.locator('.workspace-nav a[aria-current=page]').filter({hasText:link.text}).count(),1);assert.equal(await p.getByText('页面未找到',{exact:true}).count(),0);assert.equal(await p.locator('.legacy-shell').count(),0)}
  await p.setViewportSize({width:390,height:844});for(const [route,name,gallery] of [['/operations/notifications','notifications-390','WEB-32-01'],[commentRoute('PROJECTS',scenario.projectId),'comments-390','WEB-32-02-v2'],[reportRoute(facts.ownerSettlement.id,false),'report-390','WEB-33-02']]){await go(p,route);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await shot(p,name+'-narrow',gallery)}await p.setViewportSize({width:1440,height:1000})
  verification.push({check:'all40 current shared navigation URLs/titles/highlight valid, no old shell; actual390 pages fit viewport',menu_count:links.length,menu:links})
 })
}

try{
 await run();assert.equal(pageErrors.length,0,pageErrors.join('\n'))
 for(const g of expectedGalleries)assert(screenshots.some(s=>s.gallery===g),'Missing actual gallery '+g)
 for(const s of screenshots)await stat(resolve(evidence,s.file))
 complete=true;console.log('✓ All real UI checks, six Web gallery pages and zero pageerrors')
}catch(e){error=redact(e.message).slice(0,1600);console.error(redact(e.stack));process.exitCode=1;if(page){await page.screenshot({path:resolve(shots,'debug-web.png'),fullPage:true}).catch(()=>{});await writeFile(resolve(root,'.local/pr20-web-debug.html'),redact(await page.content().catch(()=>'')))}}
finally{
 for(const action of alteredGrants)await control('/reviewer-permission?action='+action+'&enabled=true').catch(()=>{})
 if(membershipChanged)await control('/party-permission?account=payer&enabled=true').catch(()=>{})
 for(const route of ['/storage?enabled=true','/evidence?enabled=true','/worker?enabled=false','/response-loss?operation=NONE'])await control(route).catch(()=>{})
 await save();await browser.close()
}
