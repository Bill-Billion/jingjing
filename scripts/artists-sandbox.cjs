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
  if (process.argv.length !== 2) throw new Error('Usage: node scripts/artists-sandbox.cjs (Ctrl+C to clean up)');
  if (!process.env.JX_MYSQL_TEST_ENV_FILE) throw new Error('Isolated JX_MYSQL_TEST_ENV_FILE is required');
  const env = JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE, 'utf8'));
  for (const [k, v] of Object.entries({ NODE_ENV:'test', DB_CLIENT:'mysql', MYSQL_HOST:'127.0.0.1', MYSQL_PORT:'33316', MYSQL_USER:'jx_local', MYSQL_DATABASE:'jx_dev' })) {
    if (env[k] !== v) throw new Error('Refusing non-isolated test configuration');
  }
  const name = 'jx_test_artists_' + process.pid + '_' + randomBytes(6).toString('hex');
  const out = path.join(root, '.local/artists-sandbox', name);
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
      if(created && /^jx_test_artists_[0-9]+_[a-f0-9]{12}$/.test(name)) databaseRemoved=await step('database',()=>control.query('DROP DATABASE '+mysql.escapeId(name)));
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

    const principals=new Map(),resolvePrincipal=async ctx=>principals.get(ctx)||null;
    const party=createPartyRepository(db,{resolvePrincipal}),secret=randomBytes(32).toString('base64'),auth=createAuthRepository(db,{secret});
    const people={};
    for(const [role,label] of Object.entries({artist:'合成成年艺人',outsider:'合成无关用户',agency:'合成机构负责人',merchant:'合成平台服务负责人',reviewer:'合成独立审核人',minor:'合成未成年人（限制场景）'})){
      const ctx={};principals.set(ctx,{subject_ref:'synthetic:artist:'+randomUUID()});const record=await party.registerAccount(ctx,{display_name:label}),token=randomBytes(32).toString('base64url');
      await db.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms) VALUES (?,?,ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+7200000)',[auth.secure.digest('token',token),record.account_id]);people[role]={ctx,...record,token};checkRunning();
    }
    const merchant=await party.createOrganization(people.merchant.ctx,{display_name:'合成平台签约主体',operation_key:randomUUID()}),agency=await party.createOrganization(people.agency.ctx,{display_name:'合成MCN机构',operation_key:randomUUID()});
    for(const action of ['ARTIST_REVIEW_IDENTITY','ARTIST_REVIEW_RIGHTS','ARTIST_REVIEW_HALO','ARTIST_REVIEW_CONTENT','ARTIST_SERVICE_REVIEW','TRADE_REVIEW','TRADE_REFUND'])await maintainOperatorGrant(db,{account_id:people.reviewer.account_id,action,enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:artists-handoff',reason:'仅本机合成联调，非正式运营授权'});
    const {digest,createRuleContent}=require(path.join(backend,'src/modules/governance/content'));
    const repo=require(path.join(backend,'src/modules/artists/repository')).createArtistRepository(db,{resolvePrincipal});
    const services=require(path.join(backend,'src/modules/artists/services')).createArtistServices(db,{resolvePrincipal,merchantPartyId:merchant.party_id});
    const trade=require(path.join(backend,'src/modules/trade/repository')).createTradeRepository(db,{resolvePrincipal,requireV5Products:true});
    const files=new Map(),storageFactory=()=>({async put({key,body}){files.set(key,body);return {key,size:body.length,sha256:require('node:crypto').createHash('sha256').update(body).digest('hex')};},async getBuffer(key){return files.get(key);}});
    const assets=require(path.join(backend,'src/modules/works/assets')).createSupplyAssets({db,repository:require(path.join(backend,'src/modules/artists/assets')).createArtistAssetsRepository(db,{resolvePrincipal}),storageFactory});
    const until=new Date(Date.now()+30*86400000).toISOString(),from=new Date(Date.now()-60000).toISOString();
    const artist=people.artist,base={party_id:artist.personal_party_id};
    const person=await repo.createPerson(artist.ctx,{...base,display_name:'合成艺人甲',operation_key:randomUUID()});base.person_id=person.id;
    for(const [user,p,age,fingerprint] of [[artist,person,'ADULT','a'.repeat(64)],[people.minor,await repo.createPerson(people.minor.ctx,{party_id:people.minor.personal_party_id,display_name:'未成年人限制样例',operation_key:randomUUID()}),'MINOR','b'.repeat(64)]]){
      const r=await repo.prepareIdentity(user.ctx,{party_id:user.personal_party_id,person_id:p.id,session_ref:'synthetic:preseeded',operation_key:randomUUID()});await repo.applyIdentity(r.id,{request_key:r.data.request_key,person_id:p.id,status:'VERIFIED',issuer:'synthetic-only',subject_fingerprint:fingerprint,age_band:age,valid_until:until,evidence_ref:'synthetic:identity-no-real-person',liveness_verified:true,phone_verified:true});if(age==='MINOR')people.minor.person_id=p.id;
    }
    const avatar=await repo.createAvatar(artist.ctx,{...base,display_name:'合成数字人：未训练长期模型',operation_key:randomUUID()});
    const evidence=await assets.upload(artist.ctx,{...base,purpose:'CONSENT_EVIDENCE',media_type:'text/plain',body:Buffer.from('Synthetic consent evidence only. No real likeness or identity.'),operation_key:randomUUID()});
    const material=await assets.upload(artist.ctx,{...base,purpose:'AVATAR_MATERIAL',media_type:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=','base64'),operation_key:randomUUID()});
    const review=async r=>repo.review(people.reviewer.ctx,{person_id:person.id,record_id:r.id,expected_version:r.object_version,decision:'APPROVE',reason:'仅合成资料独立检查',operation_key:randomUUID()});
    const consent=await review(await repo.declareConsent(artist.ctx,{...base,avatar_id:avatar.id,consent:{features:['FACE','VOICE'],purposes:['PRIVATE_ARCHIVE','PUBLIC_DISPLAY'],grantee_party_id:artist.personal_party_id,territories:['CN'],valid_from:from,valid_until:until,terms:'仅合成联调，不代表真实肖像声音授权',evidence_asset_ids:[evidence.id]},operation_key:randomUUID()}));
    const look=await repo.createVariant(artist.ctx,{...base,avatar_id:avatar.id,kind:'LOOK',variant:{previous_version_id:null,display_name:'合成造型版本',material_asset_ids:[material.id],consent_id:consent.id},operation_key:randomUUID()});
    const halo=await review(await repo.requestHalo(artist.ctx,{...base,level:1,ownership_promise:true,evidence_asset_ids:[evidence.id],operation_key:randomUUID()}));
    const ruleId=randomUUID(),rule=createRuleContent({id:ruleId,rule_key:'synthetic.artist.services',version:'1',terms:{notice:'仅本机合成服务订单，不开真实收费'}});
    await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)',[ruleId,'synthetic.artist.services','1',JSON.stringify(rule),'2020-01-01 00:00:00',people.merchant.account_id,'EFFECTIVE']);
    const specs={};let hosting;
    for(const kind of ['AVATAR_CREATION','AVATAR_HOSTING','HALO_REVIEW']){
      let spec=await trade.createSpec(people.merchant.ctx,{party_id:merchant.party_id,previous_spec_id:null,title:'仅合成测试 '+kind,provider_party_id:merchant.party_id,line_kind:'OTHER',unit_minor:kind==='AVATAR_CREATION'?6000:kind==='AVATAR_HOSTING'?2900:1000,currency:'CNY',product_profile:{version:'V5',type:kind},specification:{version:'synthetic-v1',service_tier:'本机合成测试',service:{kind,unit:kind==='AVATAR_CREATION'?'PERSON_FIRST':kind==='AVATAR_HOSTING'?'AVATAR_MONTH':'HALO_APPLICATION',rule_version:'V5-20261013',source_ref:'synthetic:only',retry_limit:kind==='AVATAR_CREATION'?1:0,hosting_months:kind==='AVATAR_HOSTING'?1:null,halo_level:kind==='HALO_REVIEW'?2:null,failure_policy:'REFUND_UNDELIVERED'},deliverables:['仅合成档案或服务结果'],terms:'测试费用不会向外部渠道发送'},operation_key:randomUUID()});
      spec=await trade.review(people.reviewer.ctx,{record_id:spec.id,expected_version:spec.object_version,decision:'APPROVED',reason:'合成商品',operation_key:randomUUID()});specs[kind]=spec.id;
      if(kind==='AVATAR_HOSTING'){
        const service=await services.request(artist.ctx,{...base,avatar_id:avatar.id,spec_id:spec.id,renewal_reminder:false,operation_key:randomUUID()});
        let quote=await trade.quote(people.merchant.ctx,{party_id:merchant.party_id,buyer_party_id:artist.personal_party_id,lines:[{line_id:'service',spec_id:spec.id,quantity:1}],installments:[{key:'all',trigger:'ORDER_ACCEPTED',allocations:[{line_id:'service',amount_minor:2900}],apple_product_id:null}],channel:'ALIPAY',transaction_model:'PLATFORM_PRINCIPAL',rule_id:ruleId,expires_at:until,payment_window_minutes:30,license_reservation_id:null,artist_service_source:{service_id:service.id},operation_key:randomUUID()});
        quote=await trade.review(people.reviewer.ctx,{record_id:quote.id,expected_version:quote.object_version,decision:'APPROVED',reason:'合成报价',operation_key:randomUUID()});const order=await trade.accept(artist.ctx,{record_id:quote.id,party_id:artist.personal_party_id,expected_version:quote.object_version,quote_sha256:quote.content_sha256,operation_key:randomUUID()});
        const config={provider:'ALIPAY',environment:'SANDBOX',app_id:'synthetic.app',merchant_id:'synthetic.merchant',merchant_party_id:merchant.party_id,config_revision:'synthetic'};const payment=await trade.preparePayment(artist.ctx,{party_id:artist.personal_party_id,order_id:order.id,installment_key:'all',operation_key:randomUUID()},config);
        await trade.applyPayment({...config,payment_id:payment.id,currency:'CNY',amount_minor:2900,transaction_id:'synthetic.'+payment.id,status:'SUCCEEDED',product_id:null,app_account_token:null});hosting=await services.sync(artist.ctx,{...base,record_id:service.id,operation_key:randomUUID()});
      }
    }
    const listing=await review(await repo.submitListing(artist.ctx,{...base,avatar_id:avatar.id,listing:{display_name:'合成公开艺人',city:'郑州',introduction:'纯合成联调资料，预览是1像素占位图，不是真人或生成形象。',tags:['合成测试'],consent_id:consent.id,look_version_id:look.id,voice_version_id:null,audition_public:false,preview_asset_ids:[material.id]},operation_key:randomUUID()}));
    await db.execute("INSERT INTO party_capabilities(party_id,code,current_status) VALUES (?,'MCN','ACTIVE')",[agency.party_id]);
    const agencyAssets=require(path.join(backend,'src/modules/works/assets')).createSupplyAssets({db,repository:require(path.join(backend,'src/modules/works/repository')).createSupplyRepository(db,{resolvePrincipal}),storageFactory});
    const agencyProof=await agencyAssets.upload(people.agency.ctx,{party_id:agency.party_id,purpose:'CONSENT_EVIDENCE',media_type:'text/plain',body:Buffer.from('Synthetic agency relation evidence only; no real agreement.'),operation_key:randomUUID()});
    const gigs=require(path.join(backend,'src/modules/gigs/repository')).createGigsRepository(db,{resolvePrincipal});
    let relation=await gigs.relation(people.agency.ctx,{party_id:agency.party_id,artist_party_id:artist.personal_party_id,scope:'COMMERCIAL',valid_from:from,valid_until:until,exclusive:false,terms:'仅合成委托关系；非正式佣金条款',commission:{platform_bps:0,mcn_bps:0},evidence_asset_ids:[agencyProof.id],operation_key:randomUUID()});
    relation=await gigs.relationDecision(artist.ctx,{record_id:relation.id,party_id:artist.personal_party_id,expected_version:relation.object_version,decision:'ACCEPT',reason:'仅本机合成接受',operation_key:randomUUID()});
    const relationId=relation.id;
    const delegation=await repo.createDelegation(artist.ctx,{...base,delegation:{organization_party_id:agency.party_id,relation_id:relationId,actions:['READ_PROFILE','MANAGE_AVATARS','MANAGE_MATERIALS','SUBMIT_LISTING'],valid_from:from,valid_until:until,evidence_asset_ids:[evidence.id],terms:'只限本机合成委托，不可代授权或代签'},operation_key:randomUUID()});
    const app=createAccountApi({db,secret,supplyEnv:{ARTIST_PLATFORM_MERCHANT_PARTY_ID:merchant.party_id},supplyStorageFactory:storageFactory,tradeEnv:{TRADE_REQUIRE_V5_PRODUCTS:'true'},allowedOrigins:['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:5000','http://localhost:5000','http://127.0.0.1:5500','http://localhost:5500']});
    const rules=[/^\/api\/v1\/artists(?:\/|$)/,/^\/api\/v1\/me(?:\/parties)?$/,/^\/api\/v1\/trade\/(records|specifications|quotes)(?:\/|$)/,/^\/(health|ready)$/];
    server=http.createServer((req,res)=>{const url=new URL(req.url,'http://127.0.0.1');const readRelation=['GET','OPTIONS'].includes(req.method)&&url.pathname==='/api/v1/gigs/records'&&url.searchParams.get('kind')==='RELATION';if((req.method==='GET'&&url.pathname==='/api/v1/privacy/preferences')||readRelation||rules.some(r=>r.test(url.pathname)))return app(req,res);res.writeHead(403,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:{code:'LOCAL_FIXTURE_ROUTE_DISABLED'}}));});
    server.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});checkRunning();
    const base_url='http://127.0.0.1:'+server.address().port+'/api/v1';await fs.mkdir(out,{recursive:true});
    const accounts=Object.fromEntries(Object.entries(people).map(([role,p])=>[role,{account_id:p.account_id,party_id:p.personal_party_id,bearer_token:p.token,...(p.person_id?{person_id:p.person_id}:{})}]));
    await fs.writeFile(path.join(out,'access.json'),JSON.stringify({synthetic_only:true,base_url,accounts,merchant_party_id:merchant.party_id,agency_party_id:agency.party_id,person_id:person.id,avatar_id:avatar.id,consent_id:consent.id,look_id:look.id,halo_id:halo.id,listing_id:listing.id,delegation_id:delegation.id,hosting_id:hosting.id,material_id:material.id,evidence_id:evidence.id,specs,rule_id:ruleId},null,2),{mode:0o600});
    await fs.writeFile(path.join(out,'status.json'),JSON.stringify({status:'RUNNING',synthetic_only:true,host:'127.0.0.1',port:server.address().port,expires_in_minutes:60,database:name},null,2));
    starting=false;timer=setTimeout(stop,60*60*1000);
    console.log(JSON.stringify({status:'READY',base_url,access_file:path.relative(root,path.join(out,'access.json')),stop_file:path.relative(root,path.join(out,'stop')),synthetic_only:true,scenarios:['艺人本人','机构受托列表','已批准公开预览','私人材料越权','免费认证','托管有效期','服务订购待报价','未成年人受限','无外部服务不假成功']}));
  } catch(e) {
    starting=false;
    const result=await cleanup();
    if(e.code==='LOCAL_STOP_REQUESTED')console.log(JSON.stringify(result));
    else throw e;
  }
}
main().catch(e=>{console.error(e.code||'ARTISTS_SANDBOX_START_FAILED');process.exitCode=1;});
