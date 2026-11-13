'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID:id}=require('node:crypto'),{organizationIncome}=require('../src/modules/engagement/income-attribution');
test('frozen marketplace roles distinguish supplier and agency income across all three marketplace products',()=>{
 const supplier=id(),agency=id(),platform=id();
 for(const product_type of ['STOCK_VIDEO','AUDITION','COMMERCIAL']){
  const platform_bps=product_type==='STOCK_VIDEO'?1800:2200,allocation={model:'V5_TWO_LAYER',product_type,fee_base:'NET_PAID',platform_party_id:platform,platform_bps,supplier_party_id:supplier,mcn_party_id:agency,mcn_supply_bps:2000,referrer_party_id:null,referral_bps:0,rounding:'HALF_UP_PLATFORM_REMAINDER'},o={merchant_party_id:supplier,data:{quote:{total_minor:10000,marketplace_finance:{allocation}}}};
  const own=organizationIncome(o,supplier,5000),broker=organizationIncome(o,agency,5000);
  assert.equal(own.income_role,'SUPPLIER');assert.equal(own.mcn_accrual_minor,0);assert.equal(broker.income_role,'MCN');assert.equal(broker.supplier_accrual_minor,0);assert.equal(own.organization_accrual_minor,product_type==='STOCK_VIDEO'?3280:3120);assert.equal(broker.organization_accrual_minor,product_type==='STOCK_VIDEO'?820:780);assert.equal(own.organization_expected_minor,own.organization_accrual_minor*2);assert.equal(broker.organization_expected_minor,broker.organization_accrual_minor*2);assert.throws(()=>organizationIncome(o,platform,5000),{code:'STORED_CONTENT_MISMATCH'});
 }
});
test('legacy agency commission keeps its frozen calculation and unrelated organizations cannot reinterpret it',()=>{
 const agency=id(),o={merchant_party_id:id(),data:{quote:{total_minor:10000,commercial:{relation:{mcn_party_id:agency},commission:{platform_bps:2000,mcn_bps:1000}}}}};const r=organizationIncome(o,agency,5000);assert.equal(r.income_role,'MCN');assert.equal(r.mcn_expected_minor,1000);assert.equal(r.mcn_accrual_minor,500);assert.equal(r.organization_accrual_minor,500);assert.equal(r.supplier_accrual_minor,0);assert.throws(()=>organizationIncome(o,id(),5000),{code:'STORED_CONTENT_MISMATCH'});
});
