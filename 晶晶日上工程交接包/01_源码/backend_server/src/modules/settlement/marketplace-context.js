 'use strict';
const {id,error}=require('../party/policy');
const {verifyRuleContent}=require('../governance/content');
const C=require('./context'),M=require('./marketplace-policy');
async function snapshot(tx,{rule_id,supplier_party_id,relation_id}){
 const row=await C.one(tx,"SELECT * FROM governance_rules WHERE id=? AND current_status='EFFECTIVE' AND effective_at<=CURRENT_TIMESTAMP(3) FOR SHARE",[id(rule_id)]);
 if(!row)throw error('RULE_NOT_EFFECTIVE',409);
 let content;try{content=verifyRuleContent(typeof row.content_json==='string'?JSON.parse(row.content_json):row.content_json);}catch{throw error('STORED_CONTENT_MISMATCH',503);}
 if(content.id!==row.id)throw error('STORED_CONTENT_MISMATCH',503);
 const cfg=M.config(content.terms.marketplace_finance);
 await C.active(tx,supplier_party_id);await C.active(tx,cfg.platform_party_id);
 const captured_at=new Date().toISOString();let relation_snapshot=null,mcn_party_id=null,mcn_supply_bps=0;
 const [live]=await tx.execute("SELECT id FROM gig_records WHERE kind='RELATION' AND counterparty_id=? AND current_status='ACTIVE' AND JSON_UNQUOTE(JSON_EXTRACT(data_json,'$.valid_from'))<=? AND JSON_UNQUOTE(JSON_EXTRACT(data_json,'$.valid_until'))>? FOR SHARE",[supplier_party_id,captured_at,captured_at]);
 if(live.length>1)throw error('MCN_RELATION_AMBIGUOUS',409);
 if(relation_id===null&&live.length===1)relation_id=live[0].id;
 if(relation_id!==null){
  const r=await require('../gigs/context').load(tx,relation_id,'RELATION','FOR SHARE');
  if(r.current_status!=='ACTIVE'||r.counterparty_id!==supplier_party_id||r.data.scope!=='COMMERCIAL'||!r.data.accepted_by||r.data.valid_from>captured_at||r.data.valid_until<=captured_at)throw error('RELATION_NOT_APPLICABLE',409);
  if(!r.data.v5_terms)throw error('MCN_V5_TERMS_REQUIRED',409);
  if(!await C.one(tx,"SELECT party_id FROM party_capabilities WHERE party_id=? AND code='MCN' AND current_status='ACTIVE' FOR SHARE",[r.owner_party_id]))throw error('MCN_CAPABILITY_REQUIRED',409);
  await C.active(tx,r.owner_party_id);
  for(const key of r.data.evidence_asset_ids)await C.asset(tx,key,r.owner_party_id);
  mcn_supply_bps=M.mcnTerms(r.data.v5_terms).supply_share_bps;mcn_party_id=r.owner_party_id;relation_snapshot=r;
 }
 const allocation=M.allocation({...cfg,supplier_party_id,mcn_party_id,mcn_supply_bps,referrer_party_id:null,referral_bps:0});
 return {allocation,rule_snapshot:{content,current_status:row.current_status,effective_at:new Date(row.effective_at.replace(' ','T')+'Z').toISOString()},relation_snapshot,captured_at};
}
module.exports={snapshot};
