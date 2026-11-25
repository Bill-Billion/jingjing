'use strict';
// Executes existing backend tests for one discovery group. This is NOT the
// supplied qa18_registry.py and never writes the formal acceptance register.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const backend = path.join(root, '晶晶日上工程交接包/01_源码/backend_server');
const groups = {
 G01: ['stock.integration', 'auditions.integration'],
 G02: ['artists.integration', 'artists-contract.integration', 'artists-staff-access.integration', 'engagement.integration', 'mcn-supplier.integration'],
 G03: ['stock.integration', 'stock-commercial.integration'],
 G04: ['privacy-execution.integration', 'privacy-response-delivery.integration'],
 G05: ['stock-media.integration', 'artists.integration'],
 G06: ['directory.integration'],
 G07: ['discovery.integration', 'catalog-city'],
 G08: ['collections.integration', 'collections-default-retention.integration'],
 // The package filename is a search hint; notice/counter-notice assertions live here.
 G09: ['support.integration', 'contract-six.integration'],
 G10: ['notifications.integration'],
 G11: ['personal-center.integration', 'finance'],
 G12: ['invoices.integration'],
 G13: ['phone-change.integration'],
 G14: ['wallet.integration', 'wallet-totals'],
 G15: ['customization.integration', 'cocreation.integration'],
 G16: ['providers', 'trade-providers', 'test-isolation'],
 G17: ['stock.integration', 'customization-delivery.integration', 'auditions.integration',
  'notices.integration', 'cocreation-modern-journey.integration', 'redemption-checkout.integration',
  'redemption-lottery.integration', 'wallet-cross-period.integration', 'championship-contract.integration',
  'mcn-stock-orders.integration', 'privacy-copy.integration', 'participation-amendment.integration'],
};
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function main() {
 const [group, runId] = process.argv.slice(2);
 if (process.argv.length !== 4 || !groups[group] || !/^pm04-g1-discovery-[a-z0-9-]+$/.test(runId || '')) throw Error('Use: node scripts/qa18-backend-discovery.cjs G01 pm04-g1-discovery-<id>');
 const config = JSON.parse(fs.readFileSync(process.env.JX_MYSQL_TEST_ENV_FILE, 'utf8'));
 for (const [k,v] of Object.entries({NODE_ENV:'test', DB_CLIENT:'mysql', MYSQL_HOST:'127.0.0.1', MYSQL_PORT:'33316', MYSQL_USER:'jx_local', MYSQL_DATABASE:'jx_dev'})) if(config[k] !== v) throw Error('ISOLATED_MYSQL_REQUIRED');
 const out = path.join(root, '.local/qa18', runId, group);
 if(fs.existsSync(out)) throw Error('EVIDENCE_DIRECTORY_ALREADY_EXISTS');
 fs.mkdirSync(out, {recursive:true});
 const write = (name, value) => fs.writeFileSync(path.join(out,name), JSON.stringify(value,null,2)+'\n');
 const files = groups[group].map(n=>'test/'+n+'.test.cjs');
 const missing = files.filter(f=>!fs.existsSync(path.join(backend,f)));
 if(missing.length) { write('summary.json',{group,status:'BLOCKED',missing_files:missing,formal_acceptance_updated:false}); process.exitCode=2; return; }
 const tracked=execFileSync('git',['ls-files','-z','--','晶晶日上工程交接包/01_源码/backend_server','contracts'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}).split('\0').filter(Boolean);
 const sources=[...tracked,'scripts/backend-evidence-reporter.cjs','scripts/qa18-backend-discovery.cjs'].sort().map(f=>({path:f,sha256:hash(path.join(root,f))}));
 const args=['--test','--test-concurrency=2','--test-reporter=tap','--test-reporter=../../../scripts/backend-evidence-reporter.cjs','--test-reporter-destination=stdout','--test-reporter-destination='+path.join(out,'checks.jsonl'),...files];
 const startedAt=new Date().toISOString();
 const manifest={group,run_id:runId,source_commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),started_at:startedAt,node:process.version,environment:'isolated MySQL; each integration test creates its own random test database and loopback server',test_files:files,command:{executable:'node',args,cwd:path.relative(root,backend)},sources};
 write('source-manifest.json',manifest);
 console.log(JSON.stringify({group,event:'STARTED',started_at:startedAt,files,evidence:path.relative(root,out)}));
 const env=require(path.join(backend,'scripts/test-environment.cjs')).backendOnlyEnvironment(process.env);
 env.NODE_OPTIONS=[env.NODE_OPTIONS,'--require ./scripts/test-network-guard.cjs'].filter(Boolean).join(' ');
 const log=fs.openSync(path.join(out,'backend.tap'),'w');
 let result;
 try { result=spawnSync(process.execPath,args,{cwd:backend,env,stdio:['ignore',log,log],windowsHide:true}); }
 finally { fs.closeSync(log); }
 const checks=fs.existsSync(path.join(out,'checks.jsonl'))?fs.readFileSync(path.join(out,'checks.jsonl'),'utf8').split('\n').filter(Boolean).map(s=>JSON.parse(s)):[];
 const counts=Object.fromEntries(['PASS','FAIL','SKIP','TODO'].map(s=>[s,checks.filter(c=>c.status===s).length]));
 const changed=sources.filter(s=>!fs.existsSync(path.join(root,s.path))||hash(path.join(root,s.path))!==s.sha256).map(s=>s.path);
 const missingResults=files.filter(f=>!checks.some(c=>c.file===f));
 // Keep fresh HTTP/record evidence privately; never publish response bodies blindly.
 const artifacts=[];
 const local=path.join(root,'.local');
 for(const entry of fs.readdirSync(local,{withFileTypes:true})) {
  if(!entry.isFile()||!entry.name.endsWith('.json')) continue;
  const source=path.join(local,entry.name);
  if(fs.statSync(source).mtimeMs<Date.parse(startedAt)) continue;
  const dest=path.join(out,'artifacts',entry.name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(source,dest);
  artifacts.push({path:'artifacts/'+entry.name,sha256:hash(dest)});
 }
 const status=result.status===0&&checks.length&&!counts.FAIL&&!counts.TODO&&!missingResults.length&&!changed.length?(counts.SKIP?'PASS_WITH_SKIP':'PASS'):'FAIL';
 const summary={group,run_id:runId,source_commit:manifest.source_commit,started_at:startedAt,finished_at:new Date().toISOString(),status,exit_code:result.status,signal:result.signal,counts,failed:checks.filter(c=>c.status==='FAIL'),skipped:checks.filter(c=>c.status==='SKIP'),missing_results:missingResults,changed_sources:changed,artifacts,formal_acceptance_updated:false,frontend_run:false,real_services:false,scope:'Existing backend assertions only. Not a whole-group acceptance or cross-surface E2E PASS.'};
 write('summary.json',summary);console.log(JSON.stringify(summary,null,2));process.exitCode=status==='FAIL'?1:0;
}
if(require.main===module)try{main();}catch(e){console.error(e.code||e.message);process.exitCode=1;}
