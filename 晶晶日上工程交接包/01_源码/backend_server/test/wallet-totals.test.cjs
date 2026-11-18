'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {cumulative}=require('../src/modules/wallet/totals');
test('累计只计已发放净额，消费、过期和偿还旧欠额不能重复扣减',()=>{
 const rows=[{current_status:'PENDING',data:{points:900}},{current_status:'REVERSAL_PENDING',data:{points:100,growth_reversed:70,spent:60,expired:10,pending_shortfall:50,debt_settled:20}},{current_status:'ISSUED',data:{points:20,growth_reversed:0,debt_offset:20}},{current_status:'ISSUED',data:{source_kind:'FREE',points:5,growth_reversed:0}}];
 assert.deepEqual(cumulative(rows),{version:'NET_ISSUED_V1',issued:125,withdrawn:70,net_issued:55});
 assert.deepEqual(cumulative([]),{version:'NET_ISSUED_V1',issued:0,withdrawn:0,net_issued:0});
});
test('无法核对或整数溢出的金额拒绝伪造累计',()=>{
 for(const data of [{points:3,growth_reversed:4},{points:3,growth_reversed:-1},{points:3},{points:1.5,growth_reversed:0}])assert.throws(()=>cumulative([{current_status:'ISSUED',data}]),{code:'WALLET_TOTALS_UNVERIFIED'});
 assert.throws(()=>cumulative([1,2].map(()=>({current_status:'ISSUED',data:{points:Number.MAX_SAFE_INTEGER,growth_reversed:0}}))),{code:'WALLET_TOTALS_UNVERIFIED'});
});
