import assert from 'node:assert/strict';
import {createHash, randomInt} from 'node:crypto';
import {readFile, writeFile, mkdir, unlink} from 'node:fs/promises';
import {spawn, execFileSync} from 'node:child_process';
import {resolve, join} from 'node:path';
import net from 'node:net';

const root=resolve('.'), output=resolve('.local/tonight-login-20261104'), toolchains=resolve('../toolchains');
const app=resolve('晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app');
const adb=join(toolchains,'android-sdk/platform-tools/adb'), device=process.env.ANDROID_SERIAL||'emulator-5554';
assert(/^emulator-\d+$/.test(device),'Only an Android emulator is permitted');
await mkdir(output,{recursive:true});
const unique=String(process.pid), state=join(output,`state-${unique}.json`), defines=join(output,`defines-${unique}.json`);
const apiPort=3228, controlPort=3229;
const result={synthetic_only:true,started_at:new Date().toISOString(),steps:[],cleanup:{},passed:false};
const watched=['scripts/pr11-ui-test-server.cjs','scripts/tonight-login-native-check.mjs','晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/integration_test/tonight_login_native_local_test.dart','晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/pages/login/login_page.dart','晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/account/account_session.dart','晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/wallet/wallet_pages.dart','晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/stock/v5_support.dart'];
async function hashes(){return Object.fromEntries(await Promise.all(watched.map(async p=>[p,createHash('sha256').update(await readFile(resolve(p))).digest('hex')])));}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function free(port){await new Promise((ok,bad)=>{const s=net.createServer();s.once('error',bad);s.listen(port,'127.0.0.1',()=>s.close(ok))})}
let server,child,reverse=[],exited=false;
try{
 result.source_sha256=await hashes();
 await free(apiPort); await free(controlPort);
 const existing=execFileSync(adb,['-s',device,'reverse','--list'],{encoding:'utf8'});
 for(const port of [apiPort,controlPort]) assert(!new RegExp(`\\btcp:${port}\\b`).test(existing),'Existing emulator reverse port must not be overwritten');
 const serverEnv={...process.env,PR11_UI_API_PORT:String(apiPort),PR11_UI_CONTROL_PORT:String(controlPort),PR11_UI_STATE_FILE:state};
 server=spawn(process.execPath,['scripts/pr11-ui-test-server.cjs','--test-only'],{cwd:root,env:serverEnv,stdio:['ignore','pipe','pipe','ipc']});
 server.stdout.pipe(process.stdout);server.stderr.pipe(process.stderr);
 server.once('exit',()=>{exited=true});
 let config;
 for(let i=0;i<400&&!config;i++){
  if(exited)throw Error('isolated account API exited before ready');
  try{config=JSON.parse(await readFile(state,'utf8'))}catch{}
  if(!config)await pause(100);
 }
 assert(config?.testOnly===true,'isolated account API did not become ready');
 assert.equal(config.apiUrl,`http://127.0.0.1:${apiPort}`);
 assert.equal(config.controlUrl,`http://127.0.0.1:${controlPort}`);
 for(const port of [apiPort,controlPort]){execFileSync(adb,['-s',device,'reverse',`tcp:${port}`,`tcp:${port}`]);reverse.push(port)}
 const phone='1392'+String(randomInt(10000000)).padStart(7,'0');
 await writeFile(defines,JSON.stringify({NATIVE_API:config.apiUrl,NATIVE_CONTROL_ORIGIN:config.controlUrl,NATIVE_CONTROL_TOKEN:config.controlToken,NATIVE_SYNTHETIC_PHONE:phone}),{mode:0o600});
 const env={...process.env,PUB_CACHE:join(toolchains,'pub-cache'),ANDROID_HOME:join(toolchains,'android-sdk'),ANDROID_USER_HOME:join(toolchains,'android-user'),ANDROID_AVD_HOME:join(toolchains,'avd'),GRADLE_USER_HOME:join(toolchains,'gradle'),JAVA_HOME:join(toolchains,'jdk17/jdk-17.0.21+9/Contents/Home'),XDG_CONFIG_HOME:resolve('.local/team-next-stage-20261104/config'),FLUTTER_SUPPRESS_ANALYTICS:'true'};
 env.PATH=[join(toolchains,'flutter/bin'),join(env.JAVA_HOME,'bin'),join(toolchains,'android-sdk/platform-tools'),env.PATH].join(':');
 child=spawn(join(toolchains,'flutter/bin/flutter'),['test','integration_test/tonight_login_native_local_test.dart','-d',device,'--no-pub','--timeout','10m','--dart-define-from-file='+defines,'--reporter','expanded'],{cwd:app,env,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',chunk=>{const text=String(chunk);process.stdout.write(text);for(const marker of ['NATIVE_LOGIN_RETURNED_WITHOUT_BUSINESS_WRITE','NATIVE_LOGIN_EXPIRY_CLEARED_PRIVATE_STATE'])if(text.includes(marker)&&!result.steps.includes(marker)){result.steps.push(marker);try{const image=execFileSync(adb,['-s',device,'exec-out','screencap','-p']);void writeFile(join(output,`${marker}.png`),image)}catch{}}});
 child.stderr.pipe(process.stderr);
 const code=await new Promise((ok,bad)=>{child.once('error',bad);child.once('exit',ok)});
 assert.equal(code,0,'native login test failed');
 assert.deepEqual(result.steps,['NATIVE_LOGIN_RETURNED_WITHOUT_BUSINESS_WRITE','NATIVE_LOGIN_EXPIRY_CLEARED_PRIVATE_STATE']);
 assert.deepEqual(await hashes(),result.source_sha256,'source changed during test');
 result.passed=true;
}catch(e){result.error=e.stack;process.exitCode=1;console.error(e.stack)}
finally{
 await unlink(defines).catch(()=>{});
 for(const port of reverse){try{execFileSync(adb,['-s',device,'reverse','--remove',`tcp:${port}`])}catch{result.cleanup.reverse_error=true}}
 result.cleanup.reverse_removed=!result.cleanup.reverse_error;
 if(server&&!exited){
  if(server.connected)server.send({type:'JX_TEST_SHUTDOWN'});else server.kill('SIGTERM');
  let timer;
  const done=await Promise.race([new Promise(r=>server.once('exit',code=>r(code===0))),new Promise(r=>{timer=setTimeout(()=>r(false),30000)})]);
  clearTimeout(timer);
  result.cleanup.server_and_database=done;
  if(!done){server.kill('SIGTERM');process.exitCode=1}
 }else result.cleanup.server_and_database=!!server&&exited;
 result.finished_at=new Date().toISOString();
 await writeFile(join(output,'result.json'),JSON.stringify(result,null,2));
}
