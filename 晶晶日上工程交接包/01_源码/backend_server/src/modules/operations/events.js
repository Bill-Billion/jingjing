'use strict';
const {digest}=require('../governance/content'),{audience}=require('./sources');
// Called inside the business transaction: rollback and idempotency include the notification.
async function publishEvent(tx,{domain,record_id,event_id,event_code,object_version,actor_account_id=null}){
 const source_key=digest([domain,event_id]);await tx.execute('INSERT INTO ops_events(source_key,domain,record_id,event_code,object_version,actor_account_id) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id',[source_key,domain,record_id,event_code,object_version,actor_account_id]);
 const [[r]]=await tx.execute('SELECT id FROM ops_events WHERE source_key=?',[source_key]);
 for(const party of await audience(tx,domain,record_id))await tx.execute('INSERT INTO ops_recipients(event_id,party_id) VALUES (?,?) ON DUPLICATE KEY UPDATE event_id=event_id',[r.id,party]);
 return Number(r.id);
}
module.exports={publishEvent};
