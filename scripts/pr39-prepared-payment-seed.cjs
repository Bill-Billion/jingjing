'use strict';
// Only task-owned synthetic payments: emulate provider creation before the
// application persisted its response, without changing the trade record.
const path=require('node:path'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
const P=path.resolve(__dirname,'..'),B=path.join(P,'晶晶日上工程交接包/01_源码/backend_server'),req=require('node:module').createRequire(path.join(B,'package.json'));
req('./scripts/test-network-guard.cjs');
(async()=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8')),out=path.join(P,'.local/pr39-report-list'),a=JSON.parse(await fs.readFile(path.join(out,'access.json'))),fixture=JSON.parse(await fs.readFile(path.join(out,'prepared-payments.json')));
 assert(a.synthetic_only&&env.NODE_ENV==='test'&&env.MYSQL_HOST==='127.0.0.1'&&String(env.MYSQL_PORT)==='33316');
 const mysql=req('mysql2/promise'),admin=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db;
 try{const [rows]=await admin.query("SHOW DATABASES LIKE 'jx_test_consumer_%'");const found=[];for(const row of rows){const name=Object.values(row)[0];assert(/^jx_test_consumer_[a-f0-9]{16}$/.test(name));const [[r]]=await admin.query('SELECT id FROM '+mysql.escapeId(name)+'.trade_records WHERE id=? AND buyer_party_id=?',[fixture.payments[0].id,a.accounts.buyer2.party]);if(r)found.push(name);}assert.equal(found.length,1);db=await req('./src/infrastructure/database').openDatabase({...env,MYSQL_DATABASE:found[0]});const sim=await req('./src/testing/payment-simulator').createPaymentSimulator(db,{...env,MYSQL_DATABASE:found[0],JX_PAYMENT_SIMULATOR_ENABLED:'true'},{merchant_party_id:a.scope.merchant_party_id});
  for(const payment of fixture.payments.slice(0,2)){const [[r]]=await db.execute("SELECT * FROM trade_records WHERE id=? AND kind='PAYMENT' AND buyer_party_id=?",[payment.id,a.accounts.buyer2.party]);assert.equal(r.current_status,'CREATED');const d=typeof r.data_json==='string'?JSON.parse(r.data_json):r.data_json;assert.equal(d.amount_minor,100);await sim.get('ALIPAY').call('create',{id:r.id,amount_minor:d.amount_minor});}
  console.log('PREPARED_SIMULATOR_SEEDED 2 synthetic provider records; trade status unchanged');
 }finally{await db?.close();await admin.end();}
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
