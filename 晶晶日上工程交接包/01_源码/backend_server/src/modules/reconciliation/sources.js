'use strict';
const A=require('../artists/context'),P=require('./policy'),{error}=require('../party/policy'),{digest}=require('../governance/content');
function route(data,s){return data.provider===s.provider&&data.environment===s.environment&&data.app_id===s.app_id&&data.merchant_id===s.merchant_id;}
function checked(r){const d=A.parse(r.data_json);if(digest(d)!==r.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);return d;}
async function facts(tx,s){
 const p=P.period(s.business_date),rows=(await tx.execute("SELECT j.*,t.data_json,t.data_sha256 FROM trade_journal j JOIN trade_records t ON t.id=j.source_id WHERE t.merchant_party_id=? AND j.created_at>=? AND j.created_at<? AND JSON_UNQUOTE(JSON_EXTRACT(t.data_json,'$.provider'))=? AND JSON_UNQUOTE(JSON_EXTRACT(t.data_json,'$.environment'))=? AND JSON_UNQUOTE(JSON_EXTRACT(t.data_json,'$.app_id'))=? AND JSON_UNQUOTE(JSON_EXTRACT(t.data_json,'$.merchant_id'))=? ORDER BY j.id LIMIT 2001 FOR SHARE",[s.merchant_party_id,p.start,p.end,s.provider,s.environment,s.app_id,s.merchant_id]))[0];
 if(rows.length>P.MAX_ITEMS)throw error('RECONCILIATION_DAY_TOO_LARGE',409);
 const items=[],warnings=[];
 for(const r of rows){const d=checked(r);if(!route(d,s)||r.currency!=='CNY'||d.currency!=='CNY'||Number(r.amount_minor)!==d.amount_minor)throw error('RECONCILIATION_LEDGER_MISMATCH',503);items.push({kind:r.direction,record_id:r.source_id,external_reference:r.provider_reference,direction:r.direction==='RECEIPT'?'IN':'OUT',amount_minor:P.money(Number(r.amount_minor)),source_key:'trade_journal:'+r.id});}
 // Only executed payouts/returns are external split facts; accruals and approved requests are not cash.
 const split=(await tx.execute("SELECT e.*,g.data_json AS agreement_json,g.data_sha256 AS agreement_hash FROM finance_entries e JOIN finance_records g ON g.id=e.agreement_id WHERE g.owner_party_id=? AND e.created_at>=? AND e.created_at<? AND e.category IN ('PAYOUT','PAYOUT_RETURN') ORDER BY e.id LIMIT 2001 FOR SHARE",[s.merchant_party_id,p.start,p.end]))[0];
 if(split.length>P.MAX_ITEMS)throw error('RECONCILIATION_DAY_TOO_LARGE',409);
 for(const r of split){const g=A.parse(r.agreement_json);if(digest(g)!==r.agreement_hash)throw error('STORED_CONTENT_MISMATCH',503);if(g.environment!==s.environment||g.source_type!=='ORDER')continue;
 const payments=(await tx.execute("SELECT * FROM trade_records WHERE order_id=? AND kind='PAYMENT' AND current_status IN ('SUCCEEDED','REFUNDED') FOR SHARE",[g.source_id]))[0].map(checked);
 if(!payments.some(x=>route(x,s)))continue;
 if(payments.some(x=>!route(x,s))){warnings.push({kind:'SPLIT',record_id:r.source_id,reason:'MULTI_CHANNEL_PAYOUT_REQUIRES_ALLOCATION'});continue;}
 const e=checked(r),source=await A.one(tx,"SELECT * FROM finance_records WHERE id=? AND kind='PAYOUT_EVIDENCE' AND current_status='APPROVED' FOR SHARE",[r.source_id]);
 if(!source)throw error('RECONCILIATION_PAYOUT_NOT_VERIFIED',409);
 const d=checked(source);if(d.amount_minor!==Math.abs(Number(r.amount_minor))||d.external_reference!==e.external_reference)throw error('RECONCILIATION_LEDGER_MISMATCH',503);
 items.push({kind:'SPLIT',record_id:r.source_id,external_reference:e.external_reference,direction:Number(r.amount_minor)<0?'OUT':'IN',amount_minor:P.money(Math.abs(Number(r.amount_minor))),source_key:'finance_entries:'+r.id});
 }
 if(items.length>P.MAX_ITEMS)throw error('RECONCILIATION_DAY_TOO_LARGE',409);
 items.sort((a,b)=>(a.kind+P.key(a)).localeCompare(b.kind+P.key(b)));
 return {items,warnings,fingerprint:digest({items,warnings}),basis:'PLATFORM_POSTING_DAY_ASIA_SHANGHAI'};
}
async function manualSources(tx,s,item){
 let gross=0n;
 for(const id of item.source_ids){
 const t=await A.one(tx,"SELECT * FROM trade_records WHERE id=? AND kind IN ('PAYMENT','REFUND') FOR SHARE",[id]);
 if(t){const d=checked(t);if(t.merchant_party_id!==s.merchant_party_id||!route(d,s)||!['SUCCEEDED','REFUNDED'].includes(t.current_status)||!await A.one(tx,'SELECT id FROM trade_journal WHERE source_id=?',[id]))throw error('RECONCILIATION_SOURCE_SCOPE_MISMATCH',409);gross+=BigInt(d.amount_minor);continue;}
 const r=await A.one(tx,"SELECT f.*,g.owner_party_id AS agreement_owner,g.data_json AS agreement_json,g.data_sha256 AS agreement_hash FROM finance_records f JOIN finance_records g ON g.id=f.agreement_id WHERE f.id=? AND f.kind IN ('PAYOUT_EVIDENCE','RECEIPT') AND f.current_status='APPROVED' FOR SHARE",[id]);
 if(!r)throw error('RECONCILIATION_SOURCE_NOT_VERIFIED',409);const g=A.parse(r.agreement_json),d=checked(r);if(digest(g)!==r.agreement_hash||r.agreement_owner!==s.merchant_party_id||g.environment!==s.environment||r.kind==='PAYOUT_EVIDENCE'&&!['PAID','RETURNED'].includes(d.outcome))throw error('RECONCILIATION_SOURCE_SCOPE_MISMATCH',409);if(g.source_type!=='ORDER')throw error('RECONCILIATION_SOURCE_SCOPE_MISMATCH',409);
 const payments=(await tx.execute("SELECT * FROM trade_records WHERE order_id=? AND kind='PAYMENT' AND current_status IN ('SUCCEEDED','REFUNDED') FOR SHARE",[g.source_id]))[0].map(checked);
 if(!payments.length||payments.some(x=>!route(x,s)))throw error('RECONCILIATION_SOURCE_SCOPE_MISMATCH',409);
 gross+=BigInt(d.amount_minor);
 }
 if(BigInt(item.amount_minor)>gross)throw error('RECONCILIATION_EVIDENCE_EXCEEDS_SOURCE',409);
}
module.exports={facts,manualSources,route,checked};
