'use strict';
const {id,error}=require('../party/policy'),A=require('../artists/context');
const sections={ENTERPRISE_REPRESENTATIONS:'CONTRACTS'};
async function page(tx,account,{section,after='',limit}){
 if(!Object.hasOwn(sections,section))throw error('INVALID_INPUT',400);if(after)id(after);
 const q='SELECT r.* FROM party_representations r WHERE (r.account_id=? OR r.grantor_account_id=?)',args=[account,account];
 if(after&&!(await tx.execute(q+' AND r.id=?',[...args,after]))[0].length)throw error('INVALID_CURSOR',400);
 const [rows]=await tx.execute(q+' AND r.id>? ORDER BY r.id LIMIT ?',[...args,after,limit+1]);const items=[];
 for(const r of rows.slice(0,limit))items.push({id:r.id,party_id:r.party_id,relationship:r.account_id===account?'GRANTEE':'GRANTOR',scope:r.scope_code,current_status:r.current_status,object_version:r.object_version,expires_at:A.instant(r.expires_at),created_at:A.instant(r.created_at),updated_at:A.instant(r.updated_at),effective_now:r.current_status==='ACTIVE'&&await require('../party/representatives').effective(tx,r)});
 // This is the account's retained history, not current permission to act for the company.
 return {section,items,next_cursor:rows.length>limit?rows[limit-1].id:null,coverage:'OWN_ACCOUNT_RECORDS_ONLY',request_completion:'NOT_CONFIRMED',original_documents_included:false};
}
module.exports={sections,page};
