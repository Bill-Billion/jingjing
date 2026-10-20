'use strict';
const {shape,id,label,error}=require('../party/policy');
const A=require('../artists/context'),C=require('./context'),P=require('./policy');
const {digest}=require('../governance/content');
async function own(tx,a,r,party){await C.owner(tx,a,party,true);if(r.owner_party_id!==party)throw error('REDEMPTION_NOT_FOUND',404);}
async function validateBinding(tx,r){
 const b=r.data.binding,t=r.data.template;if(!b)throw error('REWARD_BINDING_REQUIRED',409);
 const person=await A.person(tx,b.person_id);if(person.owner_party_id!==r.owner_party_id)throw error('REWARD_OWNER_CHANGED',409);
 require('../artists/policy').adult(person,await A.now(tx));await A.activeParty(tx,r.owner_party_id);
 await A.avatar(tx,b.avatar_id,person);
 if(t.kind==='INTERVIEW'){
  const halos=(await tx.execute("SELECT * FROM artist_records WHERE person_id=? AND kind='HALO' AND current_status='APPROVED' FOR SHARE",[person.id]))[0].map(A.checked);
  if(require('../artists/policy').haloLevel(halos,await A.now(tx))<t.interview.min_halo)throw error('INTERVIEW_HALO_REQUIRED',409);
  require('../production/customization-policy').cast({uses_identifiable_people:true,cast:[b.cast]},[b.cast?.supply_consent_id]);
  const legacy=await A.one(tx,"SELECT * FROM supply_records WHERE id=? AND kind='CONSENT' FOR SHARE",[b.cast.supply_consent_id]);
  if(!legacy)throw error('ARTIST_CONSENT_REQUIRED',409);
  const consent=require('../production/customization-state').decode(legacy);
  for(const feature of consent.consent.features)if(!require('../works/consent-policy').coversConsent({...legacy,data:consent},{feature,purpose:t.interview.purpose,territory:t.interview.territory},await A.now(tx)))throw error('ARTIST_CONSENT_REQUIRED',409);
  const cast=await require('../production/customization-state').validateCast(tx,{data:{producer_party_id:r.data.fulfillment_party_id,purpose:t.interview.purpose,territory:t.interview.territory}},{cast:[b.cast]});
  return {person,cast};
 }
 const profile=await require('../engagement/context').load(tx,b.profile_id,'RANK_PROFILE','FOR SHARE');
 if(profile.data.person_id!==person.id||profile.owner_party_id!==r.owner_party_id)throw error('REWARD_BINDING_MISMATCH',409);
 await require('../engagement/rankings').visible(tx,profile);return {person,profile};
}
function methods({db,actor}){return {
 async bind(ctx,i){
  shape(i,['record_id','party_id','expected_version','person_id','avatar_id','cast','profile_id','operation_key']);
  return db.withTransaction(async tx=>{const a=await actor(tx,ctx),r=await C.load(tx,i.record_id,'GRANT');await own(tx,a,r,i.party_id);
   return C.command(tx,a,'BIND',i,async()=>{A.match(r,i.expected_version);P.usable(r,await A.now(tx));
    if(!['INTERVIEW','EXPOSURE'].includes(r.data.template.kind))throw error('REWARD_BINDING_NOT_APPLICABLE',409);
    const stock=await C.load(tx,r.parent_id,'STOCK','FOR SHARE');
    const binding={person_id:id(i.person_id),avatar_id:id(i.avatar_id),cast:i.cast??null,profile_id:i.profile_id??null};
    if(r.data.template.kind==='EXPOSURE'&&(binding.cast!==null||!binding.profile_id))throw error('REWARD_BINDING_MISMATCH',400);
    if(r.data.template.kind==='INTERVIEW'&&(!binding.cast||binding.cast.person_id!==binding.person_id||binding.cast.avatar_id!==binding.avatar_id))throw error('REWARD_BINDING_MISMATCH',400);
    const next={...r,data:{...r.data,binding,fulfillment_party_id:stock.owner_party_id}};await validateBinding(tx,next);
    return C.save(tx,a,r,'BOUND',next.data,'REWARD_BOUND_TO_SELF');});});
 },
 async proposeDelivery(ctx,i){
  shape(i,['record_id','expected_version','starts_at','ends_at','reference','evidence_asset_id','operation_key']);label(i.reference,1000);
  require('../trade/policy').instant(i.starts_at);require('../trade/policy').instant(i.ends_at);
  return db.withTransaction(async tx=>{const a=await actor(tx,ctx),r=await C.load(tx,i.record_id,'GRANT');await C.operator(tx,a,'REDEMPTION_REVIEW',r);
   return C.command(tx,a,'PROPOSE_DELIVERY',i,async()=>{A.match(r,i.expected_version);const at=await A.now(tx);
    if(r.current_status!=='BOUND'||r.data.expires_at<=at||i.starts_at<at||i.ends_at<=i.starts_at||i.ends_at>r.data.expires_at)throw error('REWARD_SCHEDULE_INVALID',409);
    await validateBinding(tx,r);await A.assets(tx,[id(i.evidence_asset_id)],r.data.fulfillment_party_id,['REVIEW_EVIDENCE','WORK_CONTENT']);
    if(r.data.template.kind==='EXPOSURE'&&Date.parse(i.ends_at)-Date.parse(i.starts_at)!==7*P.DAY)throw error('EXPOSURE_PERIOD_INVALID',400);
    if(await A.one(tx,"SELECT id FROM redemption_records WHERE kind='SCHEDULE' AND parent_id=? AND current_status IN ('IN_REVIEW','APPROVED') LIMIT 1",[r.id]))throw error('REWARD_SCHEDULE_ALREADY_PENDING',409);
    return C.insert(tx,a,'SCHEDULE',r.owner_party_id,r.id,'IN_REVIEW',{starts_at:i.starts_at,ends_at:i.ends_at,reference:i.reference,evidence_asset_id:i.evidence_asset_id,kind:r.data.template.kind,person_id:r.data.binding.person_id,placement:r.data.template.exposure?.placement||null});});});
 },
 async reviewDelivery(ctx,i){
  shape(i,['record_id','expected_version','decision','reason','operation_key']);label(i.reason,2000);if(!['APPROVE','REJECT'].includes(i.decision))throw error('INVALID_REVIEW',400);
  return db.withTransaction(async tx=>{const a=await actor(tx,ctx),hint=await C.load(tx,i.record_id,'SCHEDULE',''),r=await C.load(tx,hint.parent_id,'GRANT'),s=await C.load(tx,hint.id,'SCHEDULE');await C.operator(tx,a,'REDEMPTION_REVIEW',s);
   return C.command(tx,a,'SCHEDULE_REVIEW',i,async()=>{A.match(s,i.expected_version);if(s.current_status!=='IN_REVIEW'||r.current_status!=='BOUND')throw error('REVIEW_NOT_PENDING',409);
    if(i.decision==='APPROVE'){
     if(s.data.starts_at<await A.now(tx)||s.data.ends_at>r.data.expires_at)throw error('REWARD_SCHEDULE_INVALID',409);
     await validateBinding(tx,r);await A.assets(tx,[s.data.evidence_asset_id],r.data.fulfillment_party_id,['REVIEW_EVIDENCE','WORK_CONTENT']);
     await C.save(tx,a,r,'SCHEDULED',{...r.data,delivery:{schedule_id:s.id,starts_at:s.data.starts_at,ends_at:s.data.ends_at,reference:s.data.reference}},'REWARD_SCHEDULE_APPROVED');
    }
    return C.save(tx,a,s,i.decision==='APPROVE'?'APPROVED':'REJECTED',{...s.data,review:{by:a.id,reason:i.reason}},'REWARD_DELIVERY_REVIEWED');});});
 },
 async acknowledge(ctx,i){
  shape(i,['record_id','party_id','expected_version','accepted','operation_key']);if(typeof i.accepted!=='boolean')throw error('INVALID_INPUT',400);
  return db.withTransaction(async tx=>{const a=await actor(tx,ctx),r=await C.load(tx,i.record_id,'GRANT');await own(tx,a,r,i.party_id);
   return C.command(tx,a,'ACKNOWLEDGE',i,async()=>{A.match(r,i.expected_version);if(r.current_status!=='SCHEDULED'||r.data.delivery.starts_at<=await A.now(tx))throw error('REWARD_CONFIRMATION_CLOSED',409);
    await validateBinding(tx,r);const s=await C.load(tx,r.data.delivery.schedule_id,'SCHEDULE');
    await C.save(tx,a,s,i.accepted?'CONFIRMED':'DECLINED',s.data,'REWARD_APPOINTMENT_CONFIRMED');
    return C.save(tx,a,r,i.accepted?'CONFIRMED':'BOUND',{...r.data,delivery:i.accepted?{...r.data.delivery,confirmed_at:await A.now(tx)}:null},'REWARD_HOLDER_CONFIRMED');});});
 },
 async finish(ctx,i){
  shape(i,['record_id','expected_version','outcome','evidence_asset_id','reason','operation_key']);label(i.reason,2000);
  if(!['INTERVIEWED','NOT_SELECTED','EXPOSURE_COMPLETED'].includes(i.outcome))throw error('INVALID_REWARD_OUTCOME',400);
  return db.withTransaction(async tx=>{const a=await actor(tx,ctx),r=await C.load(tx,i.record_id,'GRANT');await C.operator(tx,a,'REDEMPTION_REVIEW',r);
   return C.command(tx,a,'FINISH',i,async()=>{A.match(r,i.expected_version);
    if(r.current_status!=='CONFIRMED'||r.data.delivery.ends_at>await A.now(tx))throw error('REWARD_DELIVERY_NOT_DUE',409);
    if((r.data.template.kind==='EXPOSURE')!==(i.outcome==='EXPOSURE_COMPLETED'))throw error('INVALID_REWARD_OUTCOME',400);
    await validateBinding(tx,r);await A.assets(tx,[id(i.evidence_asset_id)],r.data.fulfillment_party_id,['REVIEW_EVIDENCE','WORK_CONTENT']);
    return C.save(tx,a,r,'FULFILLED',{...r.data,delivery:{...r.data.delivery,outcome:i.outcome,evidence_asset_id:i.evidence_asset_id,reason:i.reason,by:a.id,completed_at:await A.now(tx)}},'REWARD_FULFILLMENT_RECORDED');});});
 },
 async requestRemedy(ctx,i){
  shape(i,['record_id','party_id','expected_version','reason','operation_key']);label(i.reason,2000);
  return db.withTransaction(async tx=>{const a=await actor(tx,ctx),r=await C.load(tx,i.record_id,'GRANT');await own(tx,a,r,i.party_id);
   return C.command(tx,a,'REMEDY_REQUEST',i,async()=>{A.match(r,i.expected_version);
    if(!['INTERVIEW','EXPOSURE'].includes(r.data.template.kind)||!['AVAILABLE','BOUND','SCHEDULED','CONFIRMED'].includes(r.current_status))throw error('REWARD_REMEDY_NOT_AVAILABLE',409);
    if(await A.one(tx,"SELECT id FROM redemption_records WHERE kind='REMEDY' AND parent_id=? AND current_status='IN_REVIEW'",[r.id]))throw error('REWARD_REMEDY_PENDING',409);
    const c=await C.insert(tx,a,'REMEDY',r.owner_party_id,r.id,'IN_REVIEW',{reason:i.reason,previous_status:r.current_status});
    await C.save(tx,a,r,'REMEDY_PENDING',r.data,'REWARD_REMEDY_PENDING');return c;});});
 },
 async reviewRemedy(ctx,i){
  shape(i,['record_id','expected_version','decision','reason','evidence_asset_id','operation_key']);label(i.reason,2000);
  if(!['REJECT','EXTEND_ONCE','RETURN_POINTS'].includes(i.decision))throw error('INVALID_REVIEW',400);
  return db.withTransaction(async tx=>{const a=await actor(tx,ctx),hint=await C.load(tx,i.record_id,'REMEDY',''),r=await C.load(tx,hint.parent_id,'GRANT'),c=await C.load(tx,hint.id,'REMEDY');await C.operator(tx,a,'REDEMPTION_REVIEW',c);
   return C.command(tx,a,'REMEDY_REVIEW',i,async()=>{A.match(c,i.expected_version);if(c.current_status!=='IN_REVIEW'||r.current_status!=='REMEDY_PENDING')throw error('REVIEW_NOT_PENDING',409);
    const stock=await C.load(tx,r.parent_id,'STOCK','FOR SHARE');await A.assets(tx,[id(i.evidence_asset_id)],stock.owner_party_id,['REVIEW_EVIDENCE']);
    let status=c.data.previous_status,data=r.data;
    if(i.decision==='EXTEND_ONCE'){
     if(r.data.template.kind!=='INTERVIEW'||r.data.extension_used)throw error('REWARD_EXTENSION_NOT_AVAILABLE',409);
     status=r.data.binding?'BOUND':'AVAILABLE';data={...r.data,extension_used:true,delivery:null,expires_at:new Date(Math.max(Date.parse(r.data.expires_at),Date.parse(await A.now(tx)))+r.data.template.interview.extension_days*P.DAY).toISOString()};
    }else if(i.decision==='RETURN_POINTS'){
     if(r.data.hold_id)await require('./points').returnSpend(tx,r.owner_party_id,r.data.hold_id);
     else if(r.data.template.kind==='INTERVIEW')await require('./points').award(tx,a,r.owner_party_id,r.data.template.interview.fallback_points,['REWARD_REMEDY',r.id]);
     else if(r.data.template.kind==='EXPOSURE'&&r.data.template.exposure.fallback_points)await require('./points').award(tx,a,r.owner_party_id,r.data.template.exposure.fallback_points,['REWARD_REMEDY',r.id]);else throw error('REWARD_REMEDY_RULE_MISSING',409);
     status='POINTS_RETURNED';
    }
    if(i.decision!=='REJECT'&&r.data.delivery){const s=await C.load(tx,r.data.delivery.schedule_id,'SCHEDULE');await C.save(tx,a,s,'CANCELLED',s.data,'REWARD_SCHEDULE_CANCELLED');}
    await C.save(tx,a,r,status,data,'REWARD_REMEDY_APPLIED');
    return C.save(tx,a,c,i.decision==='REJECT'?'REJECTED':'RESOLVED',{...c.data,resolution:{decision:i.decision,reason:i.reason,evidence_asset_id:i.evidence_asset_id,by:a.id}},'REWARD_REMEDY_REVIEWED');});});
 },
 async exposures(ctx,i){return db.withTransaction(async tx=>{await actor(tx,ctx);label(i.city,100);const at=await A.now(tx),rows=(await tx.execute("SELECT * FROM redemption_records WHERE kind='GRANT' AND current_status='CONFIRMED' AND JSON_UNQUOTE(JSON_EXTRACT(data_json,'$.template.kind'))='EXPOSURE'",[]))[0].map(C.checked),items=[];
  for(const r of rows){if(r.data.delivery.starts_at>at||r.data.delivery.ends_at<=at)continue;try{const {profile}=await validateBinding(tx,r);if(profile.data.city===i.city)items.push({person_id:r.data.binding.person_id,avatar_id:r.data.binding.avatar_id,placement:r.data.template.exposure.placement,starts_at:r.data.delivery.starts_at,ends_at:r.data.delivery.ends_at,source:'EARNED_REWARD_NOT_PAID_AD'});}catch(e){if(!e.status||e.status>=500)throw e;}}
  return {items};});}
};}
module.exports={methods,validateBinding};
