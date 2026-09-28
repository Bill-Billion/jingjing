'use strict';
const {randomUUID}=require('node:crypto');
const {id,ref,shape,label,error}=require('../party/policy');
const actions=Object.freeze(['CREATE_RULE','READ_RULE','RULE_IN_REVIEW','RULE_APPROVED','RULE_EFFECTIVE','RULE_RETIRED','SEAL','CREATE_SOURCE','READ_SOURCE','REVIEW_SOURCE','WITHDRAW_SOURCE','SUPPLY_REVIEW_PROFILE','SUPPLY_REVIEW_RIGHTS','SUPPLY_REVIEW_CONTENT','SUPPLY_REVIEW_CONSENT','LICENSE_REVIEW','TRADE_REVIEW','TRADE_REFUND']);
function normalize(input){
 shape(input,['account_id','action','enabled','expires_at','expected_version','authority_ref','reason']);
 id(input.account_id);ref(input.authority_ref);label(input.reason,500);
 if(!actions.includes(input.action)||typeof input.enabled!=='boolean'||!Number.isInteger(input.expected_version)||input.expected_version<0||input.expected_version>=4294967294)throw error('INVALID_OPERATOR_GRANT',400);
 let expires=null;
 if(input.expires_at!==null){
  if(typeof input.expires_at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.expires_at)||!Number.isFinite(Date.parse(input.expires_at))||new Date(input.expires_at).toISOString()!==input.expires_at)throw error('INVALID_INSTANT',400);
  expires=input.expires_at.replace('T',' ').slice(0,-1);
 }
 return {...input,expires_at:expires};
}
async function authorizeOperator(tx,{account_id,action}){
 id(account_id);if(!actions.includes(action))return false;
 const [[row]]=await tx.execute(`SELECT g.enabled,g.expires_at IS NULL OR g.expires_at>CURRENT_TIMESTAMP(3) AS unexpired,
   a.current_status FROM governance_operator_grants g JOIN identity_accounts a ON a.id=g.account_id
   WHERE g.account_id=? AND g.action_code=? FOR SHARE`,[account_id,action]);
 return !!row&&Number(row.enabled)===1&&Number(row.unexpired)===1&&row.current_status==='ACTIVE';
}
// Maintenance capability: DB credentials are the authority boundary, NOT the authority_ref string.
// Never expose through HTTP or pass request-body options here. No automatic account bootstrap.
async function maintainOperatorGrant(db,input){
 const value=normalize(input);
 return db.withTransaction(async tx=>{
  const [[account]]=await tx.execute('SELECT current_status FROM identity_accounts WHERE id=? FOR UPDATE',[value.account_id]);
  if(!account)throw error('ACCOUNT_NOT_FOUND',404);
  if(value.enabled&&account.current_status!=='ACTIVE')throw error('ACCOUNT_NOT_ACTIVE');
  if(value.enabled&&value.expires_at!==null){
   const [[time]]=await tx.execute('SELECT ?>CURRENT_TIMESTAMP(3) AS future',[value.expires_at]);
   if(!Number(time.future))throw error('GRANT_ALREADY_EXPIRED',400);
  }
  const [[existing]]=await tx.execute('SELECT * FROM governance_operator_grants WHERE account_id=? AND action_code=? FOR UPDATE',[value.account_id,value.action]);
  if((existing?.object_version||0)!==value.expected_version)throw error('VERSION_CONFLICT',412);
  const grantId=existing?.id||randomUUID(),next=value.expected_version+1;
  if(existing)await tx.execute('UPDATE governance_operator_grants SET enabled=?,expires_at=?,object_version=? WHERE id=?',[value.enabled,value.expires_at,next,grantId]);
  else await tx.execute('INSERT INTO governance_operator_grants(id,account_id,action_code,enabled,expires_at,object_version) VALUES (?,?,?,?,?,?)',[grantId,value.account_id,value.action,value.enabled,value.expires_at,next]);
  await tx.execute('INSERT INTO governance_operator_history(id,grant_id,object_version,enabled,expires_at,authority_ref,reason) VALUES (?,?,?,?,?,?,?)',[randomUUID(),grantId,next,value.enabled,value.expires_at,value.authority_ref,value.reason]);
  return {grant_id:grantId,account_id:value.account_id,action:value.action,enabled:value.enabled,expires_at:value.expires_at===null?null:value.expires_at.replace(' ','T')+'Z',object_version:next};
 });
}
module.exports={actions,normalize,authorizeOperator,maintainOperatorGrant};
