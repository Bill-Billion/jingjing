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
    const finalBuilds=process.env.QA18_USE_S4_A2_BUILDS==='true';
    const manifestDir=path.join(root,finalBuilds
      ? '.local/qa18/s4-a2-20261127'
      : 'docs/testing/evidence/pm04-g1-quality-baseline-20261127');
    const builds={
      app:{dir:path.join(src,'frontend_jingjingshangri_app/build',finalBuilds?'s4-a2-synthetic-web':'web'),
        file:'APP_BROWSER_BUILD_MANIFEST.json'},
      vue:{dir:finalBuilds?path.join(manifestDir,'vue-final-build'):path.join(src,'frontend_ops_workspace/dist'),
        file:'VUE_BUILD_MANIFEST.json'},
    };
    for(const [surface,b] of Object.entries(builds)) {
      const bytes=await fs.readFile(path.join(manifestDir,b.file));
      const manifest=JSON.parse(bytes);
      assert.equal(manifest.source,candidate);
      if(finalBuilds){
        assert.match(manifest.checkout,/^[a-f0-9]{40}$/);
        execFileSync('git',['diff','--quiet',manifest.checkout,proof.checkout,'--',
          '晶晶日上工程交接包/01_源码','contracts'],{cwd:root});
        proof.served_build_checkout=manifest.checkout;
      }
      for(const entry of manifest.files) assert.equal(sha(await fs.readFile(path.join(b.dir,entry.path))),entry.sha256,entry.path);
      proof.builds[surface]={sha256:sha(bytes),files:manifest.files.length};
    }
    const mysql=load('node_modules/mysql2/promise');
    control=await mysql.createConnection({host:environment.MYSQL_HOST,port:+environment.MYSQL_PORT,
      user:environment.MYSQL_USER,password:environment.MYSQL_PASSWORD,database:environment.MYSQL_DATABASE});
    const name='jx_test_qa18_a1_staff_'+randomBytes(8).toString('hex');
    await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
    database=name;
    proof.database=database;
    db=await load('src/infrastructure/database').openDatabase({...environment,MYSQL_DATABASE:database});
    await load('src/infrastructure/database/migrator').migrate(db);
    const [[migration]]=await db.execute("SELECT COUNT(*) count,MAX(version) last_version FROM platform_schema_migrations WHERE status='APPLIED'");
    assert.equal(Number(migration.count),225);
    proof.migration=migration;
    const seed=await load('test/helpers/auditions-seed.cjs').seedAuditions(db);
    const {seller,reviewer,buyer2:employee,outsider:owner}=seed;
    const person=seller.person.id, party=seller.personal_party_id;
    const org=await seed.parties.createOrganization(owner.ctx,{display_name:'Synthetic A1 scoped agency',operation_key:key()});
    await db.execute("INSERT INTO party_capabilities(party_id,code,current_status) VALUES (?,'MCN','ACTIVE')",[org.party_id]);
    const membership=await seed.parties.inviteMember(owner.ctx,{party_id:org.party_id,invitee_account_id:employee.account_id,
      expires_at:new Date(Date.now()+3600000).toISOString(),operation_key:key()});
    await seed.parties.respondInvitation(employee.ctx,{party_id:org.party_id,invitation_id:membership.invitation_id,
      expected_version:1,decision:'ACCEPT',operation_key:key()});
    const evidence=await seed.supply.upload(owner.ctx,{party_id:org.party_id,purpose:'CONSENT_EVIDENCE',
      media_type:'text/plain',body:Buffer.from('Synthetic A1 agency agreement'),operation_key:key()});
    const gigs=load('src/modules/gigs/repository').createGigsRepository(db,{resolvePrincipal:seed.resolvePrincipal});
    let relation=await gigs.relation(owner.ctx,{party_id:org.party_id,artist_party_id:party,scope:'COMMERCIAL',
      valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',exclusive:false,
      terms:'Only synthetic A1 authority',commission:{platform_bps:0,mcn_bps:0},evidence_asset_ids:[evidence.id],operation_key:key()});
    relation=await gigs.relationDecision(seller.ctx,{record_id:relation.id,party_id:party,expected_version:relation.object_version,
      decision:'ACCEPT',reason:'Owned A1 artist approves agency',operation_key:key()});
    const mandate=await seed.artists.createDelegation(seller.ctx,{person_id:person,party_id:party,delegation:{
      organization_party_id:org.party_id,relation_id:relation.id,actions:['READ_PROFILE','MANAGE_MATERIALS'],
      valid_from:relation.data.valid_from,valid_until:relation.data.valid_until,evidence_asset_ids:[seed.evidence.id],
      terms:'Only synthetic profile and material actions'},operation_key:key()});
    const engagement=load('src/modules/engagement/repository').createEngagementRepository(db,{resolvePrincipal:seed.resolvePrincipal});
    const grant=await engagement.staffGrant(owner.ctx,{party_id:org.party_id,account_id:employee.account_id,
      person_ids:[person],actions:['READ_PROFILE','MANAGE_MATERIALS'],valid_until:relation.data.valid_until,operation_key:key()});
    const assets=load('src/modules/works/assets').createSupplyAssets({db,storageFactory:seed.storageFactory,
      repository:load('src/modules/artists/assets').createArtistAssetsRepository(db,{resolvePrincipal:seed.resolvePrincipal})});
    const bytes=Buffer.from('Synthetic A1 protected private material. No personal data.');
    const material=await assets.upload(employee.ctx,{person_id:person,party_id:org.party_id,purpose:'AVATAR_MATERIAL',
      media_type:'text/plain',body:bytes,operation_key:key()});
    const pending=await seed.artists.declareConsent(seller.ctx,{person_id:person,party_id:party,avatar_id:seed.avatar.id,
      consent:{features:['FACE'],purposes:['PRIVATE_ARCHIVE'],grantee_party_id:party,territories:['WORLDWIDE'],
        valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',terms:'Synthetic owner permits own archival material',
        evidence_asset_ids:[seed.evidence.id]},operation_key:key()});
    const consent=await seed.artists.review(reviewer.ctx,{person_id:person,record_id:pending.id,expected_version:pending.object_version,
      decision:'APPROVE',reason:'Independent synthetic rights review',operation_key:key()});
    const record=await seed.artists.createVariant(employee.ctx,{person_id:person,party_id:org.party_id,avatar_id:seed.avatar.id,kind:'LOOK',
      variant:{previous_version_id:null,display_name:'A1 Private Material Record',material_asset_ids:[material.id],
        consent_id:consent.id},operation_key:key()});
    proof.records={person,org:org.party_id,mandate:mandate.id,grant:grant.id,record:record.id,material:material.id,sha256:sha(bytes)};
    const api=load('src/http/account-api').createAccountApi({db,secret:seed.secret,supplyStorageFactory:seed.storageFactory});
    const expiry=new Date(Date.now()+120000);
    const withdrawPath='/api/v1/engagement/mcn/staff/'+grant.id+'/revoke';
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
    const roles={employee:{account_id:employee.account_id,party_id:org.party_id,bearer_token:employee.token}};
    const {chromium}=require(path.join(src,'frontend_ops_workspace/node_modules/playwright-core'));
    browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
    const pages={};
    const personPath='/api/v1/artists/people/'+person;
    const detail=personPath+'/records/'+record.id;
    const filePath='/api/v1/artists/assets/'+material.id+'/content';
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
      },{role:roles.employee,expires:expiry.toISOString()});
      const page=await ctx.newPage();
      pages[surface]=page;
      page.setDefaultTimeout(15000);
      page.on('response',response=>{
        const p=new URL(response.url()).pathname;
        if(p.startsWith('/api/v1/'))proof.requests.push({surface,path:p,status:response.status()});
      });
      const details=page.waitForResponse(r=>new URL(r.url()).pathname===detail&&r.status()===200);
      details.catch(()=>{});
      await page.goto(surface==='app'?'http://127.0.0.1:5500/?fixtureRole=employee#/artists/record?personId='+person+'&recordId='+record.id:
        'http://127.0.0.1:5173/artists/people/'+person+'/records/'+record.id);
      if(surface==='app') await page.locator('flt-semantics-placeholder').evaluate(e=>e.click());
      assert.equal((await (await details).json()).data.id,record.id);
      const loaded=page.waitForResponse(r=>new URL(r.url()).pathname===filePath&&r.status()===200);
      loaded.catch(()=>{});
      if(surface==='vue'){
        const panel=page.getByTestId('artists-materials');
        await panel.locator('summary').click();
        await panel.getByTestId('artists-asset-reference').fill(material.id);
        await panel.getByRole('button',{name:'读取本次获准材料信息',exact:true}).click();
        await panel.getByRole('button',{name:'重新核权读取',exact:true}).click();
        await page.getByTestId('artists-preview').waitFor();
      } else {
        await page.getByRole('button').filter({hasText:/下载/}).first().click();
      }
      assert.equal(sha(await (await loaded).body()),sha(bytes));
      proof.observations.push({surface,action:'opened_same_record_and_received_scoped_file',sha256:sha(bytes)});
      await store();
    }
    const revoke=await fetch(origin+withdrawPath,{method:'POST',headers:{Authorization:'Bearer '+owner.token,
      'X-Acting-Party':org.party_id,'Idempotency-Key':key(),'If-Match':'"'+grant.object_version+'"',
      'Content-Type':'application/json'},body:JSON.stringify({reason:'End current synthetic employee authority'})});
    assert.equal(revoke.status,200);
    assert.equal((await revoke.json()).data.current_status,'REVOKED');
    proof.observations.push({surface:'api',action:'agency_revoked_exact_employee_grant',status:200});
    await store();
    for(const [surface,page] of Object.entries(pages)){
      const denied=page.waitForResponse(r=>[detail,personPath].includes(new URL(r.url()).pathname)&&r.status()===403);
      denied.catch(()=>{});
      if(surface==='app')await page.getByRole('button',{name:'重新读取当前记录',exact:true}).click();
      else await page.getByTestId('artists-refresh').click();
      await denied;
      if(surface==='app') await page.getByRole('button').filter({hasText:/下载/}).first().waitFor({state:'detached'});
      else{
        await page.getByTestId('artists-record').waitFor({state:'detached'});
        await page.getByTestId('artists-preview').waitFor({state:'detached'});
      }
      proof.observations.push({surface,action:'existing_record_refresh_denied_and_private_controls_cleared',status:403});
      await store();
    }
    for(const [user,scope,status] of [[employee,org.party_id,403],[seller,party,200]]){
      const res=await fetch(origin+filePath,{headers:{Authorization:'Bearer '+user.token,'X-Acting-Party':scope}});
      assert.equal(res.status,status);
      if(status===200)assert.equal(sha(Buffer.from(await res.arrayBuffer())),sha(bytes));
      proof.observations.push({surface:'api',action:status===200?'owner_still_has_original_file':'former_employee_old_file_denied',status});
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
