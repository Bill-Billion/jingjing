'use strict';
// Internal delivery boundary. No public send route or real provider is enabled here.
const {randomUUID}=require('node:crypto'),{digest}=require('../governance/content'),{error,id,ref}=require('../party/policy');
const A=require('../artists/context'),P=require('../privacy/notification-policy');
async function preferences(tx,account){const r=await A.one(tx,'SELECT * FROM privacy_preferences WHERE account_id=?',[account]);if(!r)return P.normalize({marketing:false});const d=A.parse(r.data_json);if(digest(d)!==r.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);return P.normalize(d);}
async function enqueue(tx,{account_id,party_id=null,event_id=null,category='BUSINESS',source_ref}){
 id(account_id);if(party_id)id(party_id);ref(source_ref);
 if(!['BUSINESS','MARKETING'].includes(category)||category==='BUSINESS'&&(!party_id||!event_id))throw error('INVALID_NOTIFICATION',400);
 const source=digest([account_id,party_id,category,source_ref]);
 await tx.execute('INSERT INTO notification_deliveries(id,source_key,account_id,party_id,event_id,category) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id',[randomUUID(),source,account_id,party_id,event_id,category]);
 return A.one(tx,'SELECT * FROM notification_deliveries WHERE source_key=?',[source]);
}
async function enqueueEvent(tx,event,parties){
 for(const party of parties){const [rows]=await tx.execute("SELECT m.account_id,p.data_json,p.data_sha256 FROM party_memberships m JOIN identity_accounts a ON a.id=m.account_id JOIN privacy_preferences p ON p.account_id=a.id WHERE m.party_id=? AND m.current_status='ACTIVE' AND a.current_status='ACTIVE' ORDER BY m.account_id",[party]);
  for(const r of rows){const p=A.parse(r.data_json);if(digest(p)!==r.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);if(p.push_enabled)await enqueue(tx,{account_id:r.account_id,party_id:party,event_id:event,source_ref:'event:'+event});}
 }
}
async function authorized(tx,r,a){
 if(a.current_status!=='ACTIVE')return false;
 if(r.category==='MARKETING')return true;
 const m=await A.one(tx,"SELECT m.id FROM party_memberships m JOIN parties p ON p.id=m.party_id WHERE m.account_id=? AND m.party_id=? AND m.current_status='ACTIVE' AND p.current_status NOT IN ('SUSPENDED','CLOSED')",[a.id,r.party_id]);if(!m)return false;
 const e=await A.one(tx,'SELECT e.* FROM ops_events e JOIN ops_recipients r ON r.event_id=e.id WHERE e.id=? AND r.party_id=?',[r.event_id,r.party_id]);if(!e)return false;
 try{await require('./sources').readSource(tx,{subject_ref:a.subject_ref,request_id:randomUUID()},e.domain,e.record_id,r.party_id);return true;}catch(e){if([401,403,404].includes(e.status))return false;throw e;}
}
function createPushDelivery(db,{provider=null,environment=process.env.NODE_ENV}={}){
 // Synthetic adapters may only run in an explicitly isolated test environment.
 const ready=()=>environment==='test'&&provider?.environment==='SANDBOX'&&typeof provider.send==='function';
 async function finish(record,result){const status=result?.status==='ACCEPTED'?'ACCEPTED':result?.status==='FAILED'?'FAILED':'UNKNOWN';const receipt=typeof result?.receipt_id==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(result.receipt_id)?result.receipt_id:null;await db.execute("UPDATE notification_deliveries SET current_status=?,provider_receipt=?,reason=? WHERE id=? AND current_status IN ('DISPATCHING','UNKNOWN')",[status,receipt,status==='UNKNOWN'?'PROVIDER_RESULT_UNKNOWN':null,record.id]);return {id:record.id,status,simulated:true};}
 return {
  status:()=>({configured:ready(),environment:ready()?'SANDBOX':'DISABLED',real_services_enabled:false}),
  async dispatch(recordId){id(recordId);if(!ready())return {id:recordId,status:'PROVIDER_NOT_CONFIGURED',simulated:false};
   const claim=await db.withTransaction(async tx=>{
    const found=await A.one(tx,'SELECT * FROM notification_deliveries WHERE id=?',[recordId]);if(!found)throw error('NOTIFICATION_NOT_FOUND',404);
    const account=await A.one(tx,'SELECT * FROM identity_accounts WHERE id=? FOR UPDATE',[found.account_id]);
    const r=await A.one(tx,'SELECT * FROM notification_deliveries WHERE id=? FOR UPDATE',[recordId]);
    if(!['PENDING','DEFERRED'].includes(r.current_status))return {send:false,result:{id:r.id,status:r.current_status,simulated:!!r.simulated}};
    if(!account||!await authorized(tx,r,account)){await tx.execute("UPDATE notification_deliveries SET current_status='SUPPRESSED',reason='ACCESS_REVOKED' WHERE id=?",[r.id]);return {send:false,result:{id:r.id,status:'SUPPRESSED',reason:'ACCESS_REVOKED'}};}
    const at=await A.now(tx),day=new Date(Date.parse(at)+8*3600000).toISOString().slice(0,10),start=new Date(day+'T00:00:00+08:00').toISOString().slice(0,23).replace('T',' ');
    const [[count]]=await tx.execute("SELECT COUNT(*) n FROM notification_deliveries WHERE account_id=? AND category='MARKETING' AND dispatched_at>=?",[account.id,start]);
    const d=P.decision(await preferences(tx,account.id),r.category,at,Number(count.n));
    if(d.status!=='READY'){await tx.execute('UPDATE notification_deliveries SET current_status=?,reason=?,retry_at=? WHERE id=?',[d.status,d.reason,d.retry_at?.slice(0,23).replace('T',' ')||null,r.id]);return {send:false,result:{id:r.id,...d}};}
    await tx.execute("UPDATE notification_deliveries SET current_status='DISPATCHING',reason=NULL,retry_at=NULL,dispatched_at=CURRENT_TIMESTAMP(3),simulated=TRUE WHERE id=?",[r.id]);
    return {send:true,record:r};
   });
   if(!claim.send)return claim.result;
   // No story, contract, financial amount or message text is sent to a push vendor.
   try{return await finish(claim.record,await provider.send({request_key:claim.record.id,account_id:claim.record.account_id,category:claim.record.category,title:'你有一条新消息，请登录查看'}));}catch{return finish(claim.record,null);}
  },
  async reconcile(recordId){id(recordId);if(!ready()||typeof provider.query!=='function')return {id:recordId,status:'QUERY_NOT_CONFIGURED'};
   const r=await A.one(db,"SELECT *,TIMESTAMPDIFF(SECOND,dispatched_at,CURRENT_TIMESTAMP(3)) age FROM notification_deliveries WHERE id=?",[recordId]);if(!r)throw error('NOTIFICATION_NOT_FOUND',404);
   if(!['UNKNOWN','DISPATCHING'].includes(r.current_status))return {id:r.id,status:r.current_status};
   if(r.current_status==='DISPATCHING'&&Number(r.age)<300)return {id:r.id,status:'DISPATCHING'};
   // Query only. A lost response never triggers an automatic second send.
   try{return finish(r,await provider.query({request_key:r.id}));}catch{return finish(r,null);}
  }
 };
}
module.exports={enqueue,enqueueEvent,createPushDelivery,preferences};
