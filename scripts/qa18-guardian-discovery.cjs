'use strict';
// Bounded existing W18 / original minor-protection assertions; never signs off a group.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),backend=path.join(root,'晶晶日上工程交接包/01_源码/backend_server');
const files=['wallet-cross-period','recharge-refunds','recharge-refund-api','recharge-refund-recovery','minor-business-actor','privacy-guardian-copy','contract-six'].map(x=>'test/'+x+'.integration.test.cjs');
const artifacts=['wallet-cross-period-http-fixtures.json','wallet-cross-period-result.json','recharge-refund-http-fixtures.json','recharge-refund-journey.json','recharge-refund-api-http.json','recharge-refund-api-journey.json','recharge-refund-recovery-journey.json','minor-business-actor-http.json','minor-business-actor-records.json','privacy-guardian-copy-20261109/http.json','contract-six-http-fixtures.json'];
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function main(){
 const out=path.resolve(process.argv[2]||'');assert.equal(process.argv.length,3);assert(out.startsWith(path.join(root,'.local/qa18')+path.sep));assert(!fs.existsSync(out));
 const config=JSON.parse(fs.readFileSync(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const[k,v]of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(config[k],v);
 fs.mkdirSync(out,{recursive:true});const write=(p,v)=>fs.writeFileSync(path.join(out,p),JSON.stringify(v,null,2)+'\n');
 const source=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 const paths=execFileSync('git',['ls-files','-z','--','晶晶日上工程交接包/01_源码/backend_server','contracts','scripts/qa18-guardian-discovery.cjs','scripts/backend-evidence-reporter.cjs'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}).split('\0').filter(Boolean);
 const sources=paths.map(p=>({path:p,sha256:hash(path.join(root,p))}));
 // Preserve previous local captures before the existing tests replace their scratch outputs.
 for(const p of artifacts){const old=path.join(root,'.local',p);if(fs.existsSync(old)){const dest=path.join(out,'prior-private',p);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(old,dest);}}
 const args=['--test','--test-concurrency=2','--test-reporter=tap','--test-reporter=../../../scripts/backend-evidence-reporter.cjs','--test-reporter-destination=stdout','--test-reporter-destination='+path.join(out,'checks.jsonl'),...files];
 const started_at=new Date().toISOString();write('source-manifest.json',{source,started_at,node:process.version,test_files:files,sources,command:{executable:process.execPath,args,cwd:path.relative(root,backend)},scope:'Original W18 and minor protection; backend only; not complete E2E or formal acceptance'});
 const env=require(path.join(backend,'scripts/test-environment.cjs')).backendOnlyEnvironment(process.env);env.NODE_OPTIONS=[env.NODE_OPTIONS,'--require ./scripts/test-network-guard.cjs'].filter(Boolean).join(' ');
 const log=fs.openSync(path.join(out,'backend.tap'),'w');let run;try{run=spawnSync(process.execPath,args,{cwd:backend,env,stdio:['ignore',log,log],windowsHide:true});}finally{fs.closeSync(log);}
 const checks=fs.existsSync(path.join(out,'checks.jsonl'))?fs.readFileSync(path.join(out,'checks.jsonl'),'utf8').split('\n').filter(Boolean).map(JSON.parse):[];
 const counts=Object.fromEntries(['PASS','FAIL','SKIP','TODO'].map(k=>[k,checks.filter(c=>c.status===k).length]));
 const changed=sources.filter(s=>!fs.existsSync(path.join(root,s.path))||hash(path.join(root,s.path))!==s.sha256).map(s=>s.path),missing=files.filter(f=>!checks.some(c=>c.file===f));
 const captured=[],absent=[];for(const p of artifacts){const src=path.join(root,'.local',p);if(!fs.existsSync(src)||fs.statSync(src).mtimeMs<Date.parse(started_at)){absent.push(p);continue;}const dest=path.join(out,'artifacts',p);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(src,dest);captured.push({path:'artifacts/'+p,sha256:hash(dest)});}
 const status=run.status===0&&checks.length&&!counts.FAIL&&!counts.SKIP&&!counts.TODO&&!changed.length&&!missing.length&&!absent.length?'PASS':'FAIL';
 const summary={status,source,started_at,finished_at:new Date().toISOString(),exit_code:run.status,signal:run.signal,counts,failed:checks.filter(c=>c.status==='FAIL'),changed_sources:changed,missing_results:missing,missing_artifacts:absent,artifacts:captured,frontend_run:false,real_services:false,formal_acceptance_updated:false};write('summary.json',summary);console.log(JSON.stringify(summary));process.exitCode=status==='PASS'?0:1;
}
try{main();}catch(e){console.error(e.stack);process.exitCode=1;}
