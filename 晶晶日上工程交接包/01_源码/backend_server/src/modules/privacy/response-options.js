'use strict';
const {id,error}=require('../party/policy');
// Metadata for the current handler's existing uploads. Selection does not approve
// their contents or bind them to this request; the original independent review remains mandatory.
function methods({db,actor,operator,load}){return{
 async responseFileOptions(ctx,i){
  if(i.after)id(i.after);
  if(!Number.isSafeInteger(i.limit)||i.limit<1||i.limit>100)throw error('INVALID_LIMIT',400);
  return db.withTransaction(async tx=>{
   const a=await actor(tx,ctx);await operator(tx,a);const request=await load(tx,i.request_id);
   if(a.id===request.account_id)throw error('SELF_REVIEW_FORBIDDEN');
   if(!['PROCESSING','FOLLOW_UP'].includes(request.current_status))throw error('PRIVACY_STATE_CONFLICT',409);
   const [rows]=await tx.execute(`SELECT a.id,a.content_sha256,a.byte_size,a.media_type FROM supply_assets a
    WHERE a.created_by=? AND a.current_status='READY' AND a.purpose='REVIEW_EVIDENCE' AND a.id>?
    AND NOT EXISTS(SELECT 1 FROM content_restrictions c WHERE c.target_kind='ASSET' AND c.target_id=a.id AND c.current_status='ACTIVE')
    AND NOT EXISTS(SELECT 1 FROM infringement_cases c WHERE c.target_kind='ASSET' AND c.target_id=a.id AND c.restriction_active=TRUE)
    ORDER BY a.id LIMIT ${i.limit+1}`,[a.id,i.after||'']);
   const items=rows.slice(0,i.limit);return{request_id:request.id,handler_account_id:a.id,items,next_cursor:rows.length>i.limit?items.at(-1).id:null};
  });
 }
};}
module.exports={methods};
