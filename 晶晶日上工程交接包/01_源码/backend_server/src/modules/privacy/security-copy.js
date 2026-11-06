"use strict";
const {id,error}=require('../party/policy');
const A=require('../artists/context');
const sections={SESSION_RECORDS:'PROFILE',PHONE_CHANGES:'PROFILE'};
// A domain-separated one-way reference, NOT the authentication token or its stored hash.
// It remains stable while a retained row exists; no new tracking or retention is introduced.
const sessionRef="SHA2(CONCAT('privacy-session-copy-v1:',s.account_id,':',s.token_hash),256)";
function instant(value,{unknownZero=false}={}){
 const n=Number(value);if(unknownZero&&n===0)return null;
 if(!Number.isSafeInteger(n)||n<=0||n>253402300799999)throw error('STORED_CONTENT_MISMATCH',503);
 return new Date(n).toISOString();
}
function mask(v){if(typeof v!=='string'||!/^1[3-9][0-9]\*{4}[0-9]{4}$/.test(v))throw error('STORED_CONTENT_MISMATCH',503);return v;}
async function page(tx,account,{section,after='',limit}){
 const result=(items,next_cursor)=>({section,items,next_cursor,coverage:'OWN_ACCOUNT_RECORDS_ONLY',request_completion:'NOT_CONFIRMED',history_complete:false,credential_material:'EXCLUDED'});
 if(section==='SESSION_RECORDS'){
  if(after&&!/^[a-f0-9]{64}$/.test(after))throw error('INVALID_CURSOR',400);
  const q='SELECT '+sessionRef+' AS copy_ref,s.authenticated_ms,s.expires_ms,s.revoked FROM auth_sessions s WHERE s.account_id=?';
  if(after&&!(await tx.execute(q+' AND '+sessionRef+'=?',[account,after]))[0].length)throw error('INVALID_CURSOR',400);
  const [[clock]]=await tx.execute('SELECT ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000) AS now_ms');
  const [rows]=await tx.execute(q+' AND '+sessionRef+'>? ORDER BY copy_ref LIMIT ?',[account,after,limit+1]);
  const items=rows.slice(0,limit).map(r=>{
   const authenticated_at=instant(r.authenticated_ms,{unknownZero:true}),expires_at=instant(r.expires_ms),revoked=Number(r.revoked);
   if(![0,1].includes(revoked)||Number(r.authenticated_ms)>Number(r.expires_ms))throw error('STORED_CONTENT_MISMATCH',503);
   return {copy_ref:r.copy_ref,authenticated_at,expires_at,revoked:revoked===1,current_status:revoked?'REVOKED':Number(r.expires_ms)<=Number(clock.now_ms)?'EXPIRED':'ACTIVE'};
  });
  return result(items,rows.length>limit?rows[limit-1].copy_ref:null);
 }
 if(section!=='PHONE_CHANGES')throw error('INVALID_INPUT',400);if(after)id(after);
 const q='SELECT id,old_mask,new_mask,current_status,object_version,expires_ms,created_at,updated_at FROM auth_phone_changes WHERE account_id=?';
 if(after&&!(await tx.execute(q+' AND id=?',[account,after]))[0].length)throw error('INVALID_CURSOR',400);
 const [rows]=await tx.execute(q+' AND id>? ORDER BY id LIMIT ?',[account,after,limit+1]);
 return result(rows.slice(0,limit).map(r=>({id:r.id,old_phone_mask:mask(r.old_mask),new_phone_mask:mask(r.new_mask),current_status:r.current_status,object_version:r.object_version,expires_at:instant(r.expires_ms),created_at:A.instant(r.created_at),updated_at:A.instant(r.updated_at)})),rows.length>limit?rows[limit-1].id:null);
}
module.exports={page,sections};
