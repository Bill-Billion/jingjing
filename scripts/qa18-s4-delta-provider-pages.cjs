'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
const {randomUUID}=require('node:crypto');
const {cloneRecords,load,root,hash}=require('./test-fixtures/qa18-s4-delta-clone.cjs');
const {openBrowser,vueArtifact}=require('./test-fixtures/qa18-s4-artifact-browser.cjs');

const product='053168fb6e06b80680101702a733357309368809';
const source='jx_test_qa18_privacy_170df71eb1fc4e2a6be5';
const privacy='124e64c9-6829-4f71-b2ef-4265a223cdb0';
const orderId='fe55f52f-670d-4a04-a362-3fc45dc3095e';
const out=path.resolve(process.argv[2]||'');
const signingOnly=process.argv[3]==='signing';
const fixedVue=process.argv[4];
const actions={START_PAYMENT:'支付服务',START_IDENTITY_CHECK:'身份核验服务',START_SIGNING:'签署服务',START_DIGITAL_HUMAN:'数字人服务'};

async function main(){
  assert(out.startsWith(path.join(root,'.local/qa18')+path.sep));
  const evidence={product,started_at:new Date().toISOString(),checks:[],browser_requests:[],api:[]};
  await fs.mkdir(out,{recursive:true});
  await fs.writeFile(path.join(out,'RUN_ONCE'),'Provider UI statements on original synthetic records',{flag:'wx'});
  const save=()=>fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(evidence,null,2)+'\n');
  let clone,server,browser,missing;
  try {
    clone=await cloneRecords({source,directory:path.join(root,'.local/qa18/s1-core-20261127/11-privacy'),out,actors:['buyer','producer','reviewer','outsider'],proof:evidence});
    const {db,roles,disk,secret}=clone;
    const baseStorage=disk.storageFactory();
    const supplyStorageFactory=()=>({...baseStorage,getBuffer:async (key,...rest)=>{
      if(key===missing)return undefined;
      return baseStorage.getBuffer(key,...rest);
    }});
    const governanceBindings={};
    let signingAdapter;
    if(signingOnly){
      const provider={provider_kind:'ESignProvider',provider_code:'qa18_isolated_signature_example',
        capability_code:'create',environment:'SANDBOX'};
      const revision='qa18-synthetic-only-20261128';
      const repository=load('src/modules/providers/readiness').createReadinessRepository(db,{
        authorizeChange:async (actor,requested)=>actor==='synthetic:qa18-provider-reviewer'&&requested.provider_code===provider.provider_code,
        verifyEvidence:async check=>check.evidence_ref==='synthetic:qa18-approved-adapter-fixture'&&check.config_revision===revision,
      });
      await repository.record({...provider,current_status:'SANDBOX_VERIFIED',config_revision:revision,expected_version:0,
        evidence_ref:'synthetic:qa18-approved-adapter-fixture'},{actor_ref:'synthetic:qa18-provider-reviewer'});
      const inspect=async()=>({implemented:true,configured:true,config_revision:revision});
      const application='qa18-example-signature-request';
      const info=()=>{};
      signingAdapter=load('src/modules/providers/adapter').createAdapter({provider,repository,inspect,timeoutMs:100,
        logger:{info,warn:info,error:info},operations:{
          async create({mode}){
            if(mode==='unknown')return new Promise(()=>{});
            if(mode==='failure')throw new Error('Isolated ESign example callback rejected');
            return {provider_request_id:application,status:'PENDING'};
          },
          async query({reference}){
            assert.equal(reference,application);
            return {provider_request_id:reference,status:'SIMULATED_COMPLETE'};
          },
        }});
      governanceBindings.START_SIGNING={provider,inspect};
      assert.equal((await repository.read(provider)).current_status,'SANDBOX_VERIFIED');
    }
    server=load('src/http/account-api').createAccountApi({db,secret,supplyStorageFactory,governanceBindings}).listen(0,'127.0.0.1');
    await new Promise((ok,fail)=>{server.once('listening',ok);server.once('error',fail);});
    const base='http://127.0.0.1:'+server.address().port+'/api/v1';
    async function get(route,expected=200,{party=false}={}){
      const actor=roles.buyer;
      const r=await fetch(base+route,{headers:{Authorization:'Bearer '+actor.bearer_token,...party?{'X-Acting-Party':actor.party_id}:{}},signal:AbortSignal.timeout(10000)});
      const bytes=Buffer.from(await r.arrayBuffer());
      const data=r.headers.get('content-type').includes('json')?JSON.parse(bytes):null;
      evidence.api.push({path:route,status:r.status,error:data?.error?.code,sha256:hash(bytes)});
      assert.equal(r.status,expected,route+' '+data?.error?.code);
      return data?.data??bytes;
    }
    const order=await get('/trade/records/'+orderId,200,{party:true});
    // The checkout snapshot is stored with the order. The contract reader works
    // with the separately reviewed governance source type.
    const granted=load('src/modules/governance/operator-access').maintainOperatorGrant;
    for(const [role,actions] of [['producer',['CREATE_SOURCE','SEAL']],['reviewer',['REVIEW_SOURCE']]]){
      for(const action of actions){
        const [rows]=await db.execute('SELECT object_version FROM governance_operator_grants WHERE account_id=? AND action_code=?',[roles[role].account_id,action]);
        await granted(db,{account_id:roles[role].account_id,action,enabled:true,expected_version:rows[0]?.object_version||0,
          expires_at:new Date(clone.expires).toISOString(),authority_ref:'synthetic:pm04-s4a-provider-pages',reason:'Synthetic contract readiness fixture only'});
      }
    }
    const governance=load('src/modules/governance/service').createGovernanceService({db,secret,environment:'SANDBOX'});
    const execute=(role,command,input)=>governance.execute(roles[role].bearer_token,{command,input:{...input,operation_key:randomUUID()}});
    const draft=await execute('producer','create_source',{content:{business_ref:'synthetic:s4a:'+orderId,revision:'v1',
      party_ids:[roles.producer.party_id,roles.buyer.party_id],reader_account_ids:[roles.producer.account_id,roles.buyer.account_id],
      rule_ids:[order.data.quote.rule_id],commitments:{purpose:'隔离服务状态验证，不产生真实签署、付款或许可。'}}});
    await execute('reviewer','transition_source',{source_ref:draft.source_ref,target_status:'REVIEWED',
      expected_version:draft.object_version,review_ref:'synthetic:performed-review'});
    const snapshot=await execute('producer','seal',{source_ref:draft.source_ref});
    const contract=snapshot.id;
    evidence.contract_fixture={id:contract,business_ref:draft.content.business_ref,signing_method:snapshot.signing_method};
    const contractRoute='/contract-snapshots/'+contract;
    const before=await get(contractRoute+'/content',200,{party:true});
    assert.equal(before.signing_method,'NOT_SIGNED');
    const state={};
    const testedActions=signingOnly?{START_SIGNING:actions.START_SIGNING}:actions;
    for(const action of Object.keys(testedActions)){
      state[action]=await get(contractRoute+'/business-readiness?action='+action,200,{party:true});
      assert.equal(state[action].action,action);
      assert.equal(state[action].current_status,signingOnly?'SERVICE_READY':'NOT_ENABLED');
      if(signingOnly)assert.equal(state[action].reason_code,null);
      else assert(state[action].reason_code);
    }
    if(signingOnly){
      const submitted=await signingAdapter.call('create',{mode:'pending',snapshot_id:contract});
      assert.equal(submitted.status,'PENDING');
      await assert.rejects(()=>signingAdapter.call('create',{mode:'failure',snapshot_id:contract}),{code:'PROVIDER_CALL_FAILED'});
      await assert.rejects(()=>signingAdapter.call('create',{mode:'unknown',snapshot_id:contract}),{code:'PROVIDER_OUTCOME_UNKNOWN'});
      for(let i=0;i<2;i++){
        const queried=await signingAdapter.call('query',{reference:submitted.provider_request_id});
        assert.deepEqual(queried,{provider_request_id:submitted.provider_request_id,status:'SIMULATED_COMPLETE'});
      }
      assert.deepEqual(await get(contractRoute+'/content',200,{party:true}),before);
      evidence.adapter_only={pending:true,unknown:true,failed:true,repeat_query_same_reference:true,contract_method_after:'NOT_SIGNED'};
    }
    const vue=vueArtifact(out,fixedVue,'latest');
    browser=await openBrowser(base,roles,evidence,{vue});
    async function section(name,fn){
      try{
        const fields=await fn();
        evidence.checks.push({name,result:'PASS',...fields});
        console.log('PASS '+name);
      }catch(error){
        evidence.checks.push({name,result:'FAIL',message:error.message});
        process.exitCode=1;
        console.error(name+': '+error.message);
      }finally{await save();}
    }
    for(const surface of ['vue','app'])await section(surface+' contract surface shows persisted service restrictions',async()=>{
      const uiRoute=surface==='vue'?'/contracts/'+contract:'/contract?snapshotId='+contract;
      const page=await browser.actor(surface,'buyer',uiRoute);
      try{
        if(surface==='vue') {
          await page.getByTestId('signing-status').getByText('未签署',{exact:true}).waitFor();
        } else {
          await page.getByText(/保存时尚未签署，留存原约定/).waitFor();
        }
        const checked=[];
        for(const [action,label] of Object.entries(testedActions)){
          const checkButton=surface==='vue'?page.getByTestId('check-readiness'):page.getByRole('button',{name:'检查服务条件',exact:true});
          if(surface==='vue') await page.getByTestId('service-action').selectOption(action);
          else if(action!=='START_PAYMENT'){
            const card=page.getByRole('group',{name:/相关服务是否可用/});
            const choices=signingOnly?page.getByRole('button',{name:/^相关服务是否可用.*要检查的服务/}):card.getByRole('button',{name:/^要检查的服务/});
            await choices.first().click();
            await page.getByRole('menuitem',{name:label,exact:true}).click();
          }
          const wait=page.waitForResponse(r=>{
            const url=new URL(r.url());
            return url.pathname==='/api/v1'+contractRoute+'/business-readiness'&&url.searchParams.get('action')===action;
          },{timeout:10000});
          wait.catch(()=>{});
          await checkButton.click();
          const r=await wait;
          assert.equal(r.status(),200);
          assert.deepEqual((await r.json()).data,state[action]);
          if(surface==='vue')await page.getByTestId('readiness-result').getByText(signingOnly?'服务条件已满足':'服务尚未启用',{exact:true}).waitFor();
          else if(signingOnly)await page.getByRole('group',{name:/相关服务是否可用.*服务条件已具备/}).waitFor();
          else await page.getByRole('group',{name:/相关服务是否可用.*这项服务尚未接入/}).waitFor();
          if(signingOnly)assert.equal(await page.getByRole('button',{name:/^签署$|^发起签署$/}).count(),0);
          checked.push({action,reason:state[action].reason_code});
        }
        return {contract,checked};
      }catch(error){
        await fs.writeFile(path.join(out,surface+'-contract.aria.txt'),await page.locator('body').ariaSnapshot({timeout:1500}).catch(()=>''));
        throw error;
      }finally{await page.context().close();}
    });
    if(!signingOnly)for(const surface of ['app','vue'])await section(surface+' private storage loss and exact original retrieval',async()=>{
      const route='/privacy/requests/'+privacy;
      const copy=await get(route);
      const file=copy.result.files[0];
      const [[stored]]=await db.execute('SELECT object_key,content_sha256,current_status FROM supply_assets WHERE id=?',[file.id]);
      assert.equal(stored.current_status,'READY');
      const content=route+'/evidence/'+file.id+'/content';
      const page=await browser.actor(surface,'buyer',surface==='app'?'/privacy?view=request&recordId='+privacy:'/privacy/requests/'+privacy);
      try{
        const take=page.getByRole('button',{name:surface==='app'?'领取这份审核答复附件':'读取本次获准答复附件',exact:true});
        async function download(){
          const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1'+content,{timeout:10000});
          pending.catch(()=>{});
          await take.click();
          return pending;
        }
        if(surface==='vue')await page.getByRole('combobox',{name:'本记录列明的私有材料'}).selectOption(file.id);
        missing=stored.object_key;
        const failed=await download();
        assert.equal(failed.status(),503);
        assert.equal((await failed.json()).error.code,'SERVICE_UNAVAILABLE');
        if(surface==='vue')await page.getByRole('alert').getByText('SERVICE_UNAVAILABLE',{exact:true}).waitFor();
        missing=undefined;
        const recovered=await download();
        assert.equal(recovered.status(),200);
        const bytes=await recovered.body();
        assert.equal(hash(bytes),file.content_sha256);
        const [[after]]=await db.execute('SELECT object_key,content_sha256,current_status FROM supply_assets WHERE id=?',[file.id]);
        assert.deepEqual(after,stored);
        assert.equal((await get(route)).current_status,copy.current_status);
        return {file:file.id,bytes:bytes.length,sha256:hash(bytes),object_state:after.current_status};
      }catch(error){
        await fs.writeFile(path.join(out,surface+'-storage.aria.txt'),await page.locator('body').ariaSnapshot({timeout:1500}).catch(()=>''));
        throw error;
      }finally{missing=undefined;await page.context().close();}
    });
    const after=await get(contractRoute+'/content',200,{party:true});
    assert.deepEqual(after,before);
    assert(!evidence.browser_requests.some(row=>row.method==='POST'));
    evidence.result=process.exitCode?'PARTIAL':'PASS';
  }catch(error){evidence.result='FAIL';evidence.failure=error.message;throw error;}
  finally{
    try{
      await browser?.close();
      if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
      await clone?.close();
    }catch(error){evidence.result='FAIL';evidence.cleanup_failure=error.message;throw error;}
    finally {evidence.finished_at=new Date().toISOString();await save();}
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
