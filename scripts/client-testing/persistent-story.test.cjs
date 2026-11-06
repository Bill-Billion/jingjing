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

test('艺人持续资料必须保留附件并只使用隔离服务主体',()=>{const name='jx_test_artists_123_aabbccddeeff';const m={format:1,synthetic_only:true,database:name,database_env:{...env,MYSQL_DATABASE:name},environment_id:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',secret:'s'.repeat(44),access:{synthetic_only:true,accounts:{artist:{}}},rules:[{method:'GET',pattern:'^/api/v1/me$'}],file_store:true,supplyEnv:{ARTIST_PLATFORM_MERCHANT_PARTY_ID:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'}};assert.doesNotThrow(()=>validateManifest(m,name));assert.throws(()=>validateManifest({...m,file_store:false},name));assert.throws(()=>validateManifest({...m,supplyEnv:{...m.supplyEnv,OSS_ENABLED:'true'}},name));});

test('新增模拟资料只允许清理本人足迹，不能扩大为任意删除接口',()=>{
 const name='jx_test_explore_123_aabbccddeeff',m={format:1,synthetic_only:true,database:name,database_env:{...env,MYSQL_DATABASE:name},environment_id:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',secret:'s'.repeat(44),file_store:true,access:{synthetic_only:true,payment_simulation:true,accounts:{buyer:{}}},rules:[{method:'DELETE',pattern:/^\/api\/v1\/me\/collections\/history(?:\/[^/]+\/[^/]+)?$/.source}]};
 assert.doesNotThrow(()=>validateManifest(m,name));
 assert.throws(()=>validateManifest({...m,rules:[{method:'DELETE',pattern:'^/api/v1/.*$'}]},name));
});

test('换号模拟短信拒绝非白名单号码，验证码只留本机且停止时删除',async()=>{
 const fs=require('node:fs'),path=require('node:path');fs.mkdirSync('.local/phone-simulation-tests',{recursive:true});
 const dir=fs.mkdtempSync(path.resolve('.local/phone-simulation-tests/case-'));
 const name='jx_test_explore_123_aabbccddeeff',m={format:1,synthetic_only:true,database:name,database_env:{...env,MYSQL_DATABASE:name},environment_id:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',secret:'s'.repeat(44),file_store:true,access:{synthetic_only:true,payment_simulation:true,accounts:{buyer:{}},scenarios:{complete:{phone:{old_phone:'13900009801',new_phone:'13900009802'}}}},rules:[{method:'GET',pattern:'^/api/v1/me$'}]};
 const db={execute:async()=>[[{id:m.environment_id,synthetic_only:1}]]};
 const simulation=await require('./phone-simulation.cjs').create(db,m,dir);
 try{
  await assert.rejects(simulation.sms.call('send',{phone:'13900009803',code:'123456'}));
  assert(!fs.existsSync(path.join(dir,'phone-codes.json')));
  assert.deepEqual(await simulation.sms.call('send',{phone:'13900009801',code:'123456'}),{accepted:true});
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'phone-codes.json'))).codes['13900009801'],'123456');
  await assert.rejects(require('./phone-simulation.cjs').create({execute:async()=>[[{id:'wrong',synthetic_only:1}]]},m,dir));
 }finally{simulation.cleanup();assert(!fs.existsSync(path.join(dir,'phone-codes.json')));fs.rmdirSync(dir);}
});
