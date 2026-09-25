 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),p=require('../src/modules/production/policy');
test('new early version invalidates its own and downstream approvals',()=>{assert.deepEqual(p.reset({SCRIPT:'a',SAMPLE:'b',FINAL:'c'},{SCRIPT:'a',SAMPLE:'b',FINAL:'c'},'SAMPLE'),{current:{SCRIPT:'a'},accepted:{SCRIPT:'a'}});});
test('next stage requires current predecessor acceptance',()=>{assert.throws(()=>p.predecessor({SCRIPT:'new'},{SCRIPT:'old'},'SAMPLE'));assert.equal(p.predecessor({SCRIPT:'a'},{SCRIPT:'a'},'SAMPLE'),'a');});
test('final acceptance requires explicit complete checklist',()=>{assert.throws(()=>p.checklist({script_reviewed:true},'FINAL'));assert.equal(p.checklist({script_reviewed:true},'SCRIPT').script_reviewed,true);});
test('unselected digital human service remains explicitly not implemented',async()=>{const p=require('../src/modules/production/provider').createProductionProvider(null,{NODE_ENV:'test'});const r=await p.readiness();assert.equal(r.current_status,'NOT_ENABLED');assert.equal(r.reason_code,'PROVIDER_NOT_IMPLEMENTED');await assert.rejects(()=>p.assertReady());});
