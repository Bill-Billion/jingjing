'use strict';
// Exercise the original 30-day/200-entry defaults, not a reduced test policy.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes,createHash}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
test('default collection retention: 201 real visits, 200 retained, 30-day physical purge and stale replay',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const[k,v]of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const database='jx_test_collection_default_'+randomBytes(8).toString('hex');assert.match(database,/^jx_test_collection_default_[a-f0-9]{16}$/);
 const control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 const summary={synthetic_only:true,database,configured_overrides:false,checks:[],requests:[]},notices=[];
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(database)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:database});await migrate(db);
  const S=await require('./helpers/notices-seed.cjs').seedNotices(db);
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,resolvePrincipal:S.resolvePrincipal,supplyEnv:{},supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port+'/api/v1/me/collections';
  async function call(method,url,{user=S.buyer,body,version,op=key(),status=200}={}){const r=await fetch(base+url,{method,headers:{Authorization:'Bearer '+user.token,...body!==undefined?{'Content-Type':'application/json'}:{},...method!=='GET'?{'Idempotency-Key':op}:{},...version?{'If-Match':'"'+version+'"'}:{}},...body!==undefined?{body:JSON.stringify(body)}:{}}),bytes=Buffer.from(await r.arrayBuffer()),j=JSON.parse(bytes);summary.requests.push({method,path:'/api/v1/me/collections'+url,status:r.status,error:j.error?.code,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});assert.equal(r.status,status,JSON.stringify(j));return j.data;}
  let prefs,firstVisitOp;
  await t.test('default settings require explicit opt-in and advertise original limits',async()=>{prefs=await call('GET','/preferences');assert.equal(prefs.history_enabled,false);assert.equal(prefs.history_days,30);assert.equal(prefs.history_max_entries,200);prefs=await call('POST','/preferences',{body:{history_enabled:true},version:prefs.object_version});summary.checks.push({name:'defaults-and-opt-in',days:30,max_entries:200});});
  await t.test('201 independently approved notices create at most 200 actual history rows',async()=>{
   for(let n=0;n<201;n++){let r=await S.notices.createNotice(S.buyer.ctx,{party_id:S.buyer.personal_party_id,rule_id:S.rule.id,notice:{...S.body,title:'Synthetic retention boundary '+n},operation_key:key()});r=await S.notices.review(S.reviewer.ctx,{record_id:r.id,expected_version:r.object_version,decision:'APPROVE',reason:'Synthetic independent public content review',checks:{content_reviewed:true,materials_reviewed:true,no_private_contact:true},operation_key:key()});notices.push(r.id);const op=key();if(n===0)firstVisitOp=op;await call('POST','/history',{body:{kind:'NOTICE',target_id:r.id},version:prefs.object_version,op});}
   const rows=[];let cursor;do{const page=await call('GET','/history?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));rows.push(...page.items);cursor=page.next_cursor;}while(cursor);
   assert.equal(rows.length,200);assert.deepEqual(rows.map(r=>r.target_id),notices.slice(1).reverse());const stored=(await db.execute("SELECT target_id FROM personal_collection_entries WHERE account_id=? AND collection='HISTORY'",[S.buyer.account_id]))[0];assert.equal(stored.length,200);assert(!stored.some(r=>r.target_id===notices[0]));await call('POST','/favorites',{body:{kind:'NOTICE',target_id:notices[0],saved:true}});assert.equal((await call('GET','/history',{user:S.outsider})).items.length,0);summary.checks.push({name:'201-real-visits-200-retained',created_and_reviewed:201,http_visits:201,api_rows:200,stored_rows:200,oldest_absent:true});
  });
  await t.test('30-day recorded time and explicit expiry both physically purge; day29 survives',async()=>{
   // Only time fields of our isolated HISTORY rows are adjusted. Qualification,
   // approval, ownership, content and production state are never forged.
   await db.execute("UPDATE personal_collection_entries SET recorded_at=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 31 DAY),expires_at=DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL 1 DAY) WHERE account_id=? AND collection='HISTORY' AND target_id=?",[S.buyer.account_id,notices[1]]);
   await db.execute("UPDATE personal_collection_entries SET expires_at=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE account_id=? AND collection='HISTORY' AND target_id=?",[S.buyer.account_id,notices[2]]);
   await db.execute("UPDATE personal_collection_entries SET recorded_at=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 29 DAY),expires_at=DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL 1 DAY) WHERE account_id=? AND collection='HISTORY' AND target_id=?",[S.buyer.account_id,notices[3]]);
   await call('GET','/history');const stored=(await db.execute("SELECT target_id FROM personal_collection_entries WHERE account_id=? AND collection='HISTORY'",[S.buyer.account_id]))[0];assert.equal(stored.length,198);assert(!stored.some(r=>[notices[1],notices[2]].includes(r.target_id)));assert(stored.some(r=>r.target_id===notices[3]));assert.equal((await call('GET','/favorites')).items[0].target_id,notices[0]);summary.checks.push({name:'day31-and-expired-physically-purged-day29-retained',stored_rows:198,favorite_preserved:true});
  });
  await t.test('replaying old visits or queued writes cannot resurrect trimmed or cleared rows',async()=>{
   await call('POST','/history',{body:{kind:'NOTICE',target_id:notices[0]},version:prefs.object_version,op:firstVisitOp});assert.equal((await call('GET','/targets/NOTICE/'+notices[0])).visited,false);
   const oldVersion=prefs.object_version;prefs=await call('DELETE','/history',{version:oldVersion});await call('POST','/history',{body:{kind:'NOTICE',target_id:notices[0]},version:oldVersion,op:firstVisitOp});await call('POST','/history',{body:{kind:'NOTICE',target_id:notices[0]},version:oldVersion,status:412});assert.equal((await call('GET','/history')).items.length,0);assert.equal((await call('GET','/favorites')).items.length,1);assert.equal(prefs.history_enabled,true);summary.checks.push({name:'trim-clear-and-replay-do-not-resurrect',stored_history_after_clear:0,favorites:1});
  });
 }finally{
  if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(database));await control.end();summary.database_removed=true;
  if(process.env.QA18_RETENTION_OUTPUT){const root=path.resolve(__dirname,'../../../..'),out=path.resolve(process.env.QA18_RETENTION_OUTPUT);assert(out.startsWith(path.join(root,'.local')+path.sep));await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(summary,null,2)+'\n');}
 }
});
