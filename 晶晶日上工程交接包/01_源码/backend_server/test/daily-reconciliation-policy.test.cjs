'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID:id}=require('node:crypto'),P=require('../src/modules/reconciliation/policy');
test('daily ledger uses Beijing boundaries, strict cents, duplicate protection and all five books',()=>{
 assert.deepEqual(P.period('2026-11-01'),{start:'2026-10-31 16:00:00.000',end:'2026-11-01 16:00:00.000'});
 assert.throws(()=>P.day('2026-02-30'),{code:'INVALID_RECONCILIATION_DAY'});
 for(const n of [-1,0.5,Number.MAX_SAFE_INTEGER,NaN])assert.throws(()=>P.money(n));
 const row={record_id:id(),external_reference:'synthetic',direction:'IN',amount_minor:1};
 assert.throws(()=>P.rows([row,row]),{code:'RECONCILIATION_DUPLICATE_ROW'});
 const books=Object.fromEntries(P.KINDS.map(k=>[k,{items:[]}]));
 assert.equal(P.compare([],[],books).matched,true);assert.equal(P.compare([],[],{}).matched,false);
 assert.equal(P.compare([{...row,kind:'RECEIPT'}],[],books).differences[0].reason,'MISSING_IN_STATEMENT');
 books.RECEIPT.items=[row];assert.equal(P.compare([{...row,kind:'RECEIPT'}],[],books).matched,true);
 books.RECEIPT.items=[{...row,direction:'OUT'}];assert.equal(P.compare([{...row,kind:'RECEIPT'}],[],books).differences[0].reason,'AMOUNT_OR_DIRECTION_MISMATCH');
});
