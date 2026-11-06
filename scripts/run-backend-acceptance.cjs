'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),backend=path.join(root,'晶晶日上工程交接包/01_源码/backend_server');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file).toString('utf8').replace(/\r\n/g,'\n')).digest('hex');
function main(){
 if(process.argv.length!==2)throw Error('NO_ARGUMENTS_EXPECTED');
 if(!process.env.JX_MYSQL_TEST_ENV_FILE)throw Error('ISOLATED_MYSQL_CONFIGURATION_REQUIRED');
 const config=JSON.parse(fs.readFileSync(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v]of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))if(config[k]!==v)throw Error('ISOLATED_MYSQL_CONFIGURATION_REQUIRED');
 const runId='backend-acceptance-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex');
 const out=path.join(root,'.local',runId);fs.mkdirSync(out,{recursive:true});
 const files=fs.readdirSync(path.join(backend,'test')).filter(f=>/\.test\.(cjs|mjs|js)$/.test(f)).sort().map(f=>'test/'+f);
 if(!files.length)throw Error('NO_TESTS_FOUND');
 const tracked=execFileSync('git',['ls-files','-z','--','晶晶日上工程交接包/01_源码/backend_server','contracts'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}).split('\0').filter(Boolean);
 const executable=tracked.filter(f=>f.startsWith('晶晶日上工程交接包/01_源码/backend_server/')||f.startsWith('contracts/'));
 for(const f of ['scripts/backend-evidence-reporter.cjs','scripts/run-backend-acceptance.cjs'])executable.push(f);
 const sources=[...new Set(executable)].sort().map(f=>({path:f,sha256:hash(path.join(root,f))}));
 const start={run_id:runId,base_commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),started_at:new Date().toISOString(),node:process.version,environment:'isolated',test_files:files,sources};
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
 const codeOk=result.status===0&&checks.length>0&&!counts.FAIL&&!counts.TODO&&!missing.length&&!sourceChanged.length;
 const summary={run_id:runId,base_commit:start.base_commit,source_manifest:'source-manifest.json',finished_at:new Date().toISOString(),result:codeOk?(counts.SKIP?'PASS_WITH_SKIP':'PASS'):'FAIL',exit_code:result.status,counts,missing_files:missing,changed_sources:sourceChanged,skipped:checks.filter(c=>c.status==='SKIP'),formal_acceptance_updated:false,frontend_run:false,real_services:false};
 write('summary.json',summary);console.log(JSON.stringify(summary,null,2));process.exitCode=codeOk?0:1;
}
try{main();}catch(e){console.error(e.message);process.exitCode=1;}
