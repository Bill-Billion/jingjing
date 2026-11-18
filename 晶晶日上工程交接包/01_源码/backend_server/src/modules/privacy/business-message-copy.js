"use strict";
const {id,error}=require('../party/policy');
const A=require('../artists/context');

// An internal working draft, not a delivered personal-data copy. Keep the actual
// operator principal: PRIVACY_HANDLE never impersonates the applicant or grants
// access to a business conversation. Both checks share the enclosing transaction.
async function page(tx,ctx,account,request,i,{resolvePrincipal}){
 if(!['COMMERCIAL','AUDITION'].includes(i.source))throw error('INVALID_INPUT',400);
 id(i.source_id);if(i.after)id(i.after);
 if(!Number.isSafeInteger(i.limit)||i.limit<1||i.limit>100)throw error('INVALID_LIMIT',400);
 if(!request.scopes.some(x=>['ALL','TRANSACTIONS'].includes(x)))throw error('PRIVACY_ACTION_SCOPE_MISMATCH',409);
 const personal=await A.one(tx,"SELECT id FROM parties WHERE kind='PERSON' AND personal_account_id=? FOR SHARE",[account.id]);
 if(!personal)throw error('PRIVACY_TARGET_NOT_FOUND',404);
 const unit={withTransaction:fn=>fn(tx)};let messages;
 if(i.source==='COMMERCIAL'){
  const o=await A.one(tx,"SELECT id FROM trade_records WHERE id=? AND kind='ORDER' AND (buyer_party_id=? OR merchant_party_id=?) FOR SHARE",[i.source_id,personal.id,personal.id]);
  if(!o)throw error('PRIVACY_TARGET_NOT_FOUND',404);
  // Do not create a conversation as a side-effect of requesting a copy.
  if(!await A.one(tx,'SELECT record_id FROM gig_conversations WHERE order_id=?',[i.source_id]))throw error('PRIVACY_MESSAGE_SOURCE_NOT_READY',409);
  messages=await require('../gigs/repository').createGigsRepository(unit,{resolvePrincipal}).commercialMessages(ctx,{order_id:i.source_id,party_id:null,after:i.after,limit:i.limit});
 }else{
  const b=await A.one(tx,"SELECT id FROM audition_records WHERE id=? AND kind='BOOKING' AND (owner_party_id=? OR counterparty_id=?) FOR SHARE",[i.source_id,personal.id,personal.id]);
  if(!b)throw error('PRIVACY_TARGET_NOT_FOUND',404);
  messages=await require('../auditions/repository').createAuditionsRepository(unit,{resolvePrincipal}).messages(ctx,{record_id:i.source_id,party_id:null,after:i.after,limit:i.limit});
 }
 const items=messages.items.map(m=>{
  const hidden=m.current_status==='HIDDEN'||m.data.hidden===true;
  return {id:m.id,kind:m.data.kind,current_status:m.current_status,sender:m.created_by===account.id?'APPLICANT':'OTHER',at:m.data.at,
   body:!hidden&&m.data.kind==='TEXT'?m.data.body:null,hidden,
   attachment_present:!hidden&&['MEDIA','DELIVERY_MEDIA'].includes(m.data.kind)};
 });
 return {source:i.source,source_id:i.source_id,copy_kind:'BUSINESS_MESSAGE_REVIEW_DRAFT',third_party_redaction:'REQUIRES_MANUAL_REVIEW',
  original_attachments_included:false,request_completion:'NOT_CONFIRMED',items,next_cursor:messages.next_cursor};
}
module.exports={page};
