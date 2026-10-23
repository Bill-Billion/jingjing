 'use strict';
const {id,shape,label,error}=require('../party/policy'),A=require('../artists/context'),C=require('./context'),G=require('../gigs/context');
const ACTIONS=['COMMISSION_PRODUCTION','READ_PROFILE','MANAGE_AUDITIONS','COMMERCIAL_MESSAGES','READ_INCOME','MANAGE_LISTINGS'];
async function member(tx,a,party,personId,action){const p=await A.activeParty(tx,party);if(p.kind!=='ORGANIZATION')throw error('ARTIST_NOT_FOUND',404);if(!await A.one(tx,"SELECT party_id FROM party_capabilities WHERE party_id=? AND code='MCN' AND current_status='ACTIVE' FOR SHARE",[party]))throw error('MCN_CAPABILITY_REQUIRED',409);const m=await A.one(tx,"SELECT * FROM party_memberships WHERE party_id=? AND account_id=? AND current_status='ACTIVE' FOR SHARE",[id(party),a.id]);if(!m)throw error('MCN_EMPLOYEE_FORBIDDEN',403);if(m.role_code==='OWNER')return p;const at=await A.now(tx),grants=(await tx.execute("SELECT * FROM engagement_records WHERE kind='STAFF_GRANT' AND owner_party_id=? AND current_status='ACTIVE' FOR SHARE",[party]))[0].map(C.checked);if(!grants.some(r=>r.data.account_id===a.id&&r.data.valid_until>at&&r.data.actions.includes(action==='SUBMIT_LISTING'?'MANAGE_LISTINGS':action)&&(personId?r.data.person_ids.includes(personId):r.data.actions.includes('READ_INCOME'))))throw error('MCN_EMPLOYEE_SCOPE_REQUIRED',403);return p;}
async function org(tx,a,party){const p=await A.owner(tx,a,party);if(p.kind!=='ORGANIZATION')throw error('ARTIST_NOT_FOUND',404);if(!await A.one(tx,"SELECT party_id FROM party_capabilities WHERE party_id=? AND code='MCN' AND current_status='ACTIVE' FOR SHARE",[party]))throw error('MCN_CAPABILITY_REQUIRED',409);return p;}
async function delegated(tx,a,party,personId,action){await member(tx,a,party,personId,action);const p=await A.person(tx,personId);const [rows]=await tx.execute("SELECT * FROM artist_records WHERE kind='DELEGATION' AND person_id=? AND counterparty_id=? AND current_status='ACTIVE' FOR SHARE",[personId,party]);const now=await A.now(tx);for(const raw of rows){const r=A.checked(raw);if(require('../artists/policy').active(r.data,now)&&r.data.actions.includes(['COMMERCIAL_MESSAGES','READ_INCOME'].includes(action)?'READ_PROFILE':action)){await A.relation(tx,r,p,now);return p;}}throw error('ARTIST_DELEGATION_REQUIRED',403);}
function methods({db,actor}){return {
 async staffGrant(ctx,i){shape(i,['party_id','account_id','person_ids','actions','valid_until','operation_key']);id(i.account_id);require('../artists/policy').list(i.person_ids,id,100);if(!Array.isArray(i.actions)||!i.actions.length||new Set(i.actions).size!==i.actions.length||i.actions.some(x=>!ACTIONS.includes(x)))throw error('INVALID_STAFF_ACTIONS',400);require('../trade/policy').instant(i.valid_until);return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await org(tx,a,i.party_id);if(i.valid_until<=await A.now(tx)||!await A.one(tx,"SELECT id FROM party_memberships WHERE account_id=? AND party_id=? AND current_status='ACTIVE' FOR SHARE",[i.account_id,i.party_id]))throw error('MCN_ACTIVE_MEMBER_REQUIRED',409);for(const p of i.person_ids)await delegated(tx,a,i.party_id,p,'READ_PROFILE');return C.command(tx,a,'STAFF_GRANT',i,()=>C.insert(tx,a,'STAFF_GRANT',i.party_id,null,'ACTIVE',{account_id:i.account_id,person_ids:i.person_ids,actions:i.actions,valid_until:i.valid_until}));});},
 async revokeStaff(ctx,i){shape(i,['party_id','record_id','expected_version','reason','operation_key']);label(i.reason,2000);return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await org(tx,a,i.party_id);const r=await C.load(tx,i.record_id,'STAFF_GRANT');if(r.owner_party_id!==i.party_id)throw error('ENGAGEMENT_NOT_FOUND',404);return C.command(tx,a,'REVOKE_STAFF',i,async()=>{A.match(r,i.expected_version);return C.save(tx,a,r,'REVOKED',{...r.data,reason:i.reason},'STAFF_REVOKED');});});},
 async staffList(ctx,i){return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await org(tx,a,i.party_id);return {items:await C.rows(tx,i.party_id,'STAFF_GRANT')};});},
 async assign(ctx,i){shape(i,['party_id','booking_id','order_id','account_id','operation_key']);if(!!i.booking_id===!!i.order_id)throw error('ONE_BUSINESS_REFERENCE_REQUIRED',400);return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await org(tx,a,i.party_id);let person_id,reference,action;if(i.booking_id){const {r}=await require('../auditions/context').booking(tx,i.booking_id);person_id=r.data.offer.person_id;reference=r.id;action='MANAGE_AUDITIONS';}else{const o=await require('./facts').order(tx,i.order_id);if(o.data.quote.commercial?.relation?.mcn_party_id!==i.party_id)throw error('ENGAGEMENT_NOT_FOUND',404);const link=await A.one(tx,'SELECT person_id FROM artist_avatar_links WHERE avatar_id=?',[o.data.quote.commercial.avatar_id]);if(!link)throw error('ORDER_ARTIST_LINK_REQUIRED',409);person_id=link.person_id;reference=o.id;action='COMMERCIAL_MESSAGES';}await delegated(tx,a,i.party_id,person_id,action);const staff=await A.one(tx,'SELECT id,current_status FROM identity_accounts WHERE id=? FOR SHARE',[id(i.account_id)]);if(staff?.current_status!=='ACTIVE')throw error('ACCOUNT_NOT_ACTIVE',403);await delegated(tx,staff,i.party_id,person_id,action);return C.command(tx,a,'MCN_ASSIGN',i,async()=>{const old=await A.one(tx,"SELECT * FROM engagement_records WHERE kind='ASSIGNMENT' AND source_key=? FOR UPDATE",[require('../governance/content').digest(['ASSIGNMENT',[i.party_id,reference]])]);const data={booking_id:i.booking_id||null,order_id:i.order_id||null,person_id,account_id:staff.id,assigned_by:a.id,at:await A.now(tx)};return old?C.save(tx,a,C.checked(old),'ASSIGNED',data,'ORDER_REASSIGNED'):C.insert(tx,a,'ASSIGNMENT',i.party_id,null,'ASSIGNED',data,[i.party_id,reference]);});});},
 async mcnDashboard(ctx,i){return db.withTransaction(async tx=>{
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
  const assignments=(await C.rows(tx,i.party_id,'ASSIGNMENT')).filter(r=>owner||(r.current_status==='ASSIGNED'&&r.data.account_id===a.id&&people.has(r.data.person_id)));
  const assigned=new Map(assignments.filter(r=>r.data.order_id).map(r=>[r.data.order_id,r.data.person_id]));
  const [rows]=await tx.execute("SELECT * FROM trade_records WHERE kind='ORDER' AND (JSON_UNQUOTE(JSON_EXTRACT(data_json,'$.quote.marketplace_finance.allocation.mcn_party_id'))=? OR JSON_UNQUOTE(JSON_EXTRACT(data_json,'$.quote.commercial.relation.mcn_party_id'))=?) ORDER BY created_at,id LIMIT 500",[i.party_id,i.party_id]);
  const items=[];
  for(const raw of rows){
   // Check the live artist scope and actual assignment before calculating or returning money.
   if(!owner&&!assigned.has(raw.id))continue;
   const o=G.checked(raw);
   if(!owner){
    const avatar=o.data.quote.commercial?.avatar_id;
    const link=avatar?await A.one(tx,'SELECT person_id FROM artist_avatar_links WHERE avatar_id=? FOR SHARE',[avatar]):null;
    if(!link||link.person_id!==assigned.get(o.id)||!people.has(link.person_id))continue;
   }
   const f=await require('../gigs/settlement').financialFacts(tx,o),allocation=o.data.quote.marketplace_finance?.allocation;
   const value=allocation?require('../settlement/marketplace-policy').split(f.net_minor,allocation).entries.find(x=>x.role==='MCN')?.amount_minor:require('../gigs/policy').split(f.net_minor,o.data.quote.commercial.commission).mcn_minor;
   items.push({order_id:o.id,status:o.current_status,mcn_accrual_minor:value||0,environment:f.environment,meaning:'ACCRUAL_NOT_PAYOUT',contract_sha256:require('../governance/content').digest(o.data.contract)});
  }
  return {relations,assignments,orders:items,total_accrual_minor:items.filter(x=>x.environment==='PRODUCTION').reduce((s,x)=>s+x.mcn_accrual_minor,0),history_preserved:true,truncated:rows.length===500||rawRelations.length===500};
 });}

};}
module.exports={member,delegated,methods};
