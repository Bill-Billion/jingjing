'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const backend = '../晶晶日上工程交接包/01_源码/backend_server/src/modules/';
const {financeGate} = require(backend+'auditions/context');
const {digest} = require(backend+'governance/content');

const bookingId = '00000000-0000-4000-8000-000000000001';
const fulfilledAt = '2026-11-27T02:57:32.167Z';
const order = {
  current_status:'FULFILLED',
  data:{quote:{audition:{booking_id:bookingId}},financial:{net_minor:10000}},
};

function fixture(at, {status='FULFILLED', dispute=null}={}) {
  const data = {fulfilled_at:fulfilledAt, dispute};
  const row = {id:bookingId, kind:'BOOKING', current_status:status,
    object_version:1, data_json:JSON.stringify(data), data_sha256:digest(data)};
  return {
    async execute(sql,args) {
      if (sql === 'SELECT * FROM audition_records WHERE id=? FOR SHARE') {
        assert.deepEqual(args,[bookingId]);
        return [[row]];
      }
      assert.equal(sql,'SELECT ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000) ms');
      return [[{ms:Date.parse(at)}]];
    },
  };
}

test('isolated T+1 gate rejects 23:59:59.999 and opens at exactly 24 h',async()=>{
  await assert.rejects(financeGate(fixture('2026-11-28T02:57:32.166Z'),order),
    {code:'AUDITION_SETTLEMENT_NOT_READY',status:409});
  await financeGate(fixture('2026-11-28T02:57:32.167Z'),order);
  await financeGate(fixture('2026-11-28T02:57:32.168Z'),order);
});

test('passing the deadline leaves dispute and payment review gates in force',async()=>{
  const after='2026-11-28T02:57:32.168Z';
  await assert.rejects(financeGate(fixture(after,{status:'DISPUTED',dispute:{open:true}}),order),
    {code:'AUDITION_SETTLEMENT_NOT_READY',status:409});
  await assert.rejects(financeGate(fixture(after),{...order,current_status:'PAYMENT_REVIEW_REQUIRED'}),
    {code:'AUDITION_SETTLEMENT_NOT_READY',status:409});
});
