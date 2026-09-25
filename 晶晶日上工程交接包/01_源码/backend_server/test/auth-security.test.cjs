'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createSecurity,config}=require('../src/modules/auth/security');
test('auth requires explicit secret and encrypted replay binds to its request',()=>{
 for(const v of [undefined,'short',' '.repeat(44)])assert.throws(()=>createSecurity(v),{code:'AUTH_SECRET_REQUIRED'});
 const s=createSecurity(crypto.randomBytes(32).toString('base64')),token=crypto.randomBytes(32).toString('base64url');
 const sealed=s.seal(token,'a');assert.equal(s.open(sealed,'a'),token);assert.ok(!sealed.includes(token));
 assert.throws(()=>s.open(sealed,'b'),{code:'AUTH_RESULT_UNAVAILABLE'});
 assert.notEqual(s.digest('phone','test'),s.digest('token','test'));
 assert.equal(s.matches('z'.repeat(64),'z'.repeat(64)),false);
});
test('auth security configuration rejects invalid bounds',()=>{
 assert.equal(config().maxAttempts,5);
 for(const v of [{sessionMs:0},{sessionMs:604800001},{maxAttempts:11},{challengeMs:100,resendMs:101}])assert.throws(()=>config(v),{code:'INVALID_AUTH_CONFIG'});
});
test('configured SMS refuses SDK debug logging before any network call',()=>{
 const {createSmsProvider}=require('../src/modules/providers/sms');
 const env={SMS_ENABLED:'true',DEBUG:'*'};
 for(const k of ['VOLC_ACCESS_KEY_ID','VOLC_SECRET_ACCESS_KEY','SMS_ACCOUNT','SMS_SIGN_NAME','SMS_LOGIN_TEMPLATE_ID','SMS_CONFIG_REVISION'])env[k]='synthetic';
 assert.throws(()=>createSmsProvider({},env),/SMS_DEBUG_LOGGING_FORBIDDEN/);
});
