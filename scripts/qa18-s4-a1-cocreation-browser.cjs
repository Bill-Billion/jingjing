'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {createHash, randomBytes, randomUUID} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname,'..');
const src = path.join(root,'晶晶日上工程交接包/01_源码');
const backend = path.join(src,'backend_server');
const candidate = '053168fb6e06b80680101702a733357309368809';
const load = file => require(path.join(backend,file));
load('scripts/test-network-guard.cjs');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = async file => JSON.parse(await fs.readFile(file,'utf8'));
const key = randomUUID;
const contentTypes = {'.html':'text/html','.js':'application/javascript','.json':'application/json',
  '.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png',
  '.ttf':'font/ttf','.woff2':'font/woff2'};

async function main() {
  const out=path.resolve(process.argv[2]||'');
  assert(out.startsWith(path.join(root,'.local/qa18')+path.sep));
  await fs.mkdir(out,{recursive:false});
  const proof={product:candidate,checkout:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
    started_at:new Date().toISOString(),builds:{},records:{},observations:[],requests:[]};
  const store=()=>fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(proof,null,2)+'\n');
  let control,db,server,browser,database;
  try {
    const environment=await read(process.env.JX_MYSQL_TEST_ENV_FILE);
    for(const [name,value] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',
      MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'})) assert.equal(environment[name],value);
    const manifestDir=path.join(root,'docs/testing/evidence/pm04-g1-quality-baseline-20261127');
    const builds={
      app:{dir:path.join(src,'frontend_jingjingshangri_app/build/web'),file:'APP_BROWSER_BUILD_MANIFEST.json'},
      vue:{dir:path.join(src,'frontend_ops_workspace/dist'),file:'VUE_BUILD_MANIFEST.json'},
    };
    for(const [surface,b] of Object.entries(builds)) {
      const bytes=await fs.readFile(path.join(manifestDir,b.file));
      const manifest=JSON.parse(bytes);
      assert.equal(manifest.source,candidate);
      for(const entry of manifest.files) assert.equal(sha(await fs.readFile(path.join(b.dir,entry.path))),entry.sha256,entry.path);
      proof.builds[surface]={sha256:sha(bytes),files:manifest.files.length};
    }
    const mysql=load('node_modules/mysql2/promise');
    control=await mysql.createConnection({host:environment.MYSQL_HOST,port:+environment.MYSQL_PORT,
      user:environment.MYSQL_USER,password:environment.MYSQL_PASSWORD,database:environment.MYSQL_DATABASE});
    const name='jx_test_qa18_a1_co_'+randomBytes(8).toString('hex');
    await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
    database=name;
    proof.database=database;
    db=await load('src/infrastructure/database').openDatabase({...environment,MYSQL_DATABASE:database,MYSQL_CONNECTION_LIMIT:'1'});
    await load('src/infrastructure/database/migrator').migrate(db);
    const [[migration]]=await db.execute("SELECT COUNT(*) count,MAX(version) last_version FROM platform_schema_migrations WHERE status='APPLIED'");
    assert.equal(Number(migration.count),225);
    proof.migration=migration;
    const seed=await load('test/support/customization-delivery.cjs').seed(db);
    const {buyer,producer,reviewer,outsider}=seed.people;
    for(const user of [producer,reviewer])await seed.grant(user,'COCREATION_REVIEW');
    const api=load('src/http/account-api').createAccountApi({db,secret:seed.secret,supplyStorageFactory:seed.storageFactory,
      tradeEnv:{CUSTOMIZATION_MERCHANT_PARTY_ID:seed.org.party_id}});
    const expiry=new Date(Date.now()+180000);
    server=http.createServer(async(req,res)=>{
      if(Date.now()>=+expiry){res.writeHead(410).end();return;}
      if(req.method!=='GET'&&!(req.method==='POST'&&req.url.startsWith('/api/v1/cocreation/'))){res.writeHead(405).end();return;}
      const u=new URL(req.url,'http://127.0.0.1');
      const match=u.pathname.match(/^\/__(app|vue)\/(.*)$/);
      if(!match){api(req,res);return;}
      const dir=builds[match[1]].dir;
      const file=path.resolve(dir,decodeURIComponent(match[2])||'index.html');
      if(!file.startsWith(dir+path.sep)){res.writeHead(403).end();return;}
      let body,ext=path.extname(file);
      try{body=await fs.readFile(file);}
      catch(error){
        if(!['ENOENT','EISDIR'].includes(error.code)||ext){res.writeHead(404).end();return;}
        body=await fs.readFile(path.join(dir,'index.html'));
        ext='.html';
      }
      res.writeHead(200,{'Content-Type':contentTypes[ext]||'application/octet-stream','Cache-Control':'no-store'}).end(body);
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const origin='http://127.0.0.1:'+server.address().port;
    const roles={buyer:{account_id:buyer.account_id,party_id:buyer.acting_party_id,bearer_token:buyer.token}};
    async function request(user,url,{party=user.acting_party_id,body,version,status=200,op=key()}={}){
      const r=await fetch(origin+'/api/v1/cocreation'+url,{method:body?'POST':'GET',headers:{
        Authorization:'Bearer '+user.token,...party?{'X-Acting-Party':party}:{},
        ...body?{'Content-Type':'application/json','Idempotency-Key':op}:{},...version?{'If-Match':'"'+version+'"'}:{},
      },...body?{body:JSON.stringify(body)}:{},signal:AbortSignal.timeout(10000)});
      const j=await r.json();
      proof.requests.push({surface:'local API',path:url,status:r.status,...j.error?{code:j.error.code}:{}});
      assert.equal(r.status,status,url+' '+j.error?.code);
      return j.data??j.error;
    }
    const ruleInput={version:'isolated-a1',source_ref:'synthetic:qa18-a1',max_people:40,extension_days:7,
      participation_terms:'Synthetic approved participation and explicit separate consent.',
      benefit:{service_code:'synthetic',description:'Synthetic only',credit_minor:1000,valid_days:30}};
    const rule=await request(producer,'/rules',{party:null,body:{rule:ruleInput}});
    await request(reviewer,'/rules/'+rule.id+'/review',{party:null,version:rule.object_version,
      body:{decision:'APPROVE',reason:'Independent synthetic review'}});
    let initial;
    const fixture=await seed.newOrder({beforeQuote:async({story})=>{
      const now=await db.withTransaction(tx=>load('src/modules/artists/context').now(tx));
      initial=await request(buyer,'/rooms',{body:{request_id:story.id,rule_id:rule.id,producer_party_id:seed.org.party_id,
        title:'Synthetic A1 continued room',deadline:new Date(Date.parse(now)+600000).toISOString(),purpose:'PRIVATE',territory:'CN'}});
    }});
    await seed.pay(fixture.order,'first');
    const url='/rooms/'+initial.id;
    async function join(user,actor){
      const room=await request(buyer,url);
      await request(buyer,url+'/invitations',{version:room.object_version,body:{person_id:actor.person.id}});
      return request(user,url+'/members',{body:{person_id:actor.person.id,cast:actor.roster.cast,
        private_story:'Synthetic own private material',material_asset_ids:actor.look.data.material_asset_ids,
        sharing_allowed:false,participation_sha256:room.participation_sha256,agreed:true}});
    }
    for(let n=0;n<9;n++){
      const user=await seed.registerActor('A1 synthetic earlier participant '+n);
      await join(user,await seed.actorCast(user));
    }
    const before=await request(buyer,url);
    assert.equal(before.counts.eligible_count,9);
    try{
      await db.execute('SET timestamp=?',[Math.floor(Date.parse(before.deadline)/1000)+1]);
      const closed=await request(buyer,url+'/close',{version:before.object_version,body:{}});
      assert.equal(closed.current_status,'UNFORMED');
      const deadline=new Date(Date.parse(closed.deadline)+86400000).toISOString();
      const opened=await request(buyer,url+'/cases',{version:closed.object_version,
        body:{kind:'EXTEND',reason:'Synthetic independent extension to enable fresh participation',new_deadline:deadline}});
      await request(reviewer,'/cases/'+opened.id+'/review',{party:null,version:opened.object_version,
        body:{decision:'APPROVE',reason:'Independent synthetic extension review'}});
      const extended=await request(buyer,url);
      assert.equal(extended.current_status,'OPEN');
      assert.equal(extended.counts.eligible_count,0);
      assert.equal(extended.deadline,deadline);
      assert.equal(extended.order_id,fixture.order.id);
      proof.records={room:initial.id,order:fixture.order.id,extension_case:opened.id,deadline};
    }finally{
      await db.execute('SET timestamp=DEFAULT');
    }
    const user=await seed.registerActor('A1 synthetic new participant after extension');
    const actor=await seed.actorCast(user);
    const joined=await join(user,actor);
    const current=await request(buyer,url);
    assert.equal(current.counts.joined_count,10);
    assert.equal(current.counts.eligible_count,1);
    assert.equal(current.order_id,fixture.order.id);
    assert.equal((await request(outsider,url,{status:404})).code,'COCREATION_NOT_FOUND');
    proof.records.fresh_member=joined.id;
    proof.observations.push({surface:'api',action:'nine_original_eligibility_expired_then_one_fresh_participant',joined:10,eligible:1,original_order_retained:true});
    const {chromium}=require(path.join(src,'frontend_ops_workspace/node_modules/playwright-core'));
    browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
    const detail='/api/v1/cocreation'+url;
    for(const surface of Object.keys(builds)){
      const ctx=await browser.newContext({viewport:surface==='app'?{width:420,height:4200}:{width:1350,height:1100},
        locale:'zh-CN',timezoneId:'Asia/Shanghai',serviceWorkers:'block'});
      await ctx.route('**/*',async route=>{
        const q=route.request(),u=new URL(q.url());
        if(['data:','blob:'].includes(u.protocol))return route.continue();
        if(u.hostname!=='127.0.0.1')return route.abort();
        if(u.pathname==='/synthetic-access.json')return route.fulfill({json:{synthetic_only:true,
          base_url:'http://127.0.0.1:5500/api/v1',expires_at:expiry.toISOString(),accounts:roles}});
        const headers=Object.fromEntries(Object.entries(q.headers()).filter(([n])=>!['host','origin','referer'].includes(n)));
        const target=u.pathname.startsWith('/api/v1/')?origin+u.pathname+u.search:origin+'/__'+surface+u.pathname+u.search;
        return route.fulfill({response:await route.fetch({url:target,headers})});
      });
      if(surface==='vue')await ctx.addInitScript(({role,expires})=>{
        sessionStorage.setItem('ops.session.token',role.bearer_token);
        sessionStorage.setItem('ops.session.selected',role.party_id);
        sessionStorage.setItem('ops.session.expires_at',expires);
      },{role:roles.buyer,expires:expiry.toISOString()});
      const page=await ctx.newPage();

      page.setDefaultTimeout(15000);
      page.on('response',response=>{
        const p=new URL(response.url()).pathname;
        if(p.startsWith('/api/v1/'))proof.requests.push({surface,path:p,status:response.status()});
      });
      const response=page.waitForResponse(r=>new URL(r.url()).pathname===detail&&r.status()===200);
      response.catch(()=>{});
      await page.goto(surface==='app'?'http://127.0.0.1:5500/?fixtureRole=buyer#/cocreation?view=room&recordId='+current.id:
        'http://127.0.0.1:5173/cocreation/rooms/'+current.id);
      if(surface==='app') await page.locator('flt-semantics-placeholder').evaluate(e=>e.click());
      const room=(await (await response).json()).data;
      assert.equal(room.id,current.id);
      assert.equal(room.counts.joined_count,10);
      assert.equal(room.counts.eligible_count,1);
      assert.equal(room.order_id,fixture.order.id);
      if(surface==='app'){
        const progress=page.locator('[aria-label*="1 / 10 人"]').first();
        try{
          await progress.waitFor({state:'attached',timeout:8000});
        }catch(error){
          await fs.writeFile(path.join(out,'app-semantics.private.txt'),await page.locator('body').ariaSnapshot());
          throw error;
        }
      }else{
        await page.getByText(/已参加\s*10\s*人\s*·\s*有效\s*1\s*人/).first().waitFor();
      }
      proof.observations.push({surface,action:'same_original_room_new_participant_count_displayed',joined:10,
        eligible:1,original_order_id:fixture.order.id});
      await store();
    }
    proof.result='PASS';
  } catch(error) {
    proof.result='FAIL';
    proof.error={name:error.name,message:error.message};
    throw error;
  } finally {
    try {
      if(browser)await browser.close();
      if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
      if(db)await db.close();
      if(database)await control.query('DROP DATABASE `'+database+'`');
      if(control)await control.end();
    } finally {
      proof.finished_at=new Date().toISOString();
      await store();
    }
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
