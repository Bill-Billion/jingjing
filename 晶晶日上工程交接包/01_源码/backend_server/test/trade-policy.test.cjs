 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),p=require('../src/modules/trade/policy');
test('money uses integer minor units and rejects rounding',()=>{assert.equal(p.yuanToMinor('49.01'),4901);assert.equal(p.minorToYuan(9900),'99.00');for(const x of ['1.001','-1','NaN','1e3'])assert.throws(()=>p.yuanToMinor(x));assert.throws(()=>p.amount(1.5));});
test('installments must allocate exactly every line without hidden defaults',()=>{const lines=[{line_id:'a',total_minor:101}],step={key:'first',trigger:'ORDER_ACCEPTED',allocations:[{line_id:'a',amount_minor:101}],apple_product_id:null};assert.equal(p.plan(lines,[step],'ALIPAY').length,1);assert.throws(()=>p.plan(lines,[{...step,allocations:[{line_id:'a',amount_minor:100}]}],'ALIPAY'));assert.throws(()=>p.plan(lines,[step],'APPLE'));});
test('reserved refunds reduce line-specific available amount',()=>{const paid=[{line_id:'a',amount_minor:100},{line_id:'b',amount_minor:200}];assert.equal(p.refundWithin(paid,[[{line_id:'a',amount_minor:60}]],[{line_id:'b',amount_minor:200}]),200);assert.throws(()=>p.refundWithin(paid,[[{line_id:'a',amount_minor:60}]],[{line_id:'a',amount_minor:41}]));});
test('provider proof must match channel environment app merchant order amount currency and Apple product',()=>{const x={id:'id',provider:'ALIPAY',environment:'SANDBOX',app_id:'app',merchant_id:'seller',currency:'CNY',amount_minor:99},proof={...x,payment_id:'id',status:'SUCCEEDED',transaction_id:'txn'};assert.equal(p.paymentMatches(x,proof),proof);for(const field of ['provider','environment','app_id','merchant_id','payment_id','currency','amount_minor'])assert.throws(()=>p.paymentMatches(x,{...proof,[field]:'wrong'}));});

test('license gate honors snapshotted activation amount rather than inventing full prepayment',async()=>{const {licensePaymentUsable}=require('../src/modules/trade/license-gate'),{digest}=require('../src/modules/governance/content');const order={quote:{lines:[{line_kind:'LICENSE',line_id:'fee',total_minor:100}]}},terms={payment_due_minor:40},receipt={allocations:[{line_id:'fee',amount_minor:40}]};let refunded=false;const tx={async execute(sql){if(sql.includes('trade_license_orders'))return [[{order_id:'o'}]];if(sql.includes('trade_records WHERE'))return [[{current_status:'PARTIALLY_PAID',data_json:order,data_sha256:digest(order)}]];if(sql.includes('trade_journal'))return [[{data_json:receipt,data_sha256:digest(receipt),direction:refunded?'REFUND':'RECEIPT'}]];return [[{data_json:terms,data_sha256:digest(terms)}]];}};assert.equal(await licensePaymentUsable(tx,'r'),true);terms.payment_due_minor=41;assert.equal(await licensePaymentUsable(tx,'r'),false);terms.payment_due_minor=0;refunded=true;assert.equal(await licensePaymentUsable(tx,'r'),false);});

const products=require('../src/modules/trade/product-policy');
const custom={version:'V5',type:'PRIVATE_CUSTOMIZATION'};
test('product profiles reject unknown rules and fields without inventing a default',()=>{
 assert.equal(products.profile(undefined),undefined);assert.deepEqual(products.profile(custom),custom);assert.notEqual(products.profile(custom),custom);
 for(const value of [null,{},'V5',{...custom,version:'V6'},{...custom,type:'OTHER'},{...custom,approved:true}])assert.throws(()=>products.profile(value));
});
test('V5 activation configuration fails closed on typos',()=>{
 assert.equal(products.requirement(undefined),false);assert.equal(products.requirement('false'),false);assert.equal(products.requirement('true'),true);
 for(const value of ['',true,'TRUE','1','flase'])assert.throws(()=>products.requirement(value),{code:'INVALID_PRODUCT_POLICY_CONFIGURATION'});
});
test('reviewed V5 product descendants cannot drop or switch their classification',()=>{
 assert.deepEqual(products.specification(custom,undefined,'PRODUCTION',true),custom);
 assert.throws(()=>products.specification(undefined,custom,'PRODUCTION'),{code:'PRODUCT_PROFILE_CANNOT_CHANGE'});
 assert.throws(()=>products.specification({...custom,type:'STOCK_VIDEO'},custom,'PRODUCTION'),{code:'PRODUCT_PROFILE_CANNOT_CHANGE'});
 assert.throws(()=>products.specification(custom,undefined,'LICENSE'),{code:'PRODUCT_LINE_KIND_MISMATCH'});
});
test('server derives required story from saved product, not a client-selected flow',()=>{
 const lines=[{product_profile:custom,line_kind:'PRODUCTION'}];
 assert.throws(()=>products.quote(lines,{}),{code:'CUSTOMIZATION_SOURCE_REQUIRED'});
 products.quote(lines,{customization_source:{request_id:'checked separately'}});
 for(const type of products.TYPES.filter(t=>['MANUAL_SAMPLE','STOCK_VIDEO','COMMERCIAL','AUDITION'].includes(t)))assert.throws(()=>products.quote([{product_profile:{version:'V5',type}}],{}),{code:'PRODUCT_FLOW_NOT_IMPLEMENTED'});
});
test('legacy and V5 products cannot be mixed to weaken rules',()=>{
 assert.throws(()=>products.quote([{product_profile:custom},{}],{customization_source:{}}),{code:'MIXED_PRODUCT_PROFILES'});
 assert.throws(()=>products.quote([{product_profile:custom},{product_profile:{version:'V5',type:'STOCK_VIDEO'}}],{}),{code:'MIXED_PRODUCT_PROFILES'});
 products.quote([{}],{});
 assert.throws(()=>products.quote([{}],{requireV5Products:true}),{code:'PRODUCT_PROFILE_REQUIRED'});
 assert.throws(()=>products.quote([{}],{customization_source:{}}),{code:'PRODUCT_PROFILE_REQUIRED'});
});
