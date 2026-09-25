 'use strict';
const {randomUUID,randomBytes,randomInt}=require('node:crypto');
const {createSecurity,phone,config,error,shape,ref,id}=require('./security');
const one=async(tx,sql,args=[]) => (await tx.execute(sql,args))[0][0];
const timestamp=async tx=>Number((await one(tx,'SELECT ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000) AS ms')).ms);
const accountData=a=>({id:a.id,display_name:a.display_name,current_status:a.current_status,object_version:a.object_version,allowed_actions:a.current_status==='ACTIVE'?['READ_ACCOUNT','LIST_PARTIES','CREATE_ORGANIZATION']:[]});
function createAuthRepository(db,{secret,sms,settings={}}) {
 const secure=createSecurity(secret),cfg=config(settings);
 async function rate(scope,limit,span) {
  const accepted=await db.withTransaction(async tx=>{
   const hash=secure.digest('rate',scope),now=await timestamp(tx);
   await tx.execute('INSERT INTO auth_rate_limits(key_hash,window_ms,hits) VALUES (?,?,0) ON DUPLICATE KEY UPDATE key_hash=auth_rate_limits.key_hash',[hash,now]);
   const row=await one(tx,'SELECT * FROM auth_rate_limits WHERE key_hash=? FOR UPDATE',[hash]);
   const hits=now-Number(row.window_ms)>=span?0:row.hits;
   if(hits>=limit)return false;
   await tx.execute('UPDATE auth_rate_limits SET hits=?,window_ms=? WHERE key_hash=?',[hits+1,hits===0?now:row.window_ms,hash]);return true;
  });
  if(!accepted)throw error('RATE_LIMITED',429);
 }
 const subject=p=>secure.digest('phone',p);
 function challengeData(row){return {challenge_id:row.id,current_status:'SENT',expires_at:new Date(Number(row.expires_ms)).toISOString(),resend_after:new Date(Number(row.resend_ms)).toISOString()};}
 async function resolve(token,{allowRevoked=false}={}) {
  if(typeof token!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(token))throw error('AUTHENTICATION_REQUIRED',401);
  const now=await timestamp(db),tokenHash=secure.digest('token',token);
  const row=await one(db,'SELECT a.*,s.expires_ms,s.revoked FROM auth_sessions s JOIN identity_accounts a ON a.id=s.account_id WHERE s.token_hash=?',[tokenHash]);
  if(!row||(!allowRevoked&&Number(row.revoked))||Number(row.expires_ms)<=now)throw error('AUTHENTICATION_REQUIRED',401);
  return {...row,token_hash:tokenHash};
 }
 return Object.freeze({secure,
  async challenge(input,key,ip) {
   shape(input,['phone','purpose']);phone(input.phone);if(input.purpose!=='LOGIN')throw error('INVALID_INPUT',400);ref(key);
   await rate(['sms-ip',ip],cfg.ipSendsPerHour,3600000);
   const ph=subject(input.phone),kh=secure.digest('challenge-key',[ph,key]),fp=secure.digest('challenge-input',[input.phone,input.purpose]);
   const code=String(randomInt(1000000)).padStart(6,'0'),challengeId=randomUUID();
   const row=await db.withTransaction(async tx=>{
    const now=await timestamp(tx);
    await tx.execute('INSERT INTO auth_subjects(phone_hash) VALUES (?) ON DUPLICATE KEY UPDATE phone_hash=auth_subjects.phone_hash',[ph]);
    const who=await one(tx,'SELECT * FROM auth_subjects WHERE phone_hash=? FOR UPDATE',[ph]);
    const prior=await one(tx,'SELECT * FROM auth_challenges WHERE key_hash=?',[kh]);
    if(prior){if(prior.fingerprint!==fp)throw error('IDEMPOTENCY_CONFLICT',409);return {...prior,replay:true};}
    if(Number(who.next_send_ms)>now)throw error('RATE_LIMITED',429);
    await tx.execute("UPDATE auth_challenges SET current_status='EXPIRED' WHERE phone_hash=? AND current_status IN ('PENDING','SENT','UNKNOWN')",[ph]);
    await tx.execute('UPDATE auth_subjects SET next_send_ms=? WHERE phone_hash=?',[now+cfg.resendMs,ph]);
    await tx.execute("INSERT INTO auth_challenges(id,phone_hash,key_hash,fingerprint,code_hash,current_status,expires_ms,resend_ms) VALUES (?,?,?,?,?,'PENDING',?,?)",[challengeId,ph,kh,fp,secure.digest('code',[challengeId,ph,code]),now+cfg.challengeMs,now+cfg.resendMs]);
    return {id:challengeId,expires_ms:now+cfg.challengeMs,resend_ms:now+cfg.resendMs};
   });
   if(row.replay){if(row.current_status!=='SENT'||Number(row.expires_ms)<=await timestamp(db))throw error('SMS_CHALLENGE_UNAVAILABLE',503);return challengeData(row);}
   try {
    await rate(['sms-phone',ph],cfg.phoneSendsPerHour,3600000);await rate('sms-global',cfg.totalSendsPerHour,3600000);
    if(!sms)throw error('SMS_NOT_READY',503);
    const result=await sms.call('send',{phone:input.phone,code},{request_id:challengeId});
    if(result?.accepted!==true)throw error('SMS_OUTCOME_UNKNOWN',503);
    const [changed]=await db.execute("UPDATE auth_challenges SET current_status='SENT' WHERE id=? AND current_status='PENDING'",[row.id]);
    if(changed.affectedRows!==1)throw error('SMS_OUTCOME_UNKNOWN',503);
   } catch(e) {
    await db.execute("UPDATE auth_challenges SET current_status='UNKNOWN' WHERE id=? AND current_status='PENDING'",[row.id]);
    throw error(e.status===429?'RATE_LIMITED':'SMS_NOT_READY',e.status===429?429:503);
   }
   return challengeData(row);
  },
  async login(input,key,ip) {
   shape(input,['phone','challenge_id','code']);phone(input.phone);id(input.challenge_id);ref(key);
   if(typeof input.code!=='string'||! /^[0-9]{6}$/.test(input.code))throw error('INVALID_INPUT',400);
   await rate(['login-ip',ip],cfg.ipLoginsPerMinute,60000);
   const ph=subject(input.phone),kh=secure.digest('login-key',[ph,input.challenge_id,key]),fp=secure.digest('login-input',[input.phone,input.challenge_id,input.code]);
   const result=await db.withTransaction(async tx=>{
    const who=await one(tx,'SELECT * FROM auth_subjects WHERE phone_hash=? FOR UPDATE',[ph]);
    const now=await timestamp(tx);
    if(!who)return {failure:'INVALID_CREDENTIALS'};
    const prior=await one(tx,'SELECT r.*,s.revoked,a.current_status FROM auth_login_results r JOIN auth_sessions s ON s.token_hash=r.token_hash JOIN identity_accounts a ON a.id=s.account_id WHERE r.key_hash=?',[kh]);
    if(prior){if(prior.fingerprint!==fp)return {failure:'IDEMPOTENCY_CONFLICT',status:409};if(Number(prior.expires_ms)<=now||Number(prior.revoked)||prior.current_status!=='ACTIVE')return {failure:'INVALID_CREDENTIALS'};return {token:secure.open(prior.encrypted_token,kh)};}
    const c=await one(tx,'SELECT * FROM auth_challenges WHERE id=? AND phone_hash=? FOR UPDATE',[input.challenge_id,ph]);
    if(!c||c.current_status!=='SENT'||Number(c.expires_ms)<=now||c.attempts>=cfg.maxAttempts)return {failure:'INVALID_CREDENTIALS'};
    if(!secure.matches(c.code_hash,secure.digest('code',[c.id,ph,input.code]))) {
     await tx.execute('UPDATE auth_challenges SET attempts=attempts+1 WHERE id=?',[c.id]);return {failure:'INVALID_CREDENTIALS'};
    }
    let account;
    if(who.account_id) {account=await one(tx,'SELECT * FROM identity_accounts WHERE id=? FOR UPDATE',[who.account_id]);if(!account||account.current_status!=='ACTIVE')return {failure:'INVALID_CREDENTIALS'};}
    else {
     const accountId=randomUUID(),partyId=randomUUID();
     await tx.execute('INSERT INTO identity_accounts(id,subject_ref,display_name) VALUES (?,?,?)',[accountId,'phone:'+ph,'新用户']);
     await tx.execute("INSERT INTO parties(id,kind,display_name,personal_account_id,created_by) VALUES (?,'PERSON',?,?,?)",[partyId,'新用户',accountId,accountId]);
     await tx.execute("INSERT INTO party_memberships(id,party_id,account_id,role_code,current_status) VALUES (?,?,?,'OWNER','ACTIVE')",[randomUUID(),partyId,accountId]);
     await tx.execute('INSERT INTO party_audit_events(id,party_id,actor_account_id,event_code,object_id,object_version,request_id) VALUES (?,?,?,?,?,1,?)',[randomUUID(),partyId,accountId,'PERSON_REGISTERED',partyId,input.challenge_id]);
     await tx.execute('UPDATE auth_subjects SET account_id=? WHERE phone_hash=?',[accountId,ph]);account={id:accountId};
    }
    const token=randomBytes(32).toString('base64url'),th=secure.digest('token',token),expires=now+cfg.sessionMs;
    await tx.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms) VALUES (?,?,?)',[th,account.id,expires]);
    await tx.execute('INSERT INTO auth_login_results(key_hash,fingerprint,token_hash,encrypted_token,expires_ms) VALUES (?,?,?,?,?)',[kh,fp,th,secure.seal(token,kh),expires]);
    await tx.execute("UPDATE auth_challenges SET current_status='CONSUMED' WHERE id=?",[c.id]);
    return {token};
   });
   if(result.failure)throw error(result.failure,result.status||401);
   const a=await resolve(result.token);return {access_token:result.token,token_type:'Bearer',expires_at:new Date(Number(a.expires_ms)).toISOString(),account:accountData(a)};
  },
  resolve,
  accountData,
  async revoke(token){const a=await resolve(token,{allowRevoked:true});await db.execute('UPDATE auth_sessions SET revoked=TRUE WHERE token_hash=?',[a.token_hash]);return {current_status:'REVOKED'};},
  async cleanup(){const now=await timestamp(db);return db.withTransaction(async tx=>{
   await tx.execute('DELETE r FROM auth_login_results r JOIN auth_sessions s ON s.token_hash=r.token_hash WHERE r.expires_ms<=? OR s.expires_ms<=?',[now,now]);
   await tx.execute('DELETE FROM auth_sessions WHERE expires_ms<=?',[now]);
   await tx.execute('DELETE FROM auth_challenges WHERE expires_ms<?',[now-86400000]);
   await tx.execute('DELETE FROM auth_rate_limits WHERE window_ms<?',[now-86400000]);
  });},
 });
}
module.exports={createAuthRepository};
