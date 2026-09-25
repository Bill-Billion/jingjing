'use strict';
// Pure state rules only. A repository must authenticate, authorize and load trusted records.
const {id,label,shape,version,error}=require('../party/policy');
const channels=Object.freeze(['RIGHTS','CONTENT']);
const decisions=Object.freeze(['APPROVED','CHANGES_REQUESTED','REJECTED']);
function exact(value,keys){shape(value,keys);if(keys.some(k=>!Object.hasOwn(value,k)))throw error('MISSING_FIELD',400);}
function instant(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)throw error('INVALID_INSTANT',400);
 return value;
}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function body(input){
 exact(input,['id','work_id','revision','kind','source_version_id','project_id','owner_party_id','title','content_asset_id','content_sha256','evidence_ids']);
 for(const field of ['id','work_id','owner_party_id','content_asset_id'])id(input[field]);
 version(input.revision);label(input.title,200);
 if(typeof input.content_sha256!=='string'||!/^[a-f0-9]{64}$/.test(input.content_sha256))throw error('INVALID_CONTENT_HASH',400);
 if(!['ORIGINAL','PROJECT_ADAPTATION'].includes(input.kind))throw error('INVALID_WORK_KIND',400);
 if(input.kind==='ORIGINAL'){
  if(input.source_version_id!==null||input.project_id!==null)throw error('ORIGINAL_CANNOT_BE_PROJECT_ADAPTATION',400);
 }else{
  id(input.source_version_id);id(input.project_id);
  if(input.source_version_id===input.id)throw error('SELF_REFERENCING_VERSION',400);
 }
 if(!Array.isArray(input.evidence_ids)||input.evidence_ids.length>100||new Set(input.evidence_ids).size!==input.evidence_ids.length)throw error('INVALID_EVIDENCE_LIST',400);
 for(const evidenceId of input.evidence_ids)id(evidenceId);
 return {...input,evidence_ids:[...input.evidence_ids]};
}
function check(record){
 exact(record,['content','object_version','current_status','submitted_at','reviews','withdrawal']);
 body(record.content);version(record.object_version);
 if(!['DRAFT','SUBMITTED','WITHDRAWN'].includes(record.current_status)||!Array.isArray(record.reviews)||record.reviews.length>2)throw error('INVALID_WORK_STATE',400);
 if(record.submitted_at!==null)instant(record.submitted_at);
 const seen=new Set();
 for(const r of record.reviews){
  exact(r,['channel','decision','reviewer_account_id','evidence_ref','reason','recorded_at','version_id']);
  if(!channels.includes(r.channel)||!decisions.includes(r.decision)||seen.has(r.channel)||r.version_id!==record.content.id)throw error('INVALID_REVIEW',400);
  id(r.reviewer_account_id);id(r.version_id);label(r.evidence_ref,128);label(r.reason,1000);instant(r.recorded_at);seen.add(r.channel);
  if(record.submitted_at===null||r.recorded_at<record.submitted_at)throw error('INVALID_REVIEW_TIME',400);
 }
 if(record.current_status==='DRAFT'&&(record.submitted_at!==null||record.reviews.length))throw error('INVALID_WORK_STATE',400);
 if(record.current_status==='SUBMITTED'&&record.submitted_at===null)throw error('INVALID_WORK_STATE',400);
 if(record.submitted_at!==null&&!record.content.evidence_ids.length)throw error('INVALID_WORK_STATE',400);
 if(record.object_version!==1+Number(record.submitted_at!==null)+record.reviews.length+Number(record.current_status==='WITHDRAWN'))throw error('INVALID_WORK_STATE',400);
 if(record.current_status==='WITHDRAWN'){
  exact(record.withdrawal,['reason','recorded_at']);label(record.withdrawal.reason,1000);instant(record.withdrawal.recorded_at);
  if(record.submitted_at&&record.withdrawal.recorded_at<record.submitted_at||record.reviews.some(r=>r.recorded_at>record.withdrawal.recorded_at))throw error('INVALID_WITHDRAWAL_TIME',400);
 }else if(record.withdrawal!==null)throw error('INVALID_WORK_STATE',400);
 return record;
}
function expected(record,value){check(record);if(record.object_version!==version(value))throw error('VERSION_CONFLICT',412);if(record.object_version>=4294967294)throw error('VERSION_LIMIT',409);}
function clone(record){return {content:body(record.content),object_version:record.object_version,current_status:record.current_status,submitted_at:record.submitted_at,reviews:record.reviews.map(r=>({...r})),withdrawal:record.withdrawal?{...record.withdrawal}:null};}
function createVersion(input,previous=null){
 const content=body(input);
 if(previous){
  check(previous);
  if(content.id===previous.content.id||content.revision!==previous.content.revision+1)throw error('INVALID_NEXT_REVISION',409);
  for(const field of ['work_id','owner_party_id','kind','project_id'])if(content[field]!==previous.content[field])throw error('WORK_IDENTITY_CHANGED',409);
 }else if(content.revision!==1)throw error('FIRST_REVISION_REQUIRED',400);
 return freeze({content,object_version:1,current_status:'DRAFT',submitted_at:null,reviews:[],withdrawal:null});
}
function submitVersion(record,input){
 exact(input,['expected_version','recorded_at']);expected(record,input.expected_version);instant(input.recorded_at);
 if(record.current_status!=='DRAFT')throw error('WORK_NOT_DRAFT',409);
 if(!record.content.evidence_ids.length)throw error('RIGHTS_EVIDENCE_REQUIRED',409);
 return freeze({...clone(record),object_version:record.object_version+1,current_status:'SUBMITTED',submitted_at:input.recorded_at});
}
function reviewVersion(record,input){
 exact(input,['expected_version','channel','decision','reviewer_account_id','evidence_ref','reason','recorded_at']);expected(record,input.expected_version);
 if(record.current_status!=='SUBMITTED')throw error('WORK_NOT_SUBMITTED',409);
 if(record.reviews.some(r=>r.channel===input.channel))throw error('REVIEW_ALREADY_RECORDED',409);
 const {expected_version,...review}=input;
 if(record.reviews.some(r=>r.recorded_at>review.recorded_at))throw error('INVALID_REVIEW_TIME',400);
 const next={...clone(record),object_version:record.object_version+1,reviews:[...record.reviews.map(r=>({...r})),{...review,version_id:record.content.id}]};
 check(next);return freeze(next);
}
function withdrawVersion(record,input){
 exact(input,['expected_version','reason','recorded_at']);expected(record,input.expected_version);
 if(record.current_status==='WITHDRAWN')throw error('WORK_ALREADY_WITHDRAWN',409);
 const next={...clone(record),object_version:record.object_version+1,current_status:'WITHDRAWN',withdrawal:{reason:input.reason,recorded_at:input.recorded_at}};
 check(next);return freeze(next);
}
function reviewProgress(record){
 check(record);
 if(record.current_status==='WITHDRAWN')return 'WITHDRAWN';
 if(record.current_status==='DRAFT')return 'DRAFT';
 if(record.reviews.some(r=>r.decision==='REJECTED'))return 'REJECTED';
 if(record.reviews.some(r=>r.decision==='CHANGES_REQUESTED'))return 'CHANGES_REQUESTED';
 return record.reviews.length===2?'REVIEWS_COMPLETE':'AWAITING_REVIEW';
}
module.exports={createVersion,submitVersion,reviewVersion,withdrawVersion,reviewProgress};
