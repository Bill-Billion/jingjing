'use strict';
const A=require('../artists/context'),{error}=require('../party/policy');
// Callers must check current actor/party authority and current approved version.
// A prior viewer remains evidence, not continuing authorization for that account.
async function viewed(tx,p,r,account,version){
 if(!r||r.version_id!==version)return null;
 const row=await A.one(tx,'SELECT viewed_at FROM production_delivery_views WHERE delivery_id=? AND account_id=? AND project_id=? AND version_id=? AND buyer_party_id=? FOR SHARE',[r.delivery_id,account,p.id,version,p.data.buyer_party_id]);
 if(row)return A.instant(row.viewed_at);
 // Existing receipts remain usable without inventing another actor's historical read.
 return r.buyer_account_id===account&&r.view_observed_at?r.view_observed_at:null;
}
async function insert(tx,p,r,account,at,source){
 try{await tx.execute('INSERT INTO production_delivery_views(delivery_id,account_id,project_id,version_id,buyer_party_id,viewed_at,source_code) VALUES (?,?,?,?,?,?,?)',[r.delivery_id,account,p.id,r.version_id,p.data.buyer_party_id,at.slice(0,23).replace('T',' '),source]);}
 catch(e){if(e.code!=='ER_DUP_ENTRY')throw e;const old=await A.one(tx,'SELECT project_id,version_id,buyer_party_id FROM production_delivery_views WHERE delivery_id=? AND account_id=? FOR SHARE',[r.delivery_id,account]);if(!old||old.project_id!==p.id||old.version_id!==r.version_id||old.buyer_party_id!==p.data.buyer_party_id)throw error('STORED_CONTENT_MISMATCH',503);}
}
async function observe(tx,p,r,account,at){
 // Preserve the old first-reader evidence before a different actor signs the receipt.
 if(r.buyer_account_id&&r.view_observed_at)await insert(tx,p,r,r.buyer_account_id,r.view_observed_at,'LEGACY_RECEIPT');
 await insert(tx,p,r,account,at,'HTTP_PRIVATE_BYTES');
}
module.exports={viewed,observe};
