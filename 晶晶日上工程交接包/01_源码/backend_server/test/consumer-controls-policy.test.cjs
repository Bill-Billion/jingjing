'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),P=require('../src/modules/wallet/consumer-policy');
test('personal limits are integer fen, zero blocks and null removes only after cooling',()=>{
 const now='2026-11-03T00:00:00.000Z';
 assert.deepEqual(P.change(null,0,now),{action:'LOWER',value:0});
 assert.equal(P.change(100,200,now).pending.confirm_after,'2026-11-04T00:00:00.000Z');
 assert.equal(P.change(100,null,now).action,'RAISE');
 assert.equal(P.change(100,100,now).action,'UNCHANGED');
 for(const n of [-1,1.5,NaN,undefined,'100',900000000001])assert.throws(()=>P.amount(n));
 assert.equal(P.remaining(100,200),0);assert.equal(P.remaining(null,200),null);
 assert.throws(()=>P.enforce(0,1),{code:'CONSUMER_MONTHLY_LIMIT_EXCEEDED'});P.enforce(100,100);
});
test('calendar accounting uses Beijing month including leap years and UTC boundary',()=>{
 for(const [now,month,end] of [['2026-10-31T16:00:00.000Z','2026-11','2026-11-30T16:00:00.000Z'],['2026-12-31T15:59:59.999Z','2026-12','2026-12-31T16:00:00.000Z'],['2028-02-28T20:00:00.000Z','2028-02','2028-02-29T16:00:00.000Z']]){const p=P.period(now);assert.equal(p.month,month);assert.equal(p.ends_at,end);}
});
