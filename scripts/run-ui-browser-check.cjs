 'use strict';
// Isolated browser-test lifecycle. Launch actual Node processes, never npm wrappers.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const {spawn} = require('node:child_process');
const {createRequire} = require('node:module');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function localUrl(value) {
  const u = new URL(value);
  if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1' || !u.port || u.username || u.password || u.pathname !== '/') throw Error('TEST_LOOPBACK_URL_REQUIRED');
  return u;
}
async function freePort(value) {
  const u = localUrl(value);
  await new Promise((resolve,reject) => {
    const server=net.createServer(); server.once('error',()=>reject(Error('TEST_PORT_ALREADY_IN_USE')));
    server.listen(Number(u.port),u.hostname,()=>server.close(resolve));
  });
}
function launch(spec, env, log) {
  const fd=fs.openSync(log,'w'); let child;
  try { child=spawn(process.execPath,[spec.file,...(spec.args||[])],{cwd:spec.cwd,env,stdio:['ignore',fd,fd],windowsHide:true}); }
  finally { fs.closeSync(fd); }
  let ended=false;
  const done=new Promise(resolve=>{
    child.once('error',()=>{ended=true;resolve({code:1,signal:null});});
    child.once('exit',(code,signal)=>{ended=true;resolve({code,signal});});
  });
  return {child,done,alive:()=>!ended};
}
async function stop(handle) {
  if (!handle || !handle.alive()) return;
  handle.child.kill('SIGTERM');
  let timer;
  const exited=await Promise.race([handle.done.then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),5000);})]).finally(()=>clearTimeout(timer));
  if (!exited) { handle.child.kill('SIGKILL'); await handle.done; }
}
async function healthy(url) {
  try { const r=await fetch(url+'/health',{signal:AbortSignal.timeout(1000)}); return r.status===200 && (await r.json()).data?.current_status==='UP'; }
  catch { return false; }
}
async function runSession(options) {
  const {api,web,check,statePath,apiUrl,webUrl,logDir,timeoutMs=60000,env=process.env}=options;
  localUrl(apiUrl); localUrl(webUrl);
  if(fs.existsSync(statePath)) throw Error('STALE_TEST_STATE_REFUSED');
  await freePort(apiUrl); await freePort(webUrl);
  fs.mkdirSync(logDir,{recursive:true});
  let apiProcess,webProcess,checkProcess,interrupted=false;
  const signal=()=>{interrupted=true;};
  process.on('SIGINT',signal); process.on('SIGTERM',signal);
  try {
    apiProcess=launch(api,env,path.join(logDir,'api.log'));
    webProcess=launch(web,env,path.join(logDir,'web.log'));
    const deadline=Date.now()+timeoutMs; let ready=false;
    while(Date.now()<deadline) {
      if(interrupted) throw Error('TEST_INTERRUPTED');
      if(!apiProcess.alive()||!webProcess.alive()) throw Error('TEST_SERVICE_EXITED_BEFORE_READY');
      let state;
      try { state=JSON.parse(fs.readFileSync(statePath,'utf8')); } catch {}
      if(state) {
        if(state.testOnly!==true || state.apiUrl!==apiUrl || (state.pid!==undefined && state.pid!==apiProcess.child.pid)) throw Error('TEST_STATE_IDENTITY_MISMATCH');
        if(await healthy(apiUrl) && await healthy(webUrl)) {ready=true;break;}
      }
      await sleep(100);
    }
    if(!ready) throw Error('TEST_PROXY_READINESS_TIMEOUT');
    if(!apiProcess.alive()||!webProcess.alive()) throw Error('TEST_SERVICE_EXITED_BEFORE_CHECK');
    checkProcess=launch(check,env,path.join(logDir,'check.log'));
    const checkDeadline=Date.now()+(options.checkTimeoutMs||180000);
    while(checkProcess.alive()) {
      if(Date.now()>checkDeadline) throw Error('BROWSER_CHECK_TIMEOUT');
      if(interrupted) throw Error('TEST_INTERRUPTED');
      if(!apiProcess.alive()||!webProcess.alive()) throw Error('TEST_SERVICE_EXITED_DURING_CHECK');
      await sleep(100);
    }
    const result=await checkProcess.done;
    if(result.code!==0) throw Error('BROWSER_CHECK_FAILED');
  } finally {
    await stop(checkProcess); await stop(webProcess); await stop(apiProcess);
    process.removeListener('SIGINT',signal); process.removeListener('SIGTERM',signal);
  }
}
async function main() {
  const stage=process.argv[2];
  const sms=process.argv[3]==='--sms';
  if(process.argv.length>3 && !(sms && stage==='11' && process.argv.length===4)) throw Error('UNKNOWN_BROWSER_CHECK_OPTION');
  const ports={'11':[3220,5199],'14':[3242,5202],'15':[3262,5203],'16':[3282,5206],'17':[3302,5205],'18':[3322,5207],'19':[3342,5209],'20':[3362,5211]};
  if(!ports[stage]) throw Error('UNKNOWN_BROWSER_TEST_STAGE');
  const root=path.resolve(__dirname,'..'), webRoot=path.join(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace');
  const apiUrl=`http://127.0.0.1:${ports[stage][0]}`,webUrl=`http://127.0.0.1:${ports[stage][1]}`;
  const statePath=path.join(root,`.local/pr${stage}-ui-runtime.json`),logDir=path.join(root,`.local/browser-check-${stage}`);
  const requireWeb=createRequire(path.join(webRoot,'package.json'));
  const env={...process.env,VITE_BACKEND_ORIGIN:apiUrl,BASE_URL:webUrl,[`PR${stage}_WEB_URL`]:webUrl,[`PR${stage}_UI_STATE_FILE`]:statePath,
    CHROME_PATH:process.env.CHROME_PATH||requireWeb('playwright-core').chromium.executablePath()};
  const check=sms?{file:path.join(root,'scripts/sms-login-browser-check.mjs'),cwd:root}:stage==='11'?{file:path.join(webRoot,'tools/e2e-login.mjs'),cwd:webRoot}:{file:path.join(root,`scripts/pr${stage}-ui-browser-check.mjs`),cwd:root};
  await runSession({api:{file:path.join(root,`scripts/pr${stage}-ui-test-server.cjs`),args:['--test-only'],cwd:root},
    web:{file:path.join(webRoot,'node_modules/vite/bin/vite.js'),args:['--host','127.0.0.1','--port',String(ports[stage][1]),'--strictPort'],cwd:webRoot},
    check,statePath,apiUrl,webUrl,logDir,env});
  console.log(`Browser stage ${stage}: PASS; API and web processes stopped. Logs: .local/browser-check-${stage}`);
}
if(require.main===module) main().catch(error=>{
  console.error(error.message);
  const stage=process.argv[2];
  if(/^\d+$/.test(stage||'')) for(const name of ['api','web','check']) {
    const log=path.resolve(__dirname,`../.local/browser-check-${stage}/${name}.log`);
    if(fs.existsSync(log)) console.error(`${name} log (tail):\n`+fs.readFileSync(log,'utf8').slice(-12000));
  }
  process.exitCode=1;
});
module.exports={runSession};
