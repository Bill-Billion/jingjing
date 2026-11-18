// Fresh loopback fixture and current build. Only private child IPC may stop it.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {readFile,mkdir,writeFile,access} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),out=resolve(process.env.JX_BROWSER_EVIDENCE_DIR||''),build=resolve(process.env.JX_INDEPENDENT_WEB||''),allowed=resolve(root,'.local');
for(const p of [out,build]){const r=relative(allowed,p);assert(r&&!r.startsWith('..')&&!isAbsolute(r),'Use explicit .local output and current build');}
assert(process.env.JX_MYSQL_TEST_ENV_FILE);await access(resolve(build,'index.html'));await mkdir(out,{recursive:true});
const stateFile=resolve(out,'private-runtime.json');await assert.rejects(access(stateFile));
const log=createWriteStream(resolve(out,'fixture.log')),env={...process.env,PR18_UI_STATE_FILE:stateFile};
await once(log,'open');
const fixture=spawn(process.execPath,['scripts/tonight-core-projects-server-20261104.cjs','--test-only'],{cwd:root,env,stdio:['ignore',log,log,'ipc'],windowsHide:true});
const done=new Promise((resolve,reject)=>{fixture.once('exit',code=>resolve(code));fixture.once('error',reject)});done.catch(()=>{});
let web,childCode=null,problem=null;
try{
 let state;const deadline=Date.now()+240000;
 while(!state){if(fixture.exitCode!==null)throw Error('Fixture stopped; see fixture.log');try{state=JSON.parse(await readFile(stateFile,'utf8'))}catch(e){if(!['ENOENT'].includes(e.code)&&!(e instanceof SyntaxError))throw e;}
  if(!state){assert(Date.now()<deadline,'Fixture setup deadline');await new Promise(r=>setTimeout(r,500));}}
 assert.equal(state.pid,fixture.pid);assert.equal(state.testOnly,true);assert.equal(new URL(state.apiUrl).hostname,'127.0.0.1');
 const w=resolve(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace'),req=createRequire(resolve(w,'package.json')),{preview}=await import(pathToFileURL(req.resolve('vite')));
 web=await preview({root:w,base:'/workspace/',configFile:false,build:{outDir:build},preview:{host:'127.0.0.1',port:5347,strictPort:true,proxy:{'/api':{target:state.apiUrl}}}});
 const child=spawn(process.execPath,['scripts/tonight-core-projects-ui-20261104.mjs'],{cwd:root,env:{...env,PR18_WEB_URL:'http://127.0.0.1:5347/workspace'},stdio:'inherit',windowsHide:true});
 childCode=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject)});assert.equal(childCode,0,'Project browser check failed');
}catch(e){problem=e.message;process.exitCode=1;console.error(problem);}
finally{
 await web?.close();if(fixture.connected)fixture.send({type:'JX_TEST_SHUTDOWN'});
 const fixtureCode=await done;log.end();let privateStateRemoved=false;try{await access(stateFile)}catch(e){if(e.code==='ENOENT')privateStateRemoved=true;else throw e;}
 await writeFile(resolve(out,'cleanup.json'),JSON.stringify({child_code:childCode,fixture_code:fixtureCode,private_state_removed:privateStateRemoved,problem,public_service:false},null,2));
 if(fixtureCode!==0||!privateStateRemoved)process.exitCode=1;
}
