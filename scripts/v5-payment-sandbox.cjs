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
  if (process.argv.length !== 2) throw new Error('Usage: node scripts/v5-payment-sandbox.cjs (Ctrl+C to clean up)');
  if (!process.env.JX_MYSQL_TEST_ENV_FILE) throw new Error('Isolated JX_MYSQL_TEST_ENV_FILE is required');
  const env = JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE, 'utf8'));
  for (const [k, v] of Object.entries({ NODE_ENV:'test', DB_CLIENT:'mysql', MYSQL_HOST:'127.0.0.1', MYSQL_PORT:'33316', MYSQL_USER:'jx_local', MYSQL_DATABASE:'jx_dev' })) {
    if (env[k] !== v) throw new Error('Refusing non-isolated test configuration');
  }
  const name = 'jx_test_v5payment_' + process.pid + '_' + randomBytes(6).toString('hex');
  const out = path.join(root, '.local/v5-payment-sandbox', name);
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
      if(created && /^jx_test_v5payment_[0-9]+_[a-f0-9]{12}$/.test(name)) databaseRemoved=await step('database',()=>control.query('DROP DATABASE '+mysql.escapeId(name)));
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

    const S=await require(path.join(backend,'test/helpers/auditions-seed.cjs')).seedAuditions(db),{seller,buyer,reviewer}=S;
    const people={seller,buyer,reviewer,outsider:S.outsider},scenarios={},N=S.auditions;
    let offer=await N.createOffer(seller.ctx,{party_id:seller.personal_party_id,offer:{...S.offer,mode:'ONLINE_MATERIALS'},operation_key:randomUUID()});
    offer=await N.reviewOffer(reviewer.ctx,{record_id:offer.id,expected_version:offer.object_version,decision:'APPROVE',reason:'synthetic only',operation_key:randomUUID()});
    const read=r=>N.read(buyer.ctx,{record_id:r.id,party_id:buyer.personal_party_id});
    let serial=0;
    for(const state of ['READY_TO_PAY','AWAITING_ACCEPTANCE','ACCEPTED','DELIVERED','DISPUTED','REFUND_REQUIRED','FULFILLED']){
      const start=Date.now()+(24+(serial++)*2)*3600000;
      let r=await N.book(buyer.ctx,{party_id:buyer.personal_party_id,offer_id:offer.id,offer_sha256:offer.content_sha256,appointment:{...S.appointment,mode:'ONLINE_MATERIALS',starts_at:new Date(start).toISOString(),ends_at:new Date(start+3600000).toISOString()},operation_key:randomUUID()});
      const args=()=>({record_id:r.id,expected_version:r.object_version,operation_key:randomUUID()});
      r=await N.reviewBooking(reviewer.ctx,{...args(),decision:'APPROVE',checks:{purpose_verified:true,venue_verified:true,adult_parties_verified:true},reason:'synthetic independent'});
      let order=null;
      if(state!=='READY_TO_PAY'){
        order=await S.trade.auditionCheckout(buyer.ctx,{party_id:buyer.personal_party_id,booking_id:r.id,booking_sha256:r.content_sha256,operation_key:randomUUID()});
        await S.payment(order); r=await read(r);
        if(state!=='AWAITING_ACCEPTANCE'){
          r=await N.decide(seller.ctx,{...args(),party_id:seller.personal_party_id,decision:state==='REFUND_REQUIRED'?'DECLINE':'ACCEPT',reason:'synthetic decision'});
          if(['DELIVERED','DISPUTED','FULFILLED'].includes(state)){
            r=await N.deliver(seller.ctx,{...args(),party_id:seller.personal_party_id,delivery:S.delivery});
            r=await N.reviewDelivery(reviewer.ctx,{...args(),decision:'APPROVE',checks:{content_reviewed:true,files_viewable:true,consent_verified:true},reason:'synthetic media only; not valid playable content'});
            if(state==='DISPUTED')r=await N.cancel(buyer.ctx,{...args(),party_id:buyer.personal_party_id,reason:'synthetic dispute',safety:true,evidence_asset_ids:[]});
            if(state==='FULFILLED'){
              for(const asset_id of [...S.delivery.photos,...S.delivery.videos])await N.observed(buyer.ctx,{record_id:r.id,party_id:buyer.personal_party_id,asset_id});
              r=await read(r); r=await N.confirm(buyer.ctx,{...args(),party_id:buyer.personal_party_id});
            }
          }
        }
      }
      scenarios[state.toLowerCase()]={booking_id:r.id,order_id:order?.id||null,status:r.current_status};checkRunning();
    }
    const principal=async req=>{const token=(req.headers?.authorization||'').replace(/^Bearer /,'');const u=S.users.find(x=>x.token===token);return u?S.principals.get(u.ctx):null;};
    const sim=await require(path.join(backend,'src/testing/payment-simulator')).createPaymentSimulator(db,{...env,MYSQL_DATABASE:name,JX_PAYMENT_SIMULATOR_ENABLED:'true'},{merchant_party_id:seller.personal_party_id,resolvePrincipal:principal});
    for(const u of [S.outsider,reviewer])for(const action of ['WALLET_RULE_REVIEW','ENGAGEMENT_REVIEW'])await require(path.join(backend,'src/modules/governance/operator-access')).maintainOperatorGrant(db,{account_id:u.account_id,action,enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:sandbox',reason:'local simulation only'});
    const wallet=require(path.join(backend,'src/modules/wallet/repository')).createWalletRepository(db,{resolvePrincipal:S.resolvePrincipal});
    let walletRule=await wallet.createRule(S.outsider.ctx,{rule:require(path.join(backend,'test/helpers/wallet-rule.cjs')),operation_key:randomUUID()});walletRule=await wallet.reviewRule(reviewer.ctx,{record_id:walletRule.id,expected_version:walletRule.object_version,decision:'APPROVE',reason:'synthetic only',operation_key:randomUUID()});
    await wallet.open(buyer.ctx,{party_id:buyer.personal_party_id,rule_id:walletRule.id,rule_sha256:walletRule.content_sha256,operation_key:randomUUID()});
    const engagement=require(path.join(backend,'src/modules/engagement/repository')).createEngagementRepository(db,{resolvePrincipal:S.resolvePrincipal});let growthRule=await engagement.createRule(S.outsider.ctx,{rule:require(path.join(backend,'test/helpers/engagement-rule.cjs')),operation_key:randomUUID()});growthRule=await engagement.reviewRule(reviewer.ctx,{record_id:growthRule.id,expected_version:growthRule.object_version,decision:'APPROVE',reason:'synthetic only',operation_key:randomUUID()});
    const rankProfile=await engagement.rankingProfile(seller.ctx,{party_id:seller.personal_party_id,person_id:seller.person.id,city:'synthetic-city',district:'synthetic-district',category:'synthetic-category',opt_in:true,operation_key:randomUUID()});
    const engagement_scenarios={rule_id:growthRule.id,profile_id:rankProfile.id,person_id:seller.person.id,city:'synthetic-city',district:'synthetic-district',category:'synthetic-category',simulated_payments_excluded_from_rankings:true};
    async function mockRequest(req,res){try{const origins=['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:5000','http://localhost:5000'];if(req.headers.origin&&!origins.includes(req.headers.origin))throw Object.assign(Error(),{status:403,code:'ORIGIN_FORBIDDEN'});if(req.headers.origin)res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, X-Acting-Party, Idempotency-Key');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Cache-Control','no-store');if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}if(req.method!=='POST'||!await principal(req))throw Object.assign(Error(),{status:403,code:'LOCAL_TEST_AUTH_REQUIRED'});let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>8192)throw Object.assign(Error(),{status:413,code:'BODY_TOO_LARGE'});}const input=JSON.parse(body),party_id=req.headers['x-acting-party'];const policy=require(path.join(backend,'src/modules/party/policy'));let result;if(req.url==='/api/v1/testing/payments/outcome'){policy.shape(input,['record_id','state']);result=await sim.choose(req,{...input,party_id});}else if(req.url==='/api/v1/testing/wallet/topup'){policy.shape(input,['amount_minor']);result=await sim.topup(req,{...input,party_id,operation_key:req.headers['idempotency-key']});}else throw Object.assign(Error(),{status:404,code:'TEST_ROUTE_NOT_FOUND'});res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({simulation:true,real_money:false,label:'SIMULATED - NO REAL MONEY',data:result}));}catch(e){res.writeHead(e.status||400,{'Content-Type':'application/json'});res.end(JSON.stringify({simulation:true,real_money:false,error:{code:e.code||'INVALID_TEST_REQUEST'}}));}}
    const app=createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory,tradeProvidersFactory:()=>sim,allowedOrigins:['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:5000','http://localhost:5000']});
    const rules=[/^\/api\/v1\/engagement(?:\/|$)/,/^\/api\/v1\/wallet(?:\/|$)/,/^\/api\/v1\/trade\/(payments|refunds)(?:\/|$)/,/^\/api\/v1\/auditions(?:\/|$)/,/^\/api\/v1\/operations\/(notifications|comments)(?:\/|$)/,/^\/api\/v1\/me(?:\/parties)?$/,/^\/api\/v1\/trade\/records(?:\/|$)/,/^\/api\/v1\/parties\/[0-9a-f-]{36}$/,/^\/(health|ready)$/];
    server=http.createServer((req,res)=>{if(req.url.startsWith('/api/v1/testing/'))return mockRequest(req,res);res.setHeader('X-Simulated-Payments','true');if(rules.some(r=>r.test(req.url.split('?')[0])))return app(req,res);res.writeHead(403,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:{code:'LOCAL_FIXTURE_ROUTE_DISABLED'}}));});
    server.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});checkRunning();
    const base_url='http://127.0.0.1:'+server.address().port+'/api/v1';await fs.mkdir(out,{recursive:true});
    const accounts=Object.fromEntries(Object.entries(people).map(([role,p])=>[role,{account_id:p.account_id,party_id:p.personal_party_id,bearer_token:p.token}]));
    await fs.writeFile(path.join(out,'access.json'),JSON.stringify({synthetic_only:true,payment_simulation:true,base_url,accounts,scenarios,engagement_scenarios},null,2),{mode:0o600});
    await fs.writeFile(path.join(out,'status.json'),JSON.stringify({status:'RUNNING',synthetic_only:true,host:'127.0.0.1',port:server.address().port,expires_in_minutes:60,database:name},null,2));
    starting=false;timer=setTimeout(stop,60*60*1000);
    console.log(JSON.stringify({status:'READY',base_url,access_file:path.relative(root,path.join(out,'access.json')),stop_file:path.relative(root,path.join(out,'stop')),synthetic_only:true,scenarios:Object.keys(scenarios),limits:'Synthetic audition status and permissions only; sample bytes are not playable media. Explicit isolated simulated payments only. No real SMS, money or production services.'}));
  } catch(e) {
    starting=false;
    const result=await cleanup();
    if(e.code==='LOCAL_STOP_REQUESTED')console.log(JSON.stringify(result));
    else throw e;
  }
}
main().catch(e=>{console.error(e.code||'V5_PAYMENT_SANDBOX_START_FAILED');process.exitCode=1;});
