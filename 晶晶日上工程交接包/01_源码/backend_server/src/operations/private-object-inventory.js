'use strict';
// Offline evidence only. No provider, upload, deletion, database write or release operation.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const B=require('./backup'),F=require('./data-format'),{objectKey}=require('../modules/providers/private-storage');
const {digest}=require('../modules/governance/content');
const SOURCES=['supply_assets','customization_attachments'];
const MAX_LOCAL_BYTES=50*1024*1024;
function rows(payload,name,columns){
 const t=payload.tables.find(t=>t.name===name);
 if(!t||columns.some(c=>!t.columns.includes(c)))throw F.fail('PRIVATE_INVENTORY_SCHEMA_UNSUPPORTED');
 return t.rows.map(row=>Object.fromEntries(t.columns.map((c,i)=>[c,F.decode(row[i])])));
}
function register(data,expected){
 if(!data||data.format!=='JX_PRIVACY_SUPPRESSION_V1'||digest(data)!==expected||!Array.isArray(data.files)||data.files.length>100000||!Array.isArray(data.accounts))throw F.fail('PRIVACY_RECOVERY_REGISTER_INVALID');
 for(const f of data.files)if(typeof f.asset_id!=='string'||!f.asset_id||!/^[a-f0-9]{64}$/.test(f.content_sha256||''))throw F.fail('PRIVACY_RECOVERY_REGISTER_INVALID');
 return data.files;
}
function build(payload,{expected_sha256,privacy_register,register_sha256}={}){
 B.verify(payload);if(F.hash(payload)!==expected_sha256)throw F.fail('BACKUP_CHECKSUM_MISMATCH');
 for(const t of payload.tables)if(t.columns.includes('object_key')&&![...SOURCES,'privacy_tombstones'].includes(t.name))throw F.fail('PRIVATE_INVENTORY_SCHEMA_UNSUPPORTED');
 const objects=new Map(),assets=new Map();
 function add(key,sha,size,reference,blocked){
  objectKey(key);if(!/^[a-f0-9]{64}$/.test(sha||'')||size!==null&&(!Number.isSafeInteger(size)||size<0))throw F.fail('PRIVATE_OBJECT_METADATA_INVALID');
  let o=objects.get(key);
  if(o&&(o.content_sha256!==sha||o.byte_size!==null&&size!==null&&o.byte_size!==size))throw F.fail('PRIVATE_OBJECT_REFERENCE_CONFLICT');
  if(!o){o={object_key:key,local_file:F.hash(key)+'.bin',content_sha256:sha,byte_size:size,references:[],disposition:'REFERENCE_ONLY'};objects.set(key,o);}
  if(o.byte_size===null&&size!==null)o.byte_size=size;
  o.references.push(reference);if(blocked)o.disposition='DO_NOT_RESTORE';
 }
 for(const table of SOURCES)for(const r of rows(payload,table,['id','object_key','content_sha256','byte_size','current_status'])){
  if(typeof r.id!=='string'||!r.id)throw F.fail('PRIVATE_OBJECT_METADATA_INVALID');
  add(r.object_key,r.content_sha256,Number(r.byte_size),{table,id:r.id,status:r.current_status},r.current_status!=='READY');
  if(table==='supply_assets')assets.set(r.id,r);
 }
 const suppressed=rows(payload,'privacy_tombstones',['asset_id','object_key','content_sha256']);
 for(const r of rows(payload,'privacy_recovery_register',['data_json','data_sha256']))suppressed.push(...register(JSON.parse(r.data_json),r.data_sha256));
 if(privacy_register!==undefined)suppressed.push(...register(privacy_register,register_sha256));
 else if(register_sha256!==undefined)throw F.fail('PRIVACY_RECOVERY_REGISTER_INVALID');
 for(const r of suppressed){
  const original=assets.get(r.asset_id);
  if(original&&(original.object_key!==r.object_key||original.content_sha256!==r.content_sha256))throw F.fail('PRIVACY_RECOVERY_OBJECT_MISMATCH');
  add(r.object_key,r.content_sha256,null,{table:'privacy_suppression',id:r.asset_id,status:'SUPPRESSED'},true);
 }
 const entries=[...objects.values()].sort((a,b)=>a.object_key<b.object_key?-1:a.object_key>b.object_key?1:0);
 return {format:'JX_PRIVATE_OBJECT_INVENTORY_V1',backup_payload_sha256:expected_sha256,backup_created_at:payload.created_at,latest_register_supplied:privacy_register!==undefined,register_sha256:privacy_register===undefined?null:register_sha256,source_tables:SOURCES,entries,contains_private_references:true,external_bytes_included:false,object_versions_included:false,current_authorization_checked:false,recovery_authorized:false};
}
function summary(inventory){return {format:inventory.format,inventory_sha256:F.hash(inventory),backup_payload_sha256:inventory.backup_payload_sha256,objects:inventory.entries.length,reference_only:inventory.entries.filter(x=>x.disposition==='REFERENCE_ONLY').length,do_not_restore:inventory.entries.filter(x=>x.disposition==='DO_NOT_RESTORE').length,latest_register_supplied:inventory.latest_register_supplied,contains_private_references:true,external_bytes_included:false,current_authorization_checked:false,recovery_authorized:false};}
async function verifyLocal(inventory,directory){
 // Accept only inventories produced by build within this call chain, never caller-edited JSON.
 const stat=await fs.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw F.fail('PRIVATE_OBJECT_DIRECTORY_INVALID');
 const root=await fs.realpath(directory),results=[];
 for(const entry of inventory.entries){
  const file=path.join(root,entry.local_file);let state,handle;
  try{
   const before=await fs.lstat(file);
   if(entry.disposition==='DO_NOT_RESTORE')state='SUPPRESSED_PRESENT';
   else if(!before.isFile()||before.isSymbolicLink())state='UNSAFE_FILE';
   else if(entry.byte_size>MAX_LOCAL_BYTES||before.size>MAX_LOCAL_BYTES)state='LOCAL_CHECK_LIMIT';
   else{
    handle=await fs.open(file,'r');const opened=await handle.stat();
    if(opened.dev!==before.dev||opened.ino!==before.ino||await fs.realpath(file)!==file)state='UNSAFE_FILE';
    else if(opened.size!==entry.byte_size)state='SIZE_MISMATCH';
    else{
     const hash=crypto.createHash('sha256'),chunk=Buffer.alloc(64*1024);let size=0;
     for(;;){const {bytesRead}=await handle.read(chunk,0,chunk.length,null);if(!bytesRead)break;size+=bytesRead;if(size>MAX_LOCAL_BYTES){state='LOCAL_CHECK_LIMIT';break;}hash.update(chunk.subarray(0,bytesRead));}
     const after=await handle.stat();
     if(!state)state=size!==entry.byte_size||after.size!==opened.size||after.mtimeMs!==opened.mtimeMs?'FILE_CHANGED':hash.digest('hex')===entry.content_sha256?'MATCHED':'DIGEST_MISMATCH';
    }
   }
  }catch(e){state=e.code==='ENOENT'?(entry.disposition==='DO_NOT_RESTORE'?'SUPPRESSED_ABSENT':'MISSING'):'UNREADABLE';}
  finally{if(handle)await handle.close();}
  // Opaque token only: the private inventory maps this back to the operator's source key.
  results.push({object_token:entry.local_file.slice(0,-4),state});
 }
 const counts={};for(const r of results)counts[r.state]=(counts[r.state]||0)+1;
 return {...summary(inventory),result:'LOCAL_OBSERVATION_COMPLETE',counts,results,all_reference_bytes_match:inventory.entries.some(e=>e.disposition==='REFERENCE_ONLY')&&results.every(r=>['MATCHED','SUPPRESSED_ABSENT'].includes(r.state)),current_acl_checked:false,provider_versions_checked:false,provider_transport_checked:false,physical_objects_restored:false,physical_objects_deleted:false};
}
module.exports={build,summary,verifyLocal,MAX_LOCAL_BYTES};
