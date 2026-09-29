 'use strict';
const {randomUUID,createHash}=require('node:crypto');
const {id,ref,label,shape,version,error}=require('../party/policy');
const {canonical,digest}=require('../governance/content');
const {authorizeOperator}=require('../governance/operator-access');
const policy=require('./version-policy');
const {normalizeConsent,coversConsent}=require('./consent-policy');
const {createJobRepository}=require('../../infrastructure/jobs/repository');
const one=async(tx,sql,args=[]) => (await tx.execute(sql,args))[0][0];
const copy=value=>JSON.parse(canonical(value));
const readActions={PROFILE:['SUPPLY_REVIEW_PROFILE'],WORK_VERSION:['SUPPLY_REVIEW_RIGHTS','SUPPLY_REVIEW_CONTENT'],CONSENT:['SUPPLY_REVIEW_CONSENT'],AVATAR:['SUPPLY_REVIEW_CONSENT']};
function createSupplyRepository(db,{resolvePrincipal=async()=>null,verifyProjectSource=async()=>false}={}){
 const jobs=createJobRepository(db);
 async function actor(tx,ctx){const principal=await resolvePrincipal(ctx);if(!principal)throw error('AUTHENTICATION_REQUIRED',401);const a=await one(tx,'SELECT * FROM identity_accounts WHERE subject_ref=? FOR SHARE',[ref(principal.subject_ref)]);if(!a||a.current_status!=='ACTIVE')throw error('ACCOUNT_NOT_ACTIVE');return {...a,request_id:ref(principal.request_id||randomUUID())};}
 async function party(tx,a,partyId,write=false){
  const p=await one(tx,'SELECT * FROM parties WHERE id=? '+(write?'FOR UPDATE':'FOR SHARE'),[id(partyId)]);
  if(!p||['SUSPENDED','CLOSED'].includes(p.current_status))throw error('PARTY_NOT_ACTIVE');
  const m=await one(tx,'SELECT * FROM party_memberships WHERE party_id=? AND account_id=? FOR SHARE',[p.id,a.id]);
  if(!m||m.current_status!=='ACTIVE'||m.role_code!=='OWNER')throw error('SUPPLY_PARTY_FORBIDDEN');
  return p;
 }
 async function permitted(tx,a,action){if(!await authorizeOperator(tx,{account_id:a.id,action}))throw error('SUPPLY_REVIEW_FORBIDDEN');}
 async function independent(tx,a,row){
  if(row.created_by===a.id||await one(tx,"SELECT id FROM party_memberships WHERE party_id=? AND account_id=? AND current_status='ACTIVE'",[row.owner_party_id,a.id]))throw error('SELF_REVIEW_FORBIDDEN');
 }
 function data(row){const value=typeof row.data_json==='string'?JSON.parse(row.data_json):row.data_json;if(digest(value)!==row.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);if(row.kind==='WORK_VERSION'&&(value.version.content.id!==row.id||value.version.content.work_id!==row.stream_ref||value.version.content.owner_party_id!==row.owner_party_id||value.version.content.revision!==row.revision||value.version.object_version!==row.object_version||policy.reviewProgress(value.version)!==row.current_status))throw error('STORED_CONTENT_MISMATCH',503);return {id:row.id,kind:row.kind,stream_ref:row.stream_ref,revision:row.revision,owner_party_id:row.owner_party_id,created_by:row.created_by,current_status:row.current_status,object_version:row.object_version,data:value};}
 async function audit(tx,a,row,event,from=0){await tx.execute('INSERT INTO supply_audit(id,record_id,actor_account_id,event_code,from_version,to_version,data_sha256,request_id) VALUES (?,?,?,?,?,?,?,?)',[randomUUID(),row.id,a.id,event,from,row.object_version,digest(row.data),a.request_id]);}
 async function insert(tx,a,{kind,stream,revision=1,partyId,status,body,recordId=randomUUID()}){
  const row={id:recordId,kind,stream_ref:stream,revision,owner_party_id:partyId,created_by:a.id,current_status:status,object_version:1,data:body};
  await tx.execute('INSERT INTO supply_records(id,kind,stream_ref,revision,owner_party_id,created_by,current_status,object_version,data_json,data_sha256) VALUES (?,?,?,?,?,?,?,?,?,?)',[row.id,kind,stream,revision,partyId,a.id,status,1,JSON.stringify(body),digest(body)]);
  await audit(tx,a,row,kind+'_CREATED');return row;
 }
 async function save(tx,a,row,body,status,event){
  const next={...row,data:body,current_status:status,object_version:row.object_version+1};
  const [result]=await tx.execute('UPDATE supply_records SET data_json=?,data_sha256=?,current_status=?,object_version=? WHERE id=? AND object_version=?',[JSON.stringify(body),digest(body),status,next.object_version,row.id,row.object_version]);
  if(result.affectedRows!==1)throw error('VERSION_CONFLICT',412);await audit(tx,a,next,event,row.object_version);return next;
 }
 async function load(tx,recordId,kind,lock='FOR SHARE'){const row=await one(tx,'SELECT * FROM supply_records WHERE id=? '+lock,[id(recordId)]);if(!row||kind&&row.kind!==kind)throw error('SUPPLY_NOT_FOUND',404);return data(row);}
 async function now(tx){const row=await one(tx,"SELECT DATE_FORMAT(CURRENT_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') utc");return row.utc.replace(/(\.\d{3})\d{3}Z$/,'$1Z');}
 async function cmd(tx,a,operation,scope,input,work,replay=async()=>{}){
  const key=digest([a.id,operation,scope,ref(input.operation_key)]),fingerprint=digest(input);
  try{await tx.execute('INSERT INTO supply_commands(id,fingerprint) VALUES (?,?)',[key,fingerprint]);}catch(e){
   if(e.code!=='ER_DUP_ENTRY')throw e;const old=await one(tx,'SELECT * FROM supply_commands WHERE id=?',[key]);if(old.fingerprint!==fingerprint)throw error('IDEMPOTENCY_CONFLICT',409);if(!old.result_json)throw error('IDEMPOTENCY_IN_PROGRESS',409);const result=typeof old.result_json==='string'?JSON.parse(old.result_json):old.result_json;await replay(result);return result;
  }
  const result=await work();await tx.execute('UPDATE supply_commands SET result_json=? WHERE id=?',[JSON.stringify(result),key]);return result;
 }
 async function assets(tx,assetIds,owner,purposes){
  if(!Array.isArray(assetIds)||!assetIds.length||assetIds.length>100||new Set(assetIds).size!==assetIds.length)throw error('MATERIALS_REQUIRED',400);
  const found=[];for(const assetId of [...assetIds].sort()){
   const asset=await one(tx,'SELECT * FROM supply_assets WHERE id=?',[id(assetId)]);
   if(!asset||asset.owner_party_id!==owner||asset.current_status!=='READY'||!purposes.includes(asset.purpose))throw error('PRIVATE_MATERIAL_NOT_READY',409);found.push(asset);
  }return found;
 }
 async function attach(tx,row,ids){for(const assetId of new Set(ids))await tx.execute('INSERT INTO supply_asset_refs(record_id,asset_id) VALUES (?,?)',[row.id,assetId]);}
 async function eligible(tx,partyId){const row=await one(tx,"SELECT current_status FROM supply_records WHERE kind='PROFILE' AND owner_party_id=? ORDER BY revision DESC LIMIT 1 FOR SHARE",[partyId]);if(!row||row.current_status!=='APPROVED')throw error('SUPPLIER_NOT_APPROVED',409);}
 async function visible(tx,a,row,partyId){
  if(partyId){await party(tx,a,partyId);if(row.owner_party_id===partyId||row.kind==='CONSENT'&&row.data.consent.subject_party_id===partyId)return;throw error('SUPPLY_NOT_FOUND',404);}
  if(['DRAFT','WITHDRAWN'].includes(row.current_status))throw error('SUPPLY_NOT_FOUND',404);
  for(const action of readActions[row.kind])if(await authorizeOperator(tx,{account_id:a.id,action}))return;
  throw error('SUPPLY_NOT_FOUND',404);
 }
 async function reviewer(tx,a,row,action){await permitted(tx,a,action);await independent(tx,a,row);}
 function match(row,expected){if(row.object_version!==version(expected))throw error('VERSION_CONFLICT',412);}
 async function validateCredits(tx,value,owner){
  if(!Array.isArray(value)||!value.length||value.length>30)throw error('RIGHTS_CHAIN_REQUIRED',400);
  let holder=false;const seen=new Set();
  for(const c of value){shape(c,['party_id','role','evidence_asset_ids']);id(c.party_id);if(!['AUTHOR','RIGHTS_HOLDER','AGENT'].includes(c.role))throw error('INVALID_CREDIT',400);const key=c.party_id+':'+c.role;if(seen.has(key))throw error('DUPLICATE_CREDIT',400);seen.add(key);if(c.role==='RIGHTS_HOLDER')holder=true;
   if(!await one(tx,'SELECT id FROM parties WHERE id=? FOR SHARE',[c.party_id]))throw error('RIGHTS_PARTY_NOT_FOUND',404);await assets(tx,c.evidence_asset_ids,owner,['RIGHTS_EVIDENCE']);
  }if(!holder)throw error('RIGHTS_HOLDER_REQUIRED',400);
 }
 const api={
  async read(ctx,{record_id,party_id=null}){return db.withTransaction(async tx=>{const a=await actor(tx,ctx),row=await load(tx,record_id);await visible(tx,a,row,party_id);return row;});},
  async list(ctx,{party_id=null,kind,after='',limit=20}){
   if(!Object.hasOwn(readActions,kind)||!Number.isInteger(limit)||limit<1||limit>100)throw error('INVALID_LIST',400);if(after)id(after);
   return db.withTransaction(async tx=>{const a=await actor(tx,ctx);if(party_id)await party(tx,a,party_id);else{let allowed=false;for(const act of readActions[kind])if(await authorizeOperator(tx,{account_id:a.id,action:act}))allowed=true;if(!allowed)throw error('SUPPLY_REVIEW_FORBIDDEN');}
    const [rows]=await tx.execute('SELECT * FROM supply_records WHERE kind=? AND id>? '+(party_id?"AND (owner_party_id=? OR (kind='CONSENT' AND JSON_UNQUOTE(JSON_EXTRACT(data_json,'$.consent.subject_party_id'))=?)) ":"AND current_status NOT IN ('DRAFT','WITHDRAWN') ")+'ORDER BY id LIMIT ?',[kind,after,...(party_id?[party_id,party_id]:[]),limit+1]);
    return {items:rows.slice(0,limit).map(data),next_cursor:rows.length>limit?rows[limit-1].id:null};});
  },
  async createProfile(ctx,input){input=copy(input);shape(input,['party_id','display_name','description','evidence_asset_ids','previous_profile_id','operation_key']);label(input.display_name,120);label(input.description,2000);
   return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await party(tx,a,input.party_id,true);return cmd(tx,a,'PROFILE_CREATE',input.party_id,input,async()=>{
    const latest=await one(tx,"SELECT * FROM supply_records WHERE kind='PROFILE' AND stream_ref=? ORDER BY revision DESC LIMIT 1 FOR UPDATE",[input.party_id]);if((latest?.id||null)!==input.previous_profile_id)throw error('PREVIOUS_VERSION_MISMATCH',409);
    await assets(tx,input.evidence_asset_ids,input.party_id,['RIGHTS_EVIDENCE']);const row=await insert(tx,a,{kind:'PROFILE',stream:input.party_id,revision:(latest?.revision||0)+1,partyId:input.party_id,status:'PENDING_REVIEW',body:{display_name:input.display_name,description:input.description,evidence_asset_ids:input.evidence_asset_ids,review:null}});await attach(tx,row,input.evidence_asset_ids);return row;});});
  },
  async reviewProfile(ctx,input){return reviewSimple(ctx,input,'PROFILE','SUPPLY_REVIEW_PROFILE');},
  async createVersion(ctx,input){input=copy(input);shape(input,['party_id','work_id','previous_version_id','title','kind','source_version_id','project_id','content_asset_id','evidence_ids','credits','operation_key']);
   return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await party(tx,a,input.party_id,true);await eligible(tx,input.party_id);return cmd(tx,a,'VERSION_CREATE',input.party_id,input,async()=>{
    let previous=null,workId=input.work_id===null?randomUUID():id(input.work_id);
    if(input.work_id!==null){const found=await one(tx,"SELECT * FROM supply_records WHERE kind='WORK_VERSION' AND stream_ref=? ORDER BY revision DESC LIMIT 1 FOR UPDATE",[workId]);if(!found||found.owner_party_id!==input.party_id)throw error('SUPPLY_NOT_FOUND',404);previous=data(found);}
    if((previous?.id||null)!==input.previous_version_id)throw error('PREVIOUS_VERSION_MISMATCH',409);
    const [file]=await assets(tx,[input.content_asset_id],input.party_id,['WORK_CONTENT']);await assets(tx,input.evidence_ids,input.party_id,['RIGHTS_EVIDENCE']);await validateCredits(tx,input.credits,input.party_id);
    if(input.kind==='PROJECT_ADAPTATION'){
     const source=await load(tx,input.source_version_id,'WORK_VERSION');
     if(source.current_status!=='REVIEWS_COMPLETE'||await verifyProjectSource(tx,{account_id:a.id,party_id:input.party_id,source,project_id:id(input.project_id)})!==true)throw error('PROJECT_LICENSE_NOT_READY',409);
    }
    const recordId=randomUUID(),value=policy.createVersion({id:recordId,work_id:workId,revision:(previous?.revision||0)+1,kind:input.kind,source_version_id:input.source_version_id,project_id:input.project_id,owner_party_id:input.party_id,title:input.title,content_asset_id:input.content_asset_id,content_sha256:file.content_sha256,evidence_ids:input.evidence_ids},previous?.data.version||null);
    const row=await insert(tx,a,{kind:'WORK_VERSION',stream:workId,revision:value.content.revision,recordId,partyId:input.party_id,status:'DRAFT',body:{version:value,credits:input.credits}});await attach(tx,row,[file.id,...input.evidence_ids,...input.credits.flatMap(c=>c.evidence_asset_ids)]);return row;});});
  },
  async changeVersion(ctx,input){input=copy(input);shape(input,['party_id','record_id','action','expected_version','reason','operation_key']);if(!['SUBMIT','WITHDRAW'].includes(input.action))throw error('INVALID_WORK_ACTION',400);
   return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await party(tx,a,input.party_id,true);const row=await load(tx,input.record_id,'WORK_VERSION','FOR UPDATE');if(row.owner_party_id!==input.party_id)throw error('SUPPLY_NOT_FOUND',404);
    return cmd(tx,a,'VERSION_'+input.action,row.id,input,async()=>{match(row,input.expected_version);let next;
     if(input.action==='SUBMIT'){await eligible(tx,input.party_id);await assets(tx,[row.data.version.content.content_asset_id],input.party_id,['WORK_CONTENT']);await assets(tx,row.data.version.content.evidence_ids,input.party_id,['RIGHTS_EVIDENCE']);next=policy.submitVersion(row.data.version,{expected_version:row.object_version,recorded_at:await now(tx)});}
     else next=policy.withdrawVersion(row.data.version,{expected_version:row.object_version,reason:input.reason,recorded_at:await now(tx)});
     return save(tx,a,row,{...row.data,version:next},policy.reviewProgress(next),'VERSION_'+input.action);
    });});
  },
  async reviewVersion(ctx,input){input=copy(input);shape(input,['record_id','channel','decision','reason','expected_version','operation_key']);if(!['RIGHTS','CONTENT'].includes(input.channel))throw error('INVALID_REVIEW',400);
   return db.withTransaction(async tx=>{const a=await actor(tx,ctx),row=await load(tx,input.record_id,'WORK_VERSION','FOR UPDATE');await reviewer(tx,a,row,'SUPPLY_REVIEW_'+input.channel);
    return cmd(tx,a,'REVIEW_'+input.channel,row.id,input,async()=>{match(row,input.expected_version);const value=policy.reviewVersion(row.data.version,{expected_version:row.object_version,channel:input.channel,decision:input.decision,reviewer_account_id:a.id,evidence_ref:'record:'+row.id,reason:input.reason,recorded_at:await now(tx)});return save(tx,a,row,{...row.data,version:value},policy.reviewProgress(value),'REVIEW_'+input.channel);});});
  },
  async createAvatar(ctx,input){input=copy(input);shape(input,['party_id','display_name','material_asset_ids','operation_key']);label(input.display_name,120);
   return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await party(tx,a,input.party_id,true);return cmd(tx,a,'AVATAR_CREATE',input.party_id,input,async()=>{
    await assets(tx,input.material_asset_ids,input.party_id,['AVATAR_MATERIAL']);const row=await insert(tx,a,{kind:'AVATAR',stream:randomUUID(),partyId:input.party_id,status:'RECORDED',body:{display_name:input.display_name,material_asset_ids:input.material_asset_ids,provider_asset_ref:null}});await attach(tx,row,input.material_asset_ids);return row;});});
  },
  async createConsent(ctx,input){input=copy(input);shape(input,['consent','operation_key']);const consent=normalizeConsent(input.consent);
   return db.withTransaction(async tx=>{const a=await actor(tx,ctx),subject=await party(tx,a,consent.subject_party_id,true);if(subject.kind!=='PERSON'||subject.personal_account_id!==a.id)throw error('PERSONAL_CONSENT_REQUIRED');const avatar=await load(tx,consent.avatar_id,'AVATAR');
    return cmd(tx,a,'CONSENT_CREATE',avatar.id,input,async()=>{await assets(tx,consent.evidence_asset_ids,subject.id,['CONSENT_EVIDENCE']);if(consent.valid_until<=await now(tx))throw error('CONSENT_ALREADY_EXPIRED',400);const row=await insert(tx,a,{kind:'CONSENT',stream:randomUUID(),partyId:avatar.owner_party_id,status:'PENDING_REVIEW',body:{consent,review:null,withdrawal:null,signing_method:'IN_APP_DECLARATION',identity_verification:'NOT_VERIFIED'}});await attach(tx,row,consent.evidence_asset_ids);return row;});});
  },
  async reviewConsent(ctx,input){return reviewSimple(ctx,input,'CONSENT','SUPPLY_REVIEW_CONSENT');},
  async withdrawConsent(ctx,input){input=copy(input);shape(input,['record_id','expected_version','reason','operation_key']);label(input.reason,1000);
   return db.withTransaction(async tx=>{const a=await actor(tx,ctx),row=await load(tx,input.record_id,'CONSENT','FOR UPDATE');const subject=await party(tx,a,row.data.consent.subject_party_id,true);if(subject.personal_account_id!==a.id)throw error('PERSONAL_CONSENT_REQUIRED');
    return cmd(tx,a,'CONSENT_WITHDRAW',row.id,input,async()=>{match(row,input.expected_version);if(row.current_status==='WITHDRAWN')throw error('CONSENT_ALREADY_WITHDRAWN',409);const next=await save(tx,a,row,{...row.data,withdrawal:{reason:input.reason,recorded_at:await now(tx)}},'WITHDRAWN','CONSENT_WITHDRAW');
     await jobs.publish(tx,'consent-withdraw:'+row.id,{task_type:'CONSENT_WITHDRAWAL_REVIEW',business_key:row.id,payload_ref:'consent:'+row.id,max_attempts:1});return next;});});
  },
  async consentScope(ctx,input){shape(input,['party_id','record_id','feature','purpose','territory']);return db.withTransaction(async tx=>{const a=await actor(tx,ctx),row=await load(tx,input.record_id,'CONSENT');await visible(tx,a,row,input.party_id);const matches=coversConsent(row,{feature:input.feature,purpose:input.purpose,territory:input.territory},await now(tx));return {consent_id:row.id,scope_matches:matches,usable_for_generation:false,reason_code:matches?'IDENTITY_AND_PROVIDER_NOT_VERIFIED':'CONSENT_SCOPE_NOT_AVAILABLE'};});},
  async reserveAsset(ctx,input){shape(input,['party_id','purpose','media_type','body','operation_key']);if(!Buffer.isBuffer(input.body)||!input.body.length||input.body.length>8*1024*1024)throw error('INVALID_ASSET_SIZE',400);if(!['WORK_CONTENT','RIGHTS_EVIDENCE','CONSENT_EVIDENCE','REVIEW_EVIDENCE','AVATAR_MATERIAL'].includes(input.purpose)||!['application/pdf','text/plain','image/jpeg','image/png','audio/wav','audio/mpeg','video/mp4','application/octet-stream'].includes(input.media_type))throw error('INVALID_ASSET_TYPE',400);
   const hash=createHash('sha256').update(input.body).digest('hex');return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await party(tx,a,input.party_id,true);const op=digest([a.id,input.party_id,ref(input.operation_key)]);const old=await one(tx,'SELECT * FROM supply_assets WHERE operation_hash=? FOR UPDATE',[op]);
    if(old){if(old.content_sha256!==hash||old.purpose!==input.purpose||old.media_type!==input.media_type)throw error('IDEMPOTENCY_CONFLICT',409);if(old.current_status!=='READY')throw error('UPLOAD_RECONCILIATION_REQUIRED',409);return {asset:old,replay:true};}
    const assetId=randomUUID(),objectKey='private/'+input.party_id+'/'+assetId;await tx.execute('INSERT INTO supply_assets(id,owner_party_id,created_by,operation_hash,object_key,purpose,media_type,byte_size,content_sha256) VALUES (?,?,?,?,?,?,?,?,?)',[assetId,input.party_id,a.id,op,objectKey,input.purpose,input.media_type,input.body.length,hash]);return {asset:await one(tx,'SELECT * FROM supply_assets WHERE id=?',[assetId]),replay:false};});
  },
  async finishAsset(ctx,assetId,success){return db.withTransaction(async tx=>{const a=await actor(tx,ctx),prior=await one(tx,'SELECT * FROM supply_assets WHERE id=?',[id(assetId)]);if(!prior||prior.created_by!==a.id)throw error('SUPPLY_NOT_FOUND',404);await party(tx,a,prior.owner_party_id,true);const row=await one(tx,'SELECT * FROM supply_assets WHERE id=? FOR UPDATE',[assetId]);if(row.current_status!=='UPLOADING')throw error('UPLOAD_STATE_CONFLICT',409);await tx.execute('UPDATE supply_assets SET current_status=? WHERE id=?',[success?'READY':'FAILED',row.id]);await audit(tx,a,{id:row.id,object_version:1,data:{sha256:row.content_sha256,size:row.byte_size}},success?'ASSET_READY':'ASSET_FAILED');return {...row,current_status:success?'READY':'FAILED'};});},
  async assetAccess(ctx,assetId,partyId=null){return db.withTransaction(async tx=>{const a=await actor(tx,ctx),asset=await one(tx,'SELECT * FROM supply_assets WHERE id=?',[id(assetId)]);if(!asset||asset.current_status!=='READY')throw error('SUPPLY_NOT_FOUND',404);
    if(partyId){await party(tx,a,partyId);if(asset.owner_party_id===partyId)return asset;}
    const [records]=await tx.execute('SELECT r.* FROM supply_records r JOIN supply_asset_refs f ON f.record_id=r.id WHERE f.asset_id=?',[asset.id]);for(const raw of records){try{await visible(tx,a,data(raw),partyId);return asset;}catch(e){if(e.code!=='SUPPLY_NOT_FOUND')throw e;}}
    throw error('SUPPLY_NOT_FOUND',404);});},
 };
 async function reviewSimple(ctx,input,kind,action){input=copy(input);shape(input,['record_id','decision','reason','expected_version','operation_key']);if(!['APPROVED','CHANGES_REQUESTED','REJECTED'].includes(input.decision))throw error('INVALID_REVIEW',400);label(input.reason,1000);
  return db.withTransaction(async tx=>{const a=await actor(tx,ctx),row=await load(tx,input.record_id,kind,'FOR UPDATE');await reviewer(tx,a,row,action);return cmd(tx,a,kind+'_REVIEW',row.id,input,async()=>{match(row,input.expected_version);if(row.current_status!=='PENDING_REVIEW')throw error('REVIEW_NOT_PENDING',409);return save(tx,a,row,{...row.data,review:{decision:input.decision,reason:input.reason,reviewer_account_id:a.id,recorded_at:await now(tx)}},input.decision,kind+'_REVIEW');});});
 }
 return Object.freeze(api);
}
module.exports={createSupplyRepository};
