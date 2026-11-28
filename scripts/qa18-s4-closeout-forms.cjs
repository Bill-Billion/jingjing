'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID,randomBytes}=require('node:crypto');
const {load,root,read}=require('./test-fixtures/qa18-s4-delta-clone.cjs');
const {openBrowser}=require('./test-fixtures/qa18-s4-artifact-browser.cjs');
const base=path.join(root,'.local/qa18/s4-a-closeout-20261128');
const out=path.resolve(process.argv[2]||'');
const categories=[
  ['romance','爱情'],['family','家族亲情'],['biography','个人人生与传记'],['enterprise','创业史'],
  ['pet','宠物'],['wedding','婚礼'],['holiday','节日与走量模板'],['other','其他'],
];

async function main(){
  assert(out.startsWith(base+path.sep));
  await fs.mkdir(out,{recursive:true});
  await fs.writeFile(path.join(out,'RUN_ONCE'),'frozen original category matrix with isolated templates',{flag:'wx'});
  const e={categories:categories.map(([,name])=>name),source:'docs/sources/contracts-20261029/extracted/13.md',
    started_at:new Date().toISOString(),browser_requests:[],checks:[]};
  const save=()=>fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(e,null,2)+'\n');
  const env=await read(process.env.JX_MYSQL_TEST_ENV_FILE);
  for(const [k,v] of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
  const mysql=load('node_modules/mysql2/promise');
  const control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
  const name='jx_test_qa18_form_'+randomBytes(10).toString('hex');
  let db,browser,server,page,created=false;
  try{
    await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
    created=true;
    db=await load('src/infrastructure/database').openDatabase({...env,MYSQL_DATABASE:name});
    await load('src/infrastructure/database/migrator').migrate(db);
    e.database=name;
    const seed=await load('test/support/customization-delivery.cjs').seed(db);
    const {buyer,producer}=seed.people;
    const roles={buyer:{account_id:buyer.account_id,bearer_token:buyer.token,party_id:buyer.personal_party_id}};
    const seeds=[];
    for(const [code,label] of categories){
      const labelText=label+'的原始故事';
      const common='备注，只在合成环境使用';
      const variant='story_'+code;
      const tpl=await seed.stories.publishTemplate(producer.ctx,{category_code:'qa18_'+code,template_version:1,
        template_snapshot:{title:label+'表单机测',description:'原合同品类的隔离模板',
          fields:[{key:variant,label:labelText,type:'TEXT',required:true,max_length:1000},
          {key:'notes',label:common,type:'TEXT',required:false,max_length:1000}]},source_ref:'synthetic:contract13-category',operation_key:randomUUID()});
      seeds.push({code,label,labelText,variant,id:tpl.template_version_id,marker:'合成已保存备注 '+code});
    }
    server=load('src/http/account-api').createAccountApi({db,secret:seed.secret}).listen(0,'127.0.0.1');
    await new Promise((ok,fail)=>{server.once('listening',ok);server.once('error',fail);});
    const api='http://127.0.0.1:'+server.address().port+'/api/v1';
    const appDir=path.join(base,'app-isolated-final'),vueDir=path.join(root,'.local/qa18/s4-a-remaining-20261128/builds/vue-stock');
    async function build(dir){const m=await read(dir+'.json');return {dir,manifest:dir+'.json',checkout:m.checkout,source:m.source};}
    browser=await openBrowser(api,roles,e,{app:await build(appDir),vue:await build(vueDir)});
    for(const t of seeds){
      const own='/operations/customization/mine/';
      page=await browser.actor('vue','buyer',own+'new');
      await page.locator('#story-category').selectOption(t.id);
      assert(await page.locator('#story-answers-'+t.variant).isVisible());
      assert.equal(await page.locator('[id^=story-answers-story_]').count(),1);
      await page.locator('#story-answers-notes').fill(t.marker);
      const update=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/customization-requests'&&r.request().method()==='POST',{timeout:12000});
      update.catch(()=>{});
      await page.getByTestId('story-save').click();
      const saved=await update;
      assert.equal(saved.status(),200);
      const result=(await saved.json()).data;
      assert.equal(result.current_status,'DRAFT');
      assert.equal(result.template_version_id,t.id);
      const uri='/api/v1/customization-requests/'+result.id;
      await page.waitForURL(u=>u.pathname.endsWith('/'+result.id));
      await page.locator('.story-check input').check();
      await page.getByTestId('story-submit').click();
      const invalid=page.locator('#story-answers-'+t.variant);
      assert.equal(await invalid.getAttribute('aria-invalid'),'true');
      assert((await page.locator('#story-error-'+t.variant).textContent()).trim().length>0);
      assert.equal(await page.locator('#story-answers-notes').inputValue(),t.marker);
      assert(!e.browser_requests.some(r=>r.surface==='vue'&&r.method==='POST'&&r.path===uri+'/submissions'));
      await page.context().close();

      page=await browser.actor('app','buyer','/customization/request?requestId='+result.id);
      const field=page.getByRole('textbox',{name:new RegExp(t.labelText)});
      await field.waitFor();
      const fields=page.getByRole('textbox');
      assert.equal(await fields.count(),2);
      const note=fields.nth(1);
      await note.click();
      assert(await note.inputValue()===t.marker,'App did not restore the original draft text');
      await note.press('Tab');
      await page.getByRole('button',{name:'提交给制作专员',exact:true}).click();
      const aria=await page.locator('body').ariaSnapshot();
      assert(aria.includes(t.labelText)&&aria.includes('这一项尚未填写。'),aria.slice(0,500));
      assert(!e.browser_requests.some(r=>r.surface==='app'&&r.method==='POST'&&r.path===uri+'/submissions'));
      assert(e.browser_requests.some(r=>r.surface==='app'&&r.method==='GET'&&r.path===uri&&r.status===200));
      e.checks.push({category:t.label,template:t.id,draft:result.id,vue_persisted_draft:true,app_restored_original:true,both_require_current_field:true});
      await save();
      await page.context().close();
    }
    assert.equal(e.checks.length,8);
    e.result='PASS';
  }catch(error){
    e.result='FAIL';e.failure=error.message;
    if(page)await fs.writeFile(path.join(out,'FORM.aria.txt'),await page.locator('body').ariaSnapshot().catch(()=>''));
    throw error;
  }finally{
    try{
      await browser?.close();
      if(server){server.closeAllConnections();await new Promise(ok=>server.close(ok));}
      await db?.close();
      if(created&&/^jx_test_qa18_form_[a-f0-9]{20}$/.test(name))await control.query('DROP DATABASE '+mysql.escapeId(name));
    }finally{await control.end();e.finished_at=new Date().toISOString();await save();}
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
