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
    const name='jx_test_qa18_a1_portrait_'+randomBytes(8).toString('hex');
    await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
    database=name;
    proof.database=database;
    db=await load('src/infrastructure/database').openDatabase({...environment,MYSQL_DATABASE:database});
    await load('src/infrastructure/database/migrator').migrate(db);
    const [[migration]]=await db.execute("SELECT COUNT(*) count,MAX(version) last_version FROM platform_schema_migrations WHERE status='APPLIED'");
    assert.equal(Number(migration.count),225);
    proof.migration=migration;
    const seed=await load('test/helpers/directory-seed.cjs').seedDirectory(db);
    const {seller,buyer,reviewer}=seed,old=seed.publicListing;
    const subject={person_id:seller.person.id,party_id:seller.personal_party_id};
    const assets=load('src/modules/works/assets').createSupplyAssets({db,storageFactory:seed.storageFactory,
      repository:load('src/modules/artists/assets').createArtistAssetsRepository(db,{resolvePrincipal:seed.resolvePrincipal})});
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGOca2LDQApgIkn1qIZRDUNKAwBqVAEt5sxbDAAAAABJRU5ErkJggg==','base64');
    const asset=await assets.upload(seller.ctx,{...subject,purpose:'AVATAR_MATERIAL',media_type:'image/png',body:png,operation_key:key()});
    const look=await seed.artists.createVariant(seller.ctx,{...subject,avatar_id:seed.avatar.id,kind:'LOOK',
      variant:{previous_version_id:old.data.look_version_id,display_name:'Synthetic isolated portrait',
        material_asset_ids:[asset.id],consent_id:seed.publicConsent.id},operation_key:key()});
    let listing=await seed.artists.submitListing(seller.ctx,{...subject,avatar_id:seed.avatar.id,
      listing:{display_name:'QA Synthetic Portrait A1',city:old.data.city,introduction:old.data.introduction,
        tags:old.data.tags,consent_id:seed.publicConsent.id,look_version_id:look.id,voice_version_id:null,
        audition_public:false,preview_asset_ids:[asset.id],primary_portrait_asset_id:asset.id},operation_key:key()});
    listing=await seed.artists.review(reviewer.ctx,{person_id:subject.person_id,record_id:listing.id,
      expected_version:listing.object_version,decision:'APPROVE',reason:'Synthetic separate reviewer',operation_key:key()});
    proof.records={listing:listing.id,asset:asset.id,consent:seed.publicConsent.id,asset_sha256:sha(png)};

    const api=load('src/http/account-api').createAccountApi({db,secret:seed.secret,supplyStorageFactory:seed.storageFactory});
    const expiry=new Date(Date.now()+120000);
    const withdrawPath='/api/v1/artists/people/'+subject.person_id+'/records/'+seed.publicConsent.id+'/withdrawals';
    server=http.createServer(async(req,res)=>{
      if(Date.now()>=+expiry){res.writeHead(410).end();return;}
      if(req.method!=='GET'&&!(req.method==='POST'&&req.url===withdrawPath)){res.writeHead(405).end();return;}
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
    const roles={buyer:{account_id:buyer.account_id,party_id:buyer.personal_party_id,bearer_token:buyer.token}};
    const {chromium}=require(path.join(src,'frontend_ops_workspace/node_modules/playwright-core'));
    browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
    const pages={};
    const detail='/api/v1/artists/catalog/'+listing.id;
    const filePath=detail+'/assets/'+asset.id+'/content';
    const title=listing.data.display_name;
    for(const surface of Object.keys(builds)){
      const ctx=await browser.newContext({viewport:surface==='app'?{width:420,height:2300}:{width:1350,height:1100},
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
      pages[surface]=page;
      page.setDefaultTimeout(15000);
      page.on('response',response=>{
        const p=new URL(response.url()).pathname;
        if(p.startsWith('/api/v1/'))proof.requests.push({surface,path:p,status:response.status()});
      });
      const loaded=page.waitForResponse(r=>new URL(r.url()).pathname===filePath&&r.status()===200);
      loaded.catch(()=>{});
      await page.goto(surface==='app'?'http://127.0.0.1:5500/?fixtureRole=buyer#/artists/public?listingId='+listing.id:
        'http://127.0.0.1:5173/artists/catalog/'+listing.id);
      if(surface==='app') await page.locator('flt-semantics-placeholder').evaluate(e=>e.click());
      assert.equal(sha(await (await loaded).body()),sha(png));
      if(surface==='vue'){
        await page.getByText(title,{exact:true}).first().waitFor();
        await page.getByRole('link',{name:'准备向本艺人发出邀约',exact:true}).waitFor();
        await page.getByRole('img',{name:title+'已获准的主肖像',exact:true}).waitFor();
      } else {
        await page.locator('[aria-label="'+title+'的获准公开主肖像"]').first().waitFor({state:'attached'});
        await page.getByRole('button',{name:'重新核对公开资料',exact:true}).waitFor();
      }
      proof.observations.push({surface,action:'displayed_current_approved_portrait',file_sha256:sha(png)});
      await store();
    }
    const withdrawal=await fetch(origin+withdrawPath,{method:'POST',headers:{Authorization:'Bearer '+seller.token,
      'X-Acting-Party':subject.party_id,'Idempotency-Key':key(),'If-Match':'"'+seed.publicConsent.object_version+'"',
      'Content-Type':'application/json'},body:JSON.stringify({reason:'Synthetic owner withdraws the originally approved public portrait'})});
    assert.equal(withdrawal.status,200);
    assert.equal((await withdrawal.json()).data.current_status,'WITHDRAWN');
    proof.observations.push({surface:'api',action:'owner_withdrew_original_public_consent',status:200});
    await store();
    for(const [surface,page] of Object.entries(pages)){
      const rejected=page.waitForResponse(r=>new URL(r.url()).pathname===detail&&r.status()===409);
      rejected.catch(()=>{});
      const button=page.getByRole('button',{name:surface==='app'?'重新核对公开资料':'重新读取主肖像与公开资料',exact:true});
      await button.click();
      assert.equal((await (await rejected).json()).error.code,'ARTIST_CONSENT_REQUIRED');
      if(surface==='app'){
        await page.locator('[aria-label="'+title+'的获准公开主肖像"]').first().waitFor({state:'detached'});
      } else {
        await page.getByText(title,{exact:true}).first().waitFor({state:'detached'});
        assert.equal(await page.getByRole('link',{name:'准备向本艺人发出邀约',exact:true}).count(),0);
        assert.equal(await page.locator('img[src^="blob:"]').count(),0);
      }
      proof.observations.push({surface,action:'existing_page_reread_then_removed_old_portrait',status:409});
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
