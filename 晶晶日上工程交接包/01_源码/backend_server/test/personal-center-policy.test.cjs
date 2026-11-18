"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto');
const {cursors,money}=require('../src/modules/personal-center/policy');
test('income separates accrual, corrections, payouts, returns and recovery; unsafe sums rejected',()=>{
 assert.deepEqual(money([{category:'ACCRUAL',amount_minor:100},{category:'ADJUSTMENT',amount_minor:-10},{category:'PAYOUT',amount_minor:-60},{category:'PAYOUT_RETURN',amount_minor:20}]),{accrued_minor:100,adjustment_minor:-10,verified_paid_minor:40,pending_minor:50,recovery_due_minor:0});
 assert.equal(money([{category:'ACCRUAL',amount_minor:-10}]).recovery_due_minor,10);
 assert.throws(()=>money([{category:'ACCRUAL',amount_minor:Number.MAX_SAFE_INTEGER},{category:'ACCRUAL',amount_minor:1}]),{code:'INCOME_AMOUNT_OVERFLOW'});
 assert.throws(()=>money([{category:'OTHER',amount_minor:1}]),{code:'INCOME_ENTRY_INVALID'});
});
test('cursor is bound to account, acting party, category, source and all six timestamp decimals',()=>{
 const c=cursors(randomBytes(32).toString('hex')),scope=['a','p','contracts','TRADE_ORDERS'],position={at:'2026-10-30 00:00:00.000001',id:randomUUID()},token=c.encode(scope,position);assert.deepEqual(c.decode(scope,token),position);
 for(let i=0;i<4;i++){const other=[...scope];other[i]+='x';assert.throws(()=>c.decode(other,token),{code:'INVALID_CURSOR'});}
 assert.throws(()=>c.decode(scope,token+'0'),{code:'INVALID_CURSOR'});
});
