'use strict';
// PM03 mode of stock-sandbox: retained, bounded, synthetic loopback integration.
const fs = require('node:fs/promises'), path = require('node:path');
const {randomUUID: key, randomBytes, createHash} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const backend = path.join(root, '晶晶日上工程交接包/01_源码/backend_server');
require(path.join(backend, 'scripts/test-network-guard.cjs'));
const load = rel => require(path.join(backend, rel));
const {protectPrivateState} = require('./private-state.cjs');
const home = path.join(root, '.local/stock-sandbox');
const dbPattern = /^jx_test_stock_pm03_[a-f0-9]{24}$/;
const hours = 8, duration = hours * 3600000;
const origins = ['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:5000','http://localhost:5000'];
const fail = code => {throw Object.assign(Error(code), {code});};
async function sourceDigest() {
  const prefix = '晶晶日上工程交接包/01_源码/backend_server/';
  const tracked = execFileSync('git',['ls-files','-z','--',prefix+'src',prefix+'migrations/mysql-runtime',prefix+'test/helpers',prefix+'test/support',prefix+'scripts/test-network-guard.cjs',prefix+'package.json',prefix+'package-lock.json'],{cwd:root,windowsHide:true}).toString('utf8').split('\0').filter(Boolean);
  const untracked = execFileSync('git',['ls-files','--others','--exclude-standard','-z','--',prefix+'src'],{cwd:root,windowsHide:true}).toString('utf8').split('\0').filter(Boolean);
  const files = [...new Set([...tracked,...untracked,'scripts/stock-sandbox.cjs','scripts/test-fixtures/pm03-stock.cjs','scripts/test-fixtures/pm03-batch.cjs','scripts/test-fixtures/pm03-phone-targets.cjs','scripts/v5-r05-r12-seed.cjs','scripts/test-fixtures/private-state.cjs','contracts/openapi.yaml'])].sort();
  const hash = createHash('sha256');
  for(const file of files) hash.update(file+'\0').update(await fs.readFile(path.join(root,file))).update('\0');
  return hash.digest('hex');
}
async function privateJson(file, value) {
  // Restrict the file before putting secrets in it, including on Windows.
  const handle = await fs.open(file, 'a', 0o600); await handle.close();
  await protectPrivateState(file);
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
}
function storageAt(out) {
  const directory = path.join(out, 'files');
  const filename = k => path.join(directory, createHash('sha256').update(k).digest('hex'));
  return () => ({
    put: async input => {
      await fs.mkdir(directory, {recursive:true});
      await fs.writeFile(filename(input.key), input.body, {mode:0o600});
      return {key:input.key, sha256:createHash('sha256').update(input.body).digest('hex'), size:input.body.length};
    },
    getBuffer: async k => {try {return await fs.readFile(filename(k));} catch(e) {if(e.code !== 'ENOENT') throw e; return undefined;}},
  });
}
async function seed(db, out, deadline, check) {
  const stock = await load('test/helpers/stock-seed.cjs').seedStock(db); check();
  const notices = await load('test/helpers/notices-seed.cjs').seedNotices(db); check();
  const media = path.join(out, 'samples'); await fs.mkdir(media, {recursive:true});
  const ffmpeg = process.env.JX_TEST_FFMPEG || process.env.FFMPEG_PATH || 'ffmpeg';
  const font = process.env.JX_TEST_FONT;
  // Labels are visibly burned into synthetic colour bars, never a person's likeness.
  if(font) await fs.copyFile(font,path.join(media,'font.ttf'));
  const fontOption = font ? 'fontfile=font.ttf:' : '';
  for(const [name,label] of [['full','SYNTHETIC TEST ONLY'],['preview','PREVIEW - SYNTHETIC TEST ONLY']]) {
    const dest = path.join(media, name + '.mp4');
    execFileSync(ffmpeg, ['-nostdin','-hide_banner','-loglevel','error','-f','lavfi','-i','smptebars=size=640x360:rate=15',
      '-vf',`drawtext=${fontOption}text='${label}':fontcolor=white:fontsize=24:box=1:boxcolor=black:x=(w-tw)/2:y=(h-th)/2`,
      '-t','2','-an','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',dest], {cwd:media,windowsHide:true,stdio:'pipe',timeout:30000});
    const body = await fs.readFile(dest);
    if(body.length > 1024*1024 || body.toString('ascii',4,8) !== 'ftyp') fail('BOUNDED_SYNTHETIC_MP4_REQUIRED');
    stock.listingInput[name === 'full' ? 'file_id' : 'preview_file_id'] = (await stock.supply.upload(stock.seller.ctx, {
      party_id:stock.seller.personal_party_id,purpose:'WORK_CONTENT',media_type:'video/mp4',body,operation_key:key(),
    })).id;
  }
  stock.listingInput.description = 'PM03 合成色条样片，仅供隔离联调，无真实销售及真人授权';
  const listing = await stock.listing();
  const pending = await stock.stock.create(stock.seller.ctx, {...stock.listingInput,operation_key:key()});
  // The existing legacy rule remains historical; ordinary publishing explicitly uses the new approved rule.
  let rule = await notices.notices.createRule(notices.outsider.ctx, {rule:{...notices.ruleInput,version:'PM03-20261115',publishing_policy:'VERIFIED_ADULT_20261111'},operation_key:key()});
  rule = await notices.notices.review(notices.reviewer.ctx, {record_id:rule.id,expected_version:rule.object_version,decision:'APPROVE',reason:'PM03 independent synthetic rule review',checks:{business_rule_verified:true},operation_key:key()});
  const publisher = notices.buyer2; // Verified adult with no funded membership.
  const noticeBody = {...notices.body,title:'PM03 合成资料招募',description:'仅供本机联调，不是真实活动'};
  let announcement = await notices.notices.createNotice(publisher.ctx, {party_id:publisher.personal_party_id,rule_id:rule.id,notice:noticeBody,operation_key:key()});
  announcement = await notices.notices.review(notices.reviewer.ctx, {record_id:announcement.id,expected_version:announcement.object_version,decision:'APPROVE',reason:'PM03 independent synthetic notice review',checks:{content_reviewed:true,materials_reviewed:true,no_private_contact:true},operation_key:key()});
  let consent = await notices.artists.declareConsent(notices.seller.ctx, {person_id:notices.seller.person.id,party_id:notices.seller.personal_party_id,avatar_id:notices.avatar.id,
    consent:{features:['FACE'],purposes:['COOPERATION_SUBMISSION','PUBLIC_DISPLAY'],grantee_party_id:publisher.personal_party_id,territories:['WORLDWIDE'],valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',terms:'Synthetic PM03 cooperation only',evidence_asset_ids:[notices.evidence.id]},operation_key:key()});
  consent = await notices.artists.review(notices.reviewer.ctx, {person_id:notices.seller.person.id,record_id:consent.id,expected_version:consent.object_version,decision:'APPROVE',reason:'PM03 independent synthetic consent review',operation_key:key()});
  const submission = {...notices.submission,notice_id:announcement.id,target_party_id:publisher.personal_party_id,consent_id:consent.id};
  const people = {stock_seller:stock.seller,stock_buyer:stock.buyer,stock_reviewer:stock.reviewer,stock_publication_editor:stock.buyer2,
    notice_publisher:publisher,notice_artist:notices.seller,notice_reviewer:notices.reviewer,notice_rule_editor:notices.outsider,unverified:stock.outsider};
  const grants = {stock_reviewer:['SUPPLY_REVIEW_RIGHTS','SUPPLY_REVIEW_CONTENT','TRADE_REVIEW','TRADE_REFUND'],stock_publication_editor:['SUPPLY_REVIEW_RIGHTS'],
    notice_reviewer:['NOTICE_REVIEW','NOTICE_SUPPORT','ARTIST_REVIEW_RIGHTS'],notice_rule_editor:['NOTICE_REVIEW']};
  const auth = load('src/modules/auth/repository').createAuthRepository(db, {secret:stock.secret});
  const accounts = {};
  for(const [index,[role,u]] of Object.entries(people).entries()) {
    const actions = grants[role] || [];
    const [existing] = await db.execute('SELECT action_code,object_version FROM governance_operator_grants WHERE account_id=?',[u.account_id]);
    const all = new Set([...existing.map(r=>r.action_code), ...actions]);
    for(const action of all) await load('src/modules/governance/operator-access').maintainOperatorGrant(db, {
      account_id:u.account_id,action,enabled:actions.includes(action),expected_version:existing.find(r=>r.action_code===action)?.object_version || 0,
      expires_at:deadline,authority_ref:'synthetic:pm03-local',reason:'PM03 bounded role; no production authority',
    });
    const phone = '1990000' + String(index).padStart(4,'0');
    await db.execute('INSERT INTO auth_subjects(phone_hash,account_id) VALUES (?,?)',[auth.secure.digest('phone',phone),u.account_id]);
    // No seed bearer is handed out. Everyone enters through the actual SMS/session endpoints.
    await db.execute('UPDATE auth_sessions SET revoked=TRUE WHERE account_id=?',[u.account_id]);
    accounts[role] = {account_id:u.account_id,party_id:u.personal_party_id,phone,operator_actions:actions};
  }
  const storage = storageAt(out)();
  for(const source of [stock.bytes,notices.bytes]) for(const [k,body] of source) await storage.put({key:k,body});
  check();
  const {party_id:unusedParty,...stockListing} = stock.listingInput;
  return {secret:stock.secret,merchant_party_id:stock.seller.personal_party_id,accounts,
    scenarios:{stock:{listing_id:listing.id,pending_listing_id:pending.id},notices:{rule_id:rule.id,notice_id:announcement.id}},
    requests:{stock_listing:stockListing,notice:{rule_id:rule.id,notice:noticeBody},submission:{rule_id:rule.id,submission}},
  };
}
async function run() {
  const [command, argument] = process.argv.slice(2);
  if(!['--pm03','--pm03-batch','--pm03-resume'].includes(command) || (command === '--pm03-resume' ? process.argv.length !== 4 : process.argv.length !== 3)) fail('USAGE_STOCK_SANDBOX_PM03_OR_BATCH_OR_PM03_RESUME_DIRECTORY');
  if(!process.env.JX_MYSQL_TEST_ENV_FILE) fail('ISOLATED_TEST_ENV_REQUIRED');
  const env = JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
  for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'})) if(env[k] !== v) fail('ISOLATED_TEST_ENV_REQUIRED');
  const name = argument ? path.basename(path.resolve(argument)) : 'jx_test_stock_pm03_' + randomBytes(12).toString('hex');
  const out = path.join(home,name);
  if(!dbPattern.test(name) || (argument && path.resolve(argument) !== out)) fail('OWN_PM03_DIRECTORY_REQUIRED');
  await fs.mkdir(out,{recursive:true});
  if(await fs.realpath(out) !== out) fail('PM03_DIRECTORY_REDIRECTION_FORBIDDEN');
  const revision = execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim();
  const source_sha256 = await sourceDigest();
  const mysql = load('node_modules/mysql2/promise');
  let control, db, server, lock, timer, watcher, state, stopped = false, closing;
  const check = () => {if(stopped) fail('LOCAL_STOP_REQUESTED');};
  async function stop() {
    stopped = true;
    if(closing) return closing;
    closing = (async()=>{
      clearTimeout(timer); clearInterval(watcher); process.stdin.pause();
      if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
      if(db) await db.close();
      if(lock && control) await control.query('SELECT RELEASE_LOCK(?)',[name]);
      if(control) await control.end();
      // Deliberately retain this environment's DB/files for same-record review and resume.
      await fs.writeFile(path.join(out,'status.json'),JSON.stringify({status:'STOPPED',synthetic_only:true,database:name,data_retained:true,expires_at:state?.expires_at || null},null,2));
    })(); return closing;
  }
  try {
    control = await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
    const [[result]] = await control.query('SELECT GET_LOCK(?,0) AS acquired',[name]);
    if(Number(result.acquired) !== 1) fail('PM03_ENVIRONMENT_ALREADY_RUNNING');
    lock = true;
    if(argument) {
      state = JSON.parse(await fs.readFile(path.join(out,'state.json'),'utf8'));
      if(state.database !== name || state.schema !== 1 || state.revision !== revision || state.source_sha256 !== source_sha256) fail('PM03_SAME_CANDIDATE_REQUIRED');
      if(!Number.isFinite(Date.parse(state.expires_at)) || Date.parse(state.expires_at) <= Date.now()) fail('PM03_ENVIRONMENT_EXPIRED_CREATE_NEW');
    } else {
      // Never drop or reuse an existing database. Only create this random namespace.
      await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
    }
    db = await load('src/infrastructure/database').openDatabase({...env,MYSQL_DATABASE:name});
    if(!argument) {
      await load('src/infrastructure/database/migrator').migrate(db);
      const expires_at = new Date(Date.now()+duration).toISOString();
      const batch=command==='--pm03-batch';
      state = {schema:1,database:name,revision,source_sha256,expires_at,synthetic_only:true,mode:batch?'BATCH':'STOCK_NOTICE',
        ...await (batch?require('./pm03-batch.cjs').seed(db,out,expires_at,check,storageAt):seed(db,out,expires_at,check))};
      await privateJson(path.join(out,'state.json'),state);
    }
    const sms = {call:async(operation,input,context)=>{
      if(operation !== 'send' || !require('./pm03-phone-targets.cjs').allowed(state,input.phone)) fail('PM03_UNKNOWN_SYNTHETIC_PHONE');
      const dest = path.join(out,'sms'); await fs.mkdir(dest,{recursive:true});
      await privateJson(path.join(dest,context.request_id+'.json'),{synthetic_only:true,challenge_id:context.request_id,...input});
      return {accepted:true};
    }};
    const auth = load('src/modules/auth/repository').createAuthRepository(db,{secret:state.secret});
    const principal = async req => {
      const a = await auth.resolve((req.headers.authorization || '').replace(/^Bearer /,''));
      return {subject_ref:a.subject_ref};
    };
    const simEnv={...env,MYSQL_DATABASE:name,JX_PAYMENT_SIMULATOR_ENABLED:'true'};
    const sim = state.mode==='BATCH'
      ? await load('src/testing/multi-merchant-payment-simulator').createMultiMerchantSimulator(db,simEnv,{merchant_party_ids:[state.merchant_party_id,state.customization_merchant_party_id,...Object.values(state.accounts).map(a=>a.party_id)],resolvePrincipal:principal})
      : await load('src/testing/payment-simulator').createPaymentSimulator(db,simEnv,{merchant_party_id:state.merchant_party_id,resolvePrincipal:principal});
    // One local batch contains 45 independent accounts. Keep bounded limits,
    // sufficient for their first login; this never changes production defaults.
    const authSettings={sessionMs:duration,...state.mode==='BATCH'?{ipSendsPerHour:100,totalSendsPerHour:200,ipLoginsPerMinute:100}:{}};
    const app = load('src/http/account-api').createAccountApi({db,secret:state.secret,sms,authSettings,supplyStorageFactory:storageAt(out),tradeProvidersFactory:()=>sim,
      supplyEnv:state.mode==='BATCH'?{
        NODE_ENV:'test',
        INVOICE_SANDBOX_ENABLED:'true',
        MARKETPLACE_CONTRACT_POLICY:'CONTRACT_20261029',
        ARTIST_CONTRACT_POLICY:'CONTRACT_20261029',
        ARTIST_PLATFORM_MERCHANT_PARTY_ID:state.customization_merchant_party_id,
      }:undefined,tradeEnv:state.customization_merchant_party_id?{CUSTOMIZATION_MERCHANT_PARTY_ID:state.customization_merchant_party_id,MARKETPLACE_CONTRACT_POLICY:'CONTRACT_20261029'}:undefined,allowedOrigins:origins});
    const allowed = /^\/api\/v1\/(auth|me|parties|stock|trade|notices|artists|supply|operations)(\/|$)/;
    server = require('node:http').createServer(async(req,res)=>{
      const error = (status,code) => {res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:{code}}));};
      if(Date.now() >= Date.parse(state.expires_at)) return error(410,'PM03_ENVIRONMENT_EXPIRED');
      res.setHeader('X-Simulated-Payments','true');
      const url = req.url.split('?')[0];
      if(url === '/api/v1/testing/payments/outcome') {
        try {
          const origin = req.headers.origin;
          if(origin && !origins.includes(origin)) return error(403,'ORIGIN_FORBIDDEN');
          if(origin) res.setHeader('Access-Control-Allow-Origin',origin);
          res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, X-Acting-Party');
          res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
          if(req.method === 'OPTIONS'){res.writeHead(204);return res.end();}
          if(req.method !== 'POST') return error(405,'METHOD_NOT_ALLOWED');
          await principal(req);
          let body = ''; for await(const chunk of req){body += chunk;if(Buffer.byteLength(body)>8192) return error(413,'BODY_TOO_LARGE');}
          const input = JSON.parse(body);load('src/modules/party/policy').shape(input,['record_id','state']);
          const data = await sim.choose(req,{...input,party_id:req.headers['x-acting-party']});
          res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({simulation:true,real_money:false,data}));
        } catch(e){error(e.status || 400,e.code || 'INVALID_TEST_REQUEST');}
        return;
      }
      if(allowed.test(url) || (state.mode==='BATCH' && /^\/api\/v1\/(?!testing(?:\/|$))/.test(url)) || /^\/(health|ready)$/.test(url)) return app(req,res);
      return error(403,'LOCAL_FIXTURE_ROUTE_DISABLED');
    });
    server.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
    const migrationStatus=await load('src/infrastructure/database/migrator').status(db);
    if(migrationStatus.migrations.some(m=>m.status!=='APPLIED'))fail('PM03_MIGRATIONS_INCOMPLETE');
    const contractVersion=(await fs.readFile(path.join(root,'contracts/openapi.yaml'),'utf8')).match(/^  version: (.+)$/m)[1];
    const access = {synthetic_only:true,payment_simulation:true,base_url:'http://127.0.0.1:'+server.address().port+'/api/v1',expires_at:state.expires_at,revision,source_sha256,
      versions:{contract:contractVersion,migration:migrationStatus.migrations.at(-1).version,applied_migrations:migrationStatus.migrations.length,frontend_reference:'1d9c0fc4938f71a89ba6ab3f7bca453f47872ac0'},
      mode:state.mode||'STOCK_NOTICE',accounts:state.accounts,scenarios:state.scenarios,requests:state.requests,coverage:state.coverage||null};
    await privateJson(path.join(out,'access.json'),access);
    await fs.rm(path.join(out,'stop'),{force:true});
    await fs.writeFile(path.join(out,'status.json'),JSON.stringify({status:'RUNNING',synthetic_only:true,base_url:access.base_url,expires_at:state.expires_at,database:name,data_retained:true},null,2));
    const requestStop = () => stop().then(()=>console.log(JSON.stringify({status:'STOPPED',data_retained:true}))).catch(()=>{console.error('PM03_STOP_FAILED');process.exitCode=1;});
    process.once('SIGINT',requestStop);process.once('SIGTERM',requestStop);
    process.stdin.setEncoding('utf8');process.stdin.on('data',s=>{if(s.trim()==='quit')requestStop();});process.stdin.unref?.();
    watcher = setInterval(()=>fs.access(path.join(out,'stop')).then(requestStop).catch(e=>{if(e.code !== 'ENOENT')requestStop();}),1000);
    timer = setTimeout(requestStop,Math.max(1,Date.parse(state.expires_at)-Date.now()));
    console.log(JSON.stringify({status:'READY',synthetic_only:true,base_url:access.base_url,expires_at:state.expires_at,access_file:path.relative(root,path.join(out,'access.json')),data_retained:true}));
  } catch(e) {
    // A second launcher must not overwrite the running environment's status.
    if(lock) await stop(); else if(control) await control.end();
    throw e;
  }
}
module.exports = {run};
