"use strict";
const {randomUUID}=require('node:crypto'),{shape,id,error}=require('../party/policy');
const {sealUnsignedContent}=require('../governance/content'),C=require('./checks'),S=require('./participation-state');
function checkout({db,actor,owner,command,insert,load}){return async(ctx,i)=>{
 shape(i,['party_id','agreement_id','agreement_sha256','channel','operation_key']);if(!['ALIPAY','CUSTODY'].includes(i.channel))throw error('INVALID_PAYMENT_CHANNEL',400);
 return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await owner(tx,a,i.party_id);
  return command(tx,a,'PARTICIPATION_CHECKOUT',i,async()=>{
   const hint=await C.load(tx,id(i.agreement_id),'PARTICIPATION',''),p=await C.load(tx,hint.project_id,'PROJECT'),r=await C.load(tx,hint.id,'PARTICIPATION');await S.usable(tx,p,r,{confirmed:true});
   if(p.owner_party_id!==i.party_id)throw error('PROJECT_PARTY_FORBIDDEN');if(r.content_sha256!==i.agreement_sha256)throw error('CONFIRMATION_VERSION_MISMATCH',409);
   const old=await C.one(tx,'SELECT order_id FROM project_participation_orders WHERE agreement_id=? FOR UPDATE',[r.id]);if(old)return load(tx,old.order_id,'ORDER');
   if(!r.data.fee_minor)throw error('PARTICIPATION_NO_CASH_ORDER',409);
   const d=r.data,finance=d.marketplace_finance,line={line_id:'participation',title:'Negotiated participation fee',provider_party_id:r.owner_party_id,line_kind:'OTHER',unit_minor:d.fee_minor,total_minor:d.fee_minor,currency:'CNY',quantity:1,product_profile:{version:'V5',type:'COMMERCIAL'},specification:{version:'V5',terms:d.terms.permitted_uses}};
   const quote={lines:[line],installments:d.terms.installments.map(x=>({key:x.key,trigger:'ORDER_ACCEPTED',allocations:[{line_id:line.line_id,amount_minor:x.amount_minor}],apple_product_id:null})),total_minor:d.fee_minor,currency:'CNY',channel:i.channel,transaction_model:'DIRECT_SUPPLIER',rule_id:finance.rule_snapshot.content.id,expires_at:d.terms.valid_until,payment_window_minutes:30,license_reservation_id:null,review:null,marketplace_finance:finance,participation:{agreement_id:r.id,agreement_sha256:r.content_sha256,project_id:p.id,candidate_id:d.candidate_id,terms:d.terms,cast:d.cast,avatar_id:d.avatar_id}};
   Object.assign(quote,await require('../engagement/referrals').capture(tx,quote,p.owner_party_id,r.owner_party_id));require('../settlement/marketplace-policy').checked(quote,r.owner_party_id);
   const contract=sealUnsignedContent({id:randomUUID(),contract_version_id:randomUUID(),party_ids:d.confirmers.map(x=>x.party_id),created_at:new Date().toISOString(),rules:[finance.rule_snapshot],commitments:{participation_id:r.id,participation_sha256:r.content_sha256,quote}});
   const order=await insert(tx,a,'ORDER',p.owner_party_id,r.owner_party_id,null,null,'OPEN',{quote,contract,buyer_acknowledged_by:a.id,financial:{received_minor:0,refunded_minor:0,net_minor:0}});
   await tx.execute('INSERT INTO project_participation_orders(agreement_id,order_id) VALUES (?,?)',[r.id,order.id]);return order;
  });
 });
};}
module.exports={checkout};
