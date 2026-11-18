'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
test('notice revision and independent publication require current submitting actor identity',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v]of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_'+process.pid+'_'+randomBytes(6).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
 let db,server;const fixtures=[];
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./helpers/notices-seed.cjs').seedNotices(db),{buyer,reviewer,outsider,parties:P}=S;
  const org=await P.createOrganization(buyer.ctx,{display_name:'Synthetic notice agency',operation_key:key()});await db.execute("UPDATE parties SET current_status='ACTIVE' WHERE id=?",[org.party_id]);
  const proof=await S.supply.upload(buyer.ctx,{party_id:org.party_id,purpose:'RIGHTS_EVIDENCE',media_type:'text/plain',body:Buffer.from('Synthetic agency qualification'),operation_key:key()});
  let qual=await S.notices.applyQualification(buyer.ctx,{party_id:org.party_id,types:['RECRUITMENT'],valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',evidence_asset_ids:[proof.id],terms:'Synthetic qualification',operation_key:key()});
  qual=await S.notices.review(reviewer.ctx,{record_id:qual.id,expected_version:qual.object_version,decision:'APPROVE',reason:'Independent synthetic qualification',checks:{identity_verified:true,authority_verified:true,evidence_verified:true},operation_key:key()});
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1';
  async function call(method,url,body,{user=buyer,party=org.party_id,op=key(),version}={}){
   const res=await fetch(base+url,{method,headers:{Authorization:'Bearer '+user.token,...(party?{'X-Acting-Party':party}:{}),...(body!==undefined?{'Content-Type':'application/json','Idempotency-Key':op}:{}),...(version?{'If-Match':'"'+version+'"'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});const value=await res.json();fixtures.push({method,path:new URL(base+url).pathname,schema:res.ok?'NoticeResponse':'ErrorResponse',value});return {status:res.status,...value};
  }
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;},denied=r=>{assert.equal(r.status,409,JSON.stringify(r));assert.equal(r.error.code,'VERIFIED_ADULT_REQUIRED');};
  const create=()=>call('POST','/notices/announcements',{rule_id:S.rule.id,notice:S.body});
  const approve=(r,op=key())=>call('POST','/notices/records/'+r.id+'/reviews',{decision:'APPROVE',reason:'Independent synthetic publication',checks:{content_reviewed:true,materials_reviewed:true,no_private_contact:true}},{user:reviewer,party:null,version:r.object_version,op});
  const read=r=>call('GET','/notices/records/'+r.id);
  const revise=(n,op=key(),title='Synthetic changed notice')=>call('POST','/notices/announcements/'+n.id+'/revisions',{notice:{...n.data.notice,title},reason:'Synthetic corrected public terms'},{version:n.object_version,op});
  const close=r=>call('POST','/notices/records/'+r.id+'/close',{reason:'Synthetic protective withdrawal'},{version:r.object_version});
  const original=(await db.execute('SELECT identity_status,identity_valid_until FROM artist_people WHERE id=?',[buyer.person.id]))[0][0];
  const restore=()=>db.execute('UPDATE artist_people SET identity_status=?,identity_valid_until=? WHERE id=?',[original.identity_status,original.identity_valid_until,buyer.person.id]);
  const invalidate=state=>db.execute('UPDATE artist_people SET identity_status=?,identity_valid_until=? WHERE id=?',[state==='EXPIRED'?'VERIFIED':state,state==='EXPIRED'?'2020-01-01 00:00:00':original.identity_valid_until,buyer.person.id]);
  const counts=async()=>({records:Number((await db.execute('SELECT COUNT(*) n FROM notice_records'))[0][0].n),commands:Number((await db.execute('SELECT COUNT(*) n FROM notice_commands'))[0][0].n)});
  const snapshot=async r=>{const row=(await db.execute('SELECT current_status,object_version,data_sha256 FROM notice_records WHERE id=?',[r.id]))[0][0];return row;};
  let notice=ok(await approve(ok(await create())));const revisionOp=key(),revision=ok(await revise(notice,revisionOp));
  await t.test('verified agency actor submits an idempotent private revision without replacing live content',async()=>{assert.deepEqual(ok(await revise(notice,revisionOp)),revision);assert.equal(revision.current_status,'IN_REVIEW');assert.equal(ok(await read(notice)).data.notice.title,S.body.title);});
  for(const state of ['EXPIRED','REJECTED','UNVERIFIED']){
   await invalidate(state);
   for(const [label,op]of [['new revision',key()],['successful revision replay',revisionOp]])await t.test(state+' actor cannot submit '+label,async()=>{const before=await counts(),old=await snapshot(notice);denied(await revise(notice,op));assert.deepEqual(await counts(),before);assert.deepEqual(await snapshot(notice),old);});
   await t.test(state+' actor retains authorized original notice and pending revision reads',async()=>{assert.equal(ok(await read(notice)).id,notice.id);assert.equal(ok(await read(revision)).id,revision.id);});
   await restore();
   for(const kind of ['NOTICE','NOTICE_REVISION']){
    const parent=kind==='NOTICE'?null:ok(await approve(ok(await create()))),pending=kind==='NOTICE'?ok(await create()):ok(await revise(parent));
    await invalidate(state);
    await t.test(state+' submitting actor prevents independent publication of '+kind,async()=>{const before=await counts(),old=await snapshot(pending),base=parent?await snapshot(parent):null;denied(await approve(pending));assert.deepEqual(await counts(),before);assert.deepEqual(await snapshot(pending),old);if(parent)assert.deepEqual(await snapshot(parent),base);});
    await restore();
   }
  }
  await t.test('expired actor may withdraw a pending revision and the published original',async()=>{await invalidate('EXPIRED');try{assert.equal(ok(await close(revision)).current_status,'WITHDRAWN');assert.equal(ok(await close(notice)).current_status,'WITHDRAWN');}finally{await restore();}});
  await t.test('restored identity permits a fresh revised publication and preserves the notice identity',async()=>{const n=ok(await approve(ok(await create()))),r=ok(await revise(n));assert.equal(ok(await approve(r)).current_status,'APPROVED');const changed=ok(await read(n));assert.equal(changed.id,n.id);assert.equal(changed.data.notice.title,'Synthetic changed notice');assert.equal(changed.data.revision_id,r.id);});
  await t.test('official notices keep separate operator authority without demanding an artist profile',async()=>{
   const body={...S.body,type:'OFFICIAL',details:{summary:'Synthetic official bulletin'},accept_submissions:false};
   const n=ok(await call('POST','/notices/announcements',{rule_id:S.rule.id,notice:body},{user:outsider,party:null}));const published=ok(await approve(n));
   const r=ok(await call('POST','/notices/announcements/'+published.id+'/revisions',{notice:{...body,title:'Official corrected notice'},reason:'Synthetic official correction'},{user:outsider,party:null,version:published.object_version}));assert.equal(ok(await approve(r)).current_status,'APPROVED');
   assert.equal(Number((await db.execute('SELECT COUNT(*) n FROM artist_people WHERE owner_party_id=?',[outsider.personal_party_id]))[0][0].n),0);
  });
 }finally{
  await fs.mkdir(path.resolve(__dirname,'../../../../.local'),{recursive:true});await fs.writeFile(path.resolve(__dirname,'../../../../.local/notice-publisher-identity-http.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2)+'\n');
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();
 }
});
