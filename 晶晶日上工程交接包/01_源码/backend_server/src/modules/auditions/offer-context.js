"use strict";
const A=require('../artists/context'),C=require('./context'),{id,shape,error}=require('../party/policy');
const {digest}=require('../governance/content');
async function usable(tx,r){await C.qualified(tx,r);const rule=await C.rule(tx,r.data.offer.rule_id);if(digest(rule.snapshot.content)!==digest(r.data.rule_snapshot.content))throw error('AUDITION_RULE_CHANGED',409);}
function methods({db,actor}){return {
 async offerOptions(ctx,i){shape(i,['party_id','person_id','kind','after','limit']);const limit=i.limit??20;if(!['RULE','AUTHORIZATION'].includes(i.kind)||!Number.isInteger(limit)||limit<1||limit>100)throw error('INVALID_LIST',400);if(i.after)id(i.after);
 return db.withTransaction(async tx=>{
  const a=await actor(tx,ctx),p=await A.person(tx,id(i.person_id));await A.authorize(tx,a,p,id(i.party_id),'MANAGE_AUDITIONS');require('../artists/policy').adult(p,await A.now(tx));
  const halos=(await tx.execute("SELECT * FROM artist_records WHERE person_id=? AND kind='HALO' AND current_status='APPROVED' FOR SHARE",[p.id]))[0].map(A.checked);
  if(require('../artists/policy').haloLevel(halos,await A.now(tx))<2)throw error('AUDITION_L2_REQUIRED',409);
  const rows=(await tx.execute(i.kind==='RULE'?"SELECT id FROM governance_rules WHERE current_status='EFFECTIVE' AND effective_at<=CURRENT_TIMESTAMP(3) AND JSON_EXTRACT(content_json,'$.terms.audition') IS NOT NULL AND id>? ORDER BY id LIMIT ?":"SELECT * FROM artist_records WHERE person_id=? AND kind='CONSENT' AND current_status='APPROVED' AND id>? ORDER BY id LIMIT ?",[...(i.kind==='RULE'?[]:[p.id]),i.after||'',limit+1]))[0],items=[];
  for(const raw of rows.slice(0,limit)){
   try{
    if(i.kind==='RULE'){const r=await C.rule(tx,raw.id);items.push({id:raw.id,person_id:p.id,version:r.snapshot.content.version,terms:r.terms});}
    else{const c=A.checked(raw);await C.qualified(tx,{data:{offer:{person_id:p.id,avatar_id:c.avatar_id,public_consent_id:c.id}}});const avatar=await A.avatar(tx,c.avatar_id,p);items.push({id:c.id,person_id:p.id,person_name:p.display_name,avatar_id:avatar.id,avatar_name:avatar.data.display_name,public_consent_id:c.id,valid_until:c.data.valid_until});}
   }catch(e){if(![400,403,404,409].includes(e.status))throw e;}
  }
  return {items,next_cursor:rows.length>limit?rows[limit-1].id:null};
 });}
};}
module.exports={methods,usable};
