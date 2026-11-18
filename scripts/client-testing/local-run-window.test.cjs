'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {expiryFor}=require('./run-isolated-explore.cjs');
const now=Date.parse('2026-11-04T12:00:00Z');
const runtime=expires_at=>({status:{expires_at}});
test('restart retains the original manual-review deadline',()=>{
 assert.equal(expiryFor([runtime('2026-11-06T15:00:00Z')],'2026-11-06T14:15:00Z',now),'2026-11-06T14:15:00.000Z');
});
test('a shorter backend lifetime still caps all visitors',()=>{
 assert.equal(expiryFor([runtime('2026-11-06T15:00:00Z'),runtime('2026-11-05T12:00:00Z')],'2026-11-06T14:15:00Z',now),'2026-11-05T11:58:00.000Z');
});
test('expired or malformed requested windows never silently renew',()=>{
 assert.throws(()=>expiryFor([runtime('2026-11-06T15:00:00Z')],'2026-11-04T11:00:00Z',now));
 assert.throws(()=>expiryFor([runtime('2026-11-06T15:00:00Z')],'invalid',now));
});
test('first startup without an explicit deadline uses the shortest runtime',()=>{
 assert.equal(expiryFor([runtime('2026-11-06T15:00:00Z')],undefined,now),'2026-11-06T14:58:00.000Z');
});
