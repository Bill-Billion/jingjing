'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {cloneRecords,load,root,read}=require('./test-fixtures/qa18-s4-delta-clone.cjs');
const {openBrowser,vueArtifact}=require('./test-fixtures/qa18-s4-artifact-browser.cjs');

const source='jx_test_stock_pm03_bc0dc2acab3d0887a8f10285';
const orderId='1ca81699-247e-446a-883a-0bb54441f8b9';
const prior=path.resolve(process.argv[2]||'');
const out=path.resolve(process.argv[3]||'');
const archiveMode=process.argv[4]==='archive';
const openMode=process.argv[4]==='open';
const fixedVue=process.argv[5];

async function main(){
  assert(prior.startsWith(path.join(root,'.local/qa18')+path.sep));
  assert(out.startsWith(path.join(root,'.local/qa18')+path.sep));
  const settlement=await read(path.join(prior,'RESULT.json'));
  assert.equal(settlement.result,'PASS');
  assert.equal(settlement.order_id,orderId);
  assert.equal(settlement.source_database,source);
  const evidence={product:settlement.product,source_database:source,settlement_id:settlement.settlement,order_id:orderId,
    started_at:new Date().toISOString(),browser_requests:[],checks:[]};
  await fs.mkdir(out,{recursive:true});
  const save=()=>fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(evidence,null,2)+'\n');
  let clone,server,browser;
  const record=settlement.settlement;
  const booking=openMode?'ae12af30-476f-4abb-ac45-5f2c9610c87a':settlement.booking_id;
  try{
    clone=await cloneRecords({source,directory:path.join(root,'.local/stock-sandbox',source),out,
      actors:['auditions_buyer','auditions_seller','auditions_buyer2'],proof:evidence,resume:openMode?undefined:{...settlement,directory:prior},restoreFiles:!openMode});
    const {db,disk,roles,secret}=clone;
    const [[before]]=await db.execute('SELECT current_status,object_version,data_sha256 FROM finance_records WHERE id=?',[record]);
    if(!openMode)assert.equal(before.current_status,'APPROVED');
    server=load('src/http/account-api').createAccountApi({db,secret,supplyStorageFactory:disk.storageFactory}).listen(0,'127.0.0.1');
    await new Promise((ok,fail)=>{server.once('listening',ok);server.once('error',fail);});
    const api='http://127.0.0.1:'+server.address().port+'/api/v1';
    const vue=vueArtifact(out,fixedVue,'latest');
    browser=await openBrowser(api,roles,evidence,{vue});
    if(openMode){
      const route='/auditions/messages/'+booking;
      const apiPath='/api/v1/auditions/bookings/'+booking+'/messages';
      const text='QA 隔离会话：验证原会话允许明确提交一条新消息。';
      const [[initial]]=await db.execute("SELECT COUNT(*) AS total FROM audition_records WHERE parent_id=? AND kind='MESSAGE'",[booking]);
      const page=await browser.actor('vue','auditions_buyer',route);
      try{
        await page.getByRole('button',{name:'发送本单消息',exact:true}).click();
        await page.getByLabel('消息类别',{exact:true}).selectOption('TEXT');
        await page.getByLabel('本单消息',{exact:true}).fill(text);
        await page.getByRole('checkbox',{name:/已阅读当前记录与本次约定/}).check();
        const written=page.waitForResponse(r=>new URL(r.url()).pathname===apiPath&&r.request().method()==='POST');
        written.catch(()=>{});
        const refreshed=page.waitForResponse(r=>new URL(r.url()).pathname===apiPath&&r.request().method()==='GET');
        refreshed.catch(()=>{});
        await page.getByTestId('business-message').click();
        const result=await written;
        assert.equal(result.status(),200);
        const message=(await result.json()).data;
        assert.equal((await (await refreshed).json()).data.conversation_status,'OPEN');
        await page.getByText(text,{exact:true}).first().waitFor();
        assert(await page.getByTestId('business-message').isVisible());
        const [[last]]=await db.execute("SELECT COUNT(*) AS total FROM audition_records WHERE parent_id=? AND kind='MESSAGE'",[booking]);
        assert.equal(Number(last.total)-Number(initial.total),1);
        evidence.checks.push({surface:'vue',booking,message:message.id,write_status:200,fresh_read:'OPEN',new_messages:1});
      }catch(error){
        await fs.writeFile(path.join(out,'vue-open.aria.txt'),await page.locator('body').ariaSnapshot({timeout:1500}).catch(()=> ''));
        throw error;
      }finally{await page.context().close();}
      evidence.result='PASS';
      console.log('PASS the existing open synthetic audition thread remains writable and rereads current state after one send');
      return;
    }
    const filePath=archiveMode?'/api/v1/auditions/bookings/'+booking+'/messages':'/api/v1/finance/records/'+record;
    for(const surface of ['app','vue']){
      const route=archiveMode
        ? (surface==='app'?'/auditions/messages?bookingId='+booking:'/auditions/messages/'+booking)
        : (surface==='app'?'/finance/record?recordId='+record:'/finance/records/'+record);
      for(const role of ['auditions_buyer','auditions_buyer2']){
        const page=await browser.actor(surface,role,route);
        try {
          await page.waitForLoadState('networkidle',{timeout:15000});
          const access=evidence.browser_requests.filter(x=>x.surface===surface&&x.role===role&&x.path===filePath);
          if(role==='auditions_buyer'){
            if(archiveMode){
              assert(access.some(x=>x.status===200));
              assert.equal(await page.getByRole('button',{name:/^发送消息$|^发送本单消息$|^发送本次消息$/}).count(),0);
            }else{
              assert(access.some(x=>x.status===200&&x.id===record&&x.state==='APPROVED'));
              await page.getByRole('heading',{name:/结算|清分/}).first().waitFor();
            }
          }else{
            const recordDenied=archiveMode&&surface==='app'&&evidence.browser_requests.some(x=>
              x.surface===surface&&x.role===role&&x.path==='/api/v1/auditions/records/'+booking&&x.status===404);
            assert(recordDenied||access.some(x=>x.status===404));
            assert(!access.some(x=>x.status===200));
          }
          evidence.checks.push({surface,role,record_status:role==='auditions_buyer'?(archiveMode?'ARCHIVED':'APPROVED'):'DENIED',http:role==='auditions_buyer'?200:404});
          await save();
        }catch(error){
          await fs.writeFile(path.join(out,surface+'-'+role+'.aria.txt'),await page.locator('body').ariaSnapshot({timeout:1500}).catch(()=> ''));
          throw error;
        }finally{await page.context().close();}
      }
    }
    if(archiveMode){
      const actor=roles.auditions_buyer;
      const headers={Authorization:'Bearer '+actor.bearer_token,'X-Acting-Party':actor.party_id};
      const baseline=await fetch(new URL(filePath,api),{headers,signal:AbortSignal.timeout(10000)});
      assert.equal(baseline.status,200);
      const first=(await baseline.json()).data;
      assert.equal(first.conversation_status,'ARCHIVED');
      const {randomUUID}=require('node:crypto');
      const denied=await fetch(new URL(filePath,api),{method:'POST',headers:{...headers,'Content-Type':'application/json','Idempotency-Key':randomUUID()},
        body:JSON.stringify({kind:'TEXT',body:'合成隔离测试：归档后不可新发消息'}),signal:AbortSignal.timeout(10000)});
      assert.equal(denied.status,409);
      const blocked=(await denied.json()).error.code;
      assert.equal(blocked,'AUDITION_CONVERSATION_ARCHIVED');
      const second=await fetch(new URL(filePath,api),{headers,signal:AbortSignal.timeout(10000)});
      assert.equal(second.status,200);
      assert.deepEqual((await second.json()).data,first);
      evidence.checks.push({booking,state:'ARCHIVED',readonly_replay_identical:true,api_write_denied:409,error:blocked});
    }
    assert(!evidence.browser_requests.some(row=>row.method==='POST'));
    assert.deepEqual((await db.execute('SELECT current_status,object_version,data_sha256 FROM finance_records WHERE id=?',[record]))[0][0],before);
    evidence.result='PASS';
    console.log('PASS App and Vue read the naturally settled original record and reject unrelated identity');
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
