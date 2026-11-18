'use strict';
const {id,error}=require('../party/policy'),C=require('../settlement/context'),A=require('../artists/context');
const sections={FINANCE_RECOVERIES:'TRANSACTIONS'};
async function page(tx,account,{section,after='',limit}){
 if(section!=='FINANCE_RECOVERIES')throw error('INVALID_INPUT',400);if(after)id(after);
 // Personal participation only. Company authorship or operator roles are not ownership.
 const q="SELECT r.*,g.owner_party_id AS claimant_party_id,g.data_json AS agreement_json,g.data_sha256 AS agreement_sha256,p.id AS own_party_id FROM finance_records r JOIN finance_records g ON g.id=r.agreement_id AND g.kind='AGREEMENT' JOIN parties p ON (p.id=r.owner_party_id OR p.id=g.owner_party_id) WHERE r.kind='RECOVERY' AND p.kind='PERSON' AND p.personal_account_id=?";
 if(after&&!(await tx.execute(q+' AND r.id=?',[account,after]))[0].length)throw error('INVALID_CURSOR',400);
 const [rows]=await tx.execute(q+' AND r.id>? ORDER BY r.id LIMIT ?',[account,after,limit+1]);
 const items=rows.slice(0,limit).map(row=>{
  const r=C.dto(row),g=C.checked({data_json:row.agreement_json,data_sha256:row.agreement_sha256}).data,d=r.data;
  return {id:r.id,agreement_id:r.agreement_id,relationship:row.own_party_id===row.claimant_party_id?'CLAIMANT':'RECIPIENT',current_status:r.current_status,object_version:r.object_version,created_at:A.instant(row.created_at),source_content_sha256:r.content_sha256,source_type:d.basis.source_type,source_id:d.basis.source_id,environment:g.environment,currency:g.currency,amount_minor:d.amount_minor,received_minor:d.received_minor,unlinked_claim_minor:d.amount_minor-d.received_minor,review_decision:d.review?.decision||null,administratively_closed:r.current_status==='CANCELLED',receipts:d.receipts.map(x=>({payout_evidence_id:x.payout_evidence_id,amount_minor:x.amount_minor})),meaning:'HISTORICAL_CLAIM_AND_LINKED_RECEIPTS_NOT_CURRENT_DEBT_OR_BANK_VERIFICATION'};
 });
 return {section,items,next_cursor:rows.length>limit?rows[limit-1].id:null,coverage:'OWN_ACCOUNT_RECORDS_ONLY',request_completion:'NOT_CONFIRMED',original_documents_included:false};
}
module.exports={sections,page};
