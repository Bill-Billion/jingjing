 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID:id}=require('node:crypto');
const M=require('../src/modules/settlement/marketplace-policy'),P=require('../src/modules/settlement/policy');
const platform=id(),supplier=id(),mcn=id(),referrer=id();
const allocation=(type='STOCK_VIDEO',m=2000,ref=true)=>({model:'V5_TWO_LAYER',product_type:type,fee_base:'NET_PAID',platform_party_id:platform,platform_bps:type==='STOCK_VIDEO'?1800:2200,supplier_party_id:supplier,mcn_party_id:m?mcn:null,mcn_supply_bps:m,referrer_party_id:ref?referrer:null,referral_bps:ref?(type==='STOCK_VIDEO'?720:660):0,rounding:'HALF_UP_PLATFORM_REMAINDER'});
const values=r=>Object.fromEntries(r.entries.map(x=>[x.role,x.amount_minor]));
test('V5 splits MCN from supply income and referral only from platform',()=>{
 assert.deepEqual(values(M.split(10000,allocation())),{PLATFORM:1080,SUPPLIER:6560,MCN:1640,REFERRER:720});
 for(const type of ['COMMERCIAL','AUDITION'])assert.deepEqual(values(M.split(10000,allocation(type))),{PLATFORM:1540,SUPPLIER:6240,MCN:1560,REFERRER:660});
 assert.deepEqual(values(M.split(10000,allocation('STOCK_VIDEO',0,false))),{PLATFORM:1800,SUPPLIER:8200});
 assert.deepEqual(values(M.split(10000,allocation('COMMERCIAL',1000,false))),{PLATFORM:2200,SUPPLIER:7020,MCN:780});
 assert.deepEqual(values(M.split(10000,allocation('COMMERCIAL',3000,false))),{PLATFORM:2200,SUPPLIER:5460,MCN:2340});
});
test('exact supply fractions survive refunds, tiny totals and maximum money',()=>{
 for(const m of [0,1000,1001,2000,2999,3000])for(const n of [0,1,2,3,5,99,10001,900000000000]){
  const a=allocation('STOCK_VIDEO',m),s=M.split(n,a);assert.equal(s.entries.reduce((v,x)=>v+x.amount_minor,0),n);
  const artist=s.entries.find(x=>x.role==='SUPPLIER').amount_minor;
  assert.equal(artist,Number((BigInt(n)*8200n*BigInt(10000-m)+50000000n)/100000000n));
  assert.ok(Math.abs(s.rounding_diff_minor)<=2);
  assert.equal(M.split(0,a).entries.every(x=>x.amount_minor===0),true);
 }
 const withRef=M.split(9999,allocation()),withoutRef=M.split(9999,allocation('STOCK_VIDEO',2000,false));
 for(const role of ['SUPPLIER','MCN'])assert.equal(values(withRef)[role],values(withoutRef)[role]);
});
test('new terms require explicit version and artists confirm the recorded supply share',()=>{
 assert.deepEqual(M.mcnTerms({version:'V5'}),{version:'V5',supply_share_bps:2000});
 for(const n of [999,3001,1000.1,'2000'])assert.throws(()=>M.mcnTerms({version:'V5',supply_share_bps:n}));
 assert.throws(()=>M.allocation({...allocation(),referral_bps:1900}));
 assert.throws(()=>M.allocation({...allocation(),mcn_party_id:null}));
 assert.throws(()=>M.allocation({...allocation(),referrer_party_id:supplier}));
 assert.throws(()=>M.allocation({...allocation(),product_type:'PRIVATE_CUSTOMIZATION'}));
});
test('finance uses allocation without misrepresenting fractional supply shares as integer GMV percentages',()=>{
 const a=allocation('STOCK_VIDEO',1001,false),r={version:'synthetic',settlement_at:'2020-01-01T00:00:00.000Z',release_condition:'DELIVERY_ACCEPTED',terms:'synthetic',lines:[{line_id:'sale',allocation:a,deductions:[]}]};
 assert.deepEqual(P.rules(r),r);assert.equal(P.participants(r.lines[0]).length,3);
 assert.throws(()=>P.rules({...r,lines:[{...r.lines[0],shares:[{party_id:platform,role:'PLATFORM',bps:10000}]}]}));
 assert.throws(()=>P.rules({...r,lines:[{...r.lines[0],deductions:[{category:'TAX',party_id:id(),amount_minor:5,basis:'synthetic',refund_behavior:'PROPORTIONAL'}]}]}));
});
