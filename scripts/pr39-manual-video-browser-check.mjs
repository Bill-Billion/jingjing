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
const recoveryMode=process.env.JX_PM01_RECOVERY_TEST==='1';
const copyrightMode=process.env.JX_PR39_COPYRIGHT_MODE||null;assert(copyrightMode===null||['BUYER_OWNERSHIP','PRODUCER_OWNERSHIP_LICENSE'].includes(copyrightMode));
const couponMode=process.env.JX_PR39_COUPON_TEST==='1',unitMinor=couponMode?50000:10001,originalParts=couponMode?[15000,20000,15000]:[3000,4000,3001],netParts=couponMode?[13500,18000,13500]:originalParts;
const out=resolve(root,recoveryMode?'.local/pm01-w12-recovery-browser':copyrightMode?'.local/pr39-copyright-'+copyrightMode:couponMode?'.local/pr39-coupon-browser':'.local/pr39-manual-video-browser');await mkdir(out,{recursive:true})
const name='jx_test_manual_ui_'+randomBytes(8).toString('hex'),checks=[],requests=[],errors=[],transport=[],ids={}
let control,db,server,browser,web,created=false,completed=false,problem
const key=randomUUID
async function check(label,fn){await fn();checks.push({label,result:'PASS'});console.log('PASS '+label)}
try{
 control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE})
 await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');created=true
 db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db)
 const f=await require(resolve(b,'test/support/customization-delivery.cjs')).seed(db),{producer,buyer,reviewer}=f.people;ids.actors={buyer:buyer.account_id,producer:producer.account_id,independent_reviewer:reviewer.account_id}
 const template=await f.stories.publishTemplate(producer.ctx,{category_code:'blessing_manual',template_version:1,template_snapshot:require(resolve(b,'src/modules/customization/blessing-template.json')),source_ref:'synthetic:manual-browser',operation_key:key()})
 const model=await f.newOrder({preview:'SCRIPT_BEFORE_INTERIM',calendar:require(resolve(b,'test/support/working-calendar.cjs'))(),unitMinor,copyrightTerms:copyrightMode?require(resolve(b,'test/support/copyright-terms.cjs'))(copyrightMode):null,title:'合成新版人工短视频规格'})
 const old=await f.newOrder({unitMinor:10001,title:'合成旧版私人定制规格'})
 const sim=recoveryMode?await require(resolve(b,'src/testing/payment-simulator')).createPaymentSimulator(db,{...env,MYSQL_DATABASE:name,JX_PAYMENT_SIMULATOR_ENABLED:'true'},{merchant_party_id:f.org.party_id,resolvePrincipal:f.resolvePrincipal}):null
 server=require(resolve(b,'src/http/account-api')).createAccountApi({db,secret:f.secret,supplyStorageFactory:f.storageFactory,...(sim?{tradeProvidersFactory:()=>sim}:{}),tradeEnv:{CUSTOMIZATION_MERCHANT_PARTY_ID:f.org.party_id,...(copyrightMode?{COPYRIGHT_CONTRACT_POLICY:'CONTRACT_20261029'}:{})}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r))
 const base='http://127.0.0.1:'+server.address().port
 const webPort=recoveryMode?5328:5174
 web=await preview({root:w,configFile:false,preview:{host:'127.0.0.1',port:webPort,strictPort:true,proxy:{'/api':{target:base}}}})
 const origin='http://127.0.0.1:'+webPort
 browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),headless:true})
 async function actor(person){const context=await browser.newContext({viewport:{width:1280,height:1000},acceptDownloads:true});await context.addInitScript(({token,party})=>{sessionStorage.setItem('ops.session.token',token);sessionStorage.setItem('ops.session.selected',party)},{token:person.token,party:person.acting_party_id});const page=await context.newPage();page.setDefaultTimeout(15000);page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>transport.push({path:new URL(r.url()).pathname,error:r.failure()?.errorText}));page.on('request',r=>{if(r.url().includes('/api/'))requests.push({method:r.method(),path:new URL(r.url()).pathname})});return page}
 const customer=await actor(buyer),operator=await actor(producer),independent=await actor(reviewer)
 async function goto(page,path){await page.goto(origin+path);await page.waitForLoadState('networkidle')}
 async function post(page,needle,act){const waiting=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith(needle));await act();let res;try{res=await waiting}catch(e){await writeFile(resolve(out,'failure-page.txt'),await page.locator('body').innerText());await page.screenshot({path:resolve(out,'failure-page.png'),fullPage:true});throw e}const json=await res.json();assert.equal(res.status(),200,JSON.stringify(json));await page.waitForLoadState('networkidle');return json.data}
 async function get(path,person=buyer){const res=await fetch(base+'/api/v1'+path,{headers:{Authorization:'Bearer '+person.token,'X-Acting-Party':person.acting_party_id}});const json=await res.json();assert.equal(res.status,200,JSON.stringify(json));return json.data}
 async function request(path,who,body,version,party=true){const res=await fetch(base+'/api/v1'+path,{method:body==null?'GET':'POST',headers:{Authorization:'Bearer '+who.token,...party?{'X-Acting-Party':who.acting_party_id}:{},...body!=null?{'Content-Type':'application/json','Idempotency-Key':key()}:{},...version?{'If-Match':'"'+version+'"'}:{}},...body!=null?{body:JSON.stringify(body)}:{}}),json=await res.json();assert.equal(res.status,200,JSON.stringify(json));return json.data}
 if(recoveryMode&&!couponMode)await f.actorCast(buyer);
 if(couponMode){await f.actorCast(buyer);for(const u of [producer,reviewer])for(const action of ['REDEMPTION_REVIEW','WALLET_RULE_REVIEW'])await f.grant(u,action);const W=require(resolve(b,'src/modules/wallet/repository')).createWalletRepository(db,{resolvePrincipal:f.resolvePrincipal});let wr=await W.createRule(producer.ctx,{rule:{...require(resolve(b,'test/helpers/wallet-rule.cjs')),free_awards:{REGISTER:100000,DAILY_CHECKIN:null,REVIEW:null,SHARE:null}},operation_key:key()});wr=await W.reviewRule(reviewer.ctx,{record_id:wr.id,expected_version:wr.object_version,decision:'APPROVE',reason:'synthetic',operation_key:key()});await W.open(buyer.ctx,{party_id:buyer.personal_party_id,rule_id:wr.id,rule_sha256:wr.content_sha256,operation_key:key()})}
 async function grantFor(spec){const template={version:'synthetic-pr39-credit',source_ref:'synthetic-only',title:'合成制作券50元',kind:'PRODUCTION_CREDIT',valid_days:30,exchange_points:6000,capacity:10,available_until:'2099-01-01T00:00:00.000Z',terms:'合成抵扣；分期按实付，已使用券退款不返',production:{face_minor:5000,minimum_minor:50000,spec_ids:[spec.id]},interview:null,exposure:null};let stock=await request('/redemption/stock',producer,{template,evidence_asset_ids:[f.proof.id]});stock=await request('/redemption/stock/'+stock.id+'/review',reviewer,{decision:'APPROVE',reason:'synthetic independent'},stock.object_version,false);return request('/redemption/exchanges',buyer,{stock_id:stock.id,template_sha256:require(resolve(b,'src/modules/governance/content')).digest(template)})}
 async function chooseCoupon(grant){await customer.getByRole('button',{name:'读取本人可用制作权益',exact:true}).click();await customer.getByLabel('选择已取得的实际权益').selectOption(grant.id);await post(customer,'/checkout',()=>customer.getByRole('button',{name:'按原报价试算并锁定本券',exact:true}).click());assert.match(await customer.getByTestId('trade-coupon-selector').innerText(),/450.00/)}
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
 if(recoveryMode)await check('同故事页面补件：私有草稿不泄露，正式重提丢响应沿原请求恢复后重新受理',async()=>{
  const initial=story.submission.id,privateText='合成补件后的具体祝福 '+key(),writes=[]
  await operator.getByTestId('customization-supplement-field-0').selectOption('message')
  await operator.getByTestId('customization-supplement-reason-0').fill('请补充具体祝福内容')
  await operator.getByTestId('customization-supplement-instruction-0').fill('请写明要传达的一句话')
  await post(operator,'/supplements',()=>operator.getByTestId('customization-supplement-submit').click())
  await goto(customer,'/operations/customization/mine/'+story.id)
  await customer.locator('#story-answers-message').fill(privateText);await customer.locator('#story-responses-message').fill('已补充实际祝福内容')
  const saving=customer.waitForResponse(r=>r.request().method()==='PATCH'&&new URL(r.url()).pathname.endsWith('/supplement'))
  await customer.getByTestId('story-save').click();assert.equal((await saving).status(),200);await customer.waitForLoadState('networkidle')
  await goto(operator,'/operations/customization/'+story.id);assert(!(await operator.locator('body').innerText()).includes(privateText));assert.equal(await operator.getByTestId('customization-create-quote').count(),0)
  await customer.route('**/api/v1/customization-requests/*/supplement-submissions',async route=>{
   const q=route.request();if(q.method()!=='POST')return route.continue();writes.push({key:q.headers()['idempotency-key'],body:q.postData(),version:q.headers()['if-match']})
   if(writes.length===1){const response=await route.fetch();assert.equal(response.status(),200);return route.abort('failed')}return route.continue()
  })
  await customer.getByRole('checkbox',{name:'我已核对保存的文字和逐项补充说明，确认作为正式版本发送给平台。'}).check()
  await customer.getByTestId('story-submit').click();await customer.getByTestId('story-pending').waitFor()
  await customer.getByRole('button',{name:'核对当前记录',exact:true}).click()
  story=await post(customer,'/supplement-submissions',()=>customer.getByRole('button',{name:'恢复原操作请求',exact:true}).click())
  assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);assert.notEqual(story.submission.id,initial);assert.equal(story.submission.answers.message,privateText)
  await customer.unroute('**/api/v1/customization-requests/*/supplement-submissions')
  await goto(operator,'/operations/customization/'+story.id);assert.equal(await operator.getByTestId('customization-create-quote').count(),0)
  await post(operator,'/intake',()=>operator.getByTestId('customization-intake').click());assert.match(await operator.getByTestId('customization-formal-response').innerText(),/已补充实际祝福内容/)
  ids.original_submission=initial;ids.supplement_submission=story.submission.id
  await operator.screenshot({path:resolve(out,'02-supplement-recovered.png'),fullPage:true})
 })
 await check('运营按已审新版规格创建30/40/30报价，客户确认同一故事订单',async()=>{
  await goto(operator,'/trade/quotes/new?customizationRequest='+story.id)
  // Both specification versions remain valid until the backend release switch.
  await operator.getByTestId('trade-quote-spec-0').selectOption(old.spec.id);assert.match(await operator.locator('body').innerText(),/旧版规格.*30\/60\/10/)
  await operator.getByTestId('trade-quote-spec-0').selectOption(model.spec.id)
  for(const [test,value] of Object.entries({'trade-quote-rule':model.quote.data.rule_id,'trade-quote-line-0':'film','trade-quote-quantity-0':'1','trade-quote-expires':'2099-01-01T00:00','trade-quote-window':'30'}))await operator.getByTestId(test).fill(value)
  await operator.getByTestId('trade-quote-channel').selectOption('ALIPAY')
  for(const [n,amount] of originalParts.map(n=>(n/100).toFixed(2)).entries()){await operator.getByTestId('trade-quote-installment-key-'+n).fill(['first','interim','last'][n]);await operator.getByTestId('trade-quote-allocation-line-'+n+'-0').selectOption('film');await operator.getByTestId('trade-quote-allocation-amount-'+n+'-0').fill(amount)}
  quote=await post(operator,'/trade/quotes',()=>operator.getByTestId('trade-quote-submit').click());ids.quote=quote.id;quote=await f.reviewTrade(quote)
  await goto(customer,'/trade/quotes/'+quote.id);if(couponMode)await chooseCoupon(await grantFor(model.spec));await customer.getByRole('checkbox',{name:'我已核对本报价的服务、分期、期限和条款。'}).check();order=await post(customer,'/acceptance',()=>customer.getByRole('button',{name:'确认报价并建立订单',exact:true}).click());ids.order=order.id
  assert.deepEqual(order.data.quote.installments.map(i=>i.allocations[0].amount_minor),netParts);assert.deepEqual(order.data.contract.commitments.quote.installments,order.data.quote.installments);assert.equal(order.data.quote.customization.request_id,story.id)
  if(copyrightMode){assert.equal(order.data.quote.customization_copyright.terms.mode,copyrightMode);assert.deepEqual(order.data.quote.customization_copyright,order.data.contract.commitments.quote.customization_copyright);assert.match(await customer.locator('body').innerText(),/成片版权|版权人/);}
  await customer.screenshot({path:resolve(out,'02-order.png'),fullPage:true})
 })
 const repo=require(resolve(b,'src/modules/production/repository')).createProductionRepository(db,{resolvePrincipal:f.resolvePrincipal})
 async function review(record){return repo.review(reviewer.ctx,{record_id:record.id,expected_version:record.object_version,decision:'APPROVED',reason:'synthetic independent review',verification:record.kind==='PROJECT'?{contract_sha256:record.data.contract_sha256,identity_verified:true,signatures_verified:true,rights_verified:true}:record.data.stage==='SCRIPT'?{script_reviewed:true}:{script_reviewed:true,specification_reviewed:true,audio_reviewed:true,branding_reviewed:true,commercial_watermark_verified:true,ai_label_verified:true},operation_key:key()})}
 const video=[]
 for(const color of ['blue','green']){const file=resolve(out,color+'.mp4');execFileSync(process.env.JX_TEST_FFMPEG||'ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c='+color+':s=320x180:d=1','-c:v','libx264','-pix_fmt','yuv420p','-y',file]);video.push(await readFile(file))}
 async function deliver(stage){const files=[];for(let n=0;n<2;n++){const body=stage==='SCRIPT'?Buffer.from('合成当前脚本 '+key()):video[n],r=await repo.reserveFile(producer.ctx,{party_id:producer.acting_party_id,project_id:project.id,media_type:stage==='SCRIPT'?'text/plain':'video/mp4',body,operation_key:key()});await f.storageFactory().put({key:r.record.data.object_key,body});files.push(await repo.finishFile(producer.ctx,{party_id:producer.acting_party_id,record_id:r.record.id,success:true}))}const p=await get('/production/records/'+project.id,producer);return review(await repo.submitVersion(producer.ctx,{party_id:producer.acting_party_id,record_id:project.id,expected_version:p.object_version,stage,file_id:files[0].id,preview_file_id:files[1].id,note:'synthetic '+stage,operation_key:key()}))}
 async function accept(version){await goto(customer,'/production/versions/'+version.id);await customer.getByTestId('production-read-preview').click();if(version.data.stage==='SCRIPT')await customer.locator('.production-text-preview').waitFor();else await customer.waitForFunction(()=>document.querySelector('video')?.readyState>=2);for(const check of version.data.stage==='SCRIPT'?['script']:['script','specification','audio','branding'])await customer.getByTestId('production-check-'+check).check();await customer.getByTestId('production-feedback-decision').selectOption('ACCEPT');await customer.getByTestId('production-feedback-note').fill('合成客户逐版核对');await post(customer,'/feedback',()=>customer.getByTestId('production-feedback-submit').click())}
 async function acknowledge(version){
  await goto(customer,'/production/projects/'+project.id+'/fulfillment');await customer.getByTestId('delivery-preview').click();if(version.data.stage==='SCRIPT')await customer.locator('.production-text-preview').waitFor();else await customer.waitForFunction(()=>document.querySelector('video')?.readyState>=2)
  await post(customer,'/read',()=>customer.getByTestId('delivery-notification-read').click());await customer.getByRole('checkbox',{name:'我已实际查看本版并收到本次交付，明确确认收讫。'}).check();const receipt=await post(customer,'/delivery-receipt',()=>customer.getByTestId('delivery-receipt').click());assert.equal(await customer.getByTestId('delivery-receipt').isDisabled(),true);assert.equal(receipt.receipt.deadline_basis.mode,version.data.stage==='FINAL'?'WORKING_DAYS':'EXPLICIT_CONFIRMATION');if(version.data.stage!=='FINAL'){assert.equal(receipt.receipt.deadline_at,null);assert.match(await customer.locator('body').innerText(),/本阶段须明确确认成果/)}return receipt
 }
 await check('首款后开工；脚本改版使原确认失效，中款前页面禁止样片',async()=>{
  assert.equal((await f.pay(order,'first')).data.amount_minor,netParts[0])
  project=await repo.create(producer.ctx,{party_id:producer.acting_party_id,order_id:order.id,line_id:'film',script_version_id:f.work.id,license_project_id:null,assignee_account_id:producer.account_id,purpose:'PRIVATE',territory:'CN',consent_ids:[],evidence_asset_id:f.proof.id,fulfillment:{uses_identifiable_people:false,cast:[]},operation_key:key()});project=await review(project);ids.project=project.id
  await repo.startCustomization(producer.ctx,{party_id:producer.acting_party_id,record_id:project.id,expected_version:project.object_version,operation_key:key()})
  await assert.rejects(()=>f.pay(order,'interim'),{code:'PAYMENT_MILESTONE_NOT_MET'})
  const script=await deliver('SCRIPT');await acknowledge(script);await accept(script);const revised=await deliver('SCRIPT');await assert.rejects(()=>f.pay(order,'interim'),{code:'PAYMENT_MILESTONE_NOT_MET'});await accept(revised)
  await goto(operator,'/production/projects/'+project.id+'/versions');assert.equal(await operator.locator('[data-testid="production-stage"] option[value="SAMPLE"]').evaluate(e=>e.disabled),true);await operator.screenshot({path:resolve(out,'03-middle-unpaid.png'),fullPage:true})
  if(recoveryMode){
   await goto(customer,'/trade/payments/new?orderId='+order.id);await customer.getByTestId('trade-installment').selectOption('interim')
   const payment=await post(customer,'/payments',()=>customer.getByRole('button',{name:'建立本期付款记录',exact:true}).click());ids.unknown_payment=payment.id
   await sim.choose(buyer.ctx,{record_id:payment.id,party_id:buyer.acting_party_id,state:'UNKNOWN'})
   await goto(customer,'/trade/payments/'+payment.id)
   const unknown=customer.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith('/reconciliation'))
   await customer.getByRole('button',{name:'核实支付结果',exact:true}).click();const response=await unknown;assert.equal(response.status(),503);await customer.waitForLoadState('networkidle')
   assert.equal((await get('/trade/records/'+order.id)).data.financial.received_minor,netParts[0])
   await goto(operator,'/production/projects/'+project.id+'/versions');assert.equal(await operator.locator('[data-testid="production-stage"] option[value="SAMPLE"]').evaluate(e=>e.disabled),true)
   await sim.choose(buyer.ctx,{record_id:payment.id,party_id:buyer.acting_party_id,state:'SUCCEEDED'})
   await goto(customer,'/trade/payments/'+payment.id);const paid=await post(customer,'/reconciliation',()=>customer.getByRole('button',{name:'恢复原消费操作',exact:true}).click());assert.equal(paid.current_status,'SUCCEEDED');assert.equal(paid.data.amount_minor,netParts[1])
   await post(customer,'/reconciliation',()=>customer.getByRole('button',{name:'核实支付结果',exact:true}).click())
   assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM trade_journal WHERE order_id=? AND direction='RECEIPT'",[order.id]))[0][0].n),2)
   await customer.screenshot({path:resolve(out,'03-payment-recovered.png'),fullPage:true})
  }else assert.equal((await f.pay(order,'interim')).data.amount_minor,netParts[1]);await operator.reload();await operator.waitForLoadState('networkidle');assert.equal(await operator.locator('[data-testid="production-stage"] option[value="SAMPLE"]').evaluate(e=>e.disabled),false)
 })
 await check('同单5工作日收讫、问题暂停重发、逐版确认及尾款后实际私有下载',async()=>{
  for(const stage of ['SAMPLE','ROUGH_CUT'])await accept(await deliver(stage))
  const final=await deliver('FINAL');const firstReceipt=await acknowledge(final);assert.equal(firstReceipt.terms.acceptance_working_days,5);assert.match(await customer.locator('body').innerText(),/北京时间/)
  await customer.getByLabel('问题类型',{exact:false}).selectOption('FILE_UNAVAILABLE');await customer.getByLabel('具体问题与诉求',{exact:false}).fill('合成断网文件问题');const paused=await post(customer,'/cases',()=>customer.getByTestId('delivery-open-case').click());assert.equal(paused.state,'PAUSED');assert.equal(paused.receipt,null);assert.equal(await customer.getByTestId('delivery-receipt').count(),0)
  const issue=paused.cases.find(c=>c.current_status==='OPEN');await repo.resolveCustomizationCase(reviewer.ctx,{record_id:project.id,expected_version:paused.object_version,case_id:issue.id,decision:'RESUME',retained_minor:null,change_order_id:null,reason:'合成独立处理，原文件已恢复',operation_key:key()})
  await goto(operator,'/production/projects/'+project.id+'/fulfillment');await operator.getByLabel('重新交付理由',{exact:true}).fill('合成恢复后完整新期限');await post(operator,'/reissue',()=>operator.getByRole('button',{name:'重新发出本版交付通知',exact:true}).click());const again=await acknowledge(final);assert.notEqual(again.receipt.delivery_id,firstReceipt.receipt.delivery_id);assert.equal(again.receipt.deadline_basis.days,5);ids.receipt=again.receipt.delivery_id;await customer.screenshot({path:resolve(out,'05-reissued-working-days.png'),fullPage:true})
  await accept(final);assert(await customer.getByTestId('production-download-final').isDisabled())
  await goto(customer,'/production/projects/'+project.id+'/fulfillment');assert.match(await customer.locator('body').innerText(),/脚本.*40%/)
  assert.equal((await f.pay(order,'last')).data.amount_minor,netParts[2]);await goto(customer,'/production/versions/'+final.id);assert.equal(await customer.getByTestId('production-download-final').isDisabled(),false)
  const download=customer.waitForResponse(r=>r.url().includes('variant=final'));await customer.getByTestId('production-download-final').click();assert.equal((await download).status(),200)
  await customer.screenshot({path:resolve(out,'04-final-paid.png'),fullPage:true});assert.equal((await get('/production/projects/'+project.id+'/fulfillment')).state,'DELIVERED')
 })
 if(couponMode)await check('用券后取消：客户提交，承制方不可自审，独立决定保留金额，实际退款与券账目闭环',async()=>{
  let offered;const stop=new Error('synthetic quote only');await assert.rejects(f.newOrder({preview:'SCRIPT_BEFORE_INTERIM',calendar:require(resolve(b,'test/support/working-calendar.cjs'))(),unitMinor:50000,beforeAccept:async data=>{offered=data;throw stop}}),e=>e===stop);
  const grant=await grantFor(offered.spec);await goto(customer,'/trade/quotes/'+offered.quote.id);await chooseCoupon(grant);await customer.getByRole('checkbox',{name:'我已核对本报价的服务、分期、期限和条款。'}).check();const cancelledOrder=await post(customer,'/acceptance',()=>customer.getByRole('button',{name:'确认报价并建立订单',exact:true}).click());assert.deepEqual(cancelledOrder.data.quote.installments.map(i=>i.allocations[0].amount_minor),[13500,18000,13500]);const first=await f.pay(cancelledOrder,'first');
  project=await review(await repo.create(producer.ctx,{party_id:producer.acting_party_id,order_id:cancelledOrder.id,line_id:'film',script_version_id:f.work.id,license_project_id:null,assignee_account_id:producer.account_id,purpose:'PRIVATE',territory:'CN',consent_ids:[],evidence_asset_id:f.proof.id,fulfillment:{uses_identifiable_people:false,cast:[]},operation_key:key()}));await repo.startCustomization(producer.ctx,{party_id:producer.acting_party_id,record_id:project.id,expected_version:project.object_version,operation_key:key()});await accept(await deliver('SCRIPT'));const middle=await f.pay(cancelledOrder,'interim');
  await goto(customer,'/production/projects/'+project.id+'/fulfillment');await customer.getByLabel('问题类型',{exact:false}).selectOption('CANCEL');await customer.getByLabel('具体问题与诉求',{exact:false}).fill('合成用券客户取消，要求独立核对已完成价值');const paused=await post(customer,'/cases',()=>customer.getByTestId('delivery-open-case').click());const issue=paused.cases.find(c=>c.current_status==='OPEN');
  await assert.rejects(repo.resolveCustomizationCase(producer.ctx,{record_id:project.id,expected_version:paused.object_version,case_id:issue.id,decision:'CANCEL',retained_minor:13500,change_order_id:null,reason:'synthetic self review forbidden',operation_key:key()}),{code:'PRODUCTION_REVIEW_FORBIDDEN'});
  await goto(independent,'/production/reviews/fulfillment/'+project.id);await independent.getByLabel('开放工单',{exact:false}).selectOption(issue.id);await independent.getByLabel('处理决定',{exact:false}).selectOption('CANCEL');await independent.getByLabel('明确保留金额',{exact:false}).fill('135.00');await independent.getByLabel('实际核对依据与决定理由',{exact:false}).fill('合成独立审核，仅保留已确认脚本对应135元');const decided=await post(independent,'/case-resolution',()=>independent.getByTestId('delivery-resolve').click());assert.equal(decided.cancellation.received_minor,31500);assert.equal(decided.cancellation.retained_minor,13500);assert.equal(decided.cancellation.refund_minor,18000);assert.equal(decided.state,'REFUND_REQUIRED');
  await goto(customer,'/production/projects/'+project.id+'/fulfillment');await post(customer,'/refund-sync',()=>customer.getByRole('button',{name:'核对原退款记录',exact:true}).click());assert.equal((await get('/production/projects/'+project.id+'/fulfillment')).state,'REFUND_REQUIRED');assert.match(await customer.locator('.delivery-cancellation').innerText(),/¥0.00/);
  let refund=await f.trade.requestRefund(buyer.ctx,{party_id:buyer.personal_party_id,payment_id:middle.id,allocations:[{line_id:'film',amount_minor:18000}],reason:'synthetic independently approved cancellation',operation_key:key()});refund=await f.reviewTrade(refund);await f.trade.claim(reviewer.ctx,refund.id,null,'REFUND');const proof={...refund.data,refund_id:refund.id,status:'SUCCEEDED'};await f.trade.applyRefund(refund.id,proof);await f.trade.applyRefund(refund.id,proof);
  const synced=await post(customer,'/refund-sync',()=>customer.getByRole('button',{name:'核对原退款记录',exact:true}).click());assert.equal(synced.state,'REFUNDED');assert.equal(synced.cancellation.actual_refunded_minor,18000);const actual=await get('/trade/records/'+cancelledOrder.id);assert.deepEqual([actual.data.financial.received_minor,actual.data.financial.refunded_minor,actual.data.financial.net_minor],[31500,18000,13500]);assert.equal((await get('/redemption/grants/'+grant.id)).current_status,'USED');assert.equal(first.data.amount_minor,13500);ids.cancel_order=cancelledOrder.id;ids.cancel_project=project.id;await customer.screenshot({path:resolve(out,'06-coupon-cancel-refunded.png'),fullPage:true});await independent.screenshot({path:resolve(out,'07-independent-cancel.png'),fullPage:true})
 });
 await check('原旧单合同与30/60/10保持，客户无直连视频生成请求',async()=>{
  const original=await get('/trade/records/'+old.order.id);assert.deepEqual(original.data.contract,oldSnapshot.data.contract);assert.deepEqual(original.data.financial,oldSnapshot.data.financial);assert.deepEqual(original.data.quote.installments.map(i=>i.allocations[0].amount_minor),[3000,6000,1001]);assert(!requests.some(r=>r.path==='/api/video'||r.path.includes('/generation')));assert.deepEqual(errors,[])
 })
 completed=true
}catch(e){problem=e.stack;console.error(e.message);process.exitCode=1}
finally{
 if(browser)await browser.close();if(web)await new Promise(r=>web.httpServer.close(r));if(server){server.closeAllConnections();await new Promise(r=>server.close(r))}if(db)await db.close();if(control){if(created)await control.query('DROP DATABASE '+mysql.escapeId(name));await control.end()}
 await writeFile(resolve(out,'results.json'),JSON.stringify({synthetic_only:true,recovery_mode:recoveryMode,coupon_mode:couponMode,net_installments:netParts,head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),checked_at:new Date().toISOString(),completed,checks,ids,requests,errors,transport,error:problem,cleanup:'database and sessions removed',scope:'Actual customer/operator UI and local HTTP/MySQL; fixture simulates first/last receipts, producer uploads and independent reviews; recovery mode uses browser middle-payment creation and simulator reconciliation, never real money. Not native App or production provider acceptance.'},null,2)+'\n')
 console.log(JSON.stringify({completed,checks:checks.length,evidence:resolve(out,'results.json')}))
}
