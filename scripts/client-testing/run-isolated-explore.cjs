// Local-only orchestration. Reads a private plan; retained databases are never reset.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {start}=require('./persistent-story.cjs'),{prepareIsolated}=require('./prepare-isolated-explore.cjs');
function expiryFor(runtimes,requested,now=Date.now()){
 const ends=runtimes.map(r=>Date.parse(r.status.expires_at)-120000);
 assert(ends.length&&ends.every(Number.isFinite));
 if(requested!==undefined){assert(typeof requested==='string');ends.push(Date.parse(requested));}
 assert(ends.every(Number.isFinite));const end=Math.min(...ends);
 assert(end>now,'The original review window has expired; do not extend it on restart');
 return new Date(end).toISOString();
}
async function run(file){
 const root=path.resolve(__dirname,'../..'),local=fs.realpathSync(path.join(root,'.local'));
 file=fs.realpathSync(file);assert(file.startsWith(local+path.sep));const plan=JSON.parse(fs.readFileSync(file,'utf8'));
 assert(plan.synthetic_only===true&&Array.isArray(plan.databases)&&plan.databases.length>=2&&plan.databases.length<=8);
 assert(new Set(plan.databases).size===plan.databases.length);
 assert(Number.isInteger(plan.hours)&&plan.hours>=1&&plan.hours<=72);
 assert(new URL(plan.options.origin).hostname==='127.0.0.1','This runner starts only a local review site');
 const runtimes=[];let child,closing;
 const stop=()=>closing||(closing=(async()=>{if(child&&!child.killed)child.kill();for(const r of runtimes.reverse())await r.stop();})());
 process.once('SIGINT',()=>stop().catch(()=>{process.exitCode=1;}));process.once('SIGTERM',()=>stop().catch(()=>{process.exitCode=1;}));
 try{
  for(const name of plan.databases)runtimes.push(await start(name,{hours:plan.hours}));
  const options={...plan.options,expires_at:expiryFor(runtimes,plan.options.expires_at)};
  const prepared=prepareIsolated(runtimes.map(r=>path.join(r.dir,'access.json')),options);
  console.log(JSON.stringify(prepared));
  child=spawn(process.execPath,[path.join(__dirname,'server.cjs'),path.join(root,prepared.config_file)],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
  if(code!==0&&code!==null)throw Error('Local portal startup or runtime failed');
 }finally{await stop();}
}
module.exports={expiryFor};
if(require.main===module)run(process.argv[2]).catch(()=>{console.error('本机独立体验未启动或已停止；资料保留，私有配置不输出。');process.exitCode=1;});
