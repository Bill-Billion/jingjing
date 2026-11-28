'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {cloneRecords,load,root,read,hash}=require('./test-fixtures/qa18-s4-delta-clone.cjs');
const {openBrowser}=require('./test-fixtures/qa18-s4-artifact-browser.cjs');
const baseDir=path.join(root,'.local/qa18/s4-a-closeout-20261128');
const caseDir=path.join(root,'.local/qa18/s1-core-20261127/06-points');
const out=path.resolve(process.argv[2]||'');

async function main(){
  assert(out.startsWith(baseDir+path.sep));
  await fs.mkdir(out,{recursive:true});
  await fs.writeFile(path.join(out,'RUN_ONCE'),'observations on the original synthetic coupon only',{flag:'wx'});
  const prior=await read(path.join(caseDir,'journey/checkpoint.json'));
  assert(prior.complete);
  const grant=prior.grant.id,holds=[prior.holds.failed,prior.holds.retry];
  const e={source:prior.environment,started_at:new Date().toISOString(),grant,holds:holds.map(r=>r.id),requests:[],browser_requests:[],checks:[]};
  const save=()=>fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(e,null,2)+'\n');
  let clone,server,browser;
  try{
    clone=await cloneRecords({source:prior.environment,directory:caseDir,out,actors:['buyer','outsider'],proof:e,restoreFiles:false});
    const {db,secret,roles}=clone;
    server=load('src/http/account-api').createAccountApi({db,secret}).listen(0,'127.0.0.1');
    await new Promise((ok,fail)=>{server.once('listening',ok);server.once('error',fail);});
    const base='http://127.0.0.1:'+server.address().port+'/api/v1';
    async function api(role,route,{body,version,key=randomUUID(),status=200}={}){
      const actor=roles[role],resp=await fetch(base+route,{method:body?'POST':'GET',
        headers:{Authorization:'Bearer '+actor.bearer_token,'X-Acting-Party':actor.party_id,...body?{'If-Match':'"'+version+'"','Idempotency-Key':key,'Content-Type':'application/json'}:{}},
        ...body?{body:JSON.stringify(body)}:{},signal:AbortSignal.timeout(12000)});
      const raw=Buffer.from(await resp.arrayBuffer()),j=JSON.parse(raw);
      e.requests.push({role,route,http:resp.status,code:j.error?.code,sha256:hash(raw)});
      await save();
      assert.equal(resp.status,status,route+' '+j.error?.code);
      return j.data||j.error;
    }
    async function unchanged(){const q=[
      ["SELECT id,current_status,object_version,data_sha256 FROM redemption_records WHERE owner_party_id=? ORDER BY id",roles.buyer.party_id],
      ["SELECT id,current_status,object_version,data_sha256 FROM trade_records WHERE buyer_party_id=? ORDER BY id",roles.buyer.party_id],
      ["SELECT id,result_sha256 FROM redemption_commands ORDER BY id",undefined],
    ]; return Promise.all(q.map(async ([sql,id])=>(await db.execute(sql,id?[id]:[]))[0]));}
    const before=await unchanged();
    const row=await api('buyer','/redemption/grants/'+grant);
    assert.equal(row.current_status,'USED');
    assert.equal(row.data.checkout_hold_id,holds[1].id);
    for(const [index,h] of holds.entries()){
      const target='/redemption/holds/'+h.id;
      const old=await api('buyer',target);
      assert(Date.parse(old.data.expires_at)<Date.now());
      assert.equal(old.current_status,index===0?'RELEASED':'USED');
      await api('outsider',target,{status:404});
      await api('buyer',target+'/release',{body:{},version:old.object_version,status:409});
      assert.deepEqual(await api('buyer',target),old);
      e.checks.push({hold:old.id,state:old.current_status,expiry_passed:true,version:old.object_version,repeat_no_business_change:true});
    }
    const key=prior.grant.data.source[2];
    assert(typeof key==='string'&&/^(?:[a-f0-9-]{36}|app-[a-f0-9]{48})$/i.test(key),'Original receipt key is missing or unrecognized');
    const exchange=await api('buyer','/redemption/exchanges',{body:{stock_id:row.parent_id,template_sha256:row.data.template_sha256},
      version:prior.grant.object_version,key});
    assert.equal(exchange.id,grant);
    assert.equal(exchange.current_status,'AVAILABLE');
    assert.equal((await api('buyer','/redemption/grants/'+grant)).current_status,'USED');
    e.checks.push({original_exchange_returned_historical_receipt:true,current_grant_state:'USED'});
    const appDir=path.join(baseDir,'app-isolated-final'),vueDir=path.join(root,'.local/qa18/s4-a-remaining-20261128/builds/vue-stock');
    const artifact=async dir=>{const m=await read(dir+'.json');return {dir,manifest:dir+'.json',source:m.source,checkout:m.checkout};};
    browser=await openBrowser(base,roles,e,{app:await artifact(appDir),vue:await artifact(vueDir)});
    const hold=holds[1];
    for(const surface of ['app','vue']){
      const target=surface==='app'?'/redemption?view=checkout&recordId='+grant+'&quoteId='+hold.data.quote_id:'/redemption/holds/'+hold.id;
      const page=await browser.actor(surface,'buyer',target);
      try{
        await page.waitForLoadState('networkidle');
        assert(e.browser_requests.some(r=>r.surface===surface&&r.path==='/api/v1/redemption/holds/'+hold.id&&r.status===200));
        const aria=await page.locator('body').ariaSnapshot();
        assert(/已使用|已核销/.test(aria));
        if(surface==='app'){
          const accept=page.getByRole('button',{name:'采用本次抵扣，返回原报价确认',exact:true});
          if(await accept.count())assert(await accept.isDisabled());
        }else{
          assert.equal(await page.getByRole('button',{name:'确认并支付',exact:true}).count(),0);
        }
        e.checks.push({surface,hold:hold.id,opened_after_original_expiry:true,state:'USED',new_checkout_not_available:true});
      }catch(error){
        await fs.writeFile(path.join(out,surface+'.aria.txt'),await page.locator('body').ariaSnapshot().catch(()=>''));
        throw error;
      }finally{await page.context().close();}
    }
    assert.deepEqual(await unchanged(),before);
    e.result='PASS';
  }catch(error){e.result='FAIL';e.failure=error.message;throw error;}
  finally{
    try{
      await browser?.close();
      if(server){server.closeAllConnections();await new Promise(ok=>server.close(ok));}
      await clone?.close();
    }finally{e.finished_at=new Date().toISOString();await save();}
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
