'use strict';
const A=require('../artists/context'),C=require('./context');
const {authorizeOperator}=require('../governance/operator-access'),{digest}=require('../governance/content');
const {id,shape,label,error}=require('../party/policy');
async function independent(tx,a,r){
 if(r.created_by===a.id||await A.one(tx,"SELECT id FROM party_memberships WHERE account_id=? AND current_status='ACTIVE' AND party_id IN (?,?) FOR SHARE",[a.id,r.owner_party_id,r.counterparty_id]))throw error('SELF_REVIEW_FORBIDDEN',403);
}
async function manager(tx,a,r){await C.operator(tx,a,'NOTICE_ASSIGN',r,true);}
async function access(tx,a,r,{write=false}={}){
 if(r.kind!=='CASE')throw error('NOTICE_NOT_FOUND',404);
 if(!write&&await authorizeOperator(tx,{account_id:a.id,action:'NOTICE_ASSIGN'})){await independent(tx,a,r);return;}
 await C.operator(tx,a,'NOTICE_SUPPORT',r,true);
 if(r.data.support_assignment&&r.data.support_assignment.account_id!==a.id)throw error('NOTICE_CASE_NOT_ASSIGNED',403);
}
async function target(tx,accountId,r){const a={id:id(accountId)};await C.operator(tx,a,'NOTICE_SUPPORT',r,true);return a.id;}
async function record(tx,a,r,accountId,reason,mode){
 const assignment={account_id:accountId,assigned_by:a.id,assigned_at:await A.now(tx),reason,mode};
 const body={case_id:r.id,object_version:r.object_version+1,previous_account_id:r.data.support_assignment?.account_id||null,assignment};
 await tx.execute('INSERT INTO notice_case_assignments(case_id,object_version,data_json,data_sha256) VALUES (?,?,?,?)',[r.id,body.object_version,JSON.stringify(body),digest(body)]);
 // Parties can see who currently handles their case; dispatch reasons and
 // the assigning operator remain in the permission-checked history only.
 return {account_id:assignment.account_id,assigned_at:assignment.assigned_at,mode:assignment.mode};
}
async function claimForQuote(tx,a,r){
 await access(tx,a,r,{write:true});
 return r.data.support_assignment||record(tx,a,r,a.id,'First independent operator linking the original quote','QUOTE_CLAIM');
}
function methods(run,change){return {
 async assignSupport(ctx,i){
  shape(i,['record_id','expected_version','account_id','reason','operation_key']);id(i.account_id);label(i.reason,2000);
  return change(ctx,i,'ASSIGN_SUPPORT',async(tx,a,r)=>{
   await manager(tx,a,r);if(r.kind!=='CASE')throw error('NOTICE_NOT_FOUND',404);
   await target(tx,i.account_id,r);
  },async(tx,a,r)=>{
   if(r.current_status!=='WAITING_SUPPORT')throw error('NOTICE_CASE_NOT_OPEN',409);
   const s=await C.load(tx,r.parent_id,'SUBMISSION');if(s.current_status!=='INTERESTED')throw error('NOTICE_COOPERATION_WITHDRAWN',409);await C.currentSubmission(tx,s);
   if(r.data.support_assignment?.account_id===i.account_id)throw error('NOTICE_CASE_ALREADY_ASSIGNED',409);
   const assignment=await record(tx,a,r,i.account_id,i.reason,'ASSIGNED');
   return C.save(tx,a,r,r.current_status,{...r.data,support_assignment:assignment},'SUPPORT_ASSIGNED');
  });
 },
 async supportAssignmentHistory(ctx,i){
  shape(i,['record_id','after','limit']);const limit=i.limit??20;if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(i.after??0)||(i.after??0)<0||(i.after??0)>4294967294)throw error('INVALID_PAGE',400);
  return run(ctx,async(tx,a)=>{
   const r=await C.load(tx,i.record_id,'CASE','FOR SHARE');await access(tx,a,r);
   const rows=(await tx.execute('SELECT * FROM notice_case_assignments WHERE case_id=? AND object_version>? ORDER BY object_version LIMIT ?',[r.id,i.after??0,limit+1]))[0];
   const items=rows.slice(0,limit).map(row=>{const data=A.parse(row.data_json);if(digest(data)!==row.data_sha256||data.case_id!==r.id||data.object_version!==row.object_version)throw error('STORED_CONTENT_MISMATCH',503);return {...data,content_sha256:row.data_sha256};});
   return {case_id:r.id,items,next_cursor:rows.length>limit?items[items.length-1].object_version:null};
  });
 },
 async supportAssignmentOptions(ctx,i){
  shape(i,['record_id','after','limit']);const limit=i.limit??20;if(!Number.isInteger(limit)||limit<1||limit>100)throw error('INVALID_LIMIT',400);if(i.after)id(i.after);
  return run(ctx,async(tx,a)=>{
   const r=await C.load(tx,i.record_id,'CASE','FOR SHARE');await manager(tx,a,r);
   if(r.current_status!=='WAITING_SUPPORT')throw error('NOTICE_CASE_NOT_OPEN',409);
   const s=await C.load(tx,r.parent_id,'SUBMISSION','FOR SHARE');if(s.current_status!=='INTERESTED')throw error('NOTICE_COOPERATION_WITHDRAWN',409);await C.currentSubmission(tx,s);
   const rows=(await tx.execute("SELECT a.id,a.display_name FROM identity_accounts a JOIN governance_operator_grants g ON g.account_id=a.id AND g.action_code='NOTICE_SUPPORT' WHERE a.id>? AND a.current_status='ACTIVE' AND g.enabled=1 AND (g.expires_at IS NULL OR g.expires_at>CURRENT_TIMESTAMP(3)) ORDER BY a.id LIMIT ?",[i.after||'',limit+1]))[0],items=[];
   for(const row of rows.slice(0,limit)){try{await target(tx,row.id,r);items.push({account_id:row.id,display_name:row.display_name});}catch(e){if(![403,404].includes(e.status))throw e;}}
   return {case_id:r.id,items,next_cursor:rows.length>limit?rows[limit-1].id:null};
  });
 }
};}
module.exports={access,claimForQuote,methods};
