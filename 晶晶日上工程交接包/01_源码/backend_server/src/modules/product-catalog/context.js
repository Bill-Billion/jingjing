'use strict';
const {randomUUID}=require('node:crypto'),A=require('../artists/context'),S=require('../stock/context');
const {id,ref,error}=require('../party/policy'),{digest}=require('../governance/content'),{authorizeOperator}=require('../governance/operator-access');
const roles={AUTHOR:'CUSTOMIZATION_TEMPLATE_PUBLISH',REVIEWER:'SUPPLY_REVIEW_CONTENT'};
async function authorize(tx,a,role){const allowed=role==='READ'?(await authorizeOperator(tx,{account_id:a.id,action:roles.AUTHOR})||await authorizeOperator(tx,{account_id:a.id,action:roles.REVIEWER})):await authorizeOperator(tx,{account_id:a.id,action:roles[role]});if(!allowed)throw error('CATALOG_OPERATOR_FORBIDDEN',403);}
function checked(row){if(!row)throw error('CATALOG_NOT_FOUND',404);const data=A.parse(row.data_json);if(digest(data)!==row.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);return {id:row.id,entity_id:row.entity_id,revision:row.revision,created_by:row.created_by,current_status:row.current_status,object_version:row.object_version,content_sha256:row.data_sha256,data};}
const load=async(tx,key,lock='FOR SHARE')=>checked(await A.one(tx,'SELECT * FROM product_catalog_records WHERE id=? '+lock,[id(key)]));
async function entity(tx,key,lock='FOR SHARE'){const r=await A.one(tx,'SELECT * FROM product_catalog_entities WHERE id=? '+lock,[id(key)]);if(!r)throw error('CATALOG_NOT_FOUND',404);return r;}
async function current(tx,key,kind){const e=await entity(tx,key);if(e.kind!==kind||!e.current_record_id)throw error('CATALOG_SOURCE_NOT_PUBLISHED',409);const r=await load(tx,e.current_record_id);if(r.entity_id!==e.id||r.current_status!=='PUBLISHED'||r.data.kind!==e.kind||r.data.code!==e.code)throw error('CATALOG_SOURCE_NOT_PUBLISHED',409);return r;}
function window(r,now,review=false){const c=r.data.content;if(r.data.kind!=='CATEGORY'&&(c.valid_until<=now||!review&&c.valid_from>now))throw error('CATALOG_NOT_OPEN',409);}
async function reference(tx,s,kind){const r=await current(tx,s.entity_id,kind);if(r.id!==s.record_id||r.content_sha256!==s.content_sha256)throw error('CATALOG_SOURCE_CHANGED',409);return r;}
const snapshot=r=>({entity_id:r.entity_id,record_id:r.id,content_sha256:r.content_sha256});
async function sources(tx,kind,c){
 if(kind==='CATEGORY')return {};
 if(kind==='COLLECTION'){
  const category=await current(tx,c.category_id,'CATEGORY'),listings=[];
  for(const key of c.listing_ids){const r=await S.listed(tx,key);listings.push({listing_id:r.id,offer_sha256:r.data_sha256,seller_party_id:r.seller_party_id});}
  return {category:snapshot(category),listings};
 }
 const collection=await current(tx,c.collection_id,'COLLECTION');await usable(tx,collection,true);return {collection:snapshot(collection),seller_party_ids:collection.data.references.listings.map(x=>x.seller_party_id)};
}
async function usable(tx,r,review=false){
 window(r,await A.now(tx),review);const c=r.data.content,refs=r.data.references;
 if(r.data.kind==='CATEGORY')return {entity_id:r.entity_id,record_id:r.id,revision:r.revision,kind:r.data.kind,code:r.data.code,...c};
 if(r.data.kind==='PLACEMENT'){
  const collection=await reference(tx,refs.collection,'COLLECTION');return {entity_id:r.entity_id,record_id:r.id,revision:r.revision,kind:r.data.kind,code:r.data.code,...c,collection:await usable(tx,collection,review)};
 }
 await reference(tx,refs.category,'CATEGORY');const items=[];
 for(const item of refs.listings){try{const source=await S.listed(tx,item.listing_id);if(source.data_sha256!==item.offer_sha256)throw error('CATALOG_SOURCE_CHANGED',409);items.push(S.publicDTO(source));}catch(e){if(review||![403,404,409].includes(e.status))throw e;}}
 if(!items.length)throw error('CATALOG_NOT_OPEN',409);
 // All prices, licences and checkout hashes come from the existing stock boundary.
 const {listing_ids,...visible}=c;
 return {entity_id:r.entity_id,record_id:r.id,revision:r.revision,kind:r.data.kind,code:r.data.code,...visible,items};
}
async function independent(tx,a,r){await authorize(tx,a,'REVIEWER');if(r.created_by===a.id)throw error('SELF_REVIEW_FORBIDDEN',403);const parties=r.data.references.listings?.map(x=>x.seller_party_id)||r.data.references.seller_party_ids||[];for(const party of new Set(parties))if(await A.one(tx,"SELECT id FROM party_memberships WHERE party_id=? AND account_id=? AND current_status='ACTIVE' FOR SHARE",[party,a.id]))throw error('SELF_REVIEW_FORBIDDEN',403);}
async function audit(tx,a,r,event){await tx.execute('INSERT INTO product_catalog_audit(id,record_id,actor_account_id,event_code,object_version,data_sha256,request_ref) VALUES (?,?,?,?,?,?,?)',[randomUUID(),r.id,a.id,event,r.object_version,r.content_sha256,a.request_id]);}
async function insert(tx,a,e,revision,data){const r={id:randomUUID(),entity_id:e.id,revision,created_by:a.id,current_status:'IN_REVIEW',object_version:1,content_sha256:digest(data),data};await tx.execute('INSERT INTO product_catalog_records(id,entity_id,revision,created_by,current_status,data_json,data_sha256) VALUES (?,?,?,?,?,?,?)',[r.id,e.id,revision,a.id,r.current_status,JSON.stringify(data),r.content_sha256]);await audit(tx,a,r,'SUBMITTED');return r;}
async function save(tx,a,r,status,data,event){const next={...r,current_status:status,object_version:r.object_version+1,data,content_sha256:digest(data)};const [v]=await tx.execute('UPDATE product_catalog_records SET current_status=?,object_version=?,data_json=?,data_sha256=? WHERE id=? AND object_version=?',[status,next.object_version,JSON.stringify(data),next.content_sha256,r.id,r.object_version]);if(v.affectedRows!==1)throw error('VERSION_CONFLICT',412);await audit(tx,a,next,event);return next;}
async function command(tx,a,op,i,fn){const key=digest([a.id,op,ref(i.operation_key)]),hash=digest(i);try{await tx.execute('INSERT INTO product_catalog_commands(id,fingerprint) VALUES (?,?)',[key,hash]);}catch(e){if(e.code!=='ER_DUP_ENTRY')throw e;const old=await A.one(tx,'SELECT * FROM product_catalog_commands WHERE id=?',[key]);if(old.fingerprint!==hash)throw error('IDEMPOTENCY_CONFLICT',409);if(!old.result_json)throw error('IDEMPOTENCY_IN_PROGRESS',409);if(A.sha(old.result_json)!==old.result_sha256)throw error('STORED_CONTENT_MISMATCH',503);return JSON.parse(old.result_json);}const r=await fn(),text=JSON.stringify(r);await tx.execute('UPDATE product_catalog_commands SET result_json=?,result_sha256=? WHERE id=?',[text,A.sha(text),key]);return r;}
module.exports={authorize,checked,load,entity,current,window,sources,usable,independent,insert,save,command};
