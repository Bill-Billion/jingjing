'use strict';
const A=require('../artists/context'),G=require('./context'),{id,shape,label,error}=require('../party/policy'),{digest}=require('../governance/content');
async function start(tx,r){
 const at=await A.now(tx),end=new Date(Date.parse(at)+7*86400000).toISOString();
 // Parent relation lock serializes this capture with all new commercial orders.
 const [orders]=await tx.execute("SELECT * FROM trade_records WHERE kind='ORDER' AND current_status NOT IN ('CANCELLED','REFUNDED') AND JSON_UNQUOTE(JSON_EXTRACT(data_json,'$.quote.commercial.relation.id'))=? FOR SHARE",[r.id]);
 for(const o of orders){const d={order_sha256:o.data_sha256,acknowledgements:{},notes:[]};await tx.execute('INSERT INTO gig_handover_orders(relation_id,order_id,data_json,data_sha256) VALUES (?,?,?,?)',[r.id,o.id,JSON.stringify(d),digest(d)]);}
 return {policy:'CONTRACT_20261029',started_at:at,deadline_at:end,order_count:orders.length,new_business_allowed:false};
}
async function permit(tx,a,party,o){
 const c=o.data.quote.commercial,r=await G.load(tx,c.relation.id,'RELATION','FOR SHARE'),at=await A.now(tx);
 if(r.current_status!=='ENDED'||!r.data.handover||at>=r.data.handover.deadline_at||party!==r.owner_party_id)throw error('HANDOVER_NOT_ACTIVE',403);
 const h=await A.one(tx,'SELECT * FROM gig_handover_orders WHERE relation_id=? AND order_id=? FOR SHARE',[r.id,o.id]);
 if(!h||h.current_status==='ACKNOWLEDGED')throw error('HANDOVER_ORDER_NOT_OPEN',403);
 // A continuing consent/delegation is still necessary. Ending a relationship never grants new personality rights.
 const link=await A.one(tx,'SELECT person_id FROM artist_avatar_links WHERE avatar_id=?',[c.avatar_id]);
 if(!link)throw error('ARTIST_DELEGATION_REQUIRED',403);
 await require('../engagement/mcn').member(tx,a,party,link.person_id,'COMMERCIAL_MESSAGES');
 const ds=(await tx.execute("SELECT * FROM artist_records WHERE kind='DELEGATION' AND person_id=? AND counterparty_id=? AND current_status='ACTIVE' FOR SHARE",[link.person_id,party]))[0].map(A.checked);
 if(!ds.some(d=>d.data.relation_id===r.id&&d.data.actions.includes('READ_PROFILE')&&require('../artists/policy').active(d.data,at)))throw error('ARTIST_DELEGATION_REQUIRED',403);
 await G.checkOrder(tx,o);return r;
}
function methods({db,actor,access,save,command,match}){
 return {
 async handover(ctx,i){return db.withTransaction(async tx=>{const a=await actor(tx,ctx),r=await G.load(tx,i.record_id,'RELATION','FOR SHARE');await access(tx,a,r,i.party_id);if(!r.data.handover)throw error('HANDOVER_NOT_FOUND',404);if(i.after)id(i.after);if(!Number.isInteger(i.limit)||i.limit<1||i.limit>100)throw error('INVALID_LIMIT',400);
 const [rows]=await tx.execute('SELECT h.*,o.current_status AS order_status FROM gig_handover_orders h JOIN trade_records o ON o.id=h.order_id WHERE h.relation_id=? AND h.order_id>? ORDER BY h.order_id LIMIT ?',[r.id,i.after||'',i.limit+1]);
 return {relation_id:r.id,object_version:r.object_version,...r.data.handover,period_status:(await A.now(tx))>=r.data.handover.deadline_at?'EXPIRED':'OPEN',items:rows.slice(0,i.limit).map(x=>{const d=A.parse(x.data_json);if(digest(d)!==x.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);return {order_id:x.order_id,status:x.current_status,order_status:x.order_status,...d};}),next_cursor:rows.length>i.limit?rows[i.limit-1].order_id:null};});},
 async acknowledgeHandover(ctx,i){shape(i,['record_id','party_id','order_id','expected_version','note','operation_key']);label(i.note,2000);return db.withTransaction(async tx=>{const a=await actor(tx,ctx),r=await G.load(tx,i.record_id,'RELATION');await access(tx,a,r,i.party_id);if(!i.party_id||![r.owner_party_id,r.counterparty_id].includes(i.party_id))throw error('GIG_PARTY_FORBIDDEN',403);return command(tx,a,'HANDOVER_ACK',i,async()=>{match(r,i.expected_version);if(!r.data.handover)throw error('HANDOVER_NOT_FOUND',404);const h=await A.one(tx,'SELECT * FROM gig_handover_orders WHERE relation_id=? AND order_id=? FOR UPDATE',[r.id,id(i.order_id)]);if(!h)throw error('HANDOVER_ORDER_NOT_FOUND',404);const d=A.parse(h.data_json);if(digest(d)!==h.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);if(d.acknowledgements[i.party_id])throw error('HANDOVER_ALREADY_ACKNOWLEDGED',409);d.acknowledgements[i.party_id]={account_id:a.id,at:await A.now(tx),note:i.note};const status=Object.keys(d.acknowledgements).length===2?'ACKNOWLEDGED':'PENDING';await tx.execute('UPDATE gig_handover_orders SET current_status=?,data_json=?,data_sha256=? WHERE relation_id=? AND order_id=?',[status,JSON.stringify(d),digest(d),r.id,i.order_id]);return save(tx,a,r,r.current_status,{...r.data,handover:{...r.data.handover,last_acknowledged_order_id:i.order_id}},'HANDOVER_ACKNOWLEDGED');});});}
 };
}
module.exports={start,permit,methods};
