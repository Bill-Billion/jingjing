'use strict';
const {randomBytes}=require('node:crypto'),{shape,id,error}=require('../party/policy');
const A=require('../artists/context'),C=require('./context'),P=require('./policy'),{digest}=require('../governance/content');
const tokenPattern=/^[a-f0-9-]{36}\.[a-f0-9]{64}$/;
function view(r){return {id:r.id,room_id:r.parent_id,current_status:r.current_status,object_version:r.object_version,expires_at:r.data.expires_at};}
function methods({db,actor,host}){return {
 async createInviteLink(ctx,i){shape(i,['record_id','party_id','expected_version','operation_key']);return db.withTransaction(async tx=>{
  const a=await actor(tx,ctx),room=await C.load(tx,i.record_id,'ROOM');await host(tx,a,room,i.party_id);const now=await A.now(tx);P.beforeDeadline(room,now);
  const result=await C.command(tx,a,'INVITE_LINK_CREATE',i,async()=>{
   A.match(room,i.expected_version);const [existing]=await tx.execute("SELECT id FROM cocreation_records WHERE kind='INVITE_LINK' AND parent_id=?",[room.id]);
   if(existing.length>=100)throw error('COCREATION_INVITE_LINK_LIMIT',409);
   const secret=randomBytes(32).toString('hex'),expires=new Date(Math.min(Date.parse(room.data.deadline),Date.parse(now)+24*3600000)).toISOString();
   const link=await C.insert(tx,a,'INVITE_LINK',room.owner_party_id,room.id,'ACTIVE',{secret_sha256:digest(secret),expires_at:expires},null);
   return {...view(link),token:link.id+'.'+secret,participation_required:true};
  });
  const current=await C.load(tx,result.id,'INVITE_LINK');if(current.current_status!=='ACTIVE'||current.data.expires_at<=now)throw error('COCREATION_INVITE_LINK_UNAVAILABLE',409);
  return result;
 });},
 async inviteLinks(ctx,i){shape(i,['record_id','party_id']);return db.withTransaction(async tx=>{const a=await actor(tx,ctx),r=await C.load(tx,i.record_id,'ROOM');await host(tx,a,r,i.party_id);const [rows]=await tx.execute("SELECT * FROM cocreation_records WHERE kind='INVITE_LINK' AND parent_id=? ORDER BY id",[r.id]);return {items:rows.map(C.checked).map(view)};});},
 async revokeInviteLink(ctx,i){shape(i,['record_id','party_id','expected_version','operation_key']);return db.withTransaction(async tx=>{
  const a=await actor(tx,ctx),raw=await C.load(tx,i.record_id,'INVITE_LINK',''),room=await C.load(tx,raw.parent_id,'ROOM');await host(tx,a,room,i.party_id);const link=await C.load(tx,raw.id,'INVITE_LINK');
  return C.command(tx,a,'INVITE_LINK_REVOKE',i,async()=>{A.match(link,i.expected_version);if(link.current_status!=='ACTIVE')throw error('COCREATION_INVITE_LINK_UNAVAILABLE',409);return view(await C.save(tx,a,link,'REVOKED',link.data,'COCREATION_INVITE_LINK_REVOKED'));});
 });},
 async claimInviteLink(ctx,i){shape(i,['token','person_id','party_id','operation_key']);if(typeof i.token!=='string'||!tokenPattern.test(i.token))throw error('COCREATION_INVITE_LINK_UNAVAILABLE',404);
  const [key,secret]=i.token.split('.');id(key);return db.withTransaction(async tx=>{
   const a=await actor(tx,ctx),p=await A.person(tx,id(i.person_id));await A.self(tx,a,p,i.party_id);require('../artists/policy').adult(p,await A.now(tx));
   const raw=await A.one(tx,"SELECT * FROM cocreation_records WHERE id=? AND kind='INVITE_LINK'",[key]);
   if(!raw)throw error('COCREATION_INVITE_LINK_UNAVAILABLE',404);const first=C.checked(raw);if(first.data.secret_sha256!==digest(secret))throw error('COCREATION_INVITE_LINK_UNAVAILABLE',404);
   const room=await C.load(tx,first.parent_id,'ROOM'),link=await C.load(tx,key,'INVITE_LINK'),now=await A.now(tx);
   const owner=await A.one(tx,"SELECT id FROM identity_accounts WHERE id=? AND current_status='ACTIVE' FOR SHARE",[room.created_by]);
   if(!owner)throw error('COCREATION_INVITE_LINK_UNAVAILABLE',404);await host(tx,owner,room,room.owner_party_id);
   P.beforeDeadline(room,now);
   if(link.data.expires_at<=now||link.current_status==='REVOKED')throw error('COCREATION_INVITE_LINK_UNAVAILABLE',409);
   return C.command(tx,a,'INVITE_LINK_CLAIM',i,async()=>{
    if(link.current_status!=='ACTIVE')throw error('COCREATION_INVITE_LINK_UNAVAILABLE',409);
    const existing=await A.one(tx,"SELECT * FROM cocreation_records WHERE kind='INVITE' AND parent_id=? AND source_key=? FOR UPDATE",[room.id,digest(['INVITE',[room.id,p.id]])]);
    const invite=existing?C.checked(existing):await C.insert(tx,a,'INVITE',p.owner_party_id,room.id,'INVITED',{person_id:p.id,room_id:room.id},[room.id,p.id]);
    await C.save(tx,a,link,'CLAIMED',{...link.data,claimed_by:a.id,person_id:p.id,invitation_id:invite.id},'COCREATION_INVITE_LINK_CLAIMED');
    return {invitation_id:invite.id,room_id:room.id,person_id:p.id,current_status:'INVITED',participation_required:true};
   });
  });
 }
};}
module.exports={methods};
