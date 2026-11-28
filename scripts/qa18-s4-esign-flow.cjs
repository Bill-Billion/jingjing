'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {cloneRecords,load,root,read,hash}=require('./test-fixtures/qa18-s4-delta-clone.cjs');
const {openBrowser}=require('./test-fixtures/qa18-s4-artifact-browser.cjs');

const baseDir=path.join(root,'.local/qa18/s4-a-remaining-20261128');
const out=path.resolve(process.argv[2]||'');
const mode=process.argv[3]||'api';
const version=process.argv[4];
const source='jx_test_qa18_privacy_170df71eb1fc4e2a6be5';
const order='fe55f52f-670d-4a04-a362-3fc45dc3095e';
const scenarios=['SUCCESS','FAILURE','TIMEOUT_THEN_SUCCESS'];
const normalApp=mode==='browsers'&&process.env.QA18_ESIGN_CLIENTS==='normal';

async function main(){
  assert(out.startsWith(baseDir+path.sep));
  assert(['api','browsers'].includes(mode));
  await fs.mkdir(out,{recursive:true});
  await fs.writeFile(path.join(out,'RUN_ONCE'),mode,{flag:'wx'});
  const evidence={mode,checkout:version,started_at:new Date().toISOString(),requests:[],browser_requests:[],checks:[]};
  const save=()=>fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(evidence,null,2)+'\n');
  let clone,browser;
  const servers=new Set();
  try{
    clone=await cloneRecords({source,directory:path.join(root,'.local/qa18/s1-core-20261127/11-privacy'),
      out,actors:['buyer','producer','reviewer','outsider'],proof:evidence,restoreFiles:false});
    const {db,roles,secret}=clone;
    const config=await read(process.env.JX_MYSQL_TEST_ENV_FILE);
    const env={...config,MYSQL_DATABASE:evidence.clone,JX_ESIGN_SIMULATOR_ENABLED:'true'};
    const factory=load('src/testing/esign-simulator').createESignSimulator;
    for(const wrong of [{NODE_ENV:'production'},{JX_ESIGN_SIMULATOR_ENABLED:'false'},
      {MYSQL_HOST:'10.0.0.1'},{MYSQL_PORT:3306},{MYSQL_DATABASE:source},{HOST:'0.0.0.0'}]){
      await assert.rejects(factory(db,{...env,...wrong}),{code:'SIMULATOR_REQUIRES_ISOLATED_TEST'});
    }
    const simulator=await factory(db,env);
    const createAccountApi=load('src/http/account-api').createAccountApi;
    async function start(extra){
      const server=createAccountApi({db,secret,...extra}).listen(0,'127.0.0.1');
      servers.add(server);
      await new Promise((ok,fail)=>{server.once('listening',ok);server.once('error',fail);});
      return server;
    }
    function addr(server){return 'http://127.0.0.1:'+server.address().port+'/api/v1';}
    async function stop(server){
      server.closeAllConnections();
      await new Promise(resolve=>server.close(resolve));
      servers.delete(server);
    }
    const codes=new Map();
    const syntheticPhone='13800138000';
    const sms={async call(method,{phone,code},{request_id}){
      assert(normalApp&&method==='send'&&phone===syntheticPhone);
      codes.set(request_id,code);
      return {accepted:true};
    }};
    if(normalApp){
      const security=load('src/modules/auth/security').createSecurity(secret);
      await db.execute('UPDATE auth_subjects SET account_id=NULL WHERE account_id=?',[roles.buyer.account_id]);
      await db.execute('INSERT INTO auth_subjects(phone_hash,account_id) VALUES (?,?)',
        [security.digest('phone',syntheticPhone),roles.buyer.account_id]);
    }
    let server=await start({sandboxSigning:simulator,...normalApp?{sms}:{}});
    async function call(role,method,route,status,{key=randomUUID(),body={},at=server,party}={}){
      const actor=roles[role];
      const response=await fetch(addr(at)+route,{method,headers:{Authorization:'Bearer '+actor.bearer_token,
        'X-Acting-Party':party||actor.party_id,...method==='POST'?{'Content-Type':'application/json','Idempotency-Key':key}:{}},
        body:method==='POST'?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});
      const raw=Buffer.from(await response.arrayBuffer());
      const result=JSON.parse(raw);
      evidence.requests.push({role,method,route,http:response.status,code:result.error?.code,
        state:result.data?.receipt?.current_status,receipt:result.data?.receipt?.id,sha256:hash(raw)});
      await save();
      assert.equal(response.status,status,route+' '+result.error?.code);
      return result.data||result.error;
    }

    const grants=load('src/modules/governance/operator-access');
    for(const [role,actions] of [['producer',['CREATE_SOURCE','SEAL']],['reviewer',['REVIEW_SOURCE']]]){
      for(const action of actions){
        const [[old]]=await db.execute('SELECT object_version FROM governance_operator_grants WHERE account_id=? AND action_code=?',[roles[role].account_id,action]);
        await grants.maintainOperatorGrant(db,{account_id:roles[role].account_id,action,enabled:true,
          expected_version:old?.object_version||0,expires_at:new Date(clone.expires).toISOString(),
          authority_ref:'synthetic:qa18-esign-approved',reason:'合成隔离合同，测试模拟签署状态与回执'});
      }
    }
    const governance=load('src/modules/governance/service').createGovernanceService({db,secret,environment:'SANDBOX'});
    const execute=(role,command,input)=>governance.execute(roles[role].bearer_token,{command,input:{...input,operation_key:randomUUID()}});
    const original=await call('buyer','GET','/trade/records/'+order,200);
    async function seal(scenario){
      const commitments={scope:'仅隔离演练，不产生真实合同签署或付款'};
      if(scenario)commitments.sandbox_signing={scenario,signer_account_id:roles.buyer.account_id,signer_party_id:roles.buyer.party_id};
      const draft=await execute('producer','create_source',{content:{business_ref:'synthetic:esign:'+randomUUID(),
        revision:'v1',party_ids:[roles.producer.party_id,roles.buyer.party_id],reader_account_ids:[roles.producer.account_id,roles.buyer.account_id],
        rule_ids:[original.data.quote.rule_id],commitments}});
      await execute('reviewer','transition_source',{source_ref:draft.source_ref,target_status:'REVIEWED',
        expected_version:draft.object_version,review_ref:'synthetic:independent-qa'});
      return execute('producer','seal',{source_ref:draft.source_ref});
    }
    const fixtures={};
    for(const scenario of scenarios)fixtures[scenario]=await seal(scenario);
    const ordinary=await seal(null);
    const route=snapshot=>'/testing/esign/'+snapshot.id;
    const contract=snapshot=>'/contract-snapshots/'+snapshot.id+'/content';
    const scope=fixtures.SUCCESS;
    const prior=await call('buyer','GET',contract(scope),200);
    assert.equal(prior.signing_method,'NOT_SIGNED');

    if(mode==='api'){
      const production=await start({governanceEnvironment:'PRODUCTION',sandboxSigning:simulator});
      const defaultServer=await start({});
      for(const at of [production,defaultServer]){
        await call('buyer','GET',route(scope),404,{at});
        await call('buyer','POST',route(scope),404,{at,body:{snapshot_sha256:scope.content_sha256}});
        await call('buyer','POST',route(scope)+'/reconcile',404,{at});
      }
      await stop(production);
      await stop(defaultServer);
      await call('buyer','GET',route(ordinary),404);
      await call('producer','GET',contract(scope),200);
      await call('producer','GET',route(scope),404);
      await call('producer','POST',route(scope),404,{body:{snapshot_sha256:scope.content_sha256}});
      await call('outsider','GET',route(scope),404);
      await call('buyer','GET',route(scope),404,{party:roles.producer.party_id});
      await call('buyer','POST',route(scope),400,{body:{snapshot_sha256:scope.content_sha256,current_status:'SIMULATED_SUCCESS'}});
      await call('buyer','POST',route(scope),409,{body:{snapshot_sha256:'0'.repeat(64)}});
      assert.equal((await call('buyer','GET',route(scope),200)).receipt,null);
      await call('buyer','POST',route(scope)+'/reconcile',404);
      for(const scenario of scenarios){
        const snapshot=fixtures[scenario],endpoint=route(snapshot);
        const key=randomUUID(),body={snapshot_sha256:snapshot.content_sha256};
        if(scenario==='TIMEOUT_THEN_SUCCESS'){
          assert.equal((await call('buyer','POST',endpoint,503,{key,body})).code,'PROVIDER_OUTCOME_UNKNOWN');
        }else{
          assert.equal((await call('buyer','POST',endpoint,200,{key,body})).receipt.current_status,
            scenario==='SUCCESS'?'SIMULATED_SUCCESS':'SIMULATED_FAILURE');
        }
        if(scenario==='SUCCESS'){
          const other=fixtures.FAILURE;
          assert.equal((await call('buyer','POST',route(other),409,{key,body:{snapshot_sha256:other.content_sha256}})).code,'IDEMPOTENCY_CONFLICT');
          assert.equal((await call('buyer','GET',route(other),200)).receipt,null);
        }
        const initial=(await call('buyer','GET',endpoint,200)).receipt;
        if(scenario==='TIMEOUT_THEN_SUCCESS'){
          assert.equal(initial.current_status,'OUTCOME_UNKNOWN');
          await stop(server);
          server=await start({sandboxSigning:await factory(db,env)});
          assert.deepEqual((await call('buyer','GET',endpoint,200)).receipt,initial);
        }
        assert.deepEqual((await call('buyer','POST',endpoint,200,{key,body})).receipt,initial);
        await call('buyer','POST',endpoint,409,{body});
        const returns=await Promise.all([0,1,2].map(()=>call('buyer','POST',endpoint+'/reconcile',200)));
        assert(returns.every(x=>x.receipt.id===initial.id));
        const last=(await call('buyer','GET',endpoint,200)).receipt;
        assert.equal(last.current_status,scenario==='FAILURE'?'SIMULATED_FAILURE':'SIMULATED_SUCCESS');
        assert.equal(last.id,initial.id);
        assert.equal(last.receipt_ref,'sim-esign:'+last.id);
        evidence.checks.push({scenario,snapshot:snapshot.id,receipt:last.id,recovered:last.current_status});
      }
    }else{
      const enable=normalApp||process.env.QA18_ESIGN_CLIENTS==='plain'?'plain':'isolated';
      const directory=path.join(baseDir,'builds');
      const app=normalApp?{dir:path.join(root,'晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/build/s4-a-esign-normal03'),
        manifest:path.join(directory,'app-normal.json'),checkout:version,source:version}
        :{dir:path.join(directory,'app-'+enable+'-verified'),manifest:path.join(directory,'app-'+enable+'-verified.json'),checkout:version,source:version};
      const vue={dir:path.join(directory,'vue-'+enable),manifest:path.join(directory,'vue-'+enable+'.json'),checkout:version,source:version};
      browser=await openBrowser(addr(server),roles,evidence,{app,vue});
      const appPath=snapshot=>'/contract?snapshotId='+snapshot.id;
      const vuePath=snapshot=>'/contracts/'+snapshot.id;
      async function visit(surface,snapshot,fn){
        const page=await browser.actor(surface,'buyer',surface==='app'?appPath(snapshot):vuePath(snapshot),{anonymous:normalApp&&surface==='app'});
        try{await fn(page);}
        catch(error){
          const name=surface+'-'+snapshot.commitments.sandbox_signing?.scenario;
          await fs.writeFile(path.join(out,name+'.aria.txt'),await page.locator('body').ariaSnapshot({timeout:1800}).catch(()=>''));
          throw error;
        }finally{await page.context().close();}
      }
      function response(page,snapshot,method,suffix=''){
        const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1'+route(snapshot)+suffix&&r.request().method()===method,
          {timeout:14000});
        pending.catch(()=>{});
        return pending;
      }
      async function submit(surface,snapshot,expected){
        await visit(surface,snapshot,async page=>{
          const label='确认在隔离环境演练当前合同';
          if(surface==='vue')await page.getByRole('checkbox',{name:label,exact:true}).check();
          else{
            const toggle=page.getByRole('checkbox',{name:new RegExp(label)});
            await toggle.waitFor();
            const bounds=await toggle.boundingBox();
            assert(bounds);
            await page.mouse.click(bounds.x+Math.min(24,bounds.width/2),bounds.y+bounds.height/2);
            await toggle.and(page.locator('[aria-checked=true]')).waitFor();
          }
          const done=response(page,snapshot,'POST');
          await page.getByRole('button',{name:'提交模拟签署',exact:true}).click();
          assert.equal((await done).status(),expected);
        });
      }
      if(enable==='plain'){
        for(const surface of ['app','vue'])await visit(surface,scope,async page=>{
          if(normalApp&&surface==='app'){
            const phone=page.getByRole('textbox',{name:/手机号/});
            const action=page.getByRole('button',{name:/登录后继续|前往账号与身份|前往登录|手机号登录|去登录|先登录/}).first();
            if(!await phone.isVisible())await action.click();
            if(!await phone.isVisible()){
              const login=page.getByRole('button',{name:'手机号登录',exact:true});
              if(await login.count())await login.click();
            }
            async function input(field,value){
              await field.click();
              await page.keyboard.press('ControlOrMeta+A');
              await page.keyboard.insertText(value);
              assert.equal(await field.inputValue(),value);
              await field.press('Tab');
            }
            function awaitPath(pathname){
              const p=page.waitForResponse(r=>new URL(r.url()).pathname===pathname&&r.request().method()==='POST',{timeout:12000});
              p.catch(()=>{});
              return p;
            }
            await input(phone,syntheticPhone);
            const challenge=awaitPath('/api/v1/auth/sms-challenges');
            await page.getByRole('button',{name:'获取验证码',exact:true}).click();
            const smsResult=await challenge;
            assert.equal(smsResult.status(),200);
            await input(page.getByRole('textbox',{name:/验证码/}),codes.get((await smsResult.json()).data.challenge_id));
            const consent=page.getByRole('checkbox',{name:/同意用户协议与隐私政策/});
            const area=await consent.boundingBox();
            assert(area);
            await page.mouse.click(area.x+Math.min(24,area.width/2),area.y+area.height/2);
            await consent.and(page.locator('[aria-checked=true]')).waitFor();
            const signedIn=awaitPath('/api/v1/auth/sessions');
            await page.getByRole('button',{name:'登录并继续',exact:true}).click();
            const loginResult=await signedIn;
            assert.equal(loginResult.status(),200);
            assert.equal((await loginResult.json()).data.account.id,roles.buyer.account_id);
          }
          await page.waitForLoadState('networkidle',{timeout:15000});
          assert(evidence.browser_requests.some(x=>x.surface===surface&&x.path==='/api/v1'+contract(scope)&&x.status===200));
          assert.equal(await page.getByRole('heading',{name:'电子签隔离演练',exact:true}).count(),0);
          assert.equal(await page.getByRole('button',{name:'提交模拟签署',exact:true}).count(),0);
          evidence.checks.push({surface,normal_build_entry_absent:true,snapshot:scope.id});
        });
        assert(!evidence.browser_requests.some(r=>r.path.startsWith('/api/v1/testing/esign/')));
      }else{
        await submit('vue',scope,200);
        await visit('app',scope,async page=>await page.getByRole('group',{name:/电子签隔离演练.*模拟签署成功/}).waitFor());
        await submit('app',fixtures.FAILURE,200);
        await visit('vue',fixtures.FAILURE,async page=>await page.getByText('模拟签署失败',{exact:true}).waitFor());
        const pending=fixtures.TIMEOUT_THEN_SUCCESS;
        await submit('vue',pending,503);
        const before=(await call('buyer','GET',route(pending),200)).receipt;
        assert.equal(before.current_status,'OUTCOME_UNKNOWN');
        await visit('app',pending,async page=>{
          const done=response(page,pending,'POST','/reconcile');
          await page.getByRole('button',{name:'核对原模拟签署结果',exact:true}).click();
          assert.equal((await done).status(),200);
          await page.getByRole('group',{name:/电子签隔离演练.*模拟签署成功/}).waitFor();
        });
        await visit('vue',pending,async page=>await page.getByTestId('sandbox-signing-state').getByText('模拟签署成功',{exact:true}).waitFor());
        assert.equal((await call('buyer','GET',route(pending),200)).receipt.id,before.id);
        evidence.checks.push({three_scenarios_across_real_clients:true,timeout_recovered_same_receipt:before.id});
      }
    }
    const [rows]=await db.execute('SELECT id,snapshot_id,current_status,object_version,receipt_ref FROM test_esign_receipts ORDER BY snapshot_id');
    const [events]=await db.execute('SELECT receipt_id,current_status,object_version,receipt_ref FROM test_esign_receipt_events ORDER BY receipt_id,object_version');
    if(mode==='browsers'&&(normalApp||process.env.QA18_ESIGN_CLIENTS==='plain')){
      assert.equal(rows.length,0);
      assert.equal(events.length,0);
    }else{
      assert.equal(rows.length,3);
      assert.equal(events.length,7);
      for(const scenario of scenarios){
        const row=rows.find(x=>x.snapshot_id===fixtures[scenario].id);
        const actual=events.filter(x=>x.receipt_id===row.id).map(e=>e.current_status);
        const status=scenario==='FAILURE'?'SIMULATED_FAILURE':'SIMULATED_SUCCESS';
        assert.deepEqual(actual,scenario==='TIMEOUT_THEN_SUCCESS'?['PENDING','OUTCOME_UNKNOWN',status]:['PENDING',status]);
      }
    }
    evidence.database_readback={requests:rows,events,original_contract_signing_method:'NOT_SIGNED'};
    for(const snapshot of Object.values(fixtures)){
      assert.deepEqual(await call('buyer','GET',contract(snapshot),200),snapshot);
    }
    assert.deepEqual(await call('buyer','GET','/trade/records/'+order,200),original);
    evidence.result='PASS';
  }catch(error){evidence.result='FAIL';evidence.failure=error.message;throw error;}
  finally{
    try{
      await browser?.close();
      for(const server of servers){server.closeAllConnections();await new Promise(ok=>server.close(ok));}
      await clone?.close();
    }catch(error){evidence.result='FAIL';evidence.cleanup_failure=error.message;throw error;}
    finally{evidence.finished_at=new Date().toISOString();await save();}
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
