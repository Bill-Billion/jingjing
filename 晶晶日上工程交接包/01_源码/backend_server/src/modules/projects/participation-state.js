"use strict";
const {error}=require('../party/policy'),{digest}=require('../governance/content');
const C=require('./checks'),A=require('../artists/context');
async function conflicts(tx,p,d,self=null){const [rows]=await tx.execute("SELECT * FROM project_records WHERE kind='PARTICIPATION' AND current_status IN ('IN_REVIEW','APPROVED') AND JSON_UNQUOTE(JSON_EXTRACT(data_json,'$.avatar_id'))=? ORDER BY id",[d.avatar_id]);return rows.map(C.dto).filter(r=>r.id!==self&&r.project_id!==p.id&&(d.terms.exclusive||r.data.terms.exclusive)&&r.data.terms.territory===d.terms.territory&&r.data.terms.valid_until>new Date().toISOString()).map(r=>r.id);}
async function usable(tx,p,r,{confirmed=false}={}){
 if(r.kind!=='PARTICIPATION'||r.project_id!==p.id||p.current_status==='CANCELLED'||['REJECTED','WITHDRAWN','SUPERSEDED'].includes(r.current_status))throw error('PARTICIPATION_NOT_AVAILABLE',409);
 const d=r.data,c=await C.load(tx,d.candidate_id,'CANDIDATE','FOR SHARE');
 if(c.current_status!=='CONFIRMED'||c.content_sha256!==d.candidate_sha256)throw error('PARTICIPATION_CAST_CHANGED',409);
 const holder=await C.candidateScope(tx,c,p),person=await A.person(tx,d.cast.person_id),at=await A.now(tx);
 require('../artists/policy').adult(person,at);await A.avatar(tx,c.data.avatar_id,person);
 if(person.owner_party_id!==holder||holder!==r.owner_party_id)throw error('PARTICIPATION_HOLDER_MISMATCH',409);
 const consent=C.checked(await C.one(tx,"SELECT * FROM supply_records WHERE id=? FOR SHARE",[c.data.consent_id]));
 await require('../artists/eligibility').checkAvatarUse(tx,{avatar_id:c.data.avatar_id,purpose:d.terms.usage==='NEW_GENERATION'?'NEW_GENERATION':'PROJECT_PRODUCTION',grantee_party_id:p.owner_party_id,features:consent.data.consent.features,territory:p.data.scope.territory,requireLink:true});
 const variants=[];
 for(const [key,kind] of [['look_version_id','LOOK'],['voice_version_id','VOICE']]){
  if(d.cast[key]===null){if(consent.data.consent.features.includes('VOICE'))throw error('PARTICIPATION_VOICE_REQUIRED',409);continue;}
  const v=await A.load(tx,d.cast[key],kind);if(v.person_id!==person.id||v.avatar_id!==c.data.avatar_id||v.current_status!=='RECORDED')throw error('PARTICIPATION_VARIANT_MISMATCH',409);
  const archive=await A.load(tx,v.data.consent_id,'CONSENT');if(archive.current_status!=='APPROVED'||archive.person_id!==person.id||archive.avatar_id!==c.data.avatar_id||archive.data.grantee_party_id!==holder||!archive.data.purposes.includes('PRIVATE_ARCHIVE')||!archive.data.features.includes(kind==='LOOK'?'FACE':'VOICE')||!require('../artists/policy').active(archive.data,at))throw error('PARTICIPATION_VARIANT_CONSENT_REQUIRED',409);await A.assets(tx,v.data.material_asset_ids,holder,['AVATAR_MATERIAL']);variants.push({id:v.id,content_sha256:v.content_sha256});
 }
 if(d.variant_snapshot&&digest(variants)!==digest(d.variant_snapshot))throw error('PARTICIPATION_VARIANT_CHANGED',409);
 if(d.terms.territory!==p.data.scope.territory||d.terms.language!==p.data.scope.language||d.terms.valid_until<p.data.scope.valid_until||d.terms.valid_until<=at)throw error('PARTICIPATION_SCOPE_MISMATCH',409);
 await C.evidence(tx,d.evidence_asset_id,r.owner_party_id);
 if(confirmed){if(r.current_status!=='APPROVED')throw error('PARTICIPATION_REVIEW_REQUIRED',409);await C.allConfirmed(tx,r);}
 return {candidate:c,variants};
}
async function current(tx,key,{confirmed=true}={}){const r=await C.load(tx,key,'PARTICIPATION','FOR SHARE'),p=await C.load(tx,r.project_id,'PROJECT','FOR SHARE');await usable(tx,p,r,{confirmed});return {r,p};}
async function orderGate(tx,o,{requireBound=true}={}){
 const snap=o.data.quote.participation;if(!snap)return;
 const {r,p}=await current(tx,snap.agreement_id);
 const link=await C.one(tx,'SELECT order_id FROM project_participation_orders WHERE agreement_id=?',[r.id]);
 if(r.content_sha256!==snap.agreement_sha256||requireBound&&link?.order_id!==o.id||o.buyer_party_id!==p.owner_party_id||o.merchant_party_id!==r.owner_party_id)throw error('PARTICIPATION_ORDER_MISMATCH',409);
 return r;
}
async function plan(tx,p,cast){
 const [rows]=await tx.execute("SELECT * FROM project_records WHERE project_id=? AND kind='PARTICIPATION' AND current_status NOT IN ('REJECTED','WITHDRAWN','SUPERSEDED') FOR SHARE",[p.id]);
 if(p.data.business_version!=='V5'&&!rows.length)return null;
 const agreements=[];let revenue=null;
 for(const c of cast){const matches=rows.map(C.dto).filter(r=>r.data.candidate_id===c.id);if(matches.length!==1)throw error('PARTICIPATION_AGREEMENT_REQUIRED',409);const r=matches[0];await usable(tx,p,r,{confirmed:true});
  const link=await C.one(tx,'SELECT order_id FROM project_participation_orders WHERE agreement_id=?',[r.id]);
  if(r.data.fee_minor>0){if(!link)throw error('PARTICIPATION_ORDER_REQUIRED',409);const o=C.checked(await C.one(tx,"SELECT * FROM trade_records WHERE id=? AND kind='ORDER' FOR SHARE",[link.order_id]));await orderGate(tx,o);if(!['OPEN','PARTIALLY_PAID','PAID'].includes(o.current_status)||o.data.financial.refunded_minor)throw error('PARTICIPATION_PAYMENT_NOT_AVAILABLE',409);
   for(const key of r.data.terms.start_payment_keys)if(!await C.one(tx,'SELECT payment_id FROM trade_installments WHERE order_id=? AND installment_key=?',[o.id,key]))throw error('PARTICIPATION_START_PAYMENT_REQUIRED',409);
  }
  if(r.data.terms.revenue){if(revenue&&digest(revenue)!==digest(r.data.terms.revenue))throw error('PARTICIPATION_REVENUE_CONFLICT',409);revenue=r.data.terms.revenue;}
  agreements.push({id:r.id,content_sha256:r.content_sha256,candidate_id:c.id,order_id:link?.order_id||null});
 }
 return {agreements,revenue};
}
async function checkPlan(tx,p,pl,cast){const snap=await plan(tx,p,cast);if(digest(snap)!==digest(pl.data.participation||null))throw error('PARTICIPATION_PLAN_CHANGED',409);return snap;}
async function delivery(tx,pl){for(const item of pl.data.participation?.agreements||[]){if(!item.order_id)continue;const o=C.checked(await C.one(tx,"SELECT * FROM trade_records WHERE id=? AND kind='ORDER' FOR SHARE",[item.order_id]));await orderGate(tx,o);if(o.current_status!=='PAID'||o.data.financial.refunded_minor)throw error('PARTICIPATION_DELIVERY_PAYMENT_REQUIRED',409);}}
async function payment(tx,o,key){const r=await orderGate(tx,o);if(!r)return;if(!r.data.terms.start_payment_keys.includes(key)&&!await C.one(tx,'SELECT account_id FROM project_participation_milestones WHERE agreement_id=? AND installment_key=?',[r.id,key]))throw error('PARTICIPATION_MILESTONE_REQUIRED',409);}
function revenueMatch(info,rules){const expected=info.participation_revenue;if(info.participation_required&&!expected)throw error('PARTICIPATION_REVENUE_CONTRACT_REQUIRED',409);if(expected&& (rules.lines.length!==1||rules.lines[0].deductions.length||digest(rules.lines[0].shares)!==digest(expected.shares)))throw error('PARTICIPATION_REVENUE_CONTRACT_MISMATCH',409);}
module.exports={conflicts,delivery,payment,usable,current,orderGate,plan,checkPlan,revenueMatch};
