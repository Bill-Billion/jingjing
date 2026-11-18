"use strict";
const A=require('../artists/context'),C=require('./context'),P=require('../artists/policy');
const {id,shape,error}=require('../party/policy');

// Resolve from the booking, never a caller-supplied person or recipient.
function methods({db,actor}){return {
 async deliveryOptions(ctx,i){
  shape(i,['record_id','party_id','kind','after','limit']);
  const limit=i.limit??20;
  if(!['PHOTO','VIDEO','CONSENT'].includes(i.kind)||!Number.isInteger(limit)||limit<1||limit>100)throw error('INVALID_LIST',400);
  if(i.after)id(i.after);
  return db.withTransaction(async tx=>{
   const a=await actor(tx,ctx),{r,order}=await C.booking(tx,id(i.record_id));
   await C.access(tx,a,r,id(i.party_id),'SELLER');
   const p=await A.person(tx,r.data.offer.person_id);
   await A.authorize(tx,a,p,i.party_id,'MANAGE_MATERIALS');
   P.adult(p,await A.now(tx));await A.avatar(tx,r.data.offer.avatar_id,p);
   if(order?.current_status!=='PAID'||r.data.dispute||r.data.fulfilled_at||r.data.reschedule||
      !(['ARRIVED','DELIVERED'].includes(r.current_status)||r.data.appointment.mode==='ONLINE_MATERIALS'&&r.current_status==='ACCEPTED'))throw error('AUDITION_NOT_DELIVERABLE',409);
   const params=[p.id,...(i.kind==='CONSENT'?[]:[p.owner_party_id]),i.after||'',limit+1];
   const sql=i.kind==='CONSENT'
    ? "SELECT * FROM artist_records WHERE person_id=? AND kind='CONSENT' AND current_status='APPROVED' AND id>? ORDER BY id LIMIT ?"
    : "SELECT s.* FROM supply_assets s JOIN artist_asset_links l ON l.asset_id=s.id WHERE l.person_id=? AND s.owner_party_id=? AND s.current_status='READY' AND s.purpose='AVATAR_MATERIAL' AND s.media_type "+(i.kind==='PHOTO'?"IN ('image/jpeg','image/png')":"= 'video/mp4'")+" AND s.id>? ORDER BY s.id LIMIT ?";
   const rows=(await tx.execute(sql,params))[0],items=[];
   for(const raw of rows.slice(0,limit)){
    if(i.kind==='CONSENT'){
     const c=A.checked(raw);
     if(c.avatar_id!==r.data.offer.avatar_id||c.data.grantee_party_id!==r.owner_party_id||!c.data.purposes.includes('AUDITION_SAMPLES')||!P.active(c.data,await A.now(tx)))continue;
     items.push({id:c.id,valid_until:c.data.valid_until});
    }else{
     try{await A.assets(tx,[raw.id],p.owner_party_id,['AVATAR_MATERIAL']);}
     catch(e){if(e.code==='CONTENT_RESTRICTED')continue;throw e;}
     items.push({id:raw.id,media_type:raw.media_type,byte_size:raw.byte_size,content_sha256:raw.content_sha256});
    }
   }
   return {booking_id:r.id,person_id:p.id,avatar_id:r.data.offer.avatar_id,kind:i.kind,items,next_cursor:rows.length>limit?rows[limit-1].id:null};
  });
 }
};}
module.exports={methods};
