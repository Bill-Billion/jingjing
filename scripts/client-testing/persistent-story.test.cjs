const test=require('node:test'),assert=require('node:assert/strict');
const {assertEnv,validateManifest}=require('./persistent-story.cjs');
const database='jx_test_story_123_aabbccddeeff',env={NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:database};
test('长期测试只接受指定本机隔离数据库，拒绝正式环境及远端主机',()=>{
 assert.doesNotThrow(()=>assertEnv(env,database));
 for(const patch of [{NODE_ENV:'production'},{MYSQL_HOST:'example.com'},{MYSQL_PORT:'3306'},{MYSQL_USER:'root'},{MYSQL_DATABASE:'jx_dev'}])assert.throws(()=>assertEnv({...env,...patch},database));
 assert.throws(()=>assertEnv({...env,MYSQL_DATABASE:'production'},'production'));
});
test('长期测试保留清单需要独立环境标识和原有受限路由',()=>{
 const m={format:1,synthetic_only:true,database,database_env:env,environment_id:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',secret:'s'.repeat(44),access:{synthetic_only:true,accounts:{buyer:{}}},rules:[{method:'GET',pattern:'^/api/v1/me$'}]};
 assert.doesNotThrow(()=>validateManifest(m,database));
 for(const patch of [{synthetic_only:false},{database:'other'},{environment_id:'missing'},{rules:[{method:'DELETE',pattern:'.*'}]}])assert.throws(()=>validateManifest({...m,...patch},database));
});
