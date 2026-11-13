'use strict';
const {randomUUID}=require('node:crypto'),A=require('../artists/context'),C=require('./context'),P=require('./policy');
const {shape,id,label,error}=require('../party/policy');
function createProductCatalogRepository(db,{resolvePrincipal=async()=>null}={}){
 const actor=A.createActor(resolvePrincipal),run=(ctx,fn)=>db.withTransaction(async tx=>fn(tx,await actor(tx,ctx)));
 async function change(ctx,i,op,role,fn){return run(ctx,async(tx,a)=>{await C.authorize(tx,a,role);const hint=await C.load(tx,i.record_id,''),e=await C.entity(tx,hint.entity_id,'FOR UPDATE'),r=await C.load(tx,i.record_id,'FOR UPDATE');if(role==='REVIEWER')await C.independent(tx,a,r);return C.command(tx,a,op,i,async()=>{A.match(r,i.expected_version);return fn(tx,a,e,r);});});}
 return {
 async create(ctx,i){shape(i,['kind','code','content','operation_key']);const content=P.content(i.kind,i.content);P.code(i.code);return run(ctx,async(tx,a)=>{await C.authorize(tx,a,'AUTHOR');return C.command(tx,a,'CREATE',i,async()=>{
  const e={id:randomUUID(),kind:i.kind,code:i.code};try{await tx.execute('INSERT INTO product_catalog_entities(id,kind,code) VALUES (?,?,?)',[e.id,e.kind,e.code]);}catch(err){if(err.code==='ER_DUP_ENTRY')throw error('CATALOG_CODE_EXISTS',409);throw err;}
  const data={kind:e.kind,code:e.code,content,source_record_id:null,base_record_id:null,references:await C.sources(tx,e.kind,content),review:null};C.window({data},await A.now(tx),true);return C.insert(tx,a,e,1,data);
 });});},
 async revise(ctx,i){shape(i,['record_id','expected_version','content','operation_key']);return change(ctx,i,'REVISE','AUTHOR',async(tx,a,e,r)=>{
  if(e.current_record_id?r.id!==e.current_record_id:r.revision!==e.next_revision-1)throw error('CATALOG_REVISION_STALE',409);
  const content=P.content(e.kind,i.content),data={kind:e.kind,code:e.code,content,source_record_id:r.id,base_record_id:e.current_record_id,references:await C.sources(tx,e.kind,content),review:null};C.window({data},await A.now(tx),true);
  const next=await C.insert(tx,a,e,e.next_revision,data);await tx.execute('UPDATE product_catalog_entities SET next_revision=next_revision+1 WHERE id=?',[e.id]);return next;
 });},
 async review(ctx,i){shape(i,['record_id','expected_version','decision','checks','reason','operation_key']);if(!['APPROVE','REJECT'].includes(i.decision))throw error('INVALID_REVIEW',400);label(i.reason,2000);return change(ctx,i,'REVIEW','REVIEWER',async(tx,a,e,r)=>{
  if(r.current_status!=='IN_REVIEW')throw error('REVIEW_NOT_PENDING',409);
  if(i.decision==='APPROVE'){
   shape(i.checks,['sources_verified','content_reviewed','no_price_override']);if(Object.keys(i.checks).length!==3||Object.values(i.checks).some(x=>x!==true))throw error('MANUAL_REVIEW_REQUIRED',400);
   if((e.current_record_id||null)!==r.data.base_record_id)throw error('CATALOG_BASE_CHANGED',409);await C.usable(tx,r,true);
   if(e.current_record_id){const old=await C.load(tx,e.current_record_id,'FOR UPDATE');await C.save(tx,a,old,'REPLACED',{...old.data,replaced_by:r.id},'REPLACED');}
  }else if(i.checks!==null)throw error('INVALID_REVIEW',400);
  const next=await C.save(tx,a,r,i.decision==='APPROVE'?'PUBLISHED':'REJECTED',{...r.data,review:{account_id:a.id,decision:i.decision,checks:i.checks,reason:i.reason,at:await A.now(tx)}},'REVIEWED');
  if(i.decision==='APPROVE')await tx.execute('UPDATE product_catalog_entities SET current_record_id=? WHERE id=?',[r.id,e.id]);return next;
 });},
 async withdraw(ctx,i){shape(i,['record_id','expected_version','reason','operation_key']);label(i.reason,2000);return change(ctx,i,'WITHDRAW','READ',async(tx,a,e,r)=>{
  if(!['IN_REVIEW','PUBLISHED'].includes(r.current_status))throw error('CATALOG_CANNOT_WITHDRAW',409);
  const next=await C.save(tx,a,r,'WITHDRAWN',{...r.data,withdrawal:{account_id:a.id,reason:i.reason,at:await A.now(tx)}},'WITHDRAWN');
  if(e.current_record_id===r.id)await tx.execute('UPDATE product_catalog_entities SET current_record_id=NULL WHERE id=?',[e.id]);return next;
 });},
 async read(ctx,i){shape(i,['record_id']);return run(ctx,async(tx,a)=>{await C.authorize(tx,a,'READ');return C.load(tx,i.record_id);});},
 async records(ctx,i){shape(i,['kind','cursor','limit']);if(!P.kinds.includes(i.kind))throw error('CATALOG_KIND_INVALID',400);const page=P.page(i,'PRIVATE');return run(ctx,async(tx,a)=>{await C.authorize(tx,a,'READ');const rows=(await tx.execute('SELECT r.* FROM product_catalog_records r JOIN product_catalog_entities e ON e.id=r.entity_id WHERE e.kind=? AND r.id>? ORDER BY r.id LIMIT ?',[i.kind,page.after,page.limit+1]))[0];return {items:rows.slice(0,page.limit).map(C.checked),next_cursor:rows.length>page.limit?P.cursor(rows[page.limit-1].id,page.scope):null};});},
 async catalog(ctx,i){shape(i,['kind','code','category_id','slot_code','cursor','limit']);if(!P.kinds.includes(i.kind))throw error('CATALOG_KIND_INVALID',400);if(i.code!==undefined)P.code(i.code);if(i.category_id!==undefined){id(i.category_id);if(i.kind!=='COLLECTION')throw error('CATALOG_FILTER_INVALID',400);}if(i.slot_code!==undefined){P.code(i.slot_code);if(i.kind!=='PLACEMENT')throw error('CATALOG_FILTER_INVALID',400);}const page=P.page(i,'PUBLIC');return run(ctx,async tx=>{
  const sort="CAST(JSON_UNQUOTE(JSON_EXTRACT(r.data_json,'$.content.sort_order')) AS UNSIGNED)";
  const rows=(await tx.execute("SELECT r.* FROM product_catalog_entities e JOIN product_catalog_records r ON r.id=e.current_record_id WHERE e.kind=? AND r.current_status='PUBLISHED' "+(page.after?'AND ('+sort+'>? OR ('+sort+'=? AND e.id>?)) ':'')+(i.code?'AND e.code=? ':'')+(i.category_id?"AND JSON_UNQUOTE(JSON_EXTRACT(r.data_json,'$.content.category_id'))=? ":'')+(i.slot_code?"AND JSON_UNQUOTE(JSON_EXTRACT(r.data_json,'$.content.slot_code'))=? ":'')+'ORDER BY '+sort+',e.id LIMIT ?',[i.kind,...(page.after?[page.sort,page.sort,page.after]:[]),...(i.code?[i.code]:[]),...(i.category_id?[i.category_id]:[]),...(i.slot_code?[i.slot_code]:[]),page.limit+1]))[0];const items=[];
  for(const raw of rows.slice(0,page.limit)){try{items.push(await C.usable(tx,C.checked(raw)));}catch(e){if(![403,404,409].includes(e.status))throw e;}}
  return {items,next_cursor:rows.length>page.limit?P.cursor(rows[page.limit-1].entity_id,page.scope,C.checked(rows[page.limit-1]).data.content.sort_order):null};
 });},
 async publicRecord(ctx,i){shape(i,['entity_id']);return run(ctx,async tx=>{const e=await C.entity(tx,i.entity_id);return C.usable(tx,await C.current(tx,e.id,e.kind));});}
 };
}
module.exports={createProductCatalogRepository};
