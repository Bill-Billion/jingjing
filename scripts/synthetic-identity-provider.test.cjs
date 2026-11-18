'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const create = require('./support/synthetic-identity-provider.cjs');
const input = { account_id: 'fixture-buyer', person_id: 'person-a', request_key: 'request-a' };
test('provider is restricted to explicit synthetic namespaces', () => {
  assert.throws(() => create({ namespace: 'production', allowedAccounts: () => ['fixture-buyer'] }));
});
test('not-yet-initialized and unrelated accounts are rejected', async () => {
  let buyer;
  const provider = create({ namespace: 'synthetic.pr15.identity', allowedAccounts: () => [buyer] });
  await assert.rejects(provider.verify(input));
  await assert.rejects(provider.verify({ ...input, account_id: undefined }));
  buyer = 'fixture-buyer';
  await assert.rejects(provider.verify({ ...input, account_id: 'unrelated' }));
  assert.equal((await provider.verify(input)).status, 'VERIFIED');
});
test('valid fixture response binds original person and request with bounded validity', async () => {
  const provider = create({ namespace: 'synthetic.pr17.identity', allowedAccounts: () => ['fixture-buyer'], now: () => Date.UTC(2026, 10, 16) });
  const result = await provider.verify(input);
  assert.equal(result.person_id, input.person_id); assert.equal(result.request_key, input.request_key);
  assert.equal(result.issuer, 'synthetic.pr17.identity'); assert.equal(result.age_band, 'ADULT');
  assert.equal(result.valid_until, '2026-11-17T00:00:00.000Z');
  assert.equal(result.liveness_verified, true); assert.equal(result.phone_verified, true);
  assert.match(result.subject_fingerprint, /^[a-f0-9]{64}$/);
  assert.match(result.evidence_ref, /synthetic.*local-only/);
});
test('rejected recheck and restoration preserve subject identity, seller remains unaffected', async () => {
  let state = 'VERIFIED';
  const provider = create({ namespace: 'synthetic.pr15.identity', allowedAccounts: () => ['fixture-buyer', 'fixture-seller'], statusForAccount: id => id === 'fixture-buyer' ? state : 'VERIFIED' });
  const original = await provider.verify(input);
  state = 'REJECTED';
  const rejected = await provider.verify({ ...input, request_key: 'request-b' });
  assert.equal(rejected.status, 'REJECTED'); assert.equal(rejected.request_key, 'request-b');
  assert.equal((await provider.verify({ ...input, account_id: 'fixture-seller' })).status, 'VERIFIED');
  state = 'VERIFIED';
  const restored = await provider.verify({ ...input, request_key: 'request-c' });
  assert.equal(restored.status, 'VERIFIED'); assert.equal(restored.subject_fingerprint, original.subject_fingerprint);
  state = 'IGNORED'; await assert.rejects(provider.verify(input));
});
test('provider results satisfy current backend identity contract; mismatched replays are refused', async () => {
  const { identityResult } = require('../晶晶日上工程交接包/01_源码/backend_server/src/modules/artists/policy');
  for (const status of ['VERIFIED', 'REJECTED']) {
    const provider = create({ namespace: 'synthetic.pr15.identity', allowedAccounts: () => ['fixture-buyer'], statusForAccount: () => status });
    const result = await provider.verify(input);
    assert.deepEqual(identityResult(result, input), result);
    assert.throws(() => identityResult(result, { ...input, request_key: 'another-request' }), { code: 'IDENTITY_RESULT_MISMATCH' });
    assert.throws(() => identityResult(result, { ...input, person_id: 'another-person' }), { code: 'IDENTITY_RESULT_MISMATCH' });
  }
});
