'use strict';
const A=require('../artists/context'),{digest}=require('../governance/content'),{id,error}=require('../party/policy');
const mismatch=()=>error('STORED_CONTENT_MISMATCH',503);
// Report history from the purchase/order snapshot; assignment is permission, never attribution.
async function attribution(tx,o){
 const q=o.data.quote;
 if(q.audition){
  return {person_ids:[id(q.audition.person_id)],attribution_basis:'AUDITION_ORDER_SNAPSHOT',business_type:'AUDITION',booking_id:id(q.audition.booking_id)};
 }
 if(q.stock_video){
  const raw=await A.one(tx,'SELECT * FROM stock_purchases WHERE order_id=? FOR SHARE',[o.id]);
  if(!raw)return {person_ids:[],attribution_basis:'NOT_RECORDED',business_type:'STOCK_VIDEO',booking_id:null};
  const p=require('../stock/context').checked(raw),snap=p.data.listing_snapshot;
  if(p.listing_id!==q.stock_video.listing_id||p.buyer_party_id!==o.buyer_party_id||p.data.offer_sha256!==q.stock_video.offer_sha256||digest(snap)!==q.stock_video.offer_sha256||!Array.isArray(snap.participants))throw mismatch();
  const person_ids=[...new Set(snap.participants.map(x=>id(x.person_id)))].sort();
  return {person_ids,attribution_basis:'STOCK_PURCHASE_SNAPSHOT',business_type:'STOCK_VIDEO',booking_id:null};
 }
 const avatar=q.commercial?.avatar_id;
 const link=avatar?await A.one(tx,'SELECT person_id FROM artist_avatar_links WHERE avatar_id=? FOR SHARE',[avatar]):null;
 return {person_ids:link?[link.person_id]:[],attribution_basis:link?'COMMERCIAL_AVATAR_LINK':'NOT_RECORDED',business_type:q.commercial?'COMMERCIAL':'OTHER',booking_id:null};
}
async function auditionResult(tx,o,who){
 if(!who.booking_id)return null;
 const raw=await A.one(tx,"SELECT * FROM audition_records WHERE id=? AND kind='BOOKING' FOR SHARE",[who.booking_id]);
 if(!raw)return null;
 const r=require('../auditions/context').checked(raw);
 if(r.data.order_id!==o.id||r.data.offer.person_id!==who.person_ids[0]||r.owner_party_id!==o.buyer_party_id||r.counterparty_id!==o.merchant_party_id||r.data.offer_sha256!==o.data.quote.audition.offer_sha256)throw mismatch();
 // Audit event codes distinguish refusal from expiry; free-text reasons are never parsed or disclosed.
 const event=await A.one(tx,"SELECT event_code FROM audition_audit WHERE record_id=? AND event_code IN ('AUDITION_ACCEPTED','AUDITION_DECLINED','AUDITION_ACCEPTANCE_EXPIRED') ORDER BY object_version DESC,id DESC LIMIT 1",[r.id]);
 const result={AUDITION_ACCEPTED:'ACCEPTED',AUDITION_DECLINED:'DECLINED',AUDITION_ACCEPTANCE_EXPIRED:'EXPIRED'}[event?.event_code]||(r.data.accepted_at?'ACCEPTED':r.current_status==='AWAITING_ACCEPTANCE'?'PENDING':'NOT_RECORDED');
 return {booking_id:r.id,status:r.current_status,acceptance_result:result,accepted_at:r.data.accepted_at||null};
}
module.exports={attribution,auditionResult};
