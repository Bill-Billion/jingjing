 'use strict';
const express=require('express');
const {randomUUID}=require('node:crypto');
const {createAuthRepository}=require('../modules/auth/repository');
const {createPartyRepository}=require('../modules/party/repository');
const {createOperationsRouter,mysqlReady}=require('./operations');
const {error,shape,ref,id,version}=require('../modules/party/policy');
function createAccountApi({db,secret,sms,authSettings={},allowedOrigins=[]}) {
 const auth=createAuthRepository(db,{secret,sms,settings:authSettings});
 const principals=new WeakMap();
 const party=createPartyRepository(db,{resolvePrincipal:async req=>principals.get(req)||null});
 const app=express();app.disable('x-powered-by');app.disable('etag');app.set('trust proxy',false);app.set('query parser','simple');
 const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 app.use((req,res,next)=>{
  req.requestId=randomUUID();res.set('X-Request-Id',req.requestId);res.set('Cache-Control','no-store');
  try{if(req.get('X-Request-Id'))req.requestId=ref(req.get('X-Request-Id'));res.set('X-Request-Id',req.requestId);next();}catch(e){next(e);}
 });
 app.use((req,res,next)=>{
  const origin=req.get('Origin');
  if(origin&&allowedOrigins.includes(origin)){res.set('Access-Control-Allow-Origin',origin);res.vary('Origin');res.set('Access-Control-Allow-Headers','Authorization, Content-Type, X-Request-Id, X-Acting-Party, Idempotency-Key, If-Match');res.set('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');res.set('Access-Control-Expose-Headers','X-Request-Id, ETag');}
  if(req.method==='OPTIONS'){if(!origin||!allowedOrigins.includes(origin))return next(error('ORIGIN_NOT_ALLOWED',403));return res.status(204).end();}next();
 });
 app.use(express.json({limit:'16kb',strict:true}));
 app.use(createOperationsRouter({databaseReady:mysqlReady(db)}));
 const meta=req=>({request_id:req.requestId,actor:req.account?{account_id:req.account.id}:null,acting_party:req.actingParty||null});
 function reply(req,res,data,status=200){res.status(status).json({meta:meta(req),data});}
 const key=req=>ref(req.get('Idempotency-Key'));
 function expected(req){const value=req.get('If-Match');if(!value)throw error('EXPECTED_VERSION_REQUIRED',428);if(!/^"[1-9][0-9]*"$/.test(value))throw error('INVALID_VERSION',400);return version(Number(value.slice(1,-1)));}
 function acting(req){const header=req.get('X-Acting-Party');if(!header)throw error('ACTING_PARTY_REQUIRED',400);id(header);if(header!==req.params.party_id)throw error('ACTING_PARTY_MISMATCH',403);req.actingParty=header;return header;}
 function page(req,scope){
  shape(req.query,['cursor','limit']);const limit=req.query.limit===undefined?20:Number(req.query.limit);
  if(!Number.isInteger(limit)||limit<1||limit>100||Array.isArray(req.query.limit))throw error('INVALID_LIMIT',400);
  let after='';if(req.query.cursor!==undefined){try{
   if(typeof req.query.cursor!=='string'||req.query.cursor.length>512)throw Error();
   const [encoded,mac,extra]=req.query.cursor.split('.');if(extra||!encoded||!mac||!/^[a-f0-9]{64}$/.test(mac))throw Error();
   if(!auth.secure.matches(auth.secure.digest('cursor',[req.account.id,scope,encoded]),mac))throw Error();
   after=id(Buffer.from(encoded,'base64url').toString('utf8'));
  }catch{throw error('INVALID_CURSOR',400);}}
  return {after,limit};
 }
 function pageData(req,scope,rows,limit,identity,transform=x=>x){const more=rows.length>limit,items=rows.slice(0,limit);let next=null;
  if(more){const encoded=Buffer.from(identity(items.at(-1))).toString('base64url');next=encoded+'.'+auth.secure.digest('cursor',[req.account.id,scope,encoded]);}
  return {items:items.map(transform),next_cursor:next};
 }
 const partyData=p=>({id:p.party_id,kind:p.kind,display_name:p.display_name,current_status:p.current_status,object_version:p.object_version,capabilities:p.capabilities.map(c=>({code:c.code,current_status:c.current_status,allowed_actions:[]})),allowed_actions:p.allowed_actions});
 const membershipData=(p,accountId)=>({id:p.membership_id,account_id:accountId,party_id:p.party_id,current_status:'ACTIVE',roles:[p.role],object_version:p.membership_version,allowed_actions:[]});
 app.post('/api/v1/auth/sms-challenges',wrap(async(req,res)=>reply(req,res,await auth.challenge(req.body,key(req),req.socket.remoteAddress))));
 app.post('/api/v1/auth/sessions',wrap(async(req,res)=>{const data=await auth.login(req.body,key(req),req.socket.remoteAddress);req.account={id:data.account.id};reply(req,res,data);}));
 app.use('/api/v1',(req,res,next)=>{
  Promise.resolve().then(async()=>{
   const header=req.get('Authorization');if(!header||!/^Bearer [A-Za-z0-9_-]{43}$/.test(header))throw error('AUTHENTICATION_REQUIRED',401);
   req.token=header.slice(7);req.account=await auth.resolve(req.token,{allowRevoked:req.method==='DELETE'&&req.path==='/auth/sessions/current'});principals.set(req,{subject_ref:req.account.subject_ref,request_id:req.requestId});
  }).then(()=>next(),next);
 });
 app.get('/api/v1/me',wrap(async(req,res)=>{res.set('ETag','"'+req.account.object_version+'"');reply(req,res,auth.accountData(req.account));}));
 app.delete('/api/v1/auth/sessions/current',wrap(async(req,res)=>{shape(req.body||{},[]);key(req);reply(req,res,await auth.revoke(req.token));}));
 app.get('/api/v1/me/parties',wrap(async(req,res)=>{
  const scope='parties',p=page(req,scope),rows=await party.listParties(req,{after:p.after,limit:p.limit+1});
  reply(req,res,pageData(req,scope,rows,p.limit,x=>x.party_id,x=>({party:partyData(x),membership:membershipData(x,req.account.id)})));
 }));
 app.post('/api/v1/organizations',wrap(async(req,res)=>{shape(req.body,['display_name']);reply(req,res,await party.createOrganization(req,{display_name:req.body.display_name,operation_key:key(req)}));}));
 app.get('/api/v1/parties/:party_id',wrap(async(req,res)=>{
  const partyId=acting(req),rows=await party.listParties(req,{partyId,limit:1});if(!rows.length)throw error('PARTY_NOT_FOUND',404);
  res.set('ETag','"'+rows[0].object_version+'"');reply(req,res,partyData(rows[0]));
 }));
 app.patch('/api/v1/parties/:party_id',wrap(async(req,res)=>{
  const partyId=acting(req);shape(req.body,['display_name']);
  const data=await party.changeDisplayName(req,{party_id:partyId,display_name:req.body.display_name,operation_key:key(req),expected_version:expected(req)});
  res.set('ETag','"'+data.object_version+'"');reply(req,res,data);
 }));
 app.post('/api/v1/parties/:party_id/capabilities',wrap(async(req,res)=>{
  const partyId=acting(req);shape(req.body,['code']);const row=await party.requestCapability(req,{party_id:partyId,code:req.body.code,operation_key:key(req)});
  reply(req,res,{code:row.code,current_status:row.current_status,allowed_actions:[]});
 }));
 app.get('/api/v1/me/invitations',wrap(async(req,res)=>{
  const scope='invitations',p=page(req,scope),rows=await party.listInvitations(req,{after:p.after,limit:p.limit+1});
  reply(req,res,pageData(req,scope,rows,p.limit,x=>x.id,x=>({invitation_id:x.id,party_id:x.party_id,inviter_account_id:x.inviter_account_id,current_status:x.current_status,object_version:x.object_version,expires_at:x.expires_at.replace(' ','T')+'Z'})));
 }));
 app.get('/api/v1/parties/:party_id/members',wrap(async(req,res)=>{
  const partyId=acting(req),scope='members:'+partyId,p=page(req,scope),rows=await party.listMembers(req,partyId,{after:p.after,limit:p.limit+1});reply(req,res,pageData(req,scope,rows,p.limit,x=>x.id));
 }));
 app.post('/api/v1/parties/:party_id/invitations',wrap(async(req,res)=>{
  const partyId=acting(req);shape(req.body,['invitee_account_id','expires_at']);reply(req,res,await party.inviteMember(req,{party_id:partyId,...req.body,operation_key:key(req)}));
 }));
 app.post('/api/v1/parties/:party_id/invitations/:invitation_id/responses',wrap(async(req,res)=>{
  const partyId=acting(req);id(req.params.invitation_id);shape(req.body,['decision']);reply(req,res,await party.respondInvitation(req,{party_id:partyId,invitation_id:req.params.invitation_id,decision:req.body.decision,expected_version:expected(req),operation_key:key(req)}));
 }));
 app.post('/api/v1/parties/:party_id/invitations/:invitation_id/revocations',wrap(async(req,res)=>{
  const partyId=acting(req);id(req.params.invitation_id);shape(req.body||{},[]);reply(req,res,await party.revokeInvitation(req,{party_id:partyId,invitation_id:req.params.invitation_id,expected_version:expected(req),operation_key:key(req)}));
 }));
 app.delete('/api/v1/parties/:party_id/members/:account_id',wrap(async(req,res)=>{
  const partyId=acting(req);id(req.params.account_id);shape(req.body||{},[]);reply(req,res,await party.removeMember(req,{party_id:partyId,account_id:req.params.account_id,expected_version:expected(req),operation_key:key(req)}));
 }));
 app.use((req,res,next)=>next(error('NOT_FOUND',404)));
 app.use((e,req,res,next)=>{
  // Never expose SQL, upstream bodies, phone, code, token or request body.
  const client=Number.isInteger(e.status)&&e.status>=400&&e.status<500;
  const safeCode=typeof e.code==='string'&&/^[A-Z][A-Z0-9_]*$/.test(e.code);
  const status=e.type==='entity.parse.failed'?400:e.type==='entity.too.large'?413:client?e.status:503;
  const code=e.type==='entity.parse.failed'?'INVALID_JSON':e.type==='entity.too.large'?'BODY_TOO_LARGE':((client&&safeCode)||['SMS_NOT_READY','SMS_CHALLENGE_UNAVAILABLE','COMMIT_OUTCOME_UNKNOWN'].includes(e.code)?e.code:'SERVICE_UNAVAILABLE');
  res.status(status).json({meta:meta(req),error:{code,message:status===503?'服务暂不可用，请稍后核对状态':'请求未通过校验或权限检查',retryable:false,details:[]}});
 });
 return app;
}
module.exports={createAccountApi};
