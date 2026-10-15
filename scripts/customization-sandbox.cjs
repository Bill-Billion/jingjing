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
  if (process.argv.length !== 2) throw new Error('Usage: node scripts/customization-sandbox.cjs (Ctrl+C to clean up)');
  if (!process.env.JX_MYSQL_TEST_ENV_FILE) throw new Error('Isolated JX_MYSQL_TEST_ENV_FILE is required');
  const env = JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE, 'utf8'));
  for (const [k, v] of Object.entries({ NODE_ENV:'test', DB_CLIENT:'mysql', MYSQL_HOST:'127.0.0.1', MYSQL_PORT:'33316', MYSQL_USER:'jx_local', MYSQL_DATABASE:'jx_dev' })) {
    if (env[k] !== v) throw new Error('Refusing non-isolated test configuration');
  }
  const name = 'jx_test_story_' + process.pid + '_' + randomBytes(6).toString('hex');
  const out = path.join(root, '.local/customization-sandbox', name);
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
      if(created && /^jx_test_story_[0-9]+_[a-f0-9]{12}$/.test(name)) databaseRemoved=await step('database',()=>control.query('DROP DATABASE '+mysql.escapeId(name)));
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
    const principals = new Map(), resolvePrincipal = async ctx => principals.get(ctx) || null;
    const party = createPartyRepository(db, { resolvePrincipal });
    const secret = randomBytes(32).toString('base64');
    const auth = createAuthRepository(db, { secret });
    const repo = createCustomizationRepository(db, { resolvePrincipal });
    const people = {};
    for (const [role, label] of Object.entries({ buyer:'合成客户甲', outsider:'合成客户乙', operator:'合成收件员', publisher:'合成模板维护员' })) {
      const ctx = {}; principals.set(ctx, { subject_ref:'synthetic:story:' + randomUUID(), request_id:randomUUID() });
      const record = await party.registerAccount(ctx, { display_name:label });
      const token = randomBytes(32).toString('base64url');
      await db.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms) VALUES (?,?,ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+7200000)', [auth.secure.digest('token', token), record.account_id]);
      people[role] = { ctx, ...record, token }; checkRunning();
    }
    for (const [role, action] of [['operator','CUSTOMIZATION_INTAKE'],['publisher','CUSTOMIZATION_TEMPLATE_PUBLISH']]) {
      await maintainOperatorGrant(db, { account_id:people[role].account_id, action, enabled:true, expires_at:null, expected_version:0, authority_ref:'synthetic:story-handoff', reason:'仅本机合成联调，非正式运营授权' });
    }
    const family = await repo.publishTemplate(people.publisher.ctx, { category_code:'synthetic_family', template_version:1, source_ref:'synthetic:story-handoff-only', operation_key:randomUUID(), template_snapshot:{ title:'测试用家庭故事', description:'纯合成联调模板，不是已批准商品规格；不填真实身份或材料。', fields:[{ key:'story', label:'想记录的故事', type:'TEXT', required:true, max_length:4000 }, { key:'tone', label:'表达方式', type:'CHOICE', required:true, options:['温暖','轻松'] }] } });
    const life = await repo.publishTemplate(people.publisher.ctx, { category_code:'synthetic_life', template_version:1, source_ref:'synthetic:story-handoff-only', operation_key:randomUUID(), template_snapshot:{ title:'测试用人生片段', description:'纯合成文字表单，无真实价格和自动制作。', fields:[{ key:'moment', label:'希望记录的时刻', type:'TEXT', required:true, max_length:4000 }, { key:'message', label:'想说的话', type:'TEXT', required:false, max_length:2000 }] } });
    const blocked = await repo.publishTemplate(people.publisher.ctx, { category_code:'synthetic_attachment', template_version:1, source_ref:'synthetic:story-handoff-only', operation_key:randomUUID(), template_snapshot:{ title:'测试用必填附件场景', description:'本轮不可提交，用于验证不能假传材料。', fields:[{ key:'proof', label:'私有材料', type:'PRIVATE_ATTACHMENT', required:true }] } });
    checkRunning();
    const buyer = people.buyer;
    const draft = await repo.create(buyer.ctx, { party_id:buyer.personal_party_id, template_version_id:family.template_version_id, answers:{ story:'还没写完的合成故事' }, operation_key:randomUUID() });
    const prepared = await repo.create(buyer.ctx, { party_id:buyer.personal_party_id, template_version_id:life.template_version_id, answers:{ moment:'虚构的毕业重逢', message:'这里只是合成测试文字' }, operation_key:randomUUID() });
    const submitted = await repo.submit(buyer.ctx, { request_id:prepared.id, party_id:buyer.personal_party_id, expected_version:prepared.object_version, operation_key:randomUUID() });
    const app = createAccountApi({ db, secret, allowedOrigins:['http://localhost:5173','http://127.0.0.1:5173','http://localhost:5000','http://127.0.0.1:5000'] });
    // Restrict this local fixture to this handoff; no login issuance or other business APIs.
    checkRunning();
    const uuid='[a-fA-F0-9-]{36}';
    const rules=[
      ['GET',/^\/(health|ready)$/],
      ['GET',/^\/api\/v1\/(me|me\/parties|customization-categories)$/],
      ['GET',new RegExp('^/api/v1/customization-requests(?:/'+uuid+')?$')],
      ['POST',/^\/api\/v1\/customization-requests$/],
      ['PATCH',new RegExp('^/api/v1/customization-requests/'+uuid+'$')],
      ['POST',new RegExp('^/api/v1/customization-requests/'+uuid+'/submissions$')],
      ['GET',/^\/api\/v1\/operations\/customization-requests$/],
      ['POST',new RegExp('^/api/v1/operations/customization-requests/'+uuid+'/intake$')]
    ];
    server=http.createServer((req,res)=>{
      const pathname=req.url.split('?')[0];
      if(rules.some(([method,re])=>(req.method===method||req.method==='OPTIONS')&&re.test(pathname)))return app(req,res);
      res.writeHead(403,{'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(JSON.stringify({error:{code:'LOCAL_FIXTURE_ROUTE_DISABLED'}}));
    });
    server.listen(0,'127.0.0.1');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base_url = 'http://127.0.0.1:' + server.address().port + '/api/v1';
    await fs.mkdir(out, { recursive:true });
    const accounts = Object.fromEntries(Object.entries(people).map(([role, p]) => [role, { account_id:p.account_id, party_id:p.personal_party_id, bearer_token:p.token }]));
    await fs.writeFile(path.join(out, 'access.json'), JSON.stringify({ synthetic_only:true, base_url, accounts, templates:{ family:family.template_version_id, life:life.template_version_id, blocked:blocked.template_version_id }, requests:{ draft:draft.id, submitted:submitted.id } }, null, 2), { mode:0o600 });
    await fs.writeFile(path.join(out, 'status.json'), JSON.stringify({ status:'RUNNING', synthetic_only:true, host:'127.0.0.1', port:server.address().port, expires_in_minutes:60, database:name }, null, 2));
    checkRunning();
    starting=false;
    timer=setTimeout(stop,60*60*1000);
    // Do not print even synthetic session tokens in logs or include them in Git.
    console.log(JSON.stringify({ status:'READY', base_url, access_file:path.relative(root, path.join(out, 'access.json')), stop_file:path.relative(root,path.join(out,'stop')), scenarios:['不完整草稿','已提交待受理','另一买家无权','必填附件不可提交'], synthetic_only:true }));
  } catch(e) {
    starting=false;
    const result=await cleanup();
    if(e.code==='LOCAL_STOP_REQUESTED')console.log(JSON.stringify(result));
    else throw e;
  }
}
main().catch(e=>{console.error(e.code||'STORY_SANDBOX_START_FAILED');process.exitCode=1;});
