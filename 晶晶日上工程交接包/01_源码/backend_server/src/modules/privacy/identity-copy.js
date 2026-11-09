"use strict";
const {id,error}=require('../party/policy'),A=require('../artists/context');
const sections={IDENTITY_CHECKS:'PROFILE'};
async function page(tx,account,{section,after='',limit}){
 if(after)id(after);
 const q="SELECT r.* FROM artist_records r JOIN artist_people a ON a.id=r.person_id JOIN parties p ON p.id=a.owner_party_id WHERE r.kind='IDENTITY' AND p.kind='PERSON' AND p.personal_account_id=?";
 if(after&&!(await tx.execute(q+' AND r.id=?',[account,after]))[0].length)throw error('INVALID_CURSOR',400);
 const [rows]=await tx.execute(q+' AND r.id>? ORDER BY r.id LIMIT ?',[account,after,limit+1]);
 const items=rows.slice(0,limit).map(raw=>{const r=A.checked(raw),d=r.data,result=d.result;if(d.account_id!==account||d.person_id!==r.person_id)throw error('STORED_CONTENT_MISMATCH',503);
 if(result&&(!['VERIFIED','REJECTED','DUPLICATE_PERSON'].includes(result.status)||result.status!==r.current_status||!['ADULT','MINOR','UNKNOWN'].includes(result.age_band)))throw error('STORED_CONTENT_MISMATCH',503);
 return {id:r.id,person_id:r.person_id,current_status:r.current_status,object_version:r.object_version,age_band:result?.age_band||null,valid_until:result?.valid_until||null,result_recorded:!!result};});
 return {section,items,next_cursor:rows.length>limit?rows[limit-1].id:null,coverage:'OWN_ACCOUNT_RECORDS_ONLY',request_completion:'NOT_CONFIRMED',original_documents_included:false,provider_evidence_included:false};
}
module.exports={page,sections};
