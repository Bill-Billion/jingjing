// Current built Vue pages -> real loopback HTTP/MySQL, synthetic accounts only.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createWriteStream} from 'node:fs'
import {spawn,execFileSync} from 'node:child_process'
import {createRequire} from 'node:module'
import {resolve,dirname} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createHash,randomUUID} from 'node:crypto'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),web=resolve(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace')
const require=createRequire(resolve(web,'package.json')), {chromium}=require('playwright-core')
const {preview}=await import(pathToFileURL(require.resolve('vite')))
const out=resolve(root,process.env.JX_BROWSER_EVIDENCE_DIR||'.local/mac-mini-recovery-browser')
await mkdir(out,{recursive:true})
const log=createWriteStream(resolve(out,'fixture.log'))
const child=spawn(process.execPath,[resolve(root,'scripts/pr39-invoice-phone-sandbox.cjs')],{cwd:root,env:process.env,stdio:['pipe','pipe','pipe']})
child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false})
let stdout='',folder,browser,webServer,completed=false,problem=null
const done=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})))
child.stdout.on('data',chunk=>{stdout+=chunk;for(const line of stdout.split('\n')){try{const value=JSON.parse(line);if(value.status==='READY')folder=value.folder}catch{}}})
const results=[],posts=[],lookups=[],pageErrors=[]
const sha=v=>createHash('sha256').update(v).digest('hex')
const delay=ms=>new Promise(r=>setTimeout(r,ms))
async function until(fn,ms=20000){const stop=Date.now()+ms;while(Date.now()<stop){if(await fn())return;await delay(100)}throw Error('LOCAL_CHECK_TIMEOUT')}
async function control(action,values={}){const id=randomUUID();await writeFile(resolve(folder,'command.json'),JSON.stringify({id,action,...values}));let result;await until(async()=>{try{result=JSON.parse(await readFile(resolve(folder,'command-result.json'),'utf8'));return result.id===id}catch{return false}});assert(result.ok,result.error);return result.result}
async function check(name,fn){await fn();results.push({name,result:'PASS'});console.log('PASS '+name)}
async function capture(page,name){await page.screenshot({path:resolve(out,name+'.png'),fullPage:true})}
try{
 await until(()=>!!folder,60000)
 const access=JSON.parse(await readFile(resolve(folder,'access.json'),'utf8'));assert.equal(access.synthetic_only,true)
 const apiOrigin=new URL(access.base_url).origin
 webServer=await preview({root:web,configFile:false,preview:{host:'127.0.0.1',port:5173,strictPort:true,proxy:{'/api':{target:apiOrigin}}}})
 const origin='http://127.0.0.1:5173'
 browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),headless:true})
 async function pageFor(actor,party=actor.party_id){const context=await browser.newContext({viewport:{width:1280,height:900}});await context.addInitScript(({token,party})=>{if(!sessionStorage.getItem('synthetic.initialized')){sessionStorage.setItem('ops.session.token',token);sessionStorage.setItem('ops.session.selected',party);sessionStorage.setItem('synthetic.initialized','1')}},{token:actor.bearer_token,party});const page=await context.newPage();page.on('dialog',d=>d.accept());page.on('pageerror',e=>pageErrors.push(e.message));page.on('request',r=>{if(r.url().includes('/command-results/'))lookups.push(new URL(r.url()).pathname);if(r.method()==='POST'&&r.url().includes('/invoices/'))posts.push({path:new URL(r.url()).pathname,key:r.headers()['idempotency-key'],body_sha256:sha(r.postData()||'')})});return page}
 const page=await pageFor(access.accounts.buyer),target='/invoices/orders/'+access.scenarios.orders.fresh.order_id+'/new'
 let invoiceId
 await check('Committed invoice response loss, refresh and exact-key recovery create only one database row',async()=>{
  await page.goto(origin+target);await page.getByLabel('抬头名称',{exact:true}).fill('本机合成抬头');await page.getByLabel('申请金额（元）',{exact:true}).fill('0.50');await page.getByLabel('申请说明',{exact:true}).fill('仅本机合成开票回复丢失回归');await page.getByRole('checkbox',{name:'我已核对原订单、金额和抬头，确认提交申请。'}).check()
  await control('response-loss',{path:'/api/v1/invoices/requests',enabled:true});await page.getByTestId('invoice-submit').dblclick()
  await page.getByRole('button',{name:'恢复原开票请求',exact:true}).waitFor();assert.equal((await control('inspect')).fresh_invoice_count,1);assert.equal(posts.length,1)
  await page.reload();await page.waitForURL('**/invoices/requests/*');invoiceId=new URL(page.url()).pathname.split('/').at(-1)
  assert.equal(posts.length,1,'read-only recovery must not send POST');assert(lookups[0].endsWith('/'+posts[0].key));await capture(page,'invoice-restored');assert.equal((await control('inspect')).fresh_invoice_count,1)

 })
 await check('Unsent invoice refresh retains original body and key; NOT_RECORDED requires explicit retry',async()=>{
  const retryPage=await pageFor(access.accounts.buyer);await retryPage.goto(origin+target);await retryPage.getByLabel('抬头名称',{exact:true}).fill('合成断网申请');await retryPage.getByLabel('申请金额（元）',{exact:true}).fill('0.10');await retryPage.getByLabel('申请说明',{exact:true}).fill('合成首次请求未抵达服务器');await retryPage.getByRole('checkbox',{name:'我已核对原订单、金额和抬头，确认提交申请。'}).check()
  const initial=posts.length;await retryPage.route('**/api/v1/invoices/requests',route=>route.request().method()==='POST'?route.abort('internetdisconnected'):route.continue(),{times:1});await retryPage.getByTestId('invoice-submit').click();await retryPage.getByRole('button',{name:'恢复原开票请求',exact:true}).waitFor();await retryPage.reload();await retryPage.getByText('本次查询尚未发现原操作记录。',{exact:false}).waitFor();assert.equal(posts.length,initial+1);assert.equal((await control('inspect')).fresh_invoice_count,1)
  await capture(retryPage,'invoice-not-recorded');const reply=retryPage.waitForResponse(r=>r.url().endsWith('/invoices/requests')&&r.request().method()==='POST');await retryPage.getByRole('button',{name:'恢复原开票请求',exact:true}).click();assert.equal((await reply).status(),200);assert.equal(posts.length,initial+2);assert.equal(posts[initial].key,posts[initial+1].key);assert.equal(posts[initial].body_sha256,posts[initial+1].body_sha256);assert.equal((await control('inspect')).fresh_invoice_count,2);await retryPage.close()
 })
 await check('Stored identity from the second list page survives a real page reload',async()=>{
  const identity=await pageFor(access.accounts.buyer,access.scenarios.paginated_party_id);await identity.goto(origin+'/invoices/requests');await until(async()=>await identity.getByTestId('ops-party').inputValue()===access.scenarios.paginated_party_id);await identity.reload();await until(async()=>await identity.getByTestId('ops-party').inputValue()===access.scenarios.paginated_party_id);await capture(identity,'identity-restored');await identity.close()
 })
 async function action(page,value){await page.getByTestId('invoice-action').selectOption(value);await page.getByLabel('本次说明',{exact:true}).fill('本机合成独立办理回归');await page.getByRole('checkbox',{name:'我已核对本次事项及当前记录，确认提交。'}).check();const response=page.waitForResponse(r=>r.url().endsWith('/actions')&&r.request().method()==='POST');await page.getByTestId('invoice-action-submit').click();const reply=await response;assert.equal(reply.status(),200,await reply.text());return (await reply.json()).data}
 await check('Real handling, document entry and independent verification keep their roles',async()=>{
  const handler=await pageFor(access.accounts.handler),verifier=await pageFor(access.accounts.verifier);await handler.goto(origin+'/invoices/operations/handle/'+invoiceId);await action(handler,'APPROVE');await handler.getByTestId('invoice-action').selectOption('RECORD_DOCUMENT');await handler.getByLabel('票据编号／外部依据',{exact:true}).fill('SYNTHETIC-'+invoiceId);await handler.getByLabel('实际开具时间',{exact:true}).fill('2026-10-30T10:00');await handler.getByLabel('本次说明',{exact:true}).fill('本机模拟凭据');await handler.getByRole('checkbox',{name:'我已核对本次事项及当前记录，确认提交。'}).check();const response=handler.waitForResponse(r=>r.url().endsWith('/actions')&&r.request().method()==='POST');await handler.getByTestId('invoice-action-submit').click();assert.equal((await response).status(),200);await until(async()=>await handler.getByTestId('invoice-action').count()===0||!(await handler.getByTestId('invoice-action').innerText()).includes('核准'))
  await verifier.goto(origin+'/invoices/operations/verify/'+invoiceId);const verified=await action(verifier,'VERIFY_DOCUMENT');assert.equal(verified.current_status,'ISSUED');await capture(verifier,'invoice-independently-verified');await handler.close();await verifier.close()
 })
 await check('Expired login returns to the original invoice route',async()=>{
  await control('expire-login');await page.reload();await page.waitForURL(u=>u.pathname==='/login');assert.equal(new URL(page.url()).searchParams.get('redirect'),'/invoices/requests/'+invoiceId);await capture(page,'login-return')
 })
 assert.deepEqual(pageErrors,[]);completed=true
}catch(e){problem=e.stack;console.error(e.message);process.exitCode=1}
finally{
 if(browser)await browser.close();if(webServer)await new Promise(r=>webServer.httpServer.close(r))
 if(folder)await writeFile(resolve(folder,'stop'),'stop\n');else child.kill('SIGTERM')
 let exited;await Promise.race([done.then(v=>{exited=v}),delay(30000)]);if(!exited){child.kill('SIGTERM');problem=(problem||'')+'\nFixture cleanup timed out';process.exitCode=1}else if(exited.code!==0)process.exitCode=1
 const cleanup=folder?JSON.parse(await readFile(resolve(folder,'status.json'),'utf8')):null
 if(cleanup?.status!=='STOPPED'||!cleanup.database_removed||!cleanup.credentials_removed){completed=false;process.exitCode=1}
 const result={synthetic_only:true,source:'Built Vue UI + actual loopback HTTP/MySQL; seed sessions; no real providers',head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),worktree_diff_sha256:sha(execFileSync('git',['diff'],{cwd:root})),index_sha256:sha(await readFile(resolve(web,'dist/index.html'))),checked_at:new Date().toISOString(),completed,results,posts,lookups,pageErrors,error:problem,cleanup}
 await writeFile(resolve(out,'results.json'),JSON.stringify(result,null,2)+'\n');log.end();console.log(JSON.stringify({completed,checks:results.length,evidence:resolve(out,'results.json')}))
}
