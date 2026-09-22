'use strict';
const {spawnSync}=require('node:child_process');
const path=require('node:path');
if (!process.env.JX_MYSQL_TEST_ENV_FILE) {
  console.error('JX_MYSQL_TEST_ENV_FILE is required. This command must not pass by skipping MySQL integration.');
  process.exit(1);
}
const files=process.argv[2]==='party' ? ['test/party.integration.test.cjs'] : process.argv[2]==='providers' ? ['test/provider-foundation.test.cjs','test/provider-readiness.integration.test.cjs','test/storage.test.cjs'] : process.argv[2]==='worker' ? ['test/worker.integration.test.cjs','test/worker.test.cjs'] : ['test/mysql-config.test.cjs','test/mysql.integration.test.cjs'];
const result=spawnSync(process.execPath,['--test',...files],{
  cwd:path.resolve(__dirname,'..'),env:{...process.env,NODE_OPTIONS:[process.env.NODE_OPTIONS,'--require ./scripts/test-network-guard.cjs'].filter(Boolean).join(' ')},stdio:'inherit',windowsHide:true,
});
process.exit(result.status===null?1:result.status);
