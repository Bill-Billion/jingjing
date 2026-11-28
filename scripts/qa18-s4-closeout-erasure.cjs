'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID,randomBytes} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {load,root,hash,read} = require('./test-fixtures/qa18-s4-delta-clone.cjs');
const {openBrowser} = require('./test-fixtures/qa18-s4-artifact-browser.cjs');

const runRoot=path.join(root,'.local/qa18/s4-a-closeout-20261128');
const artifacts=path.join(root,'.local/qa18/s4-a-remaining-20261128/builds');
const pathSource='330c739c99a3efc7e18b089e685d67a7cdb86ded';
const vueSource='c4b1347b327862d2ab557cc10b624e8bf86163ee';
const out=path.resolve(process.argv[2]||'');
const appPathOverride=process.argv[3]&&path.resolve(process.argv[3]);
const appSource=process.argv[4]||pathSource;

async function main(){
  assert(out.startsWith(runRoot+path.sep));
  await fs.mkdir(out,{recursive:true});
  await fs.writeFile(path.join(out,'RUN_ONCE'),'isolated synthetic deletion recovery',{flag:'wx'});
  const e={checkout:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
    tested_app:appSource,tested_vue:vueSource,started_at:new Date().toISOString(),requests:[],browser_requests:[],checks:[]};
  const save=()=>fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(e,null,2)+'\n');
  const conf=await read(process.env.JX_MYSQL_TEST_ENV_FILE);
  for(const [k,v] of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_DATABASE:'jx_dev'}))assert.equal(conf[k],v);
  const mysql=load('node_modules/mysql2/promise');
  const control=await mysql.createConnection({host:conf.MYSQL_HOST,port:Number(conf.MYSQL_PORT),user:conf.MYSQL_USER,password:conf.MYSQL_PASSWORD,database:conf.MYSQL_DATABASE});
  const database='jx_test_qa18_erasure_'+randomBytes(10).toString('hex');
  let db,server,browser,created=false;
  try{
    await control.query('CREATE DATABASE '+mysql.escapeId(database)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
    created=true;
    db=await load('src/infrastructure/database').openDatabase({...conf,MYSQL_DATABASE:database});
    await load('src/infrastructure/database/migrator').migrate(db);
    const [[schema]]=await db.execute("SELECT COUNT(*) n,MAX(version) newest FROM platform_schema_migrations WHERE status='APPLIED'");
    assert.deepEqual([Number(schema.n),Number(schema.newest)],[225,225]);
    e.database=database;
    e.migrations=Number(schema.n);
    const seed=await load('test/support/customization-delivery.cjs').seed(db);
    const {buyer,producer,reviewer,outsider}=seed.people;
    for(const p of [producer,reviewer])for(const permission of ['PRIVACY_HANDLE','PRIVACY_REVIEW'])await seed.grant(p,permission);
    const roles=Object.fromEntries(Object.entries(seed.people).map(([k,p])=>[k,{account_id:p.account_id,party_id:p.acting_party_id,bearer_token:p.token}]));
    const cast=await seed.actorCast(buyer);
    const used=cast.look.data.material_asset_ids[0];
    const free=await seed.upload(buyer,'AVATAR_MATERIAL');
    const [[subject]]=await db.execute('SELECT object_key,content_sha256 FROM supply_assets WHERE id=?',[free.id]);
    const {createRuleContent}=load('src/modules/governance/content');
    async function testRule(rule_key,terms){
      const id=randomUUID(),content=createRuleContent({id,rule_key,version:id,terms});
      await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)',
        [id,rule_key,id,JSON.stringify(content),'2020-01-01 00:00:00',producer.account_id,'EFFECTIVE']);
      return id;
    }
    const retention=await testRule('privacy.retention',{privacy_retention:{categories:[{scope:'TRANSACTIONS',basis:'合成验收留存依据',max_review_days:30}]}});
    const policy=await testRule('privacy.execution',{privacy_execution:{actions:['FILE_ERASURE'],basis:'隔离测试用已审分类政策',
      contact_reference:'synthetic:pm04',backup_strategy:'REAPPLY_ERASURE_REGISTER_BEFORE_ACCESS',retention_rule_id:retention}});
    let erasures=0;
    const storageFactory=()=>({...seed.storageFactory(),identity:{provider_code:'aliyun-oss',environment:'SANDBOX'},
      inspect:()=>({implemented:true,configured:true,config_revision:'synthetic-s4-erasure'}),
      async eraseCurrent(key,sha){
        assert.equal(key,subject.object_key);
        assert.equal(sha,subject.content_sha256);
        const data=seed.files.get(key);
        if(data)assert.equal(hash(data),sha);
        seed.files.delete(key);
        erasures++;
        if(erasures===1)throw new Error('synthetic provider has erased the object but its reply was lost');
        return {key,current_object_absent:true,scope:'CURRENT_OBJECT_ONLY'};
      }});
    server=load('src/http/account-api').createAccountApi({db,secret:seed.secret,supplyStorageFactory:storageFactory}).listen(0,'127.0.0.1');
    await new Promise((ok,fail)=>{server.once('listening',ok);server.once('error',fail);});
    const base='http://127.0.0.1:'+server.address().port+'/api/v1';
    async function request(role,route,{body,status=200,version,key=randomUUID()}={}){
      const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+roles[role].bearer_token,
        ...body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':key},
        ...version?{'If-Match':'"'+version+'"'}:{}},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
      const bytes=Buffer.from(await r.arrayBuffer()),json=JSON.parse(bytes);
      e.requests.push({role,route,status:r.status,code:json.error?.code,sha256:hash(bytes)});
      await save();
      assert.equal(r.status,status,route+' '+json.error?.code);
      return json.data||json.error;
    }
    const req=await request('buyer','/privacy/requests',{body:{type:'DELETE',scopes:['ARTIST_MATERIALS'],details:'本人在隔离环境按依赖逐件核对删除申请'}});
    const route='/privacy/requests/'+req.id;
    const ops='/privacy/operations/requests/'+req.id;
    const options=await request('buyer',route+'/file-options?kind=FILE');
    const dependent=options.items.find(x=>x.id===used);
    assert(dependent?.dependencies.some(d=>d.code==='ARTIST_ARCHIVE'));
    assert.equal(options.items.find(x=>x.id===free.id).disposition,'READY_FOR_REVIEW');
    await request('outsider',route+'/file-options?kind=FILE',{status:404});
    const proposal={action:'FILE_ERASURE',target_id:free.id,policy_rule_id:policy,details:{reason:'清除该独立合成对象，无历史原件处置'}};
    await request('buyer',route+'/executions',{body:{...proposal,target_id:used},version:req.object_version,status:409});
    const pending=await request('buyer',route+'/executions',{body:proposal,version:req.object_version});
    e.business={request:req.id,execution:pending.id,free_file:free.id,retained_file:used,policy,provider:'synthetic current-object-only'};
    await save();
    const app={dir:appPathOverride||path.join(artifacts,'app-license-verified'),
      manifest:appPathOverride?appPathOverride+'.json':path.join(artifacts,'app-license-verified.json'),checkout:appSource,source:appSource};
    const vue={dir:path.join(artifacts,'vue-stock'),manifest:path.join(artifacts,'vue-stock.json'),checkout:vueSource,source:vueSource};
    browser=await openBrowser(base,roles,e,{app,vue});
    const appPath='/privacy?view=request&recordId='+req.id;
    async function visit(surface,role,target,step,check){
      const page=await browser.actor(surface,role,target);
      try{
        await page.waitForLoadState('networkidle');
        await check(page);
      }catch(error){
        const snapshot=await page.locator('body').ariaSnapshot({timeout:1800}).catch(()=>'');
        await fs.writeFile(path.join(out,step+'.aria.txt'),snapshot);
        throw error;
      } finally {await page.context().close();}
    }
    const review={decision:'APPROVE',reason:'独立确认当前对象及已审留存范围',
      proposal_sha256:pending.proposal_sha256,scope_verified:true,retention_verified:true};
    await request('buyer',ops+'/executions/'+pending.id+'/review',{body:review,version:pending.object_version,status:403});
    await visit('app','buyer',appPath,'dependency',async page=>{
      const aria=await page.locator('body').ariaSnapshot();
      assert(aria.includes('当前对象')&&aria.includes('需复核'));
      assert(e.browser_requests.some(x=>x.surface==='app'&&x.path===('/api/v1'+route+'/file-options')&&x.status===200));
      e.checks.push({app:true,object_and_dependency:true});
    });
    const vuePath='/privacy/reviews/'+req.id+'?action=execution-review';
    async function waitReply(page,uri){
      return page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/v1'+uri,{timeout:12000});
    }
    await visit('vue','reviewer',vuePath,'review',async page=>{
      await page.locator('article').filter({hasText:pending.id}).getByRole('button',{name:'查看与办理',exact:true}).click();
      await page.getByRole('button',{name:'另一岗位独立核验执行方案',exact:true}).click();
      const sealed=page.locator('#execution-review-proposal_sha256');
      await sealed.waitFor();
      assert.equal(await sealed.inputValue(),pending.proposal_sha256);
      const decision=page.locator('#execution-review-decision');
      await decision.selectOption('APPROVE');
      await page.locator('#execution-review-reason').fill(review.reason);
      for(const [k,v] of [['proposal_sha256',pending.proposal_sha256],['scope_verified',true],['retention_verified',true]]){
        const input=page.locator('#execution-review-'+k);
        if(await input.isVisible()&&await input.isEnabled()){
          if(v===true)await input.check();else assert.equal(await input.inputValue(),v);
        }
      }
      await page.getByLabel('已阅读当前记录与本次约定，明确提交上述办理事项。',{exact:true}).check();
      const response=waitReply(page,ops+'/executions/'+pending.id+'/review');
      response.catch(()=>{});
      await page.getByTestId('business-execution-review').click();
      const r=await response;
      assert.equal(r.status(),200);
      assert.equal((await r.json()).data.current_status,'APPROVED');
      e.checks.push({vue:true,review_role_distinct:true,independent_approval:pending.id});
    });
    const getExecution=async()=> (await request('buyer',route+'/executions')).items.find(x=>x.id===pending.id);
    const approved=await getExecution();
    assert.equal(approved.current_status,'APPROVED');
    const execute=route+'/executions/'+pending.id+'/execute';
    let replay;
    await visit('app','buyer',appPath,'confirm',async page=>{
      const response=waitReply(page,execute);
      response.catch(()=>{});
      await page.getByRole('button',{name:'本人确认删除这份原始素材',exact:true}).click();
      await page.getByRole('button',{name:'本人明确确认',exact:true}).click();
      const r=await response;
      assert.equal(r.status(),200);
      assert.equal((await r.json()).data.current_status,'QUEUED');
      replay=r.request().headers()['idempotency-key'];
      assert(replay);
      e.checks.push({app_explicit_confirmation:true,queued:pending.id});
    });
    const jobs=load('src/infrastructure/jobs/repository').createJobRepository(db);
    const handler=load('src/modules/privacy/erasure').createPrivacyHandlers(db,{storageFactory}).get('PRIVACY_FILE_ERASURE');
    let job=await jobs.claim('synthetic-s4-worker',60000);
    assert.equal(job.payload_ref,pending.id);
    const blocked=await handler.execute(job);
    assert.equal(blocked.status,'BLOCKED');
    await jobs.finish(job,blocked);
    assert(!seed.files.has(subject.object_key));
    const failed=await getExecution();
    assert.equal(failed.current_status,'QUEUED');
    assert.equal(failed.job_status,'BLOCKED');
    await visit('app','buyer',appPath,'failure',async page=>{
      const aria=await page.locator('body').ariaSnapshot();
      assert(aria.includes('处理服务')&&aria.includes('处理服务受阻，待工作人员核对原请求'));
      assert(!aria.includes('本项已执行，核对下方结果'));
      e.checks.push({same_app_request_pending_after_failed_provider:true});
    });
    await jobs.manualRetry(job.id,{actor_ref:'synthetic-independent-operator',reason_ref:'synthetic:original-current-object',additional_attempts:1});
    job=await jobs.claim('synthetic-s4-worker',60000);
    assert.equal(job.payload_ref,pending.id);
    const restored=await handler.recover(job);
    assert.equal(restored.status,'SUCCEEDED');
    await jobs.finish(job,restored);
    const current=await getExecution();
    assert.equal(current.current_status,'EXECUTED');
    assert.equal(current.result.versions_and_backups,'REVIEW_REQUIRED');
    const replayResult=await request('buyer',execute,{body:{confirmed:true},version:approved.object_version,key:replay});
    assert.equal(replayResult.id,pending.id);
    assert.equal(erasures,2);
    await visit('app','buyer',appPath,'recovered',async page=>{
      const aria=await page.locator('body').ariaSnapshot();
      assert(aria.includes('本项已执行，核对下方结果'));
      assert(aria.includes('当前存储对象已确认不可读'));
      assert(!aria.includes('CURRENT_OBJECT_ABSENT'));
      assert(aria.includes('备份'));
      e.checks.push({same_app_case_current_object_recovered:true,job:job.id,replay_same_execution:true,against_original_version:approved.object_version});
    });
    await request('outsider',route+'/executions',{status:404});
    assert.notEqual((await request('buyer',route)).current_status,'COMPLETED');
    const [[duplicated]]=await db.execute("SELECT COUNT(*) n FROM privacy_events WHERE request_id=? AND event_code='CURRENT_OBJECT_ERASED'",[req.id]);
    assert.equal(Number(duplicated.n),1);
    const [[retained]]=await db.execute('SELECT current_status FROM supply_assets WHERE id=?',[used]);
    assert.equal(retained.current_status,'READY');
    e.result='PASS';
  }catch(error){e.result='FAIL';e.failure=error.message;throw error;}
  finally{
    try{
      await browser?.close();
      if(server){server.closeAllConnections();await new Promise(ok=>server.close(ok));}
      await db?.close();
      if(created&&/^jx_test_qa18_erasure_[a-f0-9]{20}$/.test(database))await control.query('DROP DATABASE '+mysql.escapeId(database));
    }finally{
      await control.end();
      e.finished_at=new Date().toISOString();
      await save();
    }
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
