"use strict";
const {shape,error}=require('../party/policy'),{digest}=require('../governance/content');
const A=require('../artists/context'),C=require('./context'),Co=require('../cocreation/context');
async function source(tx,g){
 const key=g.data.cocreation_benefit_id;if(!key)return null;
 const b=await Co.load(tx,key,'BENEFIT'),room=await Co.load(tx,b.parent_id,'ROOM','FOR SHARE');
 if(b.owner_party_id!==g.owner_party_id||room.data.cancellation||!['READY'].includes(room.current_status)||!['AVAILABLE','USED'].includes(b.current_status)||b.current_status==='USED'&&b.data.delivery?.grant_id!==g.id)throw error('SERVICE_CREDIT_SOURCE_REVOKED',409);
 const o=await require('../cocreation/state').order(tx,room);
 if(!o||!['PARTIALLY_PAID','PAID'].includes(o.current_status)||o.data.financial.refunded_minor>0)throw error('SERVICE_CREDIT_SOURCE_REVOKED',409);
 const link=await require('../cocreation/state').link(tx,room);
 if(link.project_id){const row=await A.one(tx,'SELECT * FROM production_fulfillments WHERE project_id=? FOR SHARE',[link.project_id]);if(row&&require('../production/customization-state').decode(row).cancellation)throw error('SERVICE_CREDIT_SOURCE_REVOKED',409);}
 return b;
}
async function validSource(tx,g){return source(tx,g);}
async function consume(tx,a,g,order){const b=await source(tx,g);if(b&&b.current_status==='AVAILABLE')await Co.save(tx,a,b,'USED',{...b.data,delivery:{grant_id:g.id,order_id:order.id,used_at:await A.now(tx)}},'SERVICE_CREDIT_USED');}
function methods({db,actor}){return {
 async claimServiceCredit(ctx,i){
  shape(i,['party_id','benefit_id','stock_id','operation_key']);return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await A.owner(tx,a,i.party_id);
   return C.command(tx,a,'SERVICE_CREDIT_CLAIM',i,async()=>{
    const b=await Co.load(tx,i.benefit_id,'BENEFIT');if(b.owner_party_id!==i.party_id)throw error('REDEMPTION_NOT_FOUND',404);
    const old=await A.one(tx,"SELECT * FROM redemption_records WHERE source_key=?",[digest(['GRANT',['COCREATION',b.id]])]);if(old){const g=C.checked(old);if(g.parent_id!==i.stock_id)throw error('SERVICE_CREDIT_ALREADY_LINKED',409);return g;}
    const room=await Co.load(tx,b.parent_id,'ROOM','FOR SHARE'),stock=await C.load(tx,i.stock_id,'STOCK'),t=stock.data.template;
    if(b.current_status!=='AVAILABLE'||b.data.expires_at<=await A.now(tx)||t.kind!=='SERVICE_CREDIT'||stock.owner_party_id!==room.data.producer_party_id||t.service_code!==b.data.service_code||t.production.face_minor!==b.data.credit_minor||t.valid_days!==b.data.valid_days)throw error('SERVICE_CREDIT_TEMPLATE_MISMATCH',409);
    const g=await require('./repository').issue(tx,a,stock,i.party_id,['COCREATION',b.id]);
    const data={...g.data,cocreation_benefit_id:b.id,expires_at:b.data.expires_at};await validSource(tx,{...g,data});return C.save(tx,a,g,'AVAILABLE',data,'SERVICE_CREDIT_LINKED');
   });});
 }
};}
module.exports={methods,validSource,consume};
