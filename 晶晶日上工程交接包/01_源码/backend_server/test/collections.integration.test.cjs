"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
async function isolated(fn){
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_collections_'+randomBytes(6).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db;
 try{await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);await fn(db);}finally{if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
}
test('personal collections, privacy preferences and retention through actual HTTP',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>isolated(async db=>{
 const S=await require('./helpers/directory-seed.cjs').seedDirectory(db),config={COLLECTION_HISTORY_DAYS:'2',COLLECTION_HISTORY_MAX_ENTRIES:'3'},cases=[];
 const server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyEnv:config,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1/me/collections';
 const notices=[];for(let n=0;n<5;n++){let r=await S.notices.createNotice(S.buyer.ctx,{party_id:S.buyer.personal_party_id,rule_id:S.rule.id,notice:{...S.body,title:'Synthetic collection '+n},operation_key:key()});r=await S.notices.review(S.reviewer.ctx,{record_id:r.id,expected_version:r.object_version,decision:'APPROVE',reason:'synthetic independent review',checks:{content_reviewed:true,materials_reviewed:true,no_private_contact:true},operation_key:key()});notices.push(r);}
 async function call(method,url,{user=S.buyer,body,version,op=key(),party=null,schema='CollectionResponse'}={}){const r=await fetch(base+url,{method,headers:{...(user?{Authorization:'Bearer '+user.token}:{}),...(body?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'Idempotency-Key':op}:{}),...(version?{'If-Match':'"'+version+'"'}:{}),...(party?{'X-Acting-Party':party}:{})},...(body?{body:JSON.stringify(body)}:{})});const value=await r.json();cases.push({method,path:new URL(base+url).pathname,schema:r.ok?schema:'ErrorResponse',value});return {status:r.status,etag:r.headers.get('etag'),...value};}
 const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;};
 const target={kind:'ARTIST',target_id:S.publicListing.id};let prefs,visitKey;
 try{
  await t.test('history is off by default; reads are personal and reject acting identities',async()=>{
   const r=await call('GET','/preferences');prefs=ok(r);assert.equal(prefs.history_enabled,false);assert.equal(prefs.history_days,2);assert.equal(r.etag,'"1"');
   assert.equal((await call('POST','/history',{body:target,version:prefs.object_version})).status,409);
   assert.equal((await call('GET','/preferences',{user:null})).status,401);assert.equal((await call('GET','/preferences',{party:S.buyer.personal_party_id})).status,400);
   assert.equal((await call('GET','/favorites?account_id='+S.outsider.account_id)).status,400);assert.equal((await call('GET','/favorites?limit=1&limit=2')).status,400);
   assert.deepEqual(ok(await call('GET','/history')).items,[]);
  });
  await t.test('same favourite is unique, own-account only, and old replay cannot undo removal',async()=>{
   const op=key();ok(await call('POST','/favorites',{body:{...target,saved:true},op}));ok(await call('POST','/favorites',{body:{...target,saved:true},op}));
   assert.equal(ok(await call('GET','/favorites')).items.length,1);assert.equal(ok(await call('GET','/favorites',{user:S.outsider})).items.length,0);
   assert.equal((await call('POST','/favorites',{body:{...target,saved:false},op})).status,409);
   ok(await call('POST','/favorites',{body:{...target,saved:false}}));ok(await call('POST','/favorites',{body:{...target,saved:true},op}));
   assert.equal(ok(await call('GET','/targets/ARTIST/'+target.target_id)).saved,false);
   ok(await call('POST','/favorites',{body:{...target,saved:true}}));
  });
  await t.test('explicit opt in, replayable visits and no automatic browsing from GET',async()=>{
   assert.equal((await call('POST','/preferences',{body:{history_enabled:true}})).status,428);
   prefs=ok(await call('POST','/preferences',{body:{history_enabled:true},version:1}));assert.equal(prefs.object_version,2);
   assert.deepEqual(ok(await call('GET','/history')).items,[]);visitKey=key();ok(await call('POST','/history',{body:target,version:2,op:visitKey}));
   ok(await call('POST','/history',{body:target,version:2,op:visitKey}));assert.equal(ok(await call('GET','/history')).items.length,1);
   assert.equal(ok(await call('GET','/targets/ARTIST/'+target.target_id)).visited,true);
  });
  await t.test('single delete and clear invalidate queued visits and cannot resurrect deleted data',async()=>{
   prefs=ok(await call('DELETE','/history/ARTIST/'+target.target_id,{version:2}));assert.equal(prefs.object_version,3);
   ok(await call('POST','/history',{body:target,version:2,op:visitKey}));assert.equal(ok(await call('GET','/history')).items.length,0);
   assert.equal((await call('POST','/history',{body:target,version:2})).status,412);
   ok(await call('POST','/history',{body:target,version:3}));prefs=ok(await call('DELETE','/history',{version:3}));assert.equal(prefs.history_enabled,true);assert.deepEqual(ok(await call('GET','/history')).items,[]);
  });
  await t.test('bounded recent history, signed pagination and clear protect cursor scope',async()=>{
   for(const r of notices)ok(await call('POST','/history',{body:{kind:'NOTICE',target_id:r.id},version:prefs.object_version}));
   const page=ok(await call('GET','/history?limit=1'));assert.equal(page.items[0].target_id,notices[4].id);assert.ok(page.next_cursor);
   assert.equal((await call('GET','/history?cursor='+page.next_cursor,{user:S.outsider})).status,400);
   assert.equal((await call('GET','/favorites?cursor='+page.next_cursor)).status,400);assert.equal((await call('GET','/history?kind=ARTIST&cursor='+page.next_cursor)).status,400);
   const ids=[page.items[0].target_id];let c=page.next_cursor;while(c){const p=ok(await call('GET','/history?limit=1&cursor='+c));ids.push(...p.items.map(x=>x.target_id));c=p.next_cursor;}assert.deepEqual(ids,notices.slice(2).reverse().map(r=>r.id));
   prefs=ok(await call('DELETE','/history',{version:prefs.object_version}));assert.equal((await call('GET','/history?cursor='+page.next_cursor)).status,400);
  });
  await t.test('disabling clears history; stale opt-in or visits cannot silently restore it',async()=>{
   const v=prefs.object_version;ok(await call('POST','/history',{body:target,version:v}));prefs=ok(await call('POST','/preferences',{body:{history_enabled:false},version:v}));
   assert.equal(ok(await call('GET','/history')).items.length,0);assert.equal((await call('POST','/history',{body:target,version:v})).status,412);
   assert.equal((await call('POST','/history',{body:target,version:prefs.object_version})).status,409);
   assert.equal((await call('POST','/preferences',{body:{history_enabled:true},version:v})).status,412);
  });
  await t.test('expiry removes stored rows, private content is not copied into collection/command tables',async()=>{
   prefs=ok(await call('POST','/preferences',{body:{history_enabled:true},version:prefs.object_version}));ok(await call('POST','/history',{body:target,version:prefs.object_version}));
   await db.execute("UPDATE personal_collection_entries SET expires_at=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE account_id=? AND collection='HISTORY'",[S.buyer.account_id]);assert.deepEqual(ok(await call('GET','/history')).items,[]);
   assert.equal((await db.execute("SELECT * FROM personal_collection_entries WHERE account_id=? AND collection='HISTORY'",[S.buyer.account_id]))[0].length,0);
   const commands=JSON.stringify((await db.execute('SELECT * FROM personal_collection_commands'))[0]);assert.ok(!commands.includes(target.target_id));assert.ok(!commands.includes('display_name'));
   assert.ok(!JSON.stringify((await db.execute('SELECT * FROM personal_collection_entries'))[0]).includes('introduction'));
  });
  await t.test('concurrent saves deduplicate and concurrent preference changes honor version',async()=>{
   const before=prefs.object_version;const replies=await Promise.all([call('POST','/preferences',{body:{history_enabled:false},version:before}),call('POST','/preferences',{body:{history_enabled:false},version:before})]);assert.deepEqual(replies.map(x=>x.status).sort(),[200,412]);prefs=ok(replies.find(x=>x.status===200));
   const body={kind:'NOTICE',target_id:notices[0].id,saved:true};const saves=await Promise.all([call('POST','/favorites',{body}),call('POST','/favorites',{body})]);saves.forEach(ok);assert.equal(ok(await call('GET','/favorites?kind=NOTICE')).items.length,1);
   prefs=ok(await call('POST','/preferences',{body:{history_enabled:true},version:prefs.object_version}));
   const raced=await Promise.all([call('POST','/history',{body:target,version:prefs.object_version}),call('DELETE','/history',{version:prefs.object_version})]);
   assert.ok([200,412].includes(raced[0].status));prefs=ok(raced[1]);assert.deepEqual(ok(await call('GET','/history')).items,[]);
  });
  await t.test('withdrawn or blocked sources remain removable without old titles or private fields',async()=>{
   await S.artists.withdraw(S.seller.ctx,{person_id:S.seller.person.id,party_id:S.seller.personal_party_id,record_id:S.publicConsent.id,expected_version:S.publicConsent.object_version,reason:'synthetic withdrawal',operation_key:key()});
   const item=ok(await call('GET','/favorites?kind=ARTIST')).items[0];assert.equal(item.availability,'UNAVAILABLE');assert.equal(item.title,null);assert.equal(item.city,null);assert.deepEqual(Object.keys(item).sort(),['availability','city','kind','recorded_at','target_id','title']);
   assert.equal((await call('POST','/favorites',{body:{...target,saved:true}})).status,409);ok(await call('POST','/favorites',{body:{...target,saved:false}}));
   await S.notices.close(S.buyer.ctx,{party_id:S.buyer.personal_party_id,record_id:notices[0].id,expected_version:notices[0].object_version,reason:'synthetic close',operation_key:key()});assert.equal(ok(await call('GET','/favorites?kind=NOTICE')).items[0].availability,'UNAVAILABLE');
  });
  await t.test('retention job checks its lease, physically purges inactive users and reschedules',async()=>{
   prefs=ok(await call('POST','/preferences',{body:{history_enabled:true},version:prefs.object_version}));ok(await call('POST','/history',{body:{kind:'NOTICE',target_id:notices[1].id},version:prefs.object_version}));
   const jobs=(await db.execute("SELECT * FROM platform_jobs WHERE task_type='COLLECTION_HISTORY_EXPIRE' ORDER BY created_at"))[0];assert.ok(jobs.length);let job=jobs[0];
   const handler=require('../src/modules/collections/retention').createCollectionHandlers(db,{env:config}).get('COLLECTION_HISTORY_EXPIRE');await assert.rejects(()=>handler.execute(job),e=>e.code==='LEASE_LOST');
   await db.execute("UPDATE personal_collection_entries SET expires_at=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE account_id=? AND collection='HISTORY'",[S.buyer.account_id]);
   await db.execute("UPDATE platform_jobs SET status='RUNNING',lease_owner='collection-test',lease_token=?,lease_until=DATE_ADD(CURRENT_TIMESTAMP(6),INTERVAL 1 MINUTE) WHERE id=?",[key(),job.id]);job=(await db.execute('SELECT * FROM platform_jobs WHERE id=?',[job.id]))[0][0];assert.equal((await handler.execute(job)).status,'SUCCEEDED');
   assert.equal((await db.execute("SELECT * FROM personal_collection_entries WHERE account_id=? AND collection='HISTORY'",[S.buyer.account_id]))[0].length,0);
   // A still-live newer visit is not erased; the next run targets its expiry.
   await db.execute("INSERT INTO personal_collection_entries(account_id,collection,target_kind,target_id,expires_at) VALUES (?,'HISTORY','NOTICE',?,DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL 1 DAY))",[S.buyer.account_id,notices[2].id]);
   assert.equal((await handler.execute(job)).status,'SUCCEEDED');
   assert.equal((await db.execute("SELECT * FROM personal_collection_entries WHERE account_id=? AND collection='HISTORY'",[S.buyer.account_id]))[0].length,1);
   const pending=(await db.execute("SELECT * FROM platform_jobs WHERE task_type='COLLECTION_HISTORY_EXPIRE' AND status='PENDING' AND next_run_at<DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL 25 HOUR)"))[0];assert.ok(pending.length>0);
   const short={history_days:1,history_max_entries:3};await db.withTransaction(tx=>require('../src/modules/collections/retention').ensure(tx,S.buyer.account_id,short));
  });
  await fs.mkdir(path.resolve(__dirname,'../../../../.local'),{recursive:true});await fs.writeFile(path.resolve(__dirname,'../../../../.local/collections-http-fixtures.json'),JSON.stringify({synthetic_only:true,cases},null,2));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}));
test('stock favorites reuse actual publication and rights checks',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async()=>isolated(async db=>{
 const S=await require('./helpers/stock-seed.cjs').seedStock(db),r=await S.listing(),repo=require('../src/modules/collections/repository').createCollectionsRepository(db,{resolvePrincipal:S.resolvePrincipal,secret:S.secret});
 const input={kind:'STOCK',target_id:r.id,saved:true,operation_key:key()};await repo.favorite(S.buyer.ctx,input);assert.equal((await repo.list(S.buyer.ctx,'FAVORITE',{})).items[0].title,r.data.title);
 await S.artists.withdraw(S.seller.ctx,{person_id:S.seller.person.id,party_id:S.seller.personal_party_id,record_id:S.consent.id,expected_version:S.consent.object_version,reason:'synthetic public withdrawal',operation_key:key()});assert.equal((await repo.list(S.buyer.ctx,'FAVORITE',{})).items[0].availability,'UNAVAILABLE');
}));
