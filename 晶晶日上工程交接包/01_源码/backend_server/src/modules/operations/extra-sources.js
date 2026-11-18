"use strict";
const A=require('../artists/context'),{error}=require('../party/policy');
const domains=['SUPPORT','ENGAGEMENT','AUDITION_MESSAGE','GIG_MESSAGE'];
async function read(tx,principal,domain,key,party){
 const db={withTransaction:fn=>fn(tx),execute:(...args)=>tx.execute(...args)},options={resolvePrincipal:async()=>principal};
 if(domain==='SUPPORT')return {...await require('../support/repository').createSupportRepository(db,options).read({}, {ticket_id:key,party_id:party,operations:false}),kind:'SUPPORT_TICKET'};
 if(domain==='ENGAGEMENT')return require('../engagement/repository').createEngagementRepository(db,options).read({}, {record_id:key,party_id:party});
 if(domain==='AUDITION_MESSAGE'){
  const m=await require('../auditions/context').load(tx,key,'MESSAGE','FOR SHARE');if(m.current_status!=='SENT')throw error('NOTIFICATION_NOT_FOUND',404);
  await require('../auditions/repository').createAuditionsRepository(db,options).messages({}, {record_id:m.parent_id,party_id:party,limit:1});return m;
 }
 const m=await require('../gigs/context').load(tx,key,'COMMERCIAL_MESSAGE','FOR SHARE');if(m.current_status!=='SENT')throw error('NOTIFICATION_NOT_FOUND',404);
 await require('../gigs/repository').createGigsRepository(db,options).commercialMessages({}, {order_id:m.data.order_id,party_id:party,limit:1});return m;
}
async function audience(tx,domain,key){
 if(domain==='SUPPORT'){const r=await A.one(tx,'SELECT party_id FROM support_tickets WHERE id=?',[key]);return r?[r.party_id]:[];}
 if(domain==='ENGAGEMENT'){const r=await A.one(tx,'SELECT owner_party_id FROM engagement_records WHERE id=?',[key]);return r?.owner_party_id?[r.owner_party_id]:[];}
 if(domain==='AUDITION_MESSAGE'){const m=await require('../auditions/context').load(tx,key,'MESSAGE','FOR SHARE'),r=await require('../auditions/context').load(tx,m.parent_id,'BOOKING','FOR SHARE');return [...new Set([r.owner_party_id,r.counterparty_id].filter(Boolean))];}
 const m=await require('../gigs/context').load(tx,key,'COMMERCIAL_MESSAGE','FOR SHARE'); // Source fields come from a checked order, not the message payload alone.
 const raw=await A.one(tx,'SELECT * FROM trade_records WHERE id=?',[m.data.order_id]);const order=require('../gigs/context').checked(raw);return [...new Set([order.buyer_party_id,order.merchant_party_id,order.data.quote.commercial?.relation?.mcn_party_id].filter(Boolean))];
}
module.exports={domains,read,audience};
