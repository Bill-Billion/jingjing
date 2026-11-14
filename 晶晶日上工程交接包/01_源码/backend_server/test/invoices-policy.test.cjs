'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),P=require('../src/modules/invoices/policy');
test('invoice header and amounts do not invent tax rules or allow invalid money',()=>{assert.deepEqual(P.header({kind:'PERSON',title:'Synthetic person',tax_id:null}),{kind:'PERSON',title:'Synthetic person',tax_id:null});for(const n of [-1,0,0.5,Number.MAX_SAFE_INTEGER,NaN])assert.throws(()=>P.money(n));assert.equal(P.money(0,true),0);assert.throws(()=>P.header({kind:'ORGANIZATION',title:'Test',tax_id:null}));});
test('production invoice issuance requires explicit valid issuer configuration; simulation cannot masquerade as real',()=>{const merchant=randomUUID();for(const env of [{},{NODE_ENV:'production',INVOICE_SANDBOX_ENABLED:'true'}])assert.throws(()=>P.issuer(env,merchant,'SANDBOX'));assert.equal(P.issuer({NODE_ENV:'test',INVOICE_SANDBOX_ENABLED:'true'},merchant,'SANDBOX').simulated,true);const profile={merchant_party_id:merchant,name:'Synthetic company',tax_id:'SYNTHETIC-NOT-REAL',config_revision:'test1',evidence_ref:'synthetic:evidence',valid_until:'2099-01-01T00:00:00.000Z',approved:true};const env={INVOICE_REAL_MANUAL_ENABLED:'true',INVOICE_MANUAL_ISSUERS_JSON:JSON.stringify([profile])};assert.equal(P.issuer(env,merchant,'PRODUCTION').simulated,false);for(const change of [{approved:false},{valid_until:'2020-01-01T00:00:00.000Z'},{merchant_party_id:randomUUID()}])assert.throws(()=>P.issuer({...env,INVOICE_MANUAL_ISSUERS_JSON:JSON.stringify([{...profile,...change}])},merchant,'PRODUCTION'));assert.throws(()=>P.issuer({...env,INVOICE_MANUAL_ISSUERS_JSON:JSON.stringify([profile,profile])},merchant,'PRODUCTION'));});

test('operator controls never infer authority from status and recorder cannot self-review',()=>{
 const {allowedActions,states}=require('../src/modules/invoices/policy');
 for(const state of states){
  assert.deepEqual(allowedActions({state,operations:true}),[]);
  assert.equal(allowedActions({state,operations:true,handle:true}).some(x=>['VERIFY_DOCUMENT','REJECT_DOCUMENT'].includes(x)),false);
 }
 assert.deepEqual(allowedActions({state:'DOCUMENT_REVIEW',operations:true,handle:true,verify:true,pending:true,recordedBySelf:true}),[]);
 assert.deepEqual(allowedActions({state:'DOCUMENT_REVIEW',operations:true,verify:true,pending:true}),['VERIFY_DOCUMENT','REJECT_DOCUMENT']);
 assert.deepEqual(allowedActions({state:'DOCUMENT_REVIEW',operations:true,verify:true,pending:false}),[]);
 assert.deepEqual(allowedActions({state:'WITHDRAWN',operations:false}),[]);
 assert.deepEqual(allowedActions({state:'NEEDS_INFO',operations:false}),['SUPPLEMENT','WITHDRAW']);
});
