'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const src = path.join(root, '晶晶日上工程交接包/01_源码');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const product = '053168fb6e06b80680101702a733357309368809';
const checkout = 'e887301530c24f9751e074cd297535c3aac7cdb9';
const artifact = path.join(root, '.local/qa18/s4-a2-20261127');
const mime = {'.html':'text/html','.js':'application/javascript','.css':'text/css',
  '.json':'application/json','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml',
  '.ttf':'font/ttf','.woff2':'font/woff2'};

function vueArtifact(runDir, source, defaultGeneration='fixed'){
  if(!source)return undefined;
  assert.match(source,/^[a-f0-9]{40}$/);
  const generation=process.env.QA18_VUE_ARTIFACT||defaultGeneration;
  const artifacts={
    fixed:['vue-fixed-build','VUE_FIXED_BUILD_MANIFEST.json'],
    latest:['vue-latest-build','VUE_LATEST_BUILD_MANIFEST.json'],
    candidate:['vue-candidate-build','VUE_CANDIDATE_BUILD_MANIFEST.json'],
  };
  assert(Object.hasOwn(artifacts,generation));
  const [directory,manifest]=artifacts[generation];
  return {dir:path.resolve(path.dirname(runDir),directory),
    manifest:path.resolve(path.dirname(runDir),manifest),checkout:source,source};
}

async function openBrowser(api, roles, evidence, {vue,app} = {}) {
  assert.equal(new URL(api).hostname, '127.0.0.1');
  const expires = new Date(Date.now()+600000).toISOString();
  const builds = {
    app: app || {dir:path.join(src,'frontend_jingjingshangri_app/build/s4-a2-synthetic-web'),
      manifest:path.join(artifact,'APP_BROWSER_BUILD_MANIFEST.json'),checkout,source:product},
    vue: vue || {dir:path.join(artifact,'vue-final-build'),manifest:path.join(artifact,'VUE_BUILD_MANIFEST.json'),checkout,source:product},
  };
  evidence.served_checkout = checkout;
  evidence.builds = {};
  for(const [name,build] of Object.entries(builds)){
    const {dir} = build;
    const bytes = await fs.readFile(build.manifest);
    const manifest = JSON.parse(bytes);
    assert.equal(manifest.checkout, build.checkout);
    assert.equal(manifest.source, build.source);
    assert.equal(manifest.exit_code, 0);
    for(const entry of manifest.files) {
      assert.equal(sha(await fs.readFile(path.join(dir,entry.path))),entry.sha256,entry.path);
    }
    evidence.builds[name] = {files:manifest.files.length,sha256:sha(bytes),checkout:build.checkout,source:build.source};
  }
  const {chromium} = require(path.join(src,'frontend_ops_workspace/node_modules/playwright-core'));
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
  const ui = http.createServer((req,res)=>void serve(req,res).catch(()=>res.writeHead(500).end()));
  async function serve(req,res){
    const u = new URL(req.url,'http://127.0.0.1');
    const match = u.pathname.match(/^\/__(app|vue)\/(.*)$/);
    if(req.method!=='GET'||!match) {res.writeHead(404).end();return;}
    const base=builds[match[1]].dir;
    let asset=path.resolve(base,decodeURIComponent(match[2])||'index.html');
    assert(asset.startsWith(base+path.sep));
    let body;
    try {body=await fs.readFile(asset);} catch(error){
      if(path.extname(asset)||!['ENOENT','EISDIR'].includes(error.code)){res.writeHead(404).end();return;}
      asset=path.join(base,'index.html');
      body=await fs.readFile(asset);
    }
    res.writeHead(200,{'Content-Type':mime[path.extname(asset)]||'application/octet-stream','Cache-Control':'no-store'}).end(body);
  }
  await new Promise((ok,fail)=>{ui.once('error',fail);ui.listen(0,'127.0.0.1',ok);});
  const origin='http://127.0.0.1:'+ui.address().port;
  async function actor(surface,role,target,{anonymous=false} = {}) {
    assert(roles[role]);
    const context=await browser.newContext({viewport:surface==='app'?{width:540,height:4500}:{width:1440,height:1500},
      locale:'zh-CN',timezoneId:'Asia/Shanghai',serviceWorkers:'block'});
    await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.protocol==='data:')return route.continue();
      assert.equal(url.hostname,'127.0.0.1');
      if(url.pathname==='/synthetic-access.json') return route.fulfill({json:{
        synthetic_only:true,base_url:'http://127.0.0.1:5500/api/v1',expires_at:expires,accounts:roles}});
      const endpoint=url.pathname.startsWith('/api/v1/');
      const upstream=endpoint?new URL(api).origin+url.pathname+url.search:origin+'/__'+surface+url.pathname+url.search;
      const headers=Object.fromEntries(Object.entries(req.headers()).filter(([key])=>!['host','origin','referer','content-length'].includes(key)));
      let payload;
      try {
        const response=await fetch(upstream,{method:req.method(),headers,body:req.postDataBuffer()||undefined,signal:AbortSignal.timeout(15000)});
        const bytes=Buffer.from(await response.arrayBuffer());
        const responseHeaders=Object.fromEntries([...response.headers].filter(([key])=>
          !['content-encoding','content-length','transfer-encoding','connection'].includes(key)));
        payload={status:response.status,headers:responseHeaders,body:bytes};
        if(endpoint) {
          let data=null;
          if(responseHeaders['content-type']?.includes('json'))data=JSON.parse(bytes);
          evidence.browser_requests.push({surface,role,path:url.pathname,method:req.method(),status:response.status,
            id:data?.data?.id,state:data?.data?.current_status,error:data?.error?.code,sha256:sha(bytes)});
        }
      } catch(error) {
        if(endpoint)evidence.browser_requests.push({surface,role,path:url.pathname,transport_error:error.name});
        payload={status:502,body:'Local fixture transport failed'};
      }
      await route.fulfill(payload).catch(error=>{
        if(!/Target page, context or browser has been closed/.test(error.message))throw error;
      });
    });
    if(surface==='vue'&&!anonymous) await context.addInitScript(({u,expires})=>{
      sessionStorage.setItem('ops.session.token',u.bearer_token);
      sessionStorage.setItem('ops.session.selected',u.party_id);
      sessionStorage.setItem('ops.session.expires_at',expires);
    },{u:roles[role],expires});
    const page=await context.newPage();
    page.setDefaultTimeout(11000);
    await page.goto(surface==='app'?'http://127.0.0.1:5500/'+(anonymous?'':'?fixtureRole='+role)+'#'+target:'http://127.0.0.1:5173'+target,{waitUntil:'domcontentloaded',timeout:20000});
    if(surface==='app'){
      await page.locator('flt-semantics-placeholder').waitFor({state:'attached'});
      await page.locator('flt-semantics-placeholder').evaluate(element=>element.click());
    }
    return page;
  }
  async function close(){
    await browser.close();
    ui.closeAllConnections();
    await new Promise(resolve=>ui.close(resolve));
  }
  return {actor,close};
}
module.exports = {openBrowser,vueArtifact};
