const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const file=path.resolve('晶晶日上工程交接包/01_源码/backend_server/test/engagement.integration.test.cjs');
let source=fs.readFileSync(file,'utf8');
const anchor=" const risk=await write('excludeOrder',reviewer,{order_id:live.id,reason:'Synthetic confirmed invalid transaction must not release referral commission'});";
if(!source.includes(anchor))throw Error('probe anchor missing');
source=source.replace(anchor,anchor+"\n await require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:buyer2.account_id,action:'ENGAGEMENT_REVIEW',enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:referrer-review',reason:'isolated operator prerequisite'});\n await assert.rejects(write('moderate',buyer2,{record_id:risk.id,expected_version:risk.object_version,reason:'Referrer cannot restore own commission',exclude:false}),{code:'SELF_REVIEW_FORBIDDEN'});");
// Diagnostic only: do not overwrite any full-run business/HTTP artifacts.
require('node:fs/promises').writeFile=async()=>{};
const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));mod._compile(source,file);
