'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const F=require('../src/operations/data-format'),I=require('../src/operations/private-object-inventory');
const {digest}=require('../src/modules/governance/content');
const body=Buffer.from('synthetic private bytes'),sha=F.hash(body),key='private/synthetic/original.bin';
function table(name,columns,values){const rows=values.map(v=>columns.map(c=>F.encode(v[c])));return {name,columns,rows,row_count:rows.length,data_sha256:F.tableHash(rows),generated_columns:[],json_columns:[],auto_increment:null,ddl_sha256:'a'.repeat(64)};}
function payload({assets=[{id:'asset',object_key:key,content_sha256:sha,byte_size:body.length,current_status:'READY'}],attachments=[],tombstones=[],registers=[]}={}){
 const cols=['id','object_key','content_sha256','byte_size','current_status'];
 return {format:'JX_MYSQL_BACKUP_V1',created_at:'2026-11-13T00:00:00Z',migrations:[],tables:[table('supply_assets',cols,assets),table('customization_attachments',cols,attachments),table('privacy_tombstones',['asset_id','object_key','content_sha256'],tombstones),table('privacy_recovery_register',['data_json','data_sha256'],registers)]};
}
const build=(p,options={})=>I.build(p,{expected_sha256:F.hash(p),...options});
test('snapshot-bound inventory covers both native object tables and deduplicates consistent references',()=>{
 const p=payload({attachments:[{id:'attachment',object_key:key,content_sha256:sha,byte_size:body.length,current_status:'READY'}]}),i=build(p);
 assert.equal(i.entries.length,1);assert.equal(i.entries[0].references.length,2);assert.equal(i.entries[0].local_file,F.hash(key)+'.bin');assert.equal(i.recovery_authorized,false);
 assert.ok(!JSON.stringify(I.summary(i)).includes(key));assert.equal(i.latest_register_supplied,false);
});
test('changed snapshot, missing coverage and conflicting references cannot produce a misleading list',()=>{
 const p=payload();assert.throws(()=>I.build(p,{expected_sha256:'0'.repeat(64)}),{code:'BACKUP_CHECKSUM_MISMATCH'});
 const missing=payload();missing.tables.pop();assert.throws(()=>build(missing),{code:'PRIVATE_INVENTORY_SCHEMA_UNSUPPORTED'});
 const unknown=payload();unknown.tables.push(table('future_private_objects',['object_key'],[]));assert.throws(()=>build(unknown),{code:'PRIVATE_INVENTORY_SCHEMA_UNSUPPORTED'});
 const conflict=payload({attachments:[{id:'attachment',object_key:key,content_sha256:'b'.repeat(64),byte_size:body.length,current_status:'READY'}]});assert.throws(()=>build(conflict),{code:'PRIVATE_OBJECT_REFERENCE_CONFLICT'});
});
test('erasure, revocation, unfinished uploads and tombstones are never restoration candidates',()=>{
 for(const status of ['UPLOADING','FAILED','ERASURE_PENDING','ERASED','REVOKED']){
  const p=payload({assets:[{id:'asset',object_key:key,content_sha256:sha,byte_size:body.length,current_status:status}]});assert.equal(build(p).entries[0].disposition,'DO_NOT_RESTORE');
 }
 const p=payload({tombstones:[{asset_id:'asset',object_key:key,content_sha256:sha}]});assert.equal(build(p).entries[0].disposition,'DO_NOT_RESTORE');
});
test('newer suppression and suppressed keys absent from the backup remain in the review list',()=>{
 const data={format:'JX_PRIVACY_SUPPRESSION_V1',files:[{asset_id:'asset',object_key:key,content_sha256:sha},{asset_id:'later',object_key:'private/synthetic/later.bin',content_sha256:sha}],accounts:[]};
 const i=build(payload(),{privacy_register:data,register_sha256:digest(data)});assert.equal(i.entries.length,2);assert.equal(I.summary(i).do_not_restore,2);
 assert.throws(()=>build(payload(),{privacy_register:data,register_sha256:'0'.repeat(64)}),{code:'PRIVACY_RECOVERY_REGISTER_INVALID'});
 const mismatch={...data,files:[{...data.files[0],object_key:'private/synthetic/wrong.bin'}]};assert.throws(()=>build(payload(),{privacy_register:mismatch,register_sha256:digest(mismatch)}),{code:'PRIVACY_RECOVERY_OBJECT_MISMATCH'});
 const p=payload({registers:[{data_json:JSON.stringify(data),data_sha256:digest(data)}]});assert.equal(I.summary(build(p)).do_not_restore,2);
});
test('unsafe object keys and unknown register hashes are rejected',()=>{
 const p=payload({assets:[{id:'asset',object_key:'private/a/../../secret',content_sha256:sha,byte_size:1,current_status:'READY'}]});assert.throws(()=>build(p),{code:'INVALID_PRIVATE_OBJECT_KEY'});
 assert.throws(()=>build(payload(),{register_sha256:'a'.repeat(64)}),{code:'PRIVACY_RECOVERY_REGISTER_INVALID'});
});
test('local bytes distinguish matched, missing, wrong size, wrong digest and non-regular files',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'jx-object-inventory-')),i=build(payload()),file=path.join(dir,i.entries[0].local_file);
 try{
  assert.equal((await I.verifyLocal(i,dir)).counts.MISSING,1);
  await fs.writeFile(file,body);let r=await I.verifyLocal(i,dir);assert.equal(r.counts.MATCHED,1);assert.equal(r.all_reference_bytes_match,true);assert.equal(r.recovery_authorized,false);assert.equal(r.current_acl_checked,false);
  assert.ok(!JSON.stringify(r).includes(key));assert.ok(!JSON.stringify(r).includes('asset'));
  await fs.writeFile(file,Buffer.alloc(body.length));assert.equal((await I.verifyLocal(i,dir)).counts.DIGEST_MISMATCH,1);
  await fs.writeFile(file,'x');assert.equal((await I.verifyLocal(i,dir)).counts.SIZE_MISMATCH,1);
  await fs.unlink(file);await fs.mkdir(file);assert.equal((await I.verifyLocal(i,dir)).counts.UNSAFE_FILE,1);await fs.rmdir(file);
  const large=payload({assets:[{id:'asset',object_key:key,content_sha256:sha,byte_size:I.MAX_LOCAL_BYTES+1,current_status:'READY'}]});await fs.writeFile(file,'x');assert.equal((await I.verifyLocal(build(large),dir)).counts.LOCAL_CHECK_LIMIT,1);
 }finally{if(path.dirname(dir)===path.resolve(os.tmpdir())&&path.basename(dir).startsWith('jx-object-inventory-'))await fs.rm(dir,{recursive:true,force:true});}
});
test('suppressed local objects are reported without reading, deleting or permitting recovery',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'jx-object-inventory-')),p=payload({tombstones:[{asset_id:'asset',object_key:key,content_sha256:sha}]}),i=build(p),file=path.join(dir,i.entries[0].local_file);
 try{
  assert.equal((await I.verifyLocal(i,dir)).counts.SUPPRESSED_ABSENT,1);
  await fs.mkdir(file);const r=await I.verifyLocal(i,dir);assert.equal(r.counts.SUPPRESSED_PRESENT,1);assert.equal(r.all_reference_bytes_match,false);assert.equal(r.physical_objects_deleted,false);assert.ok((await fs.stat(file)).isDirectory());await fs.rmdir(file);
 }finally{if(path.dirname(dir)===path.resolve(os.tmpdir())&&path.basename(dir).startsWith('jx-object-inventory-'))await fs.rm(dir,{recursive:true,force:true});}
});
