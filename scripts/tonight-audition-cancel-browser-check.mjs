import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
const recoveryMode=process.env.JX_PM01_RECOVERY_TEST==='1';
const backend=resolve('晶晶日上工程交接包/01_源码/backend_server'),webRoot=resolve('晶晶日上工程交接包/01_源码/frontend_ops_workspace'),out=resolve(recoveryMode?'.local/pm01-w13-recovery-browser':'.local/tonight-audition-cancel-20261104'),req=createRequire(join(backend,'package.json')),wr=createRequire(join(webRoot,'package.json')),load=p=>req(join(backend,p));load('scripts/test-network-guard.cjs');
const mysql=req('mysql2/promise'),{openDatabase}=load('src/infrastructure/database'),{migrate}=load('src/infrastructure/database/migrator'),{chromium}=wr('playwright-core'),{preview}=await import(pathToFileURL(wr.resolve('vite'))),key=()=>randomUUID();
const env=JSON.parse(await readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const[k,v]of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
await mkdir(out,{recursive:true});const database='jx_test_cancel_ui_'+randomBytes(8).toString('hex'),result={synthetic_only:true,recovery_mode:recoveryMode,database,started_at:new Date().toISOString(),steps:[],records:{},cleanup:{},failures:[]};let admin,db,server,web,browser,created=false;
const watched=['scripts/tonight-audition-cancel-browser-check.mjs','晶晶日上工程交接包/01_源码/backend_server/src/modules/auditions/repository.js','晶晶日上工程交接包/01_源码/frontend_ops_workspace/dist/index.html','晶晶日上工程交接包/01_源码/frontend_ops_workspace/src/views/BusinessView.vue','晶晶日上工程交接包/01_源码/frontend_ops_workspace/src/business/auditions.ts','contracts/openapi.yaml'];async function hashes(){return Object.fromEntries(await Promise.all(watched.map(async p=>[p,createHash('sha256').update(await readFile(resolve(p))).digest('hex')])))}result.source_sha256=await hashes();
const record=(name,extra={})=>{result.steps.push({name,...extra});console.log('PASS '+name)};
try{
 admin=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});await admin.query('CREATE DATABASE '+mysql.escapeId(database)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');created=true;db=await openDatabase({...env,MYSQL_DATABASE:database,...recoveryMode?{MYSQL_CONNECTION_LIMIT:'1'}:{}});await migrate(db);const S=await load('test/helpers/auditions-seed.cjs').seedAuditions(db);
 const sim=await load('src/testing/payment-simulator').createPaymentSimulator(db,{...env,MYSQL_DATABASE:database,JX_PAYMENT_SIMULATOR_ENABLED:'true'},{merchant_party_id:S.seller.personal_party_id,resolvePrincipal:S.resolvePrincipal});const app=load('src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory,tradeProvidersFactory:()=>sim});server=http.createServer(app);await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok)});const base='http://127.0.0.1:'+server.address().port+'/api/v1';
 async function request(role,method,path,body,version,party=true){const u=S[role],r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+u.token,...party?{'X-Acting-Party':u.personal_party_id}:{},...body!==undefined?{'Content-Type':'application/json','Idempotency-Key':key()}:{},...version?{'If-Match':'"'+version+'"'}:{}},...body===undefined?{}:{body:JSON.stringify(body)}}),j=await r.json();assert.equal(r.status,200,JSON.stringify(j));return j.data;}
 let offer=await S.auditions.createOffer(S.seller.ctx,{party_id:S.seller.personal_party_id,offer:S.offer,operation_key:key()});offer=await S.auditions.reviewOffer(S.reviewer.ctx,{record_id:offer.id,expected_version:offer.object_version,decision:'APPROVE',reason:'synthetic independent',operation_key:key()});let booking=await S.auditions.book(S.buyer.ctx,{party_id:S.buyer.personal_party_id,offer_id:offer.id,offer_sha256:offer.content_sha256,appointment:S.appointment,operation_key:key()});booking=await S.auditions.reviewBooking(S.reviewer.ctx,{record_id:booking.id,expected_version:booking.object_version,decision:'APPROVE',checks:{purpose_verified:true,venue_verified:true,adult_parties_verified:true},reason:'synthetic independent',operation_key:key()});const order=await request('buyer','POST','/auditions/checkout',{booking_id:booking.id,booking_sha256:booking.content_sha256,channel:'ALIPAY'});let payment=await request('buyer','POST','/trade/payments',{order_id:order.id,installment_key:'audition'});await sim.choose(S.buyer.ctx,{record_id:payment.id,party_id:S.buyer.personal_party_id,state:'SUCCEEDED'});payment=await request('buyer','POST','/trade/payments/'+payment.id+'/reconciliation',{transaction_id:null});booking=await request('buyer','GET','/auditions/records/'+booking.id);booking=await S.auditions.decide(S.seller.ctx,{record_id:booking.id,party_id:S.seller.personal_party_id,expected_version:booking.object_version,decision:'ACCEPT',reason:'synthetic',operation_key:key()});assert.equal(booking.current_status,'ACCEPTED');record('fixture-accepted-before-departure',{booking_id:booking.id,order_id:order.id,payment_id:payment.id,real_money:false});
 const webPort=recoveryMode?5329:5185,origin='http://127.0.0.1:'+webPort;web=await preview({root:webRoot,configFile:false,build:{outDir:join(webRoot,'dist')},preview:{host:'127.0.0.1',port:webPort,strictPort:true,proxy:{'/api':{target:new URL(base).origin}}}});browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});async function actor(role,path){const u=S[role],c=await browser.newContext({viewport:{width:1440,height:1100},locale:'zh-CN'});await c.addInitScript(({token,party})=>{sessionStorage.setItem('ops.session.token',token);sessionStorage.setItem('ops.session.selected',party)},{token:u.token,party:u.personal_party_id});const p=await c.newPage();p.setDefaultTimeout(15000);await p.goto(origin+path);await p.waitForLoadState('networkidle');return p;}async function post(p,suffix,action){const wait=p.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith(suffix));await action();const r=await wait,j=await r.json();assert.equal(r.status(),200,JSON.stringify(j));await p.waitForLoadState('networkidle');return j.data;}
 const buyer=await actor('buyer','/auditions/bookings/'+booking.id+'?action=cancel'),writes=[];await buyer.route('**/api/v1/auditions/bookings/*/cancel',async route=>{const q=route.request();if(q.method()!=='POST')return route.continue();writes.push({key:q.headers()['idempotency-key'],body:q.postData(),version:q.headers()['if-match']});if(writes.length===1){const upstream=await route.fetch();assert.equal(upstream.status(),200);return route.abort('failed')}return route.continue()});await buyer.getByTestId('business-cancel').waitFor();await buyer.locator('#cancel-reason').fill('Synthetic plan changed before departure');await buyer.getByLabel('涉及安全问题',{exact:true}).check();await buyer.getByLabel('已阅读当前记录与本次约定，明确提交上述办理事项。',{exact:true}).check();await buyer.getByTestId('business-cancel').click();await buyer.getByRole('button',{name:'核对原记录',exact:true}).click();await buyer.getByRole('button',{name:'恢复同一次请求',exact:true}).click();await buyer.waitForLoadState('networkidle');assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);booking=await request('buyer','GET','/auditions/records/'+booking.id);assert.equal(booking.current_status,'REFUND_REQUIRED');assert.equal(booking.refund_is_verified,false);assert.equal(booking.data.refund_minor,10000);record('web-cancel-unknown-same-key-full-refund-pending',{booking_id:booking.id,refund_id:booking.data.refund_id,amount_minor:10000});
 const refundId=booking.data.refund_id,reviewer=await actor('reviewer','/trade/reviews/refunds/'+refundId);await reviewer.getByTestId('trade-review-decision').selectOption('APPROVED');await reviewer.getByTestId('trade-review-reason').fill('Synthetic independent refund review');await post(reviewer,'/reviews',()=>reviewer.getByTestId('trade-review-submit').click());await reviewer.getByLabel('我已核对已批准的原退款明细，确认执行。',{exact:true}).check();const pending=await post(reviewer,'/execution',()=>reviewer.getByRole('button',{name:'执行已审退款',exact:true}).click());assert.equal(pending.current_status,'PENDING');
