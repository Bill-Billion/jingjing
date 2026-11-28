'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {cloneRecords,load,root,read,hash}=require('./test-fixtures/qa18-s4-delta-clone.cjs');
const {openBrowser,vueArtifact}=require('./test-fixtures/qa18-s4-artifact-browser.cjs');

const source='jx_test_stock_pm03_bc0dc2acab3d0887a8f10285';
const order='3edae015-5e9f-4d75-b386-0a3498d1aef6';
const prior=path.resolve(process.argv[2]||'');
const out=path.resolve(process.argv[3]||'');

async function main(){
  const evidence={product:'053168fb6e06b80680101702a733357309368809',order,started_at:new Date().toISOString(),
    checks:[],browser_requests:[],api:[]};
  assert(prior.startsWith(path.join(root,'.local/qa18')+path.sep));
  assert(out.startsWith(path.join(root,'.local/qa18')+path.sep));
  const frozen=await read(path.join(prior,'RESULT.json'));
  assert(frozen.result==='PASS'&&frozen.source_database===source);
  await fs.mkdir(out,{recursive:true});
  const save=()=>fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(evidence,null,2)+'\n');
  let clone,server,browser;
  const actor='stock_buyer',foreign='stock_outsider';
  try{
    clone=await cloneRecords({source,directory:path.join(root,'.local/stock-sandbox',source),out,
      actors:[actor,foreign],proof:evidence,resume:{...frozen,directory:prior}});
    const {db,disk,roles,secret}=clone;
    server=load('src/http/account-api').createAccountApi({db,secret,supplyStorageFactory:disk.storageFactory}).listen(0,'127.0.0.1');
    await new Promise((ok,fail)=>{server.once('listening',ok);server.once('error',fail);});
    const base='http://127.0.0.1:'+server.address().port+'/api/v1';
    const detail='/stock/purchases/'+order;
    async function get(role,route){
      const u=roles[role];
      const res=await fetch(base+route,{headers:{Authorization:'Bearer '+u.bearer_token,'X-Acting-Party':u.party_id},signal:AbortSignal.timeout(10000)});
      const bytes=Buffer.from(await res.arrayBuffer()),data=JSON.parse(bytes);
      evidence.api.push({role,route,status:res.status,sha256:hash(bytes),error:data.error?.code});
      return {status:res.status,body:data.data};
    }
    const own=await get(actor,detail);
    assert.equal(own.status,200);
    assert.equal(own.body.data.status,'REVOKED');
    const file=await get(actor,detail+'/content');
    assert.equal(file.status,409);
    assert.equal((await get(foreign,detail)).status,404);
    assert.equal((await get(foreign,detail+'/content')).status,404);
    const original=await get(actor,'/trade/records/'+order);
    assert.equal(original.body.data.financial.received_minor,100);
    assert.equal(original.body.data.financial.refunded_minor,100);
    assert.equal(original.body.data.financial.net_minor,0);
    const [journal]=await db.execute('SELECT * FROM trade_journal WHERE order_id=? ORDER BY id',[order]);
    const fixedVue=process.argv[4];
    const vue=vueArtifact(out,fixedVue);
    browser=await openBrowser(base,roles,evidence,{vue});
    for(const [surface,route] of [['app','/stock/purchase?orderId='+order],['vue',detail]]){
      const page=await browser.actor(surface,actor,route);
      try{
        await page.waitForLoadState('networkidle',{timeout:15000});
        assert(evidence.browser_requests.some(row=>row.surface===surface&&row.path==='/api/v1'+detail&&row.status===200));
        if(surface==='app')await page.getByRole('checkbox',{name:'许可已撤回',exact:true}).waitFor();
        else await page.getByText('本单许可已撤销，请停止使用已保存的影片。',{exact:true}).waitFor();
        const name=surface==='app'?'受控播放已购作品':'明确取得正式影片';
        const download=page.getByRole('button',{name,exact:true});
        assert(await download.count()===0||await download.isDisabled());
        assert(!evidence.browser_requests.some(row=>row.surface===surface&&row.path.endsWith('/content')));
        evidence.checks.push({surface,order,license:'REVOKED',no_client_download:true});
        await save();
      }catch(error){
        const snapshot=await page.locator('body').ariaSnapshot({timeout:1500}).catch(()=>'');
        await fs.writeFile(path.join(out,surface+'.aria.txt'),snapshot);
        throw error;
      }finally{await page.context().close();}
    }
    if(process.argv[5]){
      const activeOrder=process.argv[5];
      assert.match(activeOrder,/^[a-f0-9-]{36}$/);
      const activeDetail='/stock/purchases/'+activeOrder;
      const originalActive=await get(actor,activeDetail);
      assert.equal(originalActive.body.order_status,'PAID');
      assert.equal(originalActive.body.data.status,'ACTIVE');
      assert.equal(originalActive.body.data.current_case_id,null);
      const page=await browser.actor('vue',actor,activeDetail);
      try{
        const button=page.getByRole('button',{name:'明确取得正式影片',exact:true});
        const content='/api/v1'+activeDetail+'/content';
        const pending=page.waitForResponse(response=>new URL(response.url()).pathname===content,{timeout:12000});
        pending.catch(()=>{});
        await button.click();
        const response=await pending;
        assert.equal(response.status(),200);
        const bytes=await response.body();
        assert(bytes.length>8);
        assert.equal(bytes.subarray(4,8).toString(),'ftyp');
        await page.locator('video[src^="blob:"]').waitFor();
        assert(evidence.browser_requests.filter(row=>row.surface==='vue'&&row.path==='/api/v1'+activeDetail&&row.status===200).length>=2);
        evidence.checks.push({surface:'vue',order:activeOrder,license:'ACTIVE',approved_full_content:true,bytes:bytes.length,sha256:hash(bytes)});
      }catch(error){
        await fs.writeFile(path.join(out,'vue-active.aria.txt'),await page.locator('body').ariaSnapshot({timeout:1500}).catch(()=>''));
        throw error;
      }finally{await page.context().close();}
    }
    assert(!evidence.browser_requests.some(row=>row.method==='POST'));
    assert.deepEqual((await db.execute('SELECT * FROM trade_journal WHERE order_id=? ORDER BY id',[order]))[0],journal);
    evidence.result='PASS';
    console.log('PASS both clients do not allow old fully refunded file, original contract and ledger retained');
  }catch(error){evidence.result='FAIL';evidence.failure=error.message;throw error;}
  finally{
    try{
      await browser?.close();
      if(server){server.closeAllConnections();await new Promise(ok=>server.close(ok));}
      await clone?.close();
    }catch(error){evidence.result='FAIL';evidence.cleanup_failure=error.message;throw error;}
    finally{evidence.finished_at=new Date().toISOString();await save();}
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
