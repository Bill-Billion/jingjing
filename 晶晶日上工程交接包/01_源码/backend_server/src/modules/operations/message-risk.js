'use strict';
const {randomUUID}=require('node:crypto'),{digest}=require('../governance/content'),A=require('../artists/context');
const {id,ref,error}=require('../party/policy');
const domains=['COMMERCIAL','AUDITION'];
function checked(row){const data=A.parse(row.data_json);if(digest(data)!==row.data_sha256||data.id!==row.id||data.source_id!==row.source_id||data.domain!==row.domain||data.actor_account_id!==row.actor_account_id||data.outcome!==row.outcome)throw error('STORED_CONTENT_MISMATCH',503);return data;}
function rejected(body){try{require('../auditions/policy').cleanMessage(body);return false;}catch(e){if(e.code!=='MESSAGE_REQUIRES_MODERATION')throw e;return true;}}
async function admit(tx,domain,a,source,input,deny){
 if(!domains.includes(domain))throw error('INVALID_MESSAGE_DOMAIN',400);id(source);
 const command=digest(['message-admission-v1',domain,a.id,ref(input.operation_key)]),fingerprint=digest(input);
 const legacy=domain==='COMMERCIAL'?{table:'gig_commands',operation:'COMMERCIAL_MESSAGE'}:{table:'audition_commands',operation:'MESSAGE'};
 const previous=await A.one(tx,'SELECT fingerprint FROM '+legacy.table+' WHERE id=? FOR SHARE',[digest([a.id,legacy.operation,input.operation_key])]);
 if(previous&&previous.fingerprint!==fingerprint)throw error('IDEMPOTENCY_CONFLICT',409);
 const data={id:randomUUID(),domain,source_id:source,actor_account_id:a.id,outcome:deny?'REJECTED':'ALLOWED',reason_code:deny?'OFF_PLATFORM_CONTACT_OR_PAYMENT':null,at:await A.now(tx)};
 // Only metadata and a request fingerprint are stored, never the rejected body.
 // The shared admission key prevents a refused send from being changed into a
 // different accepted send under the same key, including across business objects.
 try{await tx.execute('INSERT INTO conversation_message_attempts(id,command_key,domain,source_id,actor_account_id,fingerprint,outcome,data_json,data_sha256) VALUES (?,?,?,?,?,?,?,?,?)',[data.id,command,domain,source,a.id,fingerprint,data.outcome,JSON.stringify(data),digest(data)]);return data.outcome;}
 catch(e){if(e.code!=='ER_DUP_ENTRY')throw e;const old=await A.one(tx,'SELECT * FROM conversation_message_attempts WHERE command_key=? FOR UPDATE',[command]);if(!old||old.fingerprint!==fingerprint)throw error('IDEMPOTENCY_CONFLICT',409);return checked(old).outcome;}
}
async function page(tx,domain,source,{after='',limit=20}){
 if(!domains.includes(domain)||!Number.isInteger(limit)||limit<1||limit>100)throw error('INVALID_PAGE',400);id(source);if(after)id(after);
 const base="SELECT * FROM conversation_message_attempts WHERE domain=? AND source_id=? AND outcome='REJECTED'";
 if(after&&!(await tx.execute(base+' AND id=?',[domain,source,after]))[0].length)throw error('INVALID_CURSOR',400);
 const rows=(await tx.execute(base+' AND id>? ORDER BY id LIMIT ?',[domain,source,after,limit+1]))[0];
 return {source_id:source,domain,items:rows.slice(0,limit).map(checked),next_cursor:rows.length>limit?rows[limit-1].id:null,content_retained:false};
}
function result(value){if(value?.message_rejected===true)throw error('MESSAGE_REQUIRES_MODERATION',400);return value;}
module.exports={admit,page,rejected,result,checked};
