'use strict';
// Retained same-record HTTP checks of the batch fixture; no App/Web acceptance claim.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID:key}=require('node:crypto');
const root=path.resolve(__dirname,'..');
require(path.join(root,'晶晶日上工程交接包/01_源码/backend_server/scripts/test-network-guard.cjs'));
async function main(){
 const retained=process.argv[3]==='--verify-retained';
 if(process.argv.length!==(retained?4:3))throw Error('Usage: node scripts/pm03-batch-smoke.cjs ENV_DIRECTORY [--verify-retained]');
 const out=path.resolve(process.argv[2]);assert.equal(path.dirname(out),path.join(root,'.local/stock-sandbox'));assert.match(path.basename(out),/^jx_test_stock_pm03_[a-f0-9]{24}$/);
 const access=JSON.parse(await fs.readFile(path.join(out,'access.json'),'utf8'));assert.equal(access.mode,'BATCH');assert.equal(access.synthetic_only,true);assert.match(access.base_url,/^http:\/\/127\.0\.0\.1:[0-9]+\/api\/v1$/);assert.ok(Date.parse(access.expires_at)>Date.now());
 const people=structuredClone(access.accounts),checks=[],records={},s=access.scenarios;
 async function call(method,url,role,body,account=false,version){
  const u=people[role],res=await fetch(access.base_url+url,{method,headers:{...u?.token?{Authorization:'Bearer '+u.token}:{},...u&&!account?{'X-Acting-Party':u.party_id}:{},...body?{'Content-Type':'application/json','Idempotency-Key':key()}:{},...version?{'If-Match':'"'+version+'"'}:{}},...body?{body:JSON.stringify(body)}:{}});
  const value=await res.json();return {status:res.status,...value};
 }
 const ok=(r,label)=>{assert.equal(r.status,200,label+': '+(r.error?.code||r.status));return r.data;};
 const check=async(label,fn)=>{await fn();checks.push(label);console.log('PASS '+label);};
 if(retained){
  const saved=JSON.parse(await fs.readFile(path.join(out,'batch-smoke-private.json'),'utf8'));assert.equal(saved.source_sha256,access.source_sha256);Object.assign(people,saved.people);
  const h=ok(await call('GET','/redemption/holds/'+saved.records.hold_id,'buyer'),'retained hold');assert.equal(h.id,saved.records.hold_id);assert.equal(h.object_version,saved.records.hold_version);
  const r=ok(await call('GET','/wallet/guardian-recharge-refunds/'+saved.records.guardian_case_id,'stock_seller',null,true),'retained guardian case');assert.equal(r.id,saved.records.guardian_case_id);
  const result={status:'PASS',synthetic_only:true,check:'same login sessions, hold ID/version and guardian case after restart',source_sha256:access.source_sha256,versions:access.versions,frontend_tested:false};
  await fs.writeFile(path.join(out,'batch-retained-check.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));return;
 }
 for(const role of ['buyer','artist','participant','reviewer','stock_buyer','stock_seller','notices_seller','auditions_buyer','mcn_staff']){
  await check('SMS login: '+role,async()=>{
   const u=people[role],challenge=ok(await call('POST','/auth/sms-challenges',null,{phone:u.phone,purpose:'LOGIN'}),'challenge'),sms=JSON.parse(await fs.readFile(path.join(out,'sms',challenge.challenge_id+'.json'),'utf8'));
   const login=ok(await call('POST','/auth/sessions',null,{phone:u.phone,challenge_id:challenge.challenge_id,code:sms.code}),'session');u.token=login.access_token;assert.equal(login.account.id,u.account_id);
  });
 }
 await check('guardian selection and new refund case use guardian account',async()=>{
  const g=s.guardian_refund,options=ok(await call('GET','/wallet/guardian-recharge-refund-options?guardian_link_id='+g.guardian_link_id,'stock_seller',null,true),'choices');assert.equal(options.child_party_id,g.child_party_id);assert.ok(options.items.some(r=>r.id===g.recharge_id));
  const r=ok(await call('POST','/wallet/guardian-recharge-refunds','stock_seller',access.requests.guardian_refund,true),'guardian case');records.guardian_case_id=r.id;
  assert.equal((await call('GET','/wallet/guardian-recharge-refund-options?guardian_link_id='+g.guardian_link_id,'stock_buyer',null,true)).status,403);
 });
 await check('notice original-key acknowledgement',async()=>{
  const n=s.notice_receipt,r=ok(await call('GET','/notices/operations/'+n.operation_key+'?operation=SUBMIT','notices_seller'),'notice receipt');assert.equal(r.outcome,'COMMITTED');assert.equal(r.record_id,n.submission_id);
 });
 await check('coupon hold current ID/version and cross-party denial',async()=>{
  const g=ok(await call('GET','/redemption/grants/'+s.coupon.grant_id,'buyer'),'grant');
  const h=ok(await call('POST','/redemption/grants/'+g.id+'/checkout','buyer',{quote_id:s.coupon.quote_id},false,g.object_version),'hold');
  const current=ok(await call('GET','/redemption/holds/'+h.id,'buyer'),'hold lookup');assert.equal(current.object_version,h.object_version);assert.equal(current.current_status,'HELD');
  assert.equal((await call('GET','/redemption/holds/'+h.id,'stock_buyer')).status,404);records.hold_id=h.id;records.hold_version=h.object_version;
 });
 await check('performer commercial rule choices and participation read',async()=>{
  const r=ok(await call('GET','/projects/candidates/'+s.participation.candidate_id+'/participation-rules','artist'),'rules');assert.ok(r.items.some(x=>x.marketplace_finance.platform_bps===2200));
  ok(await call('GET','/projects/records/'+s.participation.agreement_id,'artist'),'agreement');
 });
 await check('audition, competition, cocreation, privacy, MCN and operator reads',async()=>{
  ok(await call('GET','/auditions/records/'+s.audition_accepted.booking_id,'auditions_buyer'),'audition');
  ok(await call('GET','/engagement/competitions/'+s.competition.event_id,'stock_buyer',null,true),'competition');
  ok(await call('GET','/cocreation/rooms/'+s.cocreation_ready.room_id,'participant'),'cocreation');
  ok(await call('GET','/privacy/requests/'+s.privacy.request_id,'buyer',null,true),'privacy');
  ok(await call('GET','/engagement/mcn/dashboard','mcn_staff'),'mcn');
  ok(await call('GET','/projects/records/'+s.participation.project_id,'reviewer',null,true),'operator');
 });
 await check('exact contract and applied database migration',async()=>{assert.equal(access.versions.contract,'0.31.79-rc.1');assert.equal(access.versions.migration,'0225');assert.equal(access.versions.applied_migrations,225);});
 const privateFile=path.join(out,'batch-smoke-private.json');await fs.writeFile(privateFile,'',{mode:0o600});await require('./test-fixtures/private-state.cjs').protectPrivateState(privateFile);await fs.writeFile(privateFile,JSON.stringify({people,records,source_sha256:access.source_sha256}));
 const result={status:'PASS',synthetic_only:true,frontend_tested:false,checks,records,versions:access.versions,source_sha256:access.source_sha256,revision:access.revision,checked_at:new Date().toISOString(),limits:access.coverage};
 await fs.writeFile(path.join(out,'batch-smoke.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length,frontend_tested:false}));
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
