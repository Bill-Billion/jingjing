// Continue one real isolated order. Browser actions, simulator receipts and API
// observations stay distinct; checkpoints prevent a retry creating another order.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, join, sep} from 'node:path';
import {createRequire} from 'node:module';
import {createHash, randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const root=process.cwd(), accessPath=resolve(process.env.V5_ACCESS_FILE);
const access=JSON.parse(await readFile(accessPath,'utf8'));
assert(access.synthetic_only && new URL(access.base_url).hostname==='127.0.0.1');
assert(Date.parse(access.expires_at)>Date.now());
for(const role of ['stock_buyer','stock_seller','stock_outsider'])assert(access.accounts[role],role);
let orderId=process.env.QA18_STOCK_ORDER_ID;
const listingId=process.env.QA18_STOCK_LISTING_ID || process.env.QA18_PENDING_LISTING_ID;
assert.match(orderId||listingId||'',/^[a-f0-9-]{36}$/);
if(listingId){assert.match(listingId,/^[a-f0-9-]{36}$/);if(process.env.QA18_PENDING_LISTING_ID){assert.equal(listingId,access.scenarios.stock_pending.listing_id);assert(access.accounts.stock_reviewer);}}
const out=resolve(process.env.QA18_OUTPUT_DIR);
assert(out.startsWith(join(root,'.local')+sep));
await mkdir(out,{recursive:true});
const statePath=join(out,'checkpoint.json');
const sha=b=>createHash('sha256').update(b).digest('hex');
let state;
try{state=JSON.parse(await readFile(statePath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state={order_id:orderId,checks:[],requests:[],synthetic_only:true};}
assert.equal(state.environment ??= access.base_url,access.base_url);
assert.equal(state.listing_id ??= listingId,listingId);
if (orderId) assert.equal(state.order_id,orderId);
orderId ??= state.order_id;
assert(!state.completed,'Completed run must not be replayed');
const attempt=Date.now().toString();
state.attempts??=[];
state.attempts.push({id:attempt,source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),started_at:new Date().toISOString()});
const save=()=>writeFile(statePath,JSON.stringify(state,null,2));
async function done(name,detail={}){state.checks.push({name,...detail});await save();}
async function request(role,path,{body,version,allowed=[200],key,account=false}={}){
 const u=access.accounts[role];assert(u,role);
 const r=await fetch(access.base_url+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+u.bearer_token,...account?{}:{'X-Acting-Party':u.party_id},...body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':key||randomUUID()},...version?{'If-Match':'"'+version+'"'}:{}},...body===undefined?{}:{body:JSON.stringify(body)}});
 const bytes=Buffer.from(await r.arrayBuffer());let value;try{value=JSON.parse(bytes);}catch{}
 state.requests.push({source:'api-observation-or-simulator',role,path,status:r.status,method:body===undefined?'GET':'POST'});await save();
 assert(allowed.includes(r.status),`${path}: ${r.status} ${value?.error?.code}`);return {status:r.status,data:value?.data,bytes};
}
const {chromium}=createRequire(join(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
const pages=[];
function observe(p,role){p.on('request',r=>{if(['POST','PATCH'].includes(r.method()))state.requests.push({source:'browser',role,path:new URL(r.url()).pathname,method:r.method(),key_sha256:sha(r.headers()['idempotency-key']||''),body_sha256:sha(r.postData()||'')});});}
async function web(role,path){
 const u=access.accounts[role],c=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});
 await c.addInitScript(({token,party})=>{sessionStorage.setItem('ops.session.token',token);sessionStorage.setItem('ops.session.selected',party);},{token:u.bearer_token,party:u.party_id});
 const p=await c.newPage();p.setDefaultTimeout(18000);pages.push(p);observe(p,role);await go(p,path);return p;
}
async function go(p,path){await p.goto('http://127.0.0.1:5173'+path);await p.waitForLoadState('networkidle');}
async function app(path){const c=await browser.newContext({viewport:{width:390,height:844},locale:'zh-CN'}),p=await c.newPage();p.setDefaultTimeout(20000);pages.push(p);observe(p,'stock_buyer-app');await p.goto('http://127.0.0.1:5500/?fixtureRole=stock_buyer#'+path);await p.locator('flt-semantics-placeholder').waitFor({state:'attached'});await p.locator('flt-semantics-placeholder').evaluate(e=>e.click());await p.getByRole('heading').first().waitFor();await p.waitForLoadState('networkidle');return p;}
async function seek(p,loc){for(let n=0;n<45;n++){const b=await loc.count()?await loc.boundingBox():null;if(b&&b.y>=55&&b.y+b.height<p.viewportSize().height-8)return;await p.mouse.move(180,400);await p.mouse.wheel(0,b?.y<55?-350:350);await p.waitForTimeout(100);}throw Error('Cannot reach requested App control');}
async function post(p,path,click,allowed=[200]){const pending=p.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/v1'+path);await click();const r=await pending,j=await r.json();assert(allowed.includes(r.status()),`${path}: ${r.status()} ${j.error?.code}`);return {status:r.status(),data:j.data};}
let phase='read-original';
try{
 if(!orderId){
  phase='review-new-listing';
  const reviewRoute=`/stock/listings/${listingId}/reviews`;
  state.listing_reviews??={};
  let listing=(await request('stock_seller',`/stock/listings/${listingId}`)).data;
  for(const channel of process.env.QA18_PENDING_LISTING_ID?['RIGHTS','CONTENT']:[]){
   const verification=channel==='RIGHTS'
    ? {rights_verified:true,all_people_authorized:true,seller_qualified:true,source_sha256:listing.data.files.full_sha256}
    : {content_verified:true,preview_watermark_verified:true,ai_labels_verified:true,source_sha256:listing.data.files.full_sha256};
   const review=state.listing_reviews[channel]??={key:randomUUID(),version:listing.object_version,body:{channel,decision:'APPROVED',reason:'S1 synthetic independent listing review',verification}};
   await save();
   listing=(await request('stock_reviewer',reviewRoute,{...review,account:true})).data;
   await done('independent-listing-review-'+channel,{listing_id:listing.id,status:listing.current_status});
  }
  if(!process.env.QA18_PENDING_LISTING_ID) assert.equal(listing.current_status,'LISTED');
  phase='app-checkout-current-offer';
  const shopper=await app('/stock/video?listingId='+listingId);
  const consent=shopper.getByRole('checkbox',{name:'我已阅读本版价格、许可用途、地域、期间与售后约定',exact:true});
  await seek(shopper,consent);await consent.click();
  const buy=shopper.getByRole('button',{name:'立即购买',exact:true});await seek(shopper,buy);
  const ordered=await post(shopper,'/stock/checkout',async()=>{await buy.click();await shopper.getByRole('button',{name:'确认办理',exact:true}).click();});
  orderId=ordered.data.id;state.order_id=orderId;await done('app-checkout-reviewed-original-listing',{listing_id:listingId,order_id:orderId});await shopper.close();
 }
 const order=(await request('stock_buyer','/trade/records/'+orderId)).data;assert.equal(order.id,orderId);
 if(!state.contract_sha256){state.contract_sha256=sha(JSON.stringify(order.data.contract));state.amount_minor=order.data.quote.total_minor;await save();}
 const buyer=await web('stock_buyer','/trade/orders/'+orderId);
 if(!state.payment_id){
  phase='web-create-payment';assert.equal(order.current_status,'OPEN');
  await request('stock_buyer',`/stock/purchases/${orderId}/content`,{allowed:[409]});
  await go(buyer,'/trade/payments/new?orderId='+orderId);await buyer.getByRole('button',{name:'读取原订单',exact:true}).click();await buyer.getByTestId('trade-installment').selectOption('stock');
  const created=await post(buyer,'/trade/payments',()=>buyer.getByRole('button',{name:'建立本期付款记录',exact:true}).click());
  state.payment_id=created.data.id;assert.equal(created.data.order_id,orderId);await done('web-created-one-original-payment',{payment_id:state.payment_id});
 }
 if(!state.paid){
  phase='web-unknown-payment';await request('stock_buyer','/testing/payments/outcome',{body:{record_id:state.payment_id,state:'UNKNOWN'}});
  await go(buyer,'/trade/payments/'+state.payment_id);
  const unknown=await post(buyer,`/trade/payments/${state.payment_id}/reconciliation`,()=>buyer.getByRole('button',{name:'核实支付结果',exact:true}).click(),[200,503]);
  await request('stock_buyer',`/stock/purchases/${orderId}/content`,{allowed:[409]});await buyer.screenshot({path:join(out,attempt+'-unknown-payment.png'),fullPage:true});await done('unknown-payment-keeps-file-locked',{status:unknown.status});
  await request('stock_buyer','/testing/payments/outcome',{body:{record_id:state.payment_id,state:'SUCCEEDED'}});
  phase='web-recover-original-payment';
  if(await buyer.getByRole('button',{name:'先核对原记录',exact:true}).count()){
   await buyer.getByRole('button',{name:'先核对原记录',exact:true}).click();
   await post(buyer,`/trade/payments/${state.payment_id}/reconciliation`,()=>buyer.getByRole('button',{name:'使用原编号重试',exact:true}).click());
  }else{
   await go(buyer,'/trade/payments/'+state.payment_id);await post(buyer,`/trade/payments/${state.payment_id}/reconciliation`,()=>buyer.getByRole('button',{name:'核实支付结果',exact:true}).click());
  }
  const paid=(await request('stock_buyer','/trade/records/'+orderId)).data;assert.equal(paid.current_status,'PAID');assert.equal(paid.data.financial.received_minor,state.amount_minor);
  const payments=(await request('stock_buyer','/trade/records?kind=PAYMENT')).data.items.filter(p=>p.order_id===orderId);assert.equal(payments.length,1);assert.equal(payments[0].id,state.payment_id);
  const retries=state.requests.filter(x=>x.source==='browser'&&x.path===`/api/v1/trade/payments/${state.payment_id}/reconciliation`);assert.equal(retries.length,2);assert.equal(retries[0].key_sha256,retries[1].key_sha256);assert.equal(retries[0].body_sha256,retries[1].body_sha256);
  state.paid=true;await done('web-recovered-same-payment-key-and-body-no-second-payment');
 }
 if(!state.downloaded){
  phase='same-file-download';const purchase=(await request('stock_buyer',`/stock/purchases/${orderId}`)).data;
  const listing=(await request('stock_seller','/stock/listings/'+purchase.listing_id)).data;
  const expected=listing.data.files.full_sha256;assert.match(expected,/^[a-f0-9]{64}$/);
  const file=await request('stock_buyer',`/stock/purchases/${orderId}/content`);assert.equal(sha(file.bytes),expected);
  await request('stock_outsider',`/stock/purchases/${orderId}/content`,{allowed:[403,404]});
  await go(buyer,'/stock/purchases/'+orderId);const response=buyer.waitForResponse(r=>r.request().method()==='GET'&&r.url().endsWith(`/stock/purchases/${orderId}/content`));await buyer.getByRole('button',{name:'明确取得正式影片',exact:true}).click();const r=await response;assert.equal(r.status(),200);assert.equal(sha(await r.body()),expected);await buyer.screenshot({path:join(out,attempt+'-web-purchased-file.png'),fullPage:true});
  const customer=await app('/stock/purchase?orderId='+orderId),button=customer.getByRole('button',{name:'受控播放已购作品',exact:true});await seek(customer,button);const content=customer.waitForResponse(r=>r.request().method()==='GET'&&r.url().endsWith(`/stock/purchases/${orderId}/content`));await button.click();const ar=await content;assert.equal(ar.status(),200);assert.equal(sha(await ar.body()),expected);await customer.screenshot({path:join(out,attempt+'-app-purchased-file.png')});
  state.downloaded=true;state.file_sha256=expected;state.file_bytes=file.bytes.length;await done('api-vue-flutter-web-read-same-file-and-foreign-account-denied',{sha256:expected,bytes:file.bytes.length});
 }
 state.completed=true;await save();await writeFile(join(out,attempt+'-result.json'),JSON.stringify({result:'PASS',...state,limits:['Synthetic provider receipts, no real payment','Flutter Web browser, not Android device or operating-system save','This segment ends at paid file read; aftercare and formal E2E completion remain separate']},null,2));console.log(JSON.stringify({result:'PASS',order_id:orderId,payment_id:state.payment_id,checks:state.checks}));
}catch(e){await save();for(let n=0;n<pages.length;n++){await pages[n].screenshot({path:join(out,attempt+'-failure-'+n+'.png'),fullPage:true}).catch(()=>{});await writeFile(join(out,attempt+'-failure-'+n+'.txt'),await pages[n].locator('body').innerText().catch(()=>''));}await writeFile(join(out,attempt+'-failure.json'),JSON.stringify({phase,error:e.message,state},null,2));console.error(phase+': '+e.message);process.exitCode=1;}finally{await browser.close();}
