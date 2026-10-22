#!/usr/bin/env node
// Explicit browser actions on the disposable loopback fixture; never product credentials.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
const f=JSON.parse(await readFile(process.env.V5_ACCESS_FILE,'utf8'));
assert(f.synthetic_only&&new URL(f.base_url).hostname==='127.0.0.1');
const phase=process.env.V5_APP_PHASE||'business';assert(['business','cross','conversation-readback','coupon-cancel'].includes(phase));
const out=resolve('output/playwright/v5-r05-r12/app');await mkdir(out,{recursive:true});
const {chromium}=createRequire(join(process.cwd(),'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core');
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const secrets=Object.values(f.accounts).map(a=>a.bearer_token),redact=v=>secrets.reduce((s,t)=>s.replaceAll(t,'[redacted]'),String(v));
const hash=v=>createHash('sha256').update(v||'').digest('hex');
const checks=[],screenshots=[],network=[],writes=[],errors=[],created={};let context,page,failure;
const check=(name,test=true)=>{assert(test,name);checks.push({name,result:'PASS'});console.log('PASS '+name);};
async function api(path,role){const a=f.accounts[role],r=await fetch(f.base_url+path,{headers:{Authorization:'Bearer '+a.bearer_token,'X-Acting-Party':a.party_id},signal:AbortSignal.timeout(10000)});assert(r.ok,path+' '+r.status);return(await r.json()).data;}
async function open(route,role){if(context)await context.close();context=await browser.newContext({locale:'zh-CN',viewport:{width:390,height:844},acceptDownloads:true});page=await context.newPage();page.setDefaultTimeout(15000);
 page.on('pageerror',e=>errors.push(redact(e.message)));page.on('console',m=>{if(/RenderFlex.*overflow|overflowed by|EXCEPTION CAUGHT/.test(m.text()))errors.push(redact(m.text()));});
 page.on('request',r=>{if(!r.url().startsWith(f.base_url)||['GET','OPTIONS'].includes(r.method()))return;writes.push({path:new URL(r.url()).pathname,method:r.method(),body_sha256:hash(r.postData()),key_sha256:hash(r.headers()['idempotency-key']),version:r.headers()['if-match']});});
 page.on('response',r=>{if(r.url().startsWith(f.base_url))network.push({role,path:new URL(r.url()).pathname,method:r.request().method(),status:r.status()});});
 await page.goto(`http://127.0.0.1:5500/?fixtureRole=${role}#${route}`);await page.locator('flt-semantics-placeholder').waitFor({state:'attached'});await page.locator('flt-semantics-placeholder').evaluate(e=>e.click());await page.getByRole('heading').first().waitFor();await page.waitForLoadState('networkidle');await page.waitForTimeout(150);
}
const button=name=>page.getByRole('button',{name,exact:true});
async function reveal(target){for(let n=0;n<70;n++){const b=await target.count()?await target.first().boundingBox():null;if(b&&b.y+b.height/2>58&&b.y+b.height/2<834)return b;await page.mouse.move(190,410);await page.mouse.wheel(0,b?.y<58?-320:320);await page.waitForTimeout(65);}throw Error('Control not visible: '+await target.toString());}
async function press(target){const b=await reveal(target);await page.mouse.click(b.x+b.width/2,b.y+b.height/2);await page.waitForTimeout(180);}
async function fill(label,value){const t=page.getByRole('textbox',{name:label,exact:true});await press(t);await page.keyboard.press('Meta+A');await page.keyboard.type(value,{delay:1});await page.keyboard.press('Tab');}
async function shot(name,source,note=''){await page.waitForLoadState('networkidle');await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});await page.waitForTimeout(500);const file=name+'.png';await page.screenshot({path:join(out,file)});screenshots.push({file,route:new URL(page.url()).hash.slice(1),source,note,width:390,height:844,sha256:hash(await readFile(join(out,file)))});}
async function confirm(name='确认办理'){await page.getByRole('alertdialog').waitFor();await press(button(name));await page.waitForLoadState('networkidle');}
async function signer(id,role,income=false){await open(`/projects/${income?'income':'participation'}?view=agreement&recordId=${id}`,role);const before=await api('/projects/records/'+id,role),confirmed=(await api('/projects/records/'+id+'/confirmations',role)).items.some(c=>c.party_id===f.accounts[role].party_id&&c.decision==='APPROVED'&&c.content_sha256===before.content_sha256);if(confirmed){check(`${income?'发行':'参演'} ${role} 原会签仍可独立读取`);await shot('action-'+(income?'income':'participation')+'-'+role,'38-custom-extra.png');return;}await fill('本人会签意见','本人已核对隔离原约定、金额、权利及本次版本');await press(page.getByRole('checkbox',{name:'我已阅读全部原条款、金额、分成及变更影响，确认这一份版本',exact:true}));await press(button('本人同意本次约定'));await page.waitForLoadState('networkidle');const r=await api('/projects/records/'+id,role),cs=await api('/projects/records/'+id+'/confirmations',role);check(`${income?'发行':'参演'} ${role} 独立会签后读取原文证据`,cs.items.some(c=>c.party_id===f.accounts[role].party_id&&c.decision==='APPROVED'&&c.content_sha256===r.content_sha256));await shot('action-'+(income?'income':'participation')+'-'+role,'38-custom-extra.png');}
try{
 const s=f.scenarios;
 const chosen=(process.env.V5_APP_ACTIONS||'stock,coupon,lottery,participation,conversation').split(',');
 if(phase==='business'){
  if(chosen.includes('stock')) {
  const stockKey=process.env.V5_APP_STOCK_SCENARIO||'stock_paid',stock=s[stockKey];assert(stock?.order_id);
  await open('/stock/purchase?orderId='+stock.order_id,'stock_buyer');
  await reveal(button('确认本次交付通知已读'));const unreadDisabled=await button('确认本次交付通知已读').isDisabled();await reveal(button('明确确认本次文件已收到'));check('未播放时通知与收件不可办理',unreadDisabled&&await button('明确确认本次文件已收到').isDisabled());
  await press(button('受控播放已购作品'));await button('暂停预览').waitFor();await page.waitForTimeout(250);
  check('现货私有MP4在App实际解码播放',await page.locator('video').evaluateAll(v=>v.some(x=>x.readyState>=2&&x.currentTime>0)));await shot('action-'+stockKey+'-playing','12-artist-stock-producer.png','合成色条，只证明受控文件接线和实际解码');
  await press(button('确认本次交付通知已读'));await page.waitForLoadState('networkidle');await press(button('明确确认本次文件已收到'));await confirm();
  let p=await api('/stock/purchases/'+stock.order_id,'stock_buyer');check('明确收件是服务器实际记录',!!p.data.receipt_at);await shot('action-'+stockKey+'-receipt','39-story-top.png');
  await press(button('确认本次个人许可交付'));await confirm();p=await api('/stock/purchases/'+stock.order_id,'stock_buyer');check('个人许可明确验收保留原合同',!!p.data.accepted_at&&p.data.acceptance_method==='BUYER_EXPLICIT');await shot('action-'+stockKey+'-accepted','39-story-top.png');
  }
  if(chosen.includes('coupon')) {
  const quoteState=await api('/trade/records/'+s.full_coupon.quote_id,'buyer');
  if(quoteState.current_status==='ACCEPTED'){const order=await api('/trade/records/'+quoteState.data.order_id,'buyer');created.full_coupon_order_id=order.id;check('再次独立读取原已形成全额权益订单',order.current_status==='REWARD_FUNDED'&&order.data.quote.total_minor===0&&order.data.quote.installments.length===0&&order.data.financial.received_minor===0);await open('/trade/record?recordId='+order.id,'buyer');await shot('action-full-coupon-order','34-orders-top.png','原App动作已形成订单，本次只读核对；无现金节点。');}
  else {
  await open('/trade/record?recordId='+s.full_coupon.quote_id,'buyer');await press(button('选择可用制作权益'));
  const grants=(await api('/redemption/grants','buyer')).items.filter(r=>['PRODUCTION_CREDIT','PRODUCTION_FREE','SERVICE_CREDIT'].includes(r.data.template.kind)),index=grants.findIndex(r=>r.id===s.full_coupon.grant_id);assert(index>=0);
  await press(button('选择此权益并核对抵扣').nth(index));await press(button('读取并暂时占用这份权益'));await page.waitForLoadState('networkidle');await shot('action-full-coupon-preview','32-wallet-top.png');
  await press(page.getByRole('checkbox',{name:'我已核对原价、抵扣、应付现金和本次新分期',exact:true}));await press(button('采用本次抵扣，返回原报价确认'));await press(button('确认报价形成订单'));
  const accepted=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/trade/quotes/'+s.full_coupon.quote_id+'/acceptance'));accepted.catch(()=>{});await confirm();const response=await accepted;assert(response.ok());const order=(await response.json()).data;
  check('全额券在原报价生成真实REWARD_FUNDED订单',order.current_status==='REWARD_FUNDED'&&order.data.quote.total_minor===0&&order.data.quote.installments.length===0&&order.data.financial.received_minor===0);created.full_coupon_order_id=order.id;await shot('action-full-coupon-order','34-orders-top.png','全额权益无现金节点和虚构支付回执');
  }
  }
  if(chosen.includes('lottery')) {
  await open('/redemption?view=pool&recordId='+s.lottery.pool_id,'buyer');await press(page.getByRole('checkbox',{name:'我已核对本次条款、实际概率、扣用晶钻及库存不足处理',exact:true}));await press(button('按本次规则单抽'));const drawn=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/redemption/draws'));drawn.catch(()=>{});await confirm('确认本次操作');const dr=await drawn;assert(dr.ok());const draw=(await dr.json()).data;created.draw_id=draw.id;check('App按实际已审核奖池完成单抽',!!draw.id);await shot('action-lottery-result','32-wallet-top.png');
  }
  if(chosen.includes('participation')) {
  const agreement=await api('/projects/records/'+s.participation.agreement_id,'buyer');
  for(const confirmer of agreement.data.confirmers){const role=['artist','buyer','producer'].find(k=>f.accounts[k].party_id===confirmer.party_id);assert(role,'Actual confirmer must have an isolated identity');await signer(s.participation.agreement_id,role);}
  await open(`/trade/participation-checkout?agreementId=${s.participation.agreement_id}&agreementSha256=${s.participation.agreement_sha256}`,'buyer');
  await press(button('按原约定建立付款订单'));const checkout=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/trade/participation-checkout'));checkout.catch(()=>{});await confirm();const cr=await checkout;assert(cr.ok());const po=(await cr.json()).data;created.participation_order_id=po.id;check('会签参演实际生成原现金节点且未付款',po.current_status==='OPEN'&&po.data.quote.total_minor===10000&&po.data.financial.received_minor===0);await shot('action-participation-order','34-orders-top.png');
  }
  if(chosen.includes('conversation')) {
  await open('/gigs/conversation?orderId='+s.commercial.order_id,'notices_buyer');
  await press(page.getByRole('button',{name:/本次消息类型/}));await page.keyboard.press('Home');await page.keyboard.press('Enter');await page.waitForTimeout(120);await fill('仅本单业务文字（附件或订单卡可留空）','隔离跨端会话：请核对这一笔已付款商单的原约定');
  await press(button('发送本单商业消息'));await confirm();const msgs=await api(`/gigs/orders/${s.commercial.order_id}/conversation/messages`,'notices_buyer');
  check('商单App文字实际入同一订单会话',msgs.items.some(m=>m.data?.body==='隔离跨端会话：请核对这一笔已付款商单的原约定'));created.commercial_order_id=s.commercial.order_id;created.commercial_message_id=msgs.items.find(m=>m.data?.body==='隔离跨端会话：请核对这一笔已付款商单的原约定').id;await shot('action-commercial-message','25-messages-top.png');
  }
  if(chosen.includes('support')) {
  await open('/gigs/conversation?orderId='+s.commercial.order_id,'notices_buyer');
  await fill('需要客服协助的本单问题','隔离验收：请求独立客服核对本单消息和暂停处理');
  await press(button('请求平台客服加入本单'));await confirm();
  const current=await api(`/gigs/orders/${s.commercial.order_id}/conversation/messages`,'notices_buyer');
  check('本人明确申请客服加入原商单',current.support_requested===true);created.commercial_order_id=s.commercial.order_id;await shot('action-commercial-support-request','25-messages-top.png');
 }
 }
 if(phase==='cross'){
  const ids=JSON.parse(await readFile('output/playwright/v5-r05-r12/web/CROSS_TO_APP.json','utf8'));
  for(const[name,role,route,path]of[
   ['notice-case','notices_seller','/notices/record?recordId='+ids.notice_case_id,'/notices/records/'+ids.notice_case_id],
   ['privacy','buyer','/privacy?view=request&recordId='+ids.privacy_request_id,'/privacy/requests/'+ids.privacy_request_id],
   ['mcn-accepted','mcn_staff','/auditions/booking?bookingId='+ids.mcn_booking_id,'/auditions/records/'+ids.mcn_booking_id]]){
   await open(route,role);check('Web到App同记录 '+name,network.some(n=>n.role===role&&n.path==='/api/v1'+path&&n.status===200));await shot('cross-'+name,name==='mcn-accepted'?'21-audition-top.png':'40-states-a-top.png','同一旧会话50143内Web实际办理记录');
  }
  await signer(ids.income_agreement_id,'buyer',true);await signer(ids.income_agreement_id,'producer',true);created.income_agreement_id=ids.income_agreement_id;
 }
 if(phase==='conversation-readback'){
  await open('/gigs/conversation?orderId='+s.commercial.order_id,'notices_buyer');const c=await api(`/gigs/orders/${s.commercial.order_id}/conversation/messages`,'notices_buyer');
  check('独立客服冻结后App读取真实状态',c.status==='FROZEN');await reveal(button('发送本单商业消息'));check('冻结会话不再允许发送',await button('发送本单商业消息').isDisabled());check('隐藏消息不再返回原文或附件',c.items.filter(m=>m.current_status==='HIDDEN').length>0&&c.items.filter(m=>m.current_status==='HIDDEN').every(m=>m.data.body===null&&!m.data.asset));await shot('cross-commercial-frozen','25-messages-top.png');
 }
 if(phase==='coupon-cancel'){
  const quote=await api('/trade/records/'+s.full_coupon.quote_id,'buyer');assert(quote.data.order_id);
  await open('/trade/record?recordId='+quote.data.order_id,'buyer');
  await press(button('取消订单并释放制作权益'));await fill('请填写取消理由','隔离验收：本单未开工且无现金收款，明确取消并释放本人的制作权益');await press(button('核对取消'));await confirm();
  const order=await api('/trade/records/'+quote.data.order_id,'buyer'),grant=await api('/redemption/grants/'+s.full_coupon.grant_id,'buyer');
  check('App真实取消未开工全额权益订单',order.current_status==='CANCELLED'&&order.data.financial.received_minor===0);
  check('取消后原权益真实释放且没有现金退款',grant.current_status==='AVAILABLE'&&grant.data.checkout_hold_id===null&&order.data.financial.refunded_minor===0);created.cancelled_order_id=order.id;await shot('action-full-coupon-cancelled','35-orders-aftercare.png');
 }
}catch(e){failure=redact(e.stack||e.message);process.exitCode=1;if(page)await shot('failure-'+phase,'40-states-a-top.png',failure).catch(()=>{});}
if(context)await context.close();await browser.close();
const report={result:failure||errors.length?'FAIL':'PASS',phase,synthetic_only:true,base_url:f.base_url,checks,screenshots,network,writes,created,errors,failure};const json=JSON.stringify(report,null,2);for(const t of secrets)assert(!json.includes(t));await writeFile(join(out,'APP_ACTIONS_'+phase.toUpperCase()+(process.env.V5_APP_ACTIONS?'_'+process.env.V5_APP_ACTIONS.replaceAll(',','_'):'')+'.json'),json+'\n');console.log(JSON.stringify({result:report.result,checks:checks.length,shots:screenshots.length,created,failure}));
