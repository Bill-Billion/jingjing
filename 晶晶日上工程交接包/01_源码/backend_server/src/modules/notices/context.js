 'use strict';
const {randomUUID}=require('node:crypto');
const A=require('../artists/context'),P=require('./policy'),{digest}=require('../governance/content');
const {id,ref,error}=require('../party/policy');
const {authorizeOperator}=require('../governance/operator-access');
function checked(r){if(!r)throw error('NOTICE_NOT_FOUND',404);const data=A.parse(r.data_json);if(digest(data)!==r.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);return {id:r.id,kind:r.kind,owner_party_id:r.owner_party_id,counterparty_id:r.counterparty_id,parent_id:r.parent_id,created_by:r.created_by,current_status:r.current_status,object_version:r.object_version,content_sha256:r.data_sha256,data};}
async function load(tx,key,kind=null,lock='FOR UPDATE'){const r=checked(await A.one(tx,'SELECT * FROM notice_records WHERE id=? '+lock,[id(key)]));if(kind&&r.kind!==kind)throw error('NOTICE_NOT_FOUND',404);return r;}
async function operator(tx,a,action,r=null,independent=false){if(!await authorizeOperator(tx,{account_id:a.id,action}))throw error('NOTICE_OPERATOR_FORBIDDEN',403);if(independent&&r&&(r.created_by===a.id||await A.one(tx,"SELECT id FROM party_memberships WHERE account_id=? AND current_status='ACTIVE' AND party_id IN (?,?)",[a.id,r.owner_party_id,r.counterparty_id])))throw error('SELF_REVIEW_FORBIDDEN',403);}
async function audit(tx,a,r,event){const eventId=randomUUID();await tx.execute('INSERT INTO notice_audit(id,record_id,actor_account_id,event_code,object_version,data_sha256,request_ref) VALUES (?,?,?,?,?,?,?)',[eventId,r.id,a.id,event,r.object_version,r.content_sha256,a.request_id]);if(['SUBMISSION','CASE'].includes(r.kind))await require('../operations/events').publishEvent(tx,{domain:'NOTICES',record_id:r.id,event_id:eventId,event_code:event,object_version:r.object_version,actor_account_id:a.id});}
async function insert(tx,a,kind,owner,counter,parent,status,data){const r={id:randomUUID(),kind,owner_party_id:owner,counterparty_id:counter,parent_id:parent,created_by:a.id,current_status:status,object_version:1,content_sha256:digest(data),data};await tx.execute('INSERT INTO notice_records(id,kind,owner_party_id,counterparty_id,parent_id,created_by,current_status,data_json,data_sha256) VALUES (?,?,?,?,?,?,?,?,?)',[r.id,kind,owner,counter,parent,a.id,status,JSON.stringify(data),r.content_sha256]);await audit(tx,a,r,kind+'_CREATED');return r;}
async function save(tx,a,r,status,data,event){const n={...r,current_status:status,object_version:r.object_version+1,content_sha256:digest(data),data};await tx.execute('UPDATE notice_records SET current_status=?,object_version=?,data_json=?,data_sha256=? WHERE id=?',[status,n.object_version,JSON.stringify(data),n.content_sha256,r.id]);await audit(tx,a,n,event);return n;}
async function command(tx,a,op,i,fn){const key=digest([a.id,op,ref(i.operation_key)]),hash=digest(i);try{await tx.execute('INSERT INTO notice_commands(id,fingerprint) VALUES (?,?)',[key,hash]);}catch(e){if(e.code!=='ER_DUP_ENTRY')throw e;const old=await A.one(tx,'SELECT * FROM notice_commands WHERE id=?',[key]);if(old.fingerprint!==hash)throw error('IDEMPOTENCY_CONFLICT',409);if(!old.result_json)throw error('IDEMPOTENCY_IN_PROGRESS',409);if(A.sha(old.result_json)!==old.result_sha256)throw error('STORED_CONTENT_MISMATCH',503);return JSON.parse(old.result_json);}const r=await fn(),text=JSON.stringify(r);await tx.execute('UPDATE notice_commands SET result_json=?,result_sha256=? WHERE id=?',[text,A.sha(text),key]);return r;}
async function liveRule(tx,key){const r=await load(tx,key,'RULE','FOR SHARE');if(r.current_status!=='EFFECTIVE')throw error('NOTICE_RULE_NOT_EFFECTIVE',409);return r;}
async function verifiedPerson(tx,party){const rows=(await tx.execute('SELECT * FROM artist_people WHERE owner_party_id=? FOR SHARE',[party]))[0];const at=await A.now(tx);for(const raw of rows){const p={...raw,identity_valid_until:A.instant(raw.identity_valid_until)};try{require('../artists/policy').adult(p,at);return p;}catch(e){if(e.status>=500)throw e;}}throw error('NOTICE_VERIFIED_ADULT_REQUIRED',409);}
async function qualification(tx,party,rule){
 const p=await A.activeParty(tx,party),now=await A.now(tx);
 if(p.kind==='PERSON')await verifiedPerson(tx,party);
 const rows=(await tx.execute("SELECT * FROM notice_records WHERE owner_party_id=? AND kind IN ('QUALIFICATION','FACT') AND current_status='APPROVED' FOR SHARE",[party]))[0].map(checked);
 if(p.kind==='ORGANIZATION'){const q=rows.filter(r=>r.kind==='QUALIFICATION'&&r.data.valid_from<=now&&now<r.data.valid_until);return {active:q.length>0,level:0,types:[...new Set(q.flatMap(r=>r.data.types))],source_ids:q.map(r=>r.id),reason:q.length?null:'ORGANIZATION_QUALIFICATION_REQUIRED'};}
 const facts=rows.filter(r=>r.kind==='FACT');const legacy={...P.scout(rule.data.rule,facts.map(r=>r.data),now),source_ids:facts.map(r=>r.id)};const W=require('../wallet/qualification'),chosen=W.choose(legacy,await W.read(tx,party,now));const q={active:chosen.active,level:chosen.level,valid_until:chosen.valid_until,reason:chosen.reason};
 return {...q,types:q.active?P.TYPES.filter(t=>rule.data.rule.minimum_levels[t]!==null&&q.level>=rule.data.rule.minimum_levels[t]):[],source_ids:chosen.source_ids};
}
async function publisher(tx,r){const rule=await liveRule(tx,r.data.rule_id);if(r.data.notice.type==='OFFICIAL'){await operator(tx,{id:r.created_by},'NOTICE_OFFICIAL');return {official:true};}const q=await qualification(tx,r.owner_party_id,rule);if(!q.active||!q.types.includes(r.data.notice.type))throw error('NOTICE_PUBLISHER_NOT_ELIGIBLE',409);return q;}
async function liveNotice(tx,key){await require('../privacy/restrictions').assertUnrestricted(tx,'NOTICE',key);const r=await load(tx,key,'NOTICE','FOR SHARE'),now=await A.now(tx);if(r.current_status!=='PUBLISHED'||r.data.notice.valid_from>now||r.data.notice.valid_until<=now)throw error('NOTICE_NOT_OPEN',409);await publisher(tx,r);return r;}
async function artist(tx,a,s,acting,action='SUBMIT_COOPERATION'){
 const p=await A.person(tx,s.person_id);require('../artists/policy').adult(p,await A.now(tx));await A.authorize(tx,a,p,acting,action);await A.avatar(tx,s.avatar_id,p);return p;
}
async function rights(tx,s,receiver){const p=await A.person(tx,s.person_id),now=await A.now(tx);require('../artists/policy').adult(p,now);await A.avatar(tx,s.avatar_id,p);const c=await A.load(tx,s.consent_id,'CONSENT');if(c.person_id!==p.id||c.avatar_id!==s.avatar_id||c.current_status!=='APPROVED'||!c.data.purposes.includes('COOPERATION_SUBMISSION')||c.data.grantee_party_id!==receiver||!require('../artists/policy').active(c.data,now))throw error('NOTICE_SUBMISSION_CONSENT_REQUIRED',409);return c;}
async function access(tx,a,r,party){
 if(!party){await operator(tx,a,['FACT'].includes(r.kind)?'FINANCE_REVIEW':r.kind==='CASE'?'NOTICE_SUPPORT':'NOTICE_REVIEW');return;}
 await A.owner(tx,a,party);if(![r.owner_party_id,r.counterparty_id].includes(party))throw error('NOTICE_NOT_FOUND',404);
 if(r.kind==='SUBMISSION'){
  if(party===r.counterparty_id&&['IN_REVIEW','REJECTED'].includes(r.current_status))throw error('NOTICE_NOT_FOUND',404);
  const s=r.data.submission;if(party===r.counterparty_id&&s.kind!=='INVITATION'){try{await rights(tx,s,r.counterparty_id);await artist(tx,{id:r.created_by},s,r.owner_party_id);}catch(e){if([403,404,409].includes(e.status))throw error('NOTICE_NOT_FOUND',404);throw e;}}if(s.kind!=='INVITATION'&&party===r.owner_party_id)await artist(tx,a,s,party);
  if(s.kind==='INVITATION'&&party===r.counterparty_id)await artist(tx,a,s,party);
 }
 if(r.kind==='CASE'){const s=await load(tx,r.parent_id,'SUBMISSION','FOR SHARE');await access(tx,a,s,party);}
}
async function inviter(tx,party,ruleId){
 const p=await A.activeParty(tx,party);
 if(p.kind==='PERSON')return verifiedPerson(tx,party);
 const q=await qualification(tx,party,await liveRule(tx,ruleId));
 if(!q.active)throw error('NOTICE_RECEIVER_NOT_ELIGIBLE',409);
 return q;
}
async function currentSubmission(tx,r){const s=r.data.submission,at=await A.now(tx);if(r.data.expires_at<=at)throw error('NOTICE_SUBMISSION_EXPIRED',409);if(s.notice_id){const n=await liveNotice(tx,s.notice_id);if(!n.data.notice.accept_submissions||n.owner_party_id!==s.target_party_id)throw error('NOTICE_NOT_OPEN',409);}else if(s.kind!=='INVITATION'){const q=await qualification(tx,s.target_party_id,await liveRule(tx,r.data.rule_id));if(!q.active)throw error('NOTICE_RECEIVER_NOT_ELIGIBLE',409);}
 if(s.kind!=='INVITATION'){await artist(tx,{id:r.created_by},s,r.owner_party_id);await rights(tx,s,r.counterparty_id);}else {await inviter(tx,r.owner_party_id,r.data.rule_id);if(s.source_listing_id){const {p:publicPerson,r:publicListing}=await require('../artists/public-access').loadPublicListing(tx,s.source_listing_id);if(publicPerson.id!==s.person_id||publicPerson.owner_party_id!==s.target_party_id||publicListing.avatar_id!==s.avatar_id||publicListing.data.consent_id!==s.consent_id)throw error('NOTICE_TARGET_MISMATCH',409);}const p=await A.person(tx,s.person_id);if(p.owner_party_id!==r.counterparty_id)throw error('NOTICE_TARGET_MISMATCH',409);require('../artists/policy').adult(p,at);await A.avatar(tx,s.avatar_id,p);const c=await A.load(tx,s.consent_id,'CONSENT');if(c.person_id!==p.id||c.avatar_id!==s.avatar_id||c.current_status!=='APPROVED'||!c.data.purposes.includes('PUBLIC_DISPLAY')||!require('../artists/policy').active(c.data,at))throw error('NOTICE_ARTIST_NOT_PUBLIC',409);}
 if(s.material_asset_ids.length)await A.assets(tx,s.material_asset_ids,r.owner_party_id,['AVATAR_MATERIAL','WORK_CONTENT']);
}
// Used by the existing quote-confirmation transaction. No new order/payment path.
async function checkQuoteAcceptance(tx,q){
 const link=await A.one(tx,'SELECT submission_id,case_id FROM notice_links WHERE quote_id=?',[q.id]);
 if(!link)return;
 const s=await load(tx,link.submission_id,'SUBMISSION'),c=await load(tx,link.case_id,'CASE');
 if(s.current_status!=='INTERESTED'||c.current_status!=='LINKED'||c.data.quote.content_sha256!==q.content_sha256)throw error('NOTICE_COOPERATION_WITHDRAWN',409);
 await currentSubmission(tx,s);
}
module.exports={inviter,checkQuoteAcceptance,checked,load,operator,audit,insert,save,command,liveRule,verifiedPerson,qualification,publisher,liveNotice,artist,rights,access,currentSubmission};
