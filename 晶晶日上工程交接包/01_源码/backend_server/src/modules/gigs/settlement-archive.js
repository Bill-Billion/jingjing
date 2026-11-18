'use strict';
const A=require('../artists/context'),S=require('../settlement/source'),{digest}=require('../governance/content'),{error}=require('../party/policy');
async function read(tx,orderId){const row=await A.one(tx,'SELECT * FROM gig_settlement_archives WHERE order_id=? FOR SHARE',[orderId]);if(!row)return null;const data=A.parse(row.data_json);if(digest(data)!==row.data_sha256||data.order_id!==orderId||data.settlement_id!==row.settlement_id)throw error('STORED_CONTENT_MISMATCH',503);return data;}
async function afterConfirmation(tx,a,g,r){
 if(g.data.source_type!=='ORDER'||r.kind!=='SETTLEMENT'||g.data.rules.release_condition!=='DELIVERY_ACCEPTED')return;
 // Archival adds no new confirmation requirements to unrelated order types.
 if(!(await S.source(tx,'ORDER',g.data.source_id)).record.data.quote.commercial)return;
 try{await S.confirmed(tx,r,g.data.parties);await S.liveAgreement(tx,g);await S.freeze(tx,g);}catch(e){if(['FINANCE_CONFIRMATIONS_REQUIRED','FINANCE_AGREEMENT_NOT_APPROVED','FINANCE_DISPUTED','FINANCE_EVIDENCE_NOT_READY','PRIVATE_MATERIAL_NOT_READY'].includes(e.code))return;throw e;}
 const f=await S.facts(tx,g),o=f.info.record;
 if(!o.data.quote.commercial||o.current_status!=='PAID'||f.hash!==r.data.facts_sha256||f.receivable_minor!==0||f.received_minor<=0||g.data.rules.settlement_at>await A.now(tx))return;
 const production=o.data.quote.lines.filter(l=>l.line_kind==='PRODUCTION');
 // Other service contracts have no final production-acceptance fact here;
 // retain their existing independent manual archival instead of guessing.
 if(!production.length)return;
 for(const line of production)if(!await A.one(tx,"SELECT p.id FROM production_records p JOIN production_order_lines l ON l.project_id=p.id WHERE p.kind='PROJECT' AND l.order_id=? AND l.line_id=? AND p.current_status='ACCEPTED' FOR SHARE",[o.id,line.line_id]))return;
 if(await A.one(tx,"SELECT id FROM trade_records WHERE order_id=? AND kind='REFUND' AND current_status NOT IN ('FAILED','REJECTED','SUCCEEDED') FOR SHARE",[o.id]))return;
 if(await read(tx,o.id))return;
 const data={order_id:o.id,agreement_id:g.id,settlement_id:r.id,settlement_sha256:r.content_sha256,facts_sha256:f.hash,confirmed_by:a.id,archived_at:await A.now(tx),reason:'ACCEPTED_PRODUCTION_FULL_CONFIRMED_SETTLEMENT'};
 await tx.execute('INSERT INTO gig_settlement_archives(order_id,settlement_id,data_json,data_sha256) VALUES (?,?,?,?)',[o.id,r.id,JSON.stringify(data),digest(data)]);
}
module.exports={afterConfirmation,read};
