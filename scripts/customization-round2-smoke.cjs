 'use strict';
// Run against a fresh customization-sandbox only; never against deployed services.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
require('../晶晶日上工程交接包/01_源码/backend_server/scripts/test-network-guard.cjs');
const root=path.resolve(__dirname,'..'),allowed=fs.realpathSync(path.join(root,'.local/customization-sandbox'));
const folder=fs.realpathSync(path.resolve(root,process.argv[2]||''));
if(path.dirname(folder)!==allowed||!/^jx_test_story_[a-z0-9_]+$/.test(path.basename(folder)))throw Error('Use the folder returned by customization-sandbox');
const a=JSON.parse(fs.readFileSync(path.join(folder,'access.json'),'utf8')),status=JSON.parse(fs.readFileSync(path.join(folder,'status.json'),'utf8')),url=new URL(a.base_url);
assert.equal(a.synthetic_only,true);assert.equal(status.synthetic_only,true);assert.equal(status.status,'RUNNING');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.protocol,'http:');assert.equal(Number(url.port),status.port);
const checks=[],out=path.join(root,'.local/v5-r02-close/full-chain.json');
function ok(name,value){assert.ok(value,name);checks.push(name);}
async function call(method,route,who,body,party,version,key=randomUUID()){
 const acct=a.accounts[who];const r=await fetch(a.base_url+route,{method,signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+acct.bearer_token,...(party?{'X-Acting-Party':party}:{}),...(body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':key}),...(version?{'If-Match':'"'+version+'"'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};
}
function take(r){assert.equal(r.status,200,JSON.stringify(r.body));return r.body.data;}
(async()=>{try{
 const buyer=a.accounts.buyer.party_id,merchant=a.trade.merchant_party_id;
 let story=take(await call('POST','/customization-requests','buyer',{template_version_id:a.templates.family,answers:{story:'仅合成故事：第一版',tone:'温暖'}},buyer));
 const original=story.id;story=take(await call('GET','/customization-requests/'+original,'buyer',undefined,buyer));ok('用户保存后可以找回草稿',story.current_status==='DRAFT');
 story=take(await call('POST','/customization-requests/'+original+'/submissions','buyer',{},buyer,story.object_version));const first=story.submission.id;ok('正式提交保留第一版',Boolean(first));
 story=take(await call('POST','/operations/customization-requests/'+original+'/intake','operator',{},null,story.object_version));ok('运营受理同一份需求',story.id===original);
 const issue=take(await call('POST','/operations/customization-requests/'+original+'/supplements','operator',{items:[{field_key:'story',reason:'仅测试：请补时间线',instruction:'补充结尾并回复'}]},null,story.object_version));
 ok('运营能明确列出缺项',issue.items?.length===1||issue.supplement?.items?.length===1);
 let card=take(await call('GET','/customization-requests/'+original+'/supplement','buyer',undefined,buyer));
 let saved=take(await call('PATCH','/customization-requests/'+original+'/supplement','buyer',{answers:{story:'仅合成故事：补充结尾',tone:'温暖'},responses:{story:'已补充结尾'}},buyer,card.object_version));
 ok('补件草稿可保存',Boolean(saved.object_version));
 let denied=await call('GET','/customization-requests/'+original,'outsider',undefined,a.accounts.outsider.party_id);ok('其他买家看不到故事',denied.status===404);
 take(await call('POST','/customization-requests/'+original+'/supplement-submissions','buyer',{},buyer,saved.object_version));
 story=take(await call('GET','/customization-requests/'+original,'buyer',undefined,buyer));ok('补件形成新提交版本',story.submission.id!==first);
 story=take(await call('POST','/operations/customization-requests/'+original+'/intake','operator',{},null,story.object_version));
 const history=take(await call('GET','/customization-requests/'+original+'/submissions','buyer',undefined,buyer));ok('新旧正式版本都可追溯',history.items.length===2);
 const seed=take(await call('GET','/trade/records/'+a.trade.quote_id,'merchant',undefined,merchant));
 const body={buyer_party_id:buyer,lines:[{line_id:'production',spec_id:a.trade.specification_id,quantity:1}],installments:seed.data.installments,channel:seed.data.channel,transaction_model:seed.data.transaction_model,rule_id:a.trade.rule_id,expires_at:new Date(Date.now()+1800000).toISOString(),payment_window_minutes:30,license_reservation_id:null,customization_source:{request_id:original,submission_id:story.submission.id,content_sha256:story.submission.content_sha256}};
 let quote=take(await call('POST','/trade/quotes','merchant',body,merchant));ok('平台按补件后的版本报价',quote.data.customization.submission_id===story.submission.id);
 denied=await call('POST','/trade/records/'+quote.id+'/reviews','operator',{decision:'APPROVED',reason:'test'},null,quote.object_version);ok('受理权限不能冒充报价复核',denied.status===403);
 denied=await call('POST','/trade/quotes/'+quote.id+'/acceptance','buyer',{quote_sha256:quote.content_sha256},buyer,quote.object_version);ok('未复核报价不能确认',denied.status===409);
 quote=take(await call('POST','/trade/records/'+quote.id+'/reviews','reviewer',{decision:'APPROVED',reason:'合成独立复核'},null,quote.object_version));
 ok('独立复核通过后才可确认',quote.current_status==='APPROVED');
 const k=randomUUID(),accept=()=>call('POST','/trade/quotes/'+quote.id+'/acceptance','buyer',{quote_sha256:quote.content_sha256},buyer,quote.object_version,k);
 const [one,two]=await Promise.all([accept(),accept()]);const order=take(one);ok('并发重复确认只有一个订单',take(two).id===order.id);
 ok('订单仍未付款未签署',order.current_status==='OPEN'&&order.data.financial.received_minor===0&&order.data.contract.signing_method==='NOT_SIGNED');
 ok('订单保留补件后的故事依据',order.data.quote.customization.submission_id===story.submission.id);
 ok('订单固定商品类型与财务原文',order.data.quote.lines[0].product_profile.type==='PRIVATE_CUSTOMIZATION'&&order.data.contract.rule_contents[0].content_sha256===order.data.quote.customization_finance.rule_snapshot.content.content_sha256);
 const list=take(await call('GET','/customization-requests/'+original+'/quotes','buyer',undefined,buyer));ok('从原需求可找到报价和订单',list.items.some(x=>x.order_id===order.id));
 denied=await call('POST','/trade/payments','buyer',{order_id:order.id,installment_key:'first'},buyer);ok('合成资料工具没有付款入口',denied.status===403&&denied.body.error.code==='LOCAL_FIXTURE_ROUTE_DISABLED');
 const person=take(await call('GET','/parties/'+buyer,'buyer',undefined,buyer));ok('我的页面能刷新当前本人身份',Boolean(person));
 const previewPath='/finance/marketplace-preview?'+new URLSearchParams(a.finance_preview).toString();const preview=take(await call('GET',previewPath,'reviewer'));
 ok('财务复核人能读取只读试算',preview.meaning==='PREVIEW_ONLY_NOT_ORDER_OR_PAYABLE');
 denied=await call('GET',previewPath,'outsider');ok('普通买家不能冒充财务复核人',denied.status===403);
 const report={result:'PASS',checks:checks.length,scenarios:checks,synthetic_only:true,page_testing:'NOT_RUN',real_payment:'NOT_RUN'};fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }finally{fs.writeFileSync(path.join(folder,'stop'),'stop');}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
