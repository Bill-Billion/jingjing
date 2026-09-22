'use strict';
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const suites=require('./mysql-test-suites.cjs');
const name=process.argv[2] || 'mysql';
if (!Object.hasOwn(suites,name)) {
  console.error('Unknown MySQL test suite: '+name+'. Choose: '+Object.keys(suites).join(', '));
  process.exit(1);
}
if (!process.env.JX_MYSQL_TEST_ENV_FILE) {
  console.error('JX_MYSQL_TEST_ENV_FILE is required. This command must not pass by skipping MySQL integration.');
  process.exit(1);
}
const files=suites[name];
const result=spawnSync(process.execPath,['--test',...files],{
  cwd:path.resolve(__dirname,'..'),env:{...process.env,NODE_OPTIONS:[process.env.NODE_OPTIONS,'--require ./scripts/test-network-guard.cjs'].filter(Boolean).join(' ')},stdio:'inherit',windowsHide:true,
});
process.exit(result.status===null?1:result.status);
