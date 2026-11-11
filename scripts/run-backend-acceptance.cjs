'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),backend=path.join(root,'晶晶日上工程交接包/01_源码/backend_server');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file).toString('utf8').replace(/\r\n/g,'\n')).digest('hex');
function collectEvidence(root,out,names,startedAt){
 const artifactErrors=[],evidence=[];
 for(const name of names){
  const file=path.join(root,'.local',name);
  try{
   if(fs.statSync(file).mtimeMs<Date.parse(startedAt))throw Error('STALE');
   const value=JSON.parse(fs.readFileSync(file,'utf8'));
   if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_EVIDENCE');
   if(value.result&&value.result!=='PASS')throw Error('NOT_PASS');
   if(name.includes('fixtures')&&!name.endsWith('.records.json')&&(!Array.isArray(value.cases)||!value.cases.length))throw Error('EMPTY_FIXTURES');
   const destination=path.join(out,name);fs.copyFileSync(file,destination);
   evidence.push({path:name,sha256:hash(destination)});
  }catch(e){artifactErrors.push({path:name,error:e.code||e.message});}
 }
 return {artifactErrors,evidence};
}
function main(){
 const args=process.argv.slice(2);
 const profile=args.length===0?'all':args.length===2&&args[0]==='--profile'?args[1]:null;
 if(!['all','pm01-w10-w15'].includes(profile))throw Error('UNKNOWN_ACCEPTANCE_PROFILE');
 const focused=['stock.integration.test.cjs','wallet-refund-entitlement-journey.integration.test.cjs','customization-delivery.integration.test.cjs','auditions.integration.test.cjs','notices-ordinary.integration.test.cjs','cocreation-modern-journey.integration.test.cjs'];
 const fixtureNames=profile==='all'?[]:['stock-http-fixtures.json','wallet-refund-entitlement-fixtures.json','customization-delivery-http-fixtures.json','auditions-http-fixtures.json','notices-ordinary-http-fixtures.json','cocreation-modern-journey-fixtures.json'];
 const artifacts=profile==='all'?[]:['stock-payment-refund-journey-20261110.json','wallet-refund-entitlement-result.json','manual-production-journey-20261110.json','pm01-audition-aftercare-records.json','notices-ordinary-http-fixtures.records.json','cocreation-modern-journey-result.json',...fixtureNames];
 if(!process.env.JX_MYSQL_TEST_ENV_FILE)throw Error('ISOLATED_MYSQL_CONFIGURATION_REQUIRED');
 const config=JSON.parse(fs.readFileSync(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v]of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))if(config[k]!==v)throw Error('ISOLATED_MYSQL_CONFIGURATION_REQUIRED');
 const runId='backend-acceptance-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex');
 const out=path.join(root,'.local',runId);fs.mkdirSync(out,{recursive:true});
 const files=fs.readdirSync(path.join(backend,'test')).filter(f=>/\.test\.(cjs|mjs|js)$/.test(f)&&(profile==='all'||focused.includes(f))).sort().map(f=>'test/'+f);
 if(!files.length)throw Error('NO_TESTS_FOUND');
 if(profile!=='all'&&files.length!==focused.length)throw Error('PROFILE_TEST_FILE_MISSING');
 const tracked=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z','--','晶晶日上工程交接包/01_源码/backend_server','contracts'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}).split('\0').filter(Boolean);
 const executable=tracked.filter(f=>f.startsWith('晶晶日上工程交接包/01_源码/backend_server/')||f.startsWith('contracts/'));
 for(const f of ['scripts/backend-evidence-reporter.cjs','scripts/run-backend-acceptance.cjs'])executable.push(f);
 const sources=[...new Set(executable)].sort().map(f=>({path:f,sha256:hash(path.join(root,f))}));
 const start={run_id:runId,profile,base_commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),started_at:new Date().toISOString(),node:process.version,environment:'isolated',test_files:files,sources};
 const write=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
 write('source-manifest.json',start);console.log('Evidence: '+path.relative(root,out));
 const fd=fs.openSync(path.join(out,'backend.tap'),'w');
 let result;try{
 result=spawnSync(process.execPath,['--test','--test-concurrency=4','--test-reporter=tap','--test-reporter=../../../scripts/backend-evidence-reporter.cjs','--test-reporter-destination=stdout','--test-reporter-destination='+path.join(out,'checks.jsonl'),...files],
 {cwd:backend,env:{...process.env,NODE_OPTIONS:[process.env.NODE_OPTIONS,'--require ./scripts/test-network-guard.cjs'].filter(Boolean).join(' ')},stdio:['ignore',fd,fd],windowsHide:true});
 }finally{fs.closeSync(fd);}
 const checks=fs.existsSync(path.join(out,'checks.jsonl'))?fs.readFileSync(path.join(out,'checks.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)):[];
 const counts=Object.fromEntries(['PASS','FAIL','SKIP','TODO'].map(k=>[k,checks.filter(c=>c.status===k).length]));
 const represented=new Set(checks.map(c=>c.file)),missing=files.filter(f=>!represented.has(f));
 const sourceChanged=sources.filter(s=>!fs.existsSync(path.join(root,s.path))||hash(path.join(root,s.path))!==s.sha256).map(s=>s.path);
 const {artifactErrors,evidence}=collectEvidence(root,out,artifacts,start.started_at);
 if(fixtureNames.length)write('runtime-contract-manifest.json',{version:1,entries:fixtureNames.map(name=>({fixtures:path.relative(root,path.join(out,name)).split(path.sep).join('/'),report:path.relative(root,path.join(root,'.local','ci-evidence',runId,name)).split(path.sep).join('/')}))});
 const codeOk=!artifactErrors.length&&result.status===0&&checks.length>0&&!counts.FAIL&&!counts.TODO&&!missing.length&&!sourceChanged.length;
 const summary={run_id:runId,profile,evidence,artifact_errors:artifactErrors,base_commit:start.base_commit,source_manifest:'source-manifest.json',finished_at:new Date().toISOString(),result:codeOk?(counts.SKIP?'PASS_WITH_SKIP':'PASS'):'FAIL',exit_code:result.status,counts,missing_files:missing,changed_sources:sourceChanged,skipped:checks.filter(c=>c.status==='SKIP'),formal_acceptance_updated:false,frontend_run:false,real_services:false};
 write('summary.json',summary);console.log(JSON.stringify(summary,null,2));process.exitCode=codeOk?0:1;
}
if(require.main===module){try{main();}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={collectEvidence};
