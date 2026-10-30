"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
test('personal center uses original business permissions, real dates and independent source recovery',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_personal_'+randomBytes(6).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 try{
 await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
 const seed=await require('./helpers/stock-seed.cjs').seedStock(db),{seller,buyer,outsider,buyer2}=seed;
 const listing=await seed.listing(),order=await seed.checkout(listing);await seed.payment(order);const listing2=await seed.listing(),order2=await seed.checkout(listing2);await seed.payment(order2);
 const parties=require('../src/modules/party/repository').createPartyRepository(db,{resolvePrincipal:seed.resolvePrincipal}),organization=await parties.createOrganization(buyer.ctx,{display_name:'Synthetic organization',operation_key:key()});
 assert.ok(organization.party_id);
 const governance=require('../src/modules/governance/repository').createGovernanceRepository(db,{resolvePrincipal:seed.resolvePrincipal});
 for(const action of ['CREATE_SOURCE','REVIEW_SOURCE','SEAL'])await require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:seller.account_id,action,enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:personal-center',reason:'isolated fixture'});
 const source=await governance.createSource(seller.ctx,{content:{business_ref:'synthetic:'+key(),revision:'1',party_ids:[seller.personal_party_id,buyer.personal_party_id],reader_account_ids:[seller.account_id,buyer.account_id],rule_ids:[seed.ruleId],commitments:{notice:'synthetic historical promise'}},operation_key:key()});
 await governance.transitionSource(seller.ctx,{source_ref:source.source_ref,target_status:'REVIEWED',expected_version:source.object_version,review_ref:'synthetic:review',operation_key:key()});
 const snapshot=await governance.seal(seller.ctx,{source_ref:source.source_ref,operation_key:key()});
 server=require('../src/http/account-api').createAccountApi({db,secret:seed.secret,supplyStorageFactory:seed.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1/me/business/',fixtures=[];
 async function call(category,user=buyer,party=user.personal_party_id){const r=await fetch(base+category,{headers:{Authorization:'Bearer '+user.token,...party?{'X-Acting-Party':party}:{}}});const value=await r.json();if(r.status===200)fixtures.push({name:category,schema:'PersonalCenterResponse',value});return {status:r.status,value};}
 const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.value));assert.equal(r.value.data.partial,false,JSON.stringify(r.value));return r.value.data;};const section=(data,name)=>data.sections.find(s=>s.source===name);
 await t.test('all categories enumerate explicit sources; paid purchases return original IDs and statuses without file links',async()=>{
  const contracts=ok(await call('contracts')),works=ok(await call('works')),income=ok(await call('income'));assert.equal(contracts.sections.length,8);assert.equal(works.sections.length,5);assert.equal(income.sections.length,2);
  assert.equal(section(contracts,'CONTRACT_SNAPSHOTS').items[0].record_id,snapshot.id);assert.equal(section(contracts,'CONTRACT_SNAPSHOTS').items[0].current_status,'SEALED');
  assert.deepEqual(new Set(section(contracts,'TRADE_ORDERS').items.map(x=>x.record_id)),new Set([order.id,order2.id]));
  const bought=section(works,'STOCK_PURCHASES').items;assert.equal(bought.length,2);assert.ok(bought.every(x=>x.key==='STOCK_PURCHASE:'+x.record_id&&x.income===null));assert.ok(!JSON.stringify(works).includes('object_key'));assert.equal(section(ok(await call('works',seller)),'STOCK_LISTINGS').items.length,2);
  assert.equal(section(contracts,'TRADE_ORDERS').items.find(x=>x.record_id===order.id).key,'TRADE:'+order.id);
 });
 await t.test('order is by stored creation time, ties are stable; signed pagination isolates scopes',async()=>{
  await db.execute("UPDATE trade_records SET created_at='2026-01-01 00:00:00.000' WHERE id IN (?,?)",[order.id,order2.id]);
  const first=section(ok(await call('contracts?source=TRADE_ORDERS&limit=1')),'TRADE_ORDERS');assert.ok(first.next_cursor);assert.equal(first.items[0].record_id,[order.id,order2.id].sort().at(-1));
  const second=section(ok(await call('contracts?source=TRADE_ORDERS&limit=1&cursor='+first.next_cursor)),'TRADE_ORDERS');assert.equal(second.next_cursor,null);assert.notEqual(second.items[0].record_id,first.items[0].record_id);
  for(const query of ['contracts?cursor='+first.next_cursor,'works?source=STOCK_PURCHASES&cursor='+first.next_cursor,'contracts?source=TRADE_ORDERS&cursor='+first.next_cursor+'x','contracts?source=UNKNOWN','contracts?limit=1.0'])assert.equal((await call(query)).status,400);
  assert.equal((await call('contracts?source=TRADE_ORDERS&cursor='+first.next_cursor,buyer2)).status,400);
  assert.equal((await call('contracts?source=TRADE_ORDERS&cursor='+first.next_cursor,buyer,organization.party_id)).status,400);
 });
 await t.test('unrelated account and alternate identity cannot see private orders or snapshots; member revocation takes effect',async()=>{
  assert.equal((await call('contracts',outsider,buyer.personal_party_id)).status,403);assert.equal((await call('contracts',buyer,null)).status,400);
  const own=ok(await call('contracts',outsider));assert.ok(own.sections.every(s=>s.items.length===0));
  const org=ok(await call('contracts',buyer,organization.party_id));assert.ok(org.sections.every(s=>s.items.length===0));
  await db.execute("UPDATE party_memberships SET current_status='REVOKED' WHERE account_id=? AND party_id=?",[buyer.account_id,buyer.personal_party_id]);try{assert.equal((await call('works')).status,403);}finally{await db.execute("UPDATE party_memberships SET current_status='ACTIVE' WHERE account_id=? AND party_id=?",[buyer.account_id,buyer.personal_party_id]);}
 });
 await t.test('one corrupted source reports retryable failure without hiding successful sources; fixing original record restores same request',async()=>{
  const [[old]]=await db.execute('SELECT content_json FROM governance_snapshots WHERE id=?',[snapshot.id]);await db.execute("UPDATE governance_snapshots SET content_json=JSON_SET(content_json,'$.commitments.notice','damaged') WHERE id=?",[snapshot.id]);
  try{const r=await call('contracts');assert.equal(r.status,200);assert.equal(r.value.data.partial,true);const failed=section(r.value.data,'CONTRACT_SNAPSHOTS');assert.equal(failed.status,'UNAVAILABLE');assert.equal(failed.retryable,true);assert.equal(failed.items.length,0);assert.equal(section(r.value.data,'TRADE_ORDERS').items.length,2);}finally{await db.execute('UPDATE governance_snapshots SET content_json=? WHERE id=?',[typeof old.content_json==='string'?old.content_json:JSON.stringify(old.content_json),snapshot.id]);}
  assert.equal(section(ok(await call('contracts?source=CONTRACT_SNAPSHOTS')),'CONTRACT_SNAPSHOTS').items[0].record_id,snapshot.id);
 });
 await t.test('withdrawing snapshot reader access removes old entry and original detail remains denied',async()=>{
  await db.execute('DELETE FROM governance_snapshot_readers WHERE snapshot_id=? AND account_id=?',[snapshot.id,buyer.account_id]);assert.equal(section(ok(await call('contracts')),'CONTRACT_SNAPSHOTS').items.length,0);await assert.rejects(governance.readSnapshotForParty(buyer.ctx,{snapshot_id:snapshot.id,party_id:buyer.personal_party_id}),{code:'SNAPSHOT_NOT_FOUND'});
 });
 const out=path.resolve(__dirname,'../../../..','.local/personal-center-http-fixtures.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
