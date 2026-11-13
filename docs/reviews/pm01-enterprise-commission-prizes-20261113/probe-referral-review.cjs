const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const file=path.resolve('晶晶日上工程交接包/01_源码/backend_server/test/engagement.integration.test.cjs');
let source=fs.readFileSync(file,'utf8');
source=source.replace('await settle();let balances=','const pendingSettlement=await settle();let balances=');
const anchor=" await assert.rejects(settle(),{code:'REFERRAL_AFTERCARE_NOT_READY'});";
if(!source.includes(anchor))throw Error('probe anchor missing');
source=source.replace(anchor,anchor+"\n await assert.rejects(finance.review(reviewer.ctx,{record_id:pendingSettlement.id,expected_version:pendingSettlement.object_version,decision:'APPROVED',reason:'Synthetic review after exclusion',verification:{parties_verified:true,contract_verified:true,amount_verified:true,evidence_verified:true},operation_key:key()}),{code:'REFERRAL_AFTERCARE_NOT_READY'});");
// Diagnostic only: do not overwrite any full-run business/HTTP artifacts.
require('node:fs/promises').writeFile=async()=>{};
const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));mod._compile(source,file);
