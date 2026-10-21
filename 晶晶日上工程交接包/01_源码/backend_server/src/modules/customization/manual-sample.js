"use strict";
const {shape,id,label,error}=require('../party/policy'),{digest}=require('../governance/content');
const A=require('../artists/context'),F=require('../production/customization-state'),P=require('../production/customization-policy');
async function load(tx,requestId,lock='FOR SHARE'){
 const r=await A.one(tx,'SELECT * FROM manual_sample_requests WHERE request_id=? '+lock,[id(requestId)]);if(!r)return null;
 const data=A.parse(r.data_json);if(digest(data)!==r.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);
 return {request_id:r.request_id,object_version:r.object_version,content_sha256:r.data_sha256,data};
}
async function authority(tx,a,d){const p=await A.person(tx,d.cast.cast[0].person_id);await A.authorize(tx,a,p,d.commissioner_party_id,'COMMISSION_PRODUCTION');return p;}
async function rights(tx,d,{delegation=true}={}){
 const c=d.cast.cast[0],person=await A.person(tx,c.person_id);require('../artists/policy').adult(person,await A.now(tx));
 if(person.owner_party_id!==d.rights_owner_party_id)throw error('MANUAL_SAMPLE_OWNER_MISMATCH',409);
 await A.activeParty(tx,d.commissioner_party_id);await A.activeParty(tx,d.merchant_party_id);
 await F.validateCast(tx,{data:{producer_party_id:d.merchant_party_id,territory:d.territory}},{...d,...d.cast});
 for(const [key,feature,kind] of [['look_version_id','FACE','LOOK'],['voice_version_id','VOICE','VOICE']]){if(c[key]===null)continue;
  const variant=await A.load(tx,c[key],kind),consent=await A.load(tx,variant.data.consent_id,'CONSENT');
  if(consent.current_status!=='APPROVED'||consent.person_id!==person.id||consent.avatar_id!==c.avatar_id||consent.data.grantee_party_id!==person.owner_party_id||!consent.data.features.includes(feature)||!consent.data.purposes.includes('PRIVATE_ARCHIVE')||!require('../artists/policy').active(consent.data,await A.now(tx)))throw error('MANUAL_SAMPLE_VARIANT_CONSENT_REQUIRED',409);
 }
 if(delegation&&d.commissioner_party_id!==person.owner_party_id){const rows=(await tx.execute("SELECT * FROM artist_records WHERE person_id=? AND kind='DELEGATION' AND counterparty_id=? AND current_status='ACTIVE' FOR SHARE",[person.id,d.commissioner_party_id]))[0];let allowed=false;
  for(const row of rows){const r=A.checked(row);if(r.data.actions.includes('COMMISSION_PRODUCTION')&&require('../artists/policy').active(r.data,await A.now(tx))){await A.relation(tx,r,person,await A.now(tx));allowed=true;}}
  if(!allowed)throw error('ARTIST_DELEGATION_REQUIRED',403);
 }
 return person;
}
async function quote(tx,source,buyer,merchant,type){const r=source?await load(tx,source.request_id):null;
 if(type!=='MANUAL_SAMPLE'){if(r)throw error('MANUAL_SAMPLE_PRODUCT_REQUIRED',409);return null;}
 if(!r||!r.data.confirmation)throw error('MANUAL_SAMPLE_CONFIRMATION_REQUIRED',409);const d=r.data;
 if(d.submission_id!==source.submission_id||d.submission_sha256!==source.content_sha256||d.commissioner_party_id!==buyer||d.merchant_party_id!==merchant)throw error('MANUAL_SAMPLE_SOURCE_CHANGED',409);
 await rights(tx,d);return {request_id:r.request_id,content_sha256:r.content_sha256,...d};
}
async function checkOrder(tx,o,options={}){const d=o.data.quote.manual_sample;if(!d)return null;
 const r=await load(tx,d.request_id);if(!r||r.content_sha256!==d.content_sha256)throw error('MANUAL_SAMPLE_SOURCE_CHANGED',409);await rights(tx,d,options);return d;
}
function methods(H){const {db,actor,member,load:request,creator,match,command,detail,audit}=H;
 async function view(tx,a,r,party){if(party===r.data.rights_owner_party_id){await A.self(tx,a,await A.person(tx,r.data.cast.cast[0].person_id),party);}else if(party===r.data.commissioner_party_id){await authority(tx,a,r.data);}else if(party===r.data.merchant_party_id){await A.owner(tx,a,party);if(!await require('../governance/operator-access').authorizeOperator(tx,{account_id:a.id,action:'CUSTOMIZATION_INTAKE'}))throw error('CUSTOMIZATION_FORBIDDEN');}else throw error('CUSTOMIZATION_NOT_FOUND',404);return r;}
 return {
 async bindManualSample(ctx,i){shape(i,['request_id','party_id','expected_version','cast','merchant_party_id','territory','terms','operation_key']);label(i.terms,8000);label(i.territory,100);id(i.merchant_party_id);
  const roster=P.cast(i.cast,i.cast?.cast?.map(c=>c.supply_consent_id)||[]);if(roster.cast.length!==1)throw error('MANUAL_SAMPLE_ONE_ARTIST_REQUIRED',400);
  return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await member(tx,a,i.party_id);const q=await request(tx,i.request_id,'FOR UPDATE');creator(a,q,i.party_id);
   return command(tx,a,'MANUAL_SAMPLE_BIND',q.id,i,async()=>{match(q,i.expected_version);await require('./trade-context').assertUnordered(tx,q.id);if(q.current_status!=='INTAKE')throw error('CUSTOMIZATION_NOT_QUOTABLE',409);
    const s=(await detail(tx,q)).submission,person=await A.person(tx,roster.cast[0].person_id);
    const d={request_id:q.id,submission_id:s.id,submission_sha256:s.content_sha256,commissioner_party_id:i.party_id,rights_owner_party_id:person.owner_party_id,merchant_party_id:i.merchant_party_id,territory:i.territory,terms:i.terms,ownership:'ARTIST_RETAINS_OWNERSHIP',cast:roster,confirmation:null};
    await authority(tx,a,d);await rights(tx,d);const old=await load(tx,q.id,'FOR UPDATE');const v=(old?.object_version||0)+1;
    await tx.execute('INSERT INTO manual_sample_requests(request_id,object_version,data_json,data_sha256) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE object_version=VALUES(object_version),data_json=VALUES(data_json),data_sha256=VALUES(data_sha256)',[q.id,v,JSON.stringify(d),digest(d)]);
    await tx.execute('UPDATE customization_requests SET object_version=object_version+1 WHERE id=?',[q.id]);await audit(tx,a,{request_id:q.id,event_code:'MANUAL_SAMPLE_BOUND',object_version:v,content_sha256:digest(d)});return load(tx,q.id);
   });});
 },
 async confirmManualSample(ctx,i){shape(i,['request_id','party_id','expected_version','content_sha256','operation_key']);return db.withTransaction(async tx=>{const a=await actor(tx,ctx),q=await request(tx,i.request_id,'FOR UPDATE'),r=await load(tx,q.id,'FOR UPDATE');if(!r)throw error('CUSTOMIZATION_NOT_FOUND',404);const person=await rights(tx,r.data);await A.self(tx,a,person,i.party_id);
  return command(tx,a,'MANUAL_SAMPLE_CONFIRM',q.id,i,async()=>{match(r,i.expected_version);if(r.content_sha256!==i.content_sha256)throw error('CONFIRMATION_VERSION_MISMATCH',409);await require('./trade-context').assertUnordered(tx,q.id);if(r.data.confirmation)throw error('ALREADY_CONFIRMED',409);
   const s=(await detail(tx,q)).submission;if(s?.id!==r.data.submission_id||s.content_sha256!==r.data.submission_sha256)throw error('MANUAL_SAMPLE_SOURCE_CHANGED',409);
   const d={...r.data,confirmation:{account_id:a.id,confirmed_sha256:r.content_sha256,confirmed_at:await A.now(tx)}};await tx.execute('UPDATE manual_sample_requests SET object_version=object_version+1,data_json=?,data_sha256=? WHERE request_id=?',[JSON.stringify(d),digest(d),q.id]);await audit(tx,a,{request_id:q.id,event_code:'MANUAL_SAMPLE_CONFIRMED',object_version:r.object_version+1,content_sha256:digest(d)});return load(tx,q.id);
  });});
 },
 async manualSample(ctx,{request_id,party_id}){return db.withTransaction(async tx=>{const a=await actor(tx,ctx),r=await load(tx,request_id);if(!r)throw error('CUSTOMIZATION_NOT_FOUND',404);await view(tx,a,r,party_id);const [projects]=await tx.execute("SELECT p.id,p.current_status FROM production_records p JOIN customization_orders o ON o.order_id=p.order_id WHERE o.request_id=? AND p.kind='PROJECT' ORDER BY p.id",[r.request_id]);return {...r,projects};});}
 };}
module.exports={load,rights,authority,quote,checkOrder,methods};
