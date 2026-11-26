'use strict';
// Read-only exact-delta proof after real rejected amendment and performer withdrawal.
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
 const changed=Object.keys(current).filter(k=>JSON.stringify(current[k])!==JSON.stringify(proof.copied_snapshot[k]));assert.deepEqual(changed.sort(),['auth_sessions','ops_events','ops_recipients','project_audit','project_commands','project_records','trade_commands']);
 assert.equal(current.trade_commands.rows-proof.copied_snapshot.trade_commands.rows,4,'PRIOR_TWO_PLUS_CURRENT_TWO_CHECKOUT_KEYS');
 for(const table of ['trade_records','trade_journal','trade_installments','trade_transactions','finance_records','finance_entries','finance_sources','project_participation_orders','test_payment_simulator'])assert.deepEqual(current[table],proof.copied_snapshot[table]);
 const[kinds]=await db.execute('SELECT kind,COUNT(*) AS n FROM trade_records GROUP BY kind ORDER BY kind');const counts=Object.fromEntries(kinds.map(x=>[x.kind,Number(x.n)]));assert.equal(counts.ORDER,5);assert.equal(counts.PAYMENT,10);assert.equal(counts.REFUND,3);assert.equal(current.trade_journal.rows,13);
 const[orders]=await db.execute("SELECT id,data_json FROM trade_records WHERE kind='ORDER' ORDER BY id");const money=orders.map(x=>({id:x.id,financial:(typeof x.data_json==='string'?JSON.parse(x.data_json):x.data_json).financial}));
 assert.deepEqual(money.find(x=>x.id==='08834e9a-d780-4bbe-8994-c503b8077f6f').financial,{received_minor:5000,refunded_minor:0,net_minor:5000});
 assert.deepEqual(money.find(x=>x.id==='4cf746af-9d27-4b5c-b839-2e2bc9e38a95').financial,{received_minor:10000,refunded_minor:7000,net_minor:3000});
 const[entries]=await db.execute('SELECT party_id,category,amount_minor FROM finance_entries ORDER BY party_id');assert.equal(entries.length,2);assert(entries.every(x=>x.category==='ACCRUAL'));assert.deepEqual(entries.map(x=>Number(x.amount_minor)).sort((a,b)=>a-b),[16000,64000]);
 const refs=await require('./qa18-environment-assets.cjs').references(db),disk=await require('./test-fixtures/qa18-disk-storage.cjs').openQaStorage(path.join(dir,'private-storage'));assert.equal(refs.length,52);for(const x of refs){const bytes=await disk.storageFactory().getBuffer(x.object_key);assert.equal(bytes.length,Number(x.byte_size));assert.equal(hash(bytes),x.content_sha256);}

 const projectId='7700df91-5cb6-4135-b180-949ee9031da8',proposalId='0ce7e6dd-1cbc-4277-80b9-e947426d995c',candidateId='badad132-78c7-4048-bf76-cab6c40e2528';
 const[before]=await offline.query('SELECT * FROM project_records ORDER BY id'),[after]=await db.query('SELECT * FROM project_records ORDER BY id');
 const old=new Map(before.map(x=>[x.id,x])),now=new Map(after.map(x=>[x.id,x]));assert.equal(after.length,before.length+1);
 for(const x of before)if(![projectId,candidateId].includes(x.id))assert.deepEqual(now.get(x.id),x,'ORIGINAL_PROJECT_RECORD_UNCHANGED '+x.id);
 assert.deepEqual(after.filter(x=>!old.has(x.id)).map(x=>x.id),[proposalId]);
 const project=now.get(projectId),candidate=now.get(candidateId),proposal=now.get(proposalId),decode=x=>typeof x.data_json==='string'?JSON.parse(x.data_json):x.data_json;
 const pd=decode(project),cd=decode(candidate),nd=decode(proposal),oldpd=decode(old.get(projectId));
 assert.equal(project.current_status,'PREPARING');assert.equal(project.object_version,old.get(projectId).object_version+1);assert.equal(pd.current_plan_id,null);assert.equal(pd.current_edition_id,null);assert.equal(pd.revision.previous_plan_id,oldpd.current_plan_id);assert.equal(pd.revision.previous_edition_id,oldpd.current_edition_id);
 assert.equal(candidate.current_status,'WITHDRAWN');assert.equal(candidate.object_version,old.get(candidateId).object_version+1);assert.equal(typeof candidate.data_sha256,'string');assert.notEqual(candidate.data_sha256,old.get(candidateId).data_sha256);assert.equal(cd.amount_minor,5000);
 assert.equal(proposal.current_status,'REJECTED');assert.equal(proposal.object_version,2);assert.equal(nd.fee_minor,5500);assert.equal(nd.order_id,null);assert.equal(nd.review.decision,'REJECTED');assert.equal(nd.review.reviewer_account_id,'ade5cdd1-ba41-4471-bcab-6dae7f745a20');assert.equal(nd.amendment.previous_agreement_id,'59afd06a-d038-4802-88a2-29e9bf200dcd');assert.equal(nd.amendment.cash_required_minor,500);
 const delta={};
 for(const table of ['project_commands','project_audit','ops_events','ops_recipients']){
  const[b]=await offline.query('SELECT * FROM '+table),[n]=await db.query('SELECT * FROM '+table);const bs=new Set(b.map(x=>JSON.stringify(x))),ns=new Set(n.map(x=>JSON.stringify(x)));assert.equal(bs.size,b.length);assert.equal(ns.size,n.length);for(const x of bs)assert(ns.has(x),'OLD_ROW_CHANGED '+table);
  delta[table]=n.filter(x=>!bs.has(JSON.stringify(x)));assert.equal(delta[table].length,table==='ops_recipients'?12:4);
 }
 assert.deepEqual(delta.project_commands.map(x=>x.result_id).sort(),[projectId,candidateId,proposalId,proposalId].sort());
 const events=['CANDIDATE_WITHDRAWN','PARTICIPATION_CREATED','PARTICIPATION_REVIEWED','PROJECT_REOPENED_FOR_NEW_CONFIRMATIONS'];
 for(const table of ['project_audit','ops_events']){assert.deepEqual(delta[table].map(x=>x.event_code).sort(),events);assert(delta[table].every(x=>[projectId,candidateId,proposalId].includes(x.record_id)));}
 const expectedActors={PROJECT_REOPENED_FOR_NEW_CONFIRMATIONS:'2596d31f-1f47-4526-a197-e87b6cded668',PARTICIPATION_CREATED:'87735029-692a-4fca-88c5-3cd05dc3753b',PARTICIPATION_REVIEWED:'ade5cdd1-ba41-4471-bcab-6dae7f745a20',CANDIDATE_WITHDRAWN:'87735029-692a-4fca-88c5-3cd05dc3753b'};
 for(const x of delta.project_audit)assert.equal(x.actor_account_id,expectedActors[x.event_code]);
 const eventIds=new Set(delta.ops_events.map(x=>x.id));assert(delta.ops_recipients.every(x=>eventIds.has(x.event_id)));
 const intended_changes={reopened_project:{id:projectId,status:project.current_status,version:project.object_version,previous_plan_id:pd.revision.previous_plan_id,previous_edition_id:pd.revision.previous_edition_id},rejected_proposal:{id:proposalId,status:proposal.current_status,version:2,fee_minor:5500,additional_minor:500,order_id:null,reviewer_account_id:nd.review.reviewer_account_id},withdrawn_candidate:{id:candidateId,before_status:old.get(candidateId).current_status,after_status:candidate.current_status,version_before:old.get(candidateId).object_version,version_after:candidate.object_version,hash_changed:true},all_other_project_records_unchanged:true,append_only:delta};
 const result={result:'PASS',source:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),read_only:true,database:a.database,project_id:proof.project_id,changed_tables:changed,intended_changes,only_expected_changed_tables:true,all_other_tables_equal:true,source_190_tables_unchanged:true,offline_190_tables_unchanged:true,counts,journal_rows:13,orders:money,income_accruals:entries,no_new_order_payment_refund_journal:true,private_files_verified:52,current_snapshot:current,checked_at:new Date().toISOString()};await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'POST_BOUNDARIES_CENSUS.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({result:'PASS',database:a.database,changed,orders:counts.ORDER,payments:counts.PAYMENT,refunds:counts.REFUND,journal:13,files:52,new_project_events:4,original_project_records_changed:2,new_rejected_proposals:1}));
}finally{await db.end();await original.end();await offline.end();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
