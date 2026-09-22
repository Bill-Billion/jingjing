 'use strict';
const path=require('node:path'),{spawnSync}=require('node:child_process');
const backend=path.resolve(__dirname,'../晶晶日上工程交接包/01_源码/backend_server');
const commands={'party-unit':['--test','test/party-policy.test.cjs'],party:['scripts/test-mysql.js','party'],all:['scripts/run-ci.cjs']};
const name=process.argv[2];
if(!Object.hasOwn(commands,name)) {console.error('请选择检查范围：node scripts/backend-check.cjs party-unit | party | all');process.exit(1);}
const result=spawnSync(process.execPath,commands[name],{cwd:backend,env:process.env,stdio:'inherit',windowsHide:true});
process.exit(result.status===null?1:result.status);
