'use strict';

const assert=require('node:assert/strict');
const {randomBytes,randomUUID}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const {load,root,hash,read}=require('./test-fixtures/qa18-s4-delta-clone.cjs');
const {openBrowser}=require('./test-fixtures/qa18-s4-artifact-browser.cjs');

const baseDir=path.join(root,'.local/qa18/s4-a-remaining-20261128');
const out=path.resolve(process.argv[2]||'');
const vueVersion=process.argv[3];
const appVersion='5902677d92ec11423dab0fa732ef28559ad7c4f0';
const floor='2020-01-01T00:00:00.000Z';

async function main(){
  assert(out.startsWith(baseDir+path.sep));
  await fs.mkdir(out,{recursive:true});
  await fs.writeFile(path.join(out,'RUN_ONCE'),'same original contract, infringement and license boundary',{flag:'wx'});
  const e={started_at:new Date().toISOString(),vue:vueVersion||null,app:appVersion,requests:[],browser_requests:[],checks:[]};
  const save=()=>fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(e,null,2)+'\n');
  const env=await read(process.env.JX_MYSQL_TEST_ENV_FILE);
  for(const [k,v] of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
  const mysql=load('node_modules/mysql2/promise');
  const name='jx_test_stockterm_'+randomBytes(10).toString('hex');
  const oldFlag=process.env.STOCK_COMMERCIAL_LICENSE_ENABLED;
  const admin=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
  let db,server,browser,created=false;
  try{
    await admin.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
    created=true;
    db=await load('src/infrastructure/database').openDatabase({...env,MYSQL_DATABASE:name,MYSQL_CONNECTION_LIMIT:'1'});
    const migrate=load('src/infrastructure/database/migrator').migrate;
    await migrate(db);
    e.database=name;
    const [[migration]]=await db.execute("SELECT COUNT(*) n,MAX(version) last FROM platform_schema_migrations WHERE status='APPLIED'");
    assert.equal(Number(migration.last),225);
    e.migration_count=Number(migration.n);
    const S=await load('test/helpers/stock-seed.cjs').seedStock(db);
    const {buyer,seller,reviewer,outsider,buyer2,trade,stock}=S;
    const parties=load('src/modules/party/repository').createPartyRepository(db,{resolvePrincipal:S.resolvePrincipal});
    const org=await parties.createOrganization(buyer.ctx,{display_name:'合成商用许可买方',operation_key:randomUUID()});
    await db.execute("INSERT INTO party_capabilities(party_id,code,current_status) VALUES (?,'BRAND_CLIENT','ACTIVE')",[org.party_id]);
    const expires=new Date(Math.floor(Date.now()/1000)*1000+240000).toISOString();
    const license={scope:'COMMERCIAL_LIMITED',exclusive:false,territory:'CN',duration:'FIXED_TERM',
      valid_from:floor,valid_until:expires,commercial_uses:['BRAND_PROMOTION'],personal_social_sharing:false,
      acceptance_hours:48,aftercare_terms:'合成许可范围与独立售后。'};
    let spec=await trade.createSpec(seller.ctx,{party_id:seller.personal_party_id,previous_spec_id:null,
      title:'合成独立商用许可',provider_party_id:seller.personal_party_id,line_kind:'OTHER',unit_minor:50000,currency:'CNY',
      specification:{version:'commercial-s4a',stock_license:license,terms:'CN 品牌宣传原许可。'},product_profile:{version:'V5',type:'STOCK_VIDEO'},operation_key:randomUUID()});
    spec=await trade.review(reviewer.ctx,{record_id:spec.id,expected_version:spec.object_version,decision:'APPROVED',
      reason:'合成独立规格审核',operation_key:randomUUID()});
    await S.publishSales(seller.personal_party_id,spec.id);
    const raw=Object.fromEntries(['features','grantee_party_id','valid_from','valid_until','terms','evidence_asset_ids'].map(k=>[k,S.consent.data[k]]));
    let consent=await S.artists.declareConsent(seller.ctx,{person_id:seller.person.id,party_id:seller.personal_party_id,
      avatar_id:S.avatar.id,consent:{...raw,purposes:['STOCK_LICENSE','PUBLIC_DISPLAY','STOCK_COMMERCIAL'],
        territories:['CN'],stock_commercial_uses:['BRAND_PROMOTION']},operation_key:randomUUID()});
    consent=await S.artists.review(reviewer.ctx,{person_id:seller.person.id,record_id:consent.id,expected_version:consent.object_version,
      decision:'APPROVE',reason:'合成逐人商用授权独审',operation_key:randomUUID()});
    let listing=await stock.create(seller.ctx,{...S.listingInput,spec_id:spec.id,
      participants:[{person_id:seller.person.id,avatar_id:S.avatar.id,consent_id:consent.id}],operation_key:randomUUID()});
    listing=await stock.review(reviewer.ctx,{record_id:listing.id,expected_version:listing.object_version,channel:'RIGHTS',
      decision:'APPROVED',reason:'同一媒体明确商用独审',verification:{rights_verified:true,
        all_people_authorized:true,seller_qualified:true,commercial_use_verified:true,source_sha256:listing.data.files.full_sha256},
      operation_key:randomUUID()});
    listing=await S.reviewListing(listing,'CONTENT');
    process.env.STOCK_COMMERCIAL_LICENSE_ENABLED='true';
    const order=await trade.stockCheckout(buyer.ctx,{party_id:org.party_id,listing_id:listing.id,offer_sha256:listing.content_sha256,
      channel:'ALIPAY',operation_key:randomUUID()});
    const payment=await trade.preparePayment(buyer.ctx,{party_id:org.party_id,order_id:order.id,installment_key:'stock',
      operation_key:randomUUID()},S.config);
    await trade.applyPayment({...S.config,payment_id:payment.id,amount_minor:50000,currency:'CNY',
      transaction_id:'synthetic.'+payment.id,status:'SUCCEEDED',product_id:null,app_account_token:null});
    Object.assign(e,{order:order.id,listing:listing.id,license,case:null});
    const {maintainOperatorGrant}=load('src/modules/governance/operator-access');
    for(const [actor,actions] of [[reviewer,['SUPPORT_HANDLE']],[outsider,['SUPPORT_HANDLE','PRIVACY_REVIEW']]]){
      for(const action of actions){
        const [[old]]=await db.execute('SELECT object_version FROM governance_operator_grants WHERE account_id=? AND action_code=?',[actor.account_id,action]);
        await maintainOperatorGrant(db,{account_id:actor.account_id,action,enabled:true,expires_at:null,
          expected_version:old?.object_version||0,authority_ref:'synthetic:s4a-stock-counternotice',reason:'合成许可同单侵权限制排查'});
      }
    }
    const claimFile=await S.supply.upload(buyer.ctx,{party_id:buyer.personal_party_id,purpose:'REVIEW_EVIDENCE',
      media_type:'text/plain',body:Buffer.from('Synthetic claimant evidence for the precise listing.'),operation_key:randomUUID()});
    server=load('src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory})
      .listen(0,'127.0.0.1');
    await new Promise((ok,fail)=>{server.once('listening',ok);server.once('error',fail);});
    const api='http://127.0.0.1:'+server.address().port+'/api/v1';
    const purchase='/stock/purchases/'+order.id;
    async function http(actor,route,expected,{party=actor.personal_party_id,version,method='GET',body}={}){
      const r=await fetch(api+route,{method,headers:{Authorization:'Bearer '+actor.token,
        ...party?{'X-Acting-Party':party}:{},...version?{'If-Match':'"'+version+'"'}:{},
        ...body?{'Idempotency-Key':randomUUID(),'Content-Type':'application/json'}:{}},body:body?JSON.stringify(body):undefined,
        signal:AbortSignal.timeout(12000)});
      const data=Buffer.from(await r.arrayBuffer());
      const j=r.headers.get('content-type')?.includes('json')?JSON.parse(data):null;
      e.requests.push({method,route,status:r.status,error:j?.error?.code,sha256:hash(data),bytes:data.length});
      await save();
      assert.equal(r.status,expected,route+' '+j?.error?.code);
      return j?j.data||j.error:data;
    }
    const content=(code)=>http(buyer,purchase+'/content',code,{party:org.party_id});
    const contract=await http(buyer,purchase,200,{party:org.party_id});
    for(const [field,value] of Object.entries(license))assert.deepEqual(contract.data.license[field],value,field);
    assert.equal(hash(await content(200)),S.file.content_sha256);
    await http(buyer2,purchase+'/content',404);
    let notice=await http(buyer,'/infringement/cases',200,{method:'POST',body:{target_kind:'STOCK_LISTING',
      target_id:listing.id,statement:'合成现货购买后核权通知',contact:'Synthetic only',evidence_asset_ids:[claimFile.id]}});
    e.case=notice.id;
    async function act(actor,action,extra={},operations=true,expected=200){
      const route='/infringement/'+(operations?'operations/':'')+'cases/'+notice.id+'/actions';
      const r=await http(actor,route,expected,{method:'POST',party:operations?null:actor.personal_party_id,version:notice.object_version,
        body:{action,reason:'合成原单：独立权利流程。',...extra}});
      if(expected===200)notice=r;
    }
    await act(reviewer,'FREEZE');
    assert.equal((await content(409)).code,'CONTENT_RESTRICTED');
    const frontendRoles={buyer:{account_id:buyer.account_id,party_id:org.party_id,bearer_token:buyer.token}};
    if(vueVersion){
      const directory=path.join(baseDir,'builds');
      const app={dir:path.join(directory,'app-isolated-verified'),manifest:path.join(directory,'app-isolated-verified.json'),checkout:appVersion,source:appVersion};
      const vue={dir:path.join(directory,'vue-stock'),manifest:path.join(directory,'vue-stock.json'),checkout:vueVersion,source:vueVersion};
      browser=await openBrowser(api,frontendRoles,e,{app,vue});
    }
    const pageRoute=surface=>surface==='app'?'/stock/purchase?orderId='+order.id:purchase;
    const buttonLabel=surface=>surface==='app'?'受控播放已购作品':'明确取得正式影片';
    if(browser){
      for(const surface of ['vue','app']){
        const page=await browser.actor(surface,'buyer',pageRoute(surface));
        try{
          const reply=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1'+purchase+'/content',{timeout:12000});
          reply.catch(()=>{});
          await page.getByRole('button',{name:buttonLabel(surface),exact:true}).click();
          const denied=await reply;
          assert.equal(denied.status(),409);
          assert.equal((await denied.json()).error.code,'CONTENT_RESTRICTED');
          assert.equal(await page.locator('video[src^="blob:"]').count(),0);
          e.checks.push({surface,case:notice.id,frozen_content_denied:true});
        }catch(error){
          await fs.writeFile(path.join(out,surface+'-freeze.aria.txt'),await page.locator('body').ariaSnapshot({timeout:1500}).catch(()=>''));
          throw error;
        }finally{await page.context().close();}
      }
    }
    await act(reviewer,'DELIVER_NOTICE',{statement:'仅转交本案必要合成事实。',disclosed_asset_ids:[]});
    await act(seller,'ACK_DELIVERY',{},false);
    await act(seller,'COUNTER',{statement:'独立核对同一份原授权。',contact:'Synthetic only',evidence_asset_ids:[S.evidence.id]},false);
    await act(reviewer,'DELIVER_COUNTER',{statement:'仅转交脱敏后合成事实。',disclosed_asset_ids:[]});
    await act(reviewer,'PROPOSE',{decision:'RESTORE'});
    await act(reviewer,'REVIEW',{decision:'APPROVE'},true,403);
    assert.equal((await content(409)).code,'CONTENT_RESTRICTED');
    await act(outsider,'REVIEW',{decision:'APPROVE'});
    assert.equal(notice.current_status,'RESOLVED');
    assert.equal(notice.restriction_active,false);
    assert.equal(hash(await content(200)),S.file.content_sha256);
    assert.equal((await http(buyer,purchase,200,{party:org.party_id})).contract_sha256,contract.contract_sha256);

    const views=[];
    if(browser){
      for(const surface of ['vue','app']){
        const page=await browser.actor(surface,'buyer',pageRoute(surface));
        views.push({surface,page});
        const reply=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1'+purchase+'/content',{timeout:12000});
        reply.catch(()=>{});
        await page.getByRole('button',{name:buttonLabel(surface),exact:true}).click();
        const restored=await reply;
        assert.equal(restored.status(),200);
        assert.equal(hash(await restored.body()),S.file.content_sha256);
        if(surface==='vue')await page.locator('video[src^="blob:"]').waitFor();
        e.checks.push({surface,case:notice.id,restored_same_bytes:true});
      }
    }
    assert(Date.now()<Date.parse(expires));
    const simulated=Date.parse(expires)+1;
    await db.execute('SET timestamp=?',[simulated/1000]);
    assert.equal((await content(409)).code,'STOCK_COMMERCIAL_LICENSE_NOT_ACTIVE');
    assert.deepEqual((await http(buyer,purchase,200,{party:org.party_id})).data.license,contract.data.license);
    for(const {surface,page} of views){
      await page.clock.setFixedTime(new Date(simulated));
      if(surface==='app'){
        const reloaded=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1'+purchase&&r.request().method()==='GET',{timeout:15000});
        reloaded.catch(()=>{});
        await page.reload({waitUntil:'domcontentloaded'});
        await page.locator('flt-semantics-placeholder').waitFor({state:'attached'});
        await page.locator('flt-semantics-placeholder').evaluate(element=>element.click());
        assert.equal((await reloaded).status(),200);
        await page.waitForLoadState('networkidle',{timeout:15000});
        const aria=await page.locator('body').ariaSnapshot({timeout:2500});
        await fs.writeFile(path.join(out,'app-expiry.aria.txt'),aria);
        assert(aria.includes('当前许可或文件使用条件未满足'), 'The App did not display its restricted license state');
      }else{
        await page.getByText('商用许可尚未生效或已到期，正式影片暂不可取得。',{exact:true}).waitFor();
        assert.equal(await page.locator('video[src^="blob:"]').count(),0);
      }
      assert.equal(await page.getByRole('button',{name:buttonLabel(surface),exact:true}).count(),0);
      e.checks.push({surface,expiry_denied:true,vue_existing_media_removed:surface==='vue'});
      await page.context().close();
    }
    await db.execute('SET timestamp=0');
    const [[journal]]=await db.execute("SELECT COUNT(*) n,SUM(amount_minor) total FROM trade_journal WHERE order_id=? AND direction='RECEIPT'",[order.id]);
    assert.deepEqual([Number(journal.n),Number(journal.total)],[1,50000]);
    e.checks.push({contract_sha256:contract.contract_sha256,original_file_sha256:S.file.content_sha256,
      settled_receipts:Number(journal.n),received_minor:Number(journal.total),actual_infringement:notice.current_status,
      isolated_clock_advanced_only:true});
    e.result='PASS';
  }catch(error){e.result='FAIL';e.failure=error.message;throw error;}
  finally{
    try{
      if(oldFlag===undefined)delete process.env.STOCK_COMMERCIAL_LICENSE_ENABLED;else process.env.STOCK_COMMERCIAL_LICENSE_ENABLED=oldFlag;
      await browser?.close();
      if(server){server.closeAllConnections();await new Promise(ok=>server.close(ok));}
      await db?.close();
      if(created&&/^jx_test_stockterm_[a-f0-9]{20}$/.test(name))await admin.query('DROP DATABASE '+mysql.escapeId(name));
    }finally{
      await admin.end();
      e.finished_at=new Date().toISOString();
      await save();
    }
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
