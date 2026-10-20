"use strict";
const {digest}=require('../governance/content'),{error}=require('../party/policy');
const categories=['PROFILE','ARTIST_MATERIALS','PRIVATE_STORY','TRANSACTIONS','CONTENT'];
function checked(v,h){const d=typeof v==='string'?JSON.parse(v):v;if(digest(d)!==h)throw error('STORED_CONTENT_MISMATCH',503);return d;}
async function exportPersonalCopy(tx,a,request,i){
 if(!categories.includes(i.category)||!request.scopes.some(s=>s==='ALL'||s===i.category))throw error('PRIVACY_ACTION_SCOPE_MISMATCH',409);
 if(i.category==='PROFILE')return {category:i.category,items:[{account_id:a.id,display_name:a.display_name,object_version:a.object_version}],next_cursor:null,coverage:'ACCOUNT_PROFILE_ONLY'};
 let rows,coverage;const args=[a.id,i.after||'',i.limit+1];
 if(i.category==='ARTIST_MATERIALS'||i.category==='CONTENT'){
  [rows]=await tx.execute("SELECT s.id,s.purpose,s.media_type,s.byte_size,s.content_sha256,s.current_status FROM supply_assets s JOIN parties p ON p.id=s.owner_party_id WHERE p.personal_account_id=? AND p.kind='PERSON' AND s.id>? AND s.purpose=? ORDER BY s.id LIMIT ?",[args[0],args[1],i.category==='CONTENT'?'WORK_CONTENT':'AVATAR_MATERIAL',args[2]]);
  coverage=i.category==='CONTENT'?'OWN_CONTENT_METADATA_ONLY':'OWN_MATERIAL_METADATA_ONLY';
 }else if(i.category==='PRIVATE_STORY'){
  [rows]=await tx.execute("SELECT r.* FROM customization_requests r JOIN parties p ON p.id=r.party_id WHERE p.kind='PERSON' AND p.personal_account_id=? AND r.created_by=p.personal_account_id AND r.id>? ORDER BY r.id LIMIT ?",args);
  rows=rows.map(r=>({id:r.id,current_status:r.current_status,object_version:r.object_version,category_title:r.category_title,answers:checked(r.answers_json,r.answers_sha256)}));coverage='OWN_CURRENT_STORY_TEXT_ONLY';
 }else{
  [rows]=await tx.execute("SELECT r.id,r.kind,r.current_status,r.object_version,r.data_json,r.data_sha256 FROM trade_records r JOIN parties p ON p.id=r.buyer_party_id WHERE p.kind='PERSON' AND p.personal_account_id=? AND r.id>? AND r.kind='ORDER' ORDER BY r.id LIMIT ?",args);
  // Never return raw quote, counterparties, provider credentials, or contract bodies.
  rows=rows.map(r=>{checked(r.data_json,r.data_sha256);return {id:r.id,kind:r.kind,current_status:r.current_status,object_version:r.object_version};});coverage='OWN_BUYER_ORDER_INDEX_ONLY';
 }
 return {category:i.category,items:rows.slice(0,i.limit),next_cursor:rows.length>i.limit?rows[i.limit-1].id:null,coverage};
}
module.exports={exportPersonalCopy};
