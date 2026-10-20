'use strict';
const {randomUUID}=require('node:crypto');
const {id,label,shape,version,error}=require('../party/policy');
const {digest,verifyRuleContent}=require('../governance/content');
const R=require('./restrictions');
const one=async(tx,q,a=[])=>(await tx.execute(q,a))[0][0];
const parse=v=>typeof v==='string'?JSON.parse(v):v;
function checked(v,h){const d=parse(v);if(digest(d)!==h)throw error('STORED_CONTENT_MISMATCH',503);return d;}
const actions=['PROFILE_CORRECTION','FILE_ERASURE','ACCOUNT_CLOSURE','RESTRICT_CONTENT','RELEASE_CONTENT'];
async function policy(tx,key,action){
 const r=await one(tx,"SELECT * FROM governance_rules WHERE id=? AND current_status='EFFECTIVE' AND effective_at<=CURRENT_TIMESTAMP(3) FOR SHARE",[id(key)]);
 if(!r)throw error('PRIVACY_EXECUTION_POLICY_REQUIRED',409);
 const c=parse(r.content_json);verifyRuleContent(c);
 const p=c.terms.privacy_execution;
 if(c.rule_key!=='privacy.execution'||!p||!Array.isArray(p.actions)||!p.actions.includes(action)
   ||typeof p.basis!=='string'||!p.basis.trim()||typeof p.contact_reference!=='string'||!p.contact_reference.trim())
  throw error('PRIVACY_EXECUTION_POLICY_REQUIRED',409);
 if(['FILE_ERASURE','ACCOUNT_CLOSURE'].includes(action)&&
   (p.backup_strategy!=='REAPPLY_ERASURE_REGISTER_BEFORE_ACCESS'||!p.retention_rule_id))
  throw error('PRIVACY_EXECUTION_POLICY_REQUIRED',409);
 if(p.retention_rule_id){
  const retained=await one(tx,"SELECT * FROM governance_rules WHERE id=? AND current_status='EFFECTIVE' AND effective_at<=CURRENT_TIMESTAMP(3) FOR SHARE",[id(p.retention_rule_id)]);
  if(!retained)throw error('RETENTION_BASIS_NOT_APPROVED',409);
  const rc=parse(retained.content_json);verifyRuleContent(rc);
  if(rc.rule_key!=='privacy.retention'||!Array.isArray(rc.terms.privacy_retention?.categories)||!rc.terms.privacy_retention.categories.length)
   throw error('RETENTION_BASIS_NOT_APPROVED',409);
 }
 return {id:r.id,sha256:digest(c)};
}
async function closureBlockers(tx,account){
 const blocks=[];
 const [members]=await tx.execute("SELECT m.party_id FROM party_memberships m JOIN parties p ON p.id=m.party_id WHERE m.account_id=? AND m.current_status='ACTIVE' AND m.role_code='OWNER' AND p.kind='ORGANIZATION' AND p.current_status<>'CLOSED' FOR UPDATE",[account.id]);
 for(const m of members){
  if(!await one(tx,"SELECT m.id FROM party_memberships m JOIN identity_accounts a ON a.id=m.account_id WHERE m.party_id=? AND m.account_id<>? AND m.role_code='OWNER' AND m.current_status='ACTIVE' AND a.current_status='ACTIVE' LIMIT 1 FOR SHARE",[m.party_id,account.id]))blocks.push('ORGANIZATION_OWNER_TRANSFER_REQUIRED');
 }
 const p=await one(tx,"SELECT id FROM parties WHERE kind='PERSON' AND personal_account_id=? FOR UPDATE",[account.id]);
 if(p){
  if(await one(tx,"SELECT id FROM trade_records WHERE (buyer_party_id=? OR merchant_party_id=?) AND ((kind='ORDER' AND current_status NOT IN ('CANCELLED','REFUNDED')) OR (kind IN ('PAYMENT','REFUND') AND current_status NOT IN ('SUCCEEDED','FAILED','CANCELLED','REJECTED'))) LIMIT 1 FOR SHARE",[p.id,p.id]))blocks.push('TRADE_OBLIGATIONS_REVIEW_REQUIRED');
  // No universal zero-balance inference from a missing/unrecognized wallet row.
  const money=await require('../wallet/cash').overview(tx,p.id);
  if(money.recorded_balance_minor!==0||await one(tx,"SELECT id FROM wallet_records WHERE owner_party_id=? AND kind IN ('RECHARGE','CASH_SPEND','REFUND') AND current_status NOT IN ('SUCCEEDED','FAILED','CANCELLED','RELEASED','REFUNDED','SPENT') LIMIT 1 FOR SHARE",[p.id]))blocks.push('WALLET_SETTLEMENT_REVIEW_REQUIRED');
 }
 return [...new Set(blocks)];
}
function createPrivacyExecution({db,actor,operator,load,owned,command,change,match,decode,storageDescriptor}){
 const get=async(tx,key)=>{const r=await one(tx,'SELECT * FROM privacy_executions WHERE id=? FOR UPDATE',[id(key)]);if(!r)throw error('PRIVACY_EXECUTION_NOT_FOUND',404);r.payload=checked(r.payload_json,r.payload_sha256);return r;};
 async function access(tx,ctx,i,{exclusive=false}={}){
  const a=await actor(tx,ctx,exclusive?'FOR UPDATE':'FOR SHARE'),request=await load(tx,i.request_id);
  if(i.operations)await operator(tx,a);else owned(a,request);
  return {a,request};
 }
 async function dto(tx,r){
  const p=r.payload||checked(r.payload_json,r.payload_sha256),j=r.job_id?await one(tx,'SELECT status,last_error FROM platform_jobs WHERE id=?',[r.job_id]):null;
  return {id:r.id,request_id:r.request_id,action:r.action_code,target_id:r.target_id,object_version:r.object_version,
   current_status:r.current_status,proposal_sha256:r.payload_sha256,policy_rule_id:p.policy.id,
   job_status:j?.status||null,result:r.result_json?checked(r.result_json,r.result_sha256):null,
   request_completion:'NOT_CONFIRMED'};
 }
 async function save(tx,a,request,r,status,result=null){
  await tx.execute('UPDATE privacy_executions SET current_status=?,object_version=object_version+1,result_json=?,result_sha256=? WHERE id=?',[status,result?JSON.stringify(result):null,result?digest(result):null,r.id]);
  await change(tx,a,request,'FOLLOW_UP',{},'EXECUTION_'+status,'具体处理已有进展，请分别核对账号、文件和剩余事项');
  return dto(tx,await get(tx,r.id));
 }
 async function file(tx,account,key){
  const f=await one(tx,"SELECT s.* FROM supply_assets s JOIN parties p ON p.id=s.owner_party_id WHERE s.id=? AND p.kind='PERSON' AND p.personal_account_id=? FOR UPDATE",[id(key),account]);
  if(!f)throw error('PRIVACY_TARGET_NOT_FOUND',404);return f;
 }
 async function samePolicy(tx,p,action){const live=await policy(tx,p.policy.id,action);if(live.sha256!==p.policy.sha256)throw error('PRIVACY_POLICY_CHANGED',409);}
 return {
  async proposeExecution(ctx,i){
   shape(i.details,['display_name','target_kind','reason']);label(i.details.reason,1000);
   if(!actions.includes(i.action))throw error('PRIVACY_ACTION_INVALID',400);
   return db.withTransaction(async tx=>{
    const {a,request}=await access(tx,ctx,i),spec=decode(request.request_json,request.request_sha256);
    const content=i.action.includes('CONTENT');
    if(content){if(!i.operations||spec.type!=='COMPLAINT')throw error('PRIVACY_ACTION_SCOPE_MISMATCH',409);}
    else if(i.operations||!({PROFILE_CORRECTION:['CORRECT'],FILE_ERASURE:['DELETE','CLOSE_ACCOUNT'],ACCOUNT_CLOSURE:['CLOSE_ACCOUNT']}[i.action]||[]).includes(spec.type))throw error('PRIVACY_ACTION_SCOPE_MISMATCH',409);
    const scope=i.action==='PROFILE_CORRECTION'?'PROFILE':i.action==='FILE_ERASURE'?'ARTIST_MATERIALS':'ALL';
    if(!content&&!spec.scopes.includes('ALL')&&!spec.scopes.includes(scope))throw error('PRIVACY_ACTION_SCOPE_MISMATCH',409);
    return command(tx,a,'EXECUTION_PROPOSE',i,async()=>{
     match(request,i.expected_version);const pol=await policy(tx,i.policy_rule_id,i.action);
     let snapshot;
     if(i.action==='PROFILE_CORRECTION'||i.action==='ACCOUNT_CLOSURE'){
      if(id(i.target_id)!==request.account_id)throw error('PRIVACY_TARGET_NOT_FOUND',404);
      if(i.action==='PROFILE_CORRECTION')label(i.details.display_name,80);
      snapshot={account_version:a.object_version};
     }else if(i.action==='FILE_ERASURE'){
      const f=await file(tx,request.account_id,i.target_id);
      if(f.current_status!=='READY')throw error('PRIVATE_MATERIAL_NOT_READY',409);
      // Legal evidence and multi-party commercial works require their own reviewed
      // retention process; a personal material request cannot erase those.
      if(f.purpose!=='AVATAR_MATERIAL')throw error('PRIVACY_FILE_RETENTION_REVIEW_REQUIRED',409);
      snapshot={content_sha256:f.content_sha256,object_key:f.object_key,byte_size:f.byte_size,purpose:f.purpose,storage:await storageDescriptor()};
     }else if(i.action==='RESTRICT_CONTENT'){
      await R.target(tx,i.details.target_kind,i.target_id);
      snapshot={target_kind:i.details.target_kind};
     }else{
      const hold=await one(tx,"SELECT * FROM content_restrictions WHERE id=? AND current_status='ACTIVE' FOR UPDATE",[id(i.target_id)]);
      if(!hold)throw error('PRIVACY_TARGET_NOT_FOUND',404);
      snapshot={target_kind:hold.target_kind,target_id:hold.target_id,restriction_id:hold.id};
     }
     const payload={policy:pol,details:i.details,snapshot},key=randomUUID();
     await tx.execute('INSERT INTO privacy_executions(id,request_id,action_code,target_id,proposed_by,payload_json,payload_sha256) VALUES (?,?,?,?,?,?,?)',[key,request.id,i.action,id(i.target_id),a.id,JSON.stringify(payload),digest(payload)]);
     await change(tx,a,request,'FOLLOW_UP',{},'EXECUTION_PROPOSED','已记录具体处理方案，尚未执行');
     return dto(tx,await get(tx,key));
    });
   });
  },
  async executions(ctx,i){
   if(i.after)id(i.after);if(!Number.isSafeInteger(i.limit)||i.limit<1||i.limit>100)throw error('INVALID_LIMIT',400);
   return db.withTransaction(async tx=>{await access(tx,ctx,i);const [rows]=await tx.execute('SELECT * FROM privacy_executions WHERE request_id=? AND id>? ORDER BY id LIMIT ?',[i.request_id,i.after||'',i.limit+1]);const items=[];for(const r of rows.slice(0,i.limit))items.push(await dto(tx,r));return {items,next_cursor:rows.length>i.limit?rows[i.limit-1].id:null};});
  },
  async reviewExecution(ctx,i){
   if(!['APPROVE','REJECT'].includes(i.decision))throw error('INVALID_REVIEW',400);label(i.reason,1000);
   return db.withTransaction(async tx=>{
    const {a,request}=await access(tx,ctx,{...i,operations:true});await operator(tx,a,'PRIVACY_REVIEW');
    const r=await get(tx,i.execution_id);
    if(r.request_id!==request.id)throw error('PRIVACY_EXECUTION_NOT_FOUND',404);
    if(a.id===r.proposed_by||a.id===request.account_id)throw error('SELF_REVIEW_FORBIDDEN',403);
    return command(tx,a,'EXECUTION_REVIEW',i,async()=>{
     match(r,i.expected_version);if(r.current_status!=='PROPOSED'||i.proposal_sha256!==r.payload_sha256)throw error('CONFIRMATION_VERSION_MISMATCH',409);
     await samePolicy(tx,r.payload,r.action_code);
     if(r.action_code.includes('CONTENT')){const s=r.payload.snapshot,target=await R.target(tx,s.target_kind,s.target_id||r.target_id);if(await R.reviewConflict(tx,s.target_kind,target,a.id))throw error('SELF_REVIEW_FORBIDDEN',403);}
     if(i.decision==='APPROVE'&&(i.scope_verified!==true||i.retention_verified!==true))throw error('MANUAL_VERIFICATION_REQUIRED',409);
     await tx.execute('UPDATE privacy_executions SET reviewed_by=? WHERE id=?',[a.id,r.id]);
     return save(tx,a,request,r,i.decision==='APPROVE'?'APPROVED':'REJECTED',{review_reason:i.reason});
    });
   });
  },
  async execute(ctx,i){
   if(i.confirmed!==true)throw error('PRIVACY_CONFIRMATION_REQUIRED',409);
   return db.withTransaction(async tx=>{
    // Account-row write lock also prevents an in-flight business writer holding
    // a shared account lock from crossing logical closure.
    const {a,request}=await access(tx,ctx,i,{exclusive:true}),r=await get(tx,i.execution_id);
    if(r.request_id!==request.id)throw error('PRIVACY_EXECUTION_NOT_FOUND',404);
    const content=r.action_code.includes('CONTENT');
    if(content!==!!i.operations)throw error('PRIVACY_FORBIDDEN',403);
    return command(tx,a,'EXECUTION_APPLY',i,async()=>{
     match(r,i.expected_version);if(r.current_status!=='APPROVED')throw error('PRIVACY_EXECUTION_NOT_APPROVED',409);
     await samePolicy(tx,r.payload,r.action_code);const s=r.payload.snapshot;let result;
     if(r.action_code==='PROFILE_CORRECTION'){
      if(a.object_version!==s.account_version)throw error('VERSION_CONFLICT',412);
      await tx.execute('UPDATE identity_accounts SET display_name=?,object_version=object_version+1 WHERE id=?',[r.payload.details.display_name,a.id]);
      result={effect:'ACCOUNT_DISPLAY_NAME_UPDATED',historical_records:'UNCHANGED'};
     }else if(r.action_code==='ACCOUNT_CLOSURE'){
      if(a.object_version!==s.account_version)throw error('VERSION_CONFLICT',412);
      const blockers=await closureBlockers(tx,a);if(blockers.length)throw error(blockers[0],409);
      await tx.execute("UPDATE identity_accounts SET current_status='CLOSED',object_version=object_version+1 WHERE id=?",[a.id]);
      await tx.execute('UPDATE auth_sessions SET revoked=TRUE WHERE account_id=?',[a.id]);
      await tx.execute("UPDATE parties SET current_status='CLOSED',object_version=object_version+1 WHERE kind='PERSON' AND personal_account_id=?",[a.id]);
      await tx.execute("UPDATE party_memberships SET current_status='REVOKED',object_version=object_version+1 WHERE account_id=? AND current_status<>'REVOKED'",[a.id]);
      result={effect:'ACCOUNT_ACCESS_CLOSED',historical_records:'RETAINED_UNDER_REVIEWED_POLICY',data_erasure:'NOT_CONFIRMED',support_reference:request.id};
     }else if(r.action_code==='FILE_ERASURE'){
      const f=await file(tx,request.account_id,r.target_id),descriptor=await storageDescriptor();
      if(f.current_status!=='READY'||f.content_sha256!==s.content_sha256||f.object_key!==s.object_key||f.byte_size!==s.byte_size)throw error('PRIVACY_TARGET_CHANGED',409);
      if(digest(descriptor)!==digest(s.storage))throw error('PRIVACY_STORAGE_CONFIGURATION_CHANGED',409);
      await tx.execute("INSERT INTO privacy_tombstones(asset_id,execution_id,content_sha256,object_key,current_status) VALUES (?,?,?,?,'ERASURE_PENDING')",[f.id,r.id,f.content_sha256,f.object_key]);
      await tx.execute("UPDATE supply_assets SET current_status='ERASURE_PENDING' WHERE id=?",[f.id]);
      const job=await require('../../infrastructure/jobs/repository').createJobRepository(db).enqueue({task_type:'PRIVACY_FILE_ERASURE',business_key:r.id,payload_ref:r.id,provider:'aliyun-oss',max_attempts:3},tx);
      await tx.execute('UPDATE privacy_executions SET job_id=? WHERE id=?',[job.id,r.id]);
      return save(tx,a,request,r,'QUEUED',{effect:'FILE_ACCESS_REMOVED',current_object_erasure:'NOT_CONFIRMED',versions_and_backups:'REVIEW_REQUIRED'});
     }else if(r.action_code==='RESTRICT_CONTENT'){
      await R.target(tx,s.target_kind,r.target_id);const hold=randomUUID();
      await tx.execute('INSERT INTO content_restrictions(id,target_kind,target_id,execution_id) VALUES (?,?,?,?)',[hold,s.target_kind,r.target_id,r.id]);
      result={effect:'CONTENT_RESTRICTED',restriction_id:hold};
     }else{
      const [changed]=await tx.execute("UPDATE content_restrictions SET current_status='RELEASED',released_by_execution=? WHERE id=? AND current_status='ACTIVE'",[r.id,s.restriction_id]);
      if(changed.affectedRows!==1)throw error('PRIVACY_TARGET_CHANGED',409);
      result={effect:'ONE_RESTRICTION_RELEASED',other_restrictions:'UNCHANGED',original_business_status:'UNCHANGED'};
     }
     return save(tx,a,request,r,'EXECUTED',result);
    });
   });
  },
  async exportData(ctx,i){
   if(i.after)id(i.after);if(!Number.isSafeInteger(i.limit)||i.limit<1||i.limit>100)throw error('INVALID_LIMIT',400);
   return db.withTransaction(async tx=>{
    const {a,request}=await access(tx,ctx,{...i,operations:false}),s=decode(request.request_json,request.request_sha256);
    if(!['QUERY','COPY'].includes(s.type))throw error('PRIVACY_ACTION_SCOPE_MISMATCH',409);
    if(!['PROFILE','ARTIST_MATERIALS'].includes(i.category)||!s.scopes.some(v=>v==='ALL'||v===i.category))throw error('PRIVACY_ACTION_SCOPE_MISMATCH',409);
    if(i.category==='PROFILE')return {category:i.category,items:[{account_id:a.id,display_name:a.display_name,object_version:a.object_version}],next_cursor:null,coverage:'ACCOUNT_PROFILE_ONLY'};
    const [rows]=await tx.execute("SELECT s.id,s.purpose,s.media_type,s.byte_size,s.content_sha256,s.current_status FROM supply_assets s JOIN parties p ON p.id=s.owner_party_id WHERE p.personal_account_id=? AND p.kind='PERSON' AND s.purpose='AVATAR_MATERIAL' AND s.id>? ORDER BY s.id LIMIT ?",[a.id,i.after||'',i.limit+1]);
    return {category:i.category,items:rows.slice(0,i.limit),next_cursor:rows.length>i.limit?rows[i.limit-1].id:null,coverage:'OWN_MATERIAL_METADATA_ONLY'};
   });
  },
 };
}
module.exports={createPrivacyExecution,checked,closureBlockers,policy};
