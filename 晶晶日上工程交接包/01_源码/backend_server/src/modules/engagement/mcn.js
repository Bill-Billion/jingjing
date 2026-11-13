 'use strict';
const {id,shape,label,error}=require('../party/policy'),A=require('../artists/context'),C=require('./context'),G=require('../gigs/context');
const ACTIONS=['COMMISSION_PRODUCTION','READ_PROFILE','MANAGE_AUDITIONS','MANAGE_MATERIALS','COMMERCIAL_MESSAGES','READ_INCOME','MANAGE_LISTINGS'];
async function member(tx,a,party,personId,action){const p=await A.activeParty(tx,party);if(p.kind!=='ORGANIZATION')throw error('ARTIST_NOT_FOUND',404);if(!await A.one(tx,"SELECT party_id FROM party_capabilities WHERE party_id=? AND code='MCN' AND current_status='ACTIVE' FOR SHARE",[party]))throw error('MCN_CAPABILITY_REQUIRED',409);const m=await A.one(tx,"SELECT * FROM party_memberships WHERE party_id=? AND account_id=? AND current_status='ACTIVE' FOR SHARE",[id(party),a.id]);if(!m)throw error('MCN_EMPLOYEE_FORBIDDEN',403);if(m.role_code==='OWNER')return p;const at=await A.now(tx),grants=(await tx.execute("SELECT g.* FROM engagement_records g WHERE g.kind='STAFF_GRANT' AND g.owner_party_id=? AND g.current_status='ACTIVE' AND NOT EXISTS (SELECT 1 FROM party_audit_events e WHERE e.party_id=g.owner_party_id AND e.object_id=? AND e.event_code='MEMBER_REMOVED' AND e.created_at>=g.created_at) FOR SHARE",[party,m.id]))[0].map(C.checked);if(!grants.some(r=>r.data.account_id===a.id&&r.data.valid_until>at&&r.data.actions.includes(action==='SUBMIT_LISTING'?'MANAGE_LISTINGS':action)&&(personId?r.data.person_ids.includes(personId):r.data.actions.includes('READ_INCOME'))))throw error('MCN_EMPLOYEE_SCOPE_REQUIRED',403);return p;}
async function org(tx,a,party){const p=await A.owner(tx,a,party);if(p.kind!=='ORGANIZATION')throw error('ARTIST_NOT_FOUND',404);if(!await A.one(tx,"SELECT party_id FROM party_capabilities WHERE party_id=? AND code='MCN' AND current_status='ACTIVE' FOR SHARE",[party]))throw error('MCN_CAPABILITY_REQUIRED',409);return p;}
async function delegated(tx,a,party,personId,action){await member(tx,a,party,personId,action);const p=await A.person(tx,personId);const [rows]=await tx.execute("SELECT * FROM artist_records WHERE kind='DELEGATION' AND person_id=? AND counterparty_id=? AND current_status='ACTIVE' FOR SHARE",[personId,party]);const now=await A.now(tx);for(const raw of rows){const r=A.checked(raw);if(require('../artists/policy').active(r.data,now)&&r.data.actions.includes(['COMMERCIAL_MESSAGES','READ_INCOME'].includes(action)?'READ_PROFILE':action)){await A.relation(tx,r,p,now);return p;}}throw error('ARTIST_DELEGATION_REQUIRED',403);}
// Membership removal must revoke old business grants atomically; the read guard also rejects legacy stale grants.
async function revokeMemberGrants(tx,a,party,accountId){
 const [rows]=await tx.execute("SELECT * FROM engagement_records WHERE kind='STAFF_GRANT' AND owner_party_id=? AND current_status='ACTIVE' AND JSON_UNQUOTE(JSON_EXTRACT(data_json,'$.account_id'))=? ORDER BY id FOR UPDATE",[party,accountId]);
 for(const raw of rows){const r=C.checked(raw);await C.save(tx,a,r,'REVOKED',{...r.data,reason:'机构成员身份已移除，重新入职须重新明确授权'},'STAFF_REVOKED');}
}
function assignmentPeople(r){return r.data.person_ids||[r.data.person_id].filter(Boolean);}
async function assignmentTarget(tx,party,i){
 if(!!i.booking_id===!!i.order_id)throw error('ONE_BUSINESS_REFERENCE_REQUIRED',400);
 if(i.booking_id){const {r}=await require('../auditions/context').booking(tx,id(i.booking_id));return {reference:r.id,person_ids:[r.data.offer.person_id],action:'MANAGE_AUDITIONS'};}
 const o=await require('./facts').order(tx,id(i.order_id));
 if(o.data.quote.stock_video){
  if(o.data.quote.marketplace_finance?.allocation?.mcn_party_id!==party)throw error('ENGAGEMENT_NOT_FOUND',404);
  const who=await require('./income-attribution').attribution(tx,o);
  if(!who.person_ids.length)throw error('ORDER_ARTIST_LINK_REQUIRED',409);
  return {reference:o.id,person_ids:who.person_ids,action:'SUBMIT_LISTING'};
 }
 if(o.data.quote.commercial?.relation?.mcn_party_id!==party)throw error('ENGAGEMENT_NOT_FOUND',404);
 const link=await A.one(tx,'SELECT person_id FROM artist_avatar_links WHERE avatar_id=? FOR SHARE',[o.data.quote.commercial.avatar_id]);
 if(!link)throw error('ORDER_ARTIST_LINK_REQUIRED',409);
 return {reference:o.id,person_ids:[link.person_id],action:'COMMERCIAL_MESSAGES'};
}
function methods({db,actor}){return {
 async staffGrant(ctx,i){shape(i,['party_id','account_id','person_ids','actions','valid_until','operation_key']);id(i.account_id);require('../artists/policy').list(i.person_ids,id,100);if(!Array.isArray(i.actions)||!i.actions.length||new Set(i.actions).size!==i.actions.length||i.actions.some(x=>!ACTIONS.includes(x)))throw error('INVALID_STAFF_ACTIONS',400);require('../trade/policy').instant(i.valid_until);return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await org(tx,a,i.party_id);if(i.valid_until<=await A.now(tx)||!await A.one(tx,"SELECT id FROM party_memberships WHERE account_id=? AND party_id=? AND current_status='ACTIVE' FOR SHARE",[i.account_id,i.party_id]))throw error('MCN_ACTIVE_MEMBER_REQUIRED',409);for(const p of i.person_ids)await delegated(tx,a,i.party_id,p,'READ_PROFILE');return C.command(tx,a,'STAFF_GRANT',i,()=>C.insert(tx,a,'STAFF_GRANT',i.party_id,null,'ACTIVE',{account_id:i.account_id,person_ids:i.person_ids,actions:i.actions,valid_until:i.valid_until}));});},
 async revokeStaff(ctx,i){shape(i,['party_id','record_id','expected_version','reason','operation_key']);label(i.reason,2000);return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await org(tx,a,i.party_id);const r=await C.load(tx,i.record_id,'STAFF_GRANT');if(r.owner_party_id!==i.party_id)throw error('ENGAGEMENT_NOT_FOUND',404);return C.command(tx,a,'REVOKE_STAFF',i,async()=>{A.match(r,i.expected_version);return C.save(tx,a,r,'REVOKED',{...r.data,reason:i.reason},'STAFF_REVOKED');});});},
 async staffList(ctx,i){return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await org(tx,a,i.party_id);return {items:await C.rows(tx,i.party_id,'STAFF_GRANT')};});},
 async assign(ctx,i){
  shape(i,['party_id','booking_id','order_id','account_id','operation_key']);
  return db.withTransaction(async tx=>{
   const a=await actor(tx,ctx);await org(tx,a,i.party_id);
   const {reference,person_ids,action}=await assignmentTarget(tx,i.party_id,i);
   for(const person of person_ids)await delegated(tx,a,i.party_id,person,action);
   const staff=await A.one(tx,'SELECT id,current_status FROM identity_accounts WHERE id=? FOR SHARE',[id(i.account_id)]);
   if(staff?.current_status!=='ACTIVE')throw error('ACCOUNT_NOT_ACTIVE',403);
   for(const person of person_ids)await delegated(tx,staff,i.party_id,person,action);
   return C.command(tx,a,'MCN_ASSIGN',i,async()=>{
    const old=await A.one(tx,"SELECT * FROM engagement_records WHERE kind='ASSIGNMENT' AND source_key=? FOR UPDATE",[require('../governance/content').digest(['ASSIGNMENT',[i.party_id,reference]])]);
    const data={booking_id:i.booking_id||null,order_id:i.order_id||null,person_id:person_ids.length===1?person_ids[0]:null,person_ids,account_id:staff.id,assigned_by:a.id,at:await A.now(tx)};
    return old?C.save(tx,a,C.checked(old),'ASSIGNED',data,'ORDER_REASSIGNED'):C.insert(tx,a,'ASSIGNMENT',i.party_id,null,'ASSIGNED',data,[i.party_id,reference]);
   });
  });
 },
 async mcnDashboard(ctx,i){
  shape(i,['party_id','person_id','order_id','created_from','created_before']);
  for(const k of ['person_id','order_id'])if(i[k]!==undefined)id(i[k]);
  for(const k of ['created_from','created_before'])if(i[k]!==undefined)require('../trade/policy').instant(i[k]);
  if(i.created_from&&i.created_before&&i.created_from>=i.created_before)throw error('INVALID_REPORT_PERIOD',400);
  return db.withTransaction(async tx=>{
  const a=await actor(tx,ctx);await member(tx,a,i.party_id,null,'READ_INCOME');
  const owner=await A.one(tx,"SELECT id FROM party_memberships WHERE party_id=? AND account_id=? AND role_code='OWNER' AND current_status='ACTIVE'",[i.party_id,a.id]);
  const people=new Map();
  if(!owner){
   const at=await A.now(tx),grants=await C.rows(tx,i.party_id,'STAFF_GRANT');
   const ids=new Set(grants.filter(r=>r.current_status==='ACTIVE'&&r.data.account_id===a.id&&r.data.valid_until>at&&r.data.actions.includes('READ_INCOME')).flatMap(r=>r.data.person_ids));
   for(const personId of ids){
    try{const p=await delegated(tx,a,i.party_id,personId,'READ_INCOME');if(p.current_status!=='ACTIVE')continue;await A.activeParty(tx,p.owner_party_id);people.set(p.id,p.owner_party_id);}
    catch(e){if(![403,404,409].includes(e.status))throw e;}
   }
  }
  const rawRelations=(await tx.execute("SELECT * FROM gig_records WHERE kind='RELATION' AND owner_party_id=? ORDER BY created_at,id LIMIT 500",[id(i.party_id)]))[0].map(G.dto);
  const relations=owner?rawRelations:rawRelations.filter(r=>new Set(people.values()).has(r.counterparty_id));
  const assignments=(await C.rows(tx,i.party_id,'ASSIGNMENT')).filter(r=>owner||(r.current_status==='ASSIGNED'&&r.data.account_id===a.id&&assignmentPeople(r).length>0&&assignmentPeople(r).every(p=>people.has(p))));
  const assigned=assignments.filter(r=>r.current_status==='ASSIGNED');
  const filters=[],params=[i.party_id,i.party_id];
  if(i.order_id){filters.push('t.id=?');params.push(i.order_id);}
  if(i.person_id){
   filters.push("(JSON_UNQUOTE(JSON_EXTRACT(t.data_json,'$.quote.audition.person_id'))=? OR EXISTS (SELECT 1 FROM stock_purchases p WHERE p.order_id=t.id AND JSON_CONTAINS(JSON_EXTRACT(p.data_json,'$.listing_snapshot.participants'),JSON_OBJECT('person_id',?))) OR EXISTS (SELECT 1 FROM artist_avatar_links l WHERE l.avatar_id=JSON_UNQUOTE(JSON_EXTRACT(t.data_json,'$.quote.commercial.avatar_id')) AND l.person_id=?))");params.push(i.person_id,i.person_id,i.person_id);
  }
  for(const [field,op] of [['created_from','>='],['created_before','<']])if(i[field]){filters.push('t.created_at'+op+'?');params.push(i[field].replace('T',' ').replace('Z',''));}
  // Select business orders once, never join assignment rows into monetary aggregates.
  const [rows]=await tx.execute("SELECT t.* FROM trade_records t WHERE t.kind='ORDER' AND (JSON_UNQUOTE(JSON_EXTRACT(t.data_json,'$.quote.marketplace_finance.allocation.mcn_party_id'))=? OR JSON_UNQUOTE(JSON_EXTRACT(t.data_json,'$.quote.commercial.relation.mcn_party_id'))=?)"+(filters.length?' AND '+filters.join(' AND '):'')+' ORDER BY t.created_at,t.id LIMIT 500',params);
  const items=[];
  for(const raw of rows){
   // Financial facts are returned only for an assigned record whose entire artist scope remains valid.
   const o=G.checked(raw),who=await require('./income-attribution').attribution(tx,o);
   if(i.person_id&&!who.person_ids.includes(i.person_id))continue;
   if(!owner){
    if(!who.person_ids.length||!who.person_ids.every(p=>people.has(p)))continue;
    if(!assigned.some(r=>assignmentPeople(r).some(p=>who.person_ids.includes(p))&&(r.data.order_id===o.id||(who.booking_id&&r.data.booking_id===who.booking_id))))continue;
   }
   const audition=await require('./income-attribution').auditionResult(tx,o,who);
   const f=await require('../gigs/settlement').financialFacts(tx,o),allocation=o.data.quote.marketplace_finance?.allocation;
   const mcn=amount=>allocation?require('../settlement/marketplace-policy').split(amount,allocation).entries.find(x=>x.role==='MCN')?.amount_minor:require('../gigs/policy').split(amount,o.data.quote.commercial.commission).mcn_minor;
   items.push({order_id:o.id,person_id:who.person_ids.length===1?who.person_ids[0]:null,person_ids:who.person_ids,attribution_basis:who.attribution_basis,business_type:who.business_type,audition,created_at:new Date(o.created_at.replace(' ','T')+'Z').toISOString(),status:o.current_status,order_quoted_minor:o.data.quote.total_minor,order_received_minor:f.received_minor,order_refunded_minor:f.refunded_minor,order_net_minor:f.net_minor,mcn_expected_minor:mcn(o.data.quote.total_minor)||0,mcn_accrual_minor:mcn(f.net_minor)||0,environment:f.environment,meaning:'ACCRUAL_NOT_PAYOUT',contract_sha256:require('../governance/content').digest(o.data.contract)});
  }
  const production=items.filter(x=>x.environment==='PRODUCTION'),sum=field=>require('../trade/policy').sum(production.map(x=>x[field]));
  return {relations,assignments,orders:items,total_accrual_minor:sum('mcn_accrual_minor'),total_mcn_expected_minor:sum('mcn_expected_minor'),total_order_quoted_minor:sum('order_quoted_minor'),total_order_received_minor:sum('order_received_minor'),total_order_refunded_minor:sum('order_refunded_minor'),total_order_net_minor:sum('order_net_minor'),period_basis:'ORDER_CREATED_AT_UTC',amount_basis:'ORDER_LIFETIME_AT_QUERY',total_basis:'VERIFIED_PRODUCTION_ORDERS',history_preserved:true,truncated:rows.length===500||rawRelations.length===500};
 });}

};}
module.exports={member,delegated,revokeMemberGrants,assignmentTarget,methods};
