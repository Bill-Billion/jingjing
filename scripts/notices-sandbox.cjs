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
const { createAccountApi } = require(path.join(backend, 'src/http/account-api'));

async function main() {
  if (process.argv.length !== 2) throw new Error('Usage: node scripts/notices-sandbox.cjs (Ctrl+C to clean up)');
  if (!process.env.JX_MYSQL_TEST_ENV_FILE) throw new Error('Isolated JX_MYSQL_TEST_ENV_FILE is required');
  const env = JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE, 'utf8'));
  for (const [k, v] of Object.entries({ NODE_ENV:'test', DB_CLIENT:'mysql', MYSQL_HOST:'127.0.0.1', MYSQL_PORT:'33316', MYSQL_USER:'jx_local', MYSQL_DATABASE:'jx_dev' })) {
    if (env[k] !== v) throw new Error('Refusing non-isolated test configuration');
  }
  const name = 'jx_test_notices_' + process.pid + '_' + randomBytes(6).toString('hex');
  const out = path.join(root, '.local/notices-sandbox', name);
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
      if(created && /^jx_test_notices_[0-9]+_[a-f0-9]{12}$/.test(name)) databaseRemoved=await step('database',()=>control.query('DROP DATABASE '+mysql.escapeId(name)));
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

    const S=await require(path.join(backend,'test/helpers/notices-seed.cjs')).seedNotices(db),{seller,buyer,reviewer}=S;
    const people={seller,buyer,reviewer,outsider:S.outsider},scenarios={};

    const N=S.notices,review=r=>N.review(reviewer.ctx,{record_id:r.id,expected_version:r.object_version,decision:'APPROVE',reason:'synthetic review',checks:{content_reviewed:true,materials_reviewed:true,no_private_contact:true},operation_key:randomUUID()});
    const notice=await review(await N.createNotice(buyer.ctx,{party_id:buyer.personal_party_id,rule_id:S.rule.id,notice:S.body,operation_key:randomUUID()}));
    scenarios.published={notice_id:notice.id};
    async function make(name,decision=null){let r=await N.submit(seller.ctx,{party_id:seller.personal_party_id,rule_id:S.rule.id,submission:{...S.submission,notice_id:notice.id},operation_key:randomUUID()});if(name!=='pending_review')r=await review(r);if(decision)r=await N.decision(buyer.ctx,{party_id:buyer.personal_party_id,record_id:r.id,expected_version:r.object_version,decision,operation_key:randomUUID()});scenarios[name]={submission_id:r.id,case_id:r.data.case_id};checkRunning();return r;}
    await make('pending_review');await make('sent');await make('declined','DECLINE');await make('interested','INTERESTED');
    let r=await make('withdrawn');await N.close(seller.ctx,{party_id:seller.personal_party_id,record_id:r.id,expected_version:r.object_version,reason:'synthetic withdrawal',operation_key:randomUUID()});
    r=await make('expired');const data={...r.data,expires_at:'2020-01-01T00:00:00.000Z'};await db.execute('UPDATE notice_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(data),require(path.join(backend,'src/modules/governance/content')).digest(data),r.id]);
    r=await make('quoted','INTERESTED');const c=await N.read(reviewer.ctx,{record_id:r.data.case_id}),{quote}=await S.commercialQuote();await N.linkQuote(reviewer.ctx,{record_id:c.id,expected_version:c.object_version,quote_id:quote.id,quote_sha256:quote.content_sha256,reason:'synthetic same-party quote',operation_key:randomUUID()});scenarios.quoted.quote_id=quote.id;
    const app=createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory,allowedOrigins:['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:5000','http://localhost:5000']});
    const rules=[/^\/api\/v1\/notices(?:\/|$)/,/^\/api\/v1\/operations\/(notifications|comments)(?:\/|$)/,/^\/api\/v1\/me(?:\/parties)?$/,/^\/api\/v1\/trade\/records(?:\/|$)/,/^\/api\/v1\/parties\/[0-9a-f-]{36}$/,/^\/(health|ready)$/];
    server=http.createServer((req,res)=>{if(rules.some(r=>r.test(req.url.split('?')[0])))return app(req,res);res.writeHead(403,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:{code:'LOCAL_FIXTURE_ROUTE_DISABLED'}}));});
    server.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});checkRunning();
    const base_url='http://127.0.0.1:'+server.address().port+'/api/v1';await fs.mkdir(out,{recursive:true});
    const accounts=Object.fromEntries(Object.entries(people).map(([role,p])=>[role,{account_id:p.account_id,party_id:p.personal_party_id,bearer_token:p.token}]));
    await fs.writeFile(path.join(out,'access.json'),JSON.stringify({synthetic_only:true,base_url,accounts,scenarios},null,2),{mode:0o600});
    await fs.writeFile(path.join(out,'status.json'),JSON.stringify({status:'RUNNING',synthetic_only:true,host:'127.0.0.1',port:server.address().port,expires_in_minutes:60,database:name},null,2));
    starting=false;timer=setTimeout(stop,60*60*1000);
    console.log(JSON.stringify({status:'READY',base_url,access_file:path.relative(root,path.join(out,'access.json')),stop_file:path.relative(root,path.join(out,'stop')),synthetic_only:true,scenarios:Object.keys(scenarios),limits:'Synthetic notices, one-way submissions and service cases only. No SMS, payments or production services.'}));
  } catch(e) {
    starting=false;
    const result=await cleanup();
    if(e.code==='LOCAL_STOP_REQUESTED')console.log(JSON.stringify(result));
    else throw e;
  }
}
main().catch(e=>{console.error(e.code||'NOTICES_SANDBOX_START_FAILED');process.exitCode=1;});
