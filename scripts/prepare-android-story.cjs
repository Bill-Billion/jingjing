"use strict";
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {protectPrivateState}=require('./test-fixtures/private-state.cjs');
(async()=>{
 const source=process.env.CUSTOMIZATION_ACCESS_FILE;
 if(!source) throw Error('FIXTURE_REQUIRED');
 const f=JSON.parse(await fs.readFile(source,'utf8')), url=new URL(f.base_url);
 if(f.synthetic_only!==true||url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.pathname!=='/api/v1'||url.username||url.password||url.search||url.hash) throw Error('ISOLATED_FIXTURE_REQUIRED');
 const reviewer=f.accounts.reviewer;
 const call=async(method,route,body,version)=>{
   const r=await fetch(f.base_url+route,{method,redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+reviewer.bearer_token,...(body?{'Content-Type':'application/json','Idempotency-Key':randomUUID(),'If-Match':'"'+version+'"'}:{})},...(body?{body:JSON.stringify(body)}:{})});
   if(!r.ok)throw Error('SYNTHETIC_REVIEW_HTTP_'+r.status);return (await r.json()).data;
 };
 let q=await call('GET','/trade/records/'+f.trade.quote_id);
 if(q.current_status==='IN_REVIEW') q=await call('POST','/trade/records/'+q.id+'/reviews',{decision:'APPROVED',reason:'仅本机安卓合成测试独立复核'},q.object_version);
 if(!['APPROVED','ACCEPTED'].includes(q.current_status))throw Error('QUOTE_NOT_APPROVED');
 const target=path.resolve(__dirname,'../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/.local/r01-browser-defines.json');
 const d=JSON.parse(await fs.readFile(target,'utf8'));
 if(d.R01_API_ORIGIN!==url.origin||d.R01_BUYER_ACCOUNT_ID!==f.accounts.buyer.account_id)throw Error('FIXTURE_MISMATCH');
 d.R01_QUOTE_ID=q.id;d.R01_QUOTE_REQUEST=f.requests.quote;
 await fs.writeFile(target,JSON.stringify(d),{mode:0o600});await protectPrivateState(target);
 console.log('本机合成报价可核对；已确认时重看原订单，不重复生成或付款。');
})().catch(e=>{console.error(/^[A-Z0-9_]+$/.test(e.message)?e.message:'ANDROID_STORY_PREPARE_FAILED', e.name, e.code || e.cause?.code || '');process.exitCode=1;});
