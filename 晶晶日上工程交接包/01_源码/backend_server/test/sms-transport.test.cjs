 'use strict';
delete process.env.DEBUG; delete process.env.NODE_DEBUG;
require('../scripts/test-network-guard.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),crypto=require('node:crypto');
const {signedRequest,sendSms}=require('../src/modules/providers/sms-transport');
const {createSmsProvider}=require('../src/modules/providers/sms');
const env={NODE_ENV:'test',SMS_ENABLED:'true',VOLC_ACCESS_KEY_ID:'fake-id',VOLC_SECRET_ACCESS_KEY:'fake-secret',SMS_ACCOUNT:'fake-account',SMS_SIGN_NAME:'测试签名',SMS_LOGIN_TEMPLATE_ID:'fake-template',SMS_CONFIG_REVISION:'fake-v1'};
const input={phone:'13900000001',code:'012345'};
function fixture({status=200,body={ResponseMetadata:{RequestId:'fake-request'},Result:{MessageID:['fake-message']}},kind='end'}={}) {
 const state={calls:0,destroyed:0};
 state.request=(options,callback)=>{
  state.calls++;state.options=options;const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=()=>{state.destroyed++;};
  req.end=data=>{state.body=data;queueMicrotask(()=>{
   if(kind==='network'){req.emit('error',Error('raw private provider response'));return;}if(kind==='hang')return;
   const res=new EventEmitter();res.statusCode=status;res.complete=false;res.destroy=()=>{};callback(res);
   if(kind==='aborted'){res.emit('aborted');return;}
   res.emit('data',Buffer.from(typeof body==='string'?body:JSON.stringify(body)));if(kind==='close'){res.emit('close');return;}
   res.complete=true;res.emit('end');res.emit('close');
  });};return req;
 };return state;
}
test('signed bytes match independent crypto, fixed HTTPS and preserved zero',()=>{
 const {body,options}=signedRequest({...env,SMS_HOST:'untrusted.invalid'},input);assert.equal(options.hostname,'sms.volcengineapi.com');assert.equal(options.rejectUnauthorized,true);assert.equal(options.agent,false);assert.equal(options.headers['Content-Length'],Buffer.byteLength(body));
 assert.equal(JSON.parse(body).PhoneNumbers,input.phone);assert.equal(JSON.parse(JSON.parse(body).TemplateParam).code,'012345');
 const h={};for(const [k,v] of Object.entries(options.headers))h[k.toLowerCase()]=String(v);
 const a=/Credential=([^,]+),\s*SignedHeaders=([^,]+),\s*Signature=([a-f0-9]+)/.exec(h.authorization);assert(a);const scope=a[1].split('/').slice(1);assert.deepEqual(scope.slice(1),['cn-north-1','volcSMS','request']);
 const canonical=['POST','/','Action=SendSms&Version=2020-01-01',a[2].split(';').map(k=>`${k}:${h[k].trim()}`).join('\n')+'\n',a[2],crypto.createHash('sha256').update(body).digest('hex')].join('\n');
 const text=['HMAC-SHA256',h['x-date'],scope.join('/'),crypto.createHash('sha256').update(canonical).digest('hex')].join('\n');let key=Buffer.from('fake-secret');for(const part of scope)key=crypto.createHmac('sha256',key).update(part).digest();assert.equal(crypto.createHmac('sha256',key).update(text).digest('hex'),a[3]);
});
test('success sends once and returns no private payload',async()=>{const f=fixture();assert.deepEqual(await sendSms(env,input,{request:f.request}),{accepted:true,provider_request_id:'fake-request'});assert.equal(f.calls,1);assert.equal(f.destroyed,0);});
test('redirect, error, absent/invalid/multiple message IDs fail without retry',async()=>{
 for(const value of [{status:302},{status:401},{body:{ResponseMetadata:{RequestId:'x',Error:{Code:'Denied',Message:'private'}}}},{body:{ResponseMetadata:{RequestId:'x'},Result:{}}},{body:{ResponseMetadata:{RequestId:'x'},Result:{MessageID:['a','b']}}},{body:{ResponseMetadata:{RequestId:'x'},Result:{MessageID:[{}]}}}]){
  const f=fixture(value);await assert.rejects(sendSms(env,input,{request:f.request}),{code:'SMS_ACCEPTANCE_NOT_CONFIRMED'});assert.equal(f.calls,1);
 }
});
test('malformed, oversized, truncated response and connection failures remain unknown',async()=>{
 for(const options of [{body:'broken json'},{body:'x'.repeat(65537)},{kind:'aborted'},{kind:'close'},{kind:'network'}]){const f=fixture(options);await assert.rejects(sendSms(env,input,{request:f.request}),e=>e.code==='PROVIDER_OUTCOME_UNKNOWN'&&!e.message.includes('private'));assert.equal(f.calls,1);assert.ok(f.destroyed>0);}
});
test('total timeout destroys hanging request once',async()=>{const f=fixture({kind:'hang'});await assert.rejects(sendSms(env,input,{request:f.request,timeoutMs:15}),{code:'PROVIDER_OUTCOME_UNKNOWN'});assert.equal(f.calls,1);assert.equal(f.destroyed,1);});
test('cancellation before send does nothing; in flight destroys request',async()=>{
 const a=new AbortController();a.abort();const f=fixture();await assert.rejects(sendSms(env,input,{signal:a.signal,request:f.request}),{code:'PROVIDER_OUTCOME_UNKNOWN'});assert.equal(f.calls,0);
 const b=new AbortController(),g=fixture({kind:'hang'});const p=sendSms(env,input,{signal:b.signal,request:g.request});b.abort();await assert.rejects(p,{code:'PROVIDER_OUTCOME_UNKNOWN'});assert.equal(g.calls,1);assert.equal(g.destroyed,1);
});
test('rejects multiple recipients and malformed codes',()=>{for(const x of [{...input,phone:'13900000001,13900000002'},{...input,phone:13900000001},{...input,code:'secret-text'}])assert.throws(()=>signedRequest(env,x),{code:'INVALID_SMS_INPUT'});});
test('default real transport is blocked by network guard',async()=>{await assert.rejects(sendSms(env,input),{code:'PROVIDER_OUTCOME_UNKNOWN'});});
test('provider snapshots configuration and rejects debugging or invalid environment',async()=>{
 const mutable={...env},p=createSmsProvider({},mutable);mutable.SMS_CONFIG_REVISION='later';assert.equal((await p.inspect()).config_revision,'fake-v1');
 assert.throws(()=>createSmsProvider({},{...env,NODE_DEBUG:'http'}),/SMS_DEBUG_LOGGING_FORBIDDEN/);assert.throws(()=>createSmsProvider({},{...env,DEBUG:'*'}),/SMS_DEBUG_LOGGING_FORBIDDEN/);
 assert.equal((await createSmsProvider({},{...env,NODE_ENV:'unsupported'}).inspect()).configured,false);
});
