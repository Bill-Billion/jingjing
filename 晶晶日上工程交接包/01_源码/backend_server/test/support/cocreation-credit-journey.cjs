'use strict';
const assert=require('node:assert/strict'),{randomUUID:key,randomBytes}=require('node:crypto');
// Runs against the same real twenty-member room created by the composition test.
function journey({db,f,call,bad,check,buyer,producer,reviewer,outsider,room,order,reviewProject}){
 let benefit,stock,grant,creditOrder,project;const offers=[];
 async function freshSession(){await bad(call('GET','/cocreation/benefits',buyer),'AUTHENTICATION_REQUIRED');const auth=require('../../src/modules/auth/repository').createAuthRepository(db,{secret:f.secret});buyer.token=randomBytes(32).toString('base64url');await db.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms) VALUES (?,?,ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+3600000)',[auth.secure.digest('token',buyer.token),buyer.account_id]);}
 const read=()=>call('GET','/redemption/grants/'+grant.id,buyer);
 const hold=async q=>call('POST','/redemption/grants/'+grant.id+'/checkout',buyer,{quote_id:q.id},(await read()).object_version);
 const accept=(q,h)=>call('POST','/trade/quotes/'+q.id+'/acceptance',buyer,{quote_sha256:q.content_sha256,reward_selection:{hold_id:h.id,adjusted_quote_sha256:h.data.adjusted_quote_sha256}},q.object_version);
 return {
 async prepare(){
  await check('actual twenty-person benefit links once to reviewed credit with original owner and expiry',async()=>{
   benefit=(await call('GET','/cocreation/benefits',buyer)).items.find(b=>b.parent_id===room.id);assert.ok(benefit);
   for(let i=0;i<3;i++){let saved;const stop=new Error('synthetic quote only');await assert.rejects(f.newOrder({preview:'SCRIPT_BEFORE_INTERIM',beforeAccept:async x=>{saved=x;throw stop;}}),e=>e===stop);offers.push(saved);}
   const template={version:'synthetic-actual-room-credit',source_ref:'synthetic-only',title:'Actual formed-room credit',kind:'SERVICE_CREDIT',service_code:benefit.data.service_code,valid_days:benefit.data.valid_days,exchange_points:null,capacity:10,available_until:'2099-01-01T00:00:00.000Z',terms:'Original noncash credit and expiry',production:{face_minor:benefit.data.credit_minor,minimum_minor:10000,spec_ids:offers.map(x=>x.spec.id)},interview:null,exposure:null};
   stock=await call('POST','/redemption/stock',producer,{template,evidence_asset_ids:[f.proof.id]});stock=await call('POST','/redemption/stock/'+stock.id+'/review',reviewer,{decision:'APPROVE',reason:'Synthetic independent'},stock.object_version);
   const body={benefit_id:benefit.id,stock_id:stock.id},op=key();await bad(call('POST','/redemption/service-credits',outsider,body),'REDEMPTION_NOT_FOUND');
   grant=await call('POST','/redemption/service-credits',buyer,body,null,op);assert.deepEqual(await call('POST','/redemption/service-credits',buyer,body,null,op),grant);assert.equal((await call('POST','/redemption/service-credits',buyer,body)).id,grant.id);
   assert.equal(grant.data.cocreation_benefit_id,benefit.id);assert.equal(grant.data.expires_at,benefit.data.expires_at);assert.equal(grant.data.cashable,false);assert.equal(grant.data.transferable,false);
   assert.equal(require('../../src/modules/artists/context').parse((await db.execute('SELECT data_json FROM redemption_records WHERE id=?',[stock.id]))[0][0].data_json).issued,1);
   return {room_id:room.id,source_order_id:order.id,benefit_id:benefit.id,grant_id:grant.id,original_expires_at:benefit.data.expires_at,issued_once:true};
  });
  await check('unpaid credit order cancellation releases the original grant without new cash or expiry',async()=>{
   const q=offers[0].quote,h=await hold(q),o=await accept(q,h);assert.equal(o.data.quote.total_minor,9000);assert.deepEqual(o.data.quote.installments.map(x=>x.allocations[0].amount_minor),[2700,3600,2700]);assert.equal(o.data.quote.referral,undefined);
   await call('POST','/trade/orders/'+o.id+'/cancellation',buyer,{reason:'Synthetic unpaid cancellation'},o.object_version);
   const g=await read();assert.equal(g.current_status,'AVAILABLE');assert.equal(g.data.expires_at,benefit.data.expires_at);
   assert.equal((await call('GET','/cocreation/benefits',buyer)).items.find(x=>x.id===benefit.id).current_status,'AVAILABLE');assert.equal((await db.execute('SELECT id FROM trade_journal WHERE order_id=?',[o.id]))[0].length,0);
   return {room_id:room.id,benefit_id:benefit.id,grant_id:g.id,cancelled_order_id:o.id,expires_at:g.data.expires_at,cash_received_minor:0};
  });
 },
 async paused(){await bad(hold(offers[1].quote),'SERVICE_CREDIT_SOURCE_REVOKED');},
 async consume(){
  await check('resumed original room consumes its original credit once on discounted payment',async()=>{
   const q=offers[1].quote,h=await hold(q);creditOrder=await accept(q,h);const payment=await f.pay(creditOrder,'first');assert.equal(payment.data.amount_minor,2700);
   const paid=await call('GET','/trade/records/'+creditOrder.id,buyer);assert.deepEqual(paid.data.financial,{received_minor:2700,refunded_minor:0,net_minor:2700});assert.deepEqual(paid.data.contract,creditOrder.data.contract);
   const g=await read(),b=(await call('GET','/cocreation/benefits',buyer)).items.find(x=>x.id===benefit.id);assert.equal(g.current_status,'USED');assert.equal(b.current_status,'USED');assert.equal(b.data.delivery.grant_id,g.id);assert.equal(b.data.delivery.order_id,creditOrder.id);assert.equal(g.data.expires_at,benefit.data.expires_at);
   await bad(hold(offers[2].quote),'REWARD_NOT_AVAILABLE');
   project=await reviewProject(await call('POST','/production/projects',producer,{order_id:creditOrder.id,line_id:'film',script_version_id:f.work.id,license_project_id:null,assignee_account_id:producer.account_id,purpose:'PRIVATE',territory:'CN',consent_ids:[],evidence_asset_id:f.proof.id,fulfillment:{uses_identifiable_people:false,cast:[]}}));
   return {room_id:room.id,benefit_id:b.id,grant_id:g.id,credit_order_id:creditOrder.id,payment_id:payment.id,received_minor:2700,credit_minor:1000,grant_status:'USED'};
  });
 },
 async cancelled(){
  await check('refunded source blocks credit production but preserves recorded cash and consumed history',async()=>{
   await bad(hold(offers[2].quote),'SERVICE_CREDIT_SOURCE_REVOKED');
   await bad(call('POST','/production/projects/'+project.id+'/start',producer,{},project.object_version),'SERVICE_CREDIT_SOURCE_REVOKED');
   const paid=await call('GET','/trade/records/'+creditOrder.id,buyer);assert.deepEqual(paid.data.financial,{received_minor:2700,refunded_minor:0,net_minor:2700});assert.deepEqual(paid.data.contract,creditOrder.data.contract);assert.equal((await read()).current_status,'USED');
   return {source_room_id:room.id,source_order_id:order.id,credit_order_id:creditOrder.id,grant_id:grant.id,automatic_cash_refund:false,production_blocked:true};
  });
 },
 async expire(makeRoom){
  await check('separate actual twenty-person credit keeps its deadline through delayed claim and release then expires',async()=>{
   const x=await makeRoom(20),b=(await call('GET','/cocreation/benefits',buyer)).items.find(v=>v.parent_id===x.room.id);assert.ok(b);
   await db.execute('SET timestamp=?',[Math.floor(Date.parse(b.data.issued_at)/1000)+86400]);await freshSession();
   const g=await call('POST','/redemption/service-credits',buyer,{benefit_id:b.id,stock_id:stock.id});assert.equal(g.data.expires_at,b.data.expires_at);assert.notEqual(g.data.issued_at,b.data.issued_at);
   const q=offers[2].quote,h=await call('POST','/redemption/grants/'+g.id+'/checkout',buyer,{quote_id:q.id},g.object_version);await call('POST','/redemption/holds/'+h.id+'/release',buyer,{},h.object_version);
   await db.execute('SET timestamp=?',[Math.ceil(Date.parse(b.data.expires_at)/1000)]);await freshSession();
   const expired=await call('GET','/redemption/grants/'+g.id,buyer);assert.equal(expired.effective_status,'EXPIRED');assert.equal(expired.data.expires_at,b.data.expires_at);
   await bad(call('POST','/redemption/grants/'+g.id+'/checkout',buyer,{quote_id:q.id},expired.object_version),'REWARD_NOT_AVAILABLE');
   const retry=await call('POST','/redemption/service-credits',buyer,{benefit_id:b.id,stock_id:stock.id});assert.equal(retry.id,g.id);assert.equal(retry.data.expires_at,b.data.expires_at);
   return {room_id:x.room.id,source_order_id:x.order.id,benefit_id:b.id,grant_id:g.id,original_expires_at:b.data.expires_at,effective_status:'EXPIRED',late_claim_extends:false};
  });
 }
 };
}
module.exports={journey};
