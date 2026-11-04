// Isolated local Android + MySQL test. No real identities, providers or funds.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, unlink} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {createRequire} from 'node:module';
import {randomBytes, randomUUID, createHash} from 'node:crypto';
import {createServer, request as httpRequest} from 'node:http';
import {execFileSync, spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const root=process.cwd(), backend=resolve('晶晶日上工程交接包/01_源码/backend_server');
const appDir=resolve('晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app');
const webRoot=resolve('晶晶日上工程交接包/01_源码/frontend_ops_workspace');
const out=resolve('.local/tonight-exposure-delivery-20261104'), req=createRequire(join(backend,'package.json'));
req('./scripts/test-network-guard.cjs');
const mysql=req('mysql2/promise'), key=()=>randomUUID();
const env=JSON.parse(await readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'})) assert.equal(env[k],v);
await mkdir(out,{recursive:true});
const database='jx_test_exposure_'+randomBytes(8).toString('hex');
const result={synthetic_only:true,database,started_at:new Date().toISOString(),steps:[],cleanup:{}};
const watched=['scripts/tonight-exposure-delivery-check.mjs','contracts/openapi.yaml','晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/integration_test/afternoon_exposure_native_local_test.dart','晶晶日上工程交接包/01_源码/frontend_ops_workspace/dist/index.html','晶晶日上工程交接包/01_源码/backend_server/src/http/engagement-routes.js','晶晶日上工程交接包/01_源码/backend_server/src/modules/engagement/rankings.js','晶晶日上工程交接包/01_源码/backend_server/src/modules/redemption/fulfillment.js','晶晶日上工程交接包/01_源码/backend_server/src/modules/redemption/delivery-evidence.js','晶晶日上工程交接包/01_源码/backend_server/src/modules/redemption/repository.js','晶晶日上工程交接包/01_源码/backend_server/src/http/redemption-routes.js','晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/redemption/redemption_pages.dart','晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/cocreation/cocreation_cast.dart','晶晶日上工程交接包/01_源码/frontend_ops_workspace/src/business/redemption.ts','晶晶日上工程交接包/01_源码/frontend_ops_workspace/src/api/errors.ts','晶晶日上工程交接包/01_源码/frontend_ops_workspace/src/business/references.ts','晶晶日上工程交接包/01_源码/frontend_ops_workspace/src/components/business/BusinessFields.vue','晶晶日上工程交接包/01_源码/frontend_ops_workspace/src/views/BusinessView.vue'];
async function sourceHashes(){return Object.fromEntries(await Promise.all(watched.map(async path=>[path,createHash('sha256').update(await readFile(resolve(path))).digest('hex')])));}
result.source_sha256=await sourceHashes();
const secret=randomBytes(32).toString('base64url');
let control,db,backendServer,proxy,web,browser,defines,reverse,created=false,complete=false,lost=false,grant,S;
const writes=[];
try{
  control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
  await control.query('CREATE DATABASE '+mysql.escapeId(database)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');created=true;
  db=await req('./src/infrastructure/database').openDatabase({...env,MYSQL_DATABASE:database,MYSQL_CONNECTION_LIMIT:'1'});
  await req('./src/infrastructure/database/migrator').migrate(db);
  S=await req('./test/helpers/stock-seed.cjs').seedStock(db);
  await db.execute('UPDATE auth_sessions SET expires_ms=ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+40*86400000');
  const {seller,reviewer,outsider}=S;
  for(const user of [seller,reviewer,outsider]) for(const action of ['REDEMPTION_REVIEW','WALLET_RULE_REVIEW'])
    await req('./src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:user.account_id,action,enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:exposure-native',reason:'isolated test only'});
  const W=req('./src/modules/wallet/repository').createWalletRepository(db,{resolvePrincipal:S.resolvePrincipal});
  let rule=await W.createRule(outsider.ctx,{rule:{...req('./test/helpers/wallet-rule.cjs'),free_awards:{REGISTER:100000,DAILY_CHECKIN:null,REVIEW:null,SHARE:null}},operation_key:key()});
  rule=await W.reviewRule(reviewer.ctx,{record_id:rule.id,expected_version:rule.object_version,decision:'APPROVE',reason:'synthetic independent',operation_key:key()});
  await W.open(seller.ctx,{party_id:seller.personal_party_id,rule_id:rule.id,rule_sha256:rule.content_sha256,operation_key:key()});
  const proof=await S.supply.upload(seller.ctx,{party_id:seller.personal_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from('synthetic only'),operation_key:key()});
  const R=req('./src/modules/redemption/repository').createRedemptionRepository(db,{resolvePrincipal:S.resolvePrincipal});
  let stock=await R.createStock(seller.ctx,{party_id:seller.personal_party_id,template:{version:'synthetic-native',source_ref:'synthetic-only',title:'合成曝光权益',kind:'EXPOSURE',valid_days:30,exchange_points:6000,capacity:3,available_until:'2099-01-01T00:00:00.000Z',terms:'仅隔离测试，无真实权益',production:null,interview:null,exposure:{placement:'synthetic-slot',duration_days:7}},evidence_asset_ids:[proof.id],operation_key:key()});
  stock=await R.reviewStock(reviewer.ctx,{record_id:stock.id,expected_version:stock.object_version,decision:'APPROVE',reason:'synthetic independent',operation_key:key()});
  grant=await R.exchange(seller.ctx,{party_id:seller.personal_party_id,stock_id:stock.id,template_sha256:req('./src/modules/governance/content').digest(stock.data.template),operation_key:key()});
  const webGrant=await R.exchange(seller.ctx,{party_id:seller.personal_party_id,stock_id:stock.id,template_sha256:req('./src/modules/governance/content').digest(stock.data.template),operation_key:key()});
  const E=req('./src/modules/engagement/repository').createEngagementRepository(db,{resolvePrincipal:S.resolvePrincipal});
  const profile=await E.rankingProfile(seller.ctx,{party_id:seller.personal_party_id,person_id:seller.person.id,city:'synthetic-city',district:'synthetic-area',category:'synthetic-category',opt_in:true,operation_key:key()});
  result.records={grant_id:grant.id,web_grant_id:webGrant.id,profile_id:profile.id,person_id:seller.person.id,avatar_id:S.avatar.id};
  const app=req('./src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory});
  backendServer=createServer(app);await new Promise((yes,no)=>{backendServer.once('error',no);backendServer.listen(0,'127.0.0.1',yes)});
  const base='http://127.0.0.1:'+backendServer.address().port;
  proxy=createServer(async(q,s)=>{try{
    if(q.url==='/__native/control'){
      assert.equal(q.headers.authorization,'Bearer '+secret);const parts=[];for await(const x of q)parts.push(x);const body=JSON.parse(Buffer.concat(parts));let data={ok:true};
      if(body.action==='setup') data={grant_id:grant.id,account:{account_id:seller.account_id,party_id:seller.personal_party_id,bearer_token:seller.token}};
      else if(body.action==='verify'){
        const current=await R.grant(seller.ctx,{party_id:seller.personal_party_id,record_id:grant.id});
        assert.equal(current.current_status,'BOUND');assert.equal(current.data.binding.profile_id,profile.id);
        assert.equal(writes.length,2);assert.equal(writes[0].key,writes[1].key);assert.equal(writes[0].version,writes[1].version);
        data={status:current.current_status,bind_requests:writes.length,same_key:true};result.steps.push({id:'native-lost-response-same-key',...data});
      }else if(body.action==='capture'){
        assert(['native-pending','native-bound'].includes(body.name));
        await writeFile(join(out,body.name+'.png'),execFileSync(reverse.adb,['-s',reverse.device,'exec-out','screencap','-p']));
      }else if(body.action==='complete') complete=true;else throw Error('unsupported control');
      s.setHeader('Content-Type','application/json');s.end(JSON.stringify(data));return;
    }
    const u=new URL(q.url,base),isBind=q.method==='POST'&&u.pathname==='/api/v1/redemption/grants/'+grant.id+'/bind';
    if(isBind)writes.push({key:q.headers['idempotency-key'],version:q.headers['if-match']});
    const target=httpRequest(u,{method:q.method,headers:q.headers},r=>{
      if(isBind)writes[writes.length-1].status=r.statusCode;
      if(isBind&&!lost&&r.statusCode===200){lost=true;r.resume();r.on('end',()=>{s.writeHead(503,{'Content-Type':'application/json'});s.end(JSON.stringify({error:{code:'SYNTHETIC_RESPONSE_LOST',message:'synthetic response lost after commit',retryable:true}}));});}
      else{s.writeHead(r.statusCode,r.headers);r.pipe(s);}
    });target.on('error',()=>{s.writeHead(503);s.end();});q.pipe(target);
  }catch(e){console.error('EXPOSURE_CONTROL_ERROR',e.message);s.writeHead(409);s.end(JSON.stringify({error:'synthetic control failed'}));}});
  await new Promise((yes,no)=>{proxy.once('error',no);proxy.listen(0,'127.0.0.1',yes)});
  const port=proxy.address().port,tc=resolve('../toolchains'),adb=join(tc,'android-sdk/platform-tools/adb'),device=process.env.ANDROID_SERIAL||'emulator-5554';
  execFileSync(adb,['-s',device,'reverse',`tcp:${port}`,`tcp:${port}`]);reverse={adb,device,port};
  defines=join(out,'native-defines.json');await writeFile(defines,JSON.stringify({NATIVE_ORIGIN:'http://127.0.0.1:'+port,NATIVE_CONTROL:secret}),{mode:0o600});
  const childEnv={...process.env,PUB_CACHE:join(tc,'pub-cache'),ANDROID_HOME:join(tc,'android-sdk'),ANDROID_USER_HOME:join(tc,'android-user'),ANDROID_AVD_HOME:join(tc,'avd'),GRADLE_USER_HOME:join(tc,'gradle'),JAVA_HOME:join(tc,'jdk17/jdk-17.0.21+9/Contents/Home'),XDG_CONFIG_HOME:resolve('.local/team-next-stage-20261104/config'),FLUTTER_SUPPRESS_ANALYTICS:'true'};
  childEnv.PATH=[join(tc,'flutter/bin'),join(childEnv.JAVA_HOME,'bin'),join(tc,'android-sdk/platform-tools'),process.env.PATH].join(':');
  const child=spawn(join(tc,'flutter/bin/flutter'),['test','integration_test/afternoon_exposure_native_local_test.dart','-d',device,'--no-pub','--timeout','15m','--dart-define-from-file='+defines,'--reporter','expanded'],{cwd:appDir,env:childEnv,stdio:'inherit'});
  assert.equal(await new Promise((yes,no)=>{child.once('error',no);child.once('exit',yes)}),0);assert(complete&&lost);
  const webRequire=createRequire(join(webRoot,'package.json')),{chromium}=webRequire('playwright-core'),{preview}=await import(pathToFileURL(webRequire.resolve('vite')));
  const webPort=Number(process.env.JX_TEST_WEB_PORT||5196),origin='http://127.0.0.1:'+webPort;
  web=await preview({root:webRoot,configFile:false,build:{outDir:join(webRoot,'dist')},preview:{host:'127.0.0.1',port:webPort,strictPort:true,proxy:{'/api':{target:base}}}});
  browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1100},locale:'zh-CN'});
  await context.addInitScript(({token,party})=>{sessionStorage.setItem('ops.session.token',token);sessionStorage.setItem('ops.session.selected',party)},{token:seller.token,party:seller.personal_party_id});
  const page=await context.newPage();page.setDefaultTimeout(15000);
  await page.goto(origin+'/redemption/grants/'+webGrant.id);await page.waitForLoadState('networkidle');
  await page.locator('.business-actions').getByRole('button',{name:'本人绑定实际人物与用途',exact:true}).click();await page.getByTestId('business-bind').waitFor();
  async function choose(id,label,value){await page.getByRole('button',{name:'读取可选'+label,exact:true}).click();await page.locator('#'+id+' option[value="'+value+'"]').waitFor({state:'attached'});await page.locator('#'+id).selectOption(value);}
  await choose('bind-person_id','本人真人档案',seller.person.id);
  await choose('bind-avatar_id','本人数字人',S.avatar.id);
  await choose('bind-profile_id','曝光所需本人已公开榜单档案',profile.id);
  await page.getByLabel('已阅读当前记录与本次约定，明确提交上述办理事项。',{exact:true}).check();
  const response=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith('/bind'));
  await page.getByTestId('business-bind').click();const submitted=await response;assert.equal(submitted.status(),200,await submitted.text());
  assert.equal((await R.grant(seller.ctx,{party_id:seller.personal_party_id,record_id:webGrant.id})).current_status,'BOUND');
  await page.screenshot({path:join(out,'web-binding.png'),fullPage:true});result.steps.push({id:'web-exposure-binding',grant_id:webGrant.id,status:'BOUND'});
  const observed=page.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname==='/api/v1/redemption/grants/'+grant.id);
  await page.goto(origin+'/redemption/grants/'+grant.id);const read=await observed;assert.equal(read.status(),200);assert.equal((await read.json()).data.current_status,'BOUND');await page.waitForLoadState('networkidle');assert((await page.locator('body').innerText()).includes('合成曝光权益'));
  await page.screenshot({path:join(out,'web-native-same-grant.png'),fullPage:true});result.steps.push({id:'web-reads-native-grant',grant_id:grant.id,status:'BOUND'});
  async function post(p,suffix,action){const wait=p.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith(suffix));await action();const response=await wait,json=await response.json();assert.equal(response.status(),200,JSON.stringify(json));await p.waitForLoadState('networkidle');return json.data;}
  async function supplierEvidence(p,purpose,contents){
    await p.goto(origin+'/redemption/fulfillments');await p.waitForLoadState('networkidle');const row=p.locator('.business-records article').filter({hasText:grant.id});await row.getByRole('button',{name:'查看与办理',exact:true}).click();await p.locator('.business-actions').getByRole('button',{name:'为本项权益提交履约依据',exact:true}).click();await p.locator('#submit-delivery-evidence-purpose').selectOption(purpose);await p.locator('details.business-upload summary').click();assert.equal(await p.locator('#business-purpose').inputValue(),'REVIEW_EVIDENCE');await p.locator('#business-upload-file').setInputFiles({name:'synthetic-evidence.txt',mimeType:'text/plain',buffer:Buffer.from(contents)});const uploaded=await post(p,'/supply/assets',()=>p.getByRole('button',{name:'上传私有材料',exact:true}).click());await p.getByRole('button',{name:'读取可选本次实际履约依据',exact:true}).click();await p.locator('#submit-delivery-evidence-asset_id option[value="'+uploaded.id+'"]').waitFor({state:'attached'});await p.locator('#submit-delivery-evidence-asset_id').selectOption(uploaded.id);await p.getByLabel('已阅读当前记录与本次约定，明确提交上述办理事项。',{exact:true}).check();const sent=await post(p,'/evidence-submissions',()=>p.getByTestId('business-submit-delivery-evidence').click());assert.equal(sent.data.asset_id,uploaded.id);return uploaded.id;
  }
  const scheduleProof=await supplierEvidence(page,'SCHEDULE','synthetic schedule evidence only');result.steps.push({id:'supplier-submits-schedule-evidence-on-web',grant_id:grant.id,asset_id:scheduleProof});
  async function actor(user){const c=await browser.newContext({viewport:{width:1440,height:1100},locale:'zh-CN',timezoneId:'UTC'});await c.addInitScript(({token,party})=>{sessionStorage.setItem('ops.session.token',token);sessionStorage.setItem('ops.session.selected',party)},{token:user.token,party:user.personal_party_id});const p=await c.newPage();p.setDefaultTimeout(15000);return {c,p};}
  const operator=await actor(outsider),independent=await actor(reviewer);const op=operator.p,rev=independent.p;
  async function selectQueue(p,kind,record){await p.goto(origin+'/redemption/reviews');await p.waitForLoadState('networkidle');await p.locator('#filter-kind').selectOption(kind);await p.getByRole('button',{name:'读取当前列表',exact:true}).click();await p.locator('.business-records article').filter({hasText:record}).getByRole('button',{name:'查看与办理',exact:true}).click();}
  async function chooseEvidence(p,prefix,label,asset){await p.getByRole('button',{name:'读取可选'+label,exact:true}).click();await p.locator('#'+prefix+'-evidence_asset_id option[value="'+asset+'"]').waitFor({state:'attached'});await p.locator('#'+prefix+'-evidence_asset_id').selectOption(asset);await p.locator('#business-asset').selectOption(asset);const read=p.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname.endsWith('/evidence/'+asset));await p.getByRole('button',{name:'读取本项实际履约依据',exact:true}).click();assert.equal((await read).status(),200);}
  await selectQueue(op,'GRANT',grant.id);await op.locator('.business-actions').getByRole('button',{name:'提出真实面试或曝光排期',exact:true}).click();const start=new Date(Math.ceil((Date.now()+3600000)/60000)*60000),end=new Date(start.getTime()+7*86400000);await op.locator('#delivery-starts_at').fill(start.toISOString().slice(0,16));await op.locator('#delivery-ends_at').fill(end.toISOString().slice(0,16));await op.locator('#delivery-reference').fill('synthetic schedule only');await chooseEvidence(op,'delivery','实际排期依据',scheduleProof);await op.getByLabel('已阅读当前记录与本次约定，明确提交上述办理事项。',{exact:true}).check();let schedule=await post(op,'/deliveries',()=>op.getByTestId('business-delivery').click());assert.equal(schedule.current_status,'IN_REVIEW');result.steps.push({id:'operator-reads-and-proposes-same-grant-on-web',grant_id:grant.id,schedule_id:schedule.id});
  await selectQueue(rev,'SCHEDULE',schedule.id);await rev.locator('.business-actions').getByRole('button',{name:'另一岗位独立核验排期',exact:true}).click();await rev.locator('#delivery-review-decision').selectOption('APPROVE');await rev.locator('#delivery-review-reason').fill('synthetic independent review');await rev.getByLabel('已阅读当前记录与本次约定，明确提交上述办理事项。',{exact:true}).check();schedule=await post(rev,'/review',()=>rev.getByTestId('business-delivery-review').click());assert.equal(schedule.current_status,'APPROVED');result.steps.push({id:'independent-schedule-review-on-web',schedule_id:schedule.id});
  await page.goto(origin+'/redemption/grants/'+grant.id);await page.waitForLoadState('networkidle');await page.locator('.business-actions').getByRole('button',{name:'本人明确接受或拒绝本次排期',exact:true}).click();await page.locator('#confirmation-accepted').check();await page.getByLabel('已阅读当前记录与本次约定，明确提交上述办理事项。',{exact:true}).check();await post(page,'/confirmation',()=>page.getByTestId('business-confirmation').click());grant=await R.grant(seller.ctx,{party_id:seller.personal_party_id,record_id:grant.id});assert.equal(grant.current_status,'CONFIRMED');result.steps.push({id:'holder-confirms-same-grant-on-web',grant_id:grant.id,schedule_id:schedule.id});
  const [[clock]]=await db.execute('SELECT UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) seconds');await db.execute('SET timestamp=?',[Number(clock.seconds)+2*86400]);assert.equal((await R.exposures(seller.ctx,{city:'synthetic-city'})).items.length,1);await db.execute('SET timestamp=?',[Number(clock.seconds)+9*86400]);assert.equal((await R.exposures(seller.ctx,{city:'synthetic-city'})).items.length,0);
  const finalProof=await supplierEvidence(page,'COMPLETION','synthetic fulfillment evidence only');await selectQueue(op,'GRANT',grant.id);await op.locator('.business-actions').getByRole('button',{name:'记录本权益实际兑现结果',exact:true}).click();await op.locator('#finish-outcome').selectOption('EXPOSURE_COMPLETED');await op.locator('#finish-reason').fill('synthetic seven day completion');await chooseEvidence(op,'finish','实际结果依据',finalProof);await op.getByLabel('已阅读当前记录与本次约定，明确提交上述办理事项。',{exact:true}).check();grant=await post(op,'/finish',()=>op.getByTestId('business-finish').click());assert.equal(grant.current_status,'FULFILLED');await op.screenshot({path:join(out,'web-fulfilled.png'),fullPage:true});await db.execute('SET timestamp=0');result.steps.push({id:'supplier-and-operator-finish-on-web',grant_id:grant.id,simulated_clock:'isolated connection +2 then +9 days'});await operator.c.close();await independent.c.close();
  assert.deepEqual(await sourceHashes(),result.source_sha256,'source changed during test');result.passed=true;
}catch(e){result.passed=false;result.error=e.stack;process.exitCode=1;console.error(e.stack);}
finally{
  if(defines)await unlink(defines).catch(()=>{});
  if(reverse){try{execFileSync(reverse.adb,['-s',reverse.device,'reverse','--remove',`tcp:${reverse.port}`]);result.cleanup.reverse_removed=true}catch{result.cleanup.reverse_removed=false}}
  await browser?.close();if(web)await new Promise(r=>web.httpServer.close(r));
  if(proxy){proxy.closeAllConnections();await new Promise(r=>proxy.close(r));}
  if(backendServer){backendServer.closeAllConnections();await new Promise(r=>backendServer.close(r));}
  await db?.close();if(created&&/^jx_test_exposure_[a-f0-9]{16}$/.test(database)){await control.query('DROP DATABASE '+mysql.escapeId(database));result.cleanup.database_removed=true;}await control?.end();
  result.bind_statuses=writes.map(({status})=>status);result.bind_requests=writes.length;
  result.cleanup.services_stopped=true;result.finished_at=new Date().toISOString();await writeFile(join(out,'native-result.json'),JSON.stringify(result,null,2));
}
