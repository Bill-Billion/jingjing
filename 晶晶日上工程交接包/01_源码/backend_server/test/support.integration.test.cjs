"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
test('formal support actual HTTP submission, supplement, history and restricted evidence',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_support_'+randomBytes(6).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 try{
 await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
 let revokeOnDownload=false;
 const S=await require('./helpers/directory-seed.cjs').seedDirectory(db),fixtures=[];
 for(const u of [S.reviewer,S.buyer])await require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:u.account_id,action:'SUPPORT_HANDLE',enabled:true,expires_at:null,expected_version:0,authority_ref:'synthetic:test',reason:'isolated only'});
 server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:()=>({...S.storageFactory(),getBuffer:async k=>{const bytes=await S.storageFactory().getBuffer(k);if(revokeOnDownload)await db.execute("UPDATE governance_operator_grants SET enabled=0 WHERE account_id=? AND action_code='SUPPORT_HANDLE'",[S.reviewer.account_id]);return bytes;}})}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1/support';
 async function call(method,url,{user=S.buyer,body,version,op=key(),party=user?.personal_party_id,schema='SupportResponse'}={}){const r=await fetch(base+url,{method,headers:{...(user?{Authorization:'Bearer '+user.token}:{}),...(body?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'Idempotency-Key':op}:{}),...(version?{'If-Match':'"'+version+'"'}:{}),...(party?{'X-Acting-Party':party}:{})},...(body?{body:JSON.stringify(body)}:{})});if(!r.headers.get('content-type')?.includes('application/json'))return {status:r.status,bytes:Buffer.from(await r.arrayBuffer()),headers:r.headers};const value=await r.json();fixtures.push({method,path:new URL(base+url).pathname,schema:r.ok?(url.split('?')[0].endsWith('/history')?'SupportHistoryResponse':url.split('?')[0].endsWith('/tickets')&&method==='GET'?'SupportListResponse':'SupportTicketResponse'):'ErrorResponse',value});return {status:r.status,...value};}
 const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;};
 const upload=async(u,text)=>S.supply.upload(u.ctx,{party_id:u.personal_party_id,purpose:'RIGHTS_EVIDENCE',media_type:'text/plain',body:Buffer.from(text),operation_key:key()});
 const file=await upload(S.buyer,'synthetic evidence initial'),other=await upload(S.outsider,'synthetic unrelated file');
 const body={kind:'REPORT',title:'Synthetic public-content problem',target:{domain:'ARTIST_PUBLIC',record_id:S.publicListing.id},text:'Please inspect. No finding yet.',asset_ids:[file.id]};let ticket,op=key();
 const staff={user:S.reviewer,party:null},act=(action,text='synthetic explanation',asset_ids=[])=>({action,text,asset_ids});
 await t.test('authentication, ownership, source and input validation',async()=>{
  assert.equal((await call('POST','/tickets',{user:null,body})).status,401);assert.equal((await call('POST','/tickets',{party:null,body})).status,400);
  assert.equal((await call('POST','/tickets',{body:{...body,asset_ids:[other.id]}})).status,409);
  assert.equal((await call('POST','/tickets',{body:{...body,target:{domain:'TRADE',record_id:key()}}})).status,404);
  assert.equal((await call('POST','/tickets',{body:{...body,target:{domain:'UNKNOWN',record_id:key()}}})).status,400);for(const domain of ['CUSTOMIZATION','STOCK','AUDITIONS','ENGAGEMENT','COCREATION','REDEMPTION'])assert.ok([403,404,409].includes((await call('POST','/tickets',{body:{...body,target:{domain,record_id:key()}}})).status),domain+' must use a real authorized source adapter');
  assert.equal((await call('POST','/tickets',{body:{...body,created_by:S.reviewer.account_id}})).status,400);
 });
 await t.test('concurrent create retries produce one ticket and one immutable first entry',async()=>{
  const rs=await Promise.all([1,2,3].map(()=>call('POST','/tickets',{body,op})));ticket=ok(rs[0]);for(const r of rs)assert.equal(ok(r).id,ticket.id);
  assert.equal(ok(await call('GET','/tickets')).items.length,1);assert.equal(ticket.current_status,'SUBMITTED');
  assert.equal((await call('POST','/tickets',{body:{...body,text:'changed'},op})).status,409);
  assert.equal(ok(await call('GET','/tickets/'+ticket.id+'/history')).items.length,1);
 });
 await t.test('other account and self-review cannot see or handle private evidence',async()=>{
  assert.equal((await call('GET','/tickets/'+ticket.id,{user:S.outsider})).status,404);
  assert.equal((await call('GET','/tickets/'+ticket.id,{party:S.outsider.personal_party_id})).status,403);
  assert.equal((await call('GET','/operations/tickets/'+ticket.id,{user:S.outsider,party:null})).status,403);
  assert.equal((await call('GET','/operations/tickets/'+ticket.id,{party:null})).status,403);
  assert.equal((await call('GET','/operations/tickets/'+ticket.id,{...staff,party:S.reviewer.personal_party_id})).status,400);
  const f=await call('GET','/operations/tickets/'+ticket.id+'/assets/'+file.id+'/content',staff);assert.equal(f.status,200);assert.equal(f.bytes.toString(),'synthetic evidence initial');assert.equal(f.headers.get('cache-control'),'no-store');
  assert.equal((await call('GET','/operations/tickets/'+ticket.id+'/assets/'+other.id+'/content',staff)).status,404);
 });
 await t.test('permission is checked again after reading private storage',async()=>{revokeOnDownload=true;assert.equal((await call('GET','/operations/tickets/'+ticket.id+'/assets/'+file.id+'/content',staff)).status,403);revokeOnDownload=false;await db.execute("UPDATE governance_operator_grants SET enabled=1 WHERE account_id=? AND action_code='SUPPORT_HANDLE'",[S.reviewer.account_id]);});
 await t.test('staff handling, applicant supplement, answer, close and reopen preserve history',async()=>{
  const url='/operations/tickets/'+ticket.id+'/actions';
  assert.equal((await call('POST',url,{...staff,body:act('ANSWER'),version:1})).status,409);
  ticket=ok(await call('POST',url,{...staff,body:act('START'),version:1}));
  assert.equal((await call('POST',url,{...staff,body:act('REQUEST_INFO'),version:1})).status,412);
  ticket=ok(await call('POST',url,{...staff,body:act('REQUEST_INFO'),version:2}));
  const supplement=await upload(S.buyer,'synthetic new evidence');
  const supplementOp=key(),input={body:act('SUPPLEMENT','additional facts',[supplement.id]),version:3,op:supplementOp};
  ticket=ok(await call('POST','/tickets/'+ticket.id+'/actions',input));assert.equal(ticket.current_status,'SUBMITTED');
  ticket=ok(await call('POST',url,{...staff,body:act('START'),version:4}));ticket=ok(await call('POST',url,{...staff,body:act('ANSWER','Explained next original-order step; no automatic penalty.'),version:5}));
  ticket=ok(await call('POST','/tickets/'+ticket.id+'/actions',{body:act('CLOSE'),version:6}));assert.equal(ticket.current_status,'CLOSED');
  assert.equal(ok(await call('POST','/tickets/'+ticket.id+'/actions',input)).current_status,'CLOSED');
  ticket=ok(await call('POST','/tickets/'+ticket.id+'/actions',{body:act('REOPEN'),version:7}));assert.equal(ticket.current_status,'SUBMITTED');
  const first=ok(await call('GET','/tickets/'+ticket.id+'/history?limit=3'));assert.equal(first.next_cursor,3);
  const next=ok(await call('GET','/tickets/'+ticket.id+'/history?cursor=3'));assert.equal(next.items.length,5);assert.deepEqual(next.items[0].asset_ids,[supplement.id]);
  assert.equal((await call('GET','/tickets/'+ticket.id+'/assets/'+file.id+'/content')).status,200);
 });
 await t.test('revoked staff grant and party membership block later reads and replays',async()=>{
  await db.execute("UPDATE governance_operator_grants SET enabled=0 WHERE account_id=? AND action_code='SUPPORT_HANDLE'",[S.reviewer.account_id]);assert.equal((await call('GET','/operations/tickets/'+ticket.id,staff)).status,403);assert.equal((await call('GET','/operations/tickets/'+ticket.id+'/assets/'+file.id+'/content',staff)).status,403);
  await db.execute("UPDATE party_memberships SET current_status='REVOKED' WHERE account_id=? AND party_id=?",[S.buyer.account_id,S.buyer.personal_party_id]);assert.equal((await call('POST','/tickets',{body,op})).status,403);assert.equal((await call('GET','/tickets/'+ticket.id)).status,403);
  await db.execute("UPDATE party_memberships SET current_status='ACTIVE' WHERE account_id=? AND party_id=?",[S.buyer.account_id,S.buyer.personal_party_id]);
 });
 await t.test('evidence retention and integrity are explicit; foreign attachment bytes never leak',async()=>{
  const f=(await db.execute('SELECT * FROM supply_assets WHERE id=?',[file.id]))[0][0];
  const description=await db.withTransaction(tx=>require('../src/modules/privacy/file-targets').describeFile(tx,f));assert.ok(description.dependencies.some(d=>d.code==='SUPPORT_EVIDENCE'));
  S.bytes.set(f.object_key,Buffer.from('corrupt'));assert.equal((await call('GET','/tickets/'+ticket.id+'/assets/'+file.id+'/content')).status,503);S.bytes.set(f.object_key,Buffer.from('synthetic evidence initial'));
  await db.execute("UPDATE support_events SET body_sha256=? WHERE ticket_id=? AND object_version=1",['0'.repeat(64),ticket.id]);assert.equal((await call('GET','/tickets/'+ticket.id+'/history')).status,503);
 });
 if(process.env.JX_SUPPORT_EVIDENCE_DIR){await fs.mkdir(process.env.JX_SUPPORT_EVIDENCE_DIR,{recursive:true});await fs.writeFile(path.join(process.env.JX_SUPPORT_EVIDENCE_DIR,'support-http.json'),JSON.stringify({fixtures},null,2)+'\n');}
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
