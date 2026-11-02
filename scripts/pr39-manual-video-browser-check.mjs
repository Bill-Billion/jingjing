// Built Vue customer/operator pages against loopback MySQL. Synthetic payments,
// producer uploads and independent reviews use the existing test fixture only.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {randomBytes,randomUUID} from 'node:crypto'
import {resolve,dirname} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),b=resolve(root,'晶晶日上工程交接包/01_源码/backend_server'),w=resolve(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace')
const require=createRequire(resolve(b,'package.json')),webRequire=createRequire(resolve(w,'package.json'))
require(resolve(b,'scripts/test-network-guard.cjs'))
const mysql=require('mysql2/promise'),{openDatabase}=require(resolve(b,'src/infrastructure/database')),{migrate}=require(resolve(b,'src/infrastructure/database/migrator'))
const {chromium}=webRequire('playwright-core'),{preview}=await import(pathToFileURL(webRequire.resolve('vite')))
const env=JSON.parse(await readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'))
for(const [k,v] of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v)
const out=resolve(root,'.local/pr39-manual-video-browser');await mkdir(out,{recursive:true})
const name='jx_test_manual_ui_'+randomBytes(8).toString('hex'),checks=[],requests=[],errors=[],ids={}
let control,db,server,browser,web,created=false,completed=false,problem
const key=randomUUID
async function check(label,fn){await fn();checks.push({label,result:'PASS'});console.log('PASS '+label)}
try{
 control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE})
 await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');created=true
 db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db)
 const f=await require(resolve(b,'test/support/customization-delivery.cjs')).seed(db),{producer,buyer,reviewer}=f.people
 const template=await f.stories.publishTemplate(producer.ctx,{category_code:'blessing_manual',template_version:1,template_snapshot:require(resolve(b,'src/modules/customization/blessing-template.json')),source_ref:'synthetic:manual-browser',operation_key:key()})
 const model=await f.newOrder({preview:'SCRIPT_BEFORE_INTERIM',unitMinor:10001,title:'合成新版人工短视频规格'})
 const old=await f.newOrder({unitMinor:10001,title:'合成旧版私人定制规格'})
 server=require(resolve(b,'src/http/account-api')).createAccountApi({db,secret:f.secret,supplyStorageFactory:f.storageFactory,tradeEnv:{CUSTOMIZATION_MERCHANT_PARTY_ID:f.org.party_id}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r))
 const base='http://127.0.0.1:'+server.address().port
 web=await preview({root:w,configFile:false,preview:{host:'127.0.0.1',port:5174,strictPort:true,proxy:{'/api':{target:base}}}})
 const origin='http://127.0.0.1:5174'
 browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),headless:true})
 async function actor(person){const context=await browser.newContext({viewport:{width:1280,height:1000},acceptDownloads:true});await context.addInitScript(({token,party})=>{sessionStorage.setItem('ops.session.token',token);sessionStorage.setItem('ops.session.selected',party)},{token:person.token,party:person.acting_party_id});const page=await context.newPage();page.setDefaultTimeout(15000);page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/'))requests.push({method:r.method(),path:new URL(r.url()).pathname})});return page}
 const customer=await actor(buyer),operator=await actor(producer)
 async function goto(page,path){await page.goto(origin+path);await page.waitForLoadState('networkidle')}
 async function post(page,needle,act){const waiting=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith(needle));await act();const res=await waiting,json=await res.json();assert.equal(res.status(),200,JSON.stringify(json));await page.waitForLoadState('networkidle');return json.data}
 async function get(path,person=buyer){const res=await fetch(base+'/api/v1'+path,{headers:{Authorization:'Bearer '+person.token,'X-Acting-Party':person.acting_party_id}});const json=await res.json();assert.equal(res.status,200,JSON.stringify(json));return json.data}
 // Compare the same public DTO before/after; JSON key ordering is not contract data.
 const oldSnapshot=await get('/trade/records/'+old.order.id)
 let story,quote,order,project
 await check('客户填写人工祝福表单，草稿私有，正式提交后运营受理同一故事',async()=>{
  await goto(customer,'/operations/customization/mine/new');await customer.locator('#story-category').selectOption(template.template_version_id)
  await customer.locator('#story-answers-occasion').selectOption('生日祝福');for(const [field,value] of Object.entries({recipient:'合成客户',message:'仅用于隔离联调的祝福',use_scope:'私人观看，不用于商业宣传'}))await customer.locator('#story-answers-'+field).fill(value)
  story=await post(customer,'/customization-requests',()=>customer.getByTestId('story-save').click());ids.story=story.id
  const privateRead=await fetch(base+'/api/v1/operations/customization-requests/'+story.id,{headers:{Authorization:'Bearer '+producer.token}});assert.equal(privateRead.status,404)
  await customer.getByRole('checkbox',{name:'我已核对保存的文字和故事问题，确认作为正式版本发送给平台。'}).check();story=await post(customer,'/submissions',()=>customer.getByTestId('story-submit').click())
  await goto(operator,'/operations/customization/'+story.id);await post(operator,'/intake',()=>operator.getByTestId('customization-intake').click());assert.match(await operator.getByTestId('customization-current-status').innerText(),/受理中/)
  await customer.screenshot({path:resolve(out,'01-manual-story.png'),fullPage:true})
 })
 await check('运营按已审新版规格创建30/40/30报价，客户确认同一故事订单',async()=>{
  await goto(operator,'/trade/quotes/new?customizationRequest='+story.id)
  // Both specification versions remain valid until the backend release switch.
  await operator.getByTestId('trade-quote-spec-0').selectOption(old.spec.id);assert.match(await operator.locator('body').innerText(),/旧版规格.*30\/60\/10/)
  await operator.getByTestId('trade-quote-spec-0').selectOption(model.spec.id)
  for(const [test,value] of Object.entries({'trade-quote-rule':model.quote.data.rule_id,'trade-quote-line-0':'film','trade-quote-quantity-0':'1','trade-quote-expires':'2099-01-01T00:00','trade-quote-window':'30'}))await operator.getByTestId(test).fill(value)
  await operator.getByTestId('trade-quote-channel').selectOption('ALIPAY')
  for(const [n,amount] of ['30.00','40.00','30.01'].entries()){await operator.getByTestId('trade-quote-installment-key-'+n).fill(['first','interim','last'][n]);await operator.getByTestId('trade-quote-allocation-line-'+n+'-0').selectOption('film');await operator.getByTestId('trade-quote-allocation-amount-'+n+'-0').fill(amount)}
  quote=await post(operator,'/trade/quotes',()=>operator.getByTestId('trade-quote-submit').click());ids.quote=quote.id;quote=await f.reviewTrade(quote)
  await goto(customer,'/trade/quotes/'+quote.id);await customer.getByRole('checkbox',{name:'我已核对本报价的服务、分期、期限和条款。'}).check();order=await post(customer,'/acceptance',()=>customer.getByRole('button',{name:'确认报价并建立订单',exact:true}).click());ids.order=order.id
  assert.deepEqual(order.data.quote.installments.map(i=>i.allocations[0].amount_minor),[3000,4000,3001]);assert.equal(order.data.quote.customization.request_id,story.id)
  await customer.screenshot({path:resolve(out,'02-order.png'),fullPage:true})
 })
 const repo=require(resolve(b,'src/modules/production/repository')).createProductionRepository(db,{resolvePrincipal:f.resolvePrincipal})
 async function review(record){return repo.review(reviewer.ctx,{record_id:record.id,expected_version:record.object_version,decision:'APPROVED',reason:'synthetic independent review',verification:record.kind==='PROJECT'?{contract_sha256:record.data.contract_sha256,identity_verified:true,signatures_verified:true,rights_verified:true}:record.data.stage==='SCRIPT'?{script_reviewed:true}:{script_reviewed:true,specification_reviewed:true,audio_reviewed:true,branding_reviewed:true,commercial_watermark_verified:true,ai_label_verified:true},operation_key:key()})}
 const video=[]
 for(const color of ['blue','green']){const file=resolve(out,color+'.mp4');execFileSync(process.env.JX_TEST_FFMPEG||'ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c='+color+':s=320x180:d=1','-c:v','libx264','-pix_fmt','yuv420p','-y',file]);video.push(await readFile(file))}
 async function deliver(stage){const files=[];for(let n=0;n<2;n++){const body=stage==='SCRIPT'?Buffer.from('合成当前脚本 '+key()):video[n],r=await repo.reserveFile(producer.ctx,{party_id:producer.acting_party_id,project_id:project.id,media_type:stage==='SCRIPT'?'text/plain':'video/mp4',body,operation_key:key()});await f.storageFactory().put({key:r.record.data.object_key,body});files.push(await repo.finishFile(producer.ctx,{party_id:producer.acting_party_id,record_id:r.record.id,success:true}))}const p=await get('/production/records/'+project.id,producer);return review(await repo.submitVersion(producer.ctx,{party_id:producer.acting_party_id,record_id:project.id,expected_version:p.object_version,stage,file_id:files[0].id,preview_file_id:files[1].id,note:'synthetic '+stage,operation_key:key()}))}
 async function accept(version){await goto(customer,'/production/versions/'+version.id);await customer.getByTestId('production-read-preview').click();if(version.data.stage==='SCRIPT')await customer.locator('.production-text-preview').waitFor();else await customer.waitForFunction(()=>document.querySelector('video')?.readyState>=2);for(const check of version.data.stage==='SCRIPT'?['script']:['script','specification','audio','branding'])await customer.getByTestId('production-check-'+check).check();await customer.getByTestId('production-feedback-decision').selectOption('ACCEPT');await customer.getByTestId('production-feedback-note').fill('合成客户逐版核对');await post(customer,'/feedback',()=>customer.getByTestId('production-feedback-submit').click())}
 await check('首款后开工；脚本改版使原确认失效，中款前页面禁止样片',async()=>{
  assert.equal((await f.pay(order,'first')).data.amount_minor,3000)
  project=await repo.create(producer.ctx,{party_id:producer.acting_party_id,order_id:order.id,line_id:'film',script_version_id:f.work.id,license_project_id:null,assignee_account_id:producer.account_id,purpose:'PRIVATE',territory:'CN',consent_ids:[],evidence_asset_id:f.proof.id,fulfillment:{uses_identifiable_people:false,cast:[]},operation_key:key()});project=await review(project);ids.project=project.id
  await repo.startCustomization(producer.ctx,{party_id:producer.acting_party_id,record_id:project.id,expected_version:project.object_version,operation_key:key()})
  await assert.rejects(()=>f.pay(order,'interim'),{code:'PAYMENT_MILESTONE_NOT_MET'})
  await accept(await deliver('SCRIPT'));const revised=await deliver('SCRIPT');await assert.rejects(()=>f.pay(order,'interim'),{code:'PAYMENT_MILESTONE_NOT_MET'});await accept(revised)
  await goto(operator,'/production/projects/'+project.id+'/versions');assert.equal(await operator.locator('[data-testid="production-stage"] option[value="SAMPLE"]').evaluate(e=>e.disabled),true);await operator.screenshot({path:resolve(out,'03-middle-unpaid.png'),fullPage:true})
  assert.equal((await f.pay(order,'interim')).data.amount_minor,4000);await operator.reload();await operator.waitForLoadState('networkidle');assert.equal(await operator.locator('[data-testid="production-stage"] option[value="SAMPLE"]').evaluate(e=>e.disabled),false)
 })
 await check('同单客户逐版确认，尾款前不提供正式下载，付清后实际读取私有文件',async()=>{
  for(const stage of ['SAMPLE','ROUGH_CUT'])await accept(await deliver(stage))
  const final=await deliver('FINAL');await accept(final);assert(await customer.getByTestId('production-download-final').isDisabled())
  await goto(customer,'/production/projects/'+project.id+'/fulfillment');assert.match(await customer.locator('body').innerText(),/脚本.*40%/)
  assert.equal((await f.pay(order,'last')).data.amount_minor,3001);await goto(customer,'/production/versions/'+final.id);assert.equal(await customer.getByTestId('production-download-final').isDisabled(),false)
  const download=customer.waitForResponse(r=>r.url().includes('variant=final'));await customer.getByTestId('production-download-final').click();assert.equal((await download).status(),200)
  await customer.screenshot({path:resolve(out,'04-final-paid.png'),fullPage:true});assert.equal((await get('/production/projects/'+project.id+'/fulfillment')).state,'DELIVERED')
 })
 await check('原旧单合同与30/60/10保持，客户无直连视频生成请求',async()=>{
  const original=await get('/trade/records/'+old.order.id);assert.deepEqual(original.data.contract,oldSnapshot.data.contract);assert.deepEqual(original.data.financial,oldSnapshot.data.financial);assert.deepEqual(original.data.quote.installments.map(i=>i.allocations[0].amount_minor),[3000,6000,1001]);assert(!requests.some(r=>r.path==='/api/video'||r.path.includes('/generation')));assert.deepEqual(errors,[])
 })
 completed=true
}catch(e){problem=e.stack;console.error(e.message);process.exitCode=1}
finally{
 if(browser)await browser.close();if(web)await new Promise(r=>web.httpServer.close(r));if(server){server.closeAllConnections();await new Promise(r=>server.close(r))}if(db)await db.close();if(control){if(created)await control.query('DROP DATABASE '+mysql.escapeId(name));await control.end()}
 await writeFile(resolve(out,'results.json'),JSON.stringify({synthetic_only:true,head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),checked_at:new Date().toISOString(),completed,checks,ids,requests,errors,error:problem,cleanup:'database and sessions removed',scope:'Actual customer/operator UI and local HTTP/MySQL; fixture simulates payment receipts, producer files and independent reviews. Not native App or production provider acceptance.'},null,2)+'\n')
 console.log(JSON.stringify({completed,checks:checks.length,evidence:resolve(out,'results.json')}))
}
