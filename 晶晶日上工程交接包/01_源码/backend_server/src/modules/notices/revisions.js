'use strict';
const A=require('../artists/context'),C=require('./context'),P=require('./policy');
const {digest}=require('../governance/content');
const {id,label,shape,error}=require('../party/policy');
const snapshot=n=>({notice_id:n.id,object_version:n.object_version,revision_id:n.data.revision_id||null,notice_sha256:digest(n.data.notice),notice:n.data.notice});
function matches(s,n){return !!s&&s.notice_id===n.id&&s.revision_id===(n.data.revision_id||null)&&s.notice_sha256===digest(n.data.notice);}
function assertAccepted(s,n){
 if(!s.data.notice_snapshot&&!n.data.revision_id)return; // Legacy, never revised: do not invent a historical snapshot.
 if(!matches(s.data.notice_acknowledgement||s.data.notice_snapshot,n))throw error('NOTICE_REVISION_ACK_REQUIRED',409);
}
async function validate(tx,a,n,notice){
 await require('../privacy/restrictions').assertUnrestricted(tx,'NOTICE',n.id);
 if(n.kind!=='NOTICE'||n.parent_id||n.current_status!=='PUBLISHED')throw error('NOTICE_NOT_OPEN',409);
 if(notice.type!==n.data.notice.type||notice.project_id!==n.data.notice.project_id)throw error('NOTICE_REVISION_SCOPE_INVALID',409);
 if(notice.valid_until<=await A.now(tx))throw error('NOTICE_PERIOD_INVALID',409);
 if(notice.type!=='OFFICIAL')await A.owner(tx,a,n.owner_party_id);
 else await C.publisher(tx,n);
 if(notice.project_id){const project=await A.one(tx,"SELECT * FROM project_records WHERE id=? AND kind='PROJECT' FOR SHARE",[notice.project_id]);if(!project||project.owner_party_id!==n.owner_party_id)throw error('NOTICE_PROJECT_MISMATCH',409);}
 await C.publisher(tx,{...n,created_by:notice.type==='OFFICIAL'?a.id:n.created_by,data:{...n.data,notice}});
}
async function review(tx,a,r,i){
 if(r.current_status!=='IN_REVIEW')throw error('REVIEW_NOT_PENDING',409);
 const review={account_id:a.id,decision:i.decision,reason:i.reason,checks:i.checks,method:'EXTERNAL_MANUAL_REVIEW'};
 if(i.decision==='REJECT'){
  if(i.checks!==null)throw error('INVALID_REVIEW',400);
  return C.save(tx,a,r,'REJECTED',{...r.data,review},'INDEPENDENT_REVIEW');
 }
 const required=['content_reviewed','materials_reviewed','no_private_contact'];shape(i.checks,required);
 if(required.some(k=>i.checks[k]!==true))throw error('MANUAL_REVIEW_REQUIRED',400);
 const n=await C.load(tx,r.parent_id,'NOTICE');
 A.match(n,r.data.base_snapshot.object_version);
 if(digest(n.data.notice)!==r.data.base_snapshot.notice_sha256)throw error('STORED_CONTENT_MISMATCH',503);
 // Both author and reviewer must still have the current scope at publication.
 await validate(tx,{id:r.created_by},n,r.data.notice);
 const approved=await C.save(tx,a,r,'APPROVED',{...r.data,review},'INDEPENDENT_REVIEW');
 await C.save(tx,a,n,'PUBLISHED',{...n.data,notice:r.data.notice,revision_id:r.id,review},'NOTICE_REVISED');
 const rows=(await tx.execute("SELECT * FROM notice_records WHERE kind='SUBMISSION' AND parent_id=? ORDER BY id",[n.id]))[0];
 for(const row of rows)await C.audit(tx,a,C.checked(row),'NOTICE_REVISED');
 return approved;
}
function methods(run){return {
 async revise(ctx,i){
  shape(i,['record_id','party_id','expected_version','notice','reason','operation_key']);const notice=P.notice(i.notice);label(i.reason,2000);
  return run(ctx,async(tx,a)=>{
   const n=await C.load(tx,i.record_id,'NOTICE');
   if(n.data.notice.type==='OFFICIAL'){if(i.party_id)throw error('ACTING_PARTY_NOT_ALLOWED',400);await C.operator(tx,a,'NOTICE_OFFICIAL');}
   else {await C.access(tx,a,n,i.party_id);if(!i.party_id||n.owner_party_id!==i.party_id)throw error('NOTICE_OPERATOR_FORBIDDEN',403);}
   return C.command(tx,a,'REVISE',i,async()=>{
    A.match(n,i.expected_version);await validate(tx,a,n,notice);
    if(digest(notice)===digest(n.data.notice))throw error('NOTICE_REVISION_UNCHANGED',409);
    return C.insert(tx,a,'NOTICE_REVISION',n.owner_party_id,null,n.id,'IN_REVIEW',{rule_id:n.data.rule_id,rule_sha256:n.data.rule_sha256,notice,base_snapshot:snapshot(n),reason:i.reason,review:null});
   });
  });
 },
 async acknowledgeRevision(ctx,i){
  shape(i,['record_id','party_id','expected_version','notice_version','notice_sha256','operation_key']);
  require('../party/policy').version(i.notice_version);if(!/^[a-f0-9]{64}$/.test(i.notice_sha256||''))throw error('INVALID_DIGEST',400);
  return run(ctx,async(tx,a)=>{
   const hint=await C.load(tx,i.record_id,'SUBMISSION','');if(!hint.parent_id)throw error('NOTICE_NOT_FOUND',404);
   const n=await C.load(tx,hint.parent_id,'NOTICE'),s=await C.load(tx,hint.id,'SUBMISSION');
   await C.access(tx,a,s,i.party_id);if(!i.party_id||i.party_id!==s.owner_party_id)throw error('NOTICE_NOT_FOUND',404);
   return C.command(tx,a,'ACK_REVISION',i,async()=>{
    A.match(s,i.expected_version);A.match(n,i.notice_version);
    if(!['IN_REVIEW','SENT','INTERESTED'].includes(s.current_status))throw error('NOTICE_CANNOT_CONFIRM',409);
    if(i.notice_sha256!==digest(n.data.notice))throw error('NOTICE_CONTENT_MISMATCH',409);
    const data={...s.data,notice_acknowledgement:{...snapshot(n),account_id:a.id}};
    await C.currentSubmission(tx,{...s,data});
    return C.save(tx,a,s,s.current_status,data,'NOTICE_REVISION_ACKNOWLEDGED');
   });
  });
 },
 async revisionHistory(ctx,i){
  shape(i,['record_id','party_id','after','limit']);const limit=i.limit??20;if(!Number.isInteger(limit)||limit<1||limit>100)throw error('INVALID_LIMIT',400);if(i.after)id(i.after);
  return run(ctx,async(tx,a)=>{
   const n=await C.load(tx,i.record_id,'NOTICE','FOR SHARE');await require('../privacy/restrictions').assertUnrestricted(tx,'NOTICE',n.id);
   let owner=false;
   if(!i.party_id){await C.operator(tx,a,'NOTICE_REVIEW');owner=true;}
   else {await A.owner(tx,a,i.party_id);owner=i.party_id===n.owner_party_id;
    if(!owner){const rows=(await tx.execute("SELECT * FROM notice_records WHERE kind='SUBMISSION' AND parent_id=? AND owner_party_id=? ORDER BY id",[n.id,i.party_id]))[0];let allowed=false;for(const row of rows){try{await C.access(tx,a,C.checked(row),i.party_id);allowed=true;break;}catch(e){if(![403,404,409].includes(e.status))throw e;}}if(!allowed)throw error('NOTICE_NOT_FOUND',404);}
   }
   const rows=(await tx.execute("SELECT * FROM notice_records WHERE kind='NOTICE_REVISION' AND parent_id=? AND id>? "+(owner?'':"AND current_status='APPROVED' ")+"ORDER BY id LIMIT ?",[n.id,i.after||'',limit+1]))[0];
   // Non-publishers receive approved content only, without reviewer/author metadata.
   const items=rows.slice(0,limit).map(C.checked).map(r=>owner?r:{id:r.id,current_status:r.current_status,base_snapshot:r.data.base_snapshot,notice:r.data.notice,notice_sha256:digest(r.data.notice)});
   return {notice_id:n.id,current:snapshot(n),items,next_cursor:rows.length>limit?rows[limit-1].id:null};
  });
 }
};}
module.exports={snapshot,matches,assertAccepted,review,methods};
