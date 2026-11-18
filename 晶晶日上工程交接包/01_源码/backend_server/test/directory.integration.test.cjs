"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes,createHash}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
test('public organization and editorial artist directory with isolated MySQL', {skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_directory_'+randomBytes(6).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;const fixtures=[];
 try{await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
 const S=await require('./helpers/directory-seed.cjs').seedDirectory(db),{buyer,reviewer,outsider}=S;
 for(const u of [buyer,reviewer,outsider])for(const action of ['SUPPLY_REVIEW_PROFILE','ARTIST_REVIEW_CONTENT'])if(!(await db.execute('SELECT id FROM governance_operator_grants WHERE account_id=? AND action_code=?',[u.account_id,action]))[0].length)await require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:u.account_id,action,enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:directory',reason:'isolated fixture'});
 const org=await S.parties.createOrganization(buyer.ctx,{display_name:'synthetic company',operation_key:key()});
 await S.parties.requestCapability(buyer.ctx,{party_id:org.party_id,code:'PRODUCER',operation_key:key()});
 const upload=(body,purpose='WORK_CONTENT',type='image/png')=>S.supply.upload(buyer.ctx,{party_id:org.party_id,purpose,media_type:type,body,operation_key:key()});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZioAAAAASUVORK5CYII=','base64');
 const cover=await upload(png),evidence=await upload(Buffer.from('private synthetic approval evidence'),'REVIEW_EVIDENCE','text/plain');
 const profile={display_name:'合成机构',introduction:'合成影片制作机构',city:'北京市',capabilities:['PRODUCER'],cover_asset_id:cover.id,evidence_asset_ids:[evidence.id],valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z'};
 let transportHook=null;const storageFactory=()=>({...S.storageFactory(),getBuffer:async k=>{if(transportHook)await transportHook();return S.bytes.get(k);}});
 server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1';
 async function call(method,url,{user=buyer,party=null,body,record,op=key(),schema='DirectoryResponse',headers={}}={}){const r=await fetch(base+url,{method,headers:{...(user?{Authorization:'Bearer '+user.token}:{}),...(party?{'X-Acting-Party':party}:{}),...(body!==undefined?{'Content-Type':'application/json','Idempotency-Key':op}:{}),...(record?{'If-Match':'"'+record.object_version+'"'}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});if(!r.headers.get('content-type')?.includes('json'))return {status:r.status,bytes:Buffer.from(await r.arrayBuffer()),headers:r.headers};const j=await r.json();fixtures.push({method,path:new URL(base+url).pathname,schema:r.status===200?schema:'ErrorResponse',value:j});return {status:r.status,...j};}
 const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;},bad=(r,status)=>assert.equal(r.status,status,JSON.stringify(r));
 const submit=(p=profile,op=key())=>call('POST','/directory/organization-profiles',{party:org.party_id,body:{profile:p},op});
 const review=(r,user=reviewer,checks)=>call('POST','/directory/records/'+r.id+'/reviews',{user,record:r,body:{decision:'APPROVE',reason:'independent synthetic verification',checks:checks|| (r.kind==='ORGANIZATION'?{identity_verified:true,capabilities_verified:true,materials_reviewed:true,public_display_authorized:true,no_private_contact:true}:{public_source_verified:true,recommendation_reviewed:true,not_star_certification:true})}});
 const pub=()=>call('GET','/directory/organizations/'+org.party_id);let record,approved,featured;
 await t.test('unverified capability cannot be advertised and personal/foreign identities denied',async()=>{
  bad(await submit(),409);await db.execute("UPDATE party_capabilities SET current_status='ACTIVE' WHERE party_id=? AND code='PRODUCER'",[org.party_id]);
  bad(await call('POST','/directory/organization-profiles',{party:buyer.personal_party_id,body:{profile}}),409);
  bad(await call('POST','/directory/organization-profiles',{user:outsider,party:org.party_id,body:{profile}}),403);
 });
 await t.test('first submission retry retains one record; private evidence stays private before review',async()=>{
  const op=key();record=ok(await submit(profile,op));assert.deepEqual(ok(await submit(profile,op)),record);bad(await submit({...profile,introduction:'changed'},op),409);bad(await pub(),404);
  assert.equal(ok(await call('GET','/directory/organizations')).items.length,0);
  ok(await call('GET','/directory/records/'+record.id,{party:org.party_id}));bad(await call('GET','/directory/records/'+record.id,{user:S.seller,party:S.seller.personal_party_id}),404);
  assert.equal(ok(await call('GET','/directory/records?kind=ORGANIZATION',{party:org.party_id})).items.length,1);
 });
 await t.test('independent reviewer reads evidence and requires explicit checks; same owner rejected',async()=>{
  const material=await call('GET','/directory/records/'+record.id+'/materials/'+evidence.id,{user:reviewer});assert.equal(material.status,200);assert.match(material.bytes.toString(),/private synthetic/);
  bad(await review(record,buyer),403);bad(await review(record,reviewer,{}),400);bad(await review({...record,object_version:10}),412);approved=ok(await review(record));
 });
 await t.test('public projection and cover are exact, current and free of private fields',async()=>{
  const p=ok(await pub());assert.equal(p.party_id,org.party_id);assert.equal(p.cover.asset_id,cover.id);assert.deepEqual(p.verified_capabilities,['PRODUCER']);for(const k of ['evidence','review','phone','object_key','created_by'])assert.ok(!JSON.stringify(p).includes(k));
  const picture=await call('GET','/directory/organizations/'+org.party_id+'/cover');assert.equal(picture.status,200);assert.deepEqual(picture.bytes,png);assert.equal(picture.headers.get('cache-control'),'no-store');
  bad(await call('GET','/directory/organizations',{user:null}),401);bad(await call('GET','/directory/organizations',{party:org.party_id}),400);
 });
 await t.test('server search and city aliases, cursor cannot cross query or role boundaries',async()=>{
  assert.equal(ok(await call('GET','/directory/organizations?city='+encodeURIComponent('北京')+'&q='+encodeURIComponent('影片'))).items.length,1);
  assert.equal(ok(await call('GET','/directory/organizations?q=unmatched')).items.length,0);bad(await call('GET','/directory/organizations?cursor=e30'),400);
  const extra=ok(await submit({...profile,display_name:'second submitted revision'}));const list=ok(await call('GET','/directory/records?kind=ORGANIZATION&limit=1',{party:org.party_id}));assert.ok(list.next_cursor);bad(await call('GET','/directory/records?kind=ORGANIZATION&cursor='+list.next_cursor,{user:reviewer}),400);
  ok(await call('POST','/directory/records/'+extra.id+'/reviews',{user:reviewer,record:extra,body:{decision:'REJECT',reason:'synthetic rejection',checks:null}}));assert.equal(ok(await pub()).record_id,approved.id);
 });
 await t.test('public pagination visits every organization and binds cursor to filters',async()=>{
  const others=[];
  for(let n=0;n<2;n++){const company=await S.parties.createOrganization(buyer.ctx,{display_name:'synthetic extra '+n,operation_key:key()});const proof=await S.supply.upload(buyer.ctx,{party_id:company.party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from('synthetic private '+n),operation_key:key()});const r=ok(await call('POST','/directory/organization-profiles',{party:company.party_id,body:{profile:{...profile,capabilities:[],cover_asset_id:null,evidence_asset_ids:[proof.id]}}}));others.push({party:company.party_id,record:ok(await review(r))});}
  let cursor='',found=[],firstCursor;do{const page=ok(await call('GET','/directory/organizations?limit=1'+(cursor?'&cursor='+cursor:'')));found.push(...page.items.map(r=>r.party_id));cursor=page.next_cursor;firstCursor=firstCursor||cursor;}while(cursor);
  assert.deepEqual(found.sort(),[org.party_id,...others.map(x=>x.party)].sort());assert.equal(new Set(found).size,3);bad(await call('GET','/directory/organizations?city=Shanghai&cursor='+firstCursor),400);bad(await call('GET','/directory/featured-artists?cursor='+firstCursor),400);
  for(const x of others)ok(await call('POST','/directory/records/'+x.record.id+'/withdrawals',{party:x.party,record:x.record,body:{reason:'end synthetic extra profile'}}));
 });
 await t.test('concurrent approved replacements serialize; both histories retained and only one public',async()=>{
  const one=ok(await submit({...profile,display_name:'replacement one'})),two=ok(await submit({...profile,display_name:'replacement two'}));const results=await Promise.all([review(one),review(two)]);results.forEach(ok);
  const [rows]=await db.execute("SELECT * FROM directory_records WHERE owner_party_id=? AND current_status='APPROVED'",[org.party_id]);assert.equal(rows.length,1);approved=ok(await call('GET','/directory/records/'+rows[0].id,{party:org.party_id}));assert.equal(ok(await pub()).record_id,approved.id);
 });
 await t.test('capability revocation and corrupt/withdrawn images never leak cached bytes',async()=>{
  await db.execute("UPDATE party_capabilities SET current_status='SUSPENDED' WHERE party_id=? AND code='PRODUCER'",[org.party_id]);bad(await pub(),409);assert.equal(ok(await call('GET','/directory/organizations')).items.length,0);await db.execute("UPDATE party_capabilities SET current_status='ACTIVE' WHERE party_id=? AND code='PRODUCER'",[org.party_id]);
  const [[f]]=await db.execute('SELECT object_key FROM supply_assets WHERE id=?',[cover.id]);S.bytes.set(f.object_key,Buffer.from('bad'));bad(await call('GET','/directory/organizations/'+org.party_id+'/cover'),503);S.bytes.set(f.object_key,png);
  transportHook=async()=>{transportHook=null;ok(await call('POST','/directory/records/'+approved.id+'/withdrawals',{party:org.party_id,record:approved,body:{reason:'withdraw during file read'}}));};bad(await call('GET','/directory/organizations/'+org.party_id+'/cover'),404);assert.equal(ok(await call('GET','/directory/organizations')).items.length,0);
 });
 await t.test('editorial recommendation needs independent review and is not star certification',async()=>{
  const feature={listing_id:S.publicListing.id,recommendation:'合成精选推荐',sort_order:3,valid_from:profile.valid_from,valid_until:profile.valid_until};
  const r=ok(await call('POST','/directory/featured-artists',{user:outsider,body:{feature}}));bad(await review(r,outsider),403);featured=ok(await review(r));
  const items=ok(await call('GET','/directory/featured-artists')).items;assert.equal(items.length,1);assert.equal(items[0].selection_kind,'EDITORIAL_SELECTION');assert.equal(items[0].artist.listing_id,S.publicListing.id);assert.ok(!JSON.stringify(items).includes('evidence'));
  bad(await call('POST','/directory/featured-artists',{user:S.seller,body:{feature}}),403);
 });
 await t.test('expired recommendation is hidden; revoked underlying public consent immediately hides selection',async()=>{
  const D=require('../src/modules/governance/content'),A=require('../src/modules/artists/context');
  const data={...featured.data,feature:{...featured.data.feature,valid_until:'2021-01-01T00:00:00.000Z'}};await db.execute('UPDATE directory_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(data),D.digest(data),featured.id]);assert.equal(ok(await call('GET','/directory/featured-artists')).items.length,0);await db.execute('UPDATE directory_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(featured.data),D.digest(featured.data),featured.id]);
  await db.execute("UPDATE artist_records SET current_status='WITHDRAWN' WHERE id=?",[S.publicConsent.id]);assert.equal(ok(await call('GET','/directory/featured-artists')).items.length,0);
 });
 await t.test('publisher filter traverses all notice pages without including other publishers',async()=>{
  const ids=[];for(let k=0;k<3;k++){let n=await S.notices.createNotice(buyer.ctx,{party_id:buyer.personal_party_id,rule_id:S.rule.id,notice:{...S.body,title:'scoped notice '+k},operation_key:key()});n=await S.notices.review(reviewer.ctx,{record_id:n.id,expected_version:n.object_version,decision:'APPROVE',reason:'synthetic',checks:{content_reviewed:true,materials_reviewed:true,no_private_contact:true},operation_key:key()});ids.push(n.id);}
  let after='',found=[];do{const p=ok(await call('GET','/notices/catalog?publisher_party_id='+buyer.personal_party_id+'&limit=1'+(after?'&cursor='+after:''),{schema:'NoticeResponse'}));found.push(...p.items.map(r=>r.id));after=p.next_cursor;}while(after);assert.deepEqual(found,ids.sort());assert.equal(ok(await call('GET','/notices/catalog?publisher_party_id='+org.party_id,{schema:'NoticeResponse'})).items.length,0);bad(await call('GET','/notices/catalog?publisher_party_id=bad'),400);bad(await call('GET','/notices/catalog?publisher_party_id='),400);
 });
 await fs.mkdir(path.resolve(__dirname,'../../../../.local'),{recursive:true});await fs.writeFile(path.resolve(__dirname,'../../../../.local/directory-http-fixtures.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
