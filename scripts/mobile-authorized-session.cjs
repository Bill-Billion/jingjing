'use strict';
// User-authorized 75-minute synthetic session. Own child processes only.
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
async function main(){
 assert.equal(process.argv[2],'--authorized-full-test');
 const exe=process.env.JX_CLOUDFLARED;assert(exe&&fs.existsSync(exe),'Existing cloudflared is required');
 const dir=path.join(root,'.local/mobile-session');fs.mkdirSync(dir,{recursive:true});
 const stateFile=path.join(dir,'session.json');assert(!fs.existsSync(stateFile),'Do not overwrite an existing session');
 const startedAt=Date.now(),expiresAt=startedAt+75*60000,children=[];
 const state={testOnly:true,syntheticOnly:true,scenario:'full',pid:process.pid,startedAt,expiresAt,closed:false};
 const save=()=>fs.writeFileSync(stateFile,JSON.stringify(state,null,2));save();
 let stopped=false,timer;
 const stop=()=>{if(stopped)return;stopped=true;clearTimeout(timer);for(const child of children)if(child.exitCode===null)child.kill();state.closed=true;state.closedAt=Date.now();save();};
 process.once('SIGINT',stop);process.once('SIGTERM',stop);process.once('exit',stop);
 timer=setTimeout(stop,expiresAt-Date.now());
 const gateway=spawn(process.execPath,[path.join(root,'scripts/mobile-fixture-gateway.cjs'),'full','--test-only'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});children.push(gateway);
 gateway.on('error',stop);gateway.on('exit',stop);
 let ready=false;
 for(let i=0;i<100&&!stopped;i++){
  try{const r=await fetch('http://127.0.0.1:3380/health',{signal:AbortSignal.timeout(300)});if(r.status===200&&(await r.json()).syntheticOnly){ready=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,100));
 }
 if(!ready){stop();throw new Error('Local gateway failed to become ready');}
 const log=fs.createWriteStream(path.join(dir,'tunnel.log'),{flags:'a'});
 const tunnel=spawn(exe,['tunnel','--url','http://127.0.0.1:3380','--no-autoupdate','--protocol','http2'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});children.push(tunnel);
 state.gatewayPid=gateway.pid;state.tunnelPid=tunnel.pid;save();
 tunnel.on('error',stop);tunnel.on('exit',()=>{log.end();stop();});
 let output='';
 const capture=chunk=>{log.write(chunk);output=(output+chunk.toString()).slice(-10000);const m=output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(m&&!state.url){state.url=m[0];save();console.log(JSON.stringify({url:state.url,expiresAt,syntheticOnly:true}));}};
 tunnel.stdout.on('data',capture);tunnel.stderr.on('data',capture);
}
main().catch(()=>{console.error('Temporary mobile session could not start; inspect local session record.');process.exitCode=1;});
