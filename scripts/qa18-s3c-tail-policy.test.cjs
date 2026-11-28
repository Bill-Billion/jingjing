'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

const root = path.resolve(__dirname, '../晶晶日上工程交接包/01_源码/backend_server/src');
const wallet = require(path.join(root, 'modules/wallet/policy'));
const {createAdapter} = require(path.join(root, 'modules/providers/adapter'));
const {createLogger} = require(path.join(root, 'infrastructure/observability'));

test('G14: expired earned points are reversed once, free points never count towards growth', () => {
  const current = '2026-11-27T10:00:00.000Z';
  const consumed = {id:'consumed', source_kind:'CONSUMPTION', points:100, spent:30, expired:70,
    reversed:0, growth_reversed:0, paid_minor:10000, rule:{points_per_yuan:1}, expires_at:current};
  const gifts = ['REGISTER','DAILY_CHECKIN','REVIEW','SHARE'].map(source => ({
    id:source, source_kind:'FREE', event_kind:source, points:5, spent:0, expired:0, reversed:0, growth_reversed:0,
    expires_at:'2026-11-28T10:00:00.000Z'
  }));
  assert.equal(wallet.growth([consumed, ...gifts]), 100);
  assert.deepEqual(wallet.available([consumed, ...gifts], [], current).map(x=>x.available), [0,5,5,5,5]);
  const initial = wallet.reversalPlan(consumed, 9000);
  assert.deepEqual(initial, {target:90,growth_delta:90,expired:70,unspent:0,shortfall:20});
  const reversed = {...consumed, expired:0, reversed:70, growth_reversed:90, debt_settled:20};
  assert.equal(wallet.growth([reversed, ...gifts]), 10);
  assert.deepEqual(wallet.reversalPlan(reversed, 9000), {target:90,growth_delta:0,expired:0,unspent:0,shortfall:0});
  assert.deepEqual(wallet.reversalPlan(reversed, 10000), {target:100,growth_delta:10,expired:0,unspent:0,shortfall:10});
  assert.equal(wallet.remaining(reversed), 0);
  assert.equal(wallet.reversalPlan(reversed, 8999).growth_delta, 0);
  assert.throws(()=>wallet.reversalPlan(reversed, 8900), {code:'WALLET_REFUND_REGRESSION'});
  assert.throws(()=>wallet.reversalPlan(reversed, 10001), {code:'WALLET_AMOUNT_INVALID'});
});

const methods = {
  PaymentProvider:'refund',
  IdentityProvider:'verify',
  ObjectStorageProvider:'put',
  DigitalHumanProvider:'submit',
  ESignProvider:'create',
};
const verification = {
  environment:'SANDBOX', verified_state:'SANDBOX_VERIFIED', config_revision:'revision1',
  object_version:1, evidence_ref:'synthetic-test-only',
};
const repository = {read: async()=>({
  current_status:'SANDBOX_VERIFIED', config_revision:'revision1', object_version:1,
  verification_history:[verification],
})};
const inspection = {implemented:true, configured:true, config_revision:'revision1'};

for (const [providerKind, method] of Object.entries(methods)) {
  test(`G16: ${providerKind}.${method} times out once, aborts and ignores late response`, async () => {
    const entries = [], provider = {provider_kind:providerKind, provider_code:'test-only',
      capability_code:'boundary', environment:'SANDBOX'};
    let calls=0, signal, complete;
    const options = {provider, repository, inspect:()=>inspection, timeoutMs:15,
      logger:createLogger(line=>entries.push(JSON.parse(line)))};
    const stalled = createAdapter({...options, operations:{[method]:async(_,context)=>{
      calls++; signal=context.signal;
      return new Promise(resolve=>{complete=resolve;});
    }}});
    await assert.rejects(stalled.call(method,{}), {code:'PROVIDER_OUTCOME_UNKNOWN'});
    assert.equal(calls,1);
    assert.equal(signal.aborted,true);
    complete({provider_request_id:'synthetic-late-response'});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls,1);
    assert.equal(entries.filter(x=>x.event==='provider_call_returned').length,0);
    const wrongEnvironment = createAdapter({...options, provider:{...provider,environment:'PRODUCTION'},
      operations:{[method]:async()=>{calls++; return {};}}});
    await assert.rejects(wrongEnvironment.call(method,{}), {code:'PROVIDER_NOT_VERIFIED'});
    assert.equal(calls,1);
    const explicitFailure = createAdapter({...options, operations:{[method]:async()=>{
      calls++; throw Error('synthetic-upstream-detail');
    }}});
    await assert.rejects(explicitFailure.call(method,{}), err=>
      err.code==='PROVIDER_CALL_FAILED' && !err.message.includes('synthetic-upstream-detail'));
    assert.equal(calls,2);
    assert.doesNotMatch(JSON.stringify(entries), /synthetic-upstream-detail|synthetic-late-response/);
  });
}
