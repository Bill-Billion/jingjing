"use strict";
const A=require('../artists/context'),C=require('./context'),F=require('./facts'),{label,shape,id,error}=require('../party/policy');
const VERSION='BUYER_CITY_20261113';
async function identity(tx,party){
 if(party.kind==='PERSON'){
  const account=await A.one(tx,"SELECT id FROM identity_accounts WHERE id=? AND current_status='ACTIVE' FOR SHARE",[party.personal_account_id]);
  if(!account||!await A.one(tx,"SELECT id FROM party_memberships WHERE party_id=? AND account_id=? AND role_code='OWNER' AND current_status='ACTIVE' FOR SHARE",[party.id,account.id]))throw error('BUYER_IDENTITY_REQUIRED',409);
  const rows=(await tx.execute("SELECT id,object_version,identity_valid_until FROM artist_people WHERE owner_party_id=? AND current_status='ACTIVE' AND identity_status='VERIFIED' AND identity_valid_until>CURRENT_TIMESTAMP(3) ORDER BY id FOR SHARE",[party.id]))[0];
  if(!rows.length)throw error('BUYER_IDENTITY_REQUIRED',409);
  return {basis:'VERIFIED_PERSON',sources:rows.map(p=>({id:p.id,object_version:p.object_version,valid_until:A.instant(p.identity_valid_until)}))};
 }
 const D=require('../directory/context'),rows=(await tx.execute("SELECT * FROM directory_records WHERE kind='ORGANIZATION' AND owner_party_id=? AND current_status='APPROVED' ORDER BY id FOR SHARE",[party.id]))[0];
 for(const raw of rows){const r=D.checked(raw);if(r.data.review?.checks?.identity_verified!==true)continue;try{await D.usable(tx,r);return {basis:'REVIEWED_ORGANIZATION_PROFILE',sources:[{id:r.id,object_version:r.object_version,content_sha256:r.content_sha256,valid_until:r.data.profile.valid_until}]};}catch(e){if(![403,404,409].includes(e.status))throw e;}}
 throw error('BUYER_IDENTITY_REQUIRED',409);
}
async function current(tx,profile,city){
 if(profile.current_status!=='ACTIVE'||!profile.data.opt_in||profile.data.city!==city)throw error('BUYER_PROFILE_NOT_PUBLIC',409);
 const party=await A.activeParty(tx,profile.owner_party_id);return {party,identity:await identity(tx,party)};
}
function scoring(rows,config,personal){
 const fields=personal?['consumption_growth','completed_orders','verified_net_paid_minor']:['completed_orders','verified_net_paid_minor'],weights=personal?config.personal_weights:config.organization_weights;
 return {fields,weights:weights.slice(0,-1),maxima:fields.map(k=>Math.max(1,...rows.map(x=>x[k]))),compliance_weight:weights.at(-1),scout_priority:personal&&config.scout_priority,free_points_counted:false};
}
function sort(rows,config,personal){
 if(!config)return rows.sort((a,b)=>a.party_id.localeCompare(b.party_id));
 const b=scoring(rows,config,personal);
 return rows.map(x=>({...x,score:Math.round((b.fields.reduce((n,k,j)=>n+x[k]/b.maxima[j]*100*b.weights[j],0)+(x.compliance_clear?100:0)*b.compliance_weight)/10000*1000000)/1000000})).sort((a,c)=>(b.scout_priority?c.scout_level-a.scout_level:0)||c.score-a.score||a.party_id.localeCompare(c.party_id));
}
async function insertFrozen(tx,a,kind,owner,parent,status,data,source){
 try{return await C.insert(tx,a,kind,owner,parent,status,data,source);}
 catch(e){if(['CONTENT_TOO_COMPLEX','CONTENT_TOO_LARGE'].includes(e.code))throw error('RANKING_BATCH_REQUIRED',409);throw e;}
}
async function calculate(tx,city,rule){
 const at=await A.now(tx),profiles=(await tx.execute("SELECT * FROM engagement_records WHERE kind='BUYER_PROFILE' AND current_status='ACTIVE' AND JSON_UNQUOTE(JSON_EXTRACT(data_json,'$.city'))=? ORDER BY id LIMIT 501 FOR SHARE",[city]))[0].map(C.checked);if(profiles.length>500)throw error('RANKING_BATCH_REQUIRED',409);
 const items=[],evidence=[],risk=(await tx.execute("SELECT * FROM engagement_records WHERE kind='RISK_ORDER' AND current_status='EXCLUDED' ORDER BY id FOR SHARE"))[0].map(C.checked),bad=new Set(risk.map(x=>x.parent_id));
 for(const p of profiles){
  let state;try{state=await current(tx,p,city);}catch(e){if(![403,404,409].includes(e.status))throw e;continue;}const {party}=state;
  const orders=(await tx.execute("SELECT * FROM trade_records WHERE kind='ORDER' AND buyer_party_id=? ORDER BY id LIMIT 5001 FOR UPDATE",[party.id]))[0].map(require('../gigs/context').checked);if(orders.length>5000)throw error('RANKING_BATCH_REQUIRED',409);
  const facts=[];if(rule)for(const order of orders){const f=await F.fact(tx,order,rule.data.rule,at,{allowRefund:true});if(f)facts.push(f);}
  const valid=facts.filter(f=>!bad.has(f.order_id)),completed=valid.filter(f=>!f.refunded),lots=(await tx.execute("SELECT * FROM wallet_records WHERE owner_party_id=? AND kind='EARNING' AND current_status IN ('ISSUED','REVERSAL_PENDING') ORDER BY id LIMIT 5001 FOR SHARE",[party.id]))[0].map(require('../wallet/context').checked);if(lots.length>5000)throw error('RANKING_BATCH_REQUIRED',409);
  let growth=0;const growthSources=[];
  for(const lot of lots){if(lot.data.source_kind!=='CONSUMPTION'||!valid.some(f=>f.order_id===lot.data.order_id))continue;const amount=Math.max(0,lot.data.points-lot.data.growth_reversed);growth+=amount;growthSources.push({id:lot.id,object_version:lot.object_version,content_sha256:lot.content_sha256,order_id:lot.data.order_id,points:lot.data.points,growth_reversed:lot.data.growth_reversed,contribution:amount});}
  let scout=null;const noticeRule=await A.one(tx,"SELECT * FROM notice_records WHERE kind='RULE' AND current_status='EFFECTIVE' ORDER BY created_at DESC,id DESC LIMIT 1 FOR SHARE");
  if(noticeRule){try{scout=await require('../notices/context').qualification(tx,party.id,require('../notices/context').checked(noticeRule));}catch(e){if(![403,404,409].includes(e.status))throw e;}}
  else if(party.kind==='PERSON')scout=await require('../wallet/qualification').read(tx,party.id,at);
  items.push({party_id:party.id,party_kind:party.kind,consumption_growth:party.kind==='PERSON'?growth:null,completed_orders:completed.length,verified_net_paid_minor:valid.reduce((n,f)=>n+f.net_minor,0),scout_active:!!scout?.active,scout_level:scout?.active?scout.level:0,compliance_clear:!facts.some(f=>bad.has(f.order_id)),facts_available:!!rule});
  evidence.push({party_id:party.id,profile_id:p.id,profile_sha256:p.content_sha256,identity:state.identity,orders:facts.map(f=>({...f,excluded:bad.has(f.order_id),order_sha256:orders.find(o=>o.id===f.order_id).data_sha256})),growth_sources:growthSources,scout:{active:!!scout?.active,level:scout?.active?scout.level:0,source_ids:scout?.source_ids||[],notice_rule_id:noticeRule?.id||null},risk_records:risk.filter(x=>facts.some(f=>f.order_id===x.parent_id)).map(x=>({id:x.id,object_version:x.object_version,content_sha256:x.content_sha256,order_id:x.parent_id}))});
 }
 const config=rule?.data.rule.buyer_rank,result={city,personal:sort(items.filter(x=>x.party_kind==='PERSON'),config,true),organizations:sort(items.filter(x=>x.party_kind==='ORGANIZATION'),config,false),ranking_enabled:!!config,reason_code:config?null:'BUYER_RANK_RULE_NOT_CONFIGURED',rule_id:rule?.id||null,source:'VERIFIED_CONSUMPTION_ONLY',organization_wallet_enabled:false};
 return {at,result,evidence};
}
async function publicSnapshot(tx,snapshot){
 if(snapshot.kind!=='BUYER_RANK_SNAPSHOT'||snapshot.current_status!=='PUBLISHED')throw error('RANKING_UNAVAILABLE',404);
 const result=structuredClone(snapshot.data.result);
 for(const section of ['personal','organizations']){const visible=[];for(const row of result[section]){const raw=await A.one(tx,"SELECT * FROM engagement_records WHERE kind='BUYER_PROFILE' AND owner_party_id=? ORDER BY id LIMIT 1 FOR SHARE",[row.party_id]);if(!raw)continue;try{await current(tx,C.checked(raw),result.city);visible.push(row);}catch(e){if(![403,404,409].includes(e.status))throw e;}}result[section]=visible;}
 return {...result,snapshot_id:snapshot.id,snapshot_sha256:snapshot.content_sha256,as_of:snapshot.data.at,calculation_version:snapshot.data.calculation_version,traceability:'FROZEN_SNAPSHOT'};
}
function methods({db,actor,rankingPolicy}){return {
 async buyerCityRank(ctx,i){shape(i,['city']);label(i.city,100);return db.withTransaction(async tx=>{
  await actor(tx,ctx);const latest=await A.one(tx,"SELECT * FROM engagement_records WHERE kind='BUYER_RANK_SNAPSHOT' AND current_status='PUBLISHED' AND JSON_UNQUOTE(JSON_EXTRACT(data_json,'$.result.city'))=? ORDER BY created_at DESC,id DESC LIMIT 1 FOR SHARE",[i.city]);if(latest)return publicSnapshot(tx,C.checked(latest));
  const rawRule=await A.one(tx,"SELECT * FROM engagement_records WHERE kind='RULE' AND current_status='EFFECTIVE' ORDER BY created_at DESC,id DESC LIMIT 1 FOR SHARE"),r=await calculate(tx,i.city,rawRule?C.checked(rawRule):null);
  return {...r.result,snapshot_id:null,snapshot_sha256:null,as_of:r.at,calculation_version:VERSION,traceability:'LIVE_NOT_SAVED'};
 });},
 async buyerRankingSnapshot(ctx,i){shape(i,['city','rule_id','operation_key']);label(i.city,100);id(i.rule_id);return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await C.operator(tx,a,'ENGAGEMENT_REVIEW');return C.command(tx,a,'BUYER_RANK_SNAPSHOT',i,async()=>{
  const rule=await C.liveRule(tx,i.rule_id);require('./ranking-contract').required(rule.data.rule,rankingPolicy);if(!rule.data.rule.buyer_rank)throw error('BUYER_RANK_RULE_NOT_CONFIGURED',409);
  const {at,result,evidence}=await calculate(tx,i.city,rule),snapshot=await insertFrozen(tx,a,'BUYER_RANK_SNAPSHOT',null,rule.id,'PUBLISHED',{at,calculation_version:VERSION,result,rule_snapshot:rule});
  for(const e of evidence){const section=result.personal.some(x=>x.party_id===e.party_id)?'personal':'organizations',rows=result[section],rank=rows.findIndex(x=>x.party_id===e.party_id);await insertFrozen(tx,a,'BUYER_RANK_ENTRY',e.party_id,snapshot.id,'RECORDED',{snapshot_id:snapshot.id,snapshot_sha256:snapshot.content_sha256,city:i.city,at,calculation_version:VERSION,rule_id:rule.id,rule_sha256:rule.content_sha256,rank:rank+1,section,metrics:rows[rank],scoring:scoring(rows,rule.data.rule.buyer_rank,section==='personal'),evidence:e},[snapshot.id,e.party_id]);}
  return snapshot;
 });});},
 async buyerRanking(ctx,i){shape(i,['record_id']);return db.withTransaction(async tx=>{await actor(tx,ctx);return publicSnapshot(tx,await C.load(tx,i.record_id,'BUYER_RANK_SNAPSHOT','FOR SHARE'));});},
 async buyerRankingIndex(ctx,i){shape(i,['city','after','cursor','limit']);label(i.city,100);const limit=i.limit??20;if(!Number.isInteger(limit)||limit<1||limit>100)throw error('INVALID_LIMIT',400);if(i.after)id(i.after);return db.withTransaction(async tx=>{await actor(tx,ctx);const base="SELECT * FROM engagement_records WHERE kind='BUYER_RANK_SNAPSHOT' AND current_status='PUBLISHED' AND JSON_UNQUOTE(JSON_EXTRACT(data_json,'$.result.city'))=?";if(i.after&&!await A.one(tx,base+' AND id=?',[i.city,i.after]))throw error('INVALID_CURSOR',400);const rows=(await tx.execute(base+' AND id>? ORDER BY id LIMIT ?',[i.city,i.after||'',limit+1]))[0].map(C.checked);return {items:rows.slice(0,limit).map(r=>({id:r.id,city:i.city,at:r.data.at,rule_id:r.parent_id})),next_cursor:rows.length>limit?rows[limit-1].id:null};});}
};}
module.exports={methods};
