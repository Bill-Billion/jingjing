"use strict";
const {randomUUID}=require('node:crypto'),A=require('../artists/context'),{shape,id,ref,error}=require('../party/policy'),{digest}=require('../governance/content');
const channels=['ORDER_CONVERSATIONS','SUBMISSION_INTENTS','ACTIVITY_VOTING','SYSTEM'];
function channel(r){return ['AUDITION_MESSAGE','GIG_MESSAGE'].includes(r.domain)||r.event_code==='COMMENT_CREATED'?'ORDER_CONVERSATIONS':r.domain==='NOTICES'?'SUBMISSION_INTENTS':r.domain==='ENGAGEMENT'?'ACTIVITY_VOTING':'SYSTEM';}
async function allowed(source,tx,a,r,party){try{await source(tx,a,{...r,party_id:party});return true;}catch(e){if([403,404,409].includes(e.status))return false;throw e;}}
function methods(db,internal){const {actor,member,source}=internal;return {
 async unread(ctx,i){shape(i,['party_id']);return db.withTransaction(async tx=>{
  const a=await actor(tx,ctx);await member(tx,a,i.party_id);const items=[],counts=Object.fromEntries(channels.map(c=>[c,0]));let after='0';
  // Capture the exact currently visible set. An ID/time ceiling alone can swallow
  // a transaction allocated earlier but committed after this request.
  for(;;){const [rows]=await tx.execute('SELECT e.* FROM ops_events e JOIN ops_recipients nr ON nr.event_id=e.id LEFT JOIN ops_reads rd ON rd.event_id=e.id AND rd.account_id=? AND rd.party_id=nr.party_id WHERE nr.party_id=? AND rd.event_id IS NULL AND e.id>? ORDER BY e.id LIMIT 200',[a.id,i.party_id,after]);for(const r of rows){if(await allowed(source,tx,a,r,i.party_id)){const c=channel(r);counts[c]++;items.push({id:String(r.id),channel:c});}}if(rows.length<200)break;after=String(rows.at(-1).id);}
  await tx.execute('DELETE FROM ops_read_snapshots WHERE account_id=? AND expires_at<=CURRENT_TIMESTAMP(3)',[a.id]);
  const snapshot=randomUUID();await tx.execute('INSERT INTO ops_read_snapshots(id,account_id,party_id,event_ids_json,content_sha256,expires_at) VALUES (?,?,?,?,?,DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL 1 HOUR))',[snapshot,a.id,i.party_id,JSON.stringify(items),digest(items)]);
  const r=await A.one(tx,'SELECT created_at,expires_at FROM ops_read_snapshots WHERE id=?',[snapshot]);return {total:items.length,channels:counts,snapshot_id:snapshot,as_of:A.instant(r.created_at),expires_at:A.instant(r.expires_at),coverage:'CURRENT_AUTHORIZED_NOTIFICATIONS'};
 });},
 async readAll(ctx,i){shape(i,['party_id','snapshot_id','channel','operation_key']);id(i.snapshot_id);if(i.channel!==null&&!channels.includes(i.channel))throw error('INVALID_NOTIFICATION_CHANNEL',400);return db.withTransaction(async tx=>{
  const a=await actor(tx,ctx);await member(tx,a,i.party_id);const key=digest([a.id,'NOTIFICATION_READ_ALL',ref(i.operation_key)]),fingerprint=digest(i);
  try{await tx.execute('INSERT INTO ops_read_commands(id,fingerprint) VALUES (?,?)',[key,fingerprint]);}catch(e){if(e.code!=='ER_DUP_ENTRY')throw e;const r=await A.one(tx,'SELECT * FROM ops_read_commands WHERE id=?',[key]);if(r.fingerprint!==fingerprint)throw error('IDEMPOTENCY_CONFLICT',409);if(!r.result_json)throw error('IDEMPOTENCY_IN_PROGRESS',409);const result=A.parse(r.result_json);if(digest(result)!==r.result_sha256)throw error('STORED_CONTENT_MISMATCH',503);return result;}
  const snapshot=await A.one(tx,'SELECT *,expires_at>CURRENT_TIMESTAMP(3) AS valid FROM ops_read_snapshots WHERE id=? AND account_id=? AND party_id=? FOR UPDATE',[i.snapshot_id,a.id,i.party_id]);if(!snapshot||!Number(snapshot.valid))throw error('NOTIFICATION_SNAPSHOT_EXPIRED',409);const entries=A.parse(snapshot.event_ids_json);if(digest(entries)!==snapshot.content_sha256)throw error('STORED_CONTENT_MISMATCH',503);
  let marked=0,skipped=0;for(const item of entries){if(i.channel&&i.channel!==item.channel)continue;const r=await A.one(tx,'SELECT e.* FROM ops_events e JOIN ops_recipients nr ON nr.event_id=e.id WHERE e.id=? AND nr.party_id=?',[item.id,i.party_id]);if(!r||!await allowed(source,tx,a,r,i.party_id)){skipped++;continue;}const [change]=await tx.execute('INSERT IGNORE INTO ops_reads(event_id,account_id,party_id) VALUES (?,?,?)',[item.id,a.id,i.party_id]);marked+=change.affectedRows;}
  const result={snapshot_id:snapshot.id,as_of:A.instant(snapshot.created_at),marked_count:marked,skipped_count:skipped};await tx.execute('UPDATE ops_read_commands SET result_json=?,result_sha256=? WHERE id=?',[JSON.stringify(result),digest(result),key]);return result;
 });}
 };}
async function markSourceRead(tx,account,party,domain,ids){if(!party||!ids.length)return;for(const key of ids)await tx.execute('INSERT IGNORE INTO ops_reads(event_id,account_id,party_id) SELECT e.id,?,nr.party_id FROM ops_events e JOIN ops_recipients nr ON nr.event_id=e.id WHERE nr.party_id=? AND e.domain=? AND e.record_id=?',[account,party,domain,key]);}
module.exports={channels,channel,methods,markSourceRead};
