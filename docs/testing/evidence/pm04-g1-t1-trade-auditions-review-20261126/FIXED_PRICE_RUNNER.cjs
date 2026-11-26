'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync,spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const root=process.cwd(),backend=path.join(root,'晶晶日上工程交接包/01_源码/backend_server'),out=path.join(root,'.local/qa18/t1-audition-fixed-price-20261126-03');
fs.mkdirSync(out,{recursive:false});
const files=['test/auditions-fixed-price-visibility.integration.test.cjs'];
const configFile=path.resolve(root,'../full-flow/.local/mysql/runtime/test-env.json');
const config=JSON.parse(fs.readFileSync(configFile,'utf8'));
if(config.NODE_ENV!=='test'||config.MYSQL_HOST!=='127.0.0.1'||config.MYSQL_PORT!=='33316'||config.MYSQL_DATABASE!=='jx_dev')throw Error('ISOLATED_CONFIG_REQUIRED');
const hash=p=>createHash('sha256').update(fs.readFileSync(p).toString('utf8').replace(/\r\n/g,'\n')).digest('hex');
const paths=execFileSync('git',['ls-files','-z','--','晶晶日上工程交接包/01_源码/backend_server','contracts','scripts/backend-evidence-reporter.cjs'],{encoding:'utf8',maxBuffer:8*1024*1024}).split('\0').filter(Boolean);
const manifest={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),started_at:new Date().toISOString(),node:process.version,files,sources:paths.map(p=>({path:p,sha256_lf:hash(path.join(root,p))})),environment:'disposable isolated MySQL localhost33316; synthetic data only',command:'node --test --test-concurrency=1 --test-reporter=tap --test-reporter=../../../scripts/backend-evidence-reporter.cjs --test-reporter-destination=stdout --test-reporter-destination=<isolated-output>/checks.jsonl '+files.join(' ')};
const write=(name,data)=>fs.writeFileSync(path.join(out,name),JSON.stringify(data,null,2)+'\n');write('source-manifest.json',manifest);
const env=require(path.join(backend,'scripts/test-environment.cjs')).backendOnlyEnvironment({...process.env,JX_MYSQL_TEST_ENV_FILE:configFile});
env.NODE_OPTIONS=[process.env.NODE_OPTIONS,'--require ./scripts/test-network-guard.cjs'].filter(Boolean).join(' ');
const fd=fs.openSync(path.join(out,'backend.tap'),'wx');let result;
try{result=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap','--test-reporter=../../../scripts/backend-evidence-reporter.cjs','--test-reporter-destination=stdout','--test-reporter-destination='+path.join(out,'checks.jsonl'),...files],{cwd:backend,env,stdio:['ignore',fd,fd],windowsHide:true});}finally{fs.closeSync(fd);}
const checks=fs.readFileSync(path.join(out,'checks.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const changed=manifest.sources.filter(s=>hash(path.join(root,s.path))!==s.sha256_lf).map(s=>s.path),counts=Object.fromEntries(['PASS','FAIL','SKIP','TODO'].map(k=>[k,checks.filter(c=>c.status===k).length]));
fs.mkdirSync(path.join(out,'http-private'));const fixtures=[];
for(const name of ['auditions-fixed-price-visibility-http.json']){
 const p=path.join(root,'.local',name);if(!fs.existsSync(p)||fs.statSync(p).mtimeMs<Date.parse(manifest.started_at)){fixtures.push({name,fresh:false});continue;}
 const bytes=fs.readFileSync(p);fs.writeFileSync(path.join(out,'http-private',name),bytes);fixtures.push({name,fresh:true,sha256:createHash('sha256').update(bytes).digest('hex'),cases:JSON.parse(bytes).cases?.length??null});
}
const summary={source:manifest.source,started_at:manifest.started_at,finished_at:new Date().toISOString(),exit_code:result.status,result:result.status===0&&!changed.length?'PASS':'FAIL',counts,changed_sources:changed,fixtures,product_changed:false,formal_updated:false,limits:['Focused fixed-price and visibility HTTP cases only, not a full backend or final regression.','Existing synthetic adult/manual-review fixture; public archive independently submitted/reviewed; no real payment/provider.','Existing source assertions untouched. New whole-total, forbidden-field, duplicate and same-artist visibility assertions.']};write('summary.json',summary);console.log(JSON.stringify(summary));process.exitCode=result.status===0&&!changed.length?0:1;
