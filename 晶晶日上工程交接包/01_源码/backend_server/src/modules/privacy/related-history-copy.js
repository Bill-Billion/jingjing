"use strict";
const {error}=require('../party/policy');
const {digest}=require('../governance/content');
const A=require('../artists/context');
const sections={PHONE_CHANGE_EVENTS:'PROFILE',PARTICIPATION_CONFIRMATIONS:'CONTRACTS',PARTICIPATION_MILESTONES:'CONTRACTS'};
const reference=sql=>"SHA2(CONCAT('privacy-related-history-v1:',"+sql+"),256)";
function checked(json,hash){if(digest(A.parse(json))!==hash)throw error('STORED_CONTENT_MISMATCH',503);}
async function page(tx,account,{section,after='',limit}){
 if(after&&!/^[a-f0-9]{64}$/.test(after))throw error('INVALID_CURSOR',400);
 let q,ref,args,project;
 if(section==='PHONE_CHANGE_EVENTS'){
  ref=reference("'phone:',e.change_id,':',e.object_version");
  q='SELECT '+ref+' AS copy_ref,e.change_id,e.object_version,e.action_code,e.created_at FROM auth_phone_change_events e JOIN auth_phone_changes c ON c.id=e.change_id WHERE c.account_id=?';args=[account];
  project=r=>({copy_ref:r.copy_ref,change_id:r.change_id,object_version:r.object_version,action_code:r.action_code,created_at:A.instant(r.created_at)});
 }else if(section==='PARTICIPATION_CONFIRMATIONS'){
  ref=reference("'confirmation:',e.record_id,':',e.party_id");
  q="SELECT "+ref+" AS copy_ref,e.record_id,e.party_id,e.content_sha256,e.decision,e.reason,e.created_at,r.project_id,r.current_status,r.data_json,r.data_sha256 FROM project_confirmations e JOIN project_records r ON r.id=e.record_id AND r.kind='PARTICIPATION' JOIN parties p ON p.id=e.party_id WHERE p.kind='PERSON' AND p.personal_account_id=? AND e.account_id=?";args=[account,account];
  project=r=>{checked(r.data_json,r.data_sha256);return {copy_ref:r.copy_ref,agreement_id:r.record_id,project_id:r.project_id,party_id:r.party_id,decision:r.decision,reason:r.reason,confirmed_content_sha256:r.content_sha256,created_at:A.instant(r.created_at),agreement_status:r.current_status,current_content_sha256:r.data_sha256,confirmation_matches_current:r.content_sha256===r.data_sha256};};
 }else if(section==='PARTICIPATION_MILESTONES'){
  ref=reference("'milestone:',e.agreement_id,':',e.installment_key");
  q="SELECT "+ref+" AS copy_ref,e.agreement_id,e.installment_key,e.evidence_asset_id,e.reason,r.project_id,r.current_status,r.data_json,r.data_sha256,j.data_json AS project_json,j.data_sha256 AS project_sha256 FROM project_participation_milestones e JOIN project_records r ON r.id=e.agreement_id AND r.kind='PARTICIPATION' JOIN project_records j ON j.id=r.project_id AND j.kind='PROJECT' JOIN parties p ON p.id=j.owner_party_id WHERE p.kind='PERSON' AND p.personal_account_id=? AND e.account_id=?";args=[account,account];
  project=r=>{checked(r.data_json,r.data_sha256);checked(r.project_json,r.project_sha256);return {copy_ref:r.copy_ref,agreement_id:r.agreement_id,project_id:r.project_id,installment_key:r.installment_key,evidence_asset_id:r.evidence_asset_id,reason:r.reason,agreement_status:r.current_status,confirmed_at:null,confirmation_time_recorded:false};};
 }else throw error('INVALID_INPUT',400);
 // References are section-specific and only usable while an eligible retained row exists.
 // They are not authentication tokens or permission to retrieve the referenced files.
 if(after&&!(await tx.execute(q+' AND '+ref+'=?',[...args,after]))[0].length)throw error('INVALID_CURSOR',400);
 const [rows]=await tx.execute(q+' AND '+ref+'>? ORDER BY copy_ref LIMIT ?',[...args,after,limit+1]);
 return {section,items:rows.slice(0,limit).map(project),next_cursor:rows.length>limit?rows[limit-1].copy_ref:null,coverage:'OWN_ACCOUNT_RECORDS_ONLY',request_completion:'NOT_CONFIRMED',history_complete:false,original_documents_included:false};
}
module.exports={page,sections};
