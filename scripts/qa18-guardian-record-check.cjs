'use strict';
// Read-only final reconciliation of the original W18 synthetic browser cases.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),load=p=>require(path.join(root,'晶晶日上工程交接包/01_源码/backend_server',p));
async function main(){
 const dir=path.resolve(process.env.QA18_ENV_DIR),out=path.resolve(process.env.QA18_OUTPUT_DIR);assert(dir.startsWith(path.join(root,'.local/qa18')+path.sep)&&out.startsWith(path.join(root,'.local/qa18')+path.sep));
 const read=async p=>JSON.parse(await fs.readFile(p,'utf8')),a=await read(path.join(dir,'access.json')),prep=await read(path.join(dir,'prepared.json')),s=await read(path.join(out,'browser/checkpoint.json')),status=await read(path.join(dir,'STATUS.json')),env=await read(process.env.JX_MYSQL_TEST_ENV_FILE);
 assert(a.synthetic_only&&a.database===s.environment&&s.complete&&/^jx_test_qa18_guardian_[a-f0-9]{20}$/.test(a.database));assert(env.MYSQL_HOST==='127.0.0.1'&&env.MYSQL_PORT==='33316'&&env.MYSQL_DATABASE==='jx_dev');
 const db=await load('src/infrastructure/database').openDatabase({...env,MYSQL_DATABASE:a.database}),cases=[];
 async function get(role,p,schema,expected=200){const r=await fetch(a.base_url+p,{headers:{Authorization:'Bearer '+a.accounts[role].bearer_token,...role==='child'?{'X-Acting-Party':a.accounts[role].party_id}:{}}});const value=await r.json();assert.equal(r.status,expected,p);cases.push({method:'GET',path:'/api/v1'+p,status:r.status,schema:expected===200?schema:'ErrorResponse',value});return value.data;}
 const parse=r=>typeof r.data_json==='string'?JSON.parse(r.data_json):r.data_json;
 try{
  const migrations=await load('src/infrastructure/database/migrator').status(db);assert.equal(migrations.migrations.length,225);assert(migrations.migrations.every(x=>x.status==='APPLIED'));
  const [rows]=await db.execute('SELECT id,kind,current_status,object_version,data_json FROM wallet_records WHERE owner_party_id=? ORDER BY id',[prep.child_party_id]);const original=rows.find(x=>x.id===prep.recharge.id);assert(original);assert.equal(parse(original).amount_minor,30000);assert.equal(parse(original).refunded_minor,10000);
  const expected={partial:['SUCCEEDED',10000],rejected:['REJECTED',0],cancel:['CANCELLED',2500],revoked:['CANCELLED',5000]},result={};
  assert.equal(rows.filter(x=>x.kind==='RECHARGE_REFUND').length,4);assert.equal(rows.filter(x=>['CASH_SPEND','EARNING','POINT_HOLD'].includes(x.kind)).length,0);
  for(const [label,[state,amount]]of Object.entries(expected)){
   const id=s.cases[label].record.id,row=rows.find(x=>x.id===id);assert(row);assert.equal(row.current_status,state);assert.equal(parse(row).amount_minor,amount);
   const child=await get('child','/wallet/recharge-refunds/'+id,'RechargeRefundResponse'),ops=await get('reviewer','/wallet/operations/recharge-refunds/'+id,'RechargeRefundResponse');assert.equal(child.id,ops.id);assert.equal(child.current_status,state);assert.equal(child.amount_minor,amount);assert.equal(child.recharge_id,original.id);
   assert.equal(ops.evidence_asset_ids.length,1);result[label]={id,status:state,amount_minor:amount,requested_minor:child.requested_minor,object_version:child.object_version,evidence_asset_ids:ops.evidence_asset_ids};
   await get('guardian','/wallet/guardian-recharge-refunds/'+id,'',403);
  }
  const ids=Object.values(result).map(x=>x.id),[jobs]=await db.execute('SELECT id,business_key,status,attempts FROM platform_jobs WHERE business_key IN (?,?,?,?)',ids);assert.equal(jobs.length,1);assert.equal(jobs[0].business_key,result.partial.id);assert.equal(jobs[0].status,'SUCCEEDED');assert.equal(jobs[0].attempts,2);const [retries]=await db.execute('SELECT id FROM platform_job_retries WHERE job_id=?',[jobs[0].id]);assert.equal(retries.length,0);
  assert.deepEqual(status.checks.map(x=>x.methods),[['refund'],['query']]);assert(status.checks.every(x=>x.record_id===result.partial.id));
  const list=await get('guardian','/wallet/guardian-recharge-refunds','RechargeRefundResponse');assert.equal(list.items.length,0);await get('guardian','/wallet/guardian-recharge-refund-options?guardian_link_id='+prep.link.id,'',403);await get('outsider','/wallet/operations/recharge-refunds/'+result.partial.id,'',403);
  const [[other]]=await db.execute('SELECT data_json FROM wallet_records WHERE id=?',[prep.other_recharge_id]);assert.equal(parse(other).amount_minor,50000);assert.equal(parse(other).refunded_minor,0);
  const [[person]]=await db.execute('SELECT age_band FROM artist_people WHERE id=?',[prep.child_person_id]);assert.equal(person.age_band,'MINOR');assert.equal(s.final_balance.available_balance_minor,20000);
  const proof={result:'PASS',source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),database:a.database,synthetic_only:true,real_money:false,read_only_database:true,cases:result,original_recharge_id:original.id,original_minor:30000,refunded_minor:10000,final_balance_minor:20000,guardian_other_charge_minor:50000,guardian_other_refunded_minor:0,age_band:person.age_band,job:jobs[0],manual_retry_rows:retries.length,provider_methods:status.checks.map(x=>x.methods),migrations,session_expires_at:a.session_expires_at,service_expires_at:a.expires_at,recorded_at:new Date().toISOString()};
  await fs.writeFile(path.join(out,'RECONCILIATION.json'),JSON.stringify(proof,null,2));await fs.writeFile(path.join(out,'guardian-live-http.json'),JSON.stringify({synthetic_only:true,cases},null,2));console.log(JSON.stringify({result:proof.result,cases:4,jobs:1,attempts:2,refunded_minor:10000,available_minor:20000,http:cases.length,migrations:225}));
 }finally{await db.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
