// Native Android against the SAME isolated records used by the Vue check; no real users/providers.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
const P=resolve(dirname(fileURLToPath(import.meta.url)),'..'),A=resolve(P,'晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app'),B=resolve(P,'晶晶日上工程交接包/01_源码/backend_server'),req=createRequire(resolve(B,'package.json')),express=req('express');
const source=resolve(P,process.env.JX_NATIVE_SOURCE||'.local/pr39-six-contract'),out=resolve(P,process.env.JX_NATIVE_OUTPUT||'.local/pr39-six-native'),access=JSON.parse(await readFile(resolve(source,'access.json'))),web=JSON.parse(await readFile(resolve(source,'results.json')));
assert(access.synthetic_only&&web.completed);await mkdir(out,{recursive:true});
const nativeTest=process.env.JX_NATIVE_TEST||'integration_test/pr39_six_contract_native_local_test.dart';
const coverage=nativeTest.includes('handover')?'Actual Android artist acknowledges the same order after Vue agency acknowledgment and reads preserved income.':nativeTest.includes('finish')?'Actual Android reads the same modern audition 48-hour clock and closure completed through real local execution; no claim that execution itself was performed on Android.':'Guardian invitation/review/refund were completed in Vue and read by App; Android executes controls, child access and native notice/counter/independent review. Preview catalogue only, no claim of media playback.';
const secret=randomBytes(32).toString('base64url'),adb=process.env.ADB_PATH||'adb',device='emulator-5554',checks=[],requests=[],app=express();let completed=false,nativeCase;
async function api(role,path){const a=access.accounts[role],r=await fetch(access.host+'/api/v1'+path,{headers:{Authorization:'Bearer '+a.token,...(path.startsWith('/infringement/cases')||path.startsWith('/gigs/'))?{'X-Acting-Party':a.party}:{}}});const j=await r.json();assert.equal(r.status,200,JSON.stringify(j));return j.data;}
app.post('/__native/control',express.json(),async(q,s)=>{try{assert.equal(q.ip,'127.0.0.1');assert.equal(q.get('Authorization'),'Bearer '+secret);const i=q.body;
if(i.action==='setup'){const a=access.accounts[i.role];return s.json({account:{bearer_token:a.token,account_id:a.account,party_id:a.party},records:web.records,proof:access.proofs?.[i.role],closure_id:access.closure_id,listing_id:access.listing_id,booking_id:access.booking_id});}
if(i.action==='capture'){assert.match(i.name,/^[a-z0-9-]+$/);await writeFile(resolve(out,i.name+'.png'),execFileSync(adb,['-s',device,'exec-out','screencap','-p']));checks.push({step:i.name,result:'PASS'});return s.json({saved:true});}
if(i.action==='assert-controls'){const r=await api('seller','/guardians/records/'+web.records.guardian_link);assert.equal(r.data.controls.enabled,i.enabled);}
else if(i.action==='assert-handover'){const r=await api('seller','/gigs/relations/'+web.records.relation+'/handover');assert.equal(r.items[0].status,'ACKNOWLEDGED');}
else if(i.action==='assert-usage'){const r=await api('buyer','/guardians/links/'+web.records.guardian_link+'/usage');await writeFile(resolve(out,'usage.json'),JSON.stringify(r));}
else if(i.action==='native-case'){const r=await api('buyer2','/infringement/cases?limit=100');nativeCase=r.items.find(x=>x.notice.statement.startsWith('原生合成侵权通知'));assert(nativeCase);return s.json({id:nativeCase.id});}
else if(i.action==='assert-native-case'){const r=await api('buyer2','/infringement/cases/'+i.id);assert.equal(r.current_status,'RESOLVED');assert.equal(r.restriction_active,false);}
else if(i.action==='complete')completed=true;
else throw Error('Unknown bounded test action');
s.json({ok:true});}catch(e){console.error('NATIVE_CONTROL',e.message);s.status(400).json({error:e.message});}});
app.use('/api',express.raw({type:()=>true,limit:'12mb'}),async(q,s)=>{try{const h={};for(const k of ['authorization','x-acting-party','content-type','idempotency-key','if-match'])if(q.get(k))h[k]=q.get(k);const r=await fetch(access.host+q.originalUrl,{method:q.method,headers:h,...['GET','HEAD'].includes(q.method)?{}:{body:q.body}});requests.push({method:q.method,path:q.originalUrl,status:r.status});s.status(r.status);for(const k of ['content-type','content-length','cache-control','etag'])if(r.headers.has(k))s.set(k,r.headers.get(k));s.send(Buffer.from(await r.arrayBuffer()));}catch(e){s.status(502).json({error:{code:'SYNTHETIC_PROXY_FAILED',message:e.message}});}});
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const port=server.address().port;let error;
try{execFileSync(adb,['-s',device,'reverse',`tcp:${port}`,`tcp:${port}`]);await writeFile(resolve(out,'defines.json'),JSON.stringify({NATIVE_ORIGIN:'http://127.0.0.1:'+port,NATIVE_CONTROL:secret,NATIVE_PHASE:process.env.JX_NATIVE_PHASE||'all'}),{mode:0o600});const run=spawn(process.env.FLUTTER_BIN||'flutter',['test',nativeTest,'-d',device,'--no-pub','--timeout','15m','--dart-define-from-file='+resolve(out,'defines.json'),'--reporter','expanded'],{cwd:A,env:process.env,stdio:'inherit'});assert.equal(await new Promise(r=>run.once('exit',r)),0);assert(completed);}
catch(e){error=e.stack;console.error(error);process.exitCode=1;}
finally{server.closeAllConnections();await new Promise(r=>server.close(r));execFileSync(adb,['-s',device,'reverse','--remove',`tcp:${port}`]);await unlink(resolve(out,'defines.json')).catch(()=>{});await writeFile(resolve(out,'results.json'),JSON.stringify({completed,checks,requests,error,records:{...web.records,native_case:nativeCase?.id},head:web.head,working_tree:true,checked_at:new Date().toISOString(),phase:process.env.JX_NATIVE_PHASE||'all',device:'Android API35 ARM64 native APK emulator-5554',native_test:nativeTest,limits:'Actual Android widgets with isolated MySQL HTTP. '+coverage+' No real child records/payment/provider.'},null,2));}
