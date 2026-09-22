'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');const express=require('express');
const {createAdapter,methods}=require('../src/modules/providers/adapter');
const {createPrivateStorage}=require('../src/modules/providers/private-storage');
const {createLogger,requestContext}=require('../src/infrastructure/observability');
const {createOperationsRouter}=require('../src/http/operations');
const silent=createLogger(()=>{});
const provider={provider_kind:'PaymentProvider',provider_code:'test-only',capability_code:'pay',environment:'SANDBOX'};
const inspection={implemented:true,configured:true,config_revision:'revision1'};
function verifiedRepo(revision='revision1',environment='SANDBOX') {return {read:async()=>({current_status:environment+'_VERIFIED',config_revision:revision,object_version:1,verification_history:[{environment,verified_state:environment+'_VERIFIED',config_revision:revision,object_version:1,evidence_ref:'synthetic-evidence'}]})};}
test('all six provider interfaces fail closed without implementations',async()=>{
 assert.equal(Object.keys(methods).length,6);
 for(const kind of Object.keys(methods)){
  const adapter=createAdapter({provider:{...provider,provider_kind:kind},logger:silent});
  assert.deepEqual(await adapter.inspect(),{implemented:false,configured:false});
  await assert.rejects(adapter.call(methods[kind][0],{}),{code:'PROVIDER_OPERATION_NOT_IMPLEMENTED'});
 }
});
test('configuration alone, wrong environment, stale proof and disabled status never call a provider',async()=>{
 let calls=0;const operations={create:async()=>{calls++;return {};}};
 for(const [repo,inspect,env,code] of [
  [verifiedRepo(),{implemented:false},'SANDBOX','PROVIDER_NOT_IMPLEMENTED'],
  [verifiedRepo(),{implemented:true,configured:false},'SANDBOX','PROVIDER_NOT_CONFIGURED'],
  [{read:async()=>null},inspection,'SANDBOX','PROVIDER_NOT_VERIFIED'],
  [verifiedRepo(),inspection,'LOCAL','PROVIDER_ENVIRONMENT_NOT_VERIFIED'],
  [verifiedRepo(),inspection,'PRODUCTION','PROVIDER_NOT_VERIFIED'],
  [verifiedRepo('old'),inspection,'SANDBOX','PROVIDER_CONFIGURATION_CHANGED'],
  [{read:async()=>({...await verifiedRepo().read(),object_version:2})},inspection,'SANDBOX','VERIFICATION_EVIDENCE_REQUIRED'],
  [{read:async()=>({...await verifiedRepo().read(),current_status:'DISABLED_BY_PRODUCT'})},inspection,'SANDBOX','PROVIDER_NOT_VERIFIED'],
  [{read:async()=>{throw new Error('password raw-body');}},inspection,'SANDBOX','PROVIDER_STATE_UNAVAILABLE'],
 ]){
  const adapter=createAdapter({provider:{...provider,environment:env},repository:repo,inspect:()=>inspect,operations,logger:silent});
  await assert.rejects(adapter.call('create',{}),{code});
 }
 assert.equal(calls,0);
});
test('timeout reports unknown outcome, aborts and never automatically repeats payment',async()=>{
 let calls=0,signal;const lines=[];
 const adapter=createAdapter({provider,repository:verifiedRepo(),inspect:()=>inspection,logger:createLogger(line=>lines.push(JSON.parse(line))),timeoutMs:10,
  operations:{create:async(input,context)=>{calls++;signal=context.signal;return new Promise(()=>{});}}});
 await assert.rejects(adapter.call('create',{}, {request_id:'req-1',actor:'actor-1',acting_party:'party-1',job_id:'job-1',payment_tx_id:'pay-1'}),{code:'PROVIDER_OUTCOME_UNKNOWN'});
 assert.equal(calls,1);assert.equal(signal.aborted,true);assert.equal(lines.at(-1).request_id,'req-1');assert.equal(lines.at(-1).job_id,'job-1');
});
test('provider error bodies and logger metadata do not leak credentials or private URLs',async()=>{
 const lines=[];const logger=createLogger(line=>lines.push(line));
 const adapter=createAdapter({provider,repository:verifiedRepo(),inspect:()=>inspection,logger,operations:{create:async()=>{throw new Error('secret-credential https://private/link');}}});
 await assert.rejects(adapter.call('create',{}),error=>error.message==='PROVIDER_CALL_FAILED');
 logger.error('private https://link',{password:'secret-credential',body:{idCard:'123'},url:'https://private/link',actor:'actor-1',provider_request_id:'request-oss-1'});
 assert.doesNotMatch(lines.join('\n'),/secret-credential|https:|idCard|password/);assert.equal(JSON.parse(lines.at(-1)).actor,'actor-1');
});
const ossEnv={NODE_ENV:'test',OSS_ENVIRONMENT:'SANDBOX',OSS_REGION:'oss-cn-hangzhou',OSS_BUCKET:'jx-synthetic-test',OSS_ACCESS_KEY_ID:'synthetic-id',OSS_ACCESS_KEY_SECRET:'synthetic-secret'};
function privateFixture(options={}) {
 let api;const calls=[];const client={
  put:async(...args)=>{calls.push(['put',...args]);return {res:{headers:{'x-oss-request-id':'oss-1'}}};},
  get:async()=>({content:Buffer.from('private')}),delete:async()=>({}),
  signatureUrlV4:async(...args)=>{calls.push(['sign',...args]);return 'https://private.example.test/object?signature=synthetic';},
 };
 api=createPrivateStorage({env:ossEnv,repository:{read:async()=>verifiedRepo(api.inspect().config_revision).read()},authorize:async()=>true,clientFactory:()=>client,logger:silent,...options});
 return {api,calls,client};
}
test('private files require permission and verified configuration, never local fallback',async()=>{
 let created=0;const forbidden=privateFixture({authorize:async()=>false,clientFactory:()=>{created++;throw Error('must not run');}});
 await assert.rejects(forbidden.api.put({key:'private/party-1/a',body:Buffer.from('private')}),{code:'PRIVATE_ASSET_FORBIDDEN'});
 const unverified=privateFixture({repository:{read:async()=>null},clientFactory:()=>{created++;throw Error('must not run');}});
 await assert.rejects(unverified.api.put({key:'private/party-1/a',body:Buffer.from('private')}),{code:'PROVIDER_NOT_VERIFIED'});
 const missing=privateFixture({env:{NODE_ENV:'test'},clientFactory:()=>{created++;throw Error('must not run');}});
 await assert.rejects(missing.api.put({key:'private/party-1/a',body:Buffer.from('private')}),{code:'PROVIDER_NOT_CONFIGURED'});assert.equal(created,0);
 assert.throws(()=>forbidden.api.publicUrl(),{code:'PRIVATE_ASSET_HAS_NO_PUBLIC_URL'});
});
test('private OSS writes enforce private ACL and no overwrite; scoped URLs expire and calls are checked every time',async()=>{
 const checked=[];const {api,calls}=privateFixture({authorize:async(input)=>{checked.push(input);return input.context.acting_party==='party-1';}});
 const context={acting_party:'party-1'},key='private/party-1/asset.bin';
 const result=await api.put({key,body:Buffer.from('private')},context);
 assert.equal(result.size,7);assert.equal(result.sha256.length,64);assert.equal(result.url,undefined);
 assert.deepEqual(calls[0][3].headers,{'x-oss-object-acl':'private','x-oss-forbid-overwrite':'true'});
 assert.equal((await api.getBuffer(key,context)).toString(),'private');
 assert.equal((await api.signedUrl(key,{expires:60},context)).expires,60);assert.deepEqual(calls[1],['sign','GET',60,undefined,key]);
 await api.remove(key,context);assert.deepEqual(checked.map(x=>x.operation),['put','get','sign','remove']);
 await assert.rejects(api.signedUrl(key,{expires:901},context),{code:'INVALID_URL_EXPIRY'});
 await assert.rejects(api.signedUrl(key,{},{}),{code:'PRIVATE_ASSET_FORBIDDEN'});
 for(const bad of ['public/party-1/file','private/party-1/../file','private/party-1/a//b'])await assert.rejects(api.put({key:bad,body:Buffer.from('x')},context),{code:'INVALID_PRIVATE_OBJECT_KEY'});
 await assert.rejects(api.put({key,body:Buffer.from('x'),isPrivate:false},context),{code:'PRIVATE_STORAGE_ONLY'});
});
test('changing OSS credentials invalidates proof and real SDK signs V4 offline over HTTPS',async()=>{
 const first=privateFixture().api.inspect();
 const changed=privateFixture({env:{...ossEnv,OSS_ACCESS_KEY_SECRET:'changed-synthetic-secret'},repository:verifiedRepo(first.config_revision)}).api;
 await assert.rejects(changed.put({key:'private/party-1/file',body:Buffer.from('x')}),{code:'PROVIDER_CONFIGURATION_CHANGED'});
 let real;real=createPrivateStorage({env:ossEnv,repository:{read:async()=>verifiedRepo(real.inspect().config_revision).read()},authorize:async()=>true,logger:silent});
 const result=await real.signedUrl('private/party-1/file');
 const url=new URL(result.url);assert.equal(url.protocol,'https:');assert.equal(url.searchParams.get('x-oss-expires'),'300');assert.ok(url.searchParams.get('x-oss-signature'));assert.equal(url.pathname,'/private/party-1/file');
});
function get(server,route,headers={}) {return new Promise((resolve,reject)=>{http.get({hostname:'127.0.0.1',port:server.address().port,path:route,headers},res=>{let text='';res.on('data',x=>text+=x);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(text)}));}).on('error',reject);});}
test('health stays up, readiness reflects actual dependencies, and concurrent request IDs stay separate',async(t)=>{
 const lines=[];const logger=createLogger(line=>lines.push(JSON.parse(line)));let state='no';
 const app=express();app.use(requestContext(logger));app.use(createOperationsRouter({timeoutMs:15,databaseReady:async()=>{if(state==='hang')return new Promise(()=>{});if(state==='error')throw Error('private-db-password');return state==='yes';}}));
 app.get('/correlate',async(req,res)=>{await new Promise(resolve=>setTimeout(resolve,5));logger.info('inside_request');res.json({id:req.requestId});});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 assert.equal((await get(server,'/health')).body.data.current_status,'UP');
 for(const value of ['no','error','hang']){state=value;const result=await get(server,'/ready');assert.equal(result.status,503);assert.equal(result.body.data.current_status,'NOT_READY');assert.equal(result.headers['cache-control'],'no-store');}
 state='yes';assert.equal((await get(server,'/ready')).status,200);
 const results=await Promise.all([get(server,'/correlate',{'X-Request-Id':'forged','X-Acting-Party':'forged'}),get(server,'/correlate')]);
 assert.notEqual(results[0].body.id,results[1].body.id);
 for(const result of results){assert.equal(result.headers['x-request-id'],result.body.id);assert.ok(lines.some(x=>x.event==='inside_request'&&x.request_id===result.body.id));}
 assert.doesNotMatch(JSON.stringify(lines),/forged|private-db-password/);
});

