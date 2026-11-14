'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process'),{once}=require('node:events'),{randomUUID}=require('node:crypto');
test('isolated SMS API fixture uses the actual config proof and recovers after simulated unavailability',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async()=>{
 const root=path.resolve(__dirname,'../../../..'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'jx-sms-fixture-')),state=path.join(dir,'state.json');
 const env={...process.env,PR11_UI_STATE_FILE:state,PR11_UI_API_PORT:'0',PR11_UI_CONTROL_PORT:'0'};delete env.DEBUG;delete env.NODE_DEBUG;
 const child=spawn(process.execPath,[path.join(root,'scripts/pr11-ui-test-server.cjs'),'--test-only'],{cwd:root,env,stdio:['ignore','pipe','pipe'],windowsHide:true});
 let exit=null,output='';child.on('exit',(code,signal)=>{exit={code,signal};});for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{output=(output+b.toString()).slice(-10000);});
 let config;
 try{
  const until=Date.now()+30000;
  while(Date.now()<until){
   if(exit)assert.fail('Fixture exited before readiness; status='+exit.code+'; config_changed='+output.includes('PROVIDER_CONFIGURATION_CHANGED'));
   try{config=JSON.parse(await fs.readFile(state,'utf8'));break;}catch(e){if(e.code!=='ENOENT')throw e;}
   await new Promise(r=>setTimeout(r,100));
  }
  assert.ok(config,'Fixture readiness timeout');assert.equal(config.testOnly,true);
  const control=async route=>{const r=await fetch(config.controlUrl+route,{method:route.startsWith('/sms?')?'POST':'GET',headers:{Authorization:'Bearer '+config.controlToken}});assert.equal(r.status,200);return r.json();};
  let phone='13900009008';
  const request=async(route,body)=>{const r=await fetch(config.apiUrl+'/api/v1'+route,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
  let metrics=await control('/metrics');const before=metrics.dispatches;assert.ok(before>=2);
  await control('/sms?enabled=false');assert.equal((await request('/auth/sms-challenges',{phone,purpose:'LOGIN'})).status,503);assert.equal((await control('/metrics')).dispatches,before);
  await control('/sms?enabled=true');assert.equal((await request('/auth/sms-challenges',{phone,purpose:'LOGIN'})).status,429);assert.equal((await control('/metrics')).dispatches,before);
  phone='13900009009';const challenge=await request('/auth/sms-challenges',{phone,purpose:'LOGIN'});assert.equal(challenge.status,200);
  const {code}=await control('/code?phone='+phone);const login=await request('/auth/sessions',{phone,challenge_id:challenge.body.data.challenge_id,code});assert.equal(login.status,200);
  const me=await fetch(config.apiUrl+'/api/v1/me',{headers:{Authorization:'Bearer '+login.body.data.access_token}});assert.equal(me.status,200);assert.equal((await control('/metrics')).dispatches,before+1);
 }finally{
  if(config&&!exit){try{await fetch(config.controlUrl+'/shutdown',{method:'POST',headers:{Authorization:'Bearer '+config.controlToken}});}catch{}}
  if(!exit)await Promise.race([once(child,'exit'),new Promise(r=>setTimeout(r,5000))]);
  if(!exit){child.kill('SIGTERM');await once(child,'exit');}
  assert.equal(path.dirname(dir),await fs.realpath(os.tmpdir()));assert.ok(path.basename(dir).startsWith('jx-sms-fixture-'));await fs.rm(dir,{recursive:true,force:true});
 }
 assert.equal(exit?.code,0,'Fixture must cleanly shut down its isolated servers/database');
});
