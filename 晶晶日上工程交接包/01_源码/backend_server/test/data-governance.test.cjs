'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const repository=path.resolve(__dirname,'../../../..'),backend='晶晶日上工程交接包/01_源码/backend_server';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jx-governance-fixture-'));
 t.after(()=>{assert.equal(path.dirname(root),fs.realpathSync(os.tmpdir()));assert.ok(path.basename(root).startsWith('jx-governance-fixture-'));fs.rmSync(root,{recursive:true,force:true});});
 const write=(p,v)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,typeof v==='string'?v:JSON.stringify(v));};
 write('scripts/check-data-governance.cjs',fs.readFileSync(path.join(repository,'scripts/check-data-governance.cjs'),'utf8'));
 const pkg={dependencies:{'sample-sdk':'^1.0.0'}},lock={lockfileVersion:3,packages:{'':{dependencies:pkg.dependencies},'node_modules/sample-sdk':{version:'1.0.2'}}};
 const register={source:backend+'/package-lock.json',items:[{name:'sample-sdk',locked_version:'1.0.2',declared_range:'^1.0.0',purpose_from_code:'isolated verification fixture',source_references:['src/payment.js'],privacy_policy_reference:null,personal_information_assessment_reference:null,log_retention_rule_reference:null,assessment_status:'NOT_REVIEWED'}],flows:[{name:'synthetic flow',sources:['src/payment.js'],recipient:'synthetic only',fields:['reference'],gate:'disabled',retention:'pending review',live_status:'not enabled'}],client_inventory:{web:{source:'fixture-web/package.json',dependencies:{}}}};
 write(backend+'/src/payment.js',"const sdk=require('sample-sdk');\n");write('fixture-web/package.json',{dependencies:{}});
 return {root,register,pkg,lock,write,run(){write(backend+'/package.json',pkg);write(backend+'/package-lock.json',lock);write('docs/operations/SDK_AND_DATA_GOVERNANCE_REGISTER.json',register);return spawnSync(process.execPath,[path.join(root,'scripts/check-data-governance.cjs')],{encoding:'utf8',windowsHide:true});}};
}
test('governance inventory checks facts without promoting unreviewed policy or live services',t=>{const f=fixture(t),r=f.run();assert.equal(r.status,0,r.stderr);const report=JSON.parse(r.stdout);assert.equal(report.policy_and_live_services_verified,false);});
for(const [name,mutate]of [
 ['stale locked version',f=>f.register.items[0].locked_version='1.0.1'],
 ['stale declared range',f=>f.register.items[0].declared_range='^0.9.0'],
 ['lock root disagrees with package manifest',f=>f.lock.packages[''].dependencies={'sample-sdk':'^0.9.0'}],
 ['missing SDK source reference',f=>f.register.items[0].source_references=['src/missing.js']],
 ['source reference outside backend',f=>{f.write('outside.js',"require('sample-sdk')");f.register.items[0].source_references=['../../../outside.js'];}],
 ['existing source does not reference SDK',f=>f.write(backend+'/src/payment.js','// unrelated code')],
 ['empty purpose',f=>f.register.items[0].purpose_from_code=' '],
 ['empty source list without explicit limitation',f=>f.register.items[0].source_references=[]],
 ['missing PIA field',f=>delete f.register.items[0].personal_information_assessment_reference],
 ['reviewed label without review evidence',f=>f.register.items[0].assessment_status='REVIEWED'],
 ['empty flow sources',f=>f.register.flows[0].sources=[]],
 ['duplicate flow name',f=>f.register.flows.push({...f.register.flows[0]})],
 ['empty data fields',f=>f.register.flows[0].fields=[]],
])test('governance checker rejects '+name,t=>{const f=fixture(t);mutate(f);const r=f.run();assert.notEqual(r.status,0,'invalid inventory was accepted: '+r.stdout);});
test('unreferenced direct dependency is explicit and still not assessed',t=>{const f=fixture(t);f.register.items[0].source_references=[];f.register.items[0].usage_status='NO_DIRECT_REFERENCE_FOUND';f.register.items[0].purpose_from_code='Declared dependency; no direct import found in audited sources';const r=f.run();assert.equal(r.status,0,r.stderr);const report=JSON.parse(r.stdout);assert.equal(report.policy_and_live_services_verified,false);});
test('presence of a synthetic review record never certifies review authenticity or compliance',t=>{const f=fixture(t),i=f.register.items[0];Object.assign(i,{assessment_status:'REVIEWED',privacy_policy_reference:'synthetic-policy',personal_information_assessment_reference:'synthetic-assessment',log_retention_rule_reference:'synthetic-retention',reviewed_by:'synthetic-reviewer',reviewed_at:'2026-11-14T00:00:00Z',review_record_reference:'docs/synthetic-review.txt'});f.write(i.review_record_reference,'Synthetic fixture only');const r=f.run();assert.equal(r.status,0,r.stderr);const report=JSON.parse(r.stdout);assert.equal(report.reviewed_records_present,1);assert.equal(report.review_authenticity_verified,false);assert.equal(report.complete_data_flow_coverage_verified,false);assert.equal(report.policy_and_live_services_verified,false);});
