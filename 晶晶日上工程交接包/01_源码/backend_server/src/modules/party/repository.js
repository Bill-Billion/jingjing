 'use strict';
const {randomUUID,createHash}=require('node:crypto');
const capabilityCodes=Object.freeze(['AUTHOR','SCRIPT_SUPPLIER','PRODUCER','MCN','BRAND_CLIENT']);
const error=(code,status=403)=>Object.assign(new Error(code),{code,status});
function ref(value) {
 if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value))throw error('INVALID_REFERENCE',400);
 return value;
}
function id(value) {
 if(typeof value!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(value))throw error('INVALID_ID',400);
 return value;
}
function shape(input,keys) {
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k)))throw error('INVALID_INPUT',400);
}
function label(value,max) {
 if(typeof value!=='string'||!value.trim()||Array.from(value).length>max)throw error('INVALID_DISPLAY_NAME',400);
 return value;
}
function version(value) {
 if(!Number.isInteger(value)||value<1||value>=4294967295)throw error('EXPECTED_VERSION_REQUIRED',428);
 return value;
}
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const canonical=value=>Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]]));
const one=async(tx,sql,args=[]) => (await tx.execute(sql,args))[0][0];

// resolvePrincipal must be wired to verified server authentication. No HTTP/token guessing here.
function createPartyRepository(db,{resolvePrincipal=async()=>null}={}) {
 async function principal(context) {
  const result=await resolvePrincipal(context);
  if(!result)throw error('AUTHENTICATION_REQUIRED',401);
  return {subject_ref:ref(result.subject_ref),request_id:ref(result.request_id || randomUUID())};
 }
 async function actor(context) {
  const p=await principal(context);
  const account=await one(db,'SELECT * FROM identity_accounts WHERE subject_ref=?',[p.subject_ref]);
  if(!account||account.current_status!=='ACTIVE')throw error('ACCOUNT_NOT_ACTIVE');
  return {...p,account_id:account.id};
 }
 async function active(tx,a) {
  const account=await one(tx,'SELECT current_status FROM identity_accounts WHERE id=? FOR SHARE',[a.account_id]);
  if(!account||account.current_status!=='ACTIVE')throw error('ACCOUNT_NOT_ACTIVE');
 }
 async function audit(tx,a,party,event,object,objectVersion) {
  await tx.execute(`INSERT INTO party_audit_events
   (id,party_id,actor_account_id,event_code,object_id,object_version,request_id) VALUES (?,?,?,?,?,?,?)`,
   [randomUUID(),party,a.account_id,event,object,objectVersion,a.request_id]);
 }
 async function membership(tx,party,account) {
  return one(tx,'SELECT * FROM party_memberships WHERE party_id=? AND account_id=?',[party,account]);
 }
 async function owner(tx,a,p,organization=false) {
  const m=await membership(tx,p.id,a.account_id);
  if(!m||m.current_status!=='ACTIVE'||m.role_code!=='OWNER'||(organization&&p.kind!=='ORGANIZATION'))throw error('PARTY_ACTION_FORBIDDEN');
 }
 async function party(tx,partyId) {
  const p=await one(tx,'SELECT * FROM parties WHERE id=? FOR UPDATE',[id(partyId)]);
  if(!p)throw error('PARTY_NOT_FOUND',404);
  if(['SUSPENDED','CLOSED'].includes(p.current_status))throw error('PARTY_NOT_ACTIVE');
  return p;
 }
 async function command(tx,a,operation,scope,input,work,replayCheck=async()=>{}) {
  const key=ref(input.operation_key),keyHash=hash([a.account_id,operation,scope,key]);
  const fingerprint=hash(canonical(input));
  try {
   await tx.execute('INSERT INTO party_commands(id,actor_account_id,operation_code,request_fingerprint) VALUES (?,?,?,?)',[keyHash,a.account_id,operation,fingerprint]);
  } catch(e) {
   if(e.code!=='ER_DUP_ENTRY')throw e;
   const prior=await one(tx,'SELECT request_fingerprint,result_json FROM party_commands WHERE id=?',[keyHash]);
   if(!prior||prior.request_fingerprint!==fingerprint)throw error('IDEMPOTENCY_CONFLICT',409);
   if(prior.result_json===null)throw error('IDEMPOTENCY_IN_PROGRESS',409);
   const result=typeof prior.result_json==='string'?JSON.parse(prior.result_json):prior.result_json;
   await replayCheck(result);
   return result;
  }
  const result=await work();
  await tx.execute('UPDATE party_commands SET result_json=? WHERE id=?',[JSON.stringify(result),keyHash]);
  return result;
 }
 async function partyCommand(context,input,operation,authorize,work) {
  const a=await actor(context);
  return db.withTransaction(async tx=>{
   const p=await party(tx,input.party_id);await active(tx,a);
   await authorize(tx,a,p); // Re-check permissions even for an idempotent replay.
   return command(tx,a,operation,p.id,input,()=>work(tx,a,p));
  });
 }
 async function invitation(tx,a,p,input,recipient) {
  const row=await one(tx,`SELECT *,expires_at<=CURRENT_TIMESTAMP(6) AS expired FROM party_invitations WHERE id=? AND party_id=?`,[id(input.invitation_id),p.id]);
  if(!row||(recipient&&row.invitee_account_id!==a.account_id))throw error('INVITATION_NOT_FOUND',404);
  return row;
 }
 function pending(row,expected) {
  if(row.object_version!==version(expected))throw error('VERSION_CONFLICT',412);
  if(row.current_status!=='INVITED')throw error('INVITATION_NOT_PENDING',409);
  if(Number(row.expired))throw error('INVITATION_EXPIRED',422);
 }
 return Object.freeze({
  async registerAccount(context,input) {
   shape(input,['display_name']);label(input.display_name,80);const p=await principal(context);
   return db.withTransaction(async tx=>{
    const accountId=randomUUID();
    await tx.execute(`INSERT INTO identity_accounts(id,subject_ref,display_name) VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE subject_ref=identity_accounts.subject_ref`,[accountId,p.subject_ref,input.display_name]);
    const account=await one(tx,'SELECT * FROM identity_accounts WHERE subject_ref=? FOR UPDATE',[p.subject_ref]);
    if(account.current_status!=='ACTIVE')throw error('ACCOUNT_NOT_ACTIVE');
    let personal=await one(tx,"SELECT id FROM parties WHERE personal_account_id=?",[account.id]);
    if(!personal) {
     personal={id:randomUUID()};
     await tx.execute("INSERT INTO parties(id,kind,display_name,personal_account_id,created_by) VALUES (?,'PERSON',?,?,?)",[personal.id,account.display_name,account.id,account.id]);
     await tx.execute("INSERT INTO party_memberships(id,party_id,account_id,role_code,current_status) VALUES (?,?,?,'OWNER','ACTIVE')",[randomUUID(),personal.id,account.id]);
     await audit(tx,{...p,account_id:account.id},personal.id,'PERSON_REGISTERED',personal.id,1);
    }
    return {account_id:account.id,personal_party_id:personal.id};
   });
  },
  async createOrganization(context,input) {
   shape(input,['display_name','operation_key']);label(input.display_name,120);const a=await actor(context);
   return db.withTransaction(async tx=>{
    await active(tx,a);
    return command(tx,a,'CREATE_ORGANIZATION','account',input,async()=>{
     const partyId=randomUUID();
     await tx.execute("INSERT INTO parties(id,kind,display_name,created_by) VALUES (?,'ORGANIZATION',?,?)",[partyId,input.display_name,a.account_id]);
     await tx.execute("INSERT INTO party_memberships(id,party_id,account_id,role_code,current_status) VALUES (?,?,?,'OWNER','ACTIVE')",[randomUUID(),partyId,a.account_id]);
     await audit(tx,a,partyId,'ORGANIZATION_CREATED',partyId,1);
     return {party_id:partyId,current_status:'PENDING_REVIEW',object_version:1};
    },async result=>owner(tx,a,await party(tx,result.party_id),true));
   });
  },
  async listParties(context) {
   const a=await actor(context);
   const [rows]=await db.execute(`SELECT p.*,m.id AS membership_id,m.role_code,m.current_status AS membership_status,m.object_version AS membership_version
    FROM parties p JOIN party_memberships m ON p.id=m.party_id WHERE m.account_id=? AND m.current_status='ACTIVE' ORDER BY p.id`,[a.account_id]);
   const result=[];
   for(const p of rows) {
    const [capabilities]=await db.execute('SELECT code,current_status,object_version FROM party_capabilities WHERE party_id=? ORDER BY code',[p.id]);
    const actions=['SUSPENDED','CLOSED'].includes(p.current_status)?[]:['READ_PARTY'];
    if(actions.length&&p.role_code==='OWNER') {actions.push('REQUEST_CAPABILITY');if(p.kind==='ORGANIZATION')actions.push('MANAGE_MEMBERS');}
    result.push({party_id:p.id,kind:p.kind,display_name:p.display_name,current_status:p.current_status,object_version:p.object_version,
     membership_id:p.membership_id,membership_version:p.membership_version,role:p.role_code,capabilities,allowed_actions:actions});
   }
   return result;
  },
  async assertPermission(context,input) {
   shape(input,['party_id','action']);const {party_id,action}=input;
   const a=await actor(context);
   return db.withTransaction(async tx=>{
    const p=await party(tx,party_id);await active(tx,a);
    const m=await membership(tx,p.id,a.account_id);
    if(!m||m.current_status!=='ACTIVE')throw error('PARTY_ACTION_FORBIDDEN');
    if(action==='READ_PARTY')return true;
    if(action==='REQUEST_CAPABILITY') {await owner(tx,a,p);return true;}
    if(action==='MANAGE_MEMBERS') {await owner(tx,a,p,true);return true;}
    throw error('PARTY_ACTION_FORBIDDEN'); // No payment, licensing or platform-admin authority in this slice.
   });
  },
  async requestCapability(context,input) {
   shape(input,['party_id','code','operation_key']);if(!capabilityCodes.includes(input.code))throw error('INVALID_CAPABILITY',400);
   return partyCommand(context,input,'REQUEST_CAPABILITY',owner,async(tx,a,p)=>{
    let row=await one(tx,'SELECT code,current_status,object_version FROM party_capabilities WHERE party_id=? AND code=?',[p.id,input.code]);
    if(!row) {
     await tx.execute('INSERT INTO party_capabilities(party_id,code) VALUES (?,?)',[p.id,input.code]);
     await audit(tx,a,p.id,'CAPABILITY_REQUESTED',input.code,1);
     row={code:input.code,current_status:'PENDING_REVIEW',object_version:1};
    }
    return row;
   });
  },
  async inviteMember(context,input) {
   shape(input,['party_id','invitee_account_id','expires_at','operation_key']);id(input.invitee_account_id);
   const expiry=new Date(input.expires_at);
   if(typeof input.expires_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(input.expires_at)||!Number.isFinite(expiry.getTime())||expiry.toISOString()!==input.expires_at)throw error('INVALID_EXPIRY',400);
   return partyCommand(context,input,'INVITE_MEMBER',(tx,a,p)=>owner(tx,a,p,true),async(tx,a,p)=>{
    if(a.account_id===input.invitee_account_id)throw error('ALREADY_MEMBER',409);
    const target=await one(tx,"SELECT id,current_status FROM identity_accounts WHERE id=? FOR SHARE",[input.invitee_account_id]);
    if(!target||target.current_status!=='ACTIVE')throw error('INVITEE_NOT_AVAILABLE',422);
    const m=await membership(tx,p.id,target.id);
    if(m&&m.current_status!=='REVOKED')throw error('ALREADY_MEMBER',409);
    const date=expiry.toISOString().slice(0,23).replace('T',' ');
    const valid=await one(tx,'SELECT ?>CURRENT_TIMESTAMP(6) AS valid',[date]);if(Number(valid.valid)!==1)throw error('INVITATION_EXPIRED',422);
    const old=await one(tx,"SELECT *,expires_at<=CURRENT_TIMESTAMP(6) AS expired FROM party_invitations WHERE party_id=? AND invitee_account_id=? AND current_status='INVITED'",[p.id,target.id]);
    if(old&&!Number(old.expired))throw error('INVITATION_ALREADY_PENDING',409);
    if(old) {
     await tx.execute("UPDATE party_invitations SET current_status='EXPIRED',object_version=object_version+1 WHERE id=?",[old.id]);
     await audit(tx,a,p.id,'INVITATION_EXPIRED',old.id,old.object_version+1);
    }
    const invitationId=randomUUID();
    await tx.execute('INSERT INTO party_invitations(id,party_id,inviter_account_id,invitee_account_id,expires_at) VALUES (?,?,?,?,?)',[invitationId,p.id,a.account_id,target.id,date]);
    await audit(tx,a,p.id,'MEMBER_INVITED',invitationId,1);
    return {invitation_id:invitationId,party_id:p.id,invitee_account_id:target.id,current_status:'INVITED',object_version:1,expires_at:input.expires_at};
   });
  },
  async respondInvitation(context,input) {
   shape(input,['party_id','invitation_id','decision','expected_version','operation_key']);version(input.expected_version);
   if(!['ACCEPT','DECLINE'].includes(input.decision))throw error('INVALID_DECISION',400);
   return partyCommand(context,input,'RESPOND_INVITATION',async(tx,a,p)=>{
    const row=await invitation(tx,a,p,input,true);
    if(row.current_status==='INVITED'&&input.decision==='ACCEPT') {
     // Losing the right to invite must stop an outstanding invitation from granting membership.
     const inviter=await one(tx,'SELECT current_status FROM identity_accounts WHERE id=? FOR SHARE',[row.inviter_account_id]);
     const source=await membership(tx,p.id,row.inviter_account_id);
     if(!inviter||inviter.current_status!=='ACTIVE'||!source||source.current_status!=='ACTIVE'||source.role_code!=='OWNER')throw error('INVITER_NO_LONGER_AUTHORIZED');
    }
    if(row.current_status==='ACCEPTED') {
     const m=await membership(tx,p.id,a.account_id);
     if(!m||m.current_status!=='ACTIVE'||m.consent_invitation_id!==row.id)throw error('MEMBERSHIP_NOT_ACTIVE');
    }
   },async(tx,a,p)=>{
    const row=await invitation(tx,a,p,input,true);pending(row,input.expected_version);
    const next=input.decision==='ACCEPT'?'ACCEPTED':'DECLINED';
    let member=null;
    if(next==='ACCEPTED') {
     const old=await membership(tx,p.id,a.account_id);
     if(old&&old.current_status!=='REVOKED')throw error('ALREADY_MEMBER',409);
     if(old) {
      await tx.execute("UPDATE party_memberships SET current_status='ACTIVE',consent_invitation_id=?,object_version=object_version+1,updated_at=CURRENT_TIMESTAMP(6) WHERE id=?",[row.id,old.id]);
     } else {
      await tx.execute("INSERT INTO party_memberships(id,party_id,account_id,role_code,current_status,consent_invitation_id) VALUES (?,?,?,'MEMBER','ACTIVE',?)",[randomUUID(),p.id,a.account_id,row.id]);
     }
     member=await membership(tx,p.id,a.account_id);
    }
    await tx.execute('UPDATE party_invitations SET current_status=?,object_version=object_version+1,responded_at=CURRENT_TIMESTAMP(6) WHERE id=?',[next,row.id]);
    await audit(tx,a,p.id,'INVITATION_'+next,row.id,row.object_version+1);
    return {invitation_id:row.id,current_status:next,object_version:row.object_version+1,membership_id:member?.id||null,membership_version:member?.object_version||null};
   });
  },
  async revokeInvitation(context,input) {
   shape(input,['party_id','invitation_id','expected_version','operation_key']);version(input.expected_version);
   return partyCommand(context,input,'REVOKE_INVITATION',(tx,a,p)=>owner(tx,a,p,true),async(tx,a,p)=>{
    const row=await invitation(tx,a,p,input,false);pending(row,input.expected_version);
    await tx.execute("UPDATE party_invitations SET current_status='REVOKED',object_version=object_version+1,responded_at=CURRENT_TIMESTAMP(6) WHERE id=?",[row.id]);
    await audit(tx,a,p.id,'INVITATION_REVOKED',row.id,row.object_version+1);
    return {invitation_id:row.id,current_status:'REVOKED',object_version:row.object_version+1};
   });
  },
  async removeMember(context,input) {
   shape(input,['party_id','account_id','expected_version','operation_key']);id(input.account_id);version(input.expected_version);
   return partyCommand(context,input,'REMOVE_MEMBER',(tx,a,p)=>owner(tx,a,p,true),async(tx,a,p)=>{
    const m=await membership(tx,p.id,input.account_id);
    if(!m)throw error('MEMBER_NOT_FOUND',404);
    if(m.role_code==='OWNER')throw error('OWNER_REMOVAL_FORBIDDEN');
    if(m.object_version!==input.expected_version)throw error('VERSION_CONFLICT',412);
    if(m.current_status!=='ACTIVE')throw error('MEMBERSHIP_NOT_ACTIVE');
    await tx.execute("UPDATE party_memberships SET current_status='REVOKED',object_version=object_version+1,updated_at=CURRENT_TIMESTAMP(6) WHERE id=?",[m.id]);
    await audit(tx,a,p.id,'MEMBER_REMOVED',m.id,m.object_version+1);
    return {membership_id:m.id,current_status:'REVOKED',object_version:m.object_version+1};
   });
  },
  async listInvitations(context) {
   const a=await actor(context);
   const [rows]=await db.execute(`SELECT id,party_id,inviter_account_id,current_status,object_version,expires_at,
    expires_at<=CURRENT_TIMESTAMP(6) AS expired FROM party_invitations WHERE invitee_account_id=? ORDER BY created_at,id`,[a.account_id]);
   return rows.map(row=>({...row,current_status:row.current_status==='INVITED'&&Number(row.expired)?'EXPIRED':row.current_status}));
  },
 });
}
module.exports={createPartyRepository,capabilityCodes};
