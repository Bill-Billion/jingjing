import {readFile,writeFile,unlink,mkdtemp} from 'node:fs/promises'
import {createServer,request} from 'node:http'
import {resolve} from 'node:path'
import {randomBytes,randomUUID} from 'node:crypto'
import {execFileSync,spawn} from 'node:child_process'
import assert from 'node:assert/strict'
const root=process.cwd(),app=resolve(root,'晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app'),out=await mkdtemp(resolve(root,'.local/pr39-audition/permission-')),access=JSON.parse(await readFile(process.env.V5_ACCESS_FILE,'utf8')),setup=JSON.parse(await readFile(resolve(root,'.local/pr39-audition/setup.json'),'utf8')),revoked=JSON.parse(await readFile(resolve(root,'.local/pr39-audition/revoke-results.json'),'utf8')),secret=randomBytes(32).toString('base64url'),adb=process.env.ADB_BIN||'adb',device='emulator-5554',checks=[],calls=[]
assert(access.synthetic_only&&setup.synthetic_only&&revoked.completed);const base=new URL(access.base_url);assert.equal(base.hostname,'127.0.0.1');let completed=false
const server=createServer(async(q,s)=>{try{
 if(q.url==='/__native/control'){
  assert.equal(q.headers.authorization,'Bearer '+secret);const chunks=[];for await(const b of q)chunks.push(b);const x=JSON.parse(Buffer.concat(chunks));let data={ok:true}
  if(x.action==='setup'){assert.equal(x.role,'mcn_staff');data={account:access.accounts.mcn_staff,booking_id:revoked.booking_id,photo_ids:setup.photo_ids}}
  else if(x.action==='grant'){const a=access.accounts.mcn_owner,r=await fetch(access.base_url+'/engagement/mcn/staff',{method:'POST',headers:{Authorization:'Bearer '+a.bearer_token,'X-Acting-Party':a.party_id,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({account_id:access.accounts.mcn_staff.account_id,person_ids:[setup.person_id],actions:['MANAGE_MATERIALS'],valid_until:'2098-01-01T00:00:00.000Z'})});assert.equal(r.status,200);data={granted:true}}
  else if(x.action==='record'){assert(/^[a-z0-9-]+$/.test(x.name));checks.push({id:x.name,result:'PASS'})}
  else if(x.action==='complete')completed=true;else throw Error('unsupported');s.setHeader('Content-Type','application/json');s.end(JSON.stringify(data));return
 }
 const target=new URL(q.url,base.origin);assert(target.pathname.startsWith('/api/v1/'));const entry={method:q.method,path:target.pathname,status:null};calls.push(entry);const proxy=request(target,{method:q.method,headers:q.headers},r=>{entry.status=r.statusCode;s.writeHead(r.statusCode,r.headers);r.pipe(s)});proxy.on('error',()=>{s.writeHead(503);s.end()});q.pipe(proxy)
}catch(e){console.error('NATIVE_PERMISSION_CONTROL_ERROR',e.message);s.writeHead(409);s.end()}})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port,defines=resolve(out,'defines.json');let error;const start=new Date().toISOString()
try{execFileSync(adb,['-s',device,'reverse',`tcp:${port}`,`tcp:${port}`]);await writeFile(defines,JSON.stringify({NATIVE_ORIGIN:'http://127.0.0.1:'+port,NATIVE_CONTROL:secret}),{mode:0o600});const run=spawn(process.env.FLUTTER_BIN||'flutter',['test','integration_test/pr39_audition_permission_native_local_test.dart','-d',device,'--no-pub','--timeout','12m','--dart-define-from-file='+defines,'--reporter','expanded'],{cwd:app,env:process.env,stdio:'inherit'});assert.equal(await new Promise(r=>run.once('exit',r)),0);assert(completed);console.log('AUDITION_NATIVE_PERMISSION_PASS',checks.length)}catch(e){error=e;console.error('AUDITION_NATIVE_PERMISSION_FAILURE',e.message)}finally{await writeFile(resolve(out,'results.json'),JSON.stringify({synthetic_only:true,completed,started_at:start,finished_at:new Date().toISOString(),booking_id:revoked.booking_id,checks,calls,error:error?.message||null,limits:'Android模拟器、实际隔离撤权及再授权；登录为合成会话。'},null,2));await unlink(defines).catch(()=>{});server.closeAllConnections();await new Promise(r=>server.close(r));execFileSync(adb,['-s',device,'reverse','--remove',`tcp:${port}`])}if(error)process.exitCode=1
