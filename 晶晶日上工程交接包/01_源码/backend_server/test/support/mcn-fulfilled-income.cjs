'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID:key}=require('node:crypto'),{digest}=require('../../src/modules/governance/content');
async function verify({t,db,base,S,type,order,booking,owner,org,replacementOwner,replacement,artist,buyer,reviewer,trade,agreement,settle,reviewSettlement,confirm,sync}){
 const fixtures=[],checks=[],records=[];let refund;
 const amount=4000,net=order.data.quote.total_minor-amount;
 async function call(method,url,user=owner,body,party=org.party_id,record){const res=await fetch(base+url,{method,headers:{Authorization:'Bearer '+user.token,...(party?{'X-Acting-Party':party}:{}),...(body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':key()}),...(record?{'If-Match':'"'+record.object_version+'"'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await res.json();fixtures.push({method,path:new URL(base+url).pathname,schema:!res.ok?'ErrorResponse':url.startsWith('/engagement/')?'EngagementResponse':url.startsWith('/auditions/')?'AuditionResponse':url.endsWith('/balances')?'FinanceBalancesResponse':'TradeRecordResponse',value});return {status:res.status,...value};}
 const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;},sub=(name,fn)=>t.test(name,async()=>{await fn();checks.push({name,result:'PASS'});});
 const dashboard=(user=owner,party=org.party_id,query='order_id='+order.id)=>call('GET','/engagement/mcn/dashboard?'+query,user,undefined,party).then(ok);
 function check(view,refunded){assert.equal(view.orders.length,1);const row=view.orders[0];assert.equal(row.order_id,order.id);assert.equal(row.business_type,type);assert.equal(row.income_role,'MCN');assert.equal(row.supplier_accrual_minor,0);assert.equal(row.organization_expected_minor,1560);assert.equal(row.organization_accrual_minor,refunded?936:1560);assert.equal(row.mcn_accrual_minor,row.organization_accrual_minor);assert.deepEqual(row.person_ids,[artist.person.id]);assert.equal(row.contract_sha256,digest(order.data.contract));assert.equal(row.order_received_minor,order.data.quote.total_minor);assert.equal(row.order_refunded_minor,refunded);assert.equal(view.total_order_net_minor,order.data.quote.total_minor-refunded);assert.equal(view.total_supplier_accrual_minor,0);assert.equal(view.total_organization_accrual_minor,row.organization_accrual_minor);assert.equal(view.total_accrual_minor,row.mcn_accrual_minor);assert.equal(row.meaning,'ACCRUAL_NOT_PAYOUT');assert.equal(view.history_preserved,true);if(type==='AUDITION'){assert.equal(row.audition.booking_id,booking.id);assert.equal(row.audition.acceptance_result,'ACCEPTED');}return row;}
 await sub('fulfilled original agency remains visible by order, artist and creation interval after agency replacement',async()=>{
  const v=await dashboard(),row=check(v,0);assert.deepEqual((await dashboard(replacementOwner,replacement.party_id)).orders,[]);assert.equal((await call('GET','/engagement/mcn/dashboard?order_id='+order.id,buyer)).status,403);
  check(await dashboard(owner,org.party_id,'order_id='+order.id+'&person_id='+artist.person.id),0);
  check(await dashboard(owner,org.party_id,'order_id='+order.id+'&created_from='+encodeURIComponent(row.created_at)),0);
  assert.deepEqual((await dashboard(owner,org.party_id,'order_id='+order.id+'&created_before='+encodeURIComponent(row.created_at))).orders,[]);
  records.push({stage:'FULFILLED_ORIGINAL_AGENCY',view:v});
 });
 await sub('approved partial refund without a successful return does not reduce old agency accounting',async()=>{
  if(type==='AUDITION'){
   const proof=await S.supply.upload(buyer.ctx,{party_id:buyer.personal_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from('Synthetic post-fulfillment dispute evidence'),operation_key:key()});
   booking=ok(await call('GET','/auditions/records/'+booking.id,buyer,undefined,buyer.personal_party_id));
   booking=ok(await call('POST','/auditions/bookings/'+booking.id+'/cancel',buyer,{reason:'Synthetic fulfilled sample issue',safety:false,evidence_asset_ids:[proof.id]},buyer.personal_party_id,booking));
   booking=ok(await call('POST','/auditions/bookings/'+booking.id+'/resolution',reviewer,{decision:'REFUND',refund_minor:amount,reason:'Independent synthetic partial refund',evidence_asset_ids:[proof.id]},null,booking));
   refund=ok(await call('GET','/trade/records/'+booking.data.refund_id,buyer,undefined,buyer.personal_party_id));
  }else{
   const [[payment]]=await db.execute("SELECT id FROM trade_records WHERE kind='PAYMENT' AND order_id=? AND current_status='SUCCEEDED'",[order.id]);
   refund=ok(await call('POST','/trade/refunds',buyer,{payment_id:payment.id,allocations:[{line_id:'commercial',amount_minor:amount}],reason:'Synthetic independent commercial partial refund'},buyer.personal_party_id));
  }
  refund=ok(await call('POST','/trade/records/'+refund.id+'/reviews',reviewer,{decision:'APPROVED',reason:'Independent synthetic amount review'},null,refund));await trade.claim(reviewer.ctx,refund.id,null,'REFUND');check(await dashboard(),0);
 });
 await sub('one verified return reverses the original agency share once, and finance reconciliation agrees with dashboard',async()=>{
  const receipt={...refund.data,refund_id:refund.id,status:'SUCCEEDED'};await trade.applyRefund(refund.id,receipt);await trade.applyRefund(refund.id,receipt);const view=await dashboard();check(view,amount);assert.equal(view.total_order_net_minor,net);assert.deepEqual((await dashboard(replacementOwner,replacement.party_id)).orders,[]);
  if(type==='AUDITION'){
   booking=ok(await call('GET','/auditions/records/'+booking.id,buyer,undefined,buyer.personal_party_id));assert.equal(booking.current_status,'PARTIAL_REFUND_SETTLED');
   // Advance only the actual independent resolution's completion time for T+1/aftercare.
   const data={...booking.data,fulfilled_at:new Date(Date.now()-8*86400000).toISOString()};await db.execute('UPDATE audition_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(data),digest(data),booking.id]);
  }
  const commission=await sync();assert.equal(commission.data.amount_minor,600);
  const settled=await reviewSettlement(ok(await settle()));await confirm(settled);
  const balances=ok(await call('GET','/finance/agreements/'+agreement.id+'/balances',owner,undefined,org.party_id));assert.deepEqual(balances.items.map(x=>x.party_id),[org.party_id]);assert.equal(balances.items[0].accrued_minor,936);assert.equal(balances.items[0].paid_minor,0);assert.equal(balances.items[0].available_minor,0);
  const before=(await db.execute('SELECT COUNT(*) n FROM finance_entries WHERE agreement_id=?',[agreement.id]))[0][0].n;await settle();await sync();check(await dashboard(),amount);assert.equal((await db.execute('SELECT COUNT(*) n FROM finance_entries WHERE agreement_id=?',[agreement.id]))[0][0].n,before);
  const current=ok(await call('GET','/trade/records/'+order.id,buyer,undefined,buyer.personal_party_id));assert.deepEqual(current.data.contract,order.data.contract);assert.deepEqual(current.data.quote,order.data.quote);
  records.push({stage:'PARTIAL_REFUND_ORIGINAL_AGENCY',refund_id:refund.id,view,balances,commission_id:commission.id,commission_minor:commission.data.amount_minor,settlement_id:settled.id});
 });
 const root=path.resolve(__dirname,'../../../../..','.local'),name='mcn-fulfilled-'+type.toLowerCase();await fs.writeFile(path.join(root,name+'-http.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));await fs.writeFile(path.join(root,name+'-records.json'),JSON.stringify({synthetic_only:true,frontend_run:false,real_services:false,type,checks,order_id:order.id,agency_party_id:org.party_id,replacement_party_id:replacement.party_id,records,limits:['Existing actual normal HTTP journey is extended; artist remains supplier, organization is the frozen agency','Identity, media, qualification and PRODUCTION-labelled receipts are synthetic','Audition resolution fulfillment time alone advanced after actual review to test mature finance, not real waiting','No real payout, no organization impersonation as an audition supplier']},null,2));
}
module.exports={verify};
