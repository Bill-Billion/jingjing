 'use strict';
const path=require('node:path'),{spawnSync}=require('node:child_process');
const backend=path.resolve(__dirname,'../晶晶日上工程交接包/01_源码/backend_server');
const commands={...Object.fromEntries(Object.keys(require('../晶晶日上工程交接包/01_源码/backend_server/scripts/mysql-test-suites.cjs')).map(name=>[name,['scripts/test-mysql.js',name]])),'account-api':['scripts/test-mysql.js','account-api'],'party-unit':['--test','test/party-policy.test.cjs'],party:['scripts/test-mysql.js','party'],all:['scripts/run-ci.cjs']};
const name=process.argv[2];
if(!Object.hasOwn(commands,name)) {console.error('请选择检查范围：'+Object.keys(commands).join(' | '));process.exit(1);}
const result=spawnSync(process.execPath,commands[name],{cwd:backend,env:process.env,stdio:'inherit',windowsHide:true});
process.exit(result.status===null?1:result.status);
