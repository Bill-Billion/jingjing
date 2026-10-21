"use strict";
const {id,shape,error}=require('../party/policy');
const {digest}=require('../governance/content');
const C=require('./context'),P=require('./policy');
function purchaseFingerprint(r){return digest({service_id:r.id,person_id:r.person_id,avatar_id:r.avatar_id,merchant_party_id:r.counterparty_id,kind:r.data.kind,spec_id:r.data.spec_id,specification:r.data.specification,price_minor:r.data.price_minor,currency:r.data.currency});}
async function quoteContext(tx,{source,buyer,merchant,lines}){
 shape(source,['service_id']);const r=await C.load(tx,id(source.service_id),'SERVICE'),p=await C.person(tx,r.person_id);P.adult(p,await C.now(tx));await C.activeParty(tx,p.owner_party_id);await C.activeParty(tx,merchant);
 if(r.current_status!=='REQUESTED'||p.owner_party_id!==buyer||r.counterparty_id!==merchant||lines.length!==1||lines[0].spec_id!==r.data.spec_id||lines[0].quantity!==1||lines[0].total_minor!==r.data.price_minor||lines[0].product_profile?.type!==r.data.kind||digest(lines[0].specification)!==digest(r.data.specification))throw error('ARTIST_SERVICE_QUOTE_MISMATCH',409);
 return {service_id:r.id,person_id:p.id,avatar_id:r.avatar_id,service_sha256:purchaseFingerprint(r),kind:r.data.kind,spec_id:r.data.spec_id,specification:r.data.specification,price_minor:r.data.price_minor};
}
async function bindOrder(tx,order){const v=order.data.quote.artist_service;if(!v)return;const actual=await quoteContext(tx,{source:{service_id:v.service_id},buyer:order.buyer_party_id,merchant:order.merchant_party_id,lines:order.data.quote.lines});if(digest(v)!==digest(actual))throw error('ARTIST_SERVICE_CHANGED',409);try{await tx.execute('INSERT INTO artist_service_orders(service_id,order_id) VALUES (?,?)',[v.service_id,order.id]);}catch(e){if(e.code==='ER_DUP_ENTRY')throw error('ARTIST_SERVICE_ORDER_EXISTS',409);throw e;}}
async function checkPayment(tx,order){const v=order.data.quote.artist_service;if(!v)return;const r=await C.load(tx,v.service_id,'SERVICE'),p=await C.person(tx,r.person_id);P.adult(p,await C.now(tx));if(r.current_status!=='REQUESTED'||purchaseFingerprint(r)!==v.service_sha256)throw error('ARTIST_SERVICE_NOT_PAYABLE',409);}
module.exports={quoteContext,bindOrder,checkPayment};
