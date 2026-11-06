"use strict";
const {id,error}=require('../party/policy');
const {digest,verifyUnsignedContent}=require('../governance/content');
const A=require('../artists/context');
const pick=(v,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(v,k)).map(k=>[k,v[k]]));
const sections={LICENSE_AGREEMENTS:'CONTRACTS',PARTICIPATION_AGREEMENTS:'CONTRACTS',AGENCY_AGREEMENTS:'CONTRACTS'};
const procurementKeys=['version','mode','buyer_party_id','upfront_minor','royalty_bps','sublicensing_allowed','attribution_terms'];
function checked(r){const d=A.parse(r.data_json);if(digest(d)!==r.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);return d;}
function license(d){
 // Copy the agreement as sealed when the reservation was made, not today's product.
 try{verifyUnsignedContent(d.contract);}catch{throw error('STORED_CONTENT_MISMATCH',503);}
 const c=d.contract.commitments;
 const terms=pick(c,['reservation_id','product_id','product_version','work_version_id','terms','price','payment_due_minor']);
 if(c.procurement){terms.procurement=pick(c.procurement,procurementKeys);terms.procurement.settlement_annex=c.procurement.settlement_annex?pick(c.procurement.settlement_annex,['cycle','terms_text','net_basis']):null;}
 return {...terms,party_ids:d.contract.party_ids,rule_contents:d.contract.rule_contents,contract_version_id:d.contract.contract_version_id,created_at:d.contract.created_at};
}
async function page(tx,account,{section,after='',limit}){
 if(!Object.hasOwn(sections,section))throw error('INVALID_INPUT',400);if(after)id(after);
 const personal="p.kind='PERSON' AND p.personal_account_id=?";
 let q;
 if(section==='LICENSE_AGREEMENTS')q="SELECT DISTINCT r.* FROM license_records r JOIN parties p ON (p.id=r.owner_party_id OR p.id=r.counterparty_id) WHERE r.kind IN ('RESERVATION','GRANT') AND "+personal;
 else if(section==='PARTICIPATION_AGREEMENTS')q="SELECT DISTINCT r.* FROM project_records r JOIN parties p ON (p.id=r.owner_party_id OR JSON_CONTAINS(JSON_EXTRACT(r.data_json,'$.confirmers'),JSON_OBJECT('party_id',p.id))) WHERE r.kind='PARTICIPATION' AND "+personal;
 else q="SELECT DISTINCT r.* FROM gig_records r JOIN parties p ON (p.id=r.owner_party_id OR p.id=r.counterparty_id) WHERE r.kind='RELATION' AND "+personal;
 // A supplied cursor must belong to this account and this section, even for historical rows.
 if(after&&!(await tx.execute(q+' AND r.id=?',[account,after]))[0].length)throw error('INVALID_CURSOR',400);
 const [rows]=await tx.execute(q+' AND r.id>? ORDER BY r.id LIMIT ?',[account,after,limit+1]);
 const items=rows.slice(0,limit).map(r=>{
  const d=checked(r);let terms;
  if(section==='LICENSE_AGREEMENTS')terms=license(d);
  else if(section==='PARTICIPATION_AGREEMENTS'){
   terms=pick(d,['candidate_id','role_id','avatar_id','consent_id','cast','terms','fee_minor','order_id']);
   terms.parties=d.confirmers.map(x=>({party_id:x.party_id,responsibility:x.responsibility,after_party_ids:x.after_party_ids}));
   if(d.amendment)terms.amendment=pick(d.amendment,['previous_agreement_id','previous_sha256','kind','cash_required_minor','reason']);
  }else terms=pick(d,['scope','valid_from','valid_until','exclusive','terms','commission','v5_terms','ended_reason']);
  return {id:r.id,kind:r.kind,owner_party_id:r.owner_party_id,counterparty_id:r.counterparty_id||null,project_id:r.project_id||null,current_status:r.current_status,object_version:r.object_version,source_content_sha256:r.data_sha256,copy_sha256:digest(terms),copy_kind:'REDACTED_AGREEMENT_COPY',signature_evidence:'NOT_INCLUDED',terms};
 });
 return {section,items,next_cursor:rows.length>limit?rows[limit-1].id:null,coverage:'OWN_ACCOUNT_RECORDS_ONLY',request_completion:'NOT_CONFIRMED'};
}
module.exports={page,sections};
