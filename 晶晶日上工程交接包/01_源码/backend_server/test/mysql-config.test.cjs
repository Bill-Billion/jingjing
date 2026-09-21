const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {mysqlConfig,assertLegacySQLiteAllowed}=require('../src/infrastructure/database/config');
const env={NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_USER:'test_user',MYSQL_PASSWORD:'synthetic-only',MYSQL_DATABASE:'jx_test_config'};
test('MySQL config is explicit, bounded and never defaults to a database',()=>{
  for(const key of ['DB_CLIENT','MYSQL_HOST','MYSQL_USER','MYSQL_PASSWORD','MYSQL_DATABASE']) {
    const missing={...env};delete missing[key];assert.throws(()=>mysqlConfig(missing),{code:'DB_CONFIGURATION_INVALID'});
  }
  for(const port of ['3306oops','0','65536'])assert.throws(()=>mysqlConfig({...env,MYSQL_PORT:port}));
  assert.throws(()=>mysqlConfig({...env,NODE_ENV:'prod'}));
  assert.throws(()=>mysqlConfig({...env,MYSQL_DATABASE:'db;drop'}));
  const c=mysqlConfig(env);assert.equal(c.multipleStatements,false);assert.equal(c.bigNumberStrings,true);assert.equal(c.decimalNumbers,false);
});
test('Production cannot disable TLS, use root or load missing trust material',()=>{
  assert.throws(()=>mysqlConfig({...env,NODE_ENV:'production'}));
  assert.throws(()=>mysqlConfig({...env,NODE_ENV:'production',MYSQL_USER:'root',MYSQL_SSL_MODE:'verify_identity'}));
  assert.throws(()=>mysqlConfig({...env,NODE_ENV:'production',MYSQL_SSL_MODE:'verify_identity',MYSQL_SSL_CA:'nonexistent-ca-test'}));
  assert.throws(()=>mysqlConfig({...env,MYSQL_SSL_MODE:'required'}));
});
test('Legacy SQLite is permitted only in local/test; mysql and typo never fall back',()=>{
  assert.doesNotThrow(()=>assertLegacySQLiteAllowed({NODE_ENV:'test',DB_CLIENT:'sqlite'}));
  for(const e of [{NODE_ENV:'production'},{NODE_ENV:'prod'},{NODE_ENV:'production',DB_CLIENT:'mysql'},{NODE_ENV:'test',DB_CLIENT:'mysql'},{DB_CLIENT:'typo'}])assert.throws(()=>assertLegacySQLiteAllowed(e),{code:'LEGACY_SQLITE_DISABLED'});
});
test('Legacy entry rejects before SQLite is imported or a database is opened',()=>{
  const script="try { require('./db'); process.exit(2); } catch(e) { process.stdout.write(e.code || 'OTHER'); }";
  const result=spawnSync(process.execPath,['-e',script],{cwd:path.resolve(__dirname,'..'),env:{...process.env,NODE_ENV:'production',DB_CLIENT:'mysql'},encoding:'utf8'});
  assert.equal(result.status,0);assert.equal(result.stdout,'LEGACY_SQLITE_DISABLED');
});
test('test command network guard blocks external TCP before a provider request',()=>{
  require('../scripts/test-network-guard.cjs');
  assert.throws(()=>require('node:net').connect({host:'example.com',port:443}),{code:'TEST_EXTERNAL_NETWORK_FORBIDDEN'});
});
