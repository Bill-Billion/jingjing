'use strict';
const {randomUUID}=require('node:crypto');
const {shape,id,version,error}=require('./policy');
const A=require('../artists/context');
const scopes=['TRADE','INVOICES'];
// A grant is bound to both current memberships. Leaving and rejoining never revives it.
async function effective(tx,r){
 const p=await A.one(tx,'SELECT * FROM parties WHERE id=? FOR SHARE',[r.party_id]);
 const rows=(await tx.execute('SELECT m.*,a.current_status account_status FROM party_memberships m JOIN identity_accounts a ON a.id=m.account_id WHERE m.party_id=? AND m.account_id IN (?,?) FOR SHARE',[r.party_id,r.account_id,r.grantor_account_id]))[0];
 const target=rows.find(m=>m.account_id===r.account_id),source=rows.find(m=>m.account_id===r.grantor_account_id);
 return !!(p?.kind==='ORGANIZATION'&&p.current_status==='ACTIVE'&&target?.current_status==='ACTIVE'&&target.account_status==='ACTIVE'&&target.object_version===r.membership_version&&source?.current_status==='ACTIVE'&&source.account_status==='ACTIVE'&&source.role_code==='OWNER'&&source.object_version===r.grantor_membership_version&&A.instant(r.expires_at)>await A.now(tx));
}
async function authority(tx,a,party,scope,forbidden='ARTIST_PARTY_FORBIDDEN'){
 if(!scopes.includes(scope))throw error('INVALID_REPRESENTATIVE_SCOPE',400);
 const p=await A.one(tx,'SELECT * FROM parties WHERE id=? FOR SHARE',[id(party)]);
 if(!p||['SUSPENDED','CLOSED'].includes(p.current_status))throw error(forbidden==='TRADE_PARTY_FORBIDDEN'?forbidden:'PARTY_NOT_ACTIVE',forbidden==='TRADE_PARTY_FORBIDDEN'?403:409);
 const m=await A.one(tx,"SELECT * FROM party_memberships WHERE party_id=? AND account_id=? AND current_status='ACTIVE' FOR SHARE",[party,a.id]);
 if(m?.role_code==='OWNER')return p;
 if(m&&p.kind==='ORGANIZATION'){
  const rows=(await tx.execute("SELECT * FROM party_representations WHERE party_id=? AND account_id=? AND scope_code=? AND current_status='ACTIVE' AND expires_at>CURRENT_TIMESTAMP(3) FOR SHARE",[party,a.id,scope]))[0];
  for(const r of rows)if(await effective(tx,r))return p;
 }
 throw error(forbidden,403);
}
function methods({db,actor,party,active,owner,command,audit,membership}){
 async function load(tx,p,key){const r=await A.one(tx,'SELECT * FROM party_representations WHERE id=? AND party_id=? FOR UPDATE',[id(key),p.id]);if(!r)throw error('REPRESENTATIVE_NOT_FOUND',404);return r;}
 async function dto(tx,r){const live=await effective(tx,r);return {id:r.id,party_id:r.party_id,account_id:r.account_id,grantor_account_id:r.grantor_account_id,scope:r.scope_code,current_status:r.current_status,object_version:r.object_version,expires_at:A.instant(r.expires_at),effective:r.current_status==='ACTIVE'&&live};}
 async function run(ctx,i,op,fn){const a=await actor(ctx);return db.withTransaction(async tx=>{const p=await party(tx,i.party_id);await active(tx,a);if(p.kind!=='ORGANIZATION')throw error('REPRESENTATIVE_ORGANIZATION_REQUIRED',409);return fn(tx,a,p);});}
 return {
 async offerRepresentation(ctx,i){shape(i,['party_id','account_id','scope','expires_at','operation_key']);id(i.account_id);if(!scopes.includes(i.scope))throw error('INVALID_REPRESENTATIVE_SCOPE',400);const d=new Date(i.expires_at);if(typeof i.expires_at!=='string'||!Number.isFinite(d.getTime())||d.toISOString()!==i.expires_at)throw error('INVALID_EXPIRY',400);
  return run(ctx,i,'OFFER_REPRESENTATION',async(tx,a,p)=>{await owner(tx,a,p,true);if(p.current_status!=='ACTIVE')throw error('PARTY_NOT_ACTIVE',409);const target=await membership(tx,p.id,i.account_id),source=await membership(tx,p.id,a.account_id);if(!target||target.current_status!=='ACTIVE'||target.role_code!=='MEMBER'||i.account_id===a.account_id)throw error('REPRESENTATIVE_MEMBER_REQUIRED',409);
   if(!await A.one(tx,"SELECT id FROM identity_accounts WHERE id=? AND current_status='ACTIVE' FOR SHARE",[i.account_id]))throw error('ACCOUNT_NOT_ACTIVE',403);
   if(i.expires_at<=await A.now(tx))throw error('REPRESENTATIVE_EXPIRED',409);
   const result=await command(tx,a,'OFFER_REPRESENTATION',p.id,i,async()=>{const key=randomUUID();await tx.execute('INSERT INTO party_representations(id,party_id,account_id,grantor_account_id,membership_version,grantor_membership_version,scope_code,expires_at) VALUES (?,?,?,?,?,?,?,?)',[key,p.id,i.account_id,a.account_id,target.object_version,source.object_version,i.scope,i.expires_at.slice(0,23).replace('T',' ')]);await audit(tx,a,p.id,'REPRESENTATIVE_OFFERED',key,1);return {id:key};});
   return dto(tx,await load(tx,p,result.id));
  });
 },
 async actRepresentation(ctx,i){shape(i,['party_id','representation_id','action','expected_version','operation_key']);version(i.expected_version);if(!['ACCEPT','DECLINE','REVOKE'].includes(i.action))throw error('INVALID_REPRESENTATIVE_ACTION',400);
  return run(ctx,i,'ACT_REPRESENTATION',async(tx,a,p)=>{const r=await load(tx,p,i.representation_id);if(i.action==='REVOKE')await owner(tx,a,p,true);else if(r.account_id!==a.account_id)throw error('REPRESENTATIVE_NOT_FOUND',404);
   // Re-check authority before replay, and return the current record rather than a stale permission snapshot.
   if(i.action!=='REVOKE'&&!await effective(tx,r))throw error('REPRESENTATIVE_NO_LONGER_VALID',403);
   await command(tx,a,'ACT_REPRESENTATION',p.id,i,async()=>{if(r.object_version!==i.expected_version)throw error('VERSION_CONFLICT',412);if(i.action==='REVOKE'?!['OFFERED','ACTIVE'].includes(r.current_status):r.current_status!=='OFFERED')throw error('REPRESENTATIVE_TRANSITION_FORBIDDEN',409);const status={ACCEPT:'ACTIVE',DECLINE:'DECLINED',REVOKE:'REVOKED'}[i.action];await tx.execute('UPDATE party_representations SET current_status=?,object_version=object_version+1,updated_at=CURRENT_TIMESTAMP(6) WHERE id=?',[status,r.id]);await audit(tx,a,p.id,'REPRESENTATIVE_'+status,r.id,r.object_version+1);return {id:r.id};});return dto(tx,await load(tx,p,r.id));
  });
 },
 async listRepresentations(ctx,partyId,{after='',limit=20}={}){if(after)id(after);if(!Number.isInteger(limit)||limit<1||limit>101)throw error('INVALID_LIMIT',400);return run(ctx,{party_id:partyId},'LIST_REPRESENTATIONS',async(tx,a,p)=>{const m=await membership(tx,p.id,a.account_id);if(!m||m.current_status!=='ACTIVE')throw error('PARTY_ACTION_FORBIDDEN',403);const rows=(await tx.execute('SELECT * FROM party_representations WHERE party_id=? AND id>? '+(m.role_code==='OWNER'?'':'AND account_id=? ')+'ORDER BY id LIMIT ?',[p.id,after,...(m.role_code==='OWNER'?[]:[a.account_id]),limit]))[0];const out=[];for(const r of rows)out.push(await dto(tx,r));return out;});}
 };
}
module.exports={authority,effective,methods};
