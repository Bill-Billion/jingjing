"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'晶晶日上工程交接包/01_源码/backend_server'),r=JSON.parse(fs.readFileSync(path.join(root,'docs/operations/SDK_AND_DATA_GOVERNANCE_REGISTER.json'),'utf8')),pkg=JSON.parse(fs.readFileSync(path.join(base,'package.json'),'utf8'));
const text=v=>typeof v==='string'&&v.trim().length>0;
function sourceFile(directory,relative){
 assert.ok(text(relative)&&!path.isAbsolute(relative),'Source reference must be relative');
 const parent=fs.realpathSync(directory),file=fs.realpathSync(path.resolve(directory,relative)),within=path.relative(parent,file);
 assert.ok(within&&!within.startsWith('..'+path.sep)&&within!=='..'&&!path.isAbsolute(within),'Source reference escapes its source tree');
 assert.ok(fs.statSync(file).isFile(),'Source reference must identify a file');return file;
}
assert.equal(r.source,path.relative(root,path.join(base,'package-lock.json')).split(path.sep).join('/'),'Inventory must use the actual backend lockfile');
const lock=JSON.parse(fs.readFileSync(sourceFile(root,r.source),'utf8'));
assert.ok([2,3].includes(lock.lockfileVersion),'Unsupported dependency lock format');
assert.deepEqual(lock.packages[''].dependencies,pkg.dependencies,'Lockfile root and package manifest disagree');
assert.deepEqual(r.items.map(i=>i.name).sort(),Object.keys(pkg.dependencies).sort(),'Dependency inventory requires review');
const policyFields=['privacy_policy_reference','personal_information_assessment_reference','log_retention_rule_reference'];
let missingPolicyReferences=0,reviewedRecords=0,unreferencedDependencies=0;
for(const item of r.items){
 assert.equal(item.declared_range,pkg.dependencies[item.name],item.name+': declared range changed');
 assert.equal(item.locked_version,lock.packages['node_modules/'+item.name]?.version,item.name+': locked version changed');
 assert.ok(text(item.locked_version)&&text(item.purpose_from_code),item.name+': version and purpose required');
 assert.ok(Array.isArray(item.source_references),item.name+': source references required');
 if(!item.source_references.length){assert.equal(item.usage_status,'NO_DIRECT_REFERENCE_FOUND',item.name+': missing direct reference must be explicit');unreferencedDependencies++;}
 for(const p of item.source_references){const content=fs.readFileSync(sourceFile(base,p),'utf8');assert.ok(content.includes("'"+item.name+"'")||content.includes('"'+item.name+'"')||content.includes("'"+item.name+'/')||content.includes('"'+item.name+'/'),item.name+': source does not contain a literal package reference: '+p);}
 for(const field of policyFields){assert.ok(Object.hasOwn(item,field),item.name+': missing '+field);assert.ok(item[field]===null||text(item[field]),item.name+': invalid '+field);if(item[field]===null)missingPolicyReferences++;}
 assert.ok(['NOT_REVIEWED','REVIEWED'].includes(item.assessment_status),item.name+': unknown assessment status');
 if(item.assessment_status==='REVIEWED'){
  assert.ok(policyFields.every(k=>text(item[k]))&&text(item.reviewed_by)&&text(item.reviewed_at)&&Number.isFinite(Date.parse(item.reviewed_at)),item.name+': reviewed label needs explicit evidence and reviewer');
  sourceFile(root,item.review_record_reference);reviewedRecords++;
 }
}
assert.ok(Array.isArray(r.flows)&&r.flows.length,'Data flows required');
assert.equal(new Set(r.flows.map(x=>x.name)).size,r.flows.length,'Duplicate flow name');
for(const flow of r.flows){
 for(const field of ['name','recipient','gate','retention','live_status'])assert.ok(text(flow[field]),flow.name+': '+field);
 assert.ok(Array.isArray(flow.fields)&&flow.fields.length&&flow.fields.every(text),flow.name+': data fields required');
 assert.ok(Array.isArray(flow.sources)&&flow.sources.length,flow.name+': source list required');
 for(const p of flow.sources)sourceFile(base,p);
}
// Static inventory only: never execute or build the client, and never contact policy URLs.
const web=JSON.parse(fs.readFileSync(sourceFile(root,r.client_inventory.web.source),'utf8'));assert.deepEqual(web.dependencies,r.client_inventory.web.dependencies,'Web dependency inventory requires review');
console.log(JSON.stringify({result:'PASS',backend_dependencies:r.items.length,data_flows:r.flows.length,source_paths_checked:true,locked_versions_checked:true,declared_ranges_checked:true,unreferenced_dependencies:unreferencedDependencies,missing_policy_references:missingPolicyReferences,reviewed_records_present:reviewedRecords,review_authenticity_verified:false,complete_data_flow_coverage_verified:false,policy_and_live_services_verified:false}));
