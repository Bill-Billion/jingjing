'use strict';

// Verify the frozen product's three library entries on a read-only copy of S1 E2E-12.
const assert = require('node:assert/strict');
const { spawnSync, execFileSync } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const code = path.join(root, '晶晶日上工程交接包/01_源码');
const backend = path.join(code, 'backend_server');
const load = entry => require(path.join(backend, entry));
load('scripts/test-network-guard.cjs');
const product = '053168fb6e06b80680101702a733357309368809';
const original = 'jx_test_qa18_participation_bf744b2c1613c4fc757f';
const participation = '87b6c92c-bc3e-47d6-9c0e-ea3ba94295fd';
const project = '7620a5f1-9a07-465d-944d-b26534e90d82';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const quote = value => '`' + value + '`';
const dumpArgs = ['--single-transaction','--skip-lock-tables','--set-gtid-purged=OFF','--no-tablespaces','--hex-blob','--skip-comments','--skip-add-drop-table','--skip-extended-insert','--order-by-primary'];
const mime = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2'};

async function main() {
  const out = path.resolve(process.argv[2] || '');
  assert(out.startsWith(path.join(root, '.local/qa18') + path.sep));
  await fs.mkdir(out,{recursive:true});
  const priorPath = process.argv[3] && path.resolve(process.argv[3]);
  if(priorPath) assert(priorPath.startsWith(path.join(root,'.local/qa18')+path.sep));
  const prior = priorPath && await json(priorPath);
  if(prior) {
    assert.equal(prior.result,'PASS');
    assert.equal(prior.original,original);
    assert.equal(prior.product,product);
    assert.match(prior.clone,/^jx_test_qa18_s3b_[a-f0-9]{24}$/);
    assert(prior.data_protection.clone_tables_unchanged);
  }
  const clone = prior?.clone || 'jx_test_qa18_s3b_' + randomBytes(12).toString('hex');
  const sourceDir = path.join(root, '.local/qa18/s1-core-20261127/12-participation');
  const access = await json(path.join(sourceDir, 'access.json'));
  assert.equal(access.database, original);
  assert(access.synthetic_only && Date.parse(access.expires_at) < Date.now());
  await assert.rejects(fetch(new URL(access.base_url).origin+'/health',{signal:AbortSignal.timeout(1000)}));
  const env = await json(process.env.JX_MYSQL_TEST_ENV_FILE);
  for (const [key,value] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'})) assert.equal(env[key],value);

  const final = process.env.QA18_LIBRARY_FINAL_BUILDS === '1';
  const baseline = path.join(root, final ? '.local/qa18/s4-a2-20261127' : 'docs/testing/evidence/pm04-g1-quality-baseline-20261127');
  const appBuild = final ? 's4-a2-synthetic-web' : 'web';
  const builds = {
    app:{base:path.join(code,'frontend_jingjingshangri_app/build',appBuild),manifest:'APP_BROWSER_BUILD_MANIFEST.json'},
    web:{base:final?path.join(baseline,'vue-final-build'):path.join(code,'frontend_ops_workspace/dist'),manifest:'VUE_BUILD_MANIFEST.json'},
  };
  const evidence = {product,original,clone,scenario:prior?'old-number-unavailable-entry':'existing-business-library',started_at:new Date().toISOString(),builds:{},checks:[],requests:[]};
  for (const [surface,build] of Object.entries(builds)) {
    const bytes = await fs.readFile(path.join(baseline,build.manifest));
    const spec = JSON.parse(bytes);
    assert.equal(spec.source,product);
    if(final) {
      assert.equal(spec.checkout,'e887301530c24f9751e074cd297535c3aac7cdb9');
      evidence.served_build_checkout=spec.checkout;
    }
    for (const file of spec.files) assert.equal(sha(await fs.readFile(path.join(build.base,file.path))),file.sha256,file.path);
    evidence.builds[surface] = {manifest:build.manifest,sha256:sha(bytes),files:spec.files.length};
  }
  assert.equal(execFileSync('git',['diff','--name-only',product,'--','contracts',path.relative(root,path.join(backend,'src'))],{cwd:root,encoding:'utf8'}),'');
  evidence.source_head = execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();

  const cfg = path.join(out, '.mysql.private.ini');
  const { protectPrivateState } = require('./test-fixtures/private-state.cjs');
  assert(!/[\r\n\0]/.test(env.MYSQL_PASSWORD));
  await fs.writeFile(cfg,'',{flag:'wx'});
  await protectPrivateState(cfg);
  await fs.writeFile(cfg,'[client]\nhost=127.0.0.1\nport=33316\nuser=jx_local\npassword="'+env.MYSQL_PASSWORD.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"\n');
  const cliRoot = process.env.QA18_MYSQL_CLI_ROOT;
  const cliCfg = cliRoot ? path.join(cliRoot, path.relative(root,cfg)) : cfg;
  assert.equal(await fs.realpath(cliCfg), await fs.realpath(cfg));
  function cli(exe,args) {
    const r=spawnSync(exe,['--defaults-extra-file='+cliCfg,...args],{stdio:['ignore','pipe','pipe'],encoding:'utf8',windowsHide:true,maxBuffer:64*1024*1024,timeout:30000});
    assert.equal(r.status,0,'MYSQL_COMMAND_FAILED '+(r.stderr?.replaceAll(env.MYSQL_PASSWORD,'[redacted]').trim().slice(0,400) || r.error?.code || r.status));
    return r.stdout;
  }
  const dump = name => cli(process.env.JX_MYSQLDUMP_EXE,[...dumpArgs,name]);
  const census = async db => {
    const [tables] = await db.execute('SHOW TABLES');
    const map = {};
    for (const row of tables) {
      const table = Object.values(row)[0];
      assert.match(table,/^[a-z0-9_]+$/);
      const [rows] = await db.execute('SELECT * FROM '+quote(table));
      map[table] = {rows:rows.length,sha256:sha(JSON.stringify(rows.map(r=>JSON.stringify(r)).sort()))};
    }
    return map;
  };
  let db, server, browser;
  try {
    const sql = dump(original);
    assert(!/^\s*(?:(?:CREATE|DROP)\s+DATABASE|USE\s+)/im.test(sql));
    evidence.original_sql_sha256 = sha(sql);
    if(prior) {
      assert.equal(prior.original_sql_sha256,evidence.original_sql_sha256);
      evidence.reused_library_clone=true;
    } else {
      const mysql = load('node_modules/mysql2/promise');
      const admin = await mysql.createConnection({host:env.MYSQL_HOST,port:+env.MYSQL_PORT,user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:'jx_dev'});
      try {await admin.query('CREATE DATABASE '+quote(clone)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');}
      finally {await admin.end();}
      assert(!/^\s*DELIMITER/im.test(sql));
      const importer=await mysql.createConnection({host:env.MYSQL_HOST,port:+env.MYSQL_PORT,user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:clone,multipleStatements:true});
      try {await importer.query(sql);}
      finally {await importer.end();}
      const canonical = require('./qa18-batch-backup.cjs').canonicalDump;
      assert.equal(canonical(dump(clone)),canonical(sql));
      evidence.clone_initial_sql_matches = true;
    }
    db = await load('src/infrastructure/database').openDatabase({...env,MYSQL_DATABASE:clone});
    const before = await census(db);
    console.log('Protected original and initialized isolated read-only database');
    const [[edition]] = await db.execute("SELECT id FROM project_records WHERE project_id=? AND kind='EDITION'",[project]);
    const [[agreement]] = await db.execute("SELECT id FROM finance_records WHERE kind='AGREEMENT'");
    assert(edition?.id && agreement?.id);
    const roles = {};
    const secret = randomBytes(32).toString('base64');
    const security = load('src/modules/auth/security').createSecurity(secret);
    const now = Date.now(), expires = new Date(now+600000).toISOString();
    for (const role of ['artist','outsider']) {
      const u = access.accounts[role];
      const token = randomBytes(32).toString('base64url');
      await db.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms,authenticated_ms) VALUES(?,?,?,?)',[security.digest('token',token),u.account_id,Date.parse(expires),now]);
      roles[role] = {bearer_token:token,party_id:u.party_id,account_id:u.account_id};
    }
    const beforeReads = await census(db);
    assert.equal(beforeReads.auth_sessions.rows,before.auth_sessions.rows+2);
    for (const [table,rows] of Object.entries(before)) if(table!=='auth_sessions') assert.deepEqual(beforeReads[table],rows);
    const api = load('src/http/account-api').createAccountApi({db,secret});
    server = http.createServer(async(req,res)=>{
      if(req.method!=='GET' || Date.now()>=Date.parse(expires)){res.writeHead(req.method==='GET'?410:405).end();return;}
      const u = new URL(req.url,'http://127.0.0.1');
      const match = u.pathname.match(/^\/__(app|web)\/(.*)$/);
      if (!match) {api(req,res);return;}
      const base = builds[match[1]].base;
      let file = path.resolve(base,decodeURIComponent(match[2])||'index.html');
      if (!file.startsWith(base+path.sep)) {res.writeHead(403).end();return;}
      let bytes;
      try {bytes=await fs.readFile(file);} catch(e) {
        if(!['ENOENT','EISDIR'].includes(e.code)||path.extname(file)){res.writeHead(404).end();return;}
        file=path.join(base,'index.html');
        bytes=await fs.readFile(file);
      }
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(bytes);
    });
    await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
    const origin = 'http://127.0.0.1:'+server.address().port, baseUrl=origin+'/api/v1';
    const routeSpecs = [
      {name:'contracts',source:'PARTICIPATION_CONTRACTS',id:participation,domain:'PROJECTS',detail:'/projects/records/'+participation,button:'查看原约定'},
      {name:'works',source:'PROJECT_EDITIONS',id:edition.id,domain:'PROJECTS',detail:'/projects/records/'+edition.id,button:'回到原业务'},
      {name:'income',source:'FINANCE',id:agreement.id,domain:'FINANCE',detail:'/finance/records/'+agreement.id,button:'回到原业务'},
    ];
    async function get(role,url,expected=200) {
      const u=roles[role];
      const r=await fetch(baseUrl+url,{headers:{Authorization:'Bearer '+u.bearer_token,'X-Acting-Party':u.party_id},signal:AbortSignal.timeout(10000)});
      const bytes=Buffer.from(await r.arrayBuffer());
      evidence.requests.push({role,surface:'api',path:url,status:r.status,sha256:sha(bytes)});
      assert.equal(r.status,expected,url);
      return JSON.parse(bytes).data;
    }
    for (const spec of prior?[]:routeSpecs) {
      const browse='/me/business/'+spec.name+'?source='+spec.source;
      const list=(await get('artist',browse)).sections.find(s=>s.source===spec.source);
      spec.item=list.items.find(x=>x.record_id===spec.id);
      assert(spec.item, spec.name+' original item missing');
      assert.deepEqual(spec.item.target,{domain:spec.domain,record_id:spec.id});
      const detail=await get('artist',spec.detail);
      assert.equal(spec.item.current_status,detail.current_status);
      const foreign=(await get('outsider',browse)).sections.find(s=>s.source===spec.source);
      assert(!foreign.items.some(x=>x.record_id===spec.id));
      evidence.checks.push({surface:'api',name:spec.name,id:spec.id,status:spec.item.current_status,income:spec.item.income});
    }
    if(!prior) {
      const income=routeSpecs.at(-1).item.income;
      assert.deepEqual([income.accrued_minor,income.verified_paid_minor,income.pending_minor],[16000,0,16000]);
      assert.equal(income.bank_arrival_verified,false);
    }
    assert.equal((await fetch(baseUrl+'/me/business/contracts',{method:'POST'})).status,405);

    console.log('Verified original API lists, read targets, and income');
    const {chromium}=require(path.join(code,'frontend_ops_workspace/node_modules/playwright-core'));
    browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
    for (const surface of ['app','web']) {
      const ctx=await browser.newContext({viewport:surface==='app'?{width:420,height:5500}:{width:1440,height:1100},locale:'zh-CN',timezoneId:'Asia/Shanghai',serviceWorkers:'block'});
      await ctx.route('**/*',async route=>{
        const q=route.request(),u=new URL(q.url());
        if(u.protocol==='data:') return route.continue();
        assert.equal(u.hostname,'127.0.0.1');
        if(u.pathname==='/synthetic-access.json') return route.fulfill({json:{synthetic_only:true,base_url:'http://127.0.0.1:5500/api/v1',expires_at:expires,accounts:roles}});
        const headers=Object.fromEntries(Object.entries(q.headers()).filter(([k])=>!['host','origin','referer'].includes(k)));
        const target = u.pathname.startsWith('/api/v1/') ? origin+u.pathname+u.search : origin+'/__'+surface+u.pathname+u.search;
        // Read via an independent bounded transport. Closing a page cannot cancel a shared
        // Playwright request context while another routed asset is being served.
        let payload;
        try {
          const response = await fetch(target,{headers,signal:AbortSignal.timeout(12000)});
          const responseHeaders = Object.fromEntries([...response.headers].filter(([key])=>
            !['content-encoding','content-length','transfer-encoding','connection'].includes(key)));
          payload = {status:response.status,headers:responseHeaders,body:Buffer.from(await response.arrayBuffer())};
        } catch(error) {
          console.error('Fixture route failed',surface,u.pathname,error.name);
          payload={status:502,body:'Local fixture transport failed'};
        }
        await route.fulfill(payload).catch(error=>{
          if(!/Target page, context or browser has been closed/.test(error.message)) throw error;
        });
      });
      if(surface==='web') await ctx.addInitScript(({role,expires})=>{
        sessionStorage.setItem('ops.session.token',role.bearer_token);
        sessionStorage.setItem('ops.session.selected',role.party_id);
        sessionStorage.setItem('ops.session.expires_at',expires);
      },{role:roles.artist,expires});
      if(prior) {
        const page=await ctx.newPage();
        const writes=[];
        page.setDefaultTimeout(12000);
        page.on('request',q=>{if(q.method()!=='GET'&&new URL(q.url()).pathname.startsWith('/api/v1/')) writes.push(new URL(q.url()).pathname);});
        try {
          const current=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/me/phone-changes/current');
          current.catch(()=>{});
          await page.goto(surface==='app'?'http://127.0.0.1:5500/?fixtureRole=artist#/account/phone-change':'http://127.0.0.1:5173/me/phone-change');
          if(surface==='app') await page.locator('flt-semantics-placeholder').evaluate(e=>e.click());
          const response=await current;
          assert.equal(response.status(),200);
          evidence.requests.push({surface,path:new URL(response.url()).pathname,status:response.status(),sha256:sha(await response.body())});
          const button=surface==='app'
            ? page.getByRole('button',{name:'原手机号不可用，申请人工核查',exact:true})
            : page.getByRole('link',{name:'旧号码无法收短信，提交人工核查',exact:true});
          await button.click();
          await page.getByRole('textbox',{name:'标题',exact:true}).waitFor();
          await page.getByRole('textbox',{name:'问题说明',exact:true}).waitFor();
          assert.deepEqual(writes,[]);
          evidence.checks.push({surface,name:'old-phone-unavailable-opens-support-without-changing-binding',api_writes:0});
        } catch(e) {
          evidence.failure={surface,group:'old-number-unavailable',message:e.message};
          await fs.writeFile(path.join(out,surface+'-failed.aria.txt'),await page.locator('body').ariaSnapshot({timeout:2000}).catch(()=>''),'utf8');
          throw e;
        } finally {await page.close();}
      }
      for(const spec of prior?[]:routeSpecs){
        const page=await ctx.newPage();
        const label=surface+'-'+spec.name;
        console.log('Checking '+label);
        page.setDefaultTimeout(12000);
        try {
          const pageUrl=surface==='app'?'http://127.0.0.1:5500/?fixtureRole=artist#/library?section='+spec.name:'http://127.0.0.1:5173/me/business/'+spec.name;
          const listing=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/me/business/'+spec.name);
          listing.catch(()=>{});
          await page.goto(pageUrl,{waitUntil:'domcontentloaded',timeout:20000});
          if(surface==='app'){
            await page.locator('flt-semantics-placeholder').evaluate(e=>e.click());
          }
          const r=await listing;
          assert.equal(r.status(),200);
          const bytes=await r.body();
          const body=JSON.parse(bytes);
          assert(body.data.sections.find(x=>x.source===spec.source).items.some(x=>x.record_id===spec.id));
          evidence.requests.push({surface,path:new URL(r.url()).pathname,status:r.status(),sha256:sha(bytes)});
          const item=surface==='web'?page.getByTestId('personal-item-'+spec.domain+':'+spec.id):page.locator('body');
          if(spec.name==='income'){
            const facts=[['已入账应计','已入账应计金额','¥160.00'],['已核验净支付','核验净支付','¥0.00'],['账面待付','账面待付','¥160.00']];
            const incomeBlock = surface==='app' ? page.getByRole('group',{name:/^已登记的收入核算 已登记的收入核算/}) : null;
            if(incomeBlock) await incomeBlock.waitFor();
            for(const [webLabel,appLabel,value] of facts) {
              if(surface==='web') {
                const row=item.getByText(webLabel,{exact:true}).locator('..');
                assert.equal(await row.locator('dd').innerText(),value);
              } else {
                const snapshot=await incomeBlock.ariaSnapshot();
                assert(snapshot.includes(appLabel+': '+value),appLabel+' '+value);
              }
            }
          }
          const orderedItems = body.data.sections.flatMap(section=>section.items);
          const index = orderedItems.findIndex(value=>value.record_id===spec.id);
          assert(index>=0);
          const button=surface==='web'?item.getByTestId('personal-open-'+spec.domain+':'+spec.id):page.getByRole('button',{name:spec.button,exact:true}).nth(index);
          await button.waitFor();
          const detail=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1'+spec.detail);
          detail.catch(()=>{});
          await button.click();
          const response=await detail;
          assert.equal(response.status(),200);
          const returned=await response.body();
          assert.equal(JSON.parse(returned).data.id,spec.id);
          evidence.requests.push({surface,path:new URL(response.url()).pathname,status:response.status(),sha256:sha(returned)});
          evidence.checks.push({surface,name:spec.name,id:spec.id,status:spec.item.current_status,income:spec.item.income});
        } catch(e) {
          evidence.failure={surface,group:spec.name,message:e.message};
          await fs.writeFile(path.join(out,label+'-failed.aria.txt'),await page.locator('body').ariaSnapshot({timeout:2000}).catch(()=>''),'utf8');
          throw e;
        } finally {await page.close();}
      }
      await ctx.close();
    }
    assert.deepEqual(await census(db),beforeReads,'READONLY_HTTP_CHANGED_CLONE');
    assert.equal(sha(dump(original)),evidence.original_sql_sha256,'ORIGINAL_DATABASE_CHANGED');
    evidence.data_protection={tables:Object.keys(before).length,read_only_requests:true,original_sql_unchanged:true,clone_tables_unchanged:true,only_added_clone_session_rows:2};
    evidence.result='PASS';
  } catch(e){evidence.result='FAIL';evidence.failure??={message:e.message};throw e;}
  finally {
    if(browser) await browser.close();
    if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
    await db?.close();
    await fs.unlink(cfg);
    evidence.finished_at=new Date().toISOString();
    await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(evidence,null,2)+'\n');
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
