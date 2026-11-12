'use strict';
const A=require('../artists/context'),C=require('../wallet/context'),G=require('../wallet/recharge-refund-guardian'),{id,error}=require('../party/policy');
const sections={GUARDIAN_RECHARGE_REFUNDS:'TRANSACTIONS'};
async function page(tx,account,{section,after='',limit}){
 if(after)id(after);
 const q="SELECT r.*,p.personal_account_id AS child_account_id FROM wallet_records r JOIN parties p ON p.id=r.owner_party_id AND p.kind='PERSON' WHERE r.kind='RECHARGE_REFUND' AND JSON_UNQUOTE(JSON_EXTRACT(r.data_json,'$.guardian_link_id')) IS NOT NULL AND (r.created_by=? OR p.personal_account_id=?)";
 if(after&&!(await tx.execute(q+' AND r.id=?',[account,account,after]))[0].length)throw error('INVALID_CURSOR',400);
 const [rows]=await tx.execute(q+' AND r.id>? ORDER BY r.id LIMIT ?',[account,account,after,limit+1]),items=[];
 for(const raw of rows.slice(0,limit)){
  const r=C.checked(raw),child=raw.child_account_id===account;let allowed=child;
  if(!child){if(r.created_by!==account||r.data.guardian_account_id!==account)throw error('STORED_CONTENT_MISMATCH',503);
   try{await G.current(tx,r);allowed=true;}catch(e){if(!['GUARDIAN_ACCOUNT_NOT_AVAILABLE','GUARDIAN_VERIFIED_IDENTITY_REQUIRED','GUARDIAN_LINK_NOT_ACTIVE'].includes(e.code))throw e;}
  }
  items.push({id:r.id,current_status:r.current_status,object_version:r.object_version,own_role:child?'CHILD':'GUARDIAN',detail_access:allowed?'AVAILABLE':'CURRENT_GUARDIAN_ACCESS_REQUIRED',data:allowed?require('../wallet/recharge-refund-view').view(r):null});
 }
 return {section,items,next_cursor:rows.length>limit?rows[limit-1].id:null,coverage:'OWN_ACCOUNT_RECORDS_ONLY',request_completion:'NOT_CONFIRMED',original_documents_included:false};
}
module.exports={sections,page};
