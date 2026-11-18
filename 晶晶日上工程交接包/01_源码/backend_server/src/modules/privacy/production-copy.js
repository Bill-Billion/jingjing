'use strict';
const {error}=require('../party/policy'),{digest}=require('../governance/content'),A=require('../artists/context');
const sections={PRODUCTION_DELIVERY_VIEWS:'TRANSACTIONS',PRODUCTION_FEEDBACK:'TRANSACTIONS'};
const ref=(kind,sql)=>"SHA2(CONCAT('privacy-production-v1:"+kind+":',"+sql+"),256)";
function checked(json,hash){const d=A.parse(json);if(digest(d)!==hash)throw error('STORED_CONTENT_MISMATCH',503);return d;}
const receiptPath=kind=>kind==='CURRENT'?'$.receipt':'$.acceptance_receipt';
// Legacy current receipts and retained feedback snapshots can predate the per-account table.
function legacy(kind){const current=kind==='CURRENT',table=current?'production_fulfillments':'production_records',at=receiptPath(kind),column=f=>"JSON_UNQUOTE(JSON_EXTRACT(r.data_json,'"+at+'.'+f+"'))";
 return {sql:`SELECT ${column('delivery_id')} AS delivery_id,${column('version_id')} AS version_id,r.project_id,NULL AS buyer_party_id,${column('view_observed_at')} AS viewed_at,'LEGACY_RECEIPT' AS source_code,r.data_json AS payload_json,r.data_sha256 AS payload_sha256,'${kind}' AS source_kind,${current?'r.project_id':'r.id'} AS record_id,${current?1:2} AS priority FROM ${table} r WHERE ${current?'':"r.kind='FEEDBACK' AND "}${column('buyer_account_id')}=? AND ${column('view_observed_at')} IS NOT NULL AND ${column('view_observed_at')}<>'null'`,at};
}
async function ownSignoff(tx,account,delivery){
 const a=legacy('CURRENT'),b=legacy('FEEDBACK');
 const [rows]=await tx.execute('SELECT * FROM ('+a.sql+' UNION ALL '+b.sql+') own WHERE delivery_id=? ORDER BY priority,record_id',[account,account,delivery]);
 for(const row of rows){const d=checked(row.payload_json,row.payload_sha256),r=row.source_kind==='CURRENT'?d.receipt:d.acceptance_receipt;
  if(r?.delivery_id!==delivery||r.buyer_account_id!==account)throw error('STORED_CONTENT_MISMATCH',503);
  if(r.notified_at)return {acknowledged_at:r.notified_at,acceptance_started_at:r.started_at||null,deadline_at:r.deadline_at||null,receipt_source:row.source_kind};
 }
 return {acknowledged_at:null,acceptance_started_at:null,deadline_at:null,receipt_source:null};
}
async function page(tx,account,{section,after='',limit}){
 if(!Object.hasOwn(sections,section))throw error('INVALID_INPUT',400);if(after&&!/^[a-f0-9]{64}$/.test(after))throw error('INVALID_CURSOR',400);
 let q,args,project;
 if(section==='PRODUCTION_DELIVERY_VIEWS'){
  const current=legacy('CURRENT'),archived=legacy('FEEDBACK');
  const stored="SELECT CONVERT(delivery_id USING utf8mb4) COLLATE utf8mb4_bin AS delivery_id,CONVERT(version_id USING utf8mb4) COLLATE utf8mb4_bin AS version_id,project_id,buyer_party_id,DATE_FORMAT(viewed_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS viewed_at,CONVERT(source_code USING utf8mb4) COLLATE utf8mb4_bin AS source_code,NULL AS payload_json,NULL AS payload_sha256,'OBSERVATION' AS source_kind,delivery_id AS record_id,0 AS priority FROM production_delivery_views WHERE account_id=?";
  // Prefer the immutable per-account fact; fall back only to a retained receipt for this actor.
  const candidates=stored+' UNION ALL '+current.sql+' UNION ALL '+archived.sql;
  q='SELECT * FROM (SELECT ranked.*,'+ref('view','delivery_id')+' AS copy_ref FROM (SELECT candidates.*,ROW_NUMBER() OVER (PARTITION BY delivery_id ORDER BY priority,record_id) AS choice FROM ('+candidates+') candidates) ranked WHERE choice=1) own WHERE 1=1';args=[account,account,account];
  project=async r=>{
   if(r.source_kind!=='OBSERVATION'){const d=checked(r.payload_json,r.payload_sha256),receipt=r.source_kind==='CURRENT'?d.receipt:d.acceptance_receipt;if(receipt?.delivery_id!==r.delivery_id||receipt.version_id!==r.version_id||receipt.buyer_account_id!==account)throw error('STORED_CONTENT_MISMATCH',503);}
   const p=await A.one(tx,"SELECT * FROM production_records WHERE id=? AND kind='PROJECT'",[r.project_id]),v=await A.one(tx,"SELECT * FROM production_records WHERE id=? AND kind='VERSION'",[r.version_id]);
   if(!p||!v||v.project_id!==p.id||v.order_id!==p.order_id)throw error('STORED_CONTENT_MISMATCH',503);const parent=checked(p.data_json,p.data_sha256);if(r.source_kind==='OBSERVATION'&&r.buyer_party_id!==parent.buyer_party_id)throw error('STORED_CONTENT_MISMATCH',503);const version=checked(v.data_json,v.data_sha256);
   return {copy_ref:r.copy_ref,delivery_id:r.delivery_id,project_id:r.project_id,order_id:p.order_id,version_id:r.version_id,stage:version.stage,viewed_at:new Date(r.viewed_at).toISOString(),source_code:r.source_code,...await ownSignoff(tx,account,r.delivery_id)};
  };
 }else{
  q="SELECT r.*,"+ref('feedback','r.id')+" AS copy_ref FROM production_records r WHERE r.kind='FEEDBACK' AND r.created_by=?";args=[account];
  project=async r=>{const d=checked(r.data_json,r.data_sha256);return {copy_ref:r.copy_ref,feedback_id:r.id,project_id:r.project_id,order_id:r.order_id,version_id:d.version_id,stage:d.stage,decision:d.decision,change_kind:d.change_kind||null,acceptance_method:d.acceptance_method||null,created_at:A.instant(r.created_at)};};
 }
 // The outer wrapper allows a single query rule for computed references in both sections.
 q='SELECT * FROM ('+q+') visible WHERE 1=1';
 if(after&&!(await tx.execute(q+' AND copy_ref=?',[...args,after]))[0].length)throw error('INVALID_CURSOR',400);
 const [rows]=await tx.execute(q+' AND copy_ref>? ORDER BY copy_ref LIMIT ?',[...args,after,limit+1]),items=[];
 for(const r of rows.slice(0,limit))items.push(await project(r));
 return {section,items,next_cursor:rows.length>limit?rows[limit-1].copy_ref:null,coverage:'OWN_ACCOUNT_RECORDS_ONLY',request_completion:'NOT_CONFIRMED',history_complete:false,original_documents_included:false};
}
module.exports={sections,page};
