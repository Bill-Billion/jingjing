"use strict";
const {digest}=require('../governance/content'),{error}=require('../party/policy');
const categories=['PROFILE','ARTIST_MATERIALS','PRIVATE_STORY','TRANSACTIONS','CONTENT','CONTRACTS','DIGITAL_MODELS'];
const coverage={PROFILE:'ACCOUNT_PROFILE_ONLY',ARTIST_MATERIALS:'OWN_MATERIAL_METADATA_ONLY',PRIVATE_STORY:'OWN_CURRENT_STORY_TEXT_ONLY',TRANSACTIONS:'OWN_BUYER_ORDER_INDEX_ONLY',CONTENT:'OWN_CONTENT_METADATA_ONLY',CONTRACTS:'OWN_AUTHORIZATION_RECORDS_ONLY',DIGITAL_MODELS:'OWN_PRODUCTION_MODEL_RECORDS_ONLY'};
const remaining={PROFILE:'实名认证原件、登录记录等须按申请另行整理。',ARTIST_MATERIALS:'可复制本人持有且可访问的原始素材；授权证据、其他人上传和历史衍生材料须另行核对。',PRIVATE_STORY:'当前文字可复制；历史正式版本、补件记录与未提交补件草稿可从故事副本入口逐页读取，本人可访问附件可复制；机构故事与交易钱账、其他合同不在此范围。',TRANSACTIONS:'本人买方订单索引；完整钱账、退款、供给方收入及合同须另行整理。',CONTENT:'本人持有的作品原件；他人交付作品继续按原订单许可访问。',CONTRACTS:'本人新旧形象授权记录；采购、参演、机构和交易合同须在原业务或经审核答复中提供。',DIGITAL_MODELS:'本人授权关联的制作模型记录；不包含供应商密钥、训练原件或可携带模型文件，具体可携带范围须另行核对。'};
function scope(request,category){if(!categories.includes(category)||!request.scopes.some(s=>s==='ALL'||s===category))throw error('PRIVACY_ACTION_SCOPE_MISMATCH',409);}
function copyOptions(request){return {categories:categories.filter(c=>request.scopes.includes('ALL')||request.scopes.includes(c)).map(category=>({category,coverage:coverage[category],remaining:remaining[category],file_copy_supported:['ARTIST_MATERIALS','CONTENT','PRIVATE_STORY'].includes(category)})),request_completion:'NOT_CONFIRMED'};}
const consentFields=['features','purposes','grantee_party_id','subject_party_id','territories','valid_from','valid_until','terms','stock_commercial_uses'];
const consentData=value=>Object.fromEntries(consentFields.filter(k=>Object.hasOwn(value,k)).map(k=>[k,value[k]]));
async function authorizationRecords(tx,account,after,limit){
 const [ids]=await tx.execute(`SELECT r.id FROM artist_records r JOIN artist_people a ON a.id=r.person_id JOIN parties p ON p.id=a.owner_party_id WHERE r.kind='CONSENT' AND p.kind='PERSON' AND p.personal_account_id=? AND r.id>?
 UNION SELECT r.id FROM supply_records r JOIN parties p ON p.id=JSON_UNQUOTE(JSON_EXTRACT(r.data_json,'$.consent.subject_party_id')) WHERE r.kind='CONSENT' AND p.kind='PERSON' AND p.personal_account_id=? AND r.id>? ORDER BY id LIMIT ?`,[account,after,account,after,limit]);
 const items=[];
 for(const {id} of ids){
  const records=[];
  const [modern]=await tx.execute("SELECT r.* FROM artist_records r JOIN artist_people a ON a.id=r.person_id JOIN parties p ON p.id=a.owner_party_id WHERE r.id=? AND r.kind='CONSENT' AND p.kind='PERSON' AND p.personal_account_id=?",[id,account]);
  for(const r of modern)records.push({source:'ARTIST',person_id:r.person_id,avatar_id:r.avatar_id,current_status:r.current_status,object_version:r.object_version,consent:consentData(checked(r.data_json,r.data_sha256))});
  const [legacy]=await tx.execute("SELECT r.* FROM supply_records r JOIN parties p ON p.id=JSON_UNQUOTE(JSON_EXTRACT(r.data_json,'$.consent.subject_party_id')) WHERE r.id=? AND r.kind='CONSENT' AND p.kind='PERSON' AND p.personal_account_id=?",[id,account]);
  for(const r of legacy){const d=checked(r.data_json,r.data_sha256);records.push({source:'SUPPLY',person_id:null,avatar_id:d.consent.avatar_id,current_status:r.current_status,object_version:r.object_version,consent:consentData(d.consent)});}
  items.push({id,records});
 }
 return items;
}
async function copyFile(tx,account,request,{category,asset_id}){
 if(category==='PRIVATE_STORY'){scope(request,category);return require('./story-copy').file(tx,account,asset_id);}
 scope(request,category);if(!['ARTIST_MATERIALS','CONTENT'].includes(category))throw error('PRIVACY_ACTION_SCOPE_MISMATCH',409);
 const [[asset]]=await tx.execute("SELECT s.* FROM supply_assets s JOIN parties p ON p.id=s.owner_party_id WHERE s.id=? AND p.kind='PERSON' AND p.personal_account_id=? AND s.purpose=? FOR SHARE",[asset_id,account,category==='CONTENT'?'WORK_CONTENT':'AVATAR_MATERIAL']);
 if(!asset)throw error('PRIVACY_TARGET_NOT_FOUND',404);if(asset.current_status!=='READY')throw error('PRIVATE_MATERIAL_NOT_READY',409);return asset;
}
function checked(v,h){const d=typeof v==='string'?JSON.parse(v):v;if(digest(d)!==h)throw error('STORED_CONTENT_MISMATCH',503);return d;}
async function exportPersonalCopy(tx,a,request,i){
 scope(request,i.category);
 if(i.category==='PROFILE')return {category:i.category,items:[{account_id:a.id,display_name:a.display_name,object_version:a.object_version}],next_cursor:null,coverage:'ACCOUNT_PROFILE_ONLY'};
 let rows,coverage;const args=[a.id,i.after||'',i.limit+1];
 if(i.category==='ARTIST_MATERIALS'||i.category==='CONTENT'){
  [rows]=await tx.execute("SELECT s.id,s.purpose,s.media_type,s.byte_size,s.content_sha256,s.current_status FROM supply_assets s JOIN parties p ON p.id=s.owner_party_id WHERE p.personal_account_id=? AND p.kind='PERSON' AND s.id>? AND s.purpose=? ORDER BY s.id LIMIT ?",[args[0],args[1],i.category==='CONTENT'?'WORK_CONTENT':'AVATAR_MATERIAL',args[2]]);
  coverage=i.category==='CONTENT'?'OWN_CONTENT_METADATA_ONLY':'OWN_MATERIAL_METADATA_ONLY';
 }else if(i.category==='PRIVATE_STORY'){
  [rows]=await tx.execute("SELECT r.* FROM customization_requests r JOIN parties p ON p.id=r.party_id WHERE p.kind='PERSON' AND p.personal_account_id=? AND r.created_by=p.personal_account_id AND r.id>? ORDER BY r.id LIMIT ?",args);
  rows=rows.map(r=>({id:r.id,current_status:r.current_status,object_version:r.object_version,category_title:r.category_title,answers:checked(r.answers_json,r.answers_sha256)}));coverage='OWN_CURRENT_STORY_TEXT_ONLY';
 }else if(i.category==='CONTRACTS'){
  rows=await authorizationRecords(tx,a.id,args[1],args[2]);coverage='OWN_AUTHORIZATION_RECORDS_ONLY';
 }else if(i.category==='DIGITAL_MODELS'){
  [rows]=await tx.execute(`SELECT m.*,c.data_json AS consent_json,c.data_sha256 AS consent_sha256 FROM production_records m JOIN supply_records c ON c.id=JSON_UNQUOTE(JSON_EXTRACT(m.data_json,'$.consent_id')) AND c.kind='CONSENT' JOIN parties p ON p.id=JSON_UNQUOTE(JSON_EXTRACT(c.data_json,'$.consent.subject_party_id')) WHERE m.kind='DIGITAL_ASSET' AND p.kind='PERSON' AND p.personal_account_id=? AND m.id>? ORDER BY m.id LIMIT ?`,args);
  rows=rows.map(r=>{const d=checked(r.data_json,r.data_sha256);checked(r.consent_json,r.consent_sha256);return {id:r.id,current_status:r.current_status,object_version:r.object_version,avatar_id:d.avatar_id,consent_id:d.consent_id,asset_type:d.asset_type||null};});coverage='OWN_PRODUCTION_MODEL_RECORDS_ONLY';
 }else{
  [rows]=await tx.execute("SELECT r.id,r.kind,r.current_status,r.object_version,r.data_json,r.data_sha256 FROM trade_records r JOIN parties p ON p.id=r.buyer_party_id WHERE p.kind='PERSON' AND p.personal_account_id=? AND r.id>? AND r.kind='ORDER' ORDER BY r.id LIMIT ?",args);
  // Never return raw quote, counterparties, provider credentials, or contract bodies.
  rows=rows.map(r=>{checked(r.data_json,r.data_sha256);return {id:r.id,kind:r.kind,current_status:r.current_status,object_version:r.object_version};});coverage='OWN_BUYER_ORDER_INDEX_ONLY';
 }
 return {category:i.category,items:rows.slice(0,i.limit),next_cursor:rows.length>i.limit?rows[i.limit-1].id:null,coverage};
}
async function storyCopy(tx,account,request,input){scope(request,'PRIVATE_STORY');return require('./story-copy').page(tx,account,input);}
module.exports={exportPersonalCopy,copyOptions,copyFile,storyCopy};
