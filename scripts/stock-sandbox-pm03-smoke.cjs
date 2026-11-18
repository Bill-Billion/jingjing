'use strict';
// Real HTTP smoke of the backend handoff. Leaves records intact; no browser claims.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID:key,createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
require(path.join(root,'晶晶日上工程交接包/01_源码/backend_server/scripts/test-network-guard.cjs'));
async function main(){
  const verifyRetained=process.argv[3]==='--verify-retained';
  if(process.argv.length!==(verifyRetained?4:3))throw Error('Usage: node scripts/stock-sandbox-pm03-smoke.cjs .local/stock-sandbox/ENVIRONMENT [--verify-retained]');
  const out=path.resolve(process.argv[2]);
  assert.equal(path.dirname(out),path.join(root,'.local/stock-sandbox'));
  assert.match(path.basename(out),/^jx_test_stock_pm03_[a-f0-9]{24}$/);
  const access=JSON.parse(await fs.readFile(path.join(out,'access.json'),'utf8'));
  assert.equal(access.synthetic_only,true);assert.match(access.base_url,/^http:\/\/127\.0\.0\.1:[0-9]+\/api\/v1$/);
  assert.ok(Date.parse(access.expires_at)>Date.now());
  const checks=[],records={};
  const people=structuredClone(access.accounts);
  async function call(method,url,role,body,operator=false,version){
    const u=people[role],headers={};
    if(u?.token)headers.Authorization='Bearer '+u.token;
    if(u&&!operator)headers['X-Acting-Party']=u.party_id;
    if(body!==undefined){headers['Content-Type']='application/json';headers['Idempotency-Key']=key();}
    if(version)headers['If-Match']='"'+version+'"';
    const res=await fetch(access.base_url+url,{method,headers,...body===undefined?{}:{body:JSON.stringify(body)}});
    const value=(res.headers.get('content-type')||'').includes('json')?await res.json():{bytes:Buffer.from(await res.arrayBuffer())};
    return {status:res.status,...value};
  }
  function ok(r,label){assert.equal(r.status,200,label+': '+r.status+' '+(r.error?.code||''));return r.data;}
  function denied(r,label){assert.ok([401,403,404,409].includes(r.status),label+': '+r.status);}
  async function check(label,fn){await fn();checks.push(label);console.log('PASS '+label);}
  if(verifyRetained){
    const saved=JSON.parse(await fs.readFile(path.join(out,'smoke-access.json'),'utf8'));
    assert.equal(saved.source_sha256,access.source_sha256);Object.assign(people,saved.people);
    for(const [action,record] of Object.entries(saved.records).filter(([k])=>['KEEP','REVOKE'].includes(k))){
      const p=ok(await call('GET','/stock/purchases/'+record.order_id,'stock_buyer'),'retained order');
      assert.equal(p.data.status,record.status);
      const file=await call('GET','/stock/purchases/'+record.order_id+'/content','stock_buyer');
      if(action==='KEEP'){assert.equal(file.status,200);assert.equal(createHash('sha256').update(file.bytes).digest('hex'),record.full_sha256);}else denied(file,'retained revoked');
    }
    const n=ok(await call('GET','/notices/records/'+saved.records.notice.submission_id,'notice_reviewer',undefined,true),'retained submission');
    assert.equal(n.data.case_id,saved.records.notice.case_id);
    const result={status:'PASS',check:'same sessions, orders, file bytes and notice after restart',synthetic_only:true,frontend_tested:false,source_sha256:access.source_sha256,checked_at:new Date().toISOString()};
    await fs.writeFile(path.join(out,'retained-check.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));return;
  }
  for(const role of ['stock_buyer','stock_seller','stock_reviewer','notice_publisher','notice_artist','notice_reviewer','unverified']){
    await check('SMS login and own account: '+role,async()=>{
      const u=people[role];
      const challenge=ok(await call('POST','/auth/sms-challenges',null,{phone:u.phone,purpose:'LOGIN'}),'challenge');
      const sms=JSON.parse(await fs.readFile(path.join(out,'sms',challenge.challenge_id+'.json'),'utf8'));
      const login=ok(await call('POST','/auth/sessions',null,{phone:u.phone,challenge_id:challenge.challenge_id,code:sms.code}),'login');
      u.token=login.access_token;assert.equal(login.account.id,u.account_id);
      assert.equal(ok(await call('GET','/me',role,undefined,true),'me').id,u.account_id);
    });
  }
  await check('origin and missing authentication rejected',async()=>{
    denied(await call('GET','/me',null),'anonymous');
    const r=await fetch(access.base_url+'/testing/payments/outcome',{method:'OPTIONS',headers:{Origin:'https://untrusted.example'}});assert.equal(r.status,403);
  });
  const listing=access.scenarios.stock.listing_id;
  let offer;
  await check('published stock and playable preview',async()=>{
    offer=ok(await call('GET','/stock/catalog/'+listing,'stock_buyer',undefined,true),'catalog');
    const r=await call('GET','/stock/catalog/'+listing+'/preview','stock_buyer',undefined,true);
    assert.equal(r.status,200);assert.equal(r.bytes.toString('ascii',4,8),'ftyp');
    assert.ok(r.bytes.equals(await fs.readFile(path.join(out,'samples/preview.mp4'))));
  });
  for(const license of ['KEEP','REVOKE']){
    await check('stock purchase, simulated payment and partial refund '+license,async()=>{
      let item=ok(await call('POST','/stock/listings','stock_seller',access.requests.stock_listing),'new listing');
      for(const channel of ['RIGHTS','CONTENT']){
        const verification=channel==='RIGHTS'?{rights_verified:true,all_people_authorized:true,seller_qualified:true,source_sha256:item.data.files.full_sha256}:{content_verified:true,preview_watermark_verified:true,ai_labels_verified:true,source_sha256:item.data.files.full_sha256};
        item=ok(await call('POST','/stock/listings/'+item.id+'/reviews','stock_reviewer',{channel,decision:'APPROVED',reason:'PM03 independent synthetic listing review',verification},true,item.object_version),'listing review');
      }
      const currentOffer=ok(await call('GET','/stock/catalog/'+item.id,'stock_buyer',undefined,true),'new offer');
      const order=ok(await call('POST','/stock/checkout','stock_buyer',{listing_id:item.id,offer_sha256:currentOffer.offer_sha256,channel:'ALIPAY'}),'checkout');
      const purchaseUrl='/stock/purchases/'+order.id;
      denied(await call('GET',purchaseUrl+'/content','stock_buyer'),'unpaid download');
      const start=ok(await call('POST','/trade/payments','stock_buyer',{order_id:order.id,installment_key:'stock'}),'start payment');
      const payment=start.payment || start.record || start;
      assert.ok(payment.id,'payment ID');
      denied(await call('POST','/testing/payments/outcome','unverified',{record_id:payment.id,state:'SUCCEEDED'}),'foreign payment');
      ok(await call('POST','/testing/payments/outcome','stock_buyer',{record_id:payment.id,state:'UNKNOWN'}),'unknown outcome');
      const unknown=await call('POST','/trade/payments/'+payment.id+'/reconciliation','stock_buyer',{transaction_id:null});
      assert.ok([200,503].includes(unknown.status),'unknown response');
      denied(await call('GET',purchaseUrl+'/content','stock_buyer'),'unknown has no license');
      ok(await call('POST','/testing/payments/outcome','stock_buyer',{record_id:payment.id,state:'SUCCEEDED'}),'paid outcome');
      ok(await call('POST','/trade/payments/'+payment.id+'/reconciliation','stock_buyer',{transaction_id:null}),'payment reconciliation');
      ok(await call('POST','/trade/payments/'+payment.id+'/reconciliation','stock_buyer',{transaction_id:null}),'payment reconciliation repeat');
      const downloaded=await call('GET',purchaseUrl+'/content','stock_buyer');assert.equal(downloaded.status,200);
      assert.ok(downloaded.bytes.equals(await fs.readFile(path.join(out,'samples/full.mp4'))));
      denied(await call('GET',purchaseUrl,'unverified'),'other buyer purchase');
      let purchase=ok(await call('GET',purchaseUrl,'stock_buyer'),'purchase');
      const original=ok(await call('GET','/trade/records/'+order.id,'stock_buyer'),'original order');
      purchase=ok(await call('POST',purchaseUrl+'/cases','stock_buyer',{kind:'REFUND',reason:'PM03 synthetic partial refund'},false,purchase.object_version),'open case');
      denied(await call('GET',purchaseUrl+'/content','stock_buyer'),'open case pauses license');
      const decision={case_id:purchase.data.current_case_id,decision:'REFUND',refund_minor:40,license_action:license,reason:'PM03 independent amount and licence decision'};
      denied(await call('POST',purchaseUrl+'/case-resolution','stock_buyer',decision,true,purchase.object_version),'buyer cannot review');
      ok(await call('GET',purchaseUrl,'stock_reviewer',undefined,true),'operator finds same order');
      ok(await call('POST',purchaseUrl+'/case-resolution','stock_reviewer',decision,true,purchase.object_version),'independent decision');
      let refund=ok(await call('POST','/trade/refunds','stock_buyer',{payment_id:payment.id,allocations:[{line_id:'stock',amount_minor:40}],reason:'PM03 agreed amount'}),'refund request');
      refund=ok(await call('POST','/trade/records/'+refund.id+'/reviews','stock_reviewer',{decision:'APPROVED',reason:'PM03 independent refund execution'},true,refund.object_version),'refund review');
      ok(await call('POST','/trade/refunds/'+refund.id+'/execution','stock_reviewer',{},true),'refund execution');
      denied(await call('GET',purchaseUrl+'/content','stock_buyer'),'pending refund pauses license');
      ok(await call('POST','/testing/payments/outcome','stock_buyer',{record_id:refund.id,state:'SUCCEEDED'}),'refund outcome');
      ok(await call('POST','/trade/refunds/'+refund.id+'/reconciliation','stock_buyer',{}),'refund reconciliation');
      ok(await call('POST','/trade/refunds/'+refund.id+'/reconciliation','stock_buyer',{}),'refund repeat');
      const final=ok(await call('GET',purchaseUrl,'stock_buyer'),'final purchase');
      assert.equal(final.data.status,license==='KEEP'?'ACTIVE':'REVOKED');
      const content=await call('GET',purchaseUrl+'/content','stock_buyer');
      if(license==='KEEP')assert.equal(content.status,200);else denied(content,'revoked download');
      const current=ok(await call('GET','/trade/records/'+order.id,'stock_buyer'),'final order');
      assert.deepEqual(current.data.financial,{received_minor:100,refunded_minor:40,net_minor:60});
      assert.deepEqual(current.data.contract,original.data.contract);
      records[license]={order_id:order.id,payment_id:payment.id,refund_id:refund.id,status:final.data.status,full_sha256:createHash('sha256').update(downloaded.bytes).digest('hex')};
    });
  }
  await check('ordinary adult without membership publishes, independent review and artist submission',async()=>{
    const eligibility=ok(await call('GET','/notices/eligibility?rule_id='+access.scenarios.notices.rule_id,'notice_publisher'),'eligibility');
    assert.equal(eligibility.active,true);assert.equal(eligibility.level,0);
    denied(await call('POST','/notices/announcements','unverified',access.requests.notice),'unverified publish');
    let notice=ok(await call('POST','/notices/announcements','notice_publisher',access.requests.notice),'notice create');
    const review={decision:'APPROVE',reason:'PM03 independent synthetic review',checks:{content_reviewed:true,materials_reviewed:true,no_private_contact:true}};
    denied(await call('POST','/notices/records/'+notice.id+'/reviews','notice_publisher',review,true,notice.object_version),'publisher cannot review');
    notice=ok(await call('POST','/notices/records/'+notice.id+'/reviews','notice_reviewer',review,true,notice.object_version),'notice review');
    assert.equal(notice.current_status,'PUBLISHED');
    let submission=ok(await call('POST','/notices/submissions','notice_artist',{...access.requests.submission,submission:{...access.requests.submission.submission,notice_id:notice.id}}),'submission');
    submission=ok(await call('POST','/notices/records/'+submission.id+'/reviews','notice_reviewer',review,true,submission.object_version),'submission review');
    submission=ok(await call('POST','/notices/submissions/'+submission.id+'/decision','notice_publisher',{decision:'INTERESTED'},false,submission.object_version),'publisher interested');
    const operator=ok(await call('GET','/notices/records/'+submission.id,'notice_reviewer',undefined,true),'same submission operator');
    assert.equal(operator.id,submission.id);assert.ok(submission.data.case_id);
    records.notice={notice_id:notice.id,submission_id:submission.id,case_id:submission.data.case_id};
  });
  const receipt={status:'PASS',synthetic_only:true,frontend_tested:false,revision:access.revision,source_sha256:access.source_sha256,completed_at:new Date().toISOString(),checks,records};
  const dest=path.join(out,'smoke-'+Date.now()+'.json');await fs.writeFile(dest,JSON.stringify(receipt,null,2));
  const privateFile=path.join(out,'smoke-access.json');const handle=await fs.open(privateFile,'a',0o600);await handle.close();
  await require('./test-fixtures/private-state.cjs').protectPrivateState(privateFile);
  await fs.writeFile(privateFile,JSON.stringify({source_sha256:access.source_sha256,people,records}));
  console.log(JSON.stringify({status:'PASS',checks:checks.length,receipt:path.relative(root,dest),data_retained:true,frontend_tested:false}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
