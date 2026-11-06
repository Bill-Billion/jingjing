"use strict";
const A=require('../artists/context'),P=require('./policy'),source=require('./source');
const {shape,ref,error}=require('../party/policy'),{digest}=require('../governance/content');
async function state(tx,account){
 await tx.execute('INSERT INTO personal_collection_settings(account_id) VALUES (?) ON DUPLICATE KEY UPDATE account_id=account_id',[account]);
 return A.one(tx,'SELECT * FROM personal_collection_settings WHERE account_id=? FOR UPDATE',[account]);
}
async function prune(tx,account,config){
 await tx.execute("DELETE FROM personal_collection_entries WHERE account_id=? AND collection='HISTORY' AND (expires_at<=CURRENT_TIMESTAMP(3) OR recorded_at<=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL ? DAY))",[account,config.history_days]);
 const edge=await A.one(tx,"SELECT sequence_id FROM personal_collection_entries WHERE account_id=? AND collection='HISTORY' ORDER BY sequence_id DESC LIMIT ?,1",[account,config.history_max_entries-1]);
 if(edge)await tx.execute("DELETE FROM personal_collection_entries WHERE account_id=? AND collection='HISTORY' AND sequence_id<?",[account,edge.sequence_id]);
}
function createCollectionsRepository(db,{resolvePrincipal,secret,env={}}){
 const actor=A.createActor(resolvePrincipal),config=P.settings(env),cursor=P.cursors(secret);
 const run=(ctx,fn)=>db.withTransaction(async tx=>{const a=await actor(tx,ctx),s=await state(tx,a.id);await prune(tx,a.id,config);return fn(tx,a,s);});
 const preferences=s=>({history_enabled:Boolean(s.history_enabled),object_version:s.object_version,...config});
 async function command(tx,a,op,i,fn){
  const key=digest([a.id,op,ref(i.operation_key)]),fingerprint=digest(i),old=await A.one(tx,'SELECT * FROM personal_collection_commands WHERE id=?',[key]);
  if(old){if(old.fingerprint!==fingerprint)throw error('IDEMPOTENCY_CONFLICT',409);const result=A.parse(old.result_json);if(digest(result)!==old.result_sha256)throw error('STORED_CONTENT_MISMATCH',503);return result;}
  const result=await fn();await tx.execute('INSERT INTO personal_collection_commands(id,fingerprint,result_json,result_sha256) VALUES (?,?,?,?)',[key,fingerprint,JSON.stringify(result),digest(result)]);return result;
 }
 async function bump(tx,s){await tx.execute('UPDATE personal_collection_settings SET object_version=object_version+1 WHERE account_id=?',[s.account_id]);s.object_version++;}
 return {
  preferences:ctx=>run(ctx,async(tx,a,s)=>preferences(s)),
  changePreferences(ctx,i){shape(i,['history_enabled','expected_version','operation_key']);if(typeof i.history_enabled!=='boolean')throw error('INVALID_INPUT',400);return run(ctx,(tx,a,s)=>command(tx,a,'PREFERENCES',i,async()=>{A.match(s,i.expected_version);await tx.execute('UPDATE personal_collection_settings SET history_enabled=? WHERE account_id=?',[i.history_enabled,a.id]);s.history_enabled=i.history_enabled;if(!i.history_enabled)await tx.execute("DELETE FROM personal_collection_entries WHERE account_id=? AND collection='HISTORY'",[a.id]);await bump(tx,s);return preferences(s);}));},
  favorite(ctx,i){shape(i,['kind','target_id','saved','operation_key']);P.target(i.kind,i.target_id);if(typeof i.saved!=='boolean')throw error('INVALID_INPUT',400);return run(ctx,(tx,a)=>command(tx,a,'FAVORITE',i,async()=>{
   if(i.saved){await source.read(tx,i.kind,i.target_id);await tx.execute("INSERT INTO personal_collection_entries(account_id,collection,target_kind,target_id) VALUES (?,'FAVORITE',?,?) ON DUPLICATE KEY UPDATE target_id=target_id",[a.id,i.kind,i.target_id]);}
   else await tx.execute("DELETE FROM personal_collection_entries WHERE account_id=? AND collection='FAVORITE' AND target_kind=? AND target_id=?",[a.id,i.kind,i.target_id]);return {applied:true};}));},
  visit(ctx,i){shape(i,['kind','target_id','expected_version','operation_key']);P.target(i.kind,i.target_id);return run(ctx,(tx,a,s)=>command(tx,a,'VISIT',i,async()=>{A.match(s,i.expected_version);if(!s.history_enabled)throw error('HISTORY_DISABLED',409);await source.read(tx,i.kind,i.target_id);
   await tx.execute("DELETE FROM personal_collection_entries WHERE account_id=? AND collection='HISTORY' AND target_kind=? AND target_id=?",[a.id,i.kind,i.target_id]);
   await tx.execute("INSERT INTO personal_collection_entries(account_id,collection,target_kind,target_id,expires_at) VALUES (?,'HISTORY',?,?,DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL ? DAY))",[a.id,i.kind,i.target_id,config.history_days]);await prune(tx,a.id,config);await require('./retention').ensure(tx,a.id,config);return {applied:true};}));},
  removeHistory(ctx,i){shape(i,['kind','target_id','expected_version','operation_key']);if(i.kind!==undefined||i.target_id!==undefined)P.target(i.kind,i.target_id);return run(ctx,(tx,a,s)=>command(tx,a,'REMOVE_HISTORY',i,async()=>{A.match(s,i.expected_version);await tx.execute("DELETE FROM personal_collection_entries WHERE account_id=? AND collection='HISTORY'"+(i.kind?' AND target_kind=? AND target_id=?':''),[a.id,...(i.kind?[i.kind,i.target_id]:[])]);await bump(tx,s);return preferences(s);}));},
  target(ctx,i){shape(i,['kind','target_id']);P.target(i.kind,i.target_id);return run(ctx,async(tx,a,s)=>{const rows=(await tx.execute('SELECT collection FROM personal_collection_entries WHERE account_id=? AND target_kind=? AND target_id=?',[a.id,i.kind,i.target_id]))[0];return {saved:rows.some(r=>r.collection==='FAVORITE'),visited:Boolean(s.history_enabled)&&rows.some(r=>r.collection==='HISTORY')};});},
  list(ctx,collection,input){if(!['FAVORITE','HISTORY'].includes(collection))throw error('INVALID_INPUT',400);const p=P.page(input);return run(ctx,async(tx,a,s)=>{
   const scope=[a.id,collection,p.kind,collection==='HISTORY'?s.object_version:0],after=cursor.decode(scope,input.cursor);
   const rows=(await tx.execute('SELECT * FROM personal_collection_entries WHERE account_id=? AND collection=?'+(p.kind?' AND target_kind=?':'')+(after?' AND sequence_id<?':'')+' ORDER BY sequence_id DESC LIMIT ?',[a.id,collection,...(p.kind?[p.kind]:[]),...(after?[after]:[]),p.limit+1]))[0];
   const items=[];for(const r of rows.slice(0,p.limit)){const current=await source.visible(tx,r.target_kind,r.target_id);items.push({kind:r.target_kind,target_id:r.target_id,recorded_at:A.instant(r.recorded_at),availability:current?'AVAILABLE':'UNAVAILABLE',title:current?.title??null,city:current?.city??null});}
   return {items,next_cursor:rows.length>p.limit?cursor.encode(scope,rows[p.limit-1].sequence_id):null};
  });}
 };
}
module.exports={createCollectionsRepository,state,prune};
