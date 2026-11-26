'use strict';
const assert=require('node:assert/strict'),{randomUUID:key}=require('node:crypto');

// The original championship journey supplies real votes and reviews. No ops event
// or recipient is inserted here to manufacture an activity notification.
module.exports=async({t,db,S,invoke,base,fixtures,records,second,firstVote,balance})=>{
 const {buyer,buyer2,reviewer}=S;
 async function call(method,url,{person=buyer,party=person.personal_party_id,body,op=key(),schema='NotificationUnreadResponse'}={}){
  const response=await fetch(base+url,{method,headers:{Authorization:'Bearer '+person.token,'X-Acting-Party':party,...body!==undefined?{'Content-Type':'application/json','Idempotency-Key':op}:{}},...body!==undefined?{body:JSON.stringify(body)}:{}});
  const value=await response.json();fixtures.push({method,path:new URL(base+url).pathname,schema:response.ok?schema:'ErrorResponse',value});return{status:response.status,...value};
 }
 const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;};
 const bad=(r,status,code)=>{assert.equal(r.status,status,JSON.stringify(r));if(code)assert.equal(r.error.code,code);};
 const unread=async(options)=>ok(await call('GET','/operations/notifications/unread',options));
 const feed=(query='',options={})=>call('GET','/operations/notifications/feed?limit=100'+query,{schema:'NotificationFeedResponse',...options});
 const clear=(snapshot_id,op=key(),options={})=>call('POST','/operations/notifications/read-all',{body:{snapshot_id,channel:'ACTIVITY_VOTING'},op,schema:'NotificationReadAllResponse',...options});
 let snapshot,later,originalOp,originalResult,initialCount,initialSystem;
 records.activity_notifications={original_vote_id:firstVote.id,competition_id:second.id,synthetic_only:true,ops_events_inserted_by_test:false};
 const result=records.activity_notifications;
 await t.test('actual vote and appeal sources enter only the entitled activity inbox',async()=>{
  snapshot=await unread();initialCount=snapshot.channels.ACTIVITY_VOTING;initialSystem=snapshot.channels.SYSTEM;
  assert(initialCount>10,'Original real vote/review activity must be present');assert(initialSystem>0,'Original stock order must supply another real channel');
  const items=ok(await feed('&channel=ACTIVITY_VOTING')).items;
  const original=items.filter(x=>x.domain==='ENGAGEMENT'&&x.record_id===firstVote.id);
  assert(original.length>=3);assert(original.some(x=>x.event_code==='VOTE_POINTS_COMMITTED'));
  for(const item of original){assert.equal(item.channel,'ACTIVITY_VOTING');assert.equal(item.target.domain,'ENGAGEMENT');assert.equal(item.target.record_id,firstVote.id);assert.equal(item.read,false);}
  assert.equal((await unread({person:buyer2})).channels.ACTIVITY_VOTING,0);
  assert.equal(ok(await feed('&channel=ACTIVITY_VOTING',{person:buyer2})).items.some(x=>x.record_id===firstVote.id),false);
  bad(await call('GET','/operations/notifications/unread',{person:buyer2,party:buyer.personal_party_id}),403);
  result.initial_count=initialCount;result.initial_system=initialSystem;result.original_vote_event_ids=original.map(x=>x.id);
 });
 await t.test('old activity cutoff clears once while a later real appeal and other channels stay unread',async()=>{
  later=await invoke('appeal',buyer,{party_id:buyer.personal_party_id,event_id:second.id,reason:'Synthetic second-event appeal after the notification cutoff'});result.later_appeal_id=later.id;
  assert.equal((await unread()).channels.ACTIVITY_VOTING,initialCount+1);
  originalOp=key();const replies=await Promise.all([1,2].map(()=>clear(snapshot.snapshot_id,originalOp)));
  originalResult=ok(replies[0]);assert.deepEqual(ok(replies[1]),originalResult);assert.equal(originalResult.marked_count,initialCount);
  const current=await unread();assert.equal(current.channels.ACTIVITY_VOTING,1);assert.equal(current.channels.SYSTEM,initialSystem);
  assert(ok(await feed('&channel=ACTIVITY_VOTING&unread_only=true')).items.some(x=>x.record_id===later.id&&!x.read));
  assert.equal(await balance(),1100);result.cutoff_marked_count=originalResult.marked_count;
 });
 await t.test('committed original read-all recovers after snapshot expiry but current authority is still required',async()=>{
  // Only this disposable read snapshot expires; business facts and credentials do not change.
  await db.execute("UPDATE ops_read_snapshots SET expires_at='2020-01-01' WHERE id=?",[snapshot.snapshot_id]);
  assert.deepEqual(ok(await clear(snapshot.snapshot_id,originalOp)),originalResult);
  bad(await clear(snapshot.snapshot_id),409,'NOTIFICATION_SNAPSHOT_EXPIRED');
  bad(await clear(snapshot.snapshot_id,originalOp,{body:{snapshot_id:snapshot.snapshot_id,channel:'SYSTEM'}}),409,'IDEMPOTENCY_CONFLICT');
  await db.execute("UPDATE party_memberships SET current_status='REVOKED' WHERE account_id=? AND party_id=?",[buyer.account_id,buyer.personal_party_id]);
  try{bad(await clear(snapshot.snapshot_id,originalOp),403);bad(await feed(),403);}
  finally{await db.execute("UPDATE party_memberships SET current_status='ACTIVE' WHERE account_id=? AND party_id=?",[buyer.account_id,buyer.personal_party_id]);}
  assert.equal((await unread()).channels.ACTIVITY_VOTING,1);assert.equal(await balance(),1100);result.original_replay_after_expiry=true;
 });
 await t.test('activity pagination and single-read use the same source and receipt without cross-account access',async()=>{
  let before=null;const ids=[];
  do{const page=ok(await call('GET','/operations/notifications/feed?limit=3'+(before?'&cursor='+before:''),{schema:'NotificationFeedResponse'}));ids.push(...page.items.map(x=>x.id));before=page.next_cursor;assert(ids.length<300,'Bounded original fixture pagination');}while(before);
  assert.equal(new Set(ids).size,ids.length);assert(result.original_vote_event_ids.every(id=>ids.includes(id)));
  const item=ok(await feed('&channel=ACTIVITY_VOTING&unread_only=true')).items.find(x=>x.record_id===later.id);assert(item);
  const url='/operations/notifications/'+item.id+'/read';bad(await call('POST',url,{person:buyer2,body:{},schema:'OpsReadResponse'}),404,'NOTIFICATION_NOT_FOUND');
  const first=ok(await call('POST',url,{body:{},schema:'OpsReadResponse'}));assert.deepEqual(ok(await call('POST',url,{body:{},schema:'OpsReadResponse'})),first);
  assert.equal((await unread()).channels.ACTIVITY_VOTING,0);assert.equal((await unread()).channels.SYSTEM,initialSystem);result.paginated_unique_events=ids.length;
 });
 await t.test('failed multi-event read rolls back and the original key recovers actual review notifications',async()=>{
  await invoke('resolveAppeal',reviewer,{record_id:later.id,expected_version:later.object_version,reason:'Synthetic independent review of the same later appeal'});
  const [[row]]=await db.execute("SELECT id,object_version FROM engagement_records WHERE kind='VOTE' AND parent_id=? AND current_status='VALID' LIMIT 1",[second.id]);assert(row);
  await invoke('voteReview',reviewer,{record_id:row.id,expected_version:row.object_version,decision:'SUSPEND',reason:'Synthetic current second-event vote review'});
  const view=await unread();assert.equal(view.channels.ACTIVITY_VOTING,2);
  const events=ok(await feed('&channel=ACTIVITY_VOTING&unread_only=true')).items;assert.equal(events.length,2);
  const last=Math.max(...events.map(x=>x.id)),op=key();
  const count=async()=>Number((await db.execute('SELECT COUNT(*) n FROM ops_reads WHERE account_id=? AND party_id=?',[buyer.account_id,buyer.personal_party_id]))[0][0].n);
  const previousCount=await count();
  await db.withConnection(c=>c.query("CREATE TRIGGER activity_read_fail BEFORE INSERT ON ops_reads FOR EACH ROW BEGIN IF NEW.event_id="+Number(last)+" THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic activity read failure'; END IF; END"));
  try{bad(await clear(view.snapshot_id,op),503);assert.equal(await count(),previousCount);assert.equal((await unread()).channels.ACTIVITY_VOTING,2);}
  finally{await db.withConnection(c=>c.query('DROP TRIGGER activity_read_fail'));}
  const recovered=ok(await clear(view.snapshot_id,op));assert.equal(recovered.marked_count,2);assert.deepEqual(ok(await clear(view.snapshot_id,op)),recovered);
  assert.equal((await unread()).channels.ACTIVITY_VOTING,0);assert.equal((await unread()).channels.SYSTEM,initialSystem);assert.equal(await balance(),1100);
  result.rollback_event_ids=events.map(x=>x.id);result.rollback_restored=true;result.final_activity_unread=0;result.final_points=1100;
 });
};
