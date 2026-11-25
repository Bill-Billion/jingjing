'use strict';
// One-time backend probe on a separate seed order. Leaves the joint order unpaid.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID:key,createHash}=require('node:crypto');
const root=process.cwd(),backend=path.join(root,'晶晶日上工程交接包/01_源码/backend_server');
require(path.join(backend,'scripts/test-network-guard.cjs'));
const hash=b=>createHash('sha256').update(b).digest('hex');
async function main(){
 const out=path.resolve(process.argv[2]);assert.equal(path.dirname(out),path.join(root,'.local/stock-sandbox'));
 assert.match(path.basename(out),/^jx_test_stock_pm03_[a-f0-9]{24}$/);assert.equal(await fs.realpath(out),out);
 const access=JSON.parse(await fs.readFile(path.join(out,'access.json'),'utf8'));
 const saved=JSON.parse(await fs.readFile(path.join(out,'pm04-joint-private.json'),'utf8'));
 assert.equal(access.mode,'BATCH');assert.equal(access.synthetic_only,true);assert(Date.parse(access.expires_at)>Date.now());
 assert.match(access.base_url,/^http:\/\/127\.0\.0\.1:\d+\/api\/v1$/);
 const resultFile=path.join(out,'pm04-money-check.json');
 try{await fs.access(resultFile);throw Error('ONE_TIME_PROBE_ALREADY_RECORDED');}catch(e){if(e.code!=='ENOENT')throw e;}
 const orderId=access.scenarios.stock_unpaid.order_id;assert.notEqual(orderId,saved.order_id);
 const events=[],operations=[];
 const transcript=path.join(out,'pm04-money-private.json');await fs.writeFile(transcript,'',{mode:0o600});
 await require(path.join(root,'scripts/test-fixtures/private-state.cjs')).protectPrivateState(transcript);
 async function call(method,route,role='stock_buyer',body,{operator=false,version,status=200,key:operationKey}={}){
  const u=saved.people[role],op=operationKey||key();
  if(body!==undefined){operations.push({method,route,role,body,version,operation_key:op});await fs.writeFile(transcript,JSON.stringify(operations,null,2));}
  const r=await fetch(access.base_url+route,{method,signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+u.token,...operator?{}:{'X-Acting-Party':u.party_id},...body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':op},...version===undefined?{}:{'If-Match':'"'+version+'"'}},...body===undefined?{}:{body:JSON.stringify(body)}});
  const bytes=Buffer.from(await r.arrayBuffer()),j=(r.headers.get('content-type')||'').includes('json')?JSON.parse(bytes.toString()):null;
  events.push({method,route,role,status:r.status,code:j?.error?.code});
  assert([].concat(status).includes(r.status),`${method} ${route}: ${r.status} ${j?.error?.code||''}`);
  return {data:j?.data,bytes,status:r.status};
 }
 const get=(route,role,operator=false)=>call('GET',route,role,undefined,{operator});
 const post=(route,role,body,options={})=>call('POST',route,role,body,options);
 const purchase='/stock/purchases/'+orderId;
 try{
  const original=(await get('/trade/records/'+orderId)).data;
  assert.equal(original.data.financial.received_minor,0);
  assert.equal(original.data.quote.marketplace_finance.allocation.platform_bps,1800);
  assert.equal(original.data.quote.marketplace_finance.allocation.rounding,'LARGEST_REMAINDER_PLATFORM_MAX_ONE_FEN');
  await call('GET',purchase+'/content','stock_buyer',undefined,{status:[403,404,409]});
  const start=(await post('/trade/payments','stock_buyer',{order_id:orderId,installment_key:'stock'})).data;
  const payment=start.payment||start.record||start;
  await post('/testing/payments/outcome','stock_outsider',{record_id:payment.id,state:'SUCCEEDED'},{status:[403,404]});
  await post('/testing/payments/outcome','stock_buyer',{record_id:payment.id,state:'UNKNOWN'});
  await post('/trade/payments/'+payment.id+'/reconciliation','stock_buyer',{transaction_id:null},{status:[200,503]});
  await call('GET',purchase+'/content','stock_buyer',undefined,{status:[403,404,409]});
  await post('/testing/payments/outcome','stock_buyer',{record_id:payment.id,state:'SUCCEEDED'});
  const reconciliationKey=key();
  await post('/trade/payments/'+payment.id+'/reconciliation','stock_buyer',{transaction_id:null},{key:reconciliationKey});
  await post('/trade/payments/'+payment.id+'/reconciliation','stock_buyer',{transaction_id:null},{key:reconciliationKey});
  const file=await get(purchase+'/content');assert.equal(file.bytes.toString('ascii',4,8),'ftyp');
  assert.equal(hash(file.bytes),hash(await fs.readFile(path.join(out,'samples/sample-1-full.mp4'))));
  let p=(await get(purchase)).data;
  p=(await post(purchase+'/cases','stock_buyer',{kind:'REFUND',reason:'Synthetic PM04 independent partial refund probe'},{version:p.object_version})).data;
  await call('GET',purchase+'/content','stock_buyer',undefined,{status:[403,404,409]});
  const decision={case_id:p.data.current_case_id,decision:'REFUND',refund_minor:40,license_action:'KEEP',reason:'Synthetic independent decision: 40 minor units; retain licence'};
  await post(purchase+'/case-resolution','stock_buyer',decision,{operator:true,version:p.object_version,status:[403,409]});
  await post(purchase+'/case-resolution','stock_reviewer',decision,{operator:true,version:p.object_version});
  let refund=(await post('/trade/refunds','stock_buyer',{payment_id:payment.id,allocations:[{line_id:'stock',amount_minor:40}],reason:'Synthetic approved partial amount'})).data;
  refund=(await post('/trade/records/'+refund.id+'/reviews','stock_reviewer',{decision:'APPROVED',reason:'Synthetic independent execution approval'},{operator:true,version:refund.object_version})).data;
  await post('/trade/refunds/'+refund.id+'/execution','stock_reviewer',{}, {operator:true});
  await call('GET',purchase+'/content','stock_buyer',undefined,{status:[403,404,409]});
  await post('/testing/payments/outcome','stock_buyer',{record_id:refund.id,state:'SUCCEEDED'});
  const refundKey=key();await post('/trade/refunds/'+refund.id+'/reconciliation','stock_buyer',{}, {key:refundKey});
  await post('/trade/refunds/'+refund.id+'/reconciliation','stock_buyer',{}, {key:refundKey});
  const current=(await get('/trade/records/'+orderId)).data;
  assert.deepEqual(current.data.financial,{received_minor:100,refunded_minor:40,net_minor:60});
  assert.deepEqual(current.data.contract,original.data.contract);
  assert.equal(hash((await get(purchase+'/content')).bytes),hash(file.bytes));
  const joint=(await get('/trade/records/'+saved.order_id)).data;
  assert.deepEqual(joint.data.financial,{received_minor:0,refunded_minor:0,net_minor:0});
  const result={status:'PASS',backend_revision:access.revision,source_sha256:access.source_sha256,checker_sha256:hash(await fs.readFile(__filename)),
   checked_at:new Date().toISOString(),synthetic_only:true,frontend_tested:false,control_order_id:orderId,payment_id:payment.id,refund_id:refund.id,
   joint_order_id:joint.id,joint_order_untouched:true,financial:current.data.financial,license_action:'KEEP',file_sha256:hash(file.bytes),events};
  await fs.writeFile(resultFile,JSON.stringify(result,null,2));console.log(JSON.stringify({status:'PASS',http_checks:events.length,control_order_id:orderId,joint_order_untouched:true}));
 }catch(e){await fs.writeFile(resultFile,JSON.stringify({status:'FAIL',error:e.message,events},null,2));throw e;}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
