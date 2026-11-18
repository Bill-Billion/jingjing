 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),R=require('../src/operations/release-check'),F=require('../src/operations/data-format'),CLI=require('../scripts/release-tools.cjs');
test('release evidence is commit-bound, time-bound and never self-approves launch',()=>{const commit='a'.repeat(40),m={format:'JX_RELEASE_REVIEW_V1',commit,providers:[],checks:[{name:'peer_review',commit,environment:'PRODUCTION_CANDIDATE',result:'VERIFIED',reviewed_by:'reviewer',evidence_ref:'review:1',reviewed_at:'2020-01-01T00:00:00Z',expires_at:'2099-01-01T00:00:00Z'}]};assert.equal(R.reviewChecks(m)[0].current_status,'DECLARED_EVIDENCE_REQUIRES_REVIEW');for(const patch of [{commit:'b'.repeat(40)},{expires_at:'2020-01-01'},{environment:'SANDBOX'},{evidence_ref:''},{reviewed_at:'2099-01-01'}])assert.equal(R.reviewChecks({...m,checks:[{...m.checks[0],...patch}]})[0].current_status,'MISSING_OR_OUTDATED');});
test('backup cells preserve exact integers and distinguish binary from plain text',()=>{assert.equal(F.decode(F.encode(9007199254740993n)),'9007199254740993');assert.deepEqual(F.decode(F.encode(Buffer.from([255,0]))),Buffer.from([255,0]));assert.equal(F.decode(F.encode('001')),'001');assert.throws(()=>F.encode(9007199254740992),{code:'UNSAFE_NUMBER'});});
test('maintenance CLI rejects unspecified operation, shell-shaped identifiers and live database names',()=>{for(const n of ['jingjing','jx_dev','production','jx_test_1_abcdef; DROP DATABASE x'])assert.throws(()=>CLI.target(n));assert.equal(CLI.target('jx_test_1_123456789abc'),'jx_test_1_123456789abc');assert.throws(()=>CLI.parse(['backup','--database','a','--database','b']),{code:'INVALID_ARGUMENTS'});assert.throws(()=>F.name('a`b'),{code:'UNSUPPORTED_IDENTIFIER'});});
test('release config distinguishes unavailable and unsafe configuration without leaking values',()=>{const secret='private secret';const checks=R.configChecks({NODE_ENV:'production',DB_CLIENT:'sqlite',AUTH_SECRET_BASE64:secret,API_ALLOWED_ORIGINS:'http://localhost:3000',MYSQL_USER:'root',DEBUG:'true'});assert.ok(checks.some(x=>x.result==='BLOCKED'));assert.ok(!JSON.stringify(checks).includes(secret));});

test('release configuration rejects wildcard and empty browser origins while retaining exact HTTPS origins',()=>{
 const status=value=>R.configChecks({API_ALLOWED_ORIGINS:value}).find(x=>x.name==='https_browser_origins').result;
 for(const value of ['https://*','https://*.example.invalid','https://example.invalid,',',https://example.invalid','https://example.invalid,,https://other.invalid'])assert.equal(status(value),'BLOCKED',value);
 for(const value of ['https://example.invalid','https://example.invalid:8443,https://other.invalid'])assert.equal(status(value),'PASS');
});
test('release logging check sees both debug switches without emitting their values',()=>{
 for(const key of ['DEBUG','NODE_DEBUG']){const value='synthetic-sensitive-debug-setting',rows=R.configChecks({[key]:value});assert.equal(rows.find(x=>x.name==='no_debug_logging').result,'BLOCKED',key);assert.ok(!JSON.stringify(rows).includes(value));}
 assert.equal(R.configChecks({}).find(x=>x.name==='no_debug_logging').result,'PASS');
});
