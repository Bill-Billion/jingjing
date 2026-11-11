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
   if(value.result&&value.result!=='PASS'||value.completed===false||value.passed===false)throw Error('NOT_PASS');
   if(['pm01-stock-native/result.json','afternoon-aftercare-20261104/result.json','team-next-stage-20261104/cocreation-combined/cocreation-result.json'].includes(name)&&value.passed!==true)throw Error('INCOMPLETE_NATIVE_EVIDENCE');
   if(Array.isArray(value.failures)&&value.failures.length)throw Error('FAILED_STEPS');
   if(name.includes('browser/')&&value.completed!==true&&value.passed!==true)throw Error('INCOMPLETE_BROWSER_EVIDENCE');
   if(name.includes('fixtures')&&!name.endsWith('.records.json')&&(!Array.isArray(value.cases)||!value.cases.length))throw Error('EMPTY_FIXTURES');
   const destination=path.join(out,name);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(file,destination);
   evidence.push({path:name,sha256:hash(destination)});
  }catch(e){artifactErrors.push({path:name,error:e.code||e.message});}
 }
 return {artifactErrors,evidence};
}
function main(){
 const args=process.argv.slice(2);
 const profile=args.length===0?'all':args.length===2&&args[0]==='--profile'?args[1]:null;
 const crossSurface=profile==='pm01-cross-surface',withWeb=profile==='pm01-recovery-web'||crossSurface;
 if(!['all','pm01-w10-w15','pm01-recovery-web','pm01-cross-surface'].includes(profile))throw Error('UNKNOWN_ACCEPTANCE_PROFILE');
 const focused=['stock.integration.test.cjs','wallet-refund-entitlement-journey.integration.test.cjs','customization-delivery.integration.test.cjs','auditions.integration.test.cjs','notices-ordinary.integration.test.cjs','cocreation-modern-journey.integration.test.cjs'];
 const fixtureNames=profile==='all'?[]:['stock-http-fixtures.json','wallet-refund-entitlement-fixtures.json','customization-delivery-http-fixtures.json','auditions-http-fixtures.json','notices-ordinary-http-fixtures.json','cocreation-modern-journey-fixtures.json'];
 const artifacts=profile==='all'?[]:['stock-payment-refund-journey-20261110.json','stock-reviewed-refunds-20261111.json','wallet-refund-entitlement-result.json','manual-production-journey-20261110.json','pm01-audition-aftercare-records.json','notices-ordinary-http-fixtures.records.json','cocreation-modern-journey-result.json',...fixtureNames];
 if(withWeb)artifacts.push('pm01-w11-browser/result.json',crossSurface?'pm01-w12-creative-browser/results.json':'pm01-w12-recovery-browser/results.json','pm01-w13-recovery-browser/result.json','pm01-w14-browser/result.json');
 if(crossSurface)artifacts.push('pm01-stock-native/result.json','pm01-stock-native/web/result.json','afternoon-aftercare-20261104/result.json','team-next-stage-20261104/cocreation-combined/cocreation-result.json');
 if(!process.env.JX_MYSQL_TEST_ENV_FILE)throw Error('ISOLATED_MYSQL_CONFIGURATION_REQUIRED');
 const config=JSON.parse(fs.readFileSync(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v]of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))if(config[k]!==v)throw Error('ISOLATED_MYSQL_CONFIGURATION_REQUIRED');
 const runId='backend-acceptance-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex');
 const out=path.join(root,'.local',runId);fs.mkdirSync(out,{recursive:true});
 const files=fs.readdirSync(path.join(backend,'test')).filter(f=>/\.test\.(cjs|mjs|js)$/.test(f)&&(profile==='all'||focused.includes(f))).sort().map(f=>'test/'+f);
 if(!files.length)throw Error('NO_TESTS_FOUND');
 if(profile!=='all'&&files.length!==focused.length)throw Error('PROFILE_TEST_FILE_MISSING');
 const tracked=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z','--','晶晶日上工程交接包/01_源码/backend_server','contracts'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}).split('\0').filter(Boolean);
 if(withWeb)tracked.push(...execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z','--','晶晶日上工程交接包/01_源码/frontend_ops_workspace'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}).split('\0').filter(Boolean));
 if(crossSurface)tracked.push(...execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z','--','晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}).split('\0').filter(Boolean));
 const executable=tracked.filter(f=>f.startsWith('晶晶日上工程交接包/01_源码/backend_server/')||f.startsWith('contracts/')||withWeb&&f.startsWith('晶晶日上工程交接包/01_源码/frontend_ops_workspace/')||crossSurface&&f.startsWith('晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/'));
 if(withWeb){
  executable.push('scripts/pr39-manual-video-browser-check.mjs','scripts/tonight-audition-cancel-browser-check.mjs');
  const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else executable.push(path.relative(root,file).split(path.sep).join('/'));}};
  walk(path.join(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/dist'));
 }
 if(crossSurface)executable.push('scripts/pm01-stock-native-check.mjs','scripts/afternoon-audition-aftercare-native-check.mjs','scripts/team-next-cocreation-combined-check.mjs','scripts/native-test-runtime.cjs','scripts/run-native-test.ps1');
 for(const f of ['scripts/backend-evidence-reporter.cjs','scripts/run-backend-acceptance.cjs'])executable.push(f);
 const sources=[...new Set(executable)].sort().map(f=>({path:f,sha256:hash(path.join(root,f))}));
 const start={run_id:runId,profile,base_commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),started_at:new Date().toISOString(),node:process.version,environment:'isolated',test_files:files,sources};
 const write=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
 write('source-manifest.json',start);console.log('Evidence: '+path.relative(root,out));
 const fd=fs.openSync(path.join(out,'backend.tap'),'w');
 let result;try{
 result=spawnSync(process.execPath,['--test','--test-concurrency=4','--test-reporter=tap','--test-reporter=../../../scripts/backend-evidence-reporter.cjs','--test-reporter-destination=stdout','--test-reporter-destination='+path.join(out,'checks.jsonl'),...files],
 {cwd:backend,env:{...process.env,JX_PM01_NOTICES_WEB:withWeb?'1':'0',JX_PM01_STOCK_WEB:withWeb?'1':'0',NODE_OPTIONS:[process.env.NODE_OPTIONS,'--require ./scripts/test-network-guard.cjs'].filter(Boolean).join(' ')},stdio:['ignore',fd,fd],windowsHide:true});
 }finally{fs.closeSync(fd);}

 const webRuns=[];
 if(withWeb&&result.status===0){
  for(const script of ['scripts/pr39-manual-video-browser-check.mjs','scripts/tonight-audition-cancel-browser-check.mjs',...(crossSurface?['scripts/pm01-stock-native-check.mjs','scripts/afternoon-audition-aftercare-native-check.mjs','scripts/team-next-cocreation-combined-check.mjs']:[])]){
   const log=path.join(out,path.basename(script)+'.log'),handle=fs.openSync(log,'w');
   try{const run=spawnSync(process.execPath,[script],{cwd:root,env:{...process.env,JX_PM01_RECOVERY_TEST:'1',JX_PM01_CREATIVE_TEST:crossSurface?'1':'0',JX_PR39_COUPON_TEST:'0',JX_PR39_COPYRIGHT_MODE:''},stdio:['ignore',handle,handle],windowsHide:true});webRuns.push({script,exit_code:run.status,log:path.basename(log)});}
   finally{fs.closeSync(handle);}
  }
 }
 const checks=fs.existsSync(path.join(out,'checks.jsonl'))?fs.readFileSync(path.join(out,'checks.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)):[];
 const counts=Object.fromEntries(['PASS','FAIL','SKIP','TODO'].map(k=>[k,checks.filter(c=>c.status===k).length]));
 const represented=new Set(checks.map(c=>c.file)),missing=files.filter(f=>!represented.has(f));
 const sourceChanged=sources.filter(s=>!fs.existsSync(path.join(root,s.path))||hash(path.join(root,s.path))!==s.sha256).map(s=>s.path);
 const {artifactErrors,evidence}=collectEvidence(root,out,artifacts,start.started_at);
 if(fixtureNames.length)write('runtime-contract-manifest.json',{version:1,entries:fixtureNames.map(name=>({fixtures:path.relative(root,path.join(out,name)).split(path.sep).join('/'),report:path.relative(root,path.join(root,'.local','ci-evidence',runId,name)).split(path.sep).join('/')}))});
 const codeOk=(!withWeb||webRuns.length===(crossSurface?5:2)&&webRuns.every(r=>r.exit_code===0))&&!artifactErrors.length&&result.status===0&&checks.length>0&&!counts.FAIL&&!counts.TODO&&!missing.length&&!sourceChanged.length;
 const summary={run_id:runId,profile,evidence,artifact_errors:artifactErrors,base_commit:start.base_commit,source_manifest:'source-manifest.json',finished_at:new Date().toISOString(),result:codeOk?(counts.SKIP?'PASS_WITH_SKIP':'PASS'):'FAIL',exit_code:result.status,counts,missing_files:missing,changed_sources:sourceChanged,skipped:checks.filter(c=>c.status==='SKIP'),formal_acceptance_updated:false,frontend_run:withWeb,frontend_scope:crossSurface?'W11 finance/App/Web, W12 creative Web, W13 native aftercare plus HTTP T+1, W14 publisher/artist/support Web, W15 Web/native/API; synthetic and mixed roles':withWeb?'W11 reviewed refund, W12 recovery, W13 cancellation/safety, W14 buyer production; mixed HTTP/helper prerequisites, no native':null,web_runs:webRuns,real_services:false};
 write('summary.json',summary);console.log(JSON.stringify(summary,null,2));process.exitCode=codeOk?0:1;
}
if(require.main===module){try{main();}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={collectEvidence};
