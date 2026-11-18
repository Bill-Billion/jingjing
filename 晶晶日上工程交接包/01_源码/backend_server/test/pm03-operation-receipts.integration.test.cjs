'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
const {digest}=require('../src/modules/governance/content');
test('PM03 original notice acknowledgement survives deadline but never grants new authority',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v]of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_pm03_receipts_'+randomBytes(8).toString('hex');
 const control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
 let db,server;const fixtures=[];
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
  db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./helpers/notices-seed.cjs').seedNotices(db),{seller,buyer,reviewer,outsider}=S;
  let notice=await S.notices.createNotice(buyer.ctx,{party_id:buyer.personal_party_id,rule_id:S.rule.id,notice:S.body,operation_key:key()});
  notice=await S.notices.review(reviewer.ctx,{record_id:notice.id,expected_version:notice.object_version,decision:'APPROVE',reason:'synthetic',checks:{content_reviewed:true,materials_reviewed:true,no_private_contact:true},operation_key:key()});
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port+'/api/v1',operation=key();
  const body={rule_id:S.rule.id,submission:{...S.submission,notice_id:notice.id}};
  async function request(u,url,{party=u.personal_party_id,body,op=operation,schema='OperationReceiptResponse'}={}){
   const res=await fetch(base+url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+u.token,...party?{'X-Acting-Party':party}:{},...body?{'Content-Type':'application/json','Idempotency-Key':op}:{}},...body?{body:JSON.stringify(body)}:{}}),value=await res.json();
   fixtures.push({method:body?'POST':'GET',path:new URL(base+url).pathname,schema:res.status===200?schema:'ErrorResponse',value});return {status:res.status,data:value.data,error:value.error};
  }
  const posted=await request(seller,'/notices/submissions',{body,schema:'NoticeResponse'});assert.equal(posted.status,200,JSON.stringify(posted));
  const url='/notices/operations/'+operation+'?operation=SUBMIT';
  await t.test('expired notice and expired consent do not erase original successful command',async()=>{
   const data={...notice.data,notice:{...notice.data.notice,valid_until:'2020-01-02T00:00:00.000Z'}};
   await db.execute('UPDATE notice_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(data),digest(data),notice.id]);
   await db.execute("UPDATE artist_records SET current_status='WITHDRAWN' WHERE id=?",[S.consent.id]);
   assert.equal((await request(seller,'/notices/submissions',{body,schema:'NoticeResponse'})).status,409);
   const receipt=await request(seller,url);assert.equal(receipt.status,200);assert.equal(receipt.data.outcome,'COMMITTED');
   assert.equal(receipt.data.record_id,posted.data.id);assert.equal(receipt.data.request_sha256,digest({...body,party_id:seller.personal_party_id,operation_key:operation}));
   assert.equal(receipt.data.original_status,'IN_REVIEW');assert.equal(receipt.data.data,undefined);
   assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM notice_records WHERE kind='SUBMISSION'"))[0][0].n),1);
  });
  await t.test('other accounts, acting subjects and lost memberships cannot retrieve original receipt',async()=>{
   assert.equal((await request(outsider,url)).data.outcome,'NOT_OBSERVED');
   assert.equal((await request(outsider,url,{party:seller.personal_party_id})).status,403);
   assert.equal((await request(seller,url,{party:null})).status,400);
   await db.execute("UPDATE party_memberships SET current_status='REVOKED' WHERE account_id=? AND party_id=?",[seller.account_id,seller.personal_party_id]);
   try{assert.equal((await request(seller,url)).status,403);}finally{await db.execute("UPDATE party_memberships SET current_status='ACTIVE' WHERE account_id=? AND party_id=?",[seller.account_id,seller.personal_party_id]);}
  });
  await t.test('absence is NOT_OBSERVED and unsupported operations are rejected without writing commands',async()=>{
   const count=Number((await db.execute('SELECT COUNT(*) n FROM notice_commands'))[0][0].n);
   const missing=await request(seller,'/notices/operations/'+key()+'?operation=SUBMIT');assert.equal(missing.data.outcome,'NOT_OBSERVED');assert.equal(missing.data.record_id,null);
   assert.equal((await request(seller,'/notices/operations/'+operation+'?operation=REVIEW')).status,400);
   assert.equal(Number((await db.execute('SELECT COUNT(*) n FROM notice_commands'))[0][0].n),count);
  });
  const out=path.resolve(__dirname,'../../../../.local');await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'pm03-operation-receipts-http.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();await control.query('DROP DATABASE '+mysql.escapeId(name));await control.end();}
});
