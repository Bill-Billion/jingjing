"use strict";
const {randomUUID,createHash}=require('node:crypto');
const {id,shape,error}=require('../party/policy'),{digest}=require('../governance/content');
const P=require('./policy');
const one=async(tx,sql,args=[])=>(await tx.execute(sql,args))[0][0];
function stored(value,hash){const d=typeof value==='string'?JSON.parse(value):value;if(digest(d)!==hash)throw error('STORED_CONTENT_MISMATCH',503);return d;}
function references(template,answers){return template.fields.filter(f=>f.type==='PRIVATE_ATTACHMENT'&&answers[f.key]).map(f=>answers[f.key]);}
async function validate(tx,r,template,answers){
 for(const key of references(template,answers)){
  const row=await one(tx,'SELECT * FROM customization_attachments WHERE id=? AND request_id=? FOR SHARE',[id(key),r.id]);
  if(!row||row.created_by!==r.created_by||row.current_status!=='READY')throw error('CUSTOMIZATION_ATTACHMENT_NOT_READY',409);
 }
}
function metadata(r){return {id:r.id,request_id:r.request_id,display_name:r.display_name,media_type:r.media_type,byte_size:r.byte_size,content_sha256:r.content_sha256,current_status:r.current_status,object_version:r.object_version};}
async function submittedReference(tx,r,key){
 const rows=(await tx.execute('SELECT template_snapshot_json,template_sha256,answers_json,answers_sha256 FROM customization_submissions WHERE request_id=? FOR SHARE',[r.id]))[0];
 return rows.some(s=>references(stored(s.template_snapshot_json,s.template_sha256),stored(s.answers_json,s.answers_sha256)).includes(key));
}
async function editable(tx,r){
 if(r.current_status==='DRAFT')return;
 if(!await one(tx,"SELECT id FROM customization_supplements WHERE request_id=? AND current_status='OPEN' FOR SHARE",[r.id]))throw error('CUSTOMIZATION_ATTACHMENT_NOT_EDITABLE',409);
 await require('./trade-context').assertUnordered(tx,r.id);
}
function methods({db,actor,member,load,creator,visible,match,command,audit}){
 async function own(tx,ctx,requestId,party){const a=await actor(tx,ctx);await member(tx,a,id(party));const r=await load(tx,id(requestId),'FOR UPDATE');creator(a,r,party);return {a,r};}
 async function file(tx,r,key){const f=await one(tx,'SELECT * FROM customization_attachments WHERE id=? AND request_id=? FOR UPDATE',[id(key),r.id]);if(!f)throw error('CUSTOMIZATION_ATTACHMENT_NOT_FOUND',404);return f;}
 return {
 async reserveAttachment(ctx,i){
  shape(i,['request_id','party_id','display_name','media_type','body','operation_key']);P.operationKey(i.operation_key);
  if(!Buffer.isBuffer(i.body)||!i.body.length||i.body.length>8*1024*1024)throw error('INVALID_ASSET_SIZE',400);
  if(!['image/jpeg','image/png','video/mp4','audio/mpeg','audio/wav','application/pdf','text/plain'].includes(i.media_type))throw error('INVALID_ASSET_TYPE',400);
  if(typeof i.display_name!=='string'||!i.display_name.trim()||Array.from(i.display_name).length>120||/[\x00-\x1f\x7f]/.test(i.display_name))throw error('INVALID_ATTACHMENT_NAME',400);
  return db.withTransaction(async tx=>{
   const {a,r}=await own(tx,ctx,i.request_id,i.party_id),hash=createHash('sha256').update(i.body).digest('hex'),op=digest(['STORY_ATTACHMENT',a.id,r.id,i.operation_key]);
   const old=await one(tx,'SELECT * FROM customization_attachments WHERE operation_hash=? FOR UPDATE',[op]);
   if(old){if(old.content_sha256!==hash||old.display_name!==i.display_name||old.media_type!==i.media_type||old.byte_size!==i.body.length)throw error('IDEMPOTENCY_CONFLICT',409);if(old.current_status==='REVOKED')throw error('CUSTOMIZATION_ATTACHMENT_REVOKED',409);return {asset:old,replay:true};}
   await editable(tx,r);
   const template=stored(r.template_snapshot_json,r.template_sha256);if(!template.fields.some(f=>f.type==='PRIVATE_ATTACHMENT'))throw error('CUSTOMIZATION_ATTACHMENT_FIELD_REQUIRED',409);
   const n=await one(tx,'SELECT COUNT(*) n FROM customization_attachments WHERE request_id=?',[r.id]);if(Number(n.n)>=40)throw error('CUSTOMIZATION_ATTACHMENT_LIMIT',409);
   const key=randomUUID();await tx.execute("INSERT INTO customization_attachments(id,request_id,created_by,operation_hash,object_key,display_name,media_type,byte_size,content_sha256) VALUES (?,?,?,?,?,?,?,?,?)",[key,r.id,a.id,op,'private/story/'+r.id+'/'+key,i.display_name,i.media_type,i.body.length,hash]);
   await audit(tx,a,{request_id:r.id,event_code:'ATTACHMENT_RESERVED',object_version:r.object_version,content_sha256:hash});
   return {asset:await file(tx,r,key),replay:false};
  });
 },
 async finishAttachment(ctx,i){return db.withTransaction(async tx=>{
  const {a,r}=await own(tx,ctx,i.request_id,i.party_id),f=await file(tx,r,i.asset_id);
  if(f.current_status==='REVOKED')throw error('CUSTOMIZATION_ATTACHMENT_REVOKED',409);
  if(f.current_status==='READY')return metadata(f);
  await editable(tx,r);await tx.execute("UPDATE customization_attachments SET current_status='READY',object_version=object_version+1 WHERE id=?",[f.id]);
  await audit(tx,a,{request_id:r.id,event_code:'ATTACHMENT_READY',object_version:r.object_version,content_sha256:f.content_sha256});return metadata(await file(tx,r,f.id));
 });},
 async attachment(ctx,i){return db.withTransaction(async tx=>{
  const a=await actor(tx,ctx),r=await load(tx,id(i.request_id));await visible(tx,a,r,i.party_id||null);const f=await file(tx,r,i.asset_id);
  if(f.current_status!=='READY')throw error('CUSTOMIZATION_ATTACHMENT_NOT_READY',409);
  if(!i.party_id&&!await submittedReference(tx,r,f.id))throw error('CUSTOMIZATION_ATTACHMENT_NOT_FOUND',404);
  return f;
 });},
 async attachments(ctx,i){P.page({after:i.after||'',limit:i.limit??20});return db.withTransaction(async tx=>{
  const a=await actor(tx,ctx),r=await load(tx,id(i.request_id));await visible(tx,a,r,i.party_id||null);
  const limit=i.limit??20,rows=(await tx.execute('SELECT * FROM customization_attachments WHERE request_id=? AND id>? ORDER BY id LIMIT ?',[r.id,i.after||'',limit+1]))[0],items=[];
  for(const f of rows.slice(0,limit))if(i.party_id||await submittedReference(tx,r,f.id))items.push(metadata(f));
  return {items,next_cursor:rows.length>limit?rows[limit-1].id:null};
 });},
 async revokeAttachment(ctx,i){shape(i,['request_id','party_id','asset_id','expected_version','operation_key']);return db.withTransaction(async tx=>{
  const {a,r}=await own(tx,ctx,i.request_id,i.party_id),f=await file(tx,r,i.asset_id);
  return command(tx,a,'ATTACHMENT_REVOKE',f.id,i,async()=>{
   match(f,i.expected_version);
   if(await submittedReference(tx,r,f.id))throw error('CUSTOMIZATION_ATTACHMENT_RETENTION_REQUIRED',409);
   await tx.execute("UPDATE customization_attachments SET current_status='REVOKED',object_version=object_version+1 WHERE id=?",[f.id]);
   await audit(tx,a,{request_id:r.id,event_code:'ATTACHMENT_REVOKED',object_version:r.object_version,content_sha256:f.content_sha256});return metadata(await file(tx,r,f.id));
  });
 });}
 };}
function service(repo,storage){
 const check=(f,body)=>{if(!Buffer.isBuffer(body)||body.length!==f.byte_size||createHash('sha256').update(body).digest('hex')!==f.content_sha256)throw error('PRIVATE_CONTENT_MISMATCH',503);};
 return {
 async upload(ctx,i){
  const {asset:f,replay}=await repo.reserveAttachment(ctx,i);
  if(replay&&f.current_status==='READY')return metadata(f);
  if(replay){let body;try{body=await storage.getBuffer(f.object_key);}catch{throw error('ASSET_UPLOAD_RECONCILIATION_REQUIRED',409);}if(body==null)throw error('ASSET_UPLOAD_RECONCILIATION_REQUIRED',409);check(f,body);}
  else await storage.put({key:f.object_key,body:i.body,contentType:i.media_type,isPrivate:true});
  return repo.finishAttachment(ctx,{request_id:i.request_id,party_id:i.party_id,asset_id:f.id});
 },
 async download(ctx,i){const f=await repo.attachment(ctx,i),body=await storage.getBuffer(f.object_key);check(f,body);await repo.attachment(ctx,i);return {body,metadata:metadata(f)};}
 };}
module.exports={methods,validate,metadata,service};
