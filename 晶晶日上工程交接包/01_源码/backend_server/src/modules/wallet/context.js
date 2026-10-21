 'use strict';
const {randomUUID}=require('node:crypto');
const A=require('../artists/context'),{digest}=require('../governance/content');
const {id,ref,error}=require('../party/policy');
const {authorizeOperator}=require('../governance/operator-access');
function checked(row){
 if(!row)throw error('WALLET_NOT_FOUND',404);
 const data=A.parse(row.data_json);if(digest(data)!==row.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);
 return {id:row.id,kind:row.kind,owner_party_id:row.owner_party_id,parent_id:row.parent_id,created_by:row.created_by,current_status:row.current_status,object_version:row.object_version,content_sha256:row.data_sha256,data};
}
async function load(tx,key,kind=null,lock='FOR UPDATE'){
 const r=checked(await A.one(tx,'SELECT * FROM wallet_records WHERE id=? '+lock,[id(key)]));
 if(kind&&r.kind!==kind)throw error('WALLET_NOT_FOUND',404);return r;
}
async function rows(tx,party,kind){return (await tx.execute('SELECT * FROM wallet_records WHERE owner_party_id=? AND kind=? ORDER BY id FOR UPDATE',[party,kind]))[0].map(checked);}
async function operator(tx,a,action,r=null){
 if(!await authorizeOperator(tx,{account_id:a.id,action}))throw error('WALLET_OPERATOR_FORBIDDEN',403);
 if(r&&(r.created_by===a.id||(r.owner_party_id&&await A.one(tx,"SELECT id FROM party_memberships WHERE account_id=? AND party_id=? AND current_status='ACTIVE'",[a.id,r.owner_party_id]))))throw error('SELF_REVIEW_FORBIDDEN',403);
}
async function owner(tx,a,party,adult=false){
 const p=await A.owner(tx,a,party);
 if(p.kind!=='PERSON'||p.personal_account_id!==a.id)throw error('WALLET_PERSONAL_ACCOUNT_REQUIRED',403);
 if(adult)await A.verifiedAdultParty(tx,party);return p;
}
async function audit(tx,a,r,event){await tx.execute('INSERT INTO wallet_audit(id,record_id,actor_account_id,event_code,object_version,data_sha256,request_ref) VALUES (?,?,?,?,?,?,?)',[randomUUID(),r.id,a?.id||null,event,r.object_version,r.content_sha256,a?.request_id||randomUUID()]);}
async function insert(tx,a,kind,owner,parent,status,data,source=null){
 const r={id:randomUUID(),kind,owner_party_id:owner,parent_id:parent,created_by:a.id,current_status:status,object_version:1,content_sha256:digest(data),data};
 try{await tx.execute('INSERT INTO wallet_records(id,kind,owner_party_id,parent_id,source_key,created_by,current_status,data_json,data_sha256) VALUES (?,?,?,?,?,?,?,?,?)',[r.id,kind,owner,parent,source?digest([kind,source]):null,a.id,status,JSON.stringify(data),r.content_sha256]);}
 catch(e){if(e.code==='ER_DUP_ENTRY')throw error('WALLET_SOURCE_ALREADY_USED',409);throw e;}
 await audit(tx,a,r,kind+'_CREATED');return r;
}
async function save(tx,a,r,status,data,event){
 const next={...r,current_status:status,object_version:r.object_version+1,content_sha256:digest(data),data};
 const [change]=await tx.execute('UPDATE wallet_records SET current_status=?,object_version=?,data_json=?,data_sha256=? WHERE id=? AND object_version=?',[status,next.object_version,JSON.stringify(data),next.content_sha256,r.id,r.object_version]);
 if(change.affectedRows!==1)throw error('VERSION_CONFLICT',412);await audit(tx,a,next,event);return next;
}
async function command(tx,a,op,i,fn){
 const key=digest([a.id,op,ref(i.operation_key)]),hash=digest(i);
 try{await tx.execute('INSERT INTO wallet_commands(id,fingerprint) VALUES (?,?)',[key,hash]);}
 catch(e){if(e.code!=='ER_DUP_ENTRY')throw e;const old=await A.one(tx,'SELECT * FROM wallet_commands WHERE id=?',[key]);if(old.fingerprint!==hash)throw error('IDEMPOTENCY_CONFLICT',409);if(!old.result_json)throw error('IDEMPOTENCY_IN_PROGRESS',409);if(A.sha(old.result_json)!==old.result_sha256)throw error('STORED_CONTENT_MISMATCH',503);return JSON.parse(old.result_json);}
 const result=await fn(),text=JSON.stringify(result);await tx.execute('UPDATE wallet_commands SET result_json=?,result_sha256=? WHERE id=?',[text,A.sha(text),key]);return result;
}
async function account(tx,party){
 const r=await A.one(tx,"SELECT * FROM wallet_records WHERE kind='ACCOUNT' AND source_key=? FOR UPDATE",[digest(['ACCOUNT',party])]);
 const a=checked(r);if(a.current_status!=='ACTIVE')throw error('WALLET_ACCOUNT_INACTIVE',409);return a;
}
async function liveRule(tx,key){const r=await load(tx,key,'RULE','FOR SHARE');if(r.current_status!=='EFFECTIVE')throw error('WALLET_RULE_NOT_EFFECTIVE',409);return r;}
module.exports={checked,load,rows,operator,owner,audit,insert,save,command,account,liveRule};