if(recoveryMode){
 await sim.choose(S.buyer.ctx,{record_id:refundId,party_id:S.buyer.personal_party_id,state:'UNKNOWN'});
 await buyer.goto(origin+'/trade/refunds/'+refundId);await buyer.waitForLoadState('networkidle');
 const wait=buyer.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith('/reconciliation'));
 await buyer.getByRole('button',{name:'核实已有退款结果',exact:true}).click();assert.equal((await wait).status(),503);await buyer.waitForLoadState('networkidle');
 const still=await request('buyer','GET','/auditions/records/'+booking.id);assert.equal(still.current_status,'REFUND_REQUIRED');assert.equal(still.refund_is_verified,false);
 assert.equal((await request('buyer','GET','/trade/records/'+order.id)).data.financial.refunded_minor,0);
 record('web-refund-unknown-does-not-pretend-money-returned',{booking_id:booking.id,refund_id:refundId});
 await buyer.screenshot({path:join(out,'refund-unknown.png'),fullPage:true});
}
await sim.choose(S.buyer.ctx,{record_id:refundId,party_id:S.buyer.personal_party_id,state:'SUCCEEDED'});await buyer.goto(origin+'/trade/refunds/'+refundId);await buyer.waitForLoadState('networkidle');const done=await post(buyer,'/reconciliation',()=>buyer.getByRole('button',{name:'核实已有退款结果',exact:true}).click());assert.equal(done.current_status,'SUCCEEDED');booking=await request('buyer','GET','/auditions/records/'+booking.id);assert.equal(booking.current_status,'REFUNDED');assert.equal(booking.refund_is_verified,true);
if(recoveryMode){
 const repeat=await post(buyer,'/reconciliation',()=>buyer.getByRole('button',{name:'核实已有退款结果',exact:true}).click());assert.equal(repeat.id,refundId);
 assert.equal((await db.execute("SELECT id FROM trade_journal WHERE order_id=? AND direction='REFUND'",[order.id]))[0].length,1);
 assert.deepEqual((await request('buyer','GET','/trade/records/'+order.id)).data.financial,{received_minor:10000,refunded_minor:10000,net_minor:0});
 record('web-repeat-refund-reconciliation-keeps-one-journal',{booking_id:booking.id,refund_id:refundId});
}
result.records={booking_id:booking.id,order_id:order.id,payment_id:payment.id,refund_id:refundId};record('web-independent-review-and-synthetic-refund',{booking_id:booking.id,refund_id:refundId});await buyer.screenshot({path:join(out,'refund-verified.png'),fullPage:true});
if(recoveryMode){
 // A separate appointment, because the first one is already refunded.
 // Only the isolated single-connection clock advances; contract/status rows are not patched.
 await db.execute("UPDATE auth_sessions SET expires_ms=4070908800000");
 let normal=await request('buyer','POST','/auditions/bookings',{offer_id:offer.id,offer_sha256:offer.content_sha256,appointment:S.appointment});
 normal=await request('reviewer','POST','/auditions/bookings/'+normal.id+'/reviews',{decision:'APPROVE',checks:{purpose_verified:true,venue_verified:true,adult_parties_verified:true},reason:'Synthetic independent new appointment'},normal.object_version,false);
 const normalOrder=await request('buyer','POST','/auditions/checkout',{booking_id:normal.id,booking_sha256:normal.content_sha256,channel:'ALIPAY'});
 const p=await request('buyer','POST','/trade/payments',{order_id:normalOrder.id,installment_key:'audition'});
 await sim.choose(S.buyer.ctx,{record_id:p.id,party_id:S.buyer.personal_party_id,state:'SUCCEEDED'});
 await request('buyer','POST','/trade/payments/'+p.id+'/reconciliation',{transaction_id:null});
 normal=await request('seller','GET','/auditions/records/'+normal.id);
 normal=await request('seller','POST','/auditions/bookings/'+normal.id+'/decision',{decision:'ACCEPT',reason:'Synthetic accepted'},normal.object_version);
 async function visit(page,path){await page.goto(origin+path);await page.waitForLoadState('networkidle');}
 async function submitBusiness(page,action,suffix){
  await page.getByLabel('已阅读当前记录与本次约定，明确提交上述办理事项。',{exact:true}).check();
  return post(page,suffix,()=>page.getByTestId('business-'+action).click());
 }

 let selectedEvidence;
 async function evidence(page,action){
  if(action!=='resolve'){
   await page.getByText('准备本次私有材料',{exact:true}).click();await page.locator('#business-purpose').selectOption('REVIEW_EVIDENCE');
   await page.locator('#business-upload-file').setInputFiles({name:'synthetic-evidence.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic '+action+' independently readable evidence')});
   selectedEvidence=(await post(page,'/assets',()=>page.getByRole('button',{name:'上传私有材料',exact:true}).click())).id;
  }
  const field=page.locator('#'+action+'-evidence_asset_ids-field');
  await field.getByRole('button').click();
  await field.locator('label').filter({hasText:selectedEvidence}).getByRole('checkbox').check();
  if(action==='resolve'){
   await page.locator('#business-asset').selectOption(selectedEvidence);
   await page.getByRole('button',{name:'核对当前争议依据',exact:true}).click();
  }
 }
 const artist=await actor('seller','/auditions/bookings/'+normal.id+'?action=travel');
 await artist.locator('#travel-action').selectOption('DEPART');await evidence(artist,'travel');
 normal=await submitBusiness(artist,'travel','/travel');assert.equal(normal.current_status,'DEPARTED');
 await visit(artist,'/auditions/bookings/'+normal.id+'?action=cancel');await artist.locator('#cancel-reason').fill('Synthetic unsafe changed venue');
 await artist.getByLabel('涉及安全问题',{exact:true}).check();await evidence(artist,'cancel');
 normal=await submitBusiness(artist,'cancel','/cancel');assert.equal(normal.current_status,'DISPUTED');assert.equal(normal.conversation_status,'FROZEN');
 record('web-departed-safety-dispute-freezes-same-appointment',{booking_id:normal.id,order_id:normalOrder.id});
 await visit(reviewer,'/auditions/reviews/'+normal.id+'?action=resolve');
 await reviewer.locator('#resolve-decision').selectOption('RESUME');await reviewer.locator('#resolve-refund_minor').fill('0');
 await reviewer.locator('#resolve-reason').fill('Synthetic independently verified safe venue');await evidence(reviewer,'resolve');
 normal=await submitBusiness(reviewer,'resolve','/resolution');assert.equal(normal.current_status,'DEPARTED');
 await db.execute('SET timestamp=?',[Math.floor(Date.parse(normal.data.appointment.starts_at)/1000)+60]);
 normal=await request('seller','POST','/auditions/bookings/'+normal.id+'/travel',{action:'ARRIVE',evidence_asset_ids:[S.arrival.id]},normal.object_version);
 normal=await request('seller','POST','/auditions/bookings/'+normal.id+'/delivery',{delivery:S.delivery},normal.object_version);
 normal=await request('reviewer','POST','/auditions/bookings/'+normal.id+'/delivery-review',{decision:'APPROVE',checks:{content_reviewed:true,files_viewable:true,consent_verified:true},reason:'Synthetic fixture materials; not quality certification'},normal.object_version,false);
 for(const asset of [...S.delivery.photos,...S.delivery.videos]){
  const response=await fetch(base+'/auditions/bookings/'+normal.id+'/materials/'+asset,{headers:{Authorization:'Bearer '+S.buyer.token,'X-Acting-Party':S.buyer.personal_party_id}});
  assert.equal(response.status,200);assert((await response.arrayBuffer()).byteLength>0);
 }
 await visit(buyer,'/auditions/bookings/'+normal.id+'?action=receipt');normal=await submitBusiness(buyer,'receipt','/receipt');
 await visit(buyer,'/auditions/bookings/'+normal.id+'?action=confirm');normal=await submitBusiness(buyer,'confirm','/confirm');
 assert.equal(normal.current_status,'FULFILLED');assert.equal(normal.performance_rights_granted,false);
 result.normal_records={booking_id:normal.id,order_id:normalOrder.id,payment_id:p.id};
 record('same-safety-recovered-appointment-arrives-delivers-and-buyer-confirms',{...result.normal_records,travel_and_resolution:'Web',delivery_and_material_reads:'HTTP synthetic bytes',real_identity_or_money:false});
 await buyer.screenshot({path:join(out,'normal-fulfilled.png'),fullPage:true});
}
assert.deepEqual(await hashes(),result.source_sha256,'source changed during test');result.passed=true;
}catch(e){result.passed=false;result.error=e.stack;result.failures.push(e.stack);process.exitCode=1;console.error(e.stack)}finally{await browser?.close();if(web)await new Promise(r=>web.httpServer.close(r));if(server){server.closeAllConnections();await new Promise(r=>server.close(r))}await db?.close();if(created&&/^jx_test_cancel_ui_[a-f0-9]{16}$/.test(database)){await admin.query('DROP DATABASE '+mysql.escapeId(database));result.cleanup.database_removed=true}await admin?.end();result.cleanup.services_stopped=true;result.finished_at=new Date().toISOString();await writeFile(join(out,'result.json'),JSON.stringify(result,null,2));}
