"use strict";
const A=require('../artists/context'),C=require('../guardians/context'),P=require('../guardians/policy');
const {id,error}=require('../party/policy'),{digest}=require('../governance/content');
const sections={NOTIFICATION_READS:'PROFILE',GUARDIAN_CASES:'PROFILE',GUARDIAN_CONTROLS:'PROFILE',GUARDIAN_USAGE:'PROFILE'};
const pick=(d,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(d,k)).map(k=>[k,d[k]]));
function checked(r){const d=A.parse(r.data_json);if(digest(d)!==r.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);return {...r,data:d};}
function integer(v){const n=Number(v);if(!Number.isSafeInteger(n)||n<0)throw error('STORED_CONTENT_MISMATCH',503);return n;}
async function active(tx,r){
 const link=r.kind==='LINK'?r:await C.load(tx,r.parent_id);
 if(link.kind!=='LINK'||link.guardian_account_id!==r.guardian_account_id||link.child_account_id!==r.child_account_id)throw error('STORED_CONTENT_MISMATCH',503);
 try{await C.active(tx,link);return link;}catch(e){if(['GUARDIAN_ACCOUNT_NOT_AVAILABLE','GUARDIAN_VERIFIED_IDENTITY_REQUIRED','GUARDIAN_LINK_NOT_ACTIVE'].includes(e.code))return null;throw e;}
}
function usage(r){return {local_date:r.local_date,seconds_reserved:integer(r.seconds_reserved),spend_reserved_minor:integer(r.spend_reserved_minor),measurement:'RESERVATIONS_NOT_ACTUAL_USE_OR_PAYMENT',real_minor_transactions_enabled:false};}
async function details(tx,r,link){
 if(r.kind==='LINK'){
  const today=P.date(await A.now(tx)),row=await A.one(tx,'SELECT * FROM guardian_usage WHERE child_account_id=? AND local_date=?',[r.child_account_id,today]);
  return {age_band:r.data.age_band,valid_until:r.data.valid_until,controls:pick(r.data.controls,['enabled','daily_minutes','single_minor','daily_minor']),rule:{rule_id:r.data.rule.rule_id,...pick(r.data.rule.terms,['version','daily_minutes','rest_minutes','single_minor','daily_minor','night_start','night_end','terms'])},today_usage:usage(row||{local_date:today,seconds_reserved:0,spend_reserved_minor:0}),real_minor_transactions_enabled:false};
 }
 const d=r.data,history=(d.history||[]).map(x=>pick(x,['action','at']));
 if(r.kind==='SPEND')return {...pick(d,['amount_minor','purpose','at']),real_payment_allowed:false,history};
 if(r.kind==='INFORMATION'){
  const row=await A.one(tx,'SELECT current_status,response_due_on FROM privacy_requests WHERE id=? AND account_id=?',[d.privacy_request_id,r.child_account_id]);
  return {...pick(d,['privacy_request_id','type','request_completion']),actual_privacy_status:row?.current_status||'NOT_CONFIRMED',response_due_on:row?.response_due_on||null,history};
 }
 if(r.kind==='REFUND'){
  let status='NOT_CONFIRMED';
  if(d.refund_id){const row=await A.one(tx,"SELECT t.* FROM trade_records t JOIN parties p ON p.id=t.buyer_party_id WHERE t.id=? AND t.kind='REFUND' AND p.kind='PERSON' AND p.personal_account_id=?",[d.refund_id,r.child_account_id]);if(row){const f=checked(row);if(f.data.payment_id!==d.payment_id)throw error('STORED_CONTENT_MISMATCH',503);status=f.current_status;}}
  return {...pick(d,['payment_id','reason','refund_id']),allocations:(d.allocations||[]).map(x=>pick(x,['line_id','amount_minor'])),actual_refund_status:status,history};
 }
 throw error('INVALID_INPUT',400);
}
async function page(tx,account,{section,after='',limit}){
 const result=(items,next_cursor)=>({section,items,next_cursor,coverage:'OWN_ACCOUNT_RECORDS_ONLY',request_completion:'NOT_CONFIRMED',original_documents_included:false});
 if(section==='NOTIFICATION_READS'){
  if(after&&!/^[1-9][0-9]{0,19}$/.test(after))throw error('INVALID_CURSOR',400);
  const q="SELECT r.event_id,MIN(r.read_at) AS read_at FROM ops_reads r JOIN parties p ON p.id=r.party_id WHERE r.account_id=? AND p.kind='PERSON' AND p.personal_account_id=?";
  if(after&&!(await tx.execute(q+' AND r.event_id=? GROUP BY r.event_id',[account,account,after]))[0].length)throw error('INVALID_CURSOR',400);
  const [rows]=await tx.execute(q+' AND r.event_id>? GROUP BY r.event_id ORDER BY r.event_id LIMIT ?',[account,account,after||'0',limit+1]);
  return result(rows.slice(0,limit).map(r=>({id:String(r.event_id),read_at:A.instant(r.read_at),content_included:false,content_access:'RECHECK_ORIGINAL_INBOX'})),rows.length>limit?String(rows[limit-1].event_id):null);
 }
 if(section==='GUARDIAN_USAGE'){
  if(after&&(!/^\d{4}-\d{2}-\d{2}$/.test(after)||!Number.isFinite(Date.parse(after))))throw error('INVALID_CURSOR',400);
  if(after&&!await A.one(tx,'SELECT local_date FROM guardian_usage WHERE child_account_id=? AND local_date=?',[account,after]))throw error('INVALID_CURSOR',400);
  const [rows]=await tx.execute('SELECT * FROM guardian_usage WHERE child_account_id=? AND local_date>? ORDER BY local_date LIMIT ?',[account,after,limit+1]);
  return result(rows.slice(0,limit).map(r=>({id:r.local_date,...usage(r),usage_subject:'SELF_ONLY'})),rows.length>limit?rows[limit-1].local_date:null);
 }
 if(!['GUARDIAN_CASES','GUARDIAN_CONTROLS'].includes(section))throw error('INVALID_INPUT',400);if(after)id(after);
 const filter=section==='GUARDIAN_CONTROLS'?"r.kind='LINK'":"r.kind IN ('INFORMATION','REFUND','SPEND')";
 const q=`SELECT r.* FROM guardian_records r WHERE ${filter} AND (r.guardian_account_id=? OR r.child_account_id=?)`;
 if(after&&!(await tx.execute(q+' AND r.id=?',[account,account,after]))[0].length)throw error('INVALID_CURSOR',400);
 const [rows]=await tx.execute(q+' AND r.id>? ORDER BY r.id LIMIT ?',[account,account,after,limit+1]),items=[];
 for(const raw of rows.slice(0,limit)){const r=checked(raw),link=await active(tx,r);items.push({id:r.id,kind:r.kind,parent_id:r.parent_id,current_status:r.current_status,object_version:r.object_version,created_at:A.instant(r.created_at),own_role:r.guardian_account_id===account?'GUARDIAN':'CHILD',detail_access:link?'AVAILABLE':'CURRENT_GUARDIAN_ACCESS_REQUIRED',data:link?await details(tx,r,link):null});}
 return result(items,rows.length>limit?rows[limit-1].id:null);
}
module.exports={sections,page};
