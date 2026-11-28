'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
const {randomUUID,randomBytes}=require('node:crypto');
const {cloneRecords,load,root,hash}=require('./test-fixtures/qa18-s4-delta-clone.cjs');
const {openBrowser}=require('./test-fixtures/qa18-s4-artifact-browser.cjs');
const source='jx_test_qa18_privacy_170df71eb1fc4e2a6be5';
const target=path.resolve(process.argv[2]||'');

async function main(){
  assert(target.startsWith(path.join(root,'.local/qa18')+path.sep));
  const evidence={product:'053168fb6e06b80680101702a733357309368809',started_at:new Date().toISOString(),
    checks:[],browser_requests:[],provider_requests:[]};
  await fs.mkdir(target,{recursive:true});
  const save=()=>fs.writeFile(path.join(target,'RESULT.json'),JSON.stringify(evidence,null,2)+'\n');
  let clone,server,browser,page;
  try{
    clone=await cloneRecords({source,directory:path.join(root,'.local/qa18/s1-core-20261127/11-privacy'),out:target,
      actors:['buyer','outsider'],proof:evidence});
    const {db,disk,roles,secret}=clone;
    const context={};
    const subject='synthetic:'+randomUUID();
    const principal=async input=>input===context?{subject_ref:subject}:null;
    const parties=load('src/modules/party/repository').createPartyRepository(db,{resolvePrincipal:principal});
    const fixture=await parties.registerAccount(context,{display_name:'合成实名失败恢复专用账号'});
    const token=randomBytes(32).toString('base64url');
    const secure=load('src/modules/auth/security').createSecurity(secret);
    await db.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms,authenticated_ms) VALUES(?,?,?,?)',
      [secure.digest('token',token),fixture.account_id,clone.expires,Date.now()]);
    const owner=roles.verification={account_id:fixture.account_id,party_id:fixture.personal_party_id,bearer_token:token};
    const provider={readiness:async()=>({current_status:'SERVICE_READY',reason_code:null}),assertReady:async()=>{},
      verify:async input=>{
        evidence.provider_requests.push({person:input.person_id,key_sha256:hash(input.request_key)});
        if(evidence.provider_requests.length===1)throw Object.assign(Error('isolated outcome unknown'),{code:'PROVIDER_OUTCOME_UNKNOWN',status:503});
        return {request_key:input.request_key,person_id:input.person_id,status:'VERIFIED',issuer:'synthetic-id-fixture',
          subject_fingerprint:randomBytes(32).toString('hex'),age_band:'ADULT',valid_until:'2099-01-01T00:00:00.000Z',
          evidence_ref:'synthetic:original-key-recovery',liveness_verified:true,phone_verified:true};
      }};
    server=load('src/http/account-api').createAccountApi({db,secret,supplyStorageFactory:disk.storageFactory,artistIdentityProviderFactory:()=>provider}).listen(0,'127.0.0.1');
    await new Promise((ok,fail)=>{server.once('listening',ok);server.once('error',fail);});
    const url='http://127.0.0.1:'+server.address().port+'/api/v1';
    const people=await fetch(url+'/artists/people',{headers:{Authorization:'Bearer '+owner.bearer_token,'X-Acting-Party':owner.party_id},signal:AbortSignal.timeout(10000)});
    assert.equal(people.status,200);
    const current=(await people.json()).data.items;
    let person;
    if(current.length) {
      assert.equal(current.length,1);
      person=current[0].id;
    }else{
      const response=await fetch(url+'/artists/people',{method:'POST',headers:{Authorization:'Bearer '+owner.bearer_token,
        'X-Acting-Party':owner.party_id,'Idempotency-Key':randomUUID(),'Content-Type':'application/json'},
        body:JSON.stringify({display_name:'合成实名状态测试'}),signal:AbortSignal.timeout(10000)});
      assert.equal(response.status,200);
      person=(await response.json()).data.id;
    }
    const [[initial]]=await db.execute("SELECT COUNT(*) AS n FROM artist_records WHERE person_id=? AND kind='IDENTITY'",[person]);
    browser=await openBrowser(url,roles,evidence);
    page=await browser.actor('app','verification','/artists/form?mode=IDENTITY&personId='+person);
    const listen=()=>page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/v1/artists/people/'+person+'/identity',{timeout:10000});
    const confirm=()=>page.getByRole('button',{name:'确认办理',exact:true}).click();
    const submit=page.getByRole('button',{name:'提交认证核对',exact:true});
    await page.getByRole('textbox',{name:/实名服务会话引用/}).fill('synthetic:pm04-s4a-unknown-original');
    await submit.click();
    const pending=listen();
    pending.catch(()=>{});
    await confirm();
    const first=await pending;
    assert.equal(first.status(),503);
    const [records]=await db.execute("SELECT id,current_status FROM artist_records WHERE person_id=? AND kind='IDENTITY' ORDER BY created_at DESC",[person]);
    assert.equal(records.length,Number(initial.n)+1);
    assert.equal(records[0].current_status,'UNKNOWN');
    const record=records[0].id;
    await page.getByRole('button',{name:'恢复原艺人操作',exact:true}).click();
    const retry=listen();
    retry.catch(()=>{});
    await confirm();
    const recovered=await retry;
    assert.equal(recovered.status(),200);
    const request=(await recovered.json()).data;
    assert.equal(request.id,record);
    assert.equal(request.current_status,'VERIFIED');
    assert.equal(recovered.request().headers()['idempotency-key'],first.request().headers()['idempotency-key']);
    assert.equal(recovered.request().postData(),first.request().postData());
    assert.equal(evidence.provider_requests.length,2);
    assert.equal(evidence.provider_requests[0].key_sha256,evidence.provider_requests[1].key_sha256);
    const recordRoute='/artists/people/'+person+'/records/'+record;
    async function readRecord(surface){
      const route=surface==='app'?'/artists/record?personId='+person+'&recordId='+record:recordRoute;
      if(!page.isClosed())await page.context().close();
      page=await browser.actor(surface,'verification',route);
      const marker=surface==='app'?page.getByRole('heading',{name:/实名记录/}).first():page.getByRole('heading',{name:'受信实名服务返回',exact:true});
      await marker.waitFor();
      assert(evidence.browser_requests.some(x=>x.surface===surface&&x.id===record&&x.state==='VERIFIED'));
    }
    await readRecord('app');
    await readRecord('vue');
    const user=roles.outsider;
    const denied=await fetch(url+recordRoute,{headers:{Authorization:'Bearer '+user.bearer_token,'X-Acting-Party':user.party_id},signal:AbortSignal.timeout(10000)});
    assert([403,404].includes(denied.status));
    const [after]=await db.execute("SELECT id,current_status FROM artist_records WHERE person_id=? AND kind='IDENTITY' ORDER BY created_at DESC",[person]);
    assert.equal(after.length,records.length);
    assert.deepEqual(after[0],{id:record,current_status:'VERIFIED'});
    evidence.checks.push({person,record,original_key_recovered:true,after_unknown:records[0].current_status,
      verified_after_retry:after[0].current_status,foreign_http:denied.status});
    evidence.result='PASS';
    console.log('PASS original identity record transitions UNKNOWN to VERIFIED on the same key, App and Vue read original');
  }catch(error){
    evidence.result='FAIL';evidence.failure=error.message;
    if(page&&!page.isClosed())await fs.writeFile(path.join(target,'page.aria.txt'),await page.locator('body').ariaSnapshot({timeout:1800}).catch(()=>''));
    throw error;
  }finally{
    try{
      await browser?.close();
      if(server){server.closeAllConnections();await new Promise(ok=>server.close(ok));}
      await clone?.close();
    }catch(error){evidence.result='FAIL';evidence.cleanup_failure=error.message;throw error;}
    finally {evidence.finished_at=new Date().toISOString();await save();}
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
