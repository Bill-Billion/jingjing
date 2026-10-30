'use strict';
const {randomUUID}=require('node:crypto');
const A=require('../artists/context'),P=require('./policy');
const {id,ref,error}=require('../party/policy'),{digest}=require('../governance/content');
function checked(row){if(!row)throw error('STOCK_NOT_FOUND',404);const data=A.parse(row.data_json);if(digest(data)!==row.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);return {...row,data};}
async function listing(tx,key,lock='FOR SHARE'){return checked(await A.one(tx,'SELECT * FROM stock_listings WHERE id=? '+lock,[id(key)]));}
async function purchase(tx,key){const order=checked(await A.one(tx,"SELECT * FROM trade_records WHERE id=? AND kind='ORDER' FOR UPDATE",[id(key)]));const p=checked(await A.one(tx,'SELECT * FROM stock_purchases WHERE order_id=? FOR UPDATE',[key]));return {order,p};}
function listingDTO(r){return {id:r.id,seller_party_id:r.seller_party_id,current_status:r.current_status,object_version:r.object_version,content_sha256:r.data_sha256,data:r.data};}
async function audit(tx,a,r,event,purchase=false){const key=purchase?r.order_id:r.id,eventId=randomUUID();await tx.execute('INSERT INTO stock_audit(id,record_id,actor_account_id,event_code,object_version,data_sha256,request_ref) VALUES (?,?,?,?,?,?,?)',[eventId,key,a?.id||null,event,r.object_version,digest(r.data),a?.request_id||randomUUID()]);if(purchase)return require('../operations/events').publishEvent(tx,{domain:'TRADE',record_id:key,event_id:eventId,event_code:event,object_version:r.object_version,actor_account_id:a?.id||null});return null;}
async function save(tx,a,r,data,event,status){const isPurchase=!!r.order_id,next={...r,data,object_version:r.object_version+1,data_sha256:digest(data),...(status?{current_status:status}:{})};await tx.execute('UPDATE '+(isPurchase?'stock_purchases':'stock_listings')+' SET data_json=?,data_sha256=?,object_version=?'+(isPurchase?'':',current_status=?')+' WHERE '+(isPurchase?'order_id':'id')+'=?',[JSON.stringify(data),next.data_sha256,next.object_version,...(isPurchase?[]:[next.current_status]),isPurchase?r.order_id:r.id]);await audit(tx,a,next,event,isPurchase);return next;}
async function command(tx,a,op,input,fn){const key=digest([a.id,op,ref(input.operation_key)]),hash=digest(input);try{await tx.execute('INSERT INTO stock_commands(id,fingerprint) VALUES (?,?)',[key,hash]);}catch(e){if(e.code!=='ER_DUP_ENTRY')throw e;const old=await A.one(tx,'SELECT * FROM stock_commands WHERE id=?',[key]);if(old.fingerprint!==hash)throw error('IDEMPOTENCY_CONFLICT',409);if(!old.result_json)throw error('IDEMPOTENCY_IN_PROGRESS',409);if(A.sha(old.result_json)!==old.result_sha256)throw error('STORED_CONTENT_MISMATCH',503);return JSON.parse(old.result_json);}const r=await fn(),text=JSON.stringify(r);await tx.execute('UPDATE stock_commands SET result_json=?,result_sha256=? WHERE id=?',[text,A.sha(text),key]);return r;}
async function reviewer(tx,a,r,action){if(!await require('../governance/operator-access').authorizeOperator(tx,{account_id:a.id,action}))throw error('STOCK_REVIEW_FORBIDDEN',403);if(r&&(r.created_by===a.id||await A.one(tx,"SELECT id FROM party_memberships WHERE account_id=? AND party_id=? AND current_status='ACTIVE'",[a.id,r.seller_party_id])))throw error('SELF_REVIEW_FORBIDDEN',403);}
async function video(tx,key,seller){await require('../privacy/restrictions').assertUnrestricted(tx,'ASSET',key);const a=await A.one(tx,'SELECT * FROM supply_assets WHERE id=? FOR SHARE',[id(key)]);if(!a||a.owner_party_id!==seller||a.current_status!=='READY'||a.purpose!=='WORK_CONTENT'||a.media_type!=='video/mp4')throw error('STOCK_VIDEO_NOT_READY',409);return a;}
async function validateRights(tx,r,a){if(r.id)await require('../privacy/restrictions').assertUnrestricted(tx,'STOCK_LISTING',r.id);
 const sellerParty=await A.activeParty(tx,r.seller_party_id);const at=await A.now(tx),snap=[];
 const seller=await A.person(tx,r.data.seller_person_id);require('../artists/policy').adult(seller,at);
 await A.authorize(tx,a||{id:r.created_by},seller,r.seller_party_id,'SUBMIT_LISTING');
 const [halos]=await tx.execute("SELECT * FROM artist_records WHERE person_id=? AND kind='HALO' AND current_status='APPROVED' FOR SHARE",[seller.id]);
 if(!halos.map(A.checked).some(h=>h.data.level===1&&h.data.valid_until>at))throw error('STOCK_L1_REQUIRED',409);
 for(const x of r.data.participants){const p=await A.person(tx,x.person_id);require('../artists/policy').adult(p,at);await A.avatar(tx,x.avatar_id,p);if(sellerParty.kind==='ORGANIZATION')await A.authorize(tx,a||{id:r.created_by},p,r.seller_party_id,'SUBMIT_LISTING');
  const c=await A.load(tx,x.consent_id,'CONSENT');if(c.person_id!==p.id||c.avatar_id!==x.avatar_id||c.current_status!=='APPROVED'||c.data.grantee_party_id!==r.seller_party_id||!['STOCK_LICENSE','PUBLIC_DISPLAY'].every(v=>c.data.purposes.includes(v))||!c.data.territories.includes('WORLDWIDE')||!require('../artists/policy').active(c.data,at))throw error('STOCK_SALE_CONSENT_REQUIRED',409);
  snap.push({person_id:p.id,avatar_id:x.avatar_id,consent_id:c.id,content_sha256:c.content_sha256});
 }
 if(r.data.rights_snapshot&&digest(snap)!==digest(r.data.rights_snapshot))throw error('STOCK_RIGHTS_CHANGED',409);
 await A.assets(tx,r.data.rights_evidence_ids,r.seller_party_id,['RIGHTS_EVIDENCE','CONSENT_EVIDENCE']);
 const full=await video(tx,r.data.file_id,r.seller_party_id),preview=await video(tx,r.data.preview_file_id,r.seller_party_id);
 await require('../media/policy').receipt(tx,full,'MODERATE_FILE');await require('../media/policy').receipt(tx,preview,'MODERATE_FILE');await require('../media/policy').receipt(tx,full,'MARK_VIDEO',{variant:'final'});await require('../media/policy').receipt(tx,preview,'MARK_VIDEO',{variant:'preview'});
 if(full.content_sha256===preview.content_sha256)throw error('STOCK_SEPARATE_PREVIEW_REQUIRED',409);
 if(r.data.files&&(full.content_sha256!==r.data.files.full_sha256||preview.content_sha256!==r.data.files.preview_sha256))throw error('STORED_CONTENT_MISMATCH',503);
 return {rights_snapshot:snap,files:{full_sha256:full.content_sha256,preview_sha256:preview.content_sha256}};
}
async function listed(tx,key){const r=await listing(tx,key);if(r.current_status!=='LISTED')throw error('STOCK_NOT_LISTED',409);if(r.data.sales_publication_id)await require('./sales-publications').binding(tx,r.seller_party_id,r.data.spec_id,r.data.rule_id,r.data.sales_publication_id);await validateRights(tx,r);return r;}
function publicDTO(r){return {id:r.id,seller_party_id:r.seller_party_id,title:r.data.title,description:r.data.description,city:r.data.city,person_ids:r.data.participants.map(x=>x.person_id),unit_minor:r.data.spec.unit_minor,currency:'CNY',license:P.license(r.data.spec.specification),object_version:r.object_version,offer_sha256:r.data_sha256};}
async function bind(tx,order,r){const data={status:'AWAITING_PAYMENT',listing_snapshot:r.data,offer_sha256:r.data_sha256,license:P.license(r.data.spec.specification),granted_at:null,notification_event_id:null,viewed_at:null,observed_rights_epoch:null,receipt_at:null,deadline_at:null,job_id:null,accepted_at:null,acceptance_method:null,cases:[],current_case_id:null};await tx.execute('INSERT INTO stock_purchases(order_id,listing_id,buyer_party_id,data_json,data_sha256) VALUES (?,?,?,?,?)',[order.id,r.id,order.buyer_party_id,JSON.stringify(data),digest(data)]);}
async function paymentAllowed(tx,order){if(!order.data.quote.stock_video)return;if(Date.parse(order.data.quote.expires_at)<=Date.parse(await A.now(tx)))throw error('STOCK_CHECKOUT_EXPIRED',409);await listed(tx,order.data.quote.stock_video.listing_id);const p=checked(await A.one(tx,'SELECT * FROM stock_purchases WHERE order_id=? FOR SHARE',[order.id]));if(p.data.current_case_id)throw error('STOCK_AFTERCARE_PENDING',409);}
async function financial(tx,order){
 if(!order.data.quote.stock_video)return;const p=checked(await A.one(tx,'SELECT * FROM stock_purchases WHERE order_id=? FOR UPDATE',[order.id]));let d={...p.data};
 if(order.data.financial.refunded_minor>0){d.status='REVOKED';d.deadline_at=null;d.job_id=null;}
 else if(order.current_status==='PAYMENT_REVIEW_REQUIRED'){d.status='PAYMENT_REVIEW_REQUIRED';d.deadline_at=null;d.job_id=null;}
 else if(order.current_status==='PAID'&&!d.granted_at){d.granted_at=await A.now(tx);d.status='ACTIVE';}
 if(digest(d)===digest(p.data))return;
 const issued=!p.data.granted_at&&!!d.granted_at,event=d.status==='ACTIVE'?'STOCK_LICENSE_GRANTED':d.status==='REVOKED'?'STOCK_LICENSE_REVOKED':'STOCK_PAYMENT_REVIEW_REQUIRED';
 const next=await save(tx,null,p,d,event);if(issued){d.notification_event_id=await audit(tx,null,next,'STOCK_DELIVERY_AVAILABLE',true);await tx.execute('UPDATE stock_purchases SET data_json=?,data_sha256=? WHERE order_id=?',[JSON.stringify(d),digest(d),p.order_id]);}
}
async function refundAllowed(tx,order,allocations){if(!order.data.quote.stock_video)return;const p=checked(await A.one(tx,'SELECT * FROM stock_purchases WHERE order_id=? FOR SHARE',[order.id]));if(allocations.length!==1||allocations[0].line_id!=='stock'||allocations[0].amount_minor!==order.data.quote.total_minor)throw error('STOCK_FULL_REFUND_REQUIRED',409);if(p.data.granted_at&&!p.data.cases.some(c=>c.resolution?.decision==='REFUND'))throw error('STOCK_REFUND_REVIEW_REQUIRED',409);}
async function usable(tx,order,p){await require('../privacy/restrictions').assertUnrestricted(tx,'STOCK_LISTING',p.listing_id);await currentPurchaseConsent(tx,order,p);if(order.current_status!=='PAID'||p.data.status!=='ACTIVE'||p.data.current_case_id)throw error('STOCK_LICENSE_NOT_ACTIVE',409);const r=await listing(tx,p.listing_id);if(r.data.rights_hold===true)throw error('STOCK_RIGHTS_HOLD',409);const file=await video(tx,p.data.listing_snapshot.file_id,order.merchant_party_id);if(file.content_sha256!==p.data.listing_snapshot.files.full_sha256)throw error('STORED_CONTENT_MISMATCH',503);return file;}
// Further downloads recheck the consent captured by the purchase, without
// rewriting the purchased licence, issuing refunds, or applying new seller tiers.
async function currentPurchaseConsent(tx,order,p){
 const at=await A.now(tx);
 for(const x of p.data.listing_snapshot.participants){
  const person=await A.person(tx,x.person_id);await A.activeParty(tx,person.owner_party_id);
  const c=await A.load(tx,x.consent_id,'CONSENT');
  if(c.person_id!==person.id||c.avatar_id!==x.avatar_id||c.current_status!=='APPROVED'||c.data.grantee_party_id!==order.merchant_party_id||!['STOCK_LICENSE','PUBLIC_DISPLAY'].every(v=>c.data.purposes.includes(v))||!require('../artists/policy').active(c.data,at))throw error('STOCK_SALE_CONSENT_REQUIRED',409);
 }
}
module.exports={checked,listing,purchase,listingDTO,audit,save,command,reviewer,video,validateRights,listed,publicDTO,bind,paymentAllowed,financial,refundAllowed,usable};
