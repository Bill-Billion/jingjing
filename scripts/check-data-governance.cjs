"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'晶晶日上工程交接包/01_源码/backend_server'),r=JSON.parse(fs.readFileSync(path.join(root,'docs/operations/SDK_AND_DATA_GOVERNANCE_REGISTER.json'),'utf8')),pkg=JSON.parse(fs.readFileSync(path.join(base,'package.json'),'utf8'));
assert.deepEqual(r.items.map(i=>i.name).sort(),Object.keys(pkg.dependencies).sort(),'Dependency inventory requires review');
for(const flow of r.flows){for(const field of ['name','recipient','fields','gate','retention','live_status'])assert.ok(flow[field],flow.name+': '+field);for(const p of flow.sources)assert.ok(fs.existsSync(path.join(base,p)),p);}
const web=JSON.parse(fs.readFileSync(path.join(root,r.client_inventory.web.source),'utf8'));assert.deepEqual(web.dependencies,r.client_inventory.web.dependencies,'Web dependency inventory requires review');
console.log(JSON.stringify({result:'PASS',backend_dependencies:r.items.length,data_flows:r.flows.length,source_paths_checked:true,policy_and_live_services_verified:false}));
