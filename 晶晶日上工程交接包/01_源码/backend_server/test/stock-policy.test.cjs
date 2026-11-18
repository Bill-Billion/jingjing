"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),P=require('../src/modules/stock/policy');
const spec={version:'test-v1',stock_license:{scope:'PERSONAL_NONCOMMERCIAL',exclusive:false,territory:'WORLDWIDE',duration:'PERPETUAL',personal_social_sharing:true,acceptance_hours:72,aftercare_terms:'independent aftercare review'},terms:'test'};
test('stock license is a specific noncommercial perpetual video license',()=>{assert.equal(P.license(spec).exclusive,false);for(const change of [{exclusive:true},{scope:'COMMERCIAL'},{duration:'ONE_YEAR'},{personal_social_sharing:false},{acceptance_hours:0}])assert.throws(()=>P.specification({...spec,stock_license:{...spec.stock_license,...change}}));});
test('stock specification rejects undisclosed license expansion and missing acceptance terms',()=>{assert.throws(()=>P.specification({...spec,source_files:true}));assert.throws(()=>P.specification({...spec,stock_license:{...spec.stock_license,aftercare_terms:''}}));assert.throws(()=>P.participants([{person_id:'invalid'}]));});

test('stock acceptance duration must be supplied explicitly and remains frozen in the license',()=>{
 const {acceptance_hours,...missing}=spec.stock_license;
 for(const value of [missing,{...missing,acceptance_hours:null},{...missing,acceptance_hours:1.5}])assert.throws(()=>P.specification({...spec,stock_license:value}),{code:'INVALID_STOCK_LICENSE'});
 for(const hours of [24,48,72,168]){const candidate={...spec,stock_license:{...spec.stock_license,acceptance_hours:hours}};assert.equal(P.license(P.specification(candidate)).acceptance_hours,hours);}
});
