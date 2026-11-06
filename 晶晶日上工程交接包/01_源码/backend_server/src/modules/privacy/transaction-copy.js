'use strict';
const {id,error}=require('../party/policy');
const {digest,verifyUnsignedContent}=require('../governance/content');
const {instant}=require('../customization/submission-hash');
const one=async(tx,sql,args)=>(await tx.execute(sql,args))[0][0];
const sections=['ORDERS','SUMMARY','PAYMENTS','REFUNDS','JOURNAL','CONTRACT'];
function checked(row){const data=typeof row.data_json==='string'?JSON.parse(row.data_json):row.data_json;if(digest(data)!==row.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);return data;}
function money(value){if(typeof value!=='number'&&!(typeof value==='string'&&/^\d+$/.test(value)))throw error('FINANCIAL_INVARIANT_BROKEN',503);const n=Number(value);if(!Number.isSafeInteger(n)||n<0||n>900000000000)throw error('FINANCIAL_INVARIANT_BROKEN',503);return n;}
function orderItem(r){const d=checked(r);return {id:r.id,current_status:r.current_status,object_version:r.object_version,buyer_party_id:r.buyer_party_id,merchant_party_id:r.merchant_party_id,roles:[...(r.personal_party_id===r.buyer_party_id?['BUYER']:[]),...(r.personal_party_id===r.merchant_party_id?['MERCHANT']:[])],currency:d.quote.currency,total_minor:money(d.quote.total_minor)};}
async function own(tx,account,orderId){
 const row=await one(tx,"SELECT r.*,p.id AS personal_party_id FROM trade_records r JOIN parties p ON p.id IN (r.buyer_party_id,r.merchant_party_id) WHERE r.id=? AND r.kind='ORDER' AND p.kind='PERSON' AND p.personal_account_id=? FOR SHARE",[id(orderId),account]);
 if(!row)throw error('PRIVACY_TARGET_NOT_FOUND',404);checked(row);return row;
}
function paymentItem(r){const d=checked(r);return {id:r.id,order_id:r.order_id,parent_id:r.parent_id,kind:r.kind,current_status:r.current_status,object_version:r.object_version,provider:d.provider,environment:d.environment,currency:d.currency,amount_minor:money(d.amount_minor),installment_key:d.installment_key||null,allocations:d.allocations.map(x=>({line_id:x.line_id,amount_minor:money(x.amount_minor)})),reason:r.kind==='REFUND'?d.reason:null,created_at:instant(r.created_at)};}
function contractItem(order){
 const d=checked(order);let snapshot;
 try{snapshot=verifyUnsignedContent(d.contract);}catch{throw error('STORED_CONTENT_MISMATCH',503);}
 if(!snapshot.party_ids.includes(order.buyer_party_id)||!snapshot.party_ids.includes(order.merchant_party_id)||digest(snapshot.commitments.quote)!==digest(d.quote))throw error('STORED_CONTENT_MISMATCH',503);
 const {content_sha256,...terms}=JSON.parse(JSON.stringify(snapshot)),redacted=[];
 // The original stays immutable. This explicitly labelled copy removes only
 // known internal approval fields, and has its own checksum, never the source checksum.
 if(Object.hasOwn(terms.commitments.quote,'review')){delete terms.commitments.quote.review;redacted.push('commitments.quote.review');}
 for(const [n,line] of terms.commitments.quote.lines.entries())if(Object.hasOwn(line,'review')){delete line.review;redacted.push(`commitments.quote.lines[${n}].review`);}
 return {id:order.id,source_contract_id:snapshot.id,contract_version_id:snapshot.contract_version_id,source_content_sha256:content_sha256,copy_sha256:digest(terms),copy_kind:'REDACTED_CONTRACT_COPY',redacted_paths:redacted,signing_method:snapshot.signing_method,terms};
}
async function page(tx,account,{section,order_id,after='',limit}){
 if(!sections.includes(section))throw error('INVALID_INPUT',400);
 if(section==='ORDERS'){
  if(order_id)throw error('INVALID_INPUT',400);if(after)await own(tx,account,after);
  const [rows]=await tx.execute("SELECT r.*,p.id AS personal_party_id FROM trade_records r JOIN parties p ON p.id IN (r.buyer_party_id,r.merchant_party_id) WHERE r.kind='ORDER' AND p.kind='PERSON' AND p.personal_account_id=? AND r.id>? ORDER BY r.id LIMIT ?",[account,after,limit+1]);
  return result(section,null,rows.slice(0,limit).map(orderItem),rows.length>limit?rows[limit-1].id:null);
 }
 const order=await own(tx,account,order_id),data=checked(order);
 if(section==='CONTRACT'||section==='SUMMARY'){
  if(after)throw error('INVALID_CURSOR',400);
  if(section==='CONTRACT')return result(section,order.id,[contractItem(order)],null);
  const totals=await one(tx,"SELECT COALESCE(SUM(CASE WHEN direction='RECEIPT' THEN amount_minor ELSE 0 END),0) AS received,COALESCE(SUM(CASE WHEN direction='REFUND' THEN amount_minor ELSE 0 END),0) AS refunded FROM trade_journal WHERE order_id=?",[order.id]);
  const received=money(totals.received),refunded=money(totals.refunded);
  if(refunded>received||!data.financial||received!==data.financial.received_minor||refunded!==data.financial.refunded_minor||received-refunded!==data.financial.net_minor)throw error('FINANCIAL_INVARIANT_BROKEN',503);
  return result(section,order.id,[{...orderItem(order),financial:{received_minor:received,refunded_minor:refunded,net_minor:received-refunded},installments:data.quote.installments.map(x=>({key:x.key,trigger:x.trigger,allocations:x.allocations.map(a=>({line_id:a.line_id,amount_minor:money(a.amount_minor)}))}))}],null);
 }
 if(section==='JOURNAL'){
  if(after&&!await one(tx,'SELECT id FROM trade_journal WHERE id=? AND order_id=?',[id(after),order.id]))throw error('INVALID_CURSOR',400);
  const [rows]=await tx.execute('SELECT * FROM trade_journal WHERE order_id=? AND id>? ORDER BY id LIMIT ?',[order.id,after,limit+1]),items=[];
  for(const r of rows.slice(0,limit)){
   const source=await one(tx,'SELECT * FROM trade_records WHERE id=? AND order_id=?',[r.source_id,order.id]);
   if(!source||source.kind!==(r.direction==='RECEIPT'?'PAYMENT':'REFUND'))throw error('STORED_CONTENT_MISMATCH',503);
   const d=checked(source);if(money(r.amount_minor)!==d.amount_minor||r.currency!==d.currency||source.buyer_party_id!==order.buyer_party_id||source.merchant_party_id!==order.merchant_party_id)throw error('FINANCIAL_INVARIANT_BROKEN',503);
   items.push({id:r.id,source_id:r.source_id,order_id:r.order_id,direction:r.direction,currency:r.currency,amount_minor:money(r.amount_minor),environment:d.environment,created_at:instant(r.created_at)});
  }
  return result(section,order.id,items,rows.length>limit?rows[limit-1].id:null);
 }
 const kind=section==='PAYMENTS'?'PAYMENT':'REFUND';
 if(after&&!await one(tx,'SELECT id FROM trade_records WHERE id=? AND order_id=? AND kind=?',[id(after),order.id,kind]))throw error('INVALID_CURSOR',400);
 const [rows]=await tx.execute('SELECT * FROM trade_records WHERE order_id=? AND kind=? AND id>? ORDER BY id LIMIT ?',[order.id,kind,after,limit+1]);
 const items=rows.slice(0,limit).map(r=>{if(r.buyer_party_id!==order.buyer_party_id||r.merchant_party_id!==order.merchant_party_id)throw error('STORED_CONTENT_MISMATCH',503);return paymentItem(r);});
 return result(section,order.id,items,rows.length>limit?rows[limit-1].id:null);
}
function result(section,order_id,items,next_cursor){return {section,order_id,items,next_cursor,coverage:'OWN_TRADE_RECORDS_ONLY',request_completion:'NOT_CONFIRMED'};}
module.exports={page};
