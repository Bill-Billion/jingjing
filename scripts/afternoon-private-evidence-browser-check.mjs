// Isolated browser regression: synthetic fixtures and intercepted HTTP only.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'

const root=resolve('.'),webRoot=resolve('晶晶日上工程交接包/01_源码/frontend_ops_workspace')
const req=createRequire(join(webRoot,'package.json')),{chromium}=req('playwright-core'),{preview}=await import(pathToFileURL(req.resolve('vite')))
const test=await readFile(join(webRoot,'tools/test-finance.mjs'),'utf8')
const start=test.indexOf('const rules='),end=test.indexOf('const balances=');assert(start>=0&&end>start)
const id=n=>String(n).padStart(8,'0')+'-0000-4000-8000-000000000001',hash='a'.repeat(64),time='2026-10-01T00:00:00.000Z'
const records=Function('id','hash','time',test.slice(start,end)+';return records')(id,hash,time)
const out=resolve('.local/afternoon-private-evidence-20261104');await mkdir(out,{recursive:true})
const watched=['src/views/FinanceView.vue','src/composables/useFinance.ts','src/api/errors.ts']
const result={synthetic_only:true,backend:'intercepted fixtures, not a running server',started_at:new Date().toISOString(),steps:[],source_sha256:{},failures:[]}
for(const file of watched)result.source_sha256[file]=createHash('sha256').update(await readFile(join(webRoot,file))).digest('hex')
let web,browser;let mode='available',downloads=0,evidenceCalls=0
const error=(status,code)=>({status,contentType:'application/json',body:JSON.stringify({error:{code,message:'synthetic failure',retryable:false,details:[]}})})
const json=data=>({status:200,contentType:'application/json',body:JSON.stringify({meta:{request_id:'synthetic-browser',actor:{account_id:id(1)},acting_party:null},data})})
try{
 const port=5198,origin=`http://127.0.0.1:${port}`
 web=await preview({root:webRoot,configFile:false,build:{outDir:join(webRoot,'dist')},preview:{host:'127.0.0.1',port,strictPort:true}})
 browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
 const context=await browser.newContext({viewport:{width:1440,height:1100},locale:'zh-CN',acceptDownloads:true})
 await context.addInitScript(()=>{sessionStorage.setItem('ops.session.token','synthetic-token')})
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort())
 await context.route('**/api/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname
  if(route.request().method()!=='GET'){result.failures.push('unexpected write '+path);return route.abort()}
  if(path==='/api/v1/me')return route.fulfill(json({id:id(1),display_name:'合成独立核验',current_status:'ACTIVE',object_version:1,allowed_actions:[]}))
  if(path==='/api/v1/me/parties')return route.fulfill(json({items:[],next_cursor:null}))
  if(path==='/api/v1/privacy/usage')return route.fulfill(json({object_version:1,enabled:false,local_date:'2026-11-04',timezone:'Asia/Shanghai',day_seconds:0,reminder_seconds:0,rest_reminder_minutes:0,rest_due:false,seconds_until_reminder:null,heartbeat_seconds:30,idle_after_seconds:90,as_of:'2026-11-04T09:00:00.000Z',measurement:'FOREGROUND_HEARTBEAT_ESTIMATE',purpose:'PERSONAL_REST_REMINDER'}))
  if(path===`/api/v1/finance/records/${id(13)}`)return route.fulfill(json(records.PAYOUT_EVIDENCE()))
  if(path===`/api/v1/finance/records/${id(10)}`)return route.fulfill(json(records.AGREEMENT()))
  if(path===`/api/v1/finance/records/${id(13)}/evidence/${id(32)}`){
   evidenceCalls++
   if(mode==='restricted')return route.fulfill(error(409,'CONTENT_RESTRICTED'))
   if(mode==='forbidden')return route.fulfill(error(403,'FINANCE_EVIDENCE_FORBIDDEN'))
   return route.fulfill({status:200,contentType:'application/octet-stream',body:'synthetic private evidence'})
  }
  result.failures.push('unexpected read '+path);return route.fulfill(error(404,'NOT_FOUND'))
 })
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>result.failures.push(e.message));page.on('download',()=>downloads++)
 await page.goto(`${origin}/finance/reviews/payout-evidence/${id(13)}`);await page.getByTestId(`finance-proof-${id(32)}`).waitFor()
 const proof=page.getByTestId(`finance-proof-${id(32)}`),submit=page.getByTestId('finance-review-submit')
 await proof.click();await page.getByText('已通过当前权限接口读取私有证明。请实际核对内容后填写结论。').waitFor()
 for(const key of ['parties_verified','contract_verified','amount_verified','evidence_verified'])await page.getByTestId(`finance-check-${key}`).check()
 await page.getByTestId('finance-review-decision').selectOption('APPROVED');await page.getByTestId('finance-review-reason').fill('仅用于隔离验证')
 assert.equal(await submit.isEnabled(),true);result.steps.push('先读取后允许准备独立核验')
 mode='restricted';await proof.click();await page.getByText('材料当前受到限制，暂不能读取。限制解除后可重新读取。').waitFor()
 assert.equal(await submit.isDisabled(),true);assert.equal(await page.getByText('已按当前权限读取',{exact:true}).count(),0);assert.equal(evidenceCalls,2)
 await page.screenshot({path:join(out,'finance-restricted.png'),fullPage:true});result.steps.push('受限后清空已读与旧提示，不自动重试或通过')
 mode='available';await proof.click();await page.getByText('已通过当前权限接口读取私有证明。请实际核对内容后填写结论。').waitFor();assert.equal(await submit.isEnabled(),true);assert.equal(evidenceCalls,3);result.steps.push('解除限制后主动重读恢复')
 mode='forbidden';await proof.click();await page.getByTestId('api-error').waitFor();assert.equal(await page.getByText('材料当前受到限制，暂不能读取。限制解除后可重新读取。').count(),0);assert.equal(await proof.count(),0);assert.equal(evidenceCalls,4);result.steps.push('无权时清空私有记录，不显示他人限制详情')
 assert.equal(downloads,2);assert.deepEqual(result.failures,[]);result.passed=true
}catch(e){result.passed=false;result.error=e.stack;process.exitCode=1;console.error(e.stack)}
finally{await browser?.close();if(web)await new Promise(r=>web.httpServer.close(r));result.finished_at=new Date().toISOString();await writeFile(join(out,'result.json'),JSON.stringify(result,null,2))}
