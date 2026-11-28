'use strict';
// Read-only post-browser census of the exact clone and untouched source/offline databases.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),be=path.join(root,'晶晶日上工程交接包/01_源码/backend_server'),load=p=>require(path.join(be,p));load('scripts/test-network-guard.cjs');
const {fingerprint}=require('./qa18-participation-clone.cjs'),hash=b=>createHash('sha256').update(b).digest('hex');
(async()=>{
const dir=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);for(const p of [dir,out])assert(p.startsWith(path.join(root,'.local/qa18')+path.sep));
const read=async p=>JSON.parse(await fs.readFile(p,'utf8')),a=await read(path.join(dir,'access.json')),proof=await read(path.join(dir,'CLONE_PROOF.json')),env=await read(process.env.JX_MYSQL_TEST_ENV_FILE);
assert(a.synthetic_only&&a.database===proof.database&&/^jx_test_qa18_participation_[a-f0-9]{20}$/.test(a.database));assert(env.MYSQL_HOST==='127.0.0.1'&&env.MYSQL_PORT==='33316'&&env.MYSQL_DATABASE==='jx_dev');
const mysql=load('node_modules/mysql2/promise'),connect=database=>mysql.createConnection({host:env.MYSQL_HOST,port:+env.MYSQL_PORT,user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database}),db=await connect(a.database),original=await connect(proof.source_database),offline=await connect(proof.offline_database);
try{
 const current=await fingerprint(db);assert.deepEqual(await fingerprint(original),proof.source_original_unchanged);assert.deepEqual(await fingerprint(offline),proof.copied_snapshot);
 const changed=Object.keys(current).filter(k=>JSON.stringify(current[k])!==JSON.stringify(proof.copied_snapshot[k]));assert.deepEqual(changed.sort(),['auth_sessions','trade_commands']);
 assert.equal(current.trade_commands.rows-proof.copied_snapshot.trade_commands.rows,2,'ONLY_TWO_NEW_ORIGINAL_CHECKOUT_KEYS');
 for(const table of ['trade_records','trade_journal','trade_installments','trade_transactions','finance_records','finance_entries','finance_sources','project_records','project_participation_orders','test_payment_simulator'])assert.deepEqual(current[table],proof.copied_snapshot[table]);
 const[kinds]=await db.execute('SELECT kind,COUNT(*) AS n FROM trade_records GROUP BY kind ORDER BY kind');const counts=Object.fromEntries(kinds.map(x=>[x.kind,Number(x.n)]));assert.equal(counts.ORDER,5);assert.equal(counts.PAYMENT,10);assert.equal(counts.REFUND,3);assert.equal(current.trade_journal.rows,13);
 const[orders]=await db.execute("SELECT id,data_json FROM trade_records WHERE kind='ORDER' ORDER BY id");const money=orders.map(x=>({id:x.id,financial:(typeof x.data_json==='string'?JSON.parse(x.data_json):x.data_json).financial}));
 assert.deepEqual(money.find(x=>x.id==='08834e9a-d780-4bbe-8994-c503b8077f6f').financial,{received_minor:5000,refunded_minor:0,net_minor:5000});
 assert.deepEqual(money.find(x=>x.id==='4cf746af-9d27-4b5c-b839-2e2bc9e38a95').financial,{received_minor:10000,refunded_minor:7000,net_minor:3000});
 const[entries]=await db.execute('SELECT party_id,category,amount_minor FROM finance_entries ORDER BY party_id');assert.equal(entries.length,2);assert(entries.every(x=>x.category==='ACCRUAL'));assert.deepEqual(entries.map(x=>Number(x.amount_minor)).sort((a,b)=>a-b),[16000,64000]);
 const refs=await require('./qa18-environment-assets.cjs').references(db),disk=await require('./test-fixtures/qa18-disk-storage.cjs').openQaStorage(path.join(dir,'private-storage'));assert.equal(refs.length,52);for(const x of refs){const bytes=await disk.storageFactory().getBuffer(x.object_key);assert.equal(bytes.length,Number(x.byte_size));assert.equal(hash(bytes),x.content_sha256);}
 const result={result:'PASS',source:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),read_only:true,database:a.database,project_id:proof.project_id,changed_tables:changed,only_fixture_sessions_and_two_idempotency_receipts:true,all_other_tables_equal:true,source_190_tables_unchanged:true,offline_190_tables_unchanged:true,counts,journal_rows:13,orders:money,income_accruals:entries,no_new_order_payment_refund_journal:true,private_files_verified:52,current_snapshot:current,checked_at:new Date().toISOString()};await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'POST_BROWSER_CENSUS.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({result:'PASS',database:a.database,changed,orders:counts.ORDER,payments:counts.PAYMENT,refunds:counts.REFUND,journal:13,files:52}));
}finally{await db.end();await original.end();await offline.end();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
