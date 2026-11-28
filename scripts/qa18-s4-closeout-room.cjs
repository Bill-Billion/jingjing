'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {cloneRecords,load,root,read,hash}=require('./test-fixtures/qa18-s4-delta-clone.cjs');
const {openBrowser}=require('./test-fixtures/qa18-s4-artifact-browser.cjs');
const runDir=path.join(root,'.local/qa18/s4-a-closeout-20261128');
const precedent=path.join(root,'.local/qa18/s2-20261127/05');
const out=path.resolve(process.argv[2]||'');

async function main(){
  assert(out.startsWith(runDir+path.sep));
  await fs.mkdir(out,{recursive:true});
  await fs.writeFile(path.join(out,'RUN_ONCE'),'same approved creator context and a fresh story',{flag:'wx'});
  const previous=await read(path.join(precedent,'browser/checkpoint.json'));
  const prep=await read(path.join(precedent,'prepared/prepared.json'));
  assert(previous.environment===prep.environment&&previous.room.id&&previous.story.template_version_id);
  const e={original_room:previous.room.id,started_at:new Date().toISOString(),requests:[],browser_requests:[],checks:[]};
  const save=()=>fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(e,null,2)+'\n');
  let clone,server,browser,page;
  try{
    clone=await cloneRecords({source:previous.environment,directory:path.join(root,'.local/stock-sandbox',previous.environment),
      out,actors:['buyer','outsider'],proof:e,restoreFiles:false});
    const {roles,db,secret}=clone;
    server=load('src/http/account-api').createAccountApi({db,secret,tradeEnv:{CUSTOMIZATION_MERCHANT_PARTY_ID:prep.spec.merchant_party_id}}).listen(0,'127.0.0.1');
    await new Promise((ok,fail)=>{server.once('listening',ok);server.once('error',fail);});
    const base='http://127.0.0.1:'+server.address().port+'/api/v1';
    async function api(role,uri,{body,version,status=200,party=true}={}){
      const r=await fetch(base+uri,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+roles[role].bearer_token,
        ...party?{'X-Acting-Party':roles[role].party_id}:{},...body?{'Content-Type':'application/json','Idempotency-Key':randomUUID()}: {},
        ...version?{'If-Match':'"'+version+'"'}:{}},...body?{body:JSON.stringify(body)}:{},signal:AbortSignal.timeout(10000)});
      const bytes=Buffer.from(await r.arrayBuffer()),j=JSON.parse(bytes);
      e.requests.push({role,uri,status:r.status,code:j.error?.code,id:j.data?.id,sha256:hash(bytes)});
      await save();
      assert.equal(r.status,status,uri+' '+j.error?.code);
      return j.data||j.error;
    }
    const story=await api('buyer','/customization-requests',{body:{template_version_id:previous.story.template_version_id,answers:previous.story.answers}});
    const submitted=await api('buyer','/customization-requests/'+story.id+'/submissions',{body:{},version:story.object_version});
    assert.equal(submitted.current_status,'SUBMITTED');
    assert.notEqual(submitted.id,previous.story.id);
    const parentRooms=async()=> (await db.execute("SELECT id,data_sha256,current_status FROM cocreation_records WHERE kind='ROOM' ORDER BY id"))[0];
    const before=await parentRooms();
    assert(before.some(x=>x.id===previous.room.id));
    const appDir=path.join(runDir,'app-isolated-final'),vueDir=path.join(root,'.local/qa18/s4-a-remaining-20261128/builds/vue-stock');
    const art=async dir=>{const m=await read(dir+'.json');return {dir,manifest:dir+'.json',source:m.source,checkout:m.checkout};};
    browser=await openBrowser(base,roles,e,{app:await art(appDir),vue:await art(vueDir)});
    page=await browser.actor('vue','buyer','/cocreation/rooms');
    await page.locator('.business-actions').getByRole('button',{name:'为原故事建立共创房间',exact:true}).click();
    const rules=await api('buyer','/cocreation/rules',{party:false});
    const rule=rules.items.find(r=>r.rule.version===previous.rule.rule.version);
    assert(rule);
    for(const [key,label,value] of [['request_id','本人已提交的原故事',story.id],
      ['producer_party_id','本故事的平台承制方',prep.spec.merchant_party_id],['rule_id','本故事的生效参加规则',rule.id]]){
      await page.getByRole('button',{name:'读取可选'+label,exact:true}).click();
      await page.locator('#room-'+key+' option[value="'+value+'"]').waitFor({state:'attached'});
      await page.locator('#room-'+key).selectOption(value);
    }
    const submit=page.getByTestId('business-room');
    const checks=page.locator('form').last().getByRole('checkbox');
    for(const check of await checks.all())await check.check();
    const beforeInvalid=e.browser_requests.filter(x=>x.method==='POST'&&x.path==='/api/v1/cocreation/rooms').length;
    const roomRows=await parentRooms();
    assert.deepEqual(roomRows,before);
    const deadline=new Date(Date.now()+8*3600000+3600000).toISOString().slice(0,16);
    for(const[key,value]of Object.entries({title:'末轮同版新故事无房间验证',deadline,purpose:'PRIVATE',territory:'CN'}))await page.locator('#room-'+key).fill(value);
    if(!await checks.last().isChecked())await checks.last().check();
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/cocreation/rooms'&&r.request().method()==='POST',{timeout:14000});
    response.catch(()=>{});
    await submit.click();
    const r=await response;
    const result=await r.json();
    assert.equal(r.status(),200,result.error?.code);
    const room=result.data;
    assert.equal(room.current_status,'OPEN');
    const [[link]]=await db.execute('SELECT room_id FROM cocreation_rooms WHERE request_id=?',[story.id]);
    assert.equal(link.room_id,room.id);
    const [[stored]]=await db.execute("SELECT data_json FROM cocreation_records WHERE id=? AND kind='ROOM'",[room.id]);
    const data=typeof stored.data_json==='string'?JSON.parse(stored.data_json):stored.data_json;
    assert.equal(data.producer_party_id,prep.spec.merchant_party_id);
    assert.equal(data.purpose,'PRIVATE');
    assert.equal(new Date(room.deadline).getTime()>Date.now(),true);
    const after=await parentRooms();
    assert.equal(after.length,before.length+1);
    assert.deepEqual(after.filter(x=>x.id!==room.id),before);
    assert.equal(e.browser_requests.filter(x=>x.method==='POST'&&x.path==='/api/v1/cocreation/rooms').length,beforeInvalid+1);
    await api('outsider','/cocreation/rooms/'+room.id,{status:404});
    e.checks.push({vue_room:room.id,story:story.id,original_rule:rule.id,producer:data.producer_party_id,empty_to_open:true,earlier_rooms_preserved:true});
    e.result='PASS';
  }catch(error){
    e.result='FAIL';e.failure=error.message;
    if(page)await fs.writeFile(path.join(out,'room.aria.txt'),await page.locator('body').ariaSnapshot().catch(()=>''));
    throw error;
  }finally{
    try{
      await browser?.close();
      if(server){server.closeAllConnections();await new Promise(ok=>server.close(ok));}
      await clone?.close();
    }finally {e.finished_at=new Date().toISOString();await save();}
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
