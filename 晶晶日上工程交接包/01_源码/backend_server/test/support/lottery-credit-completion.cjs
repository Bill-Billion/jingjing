'use strict';
const assert=require('node:assert/strict'),{randomUUID:key}=require('node:crypto');
const fs=require('node:fs/promises'),path=require('node:path');
const {digest}=require('../../src/modules/governance/content');
module.exports=async({t,db,S,W,request,offer,hold,accept,get,base})=>{
 await t.test('same actual drawn production credit completes all four stages and original refunds without restoring prize or draw stake',async()=>{
  const {producer,buyer,reviewer,outsider}=S.people;
  const a=await offer({preview:'SCRIPT_BEFORE_INTERIM'});
  const template={version:'synthetic-drawn-credit-completion',source_ref:'synthetic-only',title:'synthetic drawn credit completion',kind:'PRODUCTION_CREDIT',valid_days:30,exchange_points:null,capacity:10,available_until:'2099-01-01T00:00:00.000Z',terms:'Synthetic original credit: consume once, no coupon restoration on refund',production:{face_minor:5000,minimum_minor:50000,spec_ids:[a.spec.id]},interview:null,exposure:null};
  let stock=await request('/redemption/stock',producer,{body:{template,evidence_asset_ids:[S.proof.id]}});
  stock=await request('/redemption/stock/'+stock.id+'/review',reviewer,{party:false,version:stock.object_version,body:{decision:'APPROVE',reason:'Synthetic independent inventory'}});
  const proof=await S.upload(producer,'REVIEW_EVIDENCE');
  let pool=await request('/redemption/pools',producer,{body:{config:{version:'synthetic guaranteed credit',algorithm:'NINE_THEN_CONDITIONAL_TENTH_V1',single_points:300,ten_points:2700,prizes:[{key:'credit',kind:'PRODUCTION_CREDIT',weight:10000,estimated_cost_minor:5000}]},bindings:[{key:'credit',stock_id:stock.id,point_back:0}],starts_at:'2020-01-01T00:00:00.000Z',ends_at:'2099-01-01T00:00:00.000Z',terms:'Synthetic only; no commercial odds or payment service',cost_limit_single_minor:5000,cost_limit_ten_minor:50000,evidence_asset_ids:[proof.id]}});
  for(const [who,channel] of [[reviewer,'RULES'],[outsider,'FINANCE']])pool=await request('/redemption/pools/'+pool.id+'/review',who,{party:false,version:pool.object_version,body:{channel,decision:'APPROVE',reason:'Synthetic independent',evidence_asset_id:proof.id}});
  // Only the isolated fixture publication time is advanced. No production bypass.
  const data=structuredClone(pool.data),policy=require('../../src/modules/redemption/lottery-policy');
  data.publication_notice=policy.publicationNotice(new Date(Date.now()-8*86400000).toISOString(),data.ends_at);data.rules_sha256=policy.rulesHash(data);
  await db.execute('UPDATE redemption_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(data),digest(data),pool.id]);
  const before=await W.summary(buyer.ctx,{party_id:buyer.personal_party_id}),drawKey=key(),drawBody={pool_id:pool.id,rules_sha256:data.rules_sha256,count:1};
  const draw=await request('/redemption/draws',buyer,{body:drawBody,operation:drawKey});
  const replay=()=>request('/redemption/draws',buyer,{body:drawBody,operation:drawKey});
  assert.deepEqual(await replay(),draw);
  const grant=await request('/redemption/grants/'+draw.data.results[0].grant_id,buyer);
  assert.equal(grant.data.template.kind,'PRODUCTION_CREDIT');
  assert.equal((await W.summary(buyer.ctx,{party_id:buyer.personal_party_id})).available_points,before.available_points-300);
  const held=await hold(grant,a.quote),order=await accept(a.quote,held);
  assert.equal(order.data.quote.total_minor,45000);
  const payments=[await S.pay(order,'first')],Prod=require('../../src/modules/production/repository').createProductionRepository(db,{resolvePrincipal:S.resolvePrincipal});
  let project=await Prod.create(producer.ctx,{party_id:S.org.party_id,order_id:order.id,line_id:'film',assignee_account_id:producer.account_id,script_version_id:S.work.id,license_project_id:null,consent_ids:[],purpose:'PRIVATE',territory:'CN',evidence_asset_id:S.proof.id,fulfillment:{uses_identifiable_people:false,cast:[]},operation_key:key()});
  project=await Prod.review(reviewer.ctx,{record_id:project.id,expected_version:project.object_version,decision:'APPROVED',reason:'Synthetic independent production',verification:{contract_sha256:project.data.contract_sha256,identity_verified:true,signatures_verified:true,rights_verified:true},operation_key:key()});
  await Prod.startCustomization(producer.ctx,{record_id:project.id,party_id:S.org.party_id,expected_version:project.object_version,operation_key:key()});
  const checklist=stage=>stage==='SCRIPT'?{script_reviewed:true}:{script_reviewed:true,specification_reviewed:true,audio_reviewed:true,branding_reviewed:true};
  async function upload(stage,preview=false){
   const bytes=Buffer.from('synthetic drawn credit '+stage+(preview?' preview':''));
   const res=await fetch(base+'/production/projects/'+project.id+'/files?media_type='+encodeURIComponent(stage==='SCRIPT'?'text/plain':'video/mp4'),{method:'POST',headers:{Authorization:'Bearer '+producer.token,'X-Acting-Party':S.org.party_id,'Idempotency-Key':key(),'Content-Type':'application/octet-stream'},body:bytes});
   const value=await res.json();assert.equal(res.status,200,JSON.stringify(value));return value.data;
  }
  const versions=[];
  for(const stage of ['SCRIPT','SAMPLE','ROUGH_CUT','FINAL']){
   const file=await upload(stage),previewFile=stage==='SCRIPT'?file:await upload(stage,true),current=await Prod.read(producer.ctx,{record_id:project.id,party_id:S.org.party_id});
   let v=await request('/production/projects/'+project.id+'/versions',producer,{version:current.object_version,body:{stage,file_id:file.id,preview_file_id:previewFile.id,note:'Synthetic same winning credit delivery'}});
   v=await request('/production/records/'+v.id+'/reviews',reviewer,{party:false,version:v.object_version,body:{decision:'APPROVED',reason:'Synthetic independent',verification:{...checklist(stage),...(stage==='SCRIPT'?{}:{commercial_watermark_verified:true,ai_label_verified:true})}}});
   const headers={Authorization:'Bearer '+buyer.token,'X-Acting-Party':buyer.personal_party_id};
   const preview=await fetch(base+'/production/versions/'+v.id+'/content?variant=preview',{headers});assert.equal(preview.status,200);await preview.arrayBuffer();
   await request('/production/versions/'+v.id+'/feedback',buyer,{version:v.object_version,body:{decision:'ACCEPT',note:'Synthetic holder confirmation',checklist:checklist(stage),change_kind:null}});
   if(stage==='SCRIPT')payments.push(await S.pay(order,'interim'));
   if(stage==='FINAL'){
    payments.push(await S.pay(order,'last'));
    for(let i=0;i<2;i++){const final=await fetch(base+'/production/versions/'+v.id+'/content?variant=final',{headers});assert.equal(final.status,200);assert.equal(await final.text(),'synthetic drawn credit FINAL');}
   }
   versions.push(v.id);
  }
  assert.deepEqual(payments.map(p=>p.data.amount_minor),[13500,18000,13500]);
  assert.equal((await Prod.fulfillment(producer.ctx,{record_id:project.id,party_id:S.org.party_id})).state,'DELIVERED');
  const earningInput={party_id:buyer.personal_party_id,order_id:order.id,operation_key:key()},earning=await W.syncOrder(buyer.ctx,earningInput);
  assert.equal(earning.current_status,'ISSUED');assert.equal(earning.data.points,4500);assert.equal(earning.data.paid_minor,45000);assert.deepEqual(await W.syncOrder(buyer.ctx,earningInput),earning);
  assert.equal((await W.summary(buyer.ctx,{party_id:buyer.personal_party_id})).qualifying_growth,before.qualifying_growth+4500);
  assert.equal((await get(grant)).current_status,'USED');await assert.rejects(hold(await get(grant),a.quote),{code:'REWARD_NOT_AVAILABLE'});assert.deepEqual(await replay(),draw);
  const current=await Prod.read(producer.ctx,{record_id:project.id,party_id:S.org.party_id});
  const dispute=await Prod.openCustomizationCase(buyer.ctx,{record_id:project.id,party_id:buyer.personal_party_id,expected_version:current.object_version,kind:'RIGHTS_UNAVAILABLE',reason:'Synthetic later rights failure',evidence_asset_ids:[],operation_key:key()});
  const decision=await Prod.resolveCustomizationCase(reviewer.ctx,{record_id:project.id,expected_version:dispute.object_version,case_id:dispute.cases.at(-1).id,decision:'CANCEL',retained_minor:0,change_order_id:null,reason:'Synthetic independent refund',operation_key:key()});assert.equal(decision.cancellation.refund_minor,45000);
  const refunds=[];
  for(const payment of payments){
   let r=await S.trade.requestRefund(buyer.ctx,{party_id:buyer.personal_party_id,payment_id:payment.id,allocations:[{line_id:'film',amount_minor:payment.data.amount_minor}],reason:'Synthetic original installment refund',operation_key:key()});r=await S.reviewTrade(r);await S.trade.claim(reviewer.ctx,r.id,null,'REFUND');
   const result={...r.data,refund_id:r.id,status:'SUCCEEDED'};await S.trade.applyRefund(r.id,result);await S.trade.applyRefund(r.id,result);refunds.push(r.id);
  }
  const actual=await S.trade.read(buyer.ctx,{record_id:order.id,party_id:buyer.personal_party_id});
  assert.deepEqual(actual.data.financial,{received_minor:45000,refunded_minor:45000,net_minor:0});assert.deepEqual(actual.data.contract,order.data.contract);
  assert.equal((await get(grant)).current_status,'USED');assert.deepEqual(await replay(),draw);
  const after=await W.summary(buyer.ctx,{party_id:buyer.personal_party_id});assert.equal(after.available_points,before.available_points-300);assert.equal(after.qualifying_growth,before.qualifying_growth);
  assert.equal((await db.execute("SELECT id FROM trade_journal WHERE order_id=? AND direction='REFUND'",[order.id]))[0].length,3);
  await fs.writeFile(path.resolve(__dirname,'../../../../../.local/drawn-credit-completion.json'),JSON.stringify({synthetic_only:true,frontend_run:false,real_services:false,draw_id:draw.id,grant_id:grant.id,order_id:order.id,project_id:project.id,version_ids:versions,payment_ids:payments.map(p=>p.id),refund_ids:refunds,earning_id:earning.id,financial:actual.data.financial,original_draw_unchanged:true,draw_stake:300,grant_status:'USED',limits:['Guaranteed isolated prize pool and aged publication fixture, not commercial odds','Synthetic payment receipts, file bytes and zero-day aftercare rule','Existing implementation verified; no frontend or real fulfillment']},null,2));
 });
};
