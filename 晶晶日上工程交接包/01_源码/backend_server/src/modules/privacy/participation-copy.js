"use strict";
const A=require('../artists/context'),{id,error}=require('../party/policy'),{digest}=require('../governance/content');
const sections=Object.fromEntries(['PRIVACY_REQUESTS','PRIVACY_RESPONSES','PRIVACY_EVENTS','PRIVACY_ACTIONS','PRIVACY_EXECUTIONS','NOTIFICATION_DELIVERIES','GUARDIAN_LINKS','ENGAGEMENT_RECORDS'].map(k=>[k,'PROFILE']));
const pick=(d,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(d,k)).map(k=>[k,d[k]]));
const activityFields={BUYER_RANK_ENTRY:['snapshot_id','snapshot_sha256','city','at','calculation_version','rule_id','rule_sha256','rank','section','metrics','scoring','evidence'],RANK_PROFILE:['person_id','city','district','category','opt_in','registered_at'],BUYER_PROFILE:['city','opt_in'],ORDER_REVIEW:['order_id','realism','fit','completeness','stars','body','media_asset_ids','media','at','free_points_awarded'],CANDIDATE:['person_id','profile_id','ranking_score','halo'],VOTE:['candidate_id','points','day','at'],APPEAL:['reason'],REFERRAL_LINK:['target_party_id','category','rule_id'],REFERRAL_CLICK:['at','source','referrer_party_id'],REWARD_GRANT:['event_id','person_id','stock_id','title','kind','terms','valid_until','performance_rights_granted'],INTERACTION:['action','at','day','weight','device_verified']};
function checked(v,h){const d=A.parse(v);if(digest(d)!==h)throw error('STORED_CONTENT_MISMATCH',503);return d;}
function response(value){if(!value)return null;return {...pick(value,['response','outcome','evidence_asset_ids','remaining_actions','execution_status']),retentions:(value.retentions||[]).map(x=>pick(x,['scope','object_ref','basis','policy_rule_id','review_on']))};}
async function page(tx,account,{section,after='',limit}){
 if(after)id(after);let q,args=[account],map;
 const base=r=>({id:r.id,current_status:r.current_status,object_version:r.object_version,created_at:A.instant(r.created_at)});
 const child=table=>`SELECT r.* FROM ${table} r JOIN privacy_requests p ON p.id=r.request_id WHERE p.account_id=?`;
 if(section==='PRIVACY_REQUESTS'){
  q='SELECT r.* FROM privacy_requests r WHERE r.account_id=?';
  map=r=>({...base(r),request:pick(checked(r.request_json,r.request_sha256),['type','scopes','details']),response_due_on:r.response_due_on,calendar_version:r.calendar_version,result:response(r.result_json?checked(r.result_json,r.result_sha256):null)});
 }else if(section==='PRIVACY_RESPONSES'){
  q=child('privacy_responses');map=r=>({id:r.id,request_id:r.request_id,object_version:r.object_version,result:response(checked(r.result_json,r.result_sha256)),created_at:A.instant(r.created_at)});
 }else if(section==='PRIVACY_EVENTS'){
  q=child('privacy_events');map=r=>({...pick(r,['id','request_id','event_code','object_version','message']),created_at:A.instant(r.created_at)});
 }else if(section==='PRIVACY_ACTIONS'){
  q=child('privacy_actions');map=r=>({...pick(r,['id','request_id','action_kind','target_id','result_record_id']),created_at:A.instant(r.created_at)});
 }else if(section==='PRIVACY_EXECUTIONS'){
  q=child('privacy_executions');map=r=>{const p=checked(r.payload_json,r.payload_sha256);if(r.result_json)checked(r.result_json,r.result_sha256);return {...base(r),request_id:r.request_id,action:r.action_code,target_id:r.target_id,policy_rule_id:p.policy.id,proposed_change:r.action_code==='PROFILE_CORRECTION'?{display_name:p.details.display_name}:null};};
 }else if(section==='NOTIFICATION_DELIVERIES'){
  q="SELECT r.* FROM notification_deliveries r LEFT JOIN parties p ON p.id=r.party_id WHERE r.account_id=? AND (r.party_id IS NULL OR (p.kind='PERSON' AND p.personal_account_id=?))";args=[account,account];
  map=r=>({...pick(r,['id','category','current_status','reason']),simulated:!!r.simulated,retry_at:A.instant(r.retry_at),dispatched_at:A.instant(r.dispatched_at),created_at:A.instant(r.created_at),updated_at:A.instant(r.updated_at)});
 }else if(section==='GUARDIAN_LINKS'){
  q="SELECT r.* FROM guardian_records r WHERE r.kind='LINK' AND (r.guardian_account_id=? OR r.child_account_id=?)";args=[account,account];
  map=r=>{const d=checked(r.data_json,r.data_sha256),guardian=r.guardian_account_id===account;return {...base(r),own_role:guardian?'GUARDIAN':'CHILD',relationship:guardian?d.relationship:null,valid_until:d.valid_until,child_accepted:d.child_accepted,history:(d.history||[]).map(x=>pick(x,['action','at']))};};
 }else if(section==='ENGAGEMENT_RECORDS'){
  const kinds=Object.keys(activityFields).filter(k=>k!=='INTERACTION');q="SELECT r.* FROM engagement_records r LEFT JOIN parties p ON p.id=r.owner_party_id WHERE ((p.kind='PERSON' AND p.personal_account_id=? AND r.kind IN ("+kinds.map(()=>'?').join(',')+")) OR (r.kind='INTERACTION' AND r.owner_party_id IS NULL AND r.created_by=?))";args=[account,...kinds,account];
  map=r=>{const d=checked(r.data_json,r.data_sha256);if(r.kind==='INTERACTION'&&d.account_id!==account)throw error('STORED_CONTENT_MISMATCH',503);return {...base(r),kind:r.kind,parent_id:r.parent_id,data:pick(d,activityFields[r.kind])};};
 }else throw error('INVALID_INPUT',400);
 if(after&&!(await tx.execute(q+' AND r.id=?',[...args,after]))[0].length)throw error('INVALID_CURSOR',400);
 const [rows]=await tx.execute(q+' AND r.id>? ORDER BY r.id LIMIT ?',[...args,after,limit+1]);
 return {section,items:rows.slice(0,limit).map(map),next_cursor:rows.length>limit?rows[limit-1].id:null,coverage:'OWN_ACCOUNT_RECORDS_ONLY',request_completion:'NOT_CONFIRMED',original_documents_included:false};
}
module.exports={page,sections,activityFields};
