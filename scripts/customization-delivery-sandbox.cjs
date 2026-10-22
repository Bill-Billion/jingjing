'use strict';
// Explicit local-only frontend handoff. No .env, SMS, remote storage or paid provider.
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const backend = path.join(root, '晶晶日上工程交接包/01_源码/backend_server');
require(path.join(backend, 'scripts/test-network-guard.cjs'));
const http = require('node:http');
const mysql = require(path.join(backend, 'node_modules/mysql2/promise'));
const { openDatabase } = require(path.join(backend, 'src/infrastructure/database'));
const { migrate } = require(path.join(backend, 'src/infrastructure/database/migrator'));
const { createPartyRepository } = require(path.join(backend, 'src/modules/party/repository'));
const { createAuthRepository } = require(path.join(backend, 'src/modules/auth/repository'));
const { maintainOperatorGrant } = require(path.join(backend, 'src/modules/governance/operator-access'));
const { createCustomizationRepository } = require(path.join(backend, 'src/modules/customization/repository'));
const { createAccountApi } = require(path.join(backend, 'src/http/account-api'));

async function main() {
  if (process.argv.length !== 2) throw new Error('Usage: node scripts/customization-delivery-sandbox.cjs (Ctrl+C to clean up)');
  if (!process.env.JX_MYSQL_TEST_ENV_FILE) throw new Error('Isolated JX_MYSQL_TEST_ENV_FILE is required');
  const env = JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE, 'utf8'));
  for (const [k, v] of Object.entries({ NODE_ENV:'test', DB_CLIENT:'mysql', MYSQL_HOST:'127.0.0.1', MYSQL_PORT:'33316', MYSQL_USER:'jx_local', MYSQL_DATABASE:'jx_dev' })) {
    if (env[k] !== v) throw new Error('Refusing non-isolated test configuration');
  }
  const name = 'jx_test_delivery_' + process.pid + '_' + randomBytes(6).toString('hex');
  const out = path.join(root, '.local/customization-delivery-sandbox', name);
  let control, created=false, db, server, cleanupPromise, stopRequested=false, starting=true, timer, stopWatcher;
  const checkRunning=()=>{ if(stopRequested) throw Object.assign(new Error('Stopped'),{code:'LOCAL_STOP_REQUESTED'}); };
  function cleanup() {
    if(cleanupPromise) return cleanupPromise;
    cleanupPromise=(async()=>{
      clearTimeout(timer); clearInterval(stopWatcher);
      process.stdin.pause();
      const failures=[];
      const step=async(label,fn)=>{try{await fn();return true;}catch{failures.push(label);return false;}};
      const credentialsRemoved=await step('credentials',()=>fs.unlink(path.join(out,'access.json')).catch(e=>{if(e.code!=='ENOENT')throw e;}));
      if(server) await step('http',async()=>{server.closeAllConnections();await new Promise((resolve,reject)=>server.close(e=>e&&e.code!=='ERR_SERVER_NOT_RUNNING'?reject(e):resolve()));});
      if(db) await step('pool',()=>db.close());
      let databaseRemoved=!created;
      // Only this invocation's successfully created random database can be removed.
      if(created && /^jx_test_delivery_[0-9]+_[a-f0-9]{12}$/.test(name)) databaseRemoved=await step('database',()=>control.query('DROP DATABASE '+mysql.escapeId(name)));
      if(control) await step('control',()=>control.end());
      const result={status:failures.length?'CLEANUP_FAILED':'STOPPED',synthetic_only:true,database_removed:databaseRemoved,credentials_removed:credentialsRemoved,failed_steps:failures};
      await fs.mkdir(out,{recursive:true});
      await fs.writeFile(path.join(out,'status.json'),JSON.stringify(result,null,2));
      if(failures.length) process.exitCode=1;
      return result;
    })();
    return cleanupPromise;
  }
  const stop=()=>{stopRequested=true;if(!starting)cleanup().then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('CLEANUP_FAILED');process.exitCode=1;});};
  stopWatcher=setInterval(()=>fs.access(path.join(out,'stop')).then(stop).catch(e=>{if(e.code!=='ENOENT')stop();}),500);
  stopWatcher.unref();
  process.once('SIGINT',stop);
  process.once('SIGTERM',stop);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data',data=>{if(data.trim()==='quit')stop();});
  process.stdin.unref?.();
  try {
    control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
    checkRunning();
    await control.query('CREATE DATABASE ' + mysql.escapeId(name) + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin'); created = true; checkRunning();
    db = await openDatabase({ ...env, MYSQL_DATABASE:name }); await migrate(db); checkRunning();

    const mediaDir=process.env.DELIVERY_SYNTHETIC_MEDIA_DIR;
    let media;
    if(mediaDir){
      const actual=await fs.realpath(path.resolve(mediaDir)),local=await fs.realpath(path.join(root,'.local')),relative=path.relative(local,actual);
      if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('Synthetic clips must be inside this checkout .local');
      const full=await fs.readFile(path.join(actual,'full.mp4')),preview=await fs.readFile(path.join(actual,'preview.mp4'));
      if([full,preview].some(b=>b.length>1024*1024||b.length<16||b.toString('ascii',4,8)!=='ftyp')||full.equals(preview))throw new Error('Distinct bounded synthetic MP4 clips are required');
      media={full,preview};
    }
    const f=await require(path.join(backend,'test/support/customization-delivery.cjs')).seed(db),people=f.people;
    await f.grant(people.reviewer,'CUSTOMIZATION_INTAKE');
    const repo=require(path.join(backend,'src/modules/production/repository')).createProductionRepository(db,{resolvePrincipal:f.resolvePrincipal});
    const {producer,buyer,reviewer}=people;
    const scenarios={};
    async function get(p){return repo.read(producer.ctx,{record_id:p.id,party_id:producer.acting_party_id});}
    async function review(r){const verification=r.kind==='PROJECT'?{contract_sha256:r.data.contract_sha256,identity_verified:true,signatures_verified:true,rights_verified:true}:r.data.stage==='SCRIPT'?{script_reviewed:true}:{script_reviewed:true,specification_reviewed:true,audio_reviewed:true,branding_reviewed:true,commercial_watermark_verified:true,ai_label_verified:true};return repo.review(reviewer.ctx,{record_id:r.id,expected_version:r.object_version,decision:'APPROVED',reason:'synthetic independent record only',verification,operation_key:randomUUID()});}
    async function make(name,paid=false,roster={uses_identifiable_people:false,cast:[]},options={}){const x=await f.newOrder();let p=await repo.create(producer.ctx,{party_id:producer.acting_party_id,order_id:x.order.id,line_id:'film',script_version_id:f.work.id,license_project_id:null,assignee_account_id:producer.account_id,purpose:'PRIVATE',territory:'CN',consent_ids:roster.cast.map(c=>c.supply_consent_id),evidence_asset_id:f.proof.id,fulfillment:roster,operation_key:randomUUID()});if(options.reviewed!==false)p=await review(p);if(paid)await f.pay(x.order,'first');if(paid&&options.start!==false){await repo.startCustomization(producer.ctx,{party_id:producer.acting_party_id,record_id:p.id,expected_version:p.object_version,operation_key:randomUUID()});}scenarios[name]={project_id:p.id,order_id:x.order.id};return {p,order:x.order};}
    async function file(p,stage,kind){const body=stage!=='SCRIPT'&&media?media[kind.startsWith('full ')?'full':'preview']:Buffer.from('SYNTHETIC '+kind+'; not playable production video'),reserved=await repo.reserveFile(producer.ctx,{party_id:producer.acting_party_id,project_id:p.id,media_type:stage==='SCRIPT'?'text/plain':'video/mp4',body,operation_key:randomUUID()});await f.storageFactory().put({key:reserved.record.data.object_key,body});return repo.finishFile(producer.ctx,{party_id:producer.acting_party_id,record_id:reserved.record.id,success:true});}
    async function deliver(p,stage,accept=false,{approved=true}={}){const full=await file(p,stage,'full '+randomUUID()),preview=stage==='SCRIPT'?full:await file(p,stage,'watermark preview '+randomUUID());const submitted=await repo.submitVersion(producer.ctx,{party_id:producer.acting_party_id,record_id:p.id,expected_version:(await get(p)).object_version,stage,file_id:full.id,preview_file_id:preview.id,note:'synthetic stage',operation_key:randomUUID()});const v=approved?await review(submitted):submitted;if(accept){await repo.observeCustomizationContent(buyer.ctx,{party_id:buyer.acting_party_id,record_id:v.id,variant:'preview'});await repo.feedback(buyer.ctx,{party_id:buyer.acting_party_id,record_id:v.id,expected_version:v.object_version,decision:'ACCEPT',note:'synthetic buyer acceptance',checklist:stage==='SCRIPT'?{script_reviewed:true}:{script_reviewed:true,specification_reviewed:true,audio_reviewed:true,branding_reviewed:true},change_kind:null,operation_key:randomUUID()});}return v;}
    await make('unpaid');checkRunning();
    const started=await make('started',true);await deliver(started.p,'SCRIPT');checkRunning();
    const preview=await make('preview',true);await deliver(preview.p,'SCRIPT',true);const pv=await deliver(preview.p,'SAMPLE');scenarios.preview.version_id=pv.id;checkRunning();
    const complete=await make('final_paid',true);await deliver(complete.p,'SCRIPT',true);await deliver(complete.p,'SAMPLE',true);await f.pay(complete.order,'interim');await deliver(complete.p,'ROUGH_CUT',true);const fv=await deliver(complete.p,'FINAL',true);await f.pay(complete.order,'last');scenarios.final_paid.version_id=fv.id;checkRunning();
    const issue=await make('dispute',true);await repo.openCustomizationCase(buyer.ctx,{party_id:buyer.acting_party_id,record_id:issue.p.id,expected_version:(await get(issue.p)).object_version,kind:'RIGHTS_DISPUTE',reason:'synthetic rights question',evidence_asset_ids:[],operation_key:randomUUID()});checkRunning();
    const cast=await f.actorCast();await make('performer',true,cast.roster);checkRunning();
    await make('ready_to_start',true,undefined,{start:false});
    await make('pending_review',true,undefined,{reviewed:false,start:false});
    const pendingVideo=await make('pending_video',true);await deliver(pendingVideo.p,'SCRIPT',true);const unreviewed=await deliver(pendingVideo.p,'SAMPLE',false,{approved:false});scenarios.pending_video.version_id=unreviewed.id;
    const cancel=await make('cancelled_refund',true);let cancelled=await repo.openCustomizationCase(buyer.ctx,{party_id:buyer.acting_party_id,record_id:cancel.p.id,expected_version:(await get(cancel.p)).object_version,kind:'CANCEL',reason:'synthetic cancellation only',evidence_asset_ids:[],operation_key:randomUUID()});
    await repo.resolveCustomizationCase(reviewer.ctx,{record_id:cancel.p.id,expected_version:cancelled.object_version,case_id:cancelled.cases[0].id,decision:'CANCEL',retained_minor:0,change_order_id:null,reason:'synthetic independent cancellation, no channel refund',operation_key:randomUUID()});
    const unassigned=await f.newOrder();scenarios.unassigned_order={order_id:unassigned.order.id,story_id:unassigned.story.id,spec_id:unassigned.spec.id};
    checkRunning();
    const app=createAccountApi({db,secret:f.secret,supplyStorageFactory:f.storageFactory,tradeEnv:{CUSTOMIZATION_MERCHANT_PARTY_ID:f.org.party_id},allowedOrigins:['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:5000','http://localhost:5000','http://127.0.0.1:5500','http://localhost:5500']});
    const rules=[/^\/api\/v1\/production(?:\/|$)/,/^\/api\/v1\/operations\/(notifications|comments|customization-requests)(?:\/|$)/,/^\/api\/v1\/customization-requests(?:\/|$)/,/^\/api\/v1\/me(?:\/parties)?$/,/^\/api\/v1\/trade\/(records|specifications|quotes|payments|refunds|readiness)(?:\/|$)/,/^\/(health|ready)$/];
    server=http.createServer((req,res)=>{const route=req.url.split('?')[0],readOnly=['GET','OPTIONS'].includes(req.method)&&/^\/api\/v1\/(supply|artists|licensing|account|parties|customization-categories)(?:\/|$)/.test(route),evidenceUpload=req.method==='POST'&&route==='/api/v1/supply/assets';if(readOnly||evidenceUpload||rules.some(r=>r.test(route)))return app(req,res);res.writeHead(403,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:{code:'LOCAL_FIXTURE_ROUTE_DISABLED'}}));});
    server.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});checkRunning();
    const base_url='http://127.0.0.1:'+server.address().port+'/api/v1';await fs.mkdir(out,{recursive:true});
    const accounts=Object.fromEntries(Object.entries(people).map(([role,p])=>[role,{account_id:p.account_id,party_id:p.acting_party_id,bearer_token:p.token}]));
    await fs.writeFile(path.join(out,'access.json'),JSON.stringify({synthetic_only:true,base_url,accounts,scenarios,source_records:{script_version_id:f.work.id,evidence_asset_id:f.proof.id,assignee_account_id:producer.account_id},synthetic_media:media?'PLAYABLE_COLOR_BARS':'NON_PLAYABLE_TEST_BYTES'},null,2),{mode:0o600});
    await fs.writeFile(path.join(out,'status.json'),JSON.stringify({status:'RUNNING',synthetic_only:true,host:'127.0.0.1',port:server.address().port,expires_in_minutes:60,database:name},null,2));
    starting=false;timer=setTimeout(stop,60*60*1000);
    console.log(JSON.stringify({status:'READY',base_url,access_file:path.relative(root,path.join(out,'access.json')),stop_file:path.relative(root,path.join(out,'stop')),synthetic_only:true,scenarios:Object.keys(scenarios),limits:'Only synthetic state/media. Optional color-bar MP4 clips are not real production. Providers remain unconfigured; no real payment/refund/provider calls.'}));
  } catch(e) {
    starting=false;
    const result=await cleanup();
    if(e.code==='LOCAL_STOP_REQUESTED')console.log(JSON.stringify(result));
    else throw e;
  }
}
main().catch(e=>{console.error(e.code||'DELIVERY_SANDBOX_START_FAILED');process.exitCode=1;});
