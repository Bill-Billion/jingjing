"use strict";
const {randomUUID}=require('node:crypto');
const A=require('../artists/context'),C=require('./context'),P=require('./policy');
const {id,label,shape,error}=require('../party/policy');
const {digest,verifyRuleContent}=require('../governance/content');
const table='stock_sales_publications';
async function sources(tx,seller,specId,ruleId){
 await A.activeParty(tx,seller);
 const spec=C.checked(await A.one(tx,"SELECT * FROM trade_records WHERE id=? AND kind='SPEC' FOR SHARE",[id(specId)]));
 if(spec.current_status!=='PUBLISHED'||spec.merchant_party_id!==seller||spec.data.provider_party_id!==seller||spec.data.product_profile?.type!=='STOCK_VIDEO')throw error('STOCK_SPEC_REQUIRED',409);
 P.specification(spec.data.specification);
 const row=await A.one(tx,"SELECT * FROM governance_rules WHERE id=? AND current_status='EFFECTIVE' AND effective_at<=CURRENT_TIMESTAMP(3) FOR SHARE",[id(ruleId)]);
 if(!row)throw error('RULE_NOT_EFFECTIVE',409);
 const rule=verifyRuleContent(A.parse(row.content_json));
 if(rule.id!==row.id||rule.rule_key!==row.rule_key||rule.version!==row.version_label)throw error('STORED_CONTENT_MISMATCH',503);
 return {spec,rule};
}
async function live(tx,r){
 if(r.current_status!=='PUBLISHED')throw error('STOCK_SALES_RULE_NOT_PUBLISHED',409);
 const {spec,rule}=await sources(tx,r.seller_party_id,r.spec_id,r.rule_id);
 if(digest(rule)!==r.data.rule_sha256||spec.data_sha256!==r.data.spec_sha256)throw error('STOCK_SALES_RULE_CHANGED',409);
 return {spec,rule};
}
async function binding(tx,seller,specId,ruleId,publicationId){
 if(publicationId){const r=C.checked(await A.one(tx,"SELECT * FROM "+table+" WHERE id=? FOR SHARE",[id(publicationId)]));if(r.seller_party_id!==seller||r.spec_id!==specId||r.rule_id!==ruleId)throw error('STOCK_SALES_RULE_CHANGED',409);await live(tx,r);return r;}
 const rows=(await tx.execute("SELECT * FROM "+table+" WHERE seller_party_id=? AND spec_id=? AND rule_id=? AND current_status='PUBLISHED' ORDER BY id FOR SHARE",[seller,specId,ruleId]))[0];
 for(const raw of rows){const r=C.checked(raw);try{await live(tx,r);return r;}catch(e){if(![403,404,409].includes(e.status))throw e;}}
 throw error('STOCK_SALES_RULE_NOT_PUBLISHED',409);
}
function dto(r){return {id:r.id,seller_party_id:r.seller_party_id,spec_id:r.spec_id,rule_id:r.rule_id,current_status:r.current_status,object_version:r.object_version,data:r.data};}
function createPublications(db,actor){
 const run=(ctx,fn)=>db.withTransaction(async tx=>fn(tx,await actor(tx,ctx)));
 return {
 async salesPublicationSources(ctx,i){shape(i,['kind','seller_party_id','after','limit']);const limit=i.limit??20;if(!['SPEC','RULE'].includes(i.kind)||!Number.isInteger(limit)||limit<1||limit>100)throw error('INVALID_LIMIT',400);if(i.after)id(i.after);return run(ctx,async(tx,a)=>{
  await C.reviewer(tx,a,null,'SUPPLY_REVIEW_RIGHTS');let rows;
  if(i.kind==='SPEC'){
   rows=(await tx.execute("SELECT * FROM trade_records WHERE kind='SPEC' AND current_status='PUBLISHED' AND id>? "+(i.seller_party_id?"AND merchant_party_id=? ":'')+"ORDER BY id LIMIT ?",[i.after||'',...(i.seller_party_id?[id(i.seller_party_id)]:[]),limit+1]))[0];
   return {items:rows.slice(0,limit).map(C.checked).filter(r=>r.data.product_profile?.type==='STOCK_VIDEO').map(r=>({id:r.id,seller_party_id:r.merchant_party_id,title:r.data.title,unit_minor:r.data.unit_minor,currency:r.data.currency})),next_cursor:rows.length>limit?rows[limit-1].id:null};
  }
  if(!await require('../governance/operator-access').authorizeOperator(tx,{account_id:a.id,action:'READ_RULE'}))throw error('GOVERNANCE_FORBIDDEN',403);
  rows=(await tx.execute("SELECT * FROM governance_rules WHERE current_status='EFFECTIVE' AND effective_at<=CURRENT_TIMESTAMP(3) AND id>? ORDER BY id LIMIT ?",[i.after||'',limit+1]))[0];
  return {items:rows.slice(0,limit).map(r=>{const c=verifyRuleContent(A.parse(r.content_json));return {id:r.id,title:c.rule_key,version:c.version,terms:c.terms};}),next_cursor:rows.length>limit?rows[limit-1].id:null};
 });},
 async createSalesPublication(ctx,i){shape(i,['seller_party_id','spec_id','rule_id','title','terms','operation_key']);label(i.title,200);label(i.terms,8000);return run(ctx,async(tx,a)=>{
  await C.reviewer(tx,a,null,'SUPPLY_REVIEW_RIGHTS');
  const {spec,rule}=await sources(tx,id(i.seller_party_id),i.spec_id,i.rule_id);
  return C.command(tx,a,'SALES_PUBLICATION_CREATE',i,async()=>{
   const data={title:i.title,terms:i.terms,rule_version:rule.version,rule_sha256:digest(rule),spec_sha256:spec.data_sha256,review:null};
   const r={id:randomUUID(),seller_party_id:i.seller_party_id,spec_id:i.spec_id,rule_id:i.rule_id,created_by:a.id,current_status:'IN_REVIEW',object_version:1,data};
   await tx.execute('INSERT INTO '+table+'(id,seller_party_id,spec_id,rule_id,created_by,current_status,data_json,data_sha256) VALUES (?,?,?,?,?,?,?,?)',[r.id,r.seller_party_id,r.spec_id,r.rule_id,a.id,r.current_status,JSON.stringify(data),digest(data)]);
   await C.audit(tx,a,r,'STOCK_SALES_PUBLICATION_PROPOSED');return dto(r);
  });
 });},
 async reviewSalesPublication(ctx,i){shape(i,['record_id','expected_version','decision','reason','operation_key']);label(i.reason,2000);if(!['APPROVED','REJECTED','WITHDRAWN'].includes(i.decision))throw error('INVALID_REVIEW',400);return run(ctx,async(tx,a)=>{
  const r=C.checked(await A.one(tx,'SELECT * FROM '+table+' WHERE id=? FOR UPDATE',[id(i.record_id)]));
  await C.reviewer(tx,a,r,'SUPPLY_REVIEW_RIGHTS');
  return C.command(tx,a,'SALES_PUBLICATION_REVIEW',i,async()=>{
   A.match(r,i.expected_version);
   if(i.decision==='WITHDRAWN'?r.current_status!=='PUBLISHED':r.current_status!=='IN_REVIEW')throw error('STOCK_REVIEW_NOT_PENDING',409);
   if(i.decision==='APPROVED')await live(tx,{...r,current_status:'PUBLISHED'});
   const data={...r.data,review:{account_id:a.id,decision:i.decision,reason:i.reason,at:await A.now(tx)}};
   const next={...r,data,current_status:i.decision==='APPROVED'?'PUBLISHED':i.decision,object_version:r.object_version+1};
   await tx.execute('UPDATE '+table+' SET current_status=?,object_version=?,data_json=?,data_sha256=? WHERE id=?',[next.current_status,next.object_version,JSON.stringify(data),digest(data),r.id]);
   await C.audit(tx,a,next,'STOCK_SALES_PUBLICATION_'+i.decision);return dto(next);
  });
 });},
 async salesPublications(ctx,i){shape(i,['party_id','after','limit']);const limit=i.limit??20;if(i.after)id(i.after);if(!Number.isInteger(limit)||limit<1||limit>100)throw error('INVALID_LIMIT',400);return run(ctx,async(tx,a)=>{
  if(i.party_id)await A.owner(tx,a,id(i.party_id));else await C.reviewer(tx,a,null,'SUPPLY_REVIEW_RIGHTS');
  const rows=(await tx.execute('SELECT * FROM '+table+' WHERE id>? '+(i.party_id?"AND seller_party_id=? AND current_status='PUBLISHED' ":'')+'ORDER BY id LIMIT ?',[i.after||'',...(i.party_id?[i.party_id]:[]),limit+1]))[0],items=[];
  for(const raw of rows.slice(0,limit)){const r=C.checked(raw);if(!i.party_id){items.push(dto(r));continue;}try{const {spec}=await live(tx,r);items.push({id:r.id,spec_id:r.spec_id,rule_id:r.rule_id,title:r.data.title,terms:r.data.terms,rule_version:r.data.rule_version,spec_title:spec.data.title,unit_minor:spec.data.unit_minor,currency:'CNY'});}catch(e){if(![403,404,409].includes(e.status))throw e;}}
  return {items,next_cursor:rows.length>limit?rows[limit-1].id:null};
 });},
 async participantOptions(ctx,i){shape(i,['party_id','person_id','after','limit']);const limit=i.limit??20;if(i.after)id(i.after);if(!Number.isInteger(limit)||limit<1||limit>100)throw error('INVALID_LIMIT',400);return run(ctx,async(tx,a)=>{
  await A.owner(tx,a,id(i.party_id));const p=await A.person(tx,id(i.person_id));await A.authorize(tx,a,p,i.party_id,'SUBMIT_LISTING');const at=await A.now(tx);require('../artists/policy').adult(p,at);
  const rows=(await tx.execute("SELECT * FROM artist_records WHERE person_id=? AND kind='CONSENT' AND current_status='APPROVED' AND id>? ORDER BY id LIMIT ?",[p.id,i.after||'',limit+1]))[0],items=[];
  for(const raw of rows.slice(0,limit)){const c=A.checked(raw);if(c.data.grantee_party_id!==i.party_id||!['STOCK_LICENSE','PUBLIC_DISPLAY'].every(x=>c.data.purposes.includes(x))||!c.data.territories.includes('WORLDWIDE')||!require('../artists/policy').active(c.data,at))continue;
   try{const avatar=await A.avatar(tx,c.avatar_id,p);items.push({person_id:p.id,person_name:p.display_name,avatar_id:avatar.id,avatar_name:avatar.data.display_name||p.display_name,consent_id:c.id,seller_party_id:i.party_id,valid_from:c.data.valid_from,valid_until:c.data.valid_until});}catch(e){if(![403,404,409].includes(e.status))throw e;}
  }
  return {items,next_cursor:rows.length>limit?rows[limit-1].id:null};
 });}
 };
}
module.exports={createPublications,binding};
