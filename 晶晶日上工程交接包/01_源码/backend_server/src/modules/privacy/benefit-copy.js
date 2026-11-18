"use strict";
const A=require('../artists/context'),{id,error}=require('../party/policy'),{digest}=require('../governance/content');
const sections={GROWTH_RECORDS:'PROFILE',REFERRAL_COMMISSIONS:'TRANSACTIONS',REWARD_GRANTS:'TRANSACTIONS',LOTTERY_DRAWS:'TRANSACTIONS',REWARD_FULFILLMENT:'TRANSACTIONS',REWARD_DISCOUNTS:'TRANSACTIONS'};
const pick=(d,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(d,k)).map(k=>[k,d[k]]));
const optional=(d,keys)=>d==null?null:pick(d,keys);
function checked(r){const d=A.parse(r.data_json);if(digest(d)!==r.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);return d;}
function rule(r){if(!r)return null;if(!r.data||digest(r.data)!==r.content_sha256)throw error('STORED_CONTENT_MISMATCH',503);const d=r.data.rule;return {id:r.id,source_content_sha256:r.content_sha256,...pick(d,['version','terms','gp','thresholds','retention_days','retention_bps','starlight','aftercare_days','referral_bps'])};}
function template(t){return {...pick(t,['version','title','kind','valid_days','exchange_points','terms','service_code']),production:optional(t.production,['face_minor','minimum_minor','spec_ids']),interview:optional(t.interview,['channel','project_ref','batch_ref','min_halo','purpose','territory','extension_days','fallback_points']),exposure:optional(t.exposure,['placement','duration_days','fallback_points'])};}
function publicDraw(d){const s=d.rule_snapshot;return {...pick(d,['pool_id','rules_sha256','at','count','points','hold_id']),rules:s?{id:s.id,...pick(s,['starts_at','ends_at','terms']),config:{...pick(s.config,['version','single_points','ten_points','algorithm','source_profile']),prizes:s.config.prizes.map(p=>pick(p,['key','kind','weight']))},prize_promises:(s.prize_promises||[]).map(p=>({key:p.key,stock_id:p.stock_id,template:template(p.template)}))}:null,results:(d.results||[]).map(x=>pick(x,['index','key','kind','guaranteed_slot','grant_id','point_earning_id','point_back']))};}
function project(r,d,now){
 if(r.kind==='GROWTH_ACCOUNT')return {...pick(d,['person_id','at','growth_points','recent_growth_points','earned_level','level','demoted','starlight','starlight_configured','exchange_enabled','source_order_ids']),rule:rule(d.rule_snapshot),reminders:(d.reminders||[]).map(x=>pick(x,['code','from','to','reason']))};
 if(r.kind==='STARLIGHT_ENTRY')return {...pick(d,['person_id','order_id','amount','voided','source','exchange_enabled']),rule:rule(d.rule_snapshot)};
 if(r.kind==='REFERRAL_COMMISSION')return {...pick(d,['order_id','amount_minor','paid_out_minor','meaning','delta_minor','as_of']),attribution:d.attribution?{...pick(d.attribution,['version','category','clicked_at','captured_at','rate_bps','status','one_level_only','free_points_reward_enabled']),rule:rule(d.attribution.rule_snapshot)}:null,environment:d.financial?.environment||null};
 if(r.kind==='GRANT'){if(d.template_sha256!==digest(d.template))throw error('STORED_CONTENT_MISMATCH',503);return {...pick(d,['issued_at','expires_at','hold_id','extension_used','performance_rights_granted','cashable','transferable','checkout_hold_id','used_order_id','used_at','cocreation_benefit_id']),template:template(d.template),binding:optional(d.binding,['person_id','avatar_id','profile_id']),delivery:optional(d.delivery,['schedule_id','starts_at','ends_at','reference','confirmed_at','outcome','reason','completed_at']),effective_status:['AVAILABLE','BOUND'].includes(r.current_status)&&d.expires_at<=now?'EXPIRED':r.current_status};}
 if(r.kind==='DRAW')return publicDraw(d);
 if(r.kind==='SCHEDULE')return pick(d,['starts_at','ends_at','reference','kind','person_id','placement']);
 if(r.kind==='REMEDY')return {...pick(d,['reason','previous_status']),resolution:optional(d.resolution,['decision','reason'])};
 if(r.kind==='COUPON_HOLD')return {...pick(d,['quote_id','grant_id','expires_at','order_id']),discount:d.adjusted_quote?.discount?pick(d.adjusted_quote.discount,['source_kind','coverage','discount_minor','original_total_minor','refund_forfeit','cashable']):null};
 throw error('INVALID_INPUT',400);
}
async function page(tx,account,{section,after='',limit}){
 const kinds={GROWTH_RECORDS:['GROWTH_ACCOUNT','STARLIGHT_ENTRY'],REFERRAL_COMMISSIONS:['REFERRAL_COMMISSION'],REWARD_GRANTS:['GRANT'],LOTTERY_DRAWS:['DRAW'],REWARD_FULFILLMENT:['SCHEDULE','REMEDY'],REWARD_DISCOUNTS:['COUPON_HOLD']}[section];if(!kinds)throw error('INVALID_INPUT',400);if(after)id(after);
 const table=['GROWTH_RECORDS','REFERRAL_COMMISSIONS'].includes(section)?'engagement_records':'redemption_records';
 let q=`SELECT r.* FROM ${table} r JOIN parties p ON p.id=r.owner_party_id WHERE p.kind='PERSON' AND p.personal_account_id=? AND r.kind IN (${kinds.map(()=>'?').join(',')})`;
 // Pending scheduling proposals are internal until reviewed. A holder's own remedy is visible.
 if(section==='REWARD_FULFILLMENT')q+=" AND (r.kind='REMEDY' OR r.current_status IN ('APPROVED','CONFIRMED','DECLINED','CANCELLED'))";
 const args=[account,...kinds];if(after&&!(await tx.execute(q+' AND r.id=?',[...args,after]))[0].length)throw error('INVALID_CURSOR',400);
 const [rows]=await tx.execute(q+' AND r.id>? ORDER BY r.id LIMIT ?',[...args,after,limit+1]),now=await A.now(tx);
 return {section,items:rows.slice(0,limit).map(r=>({id:r.id,kind:r.kind,current_status:r.current_status,object_version:r.object_version,parent_id:r.parent_id,created_at:A.instant(r.created_at),data:project(r,checked(r),now)})),next_cursor:rows.length>limit?rows[limit-1].id:null,coverage:'OWN_ACCOUNT_RECORDS_ONLY',request_completion:'NOT_CONFIRMED',original_documents_included:false};
}
module.exports={sections,page};
