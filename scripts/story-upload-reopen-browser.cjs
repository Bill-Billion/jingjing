"use strict";
// Disposable loopback browser check. No tokens or private configuration in evidence.
const fs = require('node:fs/promises'), path = require('node:path'), { pathToFileURL } = require('node:url');
const { randomUUID:key, randomBytes } = require('node:crypto'), assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..'), backend = path.join(root,'晶晶日上工程交接包/01_源码/backend_server'), web = path.join(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace');
require(path.join(backend,'scripts/test-network-guard.cjs'));
const mysql = require(path.join(backend,'node_modules/mysql2/promise'));
async function main() {
  const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
  for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
  if(!process.env.CHROME_PATH)throw Error('CHROME_PATH_REQUIRED');
  const name='jx_test_browser_story_'+randomBytes(6).toString('hex'), out=path.join(root,'.local/story-drawer-review-browser');await fs.mkdir(out,{recursive:true});
  const control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
  let db,api,vite,browser,page,phase='setup';const checks=[],errors=[];
  try {
    await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
    db=await require(path.join(backend,'src/infrastructure/database')).openDatabase({...env,MYSQL_DATABASE:name});await require(path.join(backend,'src/infrastructure/database/migrator')).migrate(db);
    const f=await require(path.join(backend,'test/support/customization-delivery.cjs')).seed(db),buyer=f.people.buyer;
    const template=await require(path.join(backend,'src/modules/customization/free-creation')).publish(f.stories,f.people.producer.ctx,{template_version:1,source_ref:'synthetic:browser-reopen',operation_key:key()});
    const story=await f.stories.create(buyer.ctx,{party_id:buyer.personal_party_id,template_version_id:template.template_version_id,answers:{story:'合成故事：检查上传失败后返回并重开'},operation_key:key()});
    let fail=true;
    const storageFactory=()=>({async put(input){if(fail){fail=false;throw Object.assign(Error('synthetic one-time write failure'),{code:'PROVIDER_CALL_FAILED',status:503});}return f.storageFactory().put(input);},getBuffer:async k=>f.files.get(k)});
    api=require(path.join(backend,'src/http/account-api')).createAccountApi({db,secret:f.secret,supplyStorageFactory:storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>api.once('listening',r));
    const apiOrigin='http://127.0.0.1:'+api.address().port;
    const {createServer}=await import(pathToFileURL(path.join(web,'node_modules/vite/dist/node/index.js')).href);
    const vue=(await import(pathToFileURL(path.join(web,'node_modules/@vitejs/plugin-vue/dist/index.mjs')).href)).default;
    vite=await createServer({root:web,configFile:false,logLevel:'error',plugins:[vue()],resolve:{alias:{'@':path.join(web,'src')}},server:{host:'127.0.0.1',port:0,fs:{allow:[path.dirname(web)]},proxy:{'/api':{target:apiOrigin,changeOrigin:false}}}});await vite.listen();
    const origin='http://127.0.0.1:'+vite.httpServer.address().port;
    browser=await require(path.join(web,'node_modules/playwright-core')).chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
    const context=await browser.newContext({viewport:{width:1280,height:900},locale:'zh-CN'});
    await context.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||['data:','blob:'].includes(u.protocol)?route.continue():route.abort();});
    await context.addInitScript(({token,party})=>{sessionStorage.setItem('ops.session.token',token);sessionStorage.setItem('ops.session.selected',party);},{token:buyer.token,party:buyer.personal_party_id});
    page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
    let dialogs=0;page.on('dialog',async dialog=>{dialogs++;await dialog.accept();});
    const base='/operations/customization/mine';
    async function list(){const res=await fetch(apiOrigin+'/api/v1/customization-requests/'+story.id+'/attachments?include_retention=true',{headers:{Authorization:'Bearer '+buyer.token,'X-Acting-Party':buyer.personal_party_id}});assert.equal(res.status,200);return (await res.json()).data.items;}
    phase='upload';await page.goto(origin+base+'/'+story.id);await page.locator('input[type=file]').waitFor();
    const data=Buffer.from('Synthetic browser recovery file; no real personal data.');
    await page.locator('input[type=file]').setInputFiles({name:'synthetic-reopen.txt',mimeType:'text/plain',buffer:data});
    const initial=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/attachments?'));
    initial.catch(()=>{});
    await page.getByRole('button',{name:'上传并关联本次文件',exact:true}).click();
    assert.equal((await initial).status(),503);await page.getByRole('link',{name:'先返回我的故事',exact:true}).waitFor();
    const before=await list();assert.equal(before.length,1);assert.equal(before[0].current_status,'UPLOADING');checks.push({name:'文件写入失败',status:'PASS',asset_id:before[0].id,current_status:before[0].current_status,rows:1});
    await page.screenshot({path:path.join(out,'01-pending.png'),fullPage:true});
    phase='leave';await page.getByRole('link',{name:'先返回我的故事',exact:true}).click();
    await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'继续核对',exact:true}).click();
    assert.equal(page.url(),origin+base+'/'+story.id);
    await page.getByRole('link',{name:'先返回我的故事',exact:true}).click();await page.getByRole('dialog').waitFor();
    await page.screenshot({path:path.join(out,'02-leave-confirmation.png'),fullPage:true});
    await page.getByRole('button',{name:'暂时离开',exact:true}).click();await page.waitForURL(origin+base);assert.equal(dialogs,0);
    phase='reopen';const row=page.getByTestId('story-list').locator('tr').filter({hasText:story.id});await row.getByRole('link',{name:'继续填写',exact:true}).click();await page.waitForURL(origin+base+'/'+story.id);
    await page.getByRole('button',{name:'核对附件记录',exact:true}).waitFor();checks.push({name:'确认离开后从列表重开',status:'PASS',story_id:story.id,native_dialogs:dialogs,page_confirmation_cancel_and_accept:true});
    await page.screenshot({path:path.join(out,'02-reopened.png'),fullPage:true});
    phase='cross-business';
    await page.getByRole('searchbox',{name:'查找工作区入口'}).fill('真人与数字人');
    await page.getByRole('link',{name:'真人与数字人',exact:true}).click();
    await page.getByRole('button',{name:'暂时离开',exact:true}).click();await page.waitForURL(origin+'/artists/people');
    await page.getByTestId('artists-party').waitFor();await page.waitForFunction(()=>!document.querySelector('[data-testid=artists-party]')?.disabled);
    await page.goBack();await page.waitForURL(origin+base+'/'+story.id);
    await page.getByRole('button',{name:'核对附件记录',exact:true}).waitFor();
    assert.equal((await list())[0].id,before[0].id);
    checks.push({name:'从分类导航切到艺人页再返回，原附件请求仍可恢复',status:'PASS',story_id:story.id,asset_id:before[0].id});
    phase='recover';await page.getByRole('button',{name:'核对附件记录',exact:true}).click();
    const restored=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/attachments?'));
    restored.catch(()=>{});
    await page.getByRole('button',{name:'恢复原附件请求',exact:true}).click();assert.equal((await restored).status(),200);
    const after=await list();assert.equal(after.length,1);assert.equal(after[0].id,before[0].id);assert.equal(after[0].current_status,'READY');assert.equal(after[0].content_sha256,before[0].content_sha256);assert.equal(after[0].byte_size,data.length);
    checks.push({name:'恢复原请求，文件内容和记录数量一致',status:'PASS',asset_id:after[0].id,current_status:after[0].current_status,content_sha256:after[0].content_sha256,rows:1});
    phase='save';const saved=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().endsWith('/customization-requests/'+story.id));saved.catch(()=>{});await page.getByTestId('story-save').click();const reply=await saved;assert.equal(reply.status(),200);const current=(await reply.json()).data;assert.equal(current.answers.material,after[0].id);assert.equal(current.current_status,'DRAFT');
    checks.push({name:'保存后仍是私人草稿',status:'PASS',story_id:story.id,asset_id:current.answers.material});
    await page.screenshot({path:path.join(out,'03-restored-saved.png'),fullPage:true});assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(out,'RESULTS.json'),JSON.stringify({synthetic_only:true,frontend_commit:'2761ca903ce580171f87d626a921e79543762b19',checks,page_errors:errors},null,2));
    console.log(JSON.stringify({result:'PASS',checks:checks.length,story_id:story.id,asset_id:after[0].id}));
  } catch(error) {
    if(page){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});await fs.writeFile(path.join(out,'failure.txt'),await page.locator('body').innerText().catch(()=>''));}
    await fs.writeFile(path.join(out,'FAILURE.json'),JSON.stringify({phase,error:error.message,checks},null,2));throw error;
  } finally {
    if(browser)await browser.close();if(vite)await vite.close();if(api)await new Promise(r=>{api.close(r);api.closeAllConnections();});
    if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();
    await fs.writeFile(path.join(out,'CLEANUP.json'),JSON.stringify({disposable_database_removed:true,loopback_services_closed:true}));
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
