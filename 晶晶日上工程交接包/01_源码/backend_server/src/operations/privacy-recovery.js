"use strict";
// Trusted offline maintenance only: no public endpoint and no automatic release.
const {digest}=require('../modules/governance/content'),{error,id,ref}=require('../modules/party/policy');
function checked(row){const v=typeof row.data_json==='string'?JSON.parse(row.data_json):row.data_json;if(digest(v)!==row.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);return v;}
const FORMAT='JX_PRIVACY_SUPPRESSION_V1';
async function capture(db,{source_ref}){
 ref(source_ref);return db.withTransaction(async tx=>{
  const [files]=await tx.execute('SELECT asset_id,content_sha256,object_key FROM privacy_tombstones ORDER BY asset_id FOR SHARE');
  const [accounts]=await tx.execute("SELECT id FROM identity_accounts WHERE current_status='CLOSED' ORDER BY id FOR SHARE");
  const [[priorRow]]=await tx.execute("SELECT data_json,data_sha256 FROM privacy_recovery_register WHERE id=1");
  const prior=priorRow?checked(priorRow):{files:[],accounts:[]};
  const data={format:FORMAT,source_ref,captured_at:new Date().toISOString(),files:[...new Map([...prior.files,...files].map(f=>[f.asset_id,f])).values()],accounts:[...new Set([...prior.accounts,...accounts.map(r=>r.id)])]};
  return {data,sha256:digest(data),contains_private_references:true};
 });
}
async function replay(db,data,{expected_sha256,reviewer_ref,latest_register_confirmed}={}){
 ref(reviewer_ref);if(latest_register_confirmed!==true||data?.format!==FORMAT||digest(data)!==expected_sha256||!Array.isArray(data.files)||!Array.isArray(data.accounts)||data.files.length>100000||data.accounts.length>100000)throw error('PRIVACY_RECOVERY_REGISTER_INVALID',409);
 return db.withTransaction(async tx=>{
  const [[state]]=await tx.execute("SELECT schema_value FROM platform_schema_metadata WHERE schema_key='recovery_status' FOR UPDATE");
  if(state?.schema_value!=='QUARANTINED')throw error('RECOVERY_QUARANTINE_REQUIRED',409);
  let files=0,accounts=0;
  for(const f of data.files){id(f.asset_id);if(!/^[a-f0-9]{64}$/.test(f.content_sha256))throw error('PRIVACY_RECOVERY_REGISTER_INVALID',409);
   const [[old]]=await tx.execute('SELECT * FROM supply_assets WHERE id=? FOR UPDATE',[f.asset_id]);if(!old)continue;
   if(old.content_sha256!==f.content_sha256||old.object_key!==f.object_key)throw error('PRIVACY_RECOVERY_OBJECT_MISMATCH',409);
   await tx.execute("UPDATE supply_assets SET current_status='ERASURE_PENDING' WHERE id=?",[f.asset_id]);files++;
  }
  for(const account of data.accounts){id(account);const [r]=await tx.execute("UPDATE identity_accounts SET current_status='CLOSED',object_version=object_version+1 WHERE id=? AND current_status<>'CLOSED'",[account]);accounts+=r.affectedRows;
   await tx.execute('UPDATE auth_sessions SET revoked=TRUE WHERE account_id=?',[account]);
   await tx.execute("UPDATE parties SET current_status='CLOSED',object_version=object_version+1 WHERE kind='PERSON' AND personal_account_id=? AND current_status<>'CLOSED'",[account]);
   await tx.execute("UPDATE party_memberships SET current_status='REVOKED',object_version=object_version+1 WHERE account_id=? AND current_status<>'REVOKED'",[account]);
  }
  // Store full register in the encrypted backup's private metadata. A later
  // re-export must preserve suppressions absent from an older database snapshot.
  const [[previous]]=await tx.execute("SELECT data_json,data_sha256 FROM privacy_recovery_register WHERE id=1");
  const prior=previous?checked(previous):{files:[],accounts:[]};
  const merged={...data,files:[...new Map([...prior.files,...data.files].map(f=>[f.asset_id,f])).values()],accounts:[...new Set([...prior.accounts,...data.accounts])]};
  await tx.execute('INSERT INTO privacy_recovery_register(id,data_json,data_sha256,reviewer_ref) VALUES (1,?,?,?) ON DUPLICATE KEY UPDATE data_json=VALUES(data_json),data_sha256=VALUES(data_sha256),reviewer_ref=VALUES(reviewer_ref)',[JSON.stringify(merged),digest(merged),reviewer_ref]);
  for(const [k,v] of [['privacy_erasure_status','REPLAYED'],['privacy_erasure_review',expected_sha256]])await tx.execute('INSERT INTO platform_schema_metadata(schema_key,schema_value) VALUES (?,?) ON DUPLICATE KEY UPDATE schema_value=VALUES(schema_value)',[k,v]);
  return {files_suppressed:files,accounts_closed:accounts,runtime_status:'QUARANTINED',physical_objects_deleted:false};
 });
}
module.exports={capture,replay};
