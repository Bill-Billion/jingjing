"use strict";
// Local synthetic fixtures only. Every launcher owns and removes its random database.
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const scenarios=require('./joint-test-scenarios.json'),root=path.resolve(__dirname,'..');
const args=process.argv.slice(2),mode=args[0],selected=args[1]?scenarios.filter(s=>s.key===args[1]):scenarios;
if(!['list','start','check'].includes(mode)||!selected.length||args.length>2||mode==='start'&&!args[1]){console.error('用法：node scripts/joint-test-data.cjs list | start <名称> | check [名称]');process.exit(1);}
const run=file=>spawn(process.execPath,[path.join(__dirname,file)],{cwd:root,env:process.env,windowsHide:true,stdio:['pipe','pipe','pipe']});
async function check(s){
 const child=run(s.launcher);let ready,buffer='',closed=false;const ended=new Promise(resolve=>{child.once('error',()=>resolve(-1));child.once('close',code=>{closed=true;resolve(code);});});
 const report={name:s.name,key:s.key,status:'FAIL',synthetic_only:true};
 let timer;
 try{
  ready=await new Promise((resolve,reject)=>{
   timer=setTimeout(()=>reject(Error('START_TIMEOUT')),s.start_timeout_ms||90000);
   child.stdout.on('data',b=>{buffer+=b.toString();let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const v=JSON.parse(line);if(v.status==='READY'){clearTimeout(timer);resolve(v);}}catch{}}});
   ended.then(code=>reject(Error('START_EXIT_'+code)));
  });
  if(ready.synthetic_only!==true||!ready.access_file||!ready.stop_file)throw Error('INVALID_FIXTURE');
  const folder=path.dirname(path.resolve(root,ready.access_file));if(!folder.startsWith(path.join(root,'.local')+path.sep))throw Error('INVALID_FIXTURE_PATH');
  const smoke=spawn(process.execPath,[path.join(__dirname,s.smoke),path.relative(root,folder)],{cwd:root,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';smoke.stdout.on('data',b=>{output+=b.toString();});smoke.stderr.on('data',()=>{});
  const result=await new Promise(resolve=>{const timeout=setTimeout(()=>{smoke.kill();resolve(-1);},120000);smoke.once('error',()=>{clearTimeout(timeout);resolve(-1);});smoke.once('close',code=>{clearTimeout(timeout);resolve(code);});});
  if(result!==0)throw Error('SCENARIO_CHECK_FAILED');
  const last=output.trim().split(/\r?\n/).map(line=>{try{return JSON.parse(line);}catch{return null;}}).filter(Boolean).pop();
  if(last?.status!=='PASS'&&last?.result!=='PASS')throw Error('CHECK_RESULT_MISSING');
  report.checks=last.checks;report.status='PASS';report.scenarios=ready.scenarios;report.page_testing='NOT_RUN';
 }catch(e){report.error=/^[A-Z0-9_]+$/.test(e.message)?e.message:'CHECK_FAILED';}
 finally{
  clearTimeout(timer);
  if(ready?.stop_file){const stop=path.resolve(root,ready.stop_file);if(stop.startsWith(path.join(root,'.local')+path.sep))await fs.writeFile(stop,'stop\n');}
  else if(!closed)child.stdin.write('quit\n');
  let timeout;const code=await Promise.race([ended,new Promise(resolve=>{timeout=setTimeout(()=>resolve('CLEANUP_TIMEOUT'),s.cleanup_timeout_ms||15000);})]);clearTimeout(timeout);
  if(code!==0){report.status='FAIL';report.cleanup=code;}else report.cleanup='STOPPED';
 }
 return report;
}
(async()=>{
 if(mode==='list'){for(const s of selected)console.log(s.key+' — '+s.name);return;}
 if(mode==='start'){
  const child=spawn(process.execPath,[path.join(__dirname,selected[0].launcher)],{cwd:root,env:process.env,windowsHide:true,stdio:'inherit'});
  child.on('error',()=>{process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});return;
 }
 const results=[];for(const s of selected){const r=await check(s);results.push(r);console.log(JSON.stringify(r));}
 const out=path.join(root,'.local/joint-test-data');await fs.mkdir(out,{recursive:true});
 await fs.writeFile(path.join(out,'CHECK_RESULTS.json'),JSON.stringify({checked_at:new Date().toISOString(),synthetic_only:true,results},null,2)+'\n');
 if(results.some(r=>r.status!=='PASS'))process.exitCode=1;
})().catch(()=>{console.error('JOINT_TEST_DATA_FAILED');process.exitCode=1;});
