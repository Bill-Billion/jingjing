'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const crypto=require('node:crypto'),http=require('node:http'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database');
const {migrate}=require('../src/infrastructure/database/migrator');
const {createAccountApi}=require('../src/http/account-api');
const {createAuthRepository}=require('../src/modules/auth/repository');
const {createAdapter}=require('../src/modules/providers/adapter');
const {createReadinessRepository}=require('../src/modules/providers/readiness');
const {createSmsProvider}=require('../src/modules/providers/sms');
const key=()=>crypto.randomUUID();
test('real MySQL and HTTP account lifecycle',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 assert.equal(env.NODE_ENV,'test');assert.equal(env.DB_CLIENT,'mysql');assert.equal(env.MYSQL_HOST,'127.0.0.1');assert.equal(env.MYSQL_PORT,'33316');assert.equal(env.MYSQL_USER,'jx_local');assert.equal(env.MYSQL_DATABASE,'jx_dev');
 const name=`jx_test_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;assert.match(name,/^jx_test_\d+_[a-f0-9]{12}$/);
 const control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
 let db,server;const responses=[];
 try {
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
  db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const secret=crypto.randomBytes(32).toString('base64'),settings={ipSendsPerHour:1000,totalSendsPerHour:1000,ipLoginsPerMinute:1000};
  const descriptor={provider_kind:'SmsProvider',provider_code:'synthetic-only',capability_code:'login_sms',environment:'SANDBOX'};
  const readiness=createReadinessRepository(db,{authorizeChange:async()=>true,verifyEvidence:async()=>true});
  const sent=new Map();let calls=0,unknown=false;
  const sms=createAdapter({provider:descriptor,repository:readiness,inspect:async()=>({implemented:true,configured:true,config_revision:'synthetic-v1'}),logger:{info(){},warn(){},error(){}},operations:{send:async input=>{calls++;sent.set(input.phone,input.code);if(unknown)throw Error('synthetic uncertain dispatch');return {accepted:true,provider_request_id:'synthetic'};}}});
  const auth=createAuthRepository(db,{secret,sms,settings});
  const app=createAccountApi({db,secret,sms,authSettings:settings,allowedOrigins:['http://localhost:5173']});
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  function request(method,url,body,token=null,headers={}) {
   return new Promise((resolve,reject)=>{
    const bytes=body===undefined?Buffer.alloc(0):Buffer.from(JSON.stringify(body));
    const req=http.request({hostname:'127.0.0.1',port:server.address().port,method,path:url,headers:{'Content-Type':'application/json','Content-Length':bytes.length,...(token?{Authorization:'Bearer '+token}:{}),...headers}},res=>{
     let raw='';res.on('data',v=>raw+=v);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:raw?JSON.parse(raw):null}));
    });req.setTimeout(5000,()=>req.destroy(Error('local HTTP timeout')));req.on('error',reject);req.end(bytes);
   });
  }
  let sequence=0;const nextPhone=()=>String(13900000000+(++sequence));
  async function challenge(phone=nextPhone(),k=key()){const response=await request('POST','/api/v1/auth/sms-challenges',{phone,purpose:'LOGIN'},null,{'Idempotency-Key':k});return {phone,k,response,code:sent.get(phone)};}
  async function login(c,k=key()){return request('POST','/api/v1/auth/sessions',{phone:c.phone,challenge_id:c.response.body.data.challenge_id,code:c.code},null,{'Idempotency-Key':k});}
  async function user(){const c=await challenge();assert.equal(c.response.status,200);const r=await login(c);assert.equal(r.status,200,JSON.stringify(r.body));return {token:r.body.data.access_token,id:r.body.data.account.id,c,response:r};}
  function record(schema,response){assert.equal(response.status,200,JSON.stringify(response.body));const value=structuredClone(response.body);if(value.data?.access_token)value.data.access_token='synthetic-token-not-usable';responses.push({schema,value});}
  function recordError(response,status,code,retryable){
   assert.equal(response.status,status);assert.equal(response.body.error.code,code);assert.equal(response.body.error.retryable,retryable);
   responses.push({schema:'ErrorResponse',value:response.body});
  }
  async function withApi(overrides,work){
   const previous=server,temporary=createAccountApi({db,secret,sms,authSettings:settings,allowedOrigins:['http://localhost:5173'],...overrides}).listen(0,'127.0.0.1');
   await new Promise(resolve=>temporary.once('listening',resolve));server=temporary;
   try{return await work();}finally{server=previous;await new Promise(resolve=>temporary.close(resolve));}
  }
  await t.test('probes work; missing provider evidence and legacy tokens do not grant login',async()=>{
   record('HealthResponse',await request('GET','/health'));record('ReadyResponse',await request('GET','/ready'));
   assert.equal((await request('GET','/api/v1/me')).status,401);
   assert.equal((await request('GET','/api/v1/me',undefined,'legacy.jwt.token')).status,401);
   const r=await challenge();recordError(r.response,503,'SMS_NOT_READY',false);assert.equal(calls,0);assert.ok(!JSON.stringify(r.response.body).includes(r.phone));
   await assert.rejects(createSmsProvider(db,{NODE_ENV:'test'}).call('send',{phone:nextPhone(),code:'123456'}),{code:'PROVIDER_NOT_CONFIGURED'});
   await readiness.record({...descriptor,current_status:'SANDBOX_VERIFIED',config_revision:'synthetic-v1',expected_version:0,evidence_ref:'synthetic-no-network'},{actor_ref:'test-only'});
  });
  await t.test('duplicate SMS requests dispatch once and keep phone/code out of storage and response',async()=>{
   const phone=nextPhone(),k=key(),before=calls;
   const pair=await Promise.all([challenge(phone,k),challenge(phone,k)]);
   assert.equal(calls,before+1);assert.ok(pair.some(x=>x.response.status===200));
   const again=await challenge(phone,k);record('SmsChallengeResponse',again.response);
   assert.ok(!JSON.stringify(again.response.body).includes(again.code));
   const [[row]]=await db.execute('SELECT * FROM auth_challenges WHERE id=?',[again.response.body.data.challenge_id]);
   assert.ok(!Object.values(row).includes(again.code));assert.ok(!Object.values(row).includes(phone));
  });
  await t.test('login consumes once and replays the same protected session even with reordered JSON',async()=>{
   const c=await challenge(),k=key();const [a,b]=await Promise.all([login(c,k),login(c,k)]);
   record('SessionResponse',a);assert.equal(b.status,200);assert.equal(a.body.data.access_token,b.body.data.access_token);
   const token=a.body.data.access_token,me=await request('GET','/api/v1/me',undefined,token);record('AccountResponse',me);
   assert.deepEqual(me.body.data.allowed_actions,['READ_ACCOUNT','LIST_PARTIES','CREATE_ORGANIZATION']);
   assert.equal(me.headers['cache-control'],'no-store');assert.equal(me.headers.etag,'"1"');assert.equal(me.body.meta.actor.account_id,me.body.data.id);
   const parties=await request('GET','/api/v1/me/parties',undefined,token);record('PartyPageResponse',parties);assert.equal(parties.body.data.items.length,1);assert.equal(parties.body.data.items[0].party.kind,'PERSON');
   assert.deepEqual(parties.body.data.items[0].party.allowed_actions,['READ_PARTY','REQUEST_CAPABILITY']);
   assert.deepEqual(parties.body.data.items[0].membership.allowed_actions,[]);
   assert.equal((await login(c)).status,401);
   const [[stored]]=await db.execute('SELECT * FROM auth_login_results WHERE token_hash=?',[auth.secure.digest('token',token)]);assert.ok(!stored.encrypted_token.includes(token));
   const reordered=await request('POST','/api/v1/auth/sessions',{code:c.code,phone:c.phone,challenge_id:c.response.body.data.challenge_id},null,{'Idempotency-Key':k});assert.equal(reordered.status,200);assert.equal(reordered.body.data.access_token,token);
  });
  await t.test('attempt counters commit on failure; expired and superseded codes are rejected',async()=>{
   const c=await challenge(),input={phone:c.phone,challenge_id:c.response.body.data.challenge_id,code:c.code==='000000'?'000001':'000000'};
   for(let i=0;i<5;i++)assert.equal((await request('POST','/api/v1/auth/sessions',input,null,{'Idempotency-Key':key()})).status,401);
   assert.equal((await login(c)).status,401);
   const [[row]]=await db.execute('SELECT attempts FROM auth_challenges WHERE id=?',[input.challenge_id]);assert.equal(row.attempts,5);
   const expired=await challenge();await db.execute('UPDATE auth_challenges SET expires_ms=1 WHERE id=?',[expired.response.body.data.challenge_id]);assert.equal((await login(expired)).status,401);
   const old=await challenge();await db.execute('UPDATE auth_subjects SET next_send_ms=0 WHERE phone_hash=?',[auth.secure.digest('phone',old.phone)]);const fresh=await challenge(old.phone);assert.equal(fresh.response.status,200);assert.equal((await login(old)).status,401);assert.equal((await login(fresh)).status,200);
  });
  await t.test('different concurrent login keys cannot mint two sessions from one code',async()=>{
   const c=await challenge();const results=await Promise.all([login(c),login(c)]);
   assert.deepEqual(results.map(x=>x.status).sort(),[200,401]);
   const success=results.find(x=>x.status===200);
   const [[row]]=await db.execute('SELECT COUNT(*) AS n FROM auth_sessions WHERE account_id=?',[success.body.data.account.id]);assert.equal(Number(row.n),1);
  });
  await t.test('untrusted identities, malformed bodies and oversized input fail without exposing secrets',async()=>{
   const denied=await request('GET','/api/v1/me',undefined,'a'.repeat(43),{'X-Admin-Token':'synthetic','X-Request-Id':'safe-request-id'});
   assert.equal(denied.status,401);assert.equal(denied.body.meta.actor,null);assert.equal(denied.body.meta.request_id,'safe-request-id');responses.push({schema:'ErrorResponse',value:denied.body});
   assert.equal((await request('POST','/api/v1/auth/sms-challenges','not-an-object',null,{'Idempotency-Key':key()})).status,400);
   const oversized=await request('POST','/api/v1/auth/sessions',{secret:'x'.repeat(17000)},null,{'Idempotency-Key':key()});assert.equal(oversized.status,413);assert.ok(!JSON.stringify(oversized.body).includes('xxxxx'));
   const c=await challenge();assert.equal((await request('POST','/api/v1/auth/sessions',{phone:c.phone,challenge_id:c.response.body.data.challenge_id,code:c.code,actor:'admin'},null,{'Idempotency-Key':key()})).status,400);
   assert.equal((await login(c)).status,200);
  });
  await t.test('provider uncertainty neither reports SENT nor resends an identical request',async()=>{
   unknown=true;const phone=nextPhone(),k=key(),before=calls;try{
    const first=await challenge(phone,k);recordError(first.response,503,'SMS_NOT_READY',false);
    recordError((await challenge(phone,k)).response,503,'SMS_CHALLENGE_UNAVAILABLE',false);assert.equal(calls,before+1);
    const [[row]]=await db.execute('SELECT id FROM auth_challenges WHERE phone_hash=?',[auth.secure.digest('phone',phone)]);
    assert.equal((await request('POST','/api/v1/auth/sessions',{phone,challenge_id:row.id,code:sent.get(phone)},null,{'Idempotency-Key':key()})).status,401);
   }finally{unknown=false;}
  });
  await t.test('actual SMS provider composition logs in via HTTP and unknown dispatch cannot login or resend',async()=>{
   const {EventEmitter}=require('node:events'),received=new Map();let dispatches=0,fail=false;
   const config={NODE_ENV:'test',SMS_ENABLED:'true',VOLC_ACCESS_KEY_ID:'fake-id',VOLC_SECRET_ACCESS_KEY:'fake-secret',SMS_ACCOUNT:'fake-account',SMS_SIGN_NAME:'测试',SMS_LOGIN_TEMPLATE_ID:'fake-template',SMS_CONFIG_REVISION:'http-sms-v1'};
   const transport=(options,callback)=>{dispatches++;assert.equal(options.hostname,'sms.volcengineapi.com');const req=new EventEmitter();req.destroy=()=>{};req.setTimeout=()=>{};req.end=body=>{
    const value=JSON.parse(body);received.set(value.PhoneNumbers,JSON.parse(value.TemplateParam).code);
    queueMicrotask(()=>{if(fail){req.emit('error',Error('simulated timeout'));return;}const res=new EventEmitter();res.statusCode=200;res.complete=true;res.destroy=()=>{};callback(res);res.emit('data',Buffer.from(JSON.stringify({ResponseMetadata:{RequestId:'fake-http-request'},Result:{MessageID:['fake-http-message']}})));res.emit('end');});
   };return req;};
   const provider=createSmsProvider(db,config,{request:transport});
   await withApi({sms:provider},async()=>{
    const blocked=await challenge();assert.equal(blocked.response.status,503);assert.equal(dispatches,0);
    await readiness.record({...provider.identity,current_status:'SANDBOX_VERIFIED',config_revision:config.SMS_CONFIG_REVISION,expected_version:0,evidence_ref:'synthetic-transport-only'},{actor_ref:'test-only'});
    const c=await challenge();assert.equal(c.response.status,200);c.code=received.get(c.phone);const k=key(),a=await login(c,k);assert.equal(a.status,200);assert.equal((await login(c,k)).body.data.access_token,a.body.data.access_token);assert.equal(dispatches,1);
    assert.equal((await request('GET','/api/v1/me',undefined,a.body.data.access_token)).status,200);
    fail=true;const broken=await challenge();assert.equal(broken.response.status,503);assert.equal(dispatches,2);
    const [[stored]]=await db.execute('SELECT * FROM auth_challenges WHERE phone_hash=?',[auth.secure.digest('phone',broken.phone)]);assert.equal(stored.current_status,'UNKNOWN');
    const attempt=await request('POST','/api/v1/auth/sessions',{phone:broken.phone,challenge_id:stored.id,code:received.get(broken.phone)},null,{'Idempotency-Key':key()});assert.equal(attempt.status,401);
    assert.equal((await challenge(broken.phone,broken.k)).response.status,503);assert.equal(dispatches,2);
   });
   const changed=createSmsProvider(db,{...config,SMS_CONFIG_REVISION:'http-sms-v2'},{request:transport});
   await assert.rejects(changed.call('send',{phone:nextPhone(),code:'123456'}),{code:'PROVIDER_CONFIGURATION_CHANGED'});assert.equal(dispatches,2);
  });
  await t.test('HTTP invitations require the intended recipient; removal preserves personal identity',async()=>{
   const owner=await user(),recipient=await user(),outsider=await user();
   const org=await request('POST','/api/v1/organizations',{display_name:'合成机构'},owner.token,{'Idempotency-Key':key()});record('OrganizationResultResponse',org);
   const partyId=org.body.data.party_id,headers={'X-Acting-Party':partyId,'Idempotency-Key':key()},base='/api/v1/parties/'+partyId;
   const owned=await request('GET',base,undefined,owner.token,headers);record('PartyResponse',owned);
   assert.deepEqual(owned.body.data.allowed_actions,['READ_PARTY','REQUEST_CAPABILITY','MANAGE_MEMBERS']);
   assert.equal((await request('GET',base,undefined,outsider.token,headers)).status,404);
   assert.equal((await request('GET',base,undefined,owner.token,{'X-Acting-Party':key()})).status,403);
   assert.equal((await request('GET',base,undefined,owner.token)).status,400);
   assert.equal((await request('POST',base+'/invitations',{invitee_account_id:recipient.id,expires_at:new Date(Date.now()+3600000).toISOString(),role:'OWNER'},owner.token,headers)).status,400);
   const inv=await request('POST',base+'/invitations',{invitee_account_id:recipient.id,expires_at:new Date(Date.now()+3600000).toISOString()},owner.token,headers);record('InvitationCreatedResponse',inv);
   const invitationId=inv.body.data.invitation_id,url=base+'/invitations/'+invitationId+'/responses',acceptHeaders={...headers,'Idempotency-Key':key(),'If-Match':'"1"'};
   assert.equal((await request('POST',url,{decision:'ACCEPT'},outsider.token,acceptHeaders)).status,404);
   assert.equal((await request('POST',url,{decision:'ACCEPT'},recipient.token,headers)).status,428);
   record('InvitationPageResponse',await request('GET','/api/v1/me/invitations',undefined,recipient.token));
   const a=await request('POST',url,{decision:'ACCEPT'},recipient.token,acceptHeaders);record('InvitationResponseResultResponse',a);
   assert.deepEqual((await request('POST',url,{decision:'ACCEPT'},recipient.token,acceptHeaders)).body.data,a.body.data);
   const memberView=await request('GET',base,undefined,recipient.token,headers);record('PartyResponse',memberView);
   assert.deepEqual(memberView.body.data.allowed_actions,['READ_PARTY']);
   recordError(await request('GET',base+'/members',undefined,recipient.token,headers),403,'PARTY_ACTION_FORBIDDEN',false);
   record('MemberPageResponse',await request('GET',base+'/members',undefined,owner.token,headers));
   const remove=await request('DELETE',base+'/members/'+recipient.id,{},owner.token,{...headers,'Idempotency-Key':key(),'If-Match':'"1"'});record('MemberRemovedResponse',remove);
   assert.equal((await request('POST',url,{decision:'ACCEPT'},recipient.token,acceptHeaders)).status,403);
   assert.equal((await request('GET','/api/v1/me/parties',undefined,recipient.token)).body.data.items.length,1);
   const capability=await request('POST',base+'/capabilities',{code:'MCN'},owner.token,{...headers,'Idempotency-Key':key()});record('CapabilityGrantResponse',capability);
   assert.deepEqual(capability.body.data.allowed_actions,[]);
   for(const status of ['SUSPENDED','CLOSED']){
    await db.execute('UPDATE parties SET current_status=? WHERE id=?',[status,partyId]);
    const inactive=await request('GET',base,undefined,owner.token,headers);record('PartyResponse',inactive);
    assert.deepEqual(inactive.body.data.allowed_actions,[]);
   }
  });
  await t.test('rename replays original result, rejects stale versions and cursors from another account/resource',async()=>{
   const u=await user(),other=await user();
   for(const display_name of ['A','B'])assert.equal((await request('POST','/api/v1/organizations',{display_name},u.token,{'Idempotency-Key':key()})).status,200);
   const first=await request('GET','/api/v1/me/parties?limit=1',undefined,u.token),cursor=first.body.data.next_cursor;assert.ok(cursor);
   const second=await request('GET','/api/v1/me/parties?limit=1&cursor='+encodeURIComponent(cursor),undefined,u.token);assert.notEqual(first.body.data.items[0].party.id,second.body.data.items[0].party.id);
   assert.equal((await request('GET','/api/v1/me/parties?limit=1&cursor='+encodeURIComponent(cursor),undefined,other.token)).status,400);
   assert.equal((await request('GET','/api/v1/me/invitations?cursor='+encodeURIComponent(cursor),undefined,u.token)).status,400);
   assert.equal((await request('GET','/api/v1/me/parties?limit=101',undefined,u.token)).status,400);
   const partyId=first.body.data.items[0].party.id,url='/api/v1/parties/'+partyId,headers={'X-Acting-Party':partyId,'Idempotency-Key':key(),'If-Match':'"1"'};
   const a=await request('PATCH',url,{display_name:'改名一'},u.token,headers);record('PartyResponse',a);
   assert.equal((await request('PATCH',url,{display_name:'改名二'},u.token,{...headers,'Idempotency-Key':key(),'If-Match':'"2"'})).status,200);
   assert.deepEqual((await request('PATCH',url,{display_name:'改名一'},u.token,headers)).body.data,a.body.data);
   recordError(await request('PATCH',url,{display_name:'过期改名'},u.token,{...headers,'Idempotency-Key':key()}),412,'VERSION_CONFLICT',false);
  });
  await t.test('an uncertain committed organization and rename replay the original result without duplicate writes',async()=>{
   const u=await user(),headers={'Idempotency-Key':key()},body={display_name:'提交后连接中断'};
   let loseReply=true;
   const proxy={...db,withTransaction:async work=>{const result=await db.withTransaction(work);if(loseReply){loseReply=false;throw Object.assign(Error('synthetic lost commit acknowledgement'),{code:'COMMIT_OUTCOME_UNKNOWN'});}return result;}};
   await withApi({db:proxy},async()=>{
    recordError(await request('POST','/api/v1/organizations',body,u.token,headers),503,'COMMIT_OUTCOME_UNKNOWN',true);
    const replay=await request('POST','/api/v1/organizations',body,u.token,headers);record('OrganizationResultResponse',replay);
    const [[count]]=await db.execute("SELECT COUNT(*) AS n FROM parties WHERE created_by=? AND kind='ORGANIZATION'",[u.id]);assert.equal(Number(count.n),1);
    const partyId=replay.body.data.party_id,url='/api/v1/parties/'+partyId,renameHeaders={'Idempotency-Key':key(),'X-Acting-Party':partyId,'If-Match':'"1"'};
    loseReply=true;
    recordError(await request('PATCH',url,{display_name:'只改一次'},u.token,renameHeaders),503,'COMMIT_OUTCOME_UNKNOWN',true);
    const renamed=await request('PATCH',url,{display_name:'只改一次'},u.token,renameHeaders);record('PartyResponse',renamed);
    assert.equal(renamed.body.data.object_version,2);assert.equal(renamed.body.data.display_name,'只改一次');
    const latest=await request('GET',url,undefined,u.token,renameHeaders);assert.equal(latest.body.data.object_version,2);
   });
  });
  await t.test('an uncertain committed login replays one session and does not send another SMS',async()=>{
   const c=await challenge(),k=key(),before=calls;let loseReply=true;
   const proxy={...db,withTransaction:async work=>{const result=await db.withTransaction(work);if(loseReply&&result?.token){loseReply=false;throw Object.assign(Error('synthetic lost login commit acknowledgement'),{code:'COMMIT_OUTCOME_UNKNOWN'});}return result;}};
   await withApi({db:proxy},async()=>{
    recordError(await login(c,k),503,'COMMIT_OUTCOME_UNKNOWN',true);
    const recovered=await login(c,k);record('SessionResponse',recovered);
    const again=await login(c,k);assert.equal(again.body.data.access_token,recovered.body.data.access_token);
    const [[count]]=await db.execute('SELECT COUNT(*) AS n FROM auth_sessions WHERE account_id=?',[recovered.body.data.account.id]);assert.equal(Number(count.n),1);assert.equal(calls,before);
   });
  });
  await t.test('pending command can be retried, while changed content with the same key cannot',async()=>{
   const u=await user(),headers={'Idempotency-Key':key()},body={display_name:'等待原操作'};
   const original=await request('POST','/api/v1/organizations',body,u.token,headers);assert.equal(original.status,200);
   const [[command]]=await db.execute("SELECT id,result_json FROM party_commands WHERE actor_account_id=? AND operation_code='CREATE_ORGANIZATION'",[u.id]);
   // Model a persisted pending command; no second business write may be started.
   await db.execute('UPDATE party_commands SET result_json=NULL WHERE id=?',[command.id]);
   recordError(await request('POST','/api/v1/organizations',body,u.token,headers),409,'IDEMPOTENCY_IN_PROGRESS',true);
   recordError(await request('POST','/api/v1/organizations',{display_name:'不是同一操作'},u.token,headers),409,'IDEMPOTENCY_CONFLICT',false);
   const [[count]]=await db.execute("SELECT COUNT(*) AS n FROM parties WHERE created_by=? AND kind='ORGANIZATION'",[u.id]);assert.equal(Number(count.n),1);
   await db.execute('UPDATE party_commands SET result_json=? WHERE id=?',[typeof command.result_json==='string'?command.result_json:JSON.stringify(command.result_json),command.id]);
   assert.deepEqual((await request('POST','/api/v1/organizations',body,u.token,headers)).body.data,original.body.data);
  });
  await t.test('unknown service failures do not advertise automatic retry or expose internal errors',async()=>{
   const proxy={...db,execute:async()=>{throw Object.assign(Error('synthetic private database details'),{code:'ER_TEST_UNAVAILABLE'});}};
   await withApi({db:proxy},async()=>{
    const r=await request('GET','/api/v1/me',undefined,'a'.repeat(43));recordError(r,503,'SERVICE_UNAVAILABLE',false);
    assert.ok(!JSON.stringify(r.body).includes('private'));assert.equal(r.headers['retry-after'],undefined);
   });
  });
  await t.test('declining and owner revocation create no membership; unknown caller fields are rejected',async()=>{
   const owner=await user(),recipient=await user();
   assert.equal((await request('POST','/api/v1/organizations',{display_name:'x',actor:'admin'},owner.token,{'Idempotency-Key':key()})).status,400);
   const org=await request('POST','/api/v1/organizations',{display_name:'invitation cases'},owner.token,{'Idempotency-Key':key()});
   const partyId=org.body.data.party_id,base='/api/v1/parties/'+partyId,headers={'X-Acting-Party':partyId,'Idempotency-Key':key()};
   const body={invitee_account_id:recipient.id,expires_at:new Date(Date.now()+3600000).toISOString()};
   const first=await request('POST',base+'/invitations',body,owner.token,headers);
   const declined=await request('POST',base+'/invitations/'+first.body.data.invitation_id+'/responses',{decision:'DECLINE'},recipient.token,{...headers,'If-Match':'"1"','Idempotency-Key':key()});record('InvitationResponseResultResponse',declined);assert.equal(declined.body.data.membership_id,null);
   const second=await request('POST',base+'/invitations',body,owner.token,{...headers,'Idempotency-Key':key()});
   const revokeUrl=base+'/invitations/'+second.body.data.invitation_id+'/revocations';
   assert.equal((await request('POST',revokeUrl,{},recipient.token,{...headers,'If-Match':'"1"'})).status,403);
   record('InvitationRevokedResponse',await request('POST',revokeUrl,{},owner.token,{...headers,'If-Match':'"1"','Idempotency-Key':key()}));
   assert.equal((await request('GET',base,undefined,recipient.token,headers)).status,404);
  });
  await t.test('logout, expiry and account suspension are enforced on subsequent HTTP calls',async()=>{
   const u=await user();record('SessionRevokedResponse',await request('DELETE','/api/v1/auth/sessions/current',{},u.token,{'Idempotency-Key':key()}));
   assert.equal((await request('GET','/api/v1/me',undefined,u.token)).status,401);
   assert.equal((await request('DELETE','/api/v1/auth/sessions/current',{},u.token,{'Idempotency-Key':key()})).status,200);
   const v=await user();await db.execute("UPDATE identity_accounts SET current_status='SUSPENDED' WHERE id=?",[v.id]);
   const suspended=await request('GET','/api/v1/me',undefined,v.token);record('AccountResponse',suspended);assert.deepEqual(suspended.body.data.allowed_actions,[]);
   assert.equal((await request('POST','/api/v1/organizations',{display_name:'no'},v.token,{'Idempotency-Key':key()})).status,403);
   await db.execute('UPDATE auth_sessions SET expires_ms=1 WHERE account_id=?',[v.id]);assert.equal((await request('GET','/api/v1/me',undefined,v.token)).status,401);
  });
  await t.test('rate limits survive a fresh repository and browser origins are explicit',async()=>{
   const input={phone:nextPhone(),challenge_id:key(),code:'123456'},ip='synthetic-rate-limit';
   const options={secret,sms,settings:{...settings,ipLoginsPerMinute:1}};
   await assert.rejects(createAuthRepository(db,options).login(input,key(),ip),{code:'INVALID_CREDENTIALS'});
   await assert.rejects(createAuthRepository(db,options).login(input,key(),ip),e=>e.code==='RATE_LIMITED'&&e.retryAfter>0&&e.retryAfter<=60);
   const c=await challenge();assert.equal((await challenge(c.phone)).response.status,429);
   assert.equal((await request('OPTIONS','/api/v1/me',undefined,null,{Origin:'http://localhost:5173'})).status,204);
   assert.equal((await request('OPTIONS','/api/v1/me',undefined,null,{Origin:'https://unapproved.invalid'})).status,403);
  });
  await t.test('rate limits report real remaining seconds through HTTP, including limits after SMS reservation',async()=>{
   const c=await challenge(),before=calls;
   await db.execute('UPDATE auth_subjects SET next_send_ms=ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+12500 WHERE phone_hash=?',[auth.secure.digest('phone',c.phone)]);
   const waiting=await request('POST','/api/v1/auth/sms-challenges',{phone:c.phone,purpose:'LOGIN'},null,{'Idempotency-Key':key(),Origin:'http://localhost:5173'});
   recordError(waiting,429,'RATE_LIMITED',true);assert.ok(Number(waiting.headers['retry-after'])>0&&Number(waiting.headers['retry-after'])<=13);
   assert.ok(waiting.headers['access-control-expose-headers'].split(', ').includes('Retry-After'));assert.equal(calls,before);
   await withApi({authSettings:{...settings,phoneSendsPerHour:1}},async()=>{
    const first=await challenge(),retryKey=key(),phoneHash=auth.secure.digest('phone',first.phone),rateHash=auth.secure.digest('rate',['sms-phone',phoneHash]),sentBefore=calls;
    await db.execute('UPDATE auth_subjects SET next_send_ms=0 WHERE phone_hash=?',[phoneHash]);
    await db.execute('UPDATE auth_rate_limits SET window_ms=ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)-3600000+12500 WHERE key_hash=?',[rateHash]);
    const limited=await challenge(first.phone,retryKey);recordError(limited.response,429,'RATE_LIMITED',true);assert.ok(Number(limited.response.headers['retry-after'])>0&&Number(limited.response.headers['retry-after'])<=13);
    recordError((await challenge(first.phone,retryKey)).response,503,'SMS_CHALLENGE_UNAVAILABLE',false);assert.equal(calls,sentBefore);
    await db.execute('UPDATE auth_rate_limits SET window_ms=0 WHERE key_hash=?',[rateHash]);
    await db.execute('UPDATE auth_subjects SET next_send_ms=0 WHERE phone_hash=?',[phoneHash]);
    const fresh=await challenge(first.phone);assert.equal(fresh.response.status,200);assert.equal(calls,sentBefore+1);
   });
  });
  await t.test('audit failure rolls back account, session and consumption; retry works after repair',async()=>{
   const c=await challenge(),loginKey=key();
   const proxy={...db,withTransaction:work=>db.withTransaction(tx=>work({execute:async(sql,args)=>{if(sql.startsWith('INSERT INTO party_audit_events'))throw Error('synthetic audit failure');return tx.execute(sql,args);}}))};
   await assert.rejects(createAuthRepository(proxy,{secret,sms,settings}).login({phone:c.phone,challenge_id:c.response.body.data.challenge_id,code:c.code},loginKey,'audit-test'),/synthetic audit failure/);
   const [[row]]=await db.execute('SELECT current_status FROM auth_challenges WHERE id=?',[c.response.body.data.challenge_id]);assert.equal(row.current_status,'SENT');assert.equal((await login(c,loginKey)).status,200);
  });
  await t.test('sessions survive fresh composition and expired secrets can be removed',async()=>{
   const u=await user();assert.equal((await createAuthRepository(db,{secret,sms,settings}).resolve(u.token)).id,u.id);
   await db.execute('UPDATE auth_sessions SET expires_ms=1 WHERE account_id=?',[u.id]);await db.execute('UPDATE auth_login_results SET expires_ms=1 WHERE token_hash=?',[auth.secure.digest('token',u.token)]);
   await auth.cleanup();await assert.rejects(auth.resolve(u.token),{code:'AUTHENTICATION_REQUIRED'});
  });
  await t.test('actual server entry starts only with explicit MySQL configuration and leaves SMS disabled',async()=>{
   const {main}=require('../src/http/main');
   await assert.rejects(main({NODE_ENV:'production'}),/EXPLICIT_MYSQL_ENV_REQUIRED/);
   // Reuse this suite's quota settings: earlier cases already sent more than the default hourly limit.
   const boot=await main({...env,MYSQL_DATABASE:name,AUTH_SECRET_BASE64:secret,AUTH_SETTINGS_JSON:JSON.stringify(settings),PORT:'0'}),previous=server;
   server=boot.server;
   try {
    assert.equal((await request('GET','/ready')).status,200);
    assert.equal((await request('GET','/api/v1/me')).status,401);
    assert.equal((await challenge()).response.status,503);
   }finally{server=previous;await boot.stop();}
  });
  const output=path.resolve(__dirname,'../../../..','.local/account-api-http-fixtures.json');await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify({synthetic_only:true,cases:responses},null,2));
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();
 }
});
