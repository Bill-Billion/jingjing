'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {cloneRecords,load,root,hash}=require('./test-fixtures/qa18-s4-delta-clone.cjs');

const source='jx_test_qa18_privacy_a1836a115e03f27fdc81';
const directory=path.join(root,'.local/qa18/s3a-20261127/privacy-env');
const oldCase='d96a4587-280e-4b1a-b992-b1f2ccd9f7d7';
const model='446844c7-5745-4757-a48b-d8f222180a3f';
const consent='118d0f55-373b-4221-abd3-878e8850b87e';
const output=path.resolve(process.argv[2]||'');

async function main(){
  assert(output.startsWith(path.join(root,'.local/qa18/s4-a-remaining-20261128')+path.sep));
  await fs.mkdir(output,{recursive:true});
  await fs.writeFile(path.join(output,'RUN_ONCE'),'original legal synthetic model and authorization scope',{flag:'wx'});
  const e={started_at:new Date().toISOString(),original_case:oldCase,model,consent,requests:[],checks:[]};
  const save=()=>fs.writeFile(path.join(output,'RESULT.json'),JSON.stringify(e,null,2)+'\n');
  let clone,server;
  try{
    clone=await cloneRecords({source,directory,out:output,actors:['producer','buyer','reviewer','outsider'],proof:e,restoreFiles:false});
    const {db,roles,secret}=clone;
    const [[stored]]=await db.execute("SELECT current_status,data_sha256 FROM production_records WHERE id=? AND kind='DIGITAL_ASSET'",[model]);
    assert.equal(stored.current_status,'DELETED');
    const [[owner]]=await db.execute(`SELECT p.personal_account_id AS account
      FROM parties p JOIN supply_records c ON p.id=JSON_UNQUOTE(JSON_EXTRACT(c.data_json,'$.consent.subject_party_id'))
      WHERE c.id=? AND p.kind='PERSON'`,[consent]);
    const role=Object.keys(roles).find(x=>roles[x].account_id===owner.account);
    assert(role&&role!=='outsider');
    const oldRecord=async()=>(await db.execute('SELECT current_status,object_version,result_sha256 FROM privacy_requests WHERE id=?',[oldCase]))[0][0];
    const before=await oldRecord();
    assert.equal(before.current_status,'FOLLOW_UP');

    server=load('src/http/account-api').createAccountApi({db,secret}).listen(0,'127.0.0.1');
    await new Promise((ok,fail)=>{server.once('listening',ok);server.once('error',fail);});
    const base='http://127.0.0.1:'+server.address().port+'/api/v1/privacy';
    async function call(actor,route,status=200,body){
      const response=await fetch(base+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+roles[actor].bearer_token,
        ...body?{'Idempotency-Key':randomUUID(),'Content-Type':'application/json'}:{}},
        body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
      const raw=Buffer.from(await response.arrayBuffer());
      const result=JSON.parse(raw);
      e.requests.push({actor,route,http:response.status,error:result.error?.code,sha256:hash(raw)});
      await save();
      assert.equal(response.status,status,route+' '+result.error?.code);
      return result.data||result.error;
    }
    const own=await call(role,'/requests',200,{type:'COPY',scopes:['DIGITAL_MODELS','CONTRACTS'],
      details:'本人原合成模型记录及已撤回授权的局部机器可读副本'});
    const ownPath='/requests/'+own.id;
    const options=await call(role,ownPath+'/copy-options');
    assert.deepEqual(options.categories.map(x=>x.category).sort(),['CONTRACTS','DIGITAL_MODELS']);
    assert(options.categories.every(x=>x.file_copy_supported===false));
    assert.equal(options.request_completion,'NOT_CONFIRMED');
    const models=await call(role,ownPath+'/data?category=DIGITAL_MODELS');
    const entry=models.items.find(x=>x.id===model);
    assert(entry);
    assert.equal(entry.current_status,'DELETED');
    assert.equal(entry.consent_id,consent);
    assert.deepEqual(Object.keys(entry).sort(),['asset_type','avatar_id','consent_id','current_status','id','object_version']);
    const agreements=await call(role,ownPath+'/data?category=CONTRACTS');
    const authorization=agreements.items.find(x=>x.id===consent);
    assert(authorization);
    assert(authorization.records.some(x=>x.current_status==='WITHDRAWN'||x.current_status==='REVOKED'));
    for(const copy of [models,agreements])assert(!/object_key|provider_ref|credential|token_hash|reviewer_account_id/.test(JSON.stringify(copy)));
    assert.equal((await call(role,ownPath+'/data?category=PROFILE',409)).code,'PRIVACY_ACTION_SCOPE_MISMATCH');
    assert.equal((await call(role,ownPath+'/copies/'+model+'/content?category=DIGITAL_MODELS',409)).code,'PRIVACY_ACTION_SCOPE_MISMATCH');
    await call('outsider',ownPath+'/data?category=DIGITAL_MODELS',404);
    await call('outsider',ownPath+'/data?category=CONTRACTS',404);
    assert.deepEqual(await oldRecord(),before);
    assert.deepEqual((await db.execute("SELECT current_status,data_sha256 FROM production_records WHERE id=? AND kind='DIGITAL_ASSET'",[model]))[0][0],stored);
    e.checks.push({own_case:own.id,actor:role,model_status:entry.current_status,asset_exposed_as_file:false,
      authorization_statuses:authorization.records.map(x=>x.current_status),original_delete_case:'FOLLOW_UP',unchanged_original_model:true});
    e.result='PASS';
  }catch(error){e.result='FAIL';e.failure=error.message;throw error;}
  finally{
    try{
      if(server){server.closeAllConnections();await new Promise(ok=>server.close(ok));}
      await clone?.close();
    }catch(error){e.result='FAIL';e.cleanup_failure=error.message;throw error;}
    finally{e.finished_at=new Date().toISOString();await save();}
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
