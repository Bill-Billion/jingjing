 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./fixtures/legacy-http.cjs');
function seed(db) {
 db.prepare("INSERT INTO mcn_agencies(id,user_id,name,status) VALUES (1,1,'Synthetic agency','approved')").run();
 db.prepare("INSERT INTO humans(id,user_id,name,province,city) VALUES (1,2,'Synthetic artist','test','test')").run();
 db.prepare("INSERT INTO user_identities(user_id,identity_type,status,mcn_id,real_name) VALUES (2,'personal','approved',99,'synthetic preserved')").run();
}
function snapshot(db) {
 return Object.fromEntries(['mcn_agencies','mcn_talents','user_identities','wallets','transactions','video_orders','endorsement_orders'].map(table=>[table,db.prepare(`SELECT * FROM ${table}`).all()]));
}
test('agency cannot bind an artist or overwrite their identity even by claiming consent',async(t)=>{
 const {db,request}=await fixture(t);seed(db);const before=snapshot(db);
 for(const role of ['user','admin'])for(let i=0;i<2;i++) {
  const r=await request('POST','/mcn/talents/add',{talentId:1,talentShare:100,consent:true,acceptedBy:2},1,role);
  assert.equal(r.status,503);assert.equal(r.body.code,'MCN_CONSENT_NOT_READY');assert.equal(r.body.submitted,false);
 }
 assert.deepEqual(snapshot(db),before);
 assert.equal((await request('POST','/mcn/talents/add',{},null)).status,401);
});
test('removing unrelated or historical members cannot overwrite any identity or delete history',async(t)=>{
 const {db,request}=await fixture(t);seed(db);
 for(const related of [false,true]) {
  if(related)db.prepare('INSERT INTO mcn_talents(mcn_id,talent_id) VALUES (1,1)').run();
  const before=snapshot(db);
  for(const talentId of [1,999])assert.equal((await request('POST','/mcn/talents/remove',{talentId})).status,503);
  assert.deepEqual(snapshot(db),before);
 }
});
test('agency application only records pending materials and preserves personal identity',async(t)=>{
 const {db,request}=await fixture(t);
 db.prepare("INSERT INTO user_identities(user_id,identity_type,status,real_name) VALUES (1,'personal','rejected','synthetic prior')").run();
 const before=db.prepare('SELECT * FROM user_identities').all();
 const r=await request('POST','/mcn/apply',{name:'Synthetic agency',contactPhone:'synthetic-phone',status:'approved',freeUntil:'2099-01-01'});
 assert.equal(r.status,200);assert.equal(r.body.status,'pending');assert.equal(r.body.verified,false);assert.equal(r.body.freeTrial,undefined);
 assert.deepEqual(db.prepare('SELECT * FROM user_identities').all(),before);
 const agency=db.prepare('SELECT * FROM mcn_agencies').get();assert.equal(agency.status,'pending');assert.equal(agency.free_until,null);
 assert.equal((await request('POST','/mcn/apply',{name:'Duplicate',contactPhone:'synthetic'})).status,400);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM mcn_agencies').get().n,1);
 assert.equal((await request('POST','/mcn/apply',{name:{bad:true},contactPhone:'synthetic'},2)).status,400);
});
test('historical relationships grant no access to artist income, lists or exports',async(t)=>{
 const {db,request}=await fixture(t);seed(db);db.prepare('INSERT INTO mcn_talents(mcn_id,talent_id) VALUES (1,1)').run();
 const before=snapshot(db);
 for(const role of ['user','admin'])for(const endpoint of ['dashboard','artists','export','ranking']) {
  const r=await request('GET','/mcn/'+endpoint,{},1,role);assert.equal(r.status,503);assert.equal(r.body.code,'MCN_CONSENT_NOT_READY');assert.equal(JSON.stringify(r.body).includes('Synthetic artist'),false);
 }
 const info=await request('GET','/mcn/info');assert.equal(info.body.recordedStatus,'approved');assert.equal(info.body.verified,false);assert.deepEqual(info.body.talents,[]);
 assert.equal((await request('GET','/mcn/info',{},2)).body.status,'none');
 assert.deepEqual(snapshot(db),before);
});
test('batch payout and fan analytics cannot fabricate submission or statistics',async(t)=>{
 const {db,request,upstream}=await fixture(t);seed(db);const before=snapshot(db);
 for(const body of [{},{artistIds:[1],amounts:[10]},{artistIds:'invalid'}]) {
  const r=await request('POST','/mcn/withdraw/batch',body);assert.equal(r.status,503);assert.equal(r.body.submitted,false);assert.equal(r.body.batchNo,undefined);
 }
 const r=await request('GET','/mcn/fan-profile');assert.equal(r.status,503);assert.equal(r.body.ageDistribution,undefined);
 assert.deepEqual(snapshot(db),before);assert.equal(upstream(),0);
});
test('old delivered flags cannot settle money or pay MCN commission through HTTP or internal caller',async(t)=>{
 const {db,request,videos,upstream}=await fixture(t);seed(db);
 db.prepare("UPDATE user_identities SET identity_type='mcn',mcn_id=1 WHERE user_id=2").run();
 db.prepare('INSERT INTO mcn_talents(mcn_id,talent_id) VALUES (1,1)').run();
 for(const table of ['video_orders','endorsement_orders']) {
  db.prepare(`INSERT INTO ${table}(id,order_no,user_id,talent_id,status,review_status,net_amount) VALUES (1,'OLD',1,1,'delivered','approved',10000)`).run();
 }
 const before=snapshot(db);
 for(const prefix of ['videos','endorsement']) {
  const r=await request('POST',`/${prefix}/verify/OLD`);assert.equal(r.status,503);assert.equal(r.body.settled,false);
  assert.equal((await request('POST',`/${prefix}/verify/OLD`,{},null)).status,401);
 }
 assert.throws(()=>videos.settleOrderExternal(db.prepare('SELECT * FROM video_orders').get()),{code:'LEGACY_SETTLEMENT_NOT_READY'});
 assert.deepEqual(snapshot(db),before);assert.equal(upstream(),0);
});
