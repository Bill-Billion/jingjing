'use strict';
const {id,error}=require('../party/policy');
const {digest}=require('../governance/content');
const A=require('../artists/context');
const one=async(tx,q,a)=>(await tx.execute(q,a))[0][0];
const sections={...require('./representative-copy').sections,ACCOUNT:'PROFILE',PREFERENCES:'PROFILE',ARTISTS:'PROFILE',WALLET:'TRANSACTIONS',FINANCE:'TRANSACTIONS',FINANCE_AGREEMENTS:'CONTRACTS',...require('./message-risk-copy').sections,...require('./audition-location-copy').sections,...require('./guardian-recharge-copy').sections,...require('./agreement-copy').sections,...require('./identity-copy').sections,...require('./activity-copy').sections,...require('./guardian-copy').sections,...require('./benefit-copy').sections,...require('./participation-copy').sections,...require('./security-copy').sections,...require('./related-history-copy').sections};
const pick=(data,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(data,k)).map(k=>[k,data[k]]));
function checked(r){const d=A.parse(r.data_json);if(digest(d)!==r.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);return d;}
const walletFields={
 ACCOUNT:['rule_id','rule_sha256','rule','opened_at'],
 RECHARGE:['amount_minor','refunded_minor','currency','created_at','occurred_at'],
 CASH_RECEIPT:['amount_minor','occurred_at'],
 CASH_SPEND:['order_id','payment_id','currency','amount_minor','allocations','refund_ids'],
 CASH_REFUND:['payment_id','refund_id','amount_minor','currency'],
 RECHARGE_REFUND:['recharge_id','requested_minor','amount_minor','currency','reason','created_at','submitted_at','settled_at'],
 RECHARGE_REFUND_RECEIPT:['refund_id','recharge_id','amount_minor','currency','occurred_at'],
 EARNING:['order_id','category','rule_id','rule','source_kind','paid_minor','refunded_minor','points','reversed','growth_reversed','spent','expired','expires_at','issued_at','available_at','pending_shortfall','debt_offset','debt_settled'],
 POINT_HOLD:['purpose','reference','points','allocations','reason','expires_at'],
 CASH_RECONCILIATION:['statement_id','observed_at','occurred_at','local_available_minor','provider_available_minor','meaning'],
 LEVEL_REVIEW:['valid_from','valid_until','terms'],
};
async function page(tx,a,request,{section,after='',limit},env={}){
 if(typeof section!=='string'||!Object.hasOwn(sections,section))throw error('INVALID_INPUT',400);
 if(!request.scopes.some(s=>s==='ALL'||s===sections[section]))throw error('PRIVACY_ACTION_SCOPE_MISMATCH',409);
 if(Object.hasOwn(require('./representative-copy').sections,section))return require('./representative-copy').page(tx,a.id,{section,after,limit});
 if(Object.hasOwn(require('./message-risk-copy').sections,section))return require('./message-risk-copy').page(tx,a.id,{section,after,limit});
 if(Object.hasOwn(require('./audition-location-copy').sections,section))return require('./audition-location-copy').page(tx,a.id,{section,after,limit});
 if(Object.hasOwn(require('./guardian-recharge-copy').sections,section))return require('./guardian-recharge-copy').page(tx,a.id,{section,after,limit});
 if(Object.hasOwn(require('./agreement-copy').sections,section))return require('./agreement-copy').page(tx,a.id,{section,after,limit});
 if(Object.hasOwn(require('./identity-copy').sections,section))return require('./identity-copy').page(tx,a.id,{section,after,limit});
 if(Object.hasOwn(require('./related-history-copy').sections,section))return require('./related-history-copy').page(tx,a.id,{section,after,limit});
 if(Object.hasOwn(require('./security-copy').sections,section))return require('./security-copy').page(tx,a.id,{section,after,limit});
 if(Object.hasOwn(require('./activity-copy').sections,section))return require('./activity-copy').page(tx,a.id,{section,after,limit},env);
 if(Object.hasOwn(require('./guardian-copy').sections,section))return require('./guardian-copy').page(tx,a.id,{section,after,limit});
 if(Object.hasOwn(require('./benefit-copy').sections,section))return require('./benefit-copy').page(tx,a.id,{section,after,limit});
 if(Object.hasOwn(require('./participation-copy').sections,section))return require('./participation-copy').page(tx,a.id,{section,after,limit});
 const result=(items,next_cursor=null)=>({section,items,next_cursor,coverage:'OWN_ACCOUNT_RECORDS_ONLY',request_completion:'NOT_CONFIRMED'});
 if(section==='ACCOUNT'||section==='PREFERENCES'){
  if(after)throw error('INVALID_CURSOR',400);
  if(section==='ACCOUNT'){
   const personal=await one(tx,"SELECT id,kind,display_name,current_status,object_version,created_at FROM parties WHERE kind='PERSON' AND personal_account_id=?",[a.id]);
   return result([{...pick(a,['id','display_name','current_status','object_version']),created_at:A.instant(a.created_at),personal_party:personal?{...personal,created_at:A.instant(personal.created_at)}:null}]);
  }
  const p=await one(tx,'SELECT * FROM privacy_preferences WHERE account_id=?',[a.id]);
  return result([{id:a.id,object_version:p?.object_version||0,...require('./notification-policy').normalize(p?checked(p):{personalization:false,marketing:false,rest_reminder_minutes:0})}]);
 }
 if(section==='ARTISTS'){
  if(after)id(after);
  const q="SELECT a.* FROM artist_people a JOIN parties p ON p.id=a.owner_party_id WHERE p.kind='PERSON' AND p.personal_account_id=?";
  if(after&&!(await tx.execute(q+' AND a.id=?',[a.id,after]))[0].length)throw error('INVALID_CURSOR',400);
  const [rows]=await tx.execute(q+' AND a.id>? ORDER BY a.id LIMIT ?',[a.id,after,limit+1]);
  return result(rows.slice(0,limit).map(r=>({...A.personDTO({...r,identity_valid_until:A.instant(r.identity_valid_until)}),created_at:A.instant(r.created_at)})),rows.length>limit?rows[limit-1].id:null);
 }
 if(section==='WALLET'){
  if(after)id(after);
  const q="SELECT w.* FROM wallet_records w JOIN parties p ON p.id=w.owner_party_id WHERE p.kind='PERSON' AND p.personal_account_id=? AND w.kind IN ("+Object.keys(walletFields).map(()=>'?').join(',')+')';
  const args=[a.id,...Object.keys(walletFields)];
  if(after&&!(await tx.execute(q+' AND w.id=?',[...args,after]))[0].length)throw error('INVALID_CURSOR',400);
  const [rows]=await tx.execute(q+' AND w.id>? ORDER BY w.id LIMIT ?',[...args,after,limit+1]);
  return result(rows.slice(0,limit).map(r=>{const d=checked(r);return {id:r.id,kind:r.kind,current_status:r.current_status,object_version:r.object_version,data:pick(d,walletFields[r.kind]),environment:d.binding?.environment||null};}),rows.length>limit?rows[limit-1].id:null);
 }
 if(section==='FINANCE'){
  if(after&&!/^[1-9][0-9]{0,19}$/.test(after))throw error('INVALID_CURSOR',400);
  const q="SELECT e.*,g.data_json AS agreement_json,g.data_sha256 AS agreement_sha256 FROM finance_entries e JOIN parties p ON p.id=e.party_id JOIN finance_records g ON g.id=e.agreement_id WHERE p.kind='PERSON' AND p.personal_account_id=?";
  if(after&&!(await tx.execute(q+' AND e.id=?',[a.id,after]))[0].length)throw error('INVALID_CURSOR',400);
  const [rows]=await tx.execute(q+' AND e.id>? ORDER BY e.id LIMIT ?',[a.id,after||'0',limit+1]);
  return result(rows.slice(0,limit).map(r=>{checked(r);if(!Number.isSafeInteger(Number(r.amount_minor)))throw error('STORED_CONTENT_MISMATCH',503);const g=checked({data_json:r.agreement_json,data_sha256:r.agreement_sha256});return {id:String(r.id),agreement_id:r.agreement_id,source_id:r.source_id,party_id:r.party_id,category:r.category,amount_minor:Number(r.amount_minor),environment:g.environment,currency:g.currency,created_at:A.instant(r.created_at)};}),rows.length>limit?String(rows[limit-1].id):null);
 }
 if(after)id(after);
 const q="SELECT DISTINCT g.* FROM finance_records g JOIN parties p ON JSON_CONTAINS(JSON_EXTRACT(g.data_json,'$.parties'),JSON_QUOTE(p.id)) WHERE g.kind='AGREEMENT' AND p.kind='PERSON' AND p.personal_account_id=?";
 if(after&&!(await tx.execute(q+' AND g.id=?',[a.id,after]))[0].length)throw error('INVALID_CURSOR',400);
 const [rows]=await tx.execute(q+' AND g.id>? ORDER BY g.id LIMIT ?',[a.id,after,limit+1]);
 return result(rows.slice(0,limit).map(r=>{const d=checked(r),terms=pick(d,['previous_agreement_id','source_type','source_id','environment','currency','rule_id','rule_snapshot','rules','parties']);return {id:r.id,current_status:r.current_status,object_version:r.object_version,source_content_sha256:r.data_sha256,copy_sha256:digest(terms),copy_kind:'REDACTED_AGREEMENT_COPY',terms};}),rows.length>limit?rows[limit-1].id:null);
}
module.exports={page,sections};
