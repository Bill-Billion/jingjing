"use strict";
const A=require('../artists/context'),{id,error}=require('../party/policy'),{digest}=require('../governance/content');
const sections={SUPPORT_TICKETS:'PROFILE',SUPPORT_MESSAGES:'PROFILE',INVOICE_REQUESTS:'TRANSACTIONS',INVOICE_HISTORY:'TRANSACTIONS',INVOICE_DOCUMENTS:'TRANSACTIONS',FAVORITES:'PROFILE',BROWSING_HISTORY:'PROFILE',COLLECTION_SETTINGS:'PROFILE'};
const pick=(d,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(d,k)).map(k=>[k,d[k]]));
function checked(value,hash){const d=A.parse(value);if(digest(d)!==hash)throw error('STORED_CONTENT_MISMATCH',503);return d;}
const header=h=>pick(h,['kind','title','tax_id']);
const integerCursor=value=>{if(typeof value!=='string'||!/^[1-9][0-9]{0,19}$/.test(value)||BigInt(value)>18446744073709551615n)throw error('INVALID_CURSOR',400);};
async function records(tx,q,args,column,after,limit,numeric=false){
 if(after){if(numeric)integerCursor(after);else id(after);if(!(await tx.execute(q+' AND '+column+'=?',[...args,after]))[0].length)throw error('INVALID_CURSOR',400);}
 const [rows]=await tx.execute(q+' AND '+column+'>? ORDER BY '+column+' LIMIT ?',[...args,after||(numeric?'0':''),limit+1]);return rows;
}
async function events(tx,q,args,column,after,limit){
 let parent='',version=0;if(after){if(typeof after!=='string')throw error('INVALID_CURSOR',400);const parts=after.split('.');if(parts.length!==2||!/^[1-9][0-9]{0,9}$/.test(parts[1])||Number(parts[1])>4294967295)throw error('INVALID_CURSOR',400);[parent]=parts;id(parent);version=Number(parts[1]);if(!(await tx.execute(q+' AND '+column+'=? AND e.object_version=?',[...args,parent,version]))[0].length)throw error('INVALID_CURSOR',400);}
 return (await tx.execute(q+' AND ('+column+'>? OR ('+column+'=? AND e.object_version>?)) ORDER BY '+column+',e.object_version LIMIT ?',[...args,parent,parent,version,limit+1]))[0];
}
async function page(tx,account,{section,after='',limit},env={}){
 const result=(items,next_cursor=null,extra={})=>({section,items,next_cursor,coverage:'OWN_ACCOUNT_RECORDS_ONLY',request_completion:'NOT_CONFIRMED',...extra});
 if(['FAVORITES','BROWSING_HISTORY','COLLECTION_SETTINGS'].includes(section)){
  const C=require('../collections/repository'),config=require('../collections/policy').settings(env),s=await C.state(tx,account);
  await C.prune(tx,account,config);
  if(section==='COLLECTION_SETTINGS'){if(after)throw error('INVALID_CURSOR',400);return result([{history_enabled:!!s.history_enabled,object_version:s.object_version,...config}],null,{history_complete:false});}
  if(section==='BROWSING_HISTORY'&&!s.history_enabled){if(after)throw error('INVALID_CURSOR',400);return result([],null,{history_complete:false});}
  const q='SELECT e.* FROM personal_collection_entries e WHERE e.account_id=? AND e.collection=?',rows=await records(tx,q,[account,section==='FAVORITES'?'FAVORITE':'HISTORY'],'e.sequence_id',after,limit,true),items=[];
  for(const r of rows.slice(0,limit)){const visible=await require('../collections/source').visible(tx,r.target_kind,r.target_id);items.push({id:String(r.sequence_id),kind:r.target_kind,target_id:r.target_id,recorded_at:A.instant(r.recorded_at),expires_at:A.instant(r.expires_at),availability:visible?'AVAILABLE':'UNAVAILABLE',title:visible?.title??null,city:visible?.city??null});}
  return result(items,rows.length>limit?String(rows[limit-1].sequence_id):null,{history_complete:false});
 }
 const support=section.startsWith('SUPPORT_'),table=support?'support_tickets':'invoice_requests',party=support?'party_id':'buyer_party_id';
 const ownership=` JOIN ${table} t ON t.id=e.${support?'ticket_id':'invoice_id'} JOIN parties p ON p.id=t.${party} WHERE p.kind='PERSON' AND p.personal_account_id=?`;
 const own=support?' AND t.created_by=?':'',args=support?[account,account]:[account];
 if(section==='SUPPORT_MESSAGES'||section==='INVOICE_HISTORY'){
  const field=support?'ticket_id':'invoice_id',q=`SELECT e.* FROM ${support?'support_events':'invoice_events'} e`+ownership+own;
  const rows=await events(tx,q,args,'e.'+field,after,limit),items=rows.slice(0,limit).map(r=>{const d=checked(r.body_json,r.body_sha256);const base={id:r[field]+'.'+r.object_version,[field]:r[field],object_version:r.object_version,actor_kind:r.actor_kind,action:r.action_code,text:d.text,created_at:A.instant(r.created_at)};
   // These are the messages already visible to the applicant, not internal review logs.
   return support?{...base,asset_ids:d.asset_ids}:{...base,header:header(d.header),status:d.status,amount_minor:d.amount_minor,asset_ids:r.actor_kind==='APPLICANT'?d.asset_ids:[]};});
  return result(items,rows.length>limit?rows[limit-1][field]+'.'+rows[limit-1].object_version:null,{original_documents_included:false});
 }
 if(section==='INVOICE_DOCUMENTS'){
  const q="SELECT e.*,t.order_id AS parent_order_id FROM invoice_documents e"+ownership+" AND e.current_status IN ('ISSUED','SUPERSEDED')",rows=await records(tx,q,args,'e.id',after,limit);
  const items=rows.slice(0,limit).map(r=>{const d=checked(r.content_json,r.content_sha256);if(d.invoice_id!==r.invoice_id||d.order_id!==r.parent_order_id)throw error('STORED_CONTENT_MISMATCH',503);const content={...pick(d,['invoice_id','order_id','environment','simulated','label','amount_minor','currency','reference','issued_at','replaces_document_id']),header:header(d.header),issuer:pick(d.issuer,['merchant_party_id','name','tax_id','simulated'])};return {id:r.id,invoice_id:r.invoice_id,current_status:r.current_status,content,copy_sha256:digest(content),attachment_recorded:r.asset_id!==null,created_at:A.instant(r.created_at)};});
  return result(items,rows.length>limit?rows[limit-1].id:null,{original_documents_included:false});
 }
 const q=`SELECT t.* FROM ${table} t JOIN parties p ON p.id=t.${party} WHERE p.kind='PERSON' AND p.personal_account_id=?`+own,rows=await records(tx,q,args,'t.id',after,limit);
 const items=rows.slice(0,limit).map(r=>support?{...pick(r,['id','kind','title','party_id','current_status','object_version']),created_at:A.instant(r.created_at),updated_at:A.instant(r.updated_at)}:{...pick(r,['id','order_id','buyer_party_id','issuer_party_id','environment','currency','current_status','object_version','issued_document_id']),requested_minor:Number(r.requested_minor),occupied_minor:Number(r.occupied_minor),header:header(checked(r.header_json,r.header_sha256)),created_at:A.instant(r.created_at),updated_at:A.instant(r.updated_at)});
 return result(items,rows.length>limit?rows[limit-1].id:null,{original_documents_included:false});
}
module.exports={page,sections};
