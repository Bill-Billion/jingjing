(function(require,__dirname){
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
test('ordinary publishing and same-notice cooperation in isolated MySQL',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v]of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_'+process.pid+'_'+randomBytes(6).toString('hex');
 const control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
 let db,server,web;
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
  db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./helpers/notices-seed.cjs').seedNotices(db),{buyer,buyer2,seller,outsider,reviewer,notices:N}=S;
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');
  await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port+'/api/v1',fixtures=[],records={synthetic_only:true,database:name};
  async function call(method,url,u=buyer,body,party=u.personal_party_id,h={}){
   const res=await fetch(base+url,{method,headers:{Authorization:'Bearer '+u.token,...(party?{'X-Acting-Party':party}:{}),...(body?{'Content-Type':Buffer.isBuffer(body)?'application/octet-stream':'application/json'}:{}),...h},...(body?{body:Buffer.isBuffer(body)?body:JSON.stringify(body)}:{})});
   if(!(res.headers.get('content-type')||'').includes('json'))return {status:res.status,bytes:Buffer.from(await res.arrayBuffer())};
   const value=await res.json();fixtures.push({method,path:new URL(base+url).pathname,schema:res.status===200?(url.startsWith('/operations/notifications')?'OpsNotificationListResponse':url.startsWith('/gigs/')?'CommercialConversationResponse':url.startsWith('/trade/')?'TradeRecordResponse':url.startsWith('/production/')?'ProductionRecordResponse':'NoticeResponse'):'ErrorResponse',value});
   return {status:res.status,...value};
  }
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;},bad=(r,c)=>assert.equal(r.error?.code,c,JSON.stringify(r));
  const headers=(r,k=key())=>({'Idempotency-Key':k,...(r?{'If-Match':'"'+r.object_version+'"'}:{})});
  const approve=(r,u=reviewer,checks={content_reviewed:true,materials_reviewed:true,no_private_contact:true})=>call('POST','/notices/records/'+r.id+'/reviews',u,{decision:'APPROVE',reason:'synthetic independent review',checks},null,headers(r));
  const read=(r,u=buyer)=>call('GET','/notices/records/'+r.id,u);
  const create=(rule,u=buyer,notice=S.body,h=headers(),party=u.personal_party_id)=>call('POST','/notices/announcements',u,{rule_id:rule.id,notice},party,h);
  let rule,published,legacy,submission,caseRecord,quote,trade,order,work,productionProof;
  if(process.env.JX_PM01_NOTICES_WEB==='1')web=await require('./support/notices-browser.cjs').start({base,buyer,seller,reviewer,fixtures});
  await t.test('new publishing rule requires independent approval; old rule and notices retain snapshots',async()=>{
   legacy=ok(await approve(ok(await create(S.rule))));
   const input={...S.ruleInput,version:'PM01-20261111',publishing_policy:'VERIFIED_ADULT_20261111'};
   let pending=ok(await call('POST','/notices/rules',outsider,{rule:input},null,headers()));
   bad(await create(pending,buyer2),'NOTICE_RULE_NOT_EFFECTIVE');
   bad(await approve(pending,outsider,{business_rule_verified:true}),'SELF_REVIEW_FORBIDDEN');
   rule=ok(await approve(pending,reviewer,{business_rule_verified:true}));
   const rules=ok(await call('GET','/notices/rules',buyer,undefined,null)).items;
   assert.equal(rules.find(r=>r.id===rule.id).rule.publishing_policy,'VERIFIED_ADULT_20261111');
   assert.equal(rules.find(r=>r.id===S.rule.id).rule.publishing_policy,undefined);
   records.rule_id=rule.id;records.legacy_rule_id=S.rule.id;records.legacy_notice_id=legacy.id;
  });
  await t.test('never-funded adult can publish all five ordinary types without changing membership',async()=>{
   assert.equal(ok(await call('GET','/notices/eligibility?rule_id='+S.rule.id,buyer2)).active,false);
   const q=ok(await call('GET','/notices/eligibility?rule_id='+rule.id,buyer2));
   assert.equal(q.active,true);assert.equal(q.level,0);assert.deepEqual(q.types,['DRAMA','PERFORMANCE','COMMERCIAL','EVENT','RECRUITMENT']);
   const details={DRAMA:{synopsis:'synthetic',roles:'adult'},PERFORMANCE:{venue:'synthetic',schedule:'synthetic',requirements:'adult'},COMMERCIAL:{deliverables:'synthetic',requirements:'adult'},EVENT:{venue:'synthetic',schedule:'synthetic'},RECRUITMENT:S.body.details};
   for(const type of q.types){
    const n=ok(await create(rule,buyer2,{...S.body,type,details:details[type],accept_submissions:['DRAMA','RECRUITMENT'].includes(type)}));
    bad(await call('GET','/notices/catalog/'+n.id,seller,undefined,null),'NOTICE_NOT_OPEN');
    const live=ok(await approve(n));assert.equal(live.current_status,'PUBLISHED');
    assert.equal(ok(await call('GET','/notices/catalog/'+n.id,seller,undefined,null)).official,false);
   }
   assert.equal(ok(await call('GET','/notices/eligibility?rule_id='+S.rule.id,buyer2)).active,false);
  });
  await t.test('membership revocation leaves new ordinary publishing usable and legacy eligibility unchanged',async()=>{
   await N.close(reviewer.ctx,{record_id:S.topup.id,expected_version:S.topup.object_version,reason:'synthetic membership loss',operation_key:key()});
   bad(await call('GET','/notices/catalog/'+legacy.id,seller,undefined,null),'NOTICE_PUBLISHER_NOT_ELIGIBLE');
   bad(await create(S.rule),'NOTICE_PUBLISHER_NOT_ELIGIBLE');
   const requestKey=key(),h=headers(null,requestKey),pending=ok(await create(rule,buyer,S.body,h));
   assert.deepEqual(ok(await create(rule,buyer,S.body,h)),pending);
   bad(await create(rule,buyer,{...S.body,title:'changed request'},h),'IDEMPOTENCY_CONFLICT');
   assert.equal(ok(await read(pending)).current_status,'IN_REVIEW');
   bad(await approve(pending,buyer),'NOTICE_OPERATOR_FORBIDDEN');
   published=ok(await approve(pending));assert.equal(ok(await read(published)).data.rule_id,rule.id);
   records.notice_id=published.id;
   assert.ok(ok(await call('GET','/notices/catalog?publisher_party_id='+buyer.personal_party_id,seller,undefined,null)).items.some(r=>r.id===published.id));
   assert.equal(ok(await read(legacy)).content_sha256,legacy.content_sha256);
  });
  await t.test('unverified, child, expired, inactive, foreign identity and official impersonation remain rejected',async()=>{
   bad(await create(rule,outsider),'NOTICE_VERIFIED_ADULT_REQUIRED');
   bad(await create(rule,buyer2,S.body,headers(),buyer.personal_party_id),'ARTIST_PARTY_FORBIDDEN');
   bad(await create(rule,buyer,{...S.body,type:'OFFICIAL',details:{summary:'synthetic'},accept_submissions:false},headers(),null),'NOTICE_OPERATOR_FORBIDDEN');
   bad(await create(rule,buyer,{...S.body,description:'https://example.test'}),'NOTICE_PRIVATE_CONTACT_FORBIDDEN');
   const fields=[['age_band','MINOR','ADULT'],['identity_status','FAILED','VERIFIED'],['current_status','WITHDRAWN','ACTIVE'],['identity_valid_until','2020-01-01 00:00:00.000','2099-01-01 00:00:00.000']];
   for(const [field,value,restore]of fields){
    await db.execute('UPDATE artist_people SET '+field+'=? WHERE id=?',[value,buyer2.person.id]);
    try{bad(await create(rule,buyer2),field==='age_band'?'MINOR_OPERATION_RESTRICTED':'NOTICE_VERIFIED_ADULT_REQUIRED');}finally{await db.execute('UPDATE artist_people SET '+field+'=? WHERE id=?',[restore,buyer2.person.id]);}
   }
   const rejected=ok(await create(rule,buyer2));
   const out=ok(await call('POST','/notices/records/'+rejected.id+'/reviews',reviewer,{decision:'REJECT',reason:'synthetic rejection',checks:null},null,headers(rejected)));
   assert.equal(out.current_status,'REJECTED');bad(await call('GET','/notices/catalog/'+out.id,seller,undefined,null),'NOTICE_NOT_OPEN');
  });
  await t.test('identity or ownership lost after submission is checked at review and public read',async()=>{
   const pending=ok(await create(rule,buyer2));
   await db.execute("UPDATE artist_people SET identity_valid_until='2020-01-01 00:00:00.000' WHERE id=?",[buyer2.person.id]);
   try{bad(await approve(pending),'NOTICE_VERIFIED_ADULT_REQUIRED');assert.equal(ok(await read(pending,buyer2)).current_status,'IN_REVIEW');}
   finally{await db.execute("UPDATE artist_people SET identity_valid_until='2099-01-01 00:00:00.000' WHERE id=?",[buyer2.person.id]);}
   const live=ok(await approve(pending));
   await db.execute("UPDATE party_memberships SET current_status='REVOKED' WHERE party_id=? AND account_id=?",[buyer2.personal_party_id,buyer2.account_id]);
   try{bad(await call('GET','/notices/catalog/'+live.id,seller,undefined,null),'ARTIST_PARTY_FORBIDDEN');}
   finally{await db.execute("UPDATE party_memberships SET current_status='ACTIVE' WHERE party_id=? AND account_id=?",[buyer2.personal_party_id,buyer2.account_id]);}
   assert.equal(ok(await call('GET','/notices/catalog/'+live.id,seller,undefined,null)).id,live.id);
  });
  await t.test('organization scope and other project ownership cannot be bypassed with an ordinary rule',async orgT=>{
   const org=await S.parties.createOrganization(buyer2.ctx,{display_name:'synthetic ordinary organization',operation_key:key()});
   bad(await create(rule,buyer2,S.body,headers(),org.party_id),'NOTICE_PUBLISHER_NOT_ELIGIBLE');
   bad(await create(rule,buyer2,{...S.body,project_id:key()}),'NOTICE_PROJECT_MISMATCH');
   const proof=await S.supply.upload(buyer2.ctx,{party_id:org.party_id,purpose:'RIGHTS_EVIDENCE',media_type:'text/plain',body:Buffer.from('synthetic qualification'),operation_key:key()});
   const q=await N.applyQualification(buyer2.ctx,{party_id:org.party_id,types:['RECRUITMENT'],valid_from:S.body.valid_from,valid_until:S.body.valid_until,evidence_asset_ids:[proof.id],terms:'synthetic scope',operation_key:key()});
   ok(await approve(q,reviewer,{identity_verified:true,authority_verified:true,evidence_verified:true}));
   assert.equal(ok(await approve(ok(await create(rule,buyer2,S.body,headers(),org.party_id)))).current_status,'PUBLISHED');
   for(const [field,value,restore] of [['identity_status','UNVERIFIED','VERIFIED'],['identity_status','REJECTED','VERIFIED'],['identity_valid_until','2020-01-01 00:00:00.000','2099-01-01 00:00:00.000']]){
    await orgT.test('qualified organization publishing rejects actor '+value,async()=>{
     await db.execute('UPDATE artist_people SET '+field+'=? WHERE id=?',[value,buyer2.person.id]);
     try{const r=await create(rule,buyer2,S.body,headers(),org.party_id);assert.equal(r.status,409,JSON.stringify(r));assert.equal(r.error.code,'VERIFIED_ADULT_REQUIRED');}
     finally{await db.execute('UPDATE artist_people SET '+field+'=? WHERE id=?',[restore,buyer2.person.id]);}
    });
   }

   bad(await create(rule,buyer2,{...S.body,type:'EVENT',details:{venue:'synthetic',schedule:'synthetic'},accept_submissions:false},headers(),org.party_id),'NOTICE_PUBLISHER_NOT_ELIGIBLE');
  });
  const out=process.env.JX_NOTICES_ORDINARY_HTTP_FIXTURES||path.resolve(__dirname,'../../../..','.local/notice-identity-probe-http.json');
  await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
  await fs.writeFile(out.replace(/\.json$/,'.records.json'),JSON.stringify(records,null,2));
 }finally{
  if(web)await web.close();if(server)await new Promise(r=>server.close(r));if(db)await db.close();
  await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();
 }
});

})(require('node:module').createRequire("D:\\ccc\\\u535a\u58eb\u8d44\u6599\\7.\u9879\u76ee\\2026-\u6676\u6676\u65e5\u4e0a\\worktrees\\client-testing\\\u6676\u6676\u65e5\u4e0a\u5de5\u7a0b\u4ea4\u63a5\u5305\\01_\u6e90\u7801\\backend_server\\test\\notices-ordinary.integration.test.cjs"),"D:\\ccc\\\u535a\u58eb\u8d44\u6599\\7.\u9879\u76ee\\2026-\u6676\u6676\u65e5\u4e0a\\worktrees\\client-testing\\\u6676\u6676\u65e5\u4e0a\u5de5\u7a0b\u4ea4\u63a5\u5305\\01_\u6e90\u7801\\backend_server\\test");