test('OSS failures never produce a successful or public result; revocation is checked before each read',async()=>{
 let allowed=true,calls=0;const lines=[];
 const {api}=privateFixture({authorize:async()=>allowed,logger:createLogger(line=>lines.push(line)),clientFactory:()=>({get:async()=>{calls++;throw Error('upstream secret-credential private-object');}})});
 await assert.rejects(api.getBuffer('private/party-1/file'),{code:'PROVIDER_CALL_FAILED'});
 allowed=false;await assert.rejects(api.getBuffer('private/party-1/file'),{code:'PRIVATE_ASSET_FORBIDDEN'});assert.equal(calls,1);
 assert.ok(lines.some(x=>x.includes('private_asset_blocked')));assert.doesNotMatch(lines.join('\n'),/secret-credential|private-object/);
 const broken=privateFixture({authorize:async()=>{throw Error('authorization secret-credential');}}).api;
 await assert.rejects(broken.getBuffer('private/party-1/file'),{code:'PRIVATE_AUTHORIZATION_UNAVAILABLE'});
 const misconfigured=privateFixture({env:{...ossEnv,NODE_ENV:'production'}}).api;
 assert.equal(misconfigured.inspect().configured,false);
});

test('legacy photo upload returns a clear failure and never creates a record when private storage is unavailable',async(t)=>{
 const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
 const filename=path.resolve(__dirname,'../routes/humans.js'),realRequire=Module.createRequire(filename);
 const config=realRequire('../config'),oldEnv=config.env,oldOss=config.upload.oss.enabled;config.env='test';config.upload.oss.enabled=false;
 t.after(()=>{config.env=oldEnv;config.upload.oss.enabled=oldOss;});
 let writes=0;const auth=(req,res,next)=>{req.userId=1;next();};auth.optionalAuth=auth;
 const loaded=new Module(filename);loaded.filename=filename;
 loaded.require=(id)=>id==='../db'?{prepare:()=>{writes++;throw Error('must not create a record');}}:id==='../middleware/auth'?auth:realRequire(id);
 loaded._compile(fs.readFileSync(filename,'utf8'),filename);
 const app=express();app.use(loaded.exports);const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const boundary='jx-test-boundary';const body=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\nTest\r\n--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="test.jpg"\r\nContent-Type: image/jpeg\r\n\r\nsynthetic-file\r\n--${boundary}--\r\n`);
 const result=await new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:'/',method:'POST',headers:{'Content-Type':`multipart/form-data; boundary=${boundary}`,'Content-Length':body.length}},res=>{let text='';res.on('data',x=>text+=x);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}));});
  req.on('error',reject);req.end(body);
 });
 assert.equal(result.status,503);assert.equal(result.body.code,'PRIVATE_STORAGE_UNAVAILABLE');assert.equal(writes,0);assert.equal(server.listening,true);
});
