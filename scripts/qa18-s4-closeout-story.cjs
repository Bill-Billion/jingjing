'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID,randomBytes} = require('node:crypto');
const {load,root,hash,read} = require('./test-fixtures/qa18-s4-delta-clone.cjs');
const {openBrowser} = require('./test-fixtures/qa18-s4-artifact-browser.cjs');
const runDir=path.join(root,'.local/qa18/s4-a-closeout-20261128');
const out=path.resolve(process.argv[2]||'');

async function main(){
  assert(out.startsWith(runDir+path.sep));
  await fs.mkdir(out,{recursive:true});
  await fs.writeFile(path.join(out,'RUN_ONCE'),'synthetic member loses old story access',{flag:'wx'});
  const e={started_at:new Date().toISOString(),requests:[],browser_requests:[],checks:[]};
  const save=()=>fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(e,null,2)+'\n');
  const conf=await read(process.env.JX_MYSQL_TEST_ENV_FILE);
  for(const [k,v] of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_DATABASE:'jx_dev'}))assert.equal(conf[k],v);
  const mysql=load('node_modules/mysql2/promise');
  const control=await mysql.createConnection({host:conf.MYSQL_HOST,port:Number(conf.MYSQL_PORT),user:conf.MYSQL_USER,password:conf.MYSQL_PASSWORD,database:conf.MYSQL_DATABASE});
  const database='jx_test_qa18_storyloss_'+randomBytes(10).toString('hex');
  let db,server,browser,created=false,page;
  try{
    await control.query('CREATE DATABASE '+mysql.escapeId(database)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
    created=true;
    db=await load('src/infrastructure/database').openDatabase({...conf,MYSQL_DATABASE:database});
    await load('src/infrastructure/database/migrator').migrate(db);
    e.database=database;
    const seed=await load('test/support/customization-delivery.cjs').seed(db);
    const {buyer:owner,outsider:staff,artist:neighbor,producer}=seed.people;
    const org=await seed.parties.createOrganization(owner.ctx,{display_name:'合成受控故事机构',operation_key:randomUUID()});
    for(const actor of [staff,neighbor]){
      const inv=await seed.parties.inviteMember(owner.ctx,{party_id:org.party_id,invitee_account_id:actor.account_id,
        expires_at:new Date(Date.now()+3600000).toISOString(),operation_key:randomUUID()});
      await seed.parties.respondInvitation(actor.ctx,{party_id:org.party_id,invitation_id:inv.invitation_id,
        expected_version:1,decision:'ACCEPT',operation_key:randomUUID()});
    }
    // The existing company fixture represents approval. Membership removal goes through its real product API.
    await db.execute("UPDATE parties SET current_status='ACTIVE' WHERE id=?",[org.party_id]);
    const marker='隔离仅供本次制作的私人原稿';
    const template=await seed.stories.publishTemplate(producer.ctx,{category_code:'synthetic_closeout_story',
      template_version:1,template_snapshot:{title:'合成受控故事',description:'仅隔离合成',fields:[{key:'story',label:'原始故事',type:'TEXT',required:true,max_length:1000}]},
      source_ref:'synthetic:s4-closeout',operation_key:randomUUID()});
    const story=await seed.stories.create(staff.ctx,{party_id:org.party_id,template_version_id:template.template_version_id,
      answers:{story:marker},operation_key:randomUUID()});
    const roles=Object.fromEntries(Object.entries({owner,staff,neighbor}).map(([k,p])=>[k,
      {account_id:p.account_id,party_id:org.party_id,bearer_token:p.token}]));
    const api=load('src/http/account-api').createAccountApi({db,secret:seed.secret,supplyStorageFactory:seed.storageFactory});
    server=api.listen(0,'127.0.0.1');
    await new Promise((ok,fail)=>{server.once('listening',ok);server.once('error',fail);});
    const base='http://127.0.0.1:'+server.address().port+'/api/v1';
    async function http(role,uri,{body,version,method=body?'POST':'GET',acting=true}={}){
      const r=await fetch(base+uri,{method,headers:{Authorization:'Bearer '+roles[role].bearer_token,
        ...acting?{'X-Acting-Party':org.party_id}:{},...body?{'Content-Type':'application/json','Idempotency-Key':randomUUID(),'If-Match':'"'+version+'"'}:{}},
        ...body?{body:JSON.stringify(body)}:{},signal:AbortSignal.timeout(10000)});
      const raw=Buffer.from(await r.arrayBuffer()),j=JSON.parse(raw);
      e.requests.push({role,uri,status:r.status,code:j.error?.code,id:j.data?.id,sha256:hash(raw)});
      return {status:r.status,data:j.data};
    }
    const uri='/customization-requests/'+story.id;
    assert.equal((await http('staff',uri)).data.answers.story,marker);
    assert.equal((await http('owner',uri)).status,404);
    assert.equal((await http('neighbor',uri)).status,404);
    const current=await db.execute("SELECT object_version FROM party_memberships WHERE party_id=? AND account_id=?",[org.party_id,staff.account_id]);
    const membershipVersion=current[0][0].object_version;
    const appDir=path.join(runDir,'app-isolated-final'),vueDir=path.join(root,'.local/qa18/s4-a-remaining-20261128/builds/vue-stock');
    const artifact=async dir=>{const m=await read(dir+'.json');return {dir,manifest:dir+'.json',source:m.source,checkout:m.checkout};};
    let hold=false,resume,captured=0;
    const gate=new Promise(resolve=>{resume=resolve;});
    browser=await openBrowser(base,roles,e,{app:await artifact(appDir),vue:await artifact(vueDir),
      beforeResponse:async r=>{if(hold&&r.role==='staff'&&r.path==='/api/v1'+uri&&r.status===200){captured++;await gate;}}});
    const views=await Promise.all(['app','vue'].map(async surface=>({surface,page:await browser.actor(surface,'staff',
      surface==='app'?'/customization/request?requestId='+story.id:'/operations/customization/mine/'+story.id)})));
    async function privateVisible(p){
      const aria=await p.locator('body').ariaSnapshot();
      if(aria.includes(marker))return true;
      const matches=await p.locator('input,textarea,[contenteditable=true]').evaluateAll((fields,value)=>
        fields.some(field=>field.value===value||field.textContent===value),marker);
      return matches;
    }
    const refresh=({page:p,surface})=>p.getByRole('button',{name:surface==='app'?'重新读取当前进度':'刷新当前记录',exact:true});
    try{
      for(const v of views){
        page=v.page;
        await page.waitForLoadState('networkidle');
        if(v.surface==='app')await page.getByRole('textbox',{name:/原始故事/}).click();
        assert(await privateVisible(page),'The original author did not see the actual story before revocation on '+v.surface);
        assert(await refresh(v).isEnabled());
      }
      hold=true;
      await Promise.all(views.map(v=>refresh(v).click()));
      for(let i=0;captured<2&&i<34;i++)await new Promise(resolve=>setTimeout(resolve,150));
      assert.equal(captured,2,'Both browser refreshes should have received the old network response before revocation');
      const revocation='/parties/'+org.party_id+'/members/'+staff.account_id;
      const revoke=await http('owner',revocation,{body:{},version:membershipVersion,method:'DELETE'});
      assert.equal(revoke.status,200);
      assert.equal(revoke.data.current_status,'REVOKED');
      const rejected=await http('staff',uri);
      assert([403,404].includes(rejected.status));
      hold=false;
      // The late replies are released after a fresh current-identity navigation. It must not show the earlier data.
      await Promise.all(views.map(v=>v.page.reload({waitUntil:'domcontentloaded'})));
      resume();
      const newPhase=e.browser_requests.length;
      for(const v of views){
        page=v.page;
        if(v.surface==='app'){
          const semantics=page.locator('flt-semantics-placeholder');
          await semantics.waitFor({state:'attached'});
          await semantics.evaluate(e=>e.click());
        }
        await page.waitForLoadState('networkidle');
        assert.equal(await privateVisible(page),false);
        assert(!e.browser_requests.slice(newPhase).some(r=>r.surface===v.surface&&r.status===200&&r.path==='/api/v1'+uri),
          'The revoked identity must not restore the original story');
        e.checks.push({surface:v.surface,revoked_author_cannot_restore_old_story:true,same_story:story.id,late_read_was_inflight:true});
      }
    }finally{resume();}
    const publicRecommendation=await http('neighbor','/discovery/recommendations?kind=NOTICE',{acting:false});
    assert([200,403].includes(publicRecommendation.status));
    assert(!JSON.stringify(publicRecommendation.data||{}).includes(marker));
    e.checks.push({recommendation_status:publicRecommendation.status,private_story_not_reused:true});
    e.result='PASS';
  }catch(error){
    e.result='FAIL';e.failure=error.message;
    if(page)await fs.writeFile(path.join(out,'story.aria.txt'),await page.locator('body').ariaSnapshot().catch(()=>''));
    throw error;
  }finally{
    try{
      await browser?.close();
      if(server){server.closeAllConnections();await new Promise(ok=>server.close(ok));}
      await db?.close();
      if(created&&/^jx_test_qa18_storyloss_[a-f0-9]{20}$/.test(database))await control.query('DROP DATABASE '+mysql.escapeId(database));
    }finally{await control.end();e.finished_at=new Date().toISOString();await save();}
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
