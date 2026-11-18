"use strict";
// Test-only provider transport. Callers still use the normal person/identity API.
// No database status patching, production provider or blanket account approval.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
module.exports = function syntheticIdentityProvider({ namespace, allowedAccounts, statusForAccount = () => 'VERIFIED', now = Date.now }) {
  assert.match(namespace, /^synthetic\.pr\d+\.identity$/);
  return { async assertReady() {}, async verify(input) {
    assert(allowedAccounts().filter(Boolean).includes(input.account_id), 'Only explicitly allowed isolated fixture accounts may be verified');
    const status = statusForAccount(input.account_id);
    assert(['VERIFIED', 'REJECTED'].includes(status), 'Unsupported synthetic identity result');
    return { request_key: input.request_key, person_id: input.person_id, status, issuer: namespace,
      subject_fingerprint: createHash('sha256').update('synthetic:'+input.account_id).digest('hex'), age_band: 'ADULT',
      valid_until: new Date(now()+86400000).toISOString(), evidence_ref: namespace+':local-only', liveness_verified: true, phone_verified: true };
  } };
};
