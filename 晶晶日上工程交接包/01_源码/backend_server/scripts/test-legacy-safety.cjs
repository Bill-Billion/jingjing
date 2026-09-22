'use strict';
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const result=spawnSync(process.execPath,['--require','./scripts/test-network-guard.cjs','--test','test/legacy-truthfulness.test.cjs','test/finance.test.cjs','test/legacy-content-safety.test.cjs','test/legacy-mcn-safety.test.cjs'],{cwd:path.resolve(__dirname,'..'),env:process.env,stdio:'inherit',windowsHide:true});
process.exit(result.status===null?1:result.status);
