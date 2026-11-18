'use strict';
const {id,error}=require('../party/policy');
const {digest}=require('../governance/content');
const {submissionHash,instant}=require('../customization/submission-hash');
const {metadata}=require('../customization/attachments');
const one=async(tx,sql,args)=>(await tx.execute(sql,args))[0][0];
function checked(value,hash){const data=typeof value==='string'?JSON.parse(value):value;if(digest(data)!==hash)throw error('STORED_CONTENT_MISMATCH',503);return data;}
async function own(tx,account,storyId){
 const r=await one(tx,"SELECT r.* FROM customization_requests r JOIN parties p ON p.id=r.party_id WHERE r.id=? AND r.created_by=? AND p.kind='PERSON' AND p.personal_account_id=? FOR SHARE",[id(storyId),account,account]);
 if(!r)throw error('PRIVACY_TARGET_NOT_FOUND',404);return r;
}
const sections={SUBMISSIONS:{table:'customization_submissions',order:'submission_number'},SUPPLEMENTS:{table:'customization_supplements',order:'opened_version'},ATTACHMENTS:{table:'customization_attachments',order:'id'}};
async function page(tx,account,{story_id,section,after='',limit}){
 if(!Object.hasOwn(sections,section))throw error('INVALID_INPUT',400);const def=sections[section];
 const r=await own(tx,account,story_id);let cursor=def.order==='id'?'':0;
 if(after){const row=await one(tx,`SELECT ${def.order} AS position FROM ${def.table} WHERE id=? AND request_id=?`,[id(after),r.id]);if(!row)throw error('INVALID_CURSOR',400);cursor=row.position;}
 const [rows]=await tx.execute(`SELECT * FROM ${def.table} WHERE request_id=? AND ${def.order}>? ORDER BY ${def.order} LIMIT ?`,[r.id,cursor,limit+1]);
 const items=rows.slice(0,limit).map(s=>{
  if(section==='SUBMISSIONS'){
   if(s.submitted_by!==account||s.template_version_id!==r.template_version_id||submissionHash(s)!==s.content_sha256)throw error('STORED_CONTENT_MISMATCH',503);
   return {id:s.id,submission_number:s.submission_number,template_version_id:s.template_version_id,content_sha256:s.content_sha256,submitted_at:instant(s.submitted_at),answers:checked(s.answers_json,s.answers_sha256),template_snapshot:checked(s.template_snapshot_json,s.template_sha256)};
  }
  if(section==='SUPPLEMENTS')return {id:s.id,base_submission_id:s.base_submission_id,current_status:s.current_status,opened_version:s.opened_version,requested_at:instant(s.requested_at),items:checked(s.items_json,s.items_sha256),responses:checked(s.responses_json,s.responses_sha256),draft_answers:s.current_status==='OPEN'?checked(s.draft_answers_json,s.draft_answers_sha256):null,response_submission_id:s.response_submission_id,responded_at:instant(s.responded_at)};
  if(s.created_by!==account)throw error('STORED_CONTENT_MISMATCH',503);
  return metadata(s);
 });
 return {story_id:r.id,section,items,next_cursor:rows.length>limit?items[items.length-1].id:null,coverage:'OWN_STORY_RECORDS_ONLY',request_completion:'NOT_CONFIRMED'};
}
async function file(tx,account,assetId){
 const f=await one(tx,"SELECT a.*,r.party_id AS owner_party_id,'STORY_ATTACHMENT' AS purpose FROM customization_attachments a JOIN customization_requests r ON r.id=a.request_id JOIN parties p ON p.id=r.party_id WHERE a.id=? AND a.created_by=? AND r.created_by=? AND p.kind='PERSON' AND p.personal_account_id=? FOR SHARE",[id(assetId),account,account,account]);
 if(!f)throw error('PRIVACY_TARGET_NOT_FOUND',404);if(f.current_status!=='READY')throw error('CUSTOMIZATION_ATTACHMENT_NOT_READY',409);return f;
}
module.exports={page,file};
