// Isolated real API/MySQL + Vue checks. External transports remain synthetic.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=createRequire(resolve(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core');
const state=JSON.parse(await readFile(resolve(root,'.local/pr20-ui-runtime.json'),'utf8'));
assert(state.testOnly&&state.syntheticOnly&&state.scenarios.fullFlow);
const base='http://127.0.0.1:5211';
for(const u of [base,state.apiUrl,state.controlUrl])assert.equal(new URL(u).hostname,'127.0.0.1');
const out=resolve(root,'docs/testing/evidence/20261005/risks');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
const results=[],errors=[],actors={},writes=[],facts={};let active,failure;
const redact=v=>[state.controlToken,...Object.values(actors).map(x=>x.token)].filter(Boolean).reduce((s,key)=>s.replaceAll(key,'[redacted]'),String(v));
const control=async(path,method='POST')=>{const r=await fetch(state.controlUrl+path,{method,headers:{Authorization:'Bearer '+state.controlToken},signal:AbortSignal.timeout(10000)});assert.equal(r.status,200);return r.json();};
const button=(p,name)=>p.getByRole('button',{name,exact:true});
function response(p,method,path){const wait=p.waitForResponse(r=>r.request().method()===method&&new URL(r.url()).pathname==='/api/v1'+path);wait.catch(()=>{});return wait;}
async function value(reply,status=200){assert.equal(reply.status(),status);const body=await reply.json();return status===200?body.data:body.error;}
async function check(name,fn){console.log('CHECK '+name);try{await fn();results.push({name,status:'PASS'});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',error:redact(e.message)});throw e;}}
async function go(p,path){active=p;await p.goto(base+path);await p.locator('.workspace-nav').waitFor();await p.getByRole('heading',{level:1}).waitFor();await p.getByText(/^正在读取身份与(?:交易|制作)记录…$/).waitFor({state:'hidden'});}
async function shot(p,name){await p.screenshot({path:resolve(out,name+'.png'),fullPage:true});}
async function login(name){const person=state.accounts[name],context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'}),p=active=await context.newPage();p.setDefaultTimeout(15000);
 p.on('pageerror',e=>errors.push(redact(e.message)));p.on('request',r=>{const path=new URL(r.url()).pathname;if(r.method()==='POST'&&path.startsWith('/api/v1/trade/'))writes.push({actor:name,path,key:r.headers()['idempotency-key'],version:r.headers()['if-match']||null,body:r.postData()});});
 await p.goto(base+'/login');await p.getByTestId('phone-input').fill(person.phone);const sent=response(p,'POST','/auth/sms-challenges');await p.getByTestId('send-code').click();await value(await sent);
 await p.getByTestId('code-input').fill((await control('/code?phone='+person.phone,'GET')).code);await p.getByTestId('submit-login').click();await p.waitForURL(u=>u.pathname==='/workspace');await p.locator(`[data-party="${person.actingPartyId}"]`).click();
 const token=await p.evaluate(()=>sessionStorage.getItem('ops.session.token'));assert(token);return actors[name]={...person,token,p};
}
async function api(actor,method,path,{body,version,key=randomUUID(),status=200}={}){const r=await fetch(state.apiUrl+'/api/v1'+path,{method,signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+actor.token,'X-Acting-Party':actor.actingPartyId,'Content-Type':'application/json','Idempotency-Key':key,...(version===undefined?{}:{'If-Match':`"${version}"`})},...(body===undefined?{}:{body:JSON.stringify(body)})});const b=await r.json();assert.equal(r.status,status,`${method} ${path}: ${r.status} ${b.error?.code||''}`);return status===200?b.data:b.error;}
const clickPost=async(p,label,path,status=200)=>{const r=response(p,'POST',path);await button(p,label).click();return value(await r,status);};
const originalReplay=async(p,path)=>{await button(p,'先核对原记录').click();const r=response(p,'POST',path);await button(p,'使用原编号重试').click();return value(await r);};
const sameWrites=path=>{const seen=writes.filter(x=>x.path==='/api/v1'+path);assert.equal(seen.length,2);assert.deepEqual(seen[0],seen[1]);};
try{
 const buyer=await login('payer'),reviewer=await login('independentReviewer'),outsider=await login('outsider');const p=buyer.p,rp=reviewer.p;
 const unpaid=state.scenarios.fullFlow.journeys.find(x=>x.stop==='unpaid');let payment,refund;
 await check('付款创建已成功但回复丢失：只恢复原请求，不生成第二笔',async()=>{
  await go(p,'/trade/payments/new');await p.getByTestId('trade-order-id').fill(unpaid.orderId);await button(p,'读取原订单').click();await p.getByTestId('trade-installment').selectOption('first');
  await control('/response-loss?operation=payment&mode=503');await clickPost(p,'建立本期付款记录','/trade/payments',503);
  await button(p,'先核对原记录').waitFor();assert(await button(p,'建立本期付款记录').isDisabled());await shot(p,'payment-reply-lost');
  payment=await originalReplay(p,'/trade/payments');sameWrites('/trade/payments');assert.equal(payment.current_status,'PENDING');
  await p.waitForURL('**/trade/payments/'+payment.id);const s=await control('/state','GET');assert.equal(s.allRecords.filter(x=>x.kind==='PAYMENT'&&x.orderId===unpaid.orderId).length,1);
  facts.paymentId=payment.id;facts.orderId=unpaid.orderId;
 });
 await check('支付查询超时：不显示到账、不允许取消；原请求重试后只入账一次',async()=>{
  await control(`/payment-query?payment_id=${payment.id}&result=TIMEOUT`);await clickPost(p,'核实支付结果',`/trade/payments/${payment.id}/reconciliation`,503);
  let order=await api(buyer,'GET','/trade/records/'+unpaid.orderId);assert.equal(order.data.financial.received_minor,0);
  await api(buyer,'POST',`/trade/orders/${order.id}/cancellation`,{body:{reason:'仅隔离测试：未知付款禁止取消'},version:order.object_version,status:409});await shot(p,'payment-query-timeout');
  await control(`/payment-query?payment_id=${payment.id}&result=SUCCEEDED`);payment=await originalReplay(p,`/trade/payments/${payment.id}/reconciliation`);assert.equal(payment.current_status,'SUCCEEDED');sameWrites(`/trade/payments/${payment.id}/reconciliation`);
  await clickPost(p,'核实支付结果',`/trade/payments/${payment.id}/reconciliation`);order=await api(buyer,'GET','/trade/records/'+unpaid.orderId);assert.equal(order.data.financial.received_minor,5500);
  await api(buyer,'POST','/trade/payments',{body:{order_id:order.id,installment_key:'first'},status:409});facts.receivedMinor=5500;await shot(p,'payment-verified-once');
 });
 await check('退款申请回复丢失：恢复同一申请，未审核不能执行，不能退超原付款',async()=>{
  await go(p,'/trade/refunds/new');await p.getByTestId('trade-refund-payment').selectOption(payment.id);await button(p,'读取原付款与明细').click();
  await p.getByLabel(/^退款金额（人民币分）/).first().fill('100');await p.getByLabel(/^本次退款原因/).fill('仅模拟部分退款，不发生真实资金变动');
  await control('/response-loss?operation=refund&mode=503');await clickPost(p,'提交退款申请','/trade/refunds',503);refund=await originalReplay(p,'/trade/refunds');sameWrites('/trade/refunds');assert.equal(refund.current_status,'REQUESTED');
  const notApproved=await api(reviewer,'POST',`/trade/refunds/${refund.id}/execution`,{body:{},version:refund.object_version});assert.equal(notApproved.current_status,'REQUESTED');
  assert.equal((await control('/state','GET')).providerCalls.filter(x=>x.method==='alipay.trade.refund'&&x.refundId===refund.id).length,0);
  await api(buyer,'POST','/trade/refunds',{body:{payment_id:payment.id,allocations:[{line_id:'film',amount_minor:4001}],reason:'仅模拟超额应被拒绝'},status:409});
  const s=await control('/state','GET');assert.equal(s.allRecords.filter(x=>x.kind==='REFUND'&&x.orderId===unpaid.orderId).length,1);facts.refundId=refund.id;
 });
 await check('审核员退款权限撤销后，旧页面与旧登录令牌不能继续操作',async()=>{
  await go(rp,'/trade/reviews/refunds/'+refund.id);await rp.getByRole('heading',{name:'本次退款申请',exact:true}).waitFor();
  await control('/reviewer-permission?action=TRADE_REFUND&enabled=false');const denied=response(rp,'GET','/trade/records/'+refund.id);await button(rp,'刷新当前记录').click();await value(await denied,403);
  await rp.getByRole('heading',{name:'本次退款申请',exact:true}).waitFor({state:'hidden'});assert.equal(await button(rp,'执行已审退款').count(),0);
  await api(reviewer,'POST',`/trade/records/${refund.id}/reviews`,{body:{decision:'APPROVED',reason:'应被拒绝'},version:refund.object_version,status:403});await shot(rp,'reviewer-permission-revoked');
  await control('/reviewer-permission?action=TRADE_REFUND&enabled=true');
 });
 await check('已批准退款执行后回复丢失：恢复原执行，不重复退款',async()=>{
  await go(rp,'/trade/reviews/refunds/'+refund.id);await rp.getByTestId('trade-review-decision').selectOption('APPROVED');await rp.getByTestId('trade-review-reason').fill('仅隔离资料独立核对');
  refund=await clickPost(rp,'提交独立审核',`/trade/records/${refund.id}/reviews`);assert.equal(refund.current_status,'APPROVED');await rp.getByLabel(/^我已核对已批准的原退款明细/).check();
  await control('/response-loss?operation=refundExecute&mode=503');await clickPost(rp,'执行已审退款',`/trade/refunds/${refund.id}/execution`,503);
  refund=await originalReplay(rp,`/trade/refunds/${refund.id}/execution`);sameWrites(`/trade/refunds/${refund.id}/execution`);assert.equal(refund.current_status,'PENDING');
  assert.equal((await control('/state','GET')).providerCalls.filter(x=>x.method==='alipay.trade.refund'&&x.refundId===refund.id).length,1);facts.refundProviderCalls=1;await shot(rp,'refund-execution-recovered');
 });
 await check('退款查询超时、到账核对及再次核对：实际退款合计仍为100分',async()=>{
  await go(p,'/trade/refunds/'+refund.id);await control(`/refund-query?refund_id=${refund.id}&result=TIMEOUT`);await clickPost(p,'核实已有退款结果',`/trade/refunds/${refund.id}/reconciliation`,503);
  assert.equal((await api(buyer,'GET','/trade/records/'+unpaid.orderId)).data.financial.refunded_minor,0);
  await control(`/refund-query?refund_id=${refund.id}&result=SUCCEEDED`);refund=await originalReplay(p,`/trade/refunds/${refund.id}/reconciliation`);sameWrites(`/trade/refunds/${refund.id}/reconciliation`);assert.equal(refund.current_status,'SUCCEEDED');
  await clickPost(p,'核实已有退款结果',`/trade/refunds/${refund.id}/reconciliation`);const order=await api(buyer,'GET','/trade/records/'+unpaid.orderId);assert.equal(order.data.financial.refunded_minor,100);assert.equal(order.data.financial.received_minor,5500);facts.refundedMinor=100;await shot(p,'refund-verified-once');
 });
 await check('负责人机构权限撤销后清空旧订单，恢复后可重新读取',async()=>{
  await go(p,'/trade/orders/'+unpaid.orderId);await p.getByText('订单履约详情',{exact:true}).waitFor();await control('/party-permission?account=payer&enabled=false');
  const denied=response(p,'GET','/trade/records/'+unpaid.orderId);await button(p,'刷新当前记录').click();await value(await denied,403);await p.getByText(unpaid.orderId,{exact:true}).first().waitFor({state:'detached'});
  await api(buyer,'GET','/trade/records/'+payment.id,{status:403});await shot(p,'owner-membership-revoked');await control('/party-permission?account=payer&enabled=true');
  await go(p,'/trade/orders/'+unpaid.orderId);await p.getByText(unpaid.orderId,{exact:true}).first().waitFor({state:'attached'});
 });
 await check('已验收但尾款未付时拒绝最终文件，无关用户始终无权读取',async()=>{
  const j=state.scenarios.fullFlow.journeys.find(x=>x.stop==='final-payment');
  const blocked=await api(buyer,'GET',`/production/versions/${j.versionId}/content?variant=final`,{status:409});assert.equal(blocked.code,'FINAL_DELIVERY_NOT_READY');
  await api(outsider,'GET',`/production/versions/${j.versionId}/content?variant=preview`,{status:404});facts.unpaidFinalVersionId=j.versionId;
 });
 await check('许可暂停后原私有样片不能继续读取，历史订单和许可仍保留',async()=>{
  const j=state.scenarios.fullFlow.journeys.find(x=>x.stop==='sample'),grantId=state.records.walksampleGrant.id;
  await go(p,'/production/versions/'+j.versionId);let content=response(p,'GET',`/production/versions/${j.versionId}/content`);await p.getByTestId('production-read-preview').click();assert.equal((await content).status(),200);
  await p.getByTestId('production-feedback-decision').selectOption('ACCEPT');await p.getByTestId('production-feedback-note').fill('仅模拟：先前读取后准备验收');
  for(const item of await p.getByRole('checkbox',{name:/我已核对/}).all())await item.check();
  assert(await p.getByTestId('production-feedback-submit').isEnabled());
  const grant=await api(buyer,'GET','/licensing/records/'+grantId);const suspended=await api(reviewer,'POST',`/licensing/grants/${grantId}/suspensions`,{body:{reason:'仅隔离测试：许可暂时停用'},version:grant.object_version});assert.equal(suspended.current_status,'SUSPENDED');
  content=response(p,'GET',`/production/versions/${j.versionId}/content`);await p.getByTestId('production-read-preview').click();const rejection=await value(await content,409);facts.suspendedLicenseCode=rejection.code;
  await p.locator('video').waitFor({state:'detached'});assert.equal(await p.getByText('已实际读取本版受控预览，请核对内容后作出决定。',{exact:true}).count(),0);assert(await p.getByTestId('production-feedback-submit').isDisabled());await shot(p,'license-suspended');
  assert.equal((await api(buyer,'GET','/trade/records/'+j.orderId)).id,j.orderId);assert.equal((await api(buyer,'GET','/licensing/records/'+grantId)).current_status,'SUSPENDED');
 });
 assert.deepEqual(errors,[]);
}catch(e){failure=redact(e.stack);console.error(failure);process.exitCode=1;if(active)await shot(active,'failure').catch(()=>{});}
finally{
 await control('/reviewer-permission?action=TRADE_REFUND&enabled=true').catch(()=>{});await control('/party-permission?account=payer&enabled=true').catch(()=>{});
 await writeFile(resolve(out,'results.json'),JSON.stringify({syntheticOnly:true,nativeAndroidRetest:false,complete:!failure,results,errors,facts,writes,failure},null,2)+'\n');await browser.close();
}
