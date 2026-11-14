import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {randomBytes,randomUUID as key,createHash} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import http from 'node:http';
const root=process.cwd(),backend=resolve('晶晶日上工程交接包/01_源码/backend_server'),out=resolve('.local/pm01-stock-native');
const req=createRequire(join(backend,'package.json')),load=p=>req(join(backend,p));
load('scripts/test-network-guard.cjs');
const mysql=req('mysql2/promise'),runtime=load('../../../scripts/native-test-runtime.cjs');
const env=JSON.parse(await readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
const database='jx_test_stock_native_'+randomBytes(8).toString('hex'),secret=randomBytes(32).toString('base64url');
const result={synthetic_only:true,started_at:new Date().toISOString(),steps:[],records:{},failures:[],cleanup:{},limits:['Identity, listing approval and media are synthetic fixtures','Payments/refunds use local simulator only; no live payment provider','Native playback and emulator system file-save checked; physical device not checked','Independent licence decisions use actual reviewer Web; refund preparation uses HTTP']};
let control,db,server,proxy,web,reverse,defines,created=false,complete=false,order,payment,contract,reads=0,picker,pickerDone,savedHash,oldToken,deniedReads=0;
const fixtures=[],record=(name,detail={})=>{result.steps.push({name,...detail});console.log('PASS '+name)};
await mkdir(out,{recursive:true});
try{
 control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
 await control.query('CREATE DATABASE '+mysql.escapeId(database)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');created=true;
 db=await load('src/infrastructure/database').openDatabase({...env,MYSQL_DATABASE:database});await load('src/infrastructure/database/migrator').migrate(db);
 const S=await load('test/helpers/stock-seed.cjs').seedStock(db),sim=await load('src/testing/payment-simulator').createPaymentSimulator(db,{...env,MYSQL_DATABASE:database,JX_PAYMENT_SIMULATOR_ENABLED:'true'},{merchant_party_id:S.seller.personal_party_id,resolvePrincipal:S.resolvePrincipal});
 for(const [field,color] of [['file_id','blue'],['preview_file_id','green']]){
  const file=join(out,field+'.mp4');execFileSync(process.env.JX_TEST_FFMPEG||'ffmpeg',['-y','-f','lavfi','-i','color=c='+color+':s=160x120:d=1','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',file],{stdio:'ignore',windowsHide:true});
  const asset=await S.supply.upload(S.seller.ctx,{party_id:S.seller.personal_party_id,purpose:'WORK_CONTENT',media_type:'video/mp4',body:await readFile(file),operation_key:key()});S.listingInput[field]=asset.id;
 }
 const auth=load('src/modules/auth/repository').createAuthRepository(db,{secret:S.secret});
 const listing=await S.listing(),app=load('src/http/account-api').createAccountApi({db,secret:S.secret,supplyEnv:{MEDIA_FFMPEG:process.env.JX_TEST_FFMPEG,MEDIA_FFPROBE:process.env.JX_TEST_FFMPEG?.replace(/ffmpeg(\.exe)?$/,'ffprobe$1')},supplyStorageFactory:S.storageFactory,tradeProvidersFactory:()=>sim});
 server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1';
 async function call(role,method,path,body,version){const u=S[role],r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+u.token,...role==='reviewer'?{}:{'X-Acting-Party':u.personal_party_id},...body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':key()},...version?{'If-Match':'"'+version+'"'}:{}},...body===undefined?{}:{body:JSON.stringify(body)}});const j=await r.json();assert.equal(r.status,200,JSON.stringify(j));return j.data;}
 // Reviewer Web starts after synthetic session renewal.
 proxy=http.createServer(async(q,s)=>{try{
  if(q.url==='/__native/control'){
   assert.equal(q.headers.authorization,'Bearer '+secret);const chunks=[];for await(const c of q)chunks.push(c);const x=JSON.parse(Buffer.concat(chunks));let data={ok:true};
   if(x.action==='setup')data={account:{account_id:S.buyer.account_id,party_id:S.buyer.personal_party_id,bearer_token:S.buyer.token},listing_id:listing.id};
   else if(x.action==='expire'){
    oldToken=S.buyer.token;await db.execute('UPDATE auth_sessions SET expires_ms=0 WHERE token_hash=?',[auth.secure.digest('token',oldToken)]);
    record('same-order-session-expired-in-isolated-database');
   }else if(x.action==='renew'){
    const expired=await fetch(base+'/stock/purchases/'+order+'/content',{headers:{Authorization:'Bearer '+oldToken,'X-Acting-Party':S.buyer.personal_party_id}});assert.equal(expired.status,401);
    S.buyer.token=randomBytes(32).toString('base64url');await db.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms) VALUES (?,?,ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+3600000)',[auth.secure.digest('token',S.buyer.token),S.buyer.account_id]);
    assert(deniedReads>0,'Actual App must receive denial before synthetic re-login');record('expired-native-read-denied-and-new-synthetic-session-issued',{old_token_status:401});
   }else if(x.action==='picker'){
    assert(['save','cancel'].includes(x.mode));assert(!picker||picker.exitCode!==null);
    picker=spawn(process.platform==='win32'?'python':'python3',[join(root,'scripts/native-document-picker.py'),reverse.adb,reverse.device,x.mode,order+'.mp4',join(out,'picker-'+x.mode+'.xml')],{stdio:['ignore','pipe','pipe'],windowsHide:true});
    pickerDone=new Promise((y,n)=>{picker.once('error',n);picker.once('exit',code=>code===0?y():n(Error('System picker failed '+code)))});pickerDone.catch(()=>{});picker.stdout.on('data',b=>process.stdout.write(b));picker.stderr.on('data',b=>process.stderr.write(b));
   }else if(x.action==='saved'){
    await pickerDone;assert(/^[0-9a-f-]{36}$/.test(order));
    const bytes=execFileSync(reverse.adb,['-s',reverse.device,'exec-out','cat','/sdcard/Download/'+order+'.mp4']);
    savedHash=createHash('sha256').update(bytes).digest('hex');assert.equal(savedHash,createHash('sha256').update(await readFile(join(out,'file_id.mp4'))).digest('hex'));
    record('native-system-save-matches-purchased-file',{sha256:savedHash,size:bytes.length,order_id:order});
   }else if(x.action==='cancelled'){await pickerDone;record('native-system-save-cancelled-without-receipt');}
   else if(x.action==='payment-ready'){
    assert(order&&payment,'App must create order and payment first');contract=(await call('buyer','GET','/trade/records/'+order)).data.contract;
    await sim.choose(S.buyer.ctx,{record_id:payment,party_id:S.buyer.personal_party_id,state:'SUCCEEDED'});data={order_id:order};result.records={listing_id:listing.id,order_id:order,payment_id:payment};record('native-created-same-order-and-payment');
   }else if(x.action==='verify-paid'){
    assert.equal((await call('buyer','GET','/trade/records/'+order)).current_status,'PAID');assert.equal((await call('buyer','GET','/stock/purchases/'+order)).data.status,'ACTIVE');record('native-reconciled-simulated-payment');
   }else if(x.action==='refund'){
    if(!web)web=await load('test/support/stock-refund-browser.cjs').start({base,buyer:S.buyer,reviewer:S.reviewer,fixtures,expectedRefunds:2,outputDir:join(out,'web')});
    const action=x.license_action;assert(['KEEP','REVOKE'].includes(action));assert(reads>0,'App must actually read paid content');let p=await call('buyer','GET','/stock/purchases/'+order);assert(p.data.current_case_id,'App must open original aftercare case');
    const caseId=p.data.current_case_id,amount=action==='KEEP'?40:60;await web.resolve({id:order},{case_id:p.data.current_case_id,refund_minor:amount,license_action:action,reason:'Synthetic independent amount and licence'});
    let refund=await call('buyer','POST','/trade/refunds',{payment_id:payment,allocations:[{line_id:'stock',amount_minor:amount}],reason:'Synthetic approved original case'});
    refund=await call('reviewer','POST','/trade/records/'+refund.id+'/reviews',{decision:'APPROVED',reason:'Synthetic independent financial review'},refund.object_version);
    await call('reviewer','POST','/trade/refunds/'+refund.id+'/execution',{});
    await sim.choose(S.buyer.ctx,{record_id:refund.id,party_id:S.buyer.personal_party_id,state:'SUCCEEDED'});
    await call('buyer','POST','/trade/refunds/'+refund.id+'/reconciliation',{});
    p=await call('buyer','GET','/stock/purchases/'+order);assert.equal(p.data.status,action==='KEEP'?'ACTIVE':'REVOKED');assert.deepEqual((await call('buyer','GET','/trade/records/'+order)).data.contract,contract);
    await web.afterRefund({id:order},action);record('same-order-'+action,{refund_id:refund.id,amount_minor:amount,case_id:caseId,license:p.data.status});reads=0;
   }else if(x.action==='capture'){
    assert(['native-paid','native-KEEP','native-REVOKE'].includes(x.name));await writeFile(join(out,x.name+'.png'),execFileSync(reverse.adb,['-s',reverse.device,'exec-out','screencap','-p']));
   }else if(x.action==='complete'){
    assert(savedHash);const r=await fetch(base+'/stock/purchases/'+order+'/content',{headers:{Authorization:'Bearer '+S.buyer.token,'X-Acting-Party':S.buyer.personal_party_id}});assert.equal(r.status,409);
    const retained=execFileSync(reverse.adb,['-s',reverse.device,'exec-out','cat','/sdcard/Download/'+order+'.mp4']);
    assert.equal(createHash('sha256').update(retained).digest('hex'),savedHash);
    record('revoked-download-denied-existing-device-copy-not-remotely-erased',{status:r.status});
    assert.equal(result.steps.filter(x=>['same-order-KEEP','same-order-REVOKE'].includes(x.name)).length,2);complete=true;}
   else throw Error('Unknown synthetic control');
   s.setHeader('Content-Type','application/json');s.end(JSON.stringify(data));return;
  }
  const target=http.request(new URL(q.url,base),{method:q.method,headers:q.headers},r=>{
   const chunks=[];r.on('data',c=>chunks.push(c));r.on('end',()=>{const bytes=Buffer.concat(chunks);if(r.statusCode===401&&q.url.endsWith('/content'))deniedReads++;if(r.statusCode===200){if(q.method==='POST'&&q.url==='/api/v1/stock/checkout')order=JSON.parse(bytes).data.id;if(q.method==='POST'&&q.url==='/api/v1/trade/payments')payment=JSON.parse(bytes).data.id;if(q.method==='GET'&&q.url.endsWith('/content'))reads++;}
    s.writeHead(r.statusCode,r.headers);s.end(bytes);
   });
  });target.on('error',e=>{result.failures.push(e.message);s.writeHead(503);s.end()});q.pipe(target);
 }catch(e){result.failures.push(e.stack);console.error('STOCK_CONTROL '+e.stack);s.writeHead(409);s.end(JSON.stringify({error:'synthetic control failed'}));}});
 await new Promise(r=>proxy.listen(0,'127.0.0.1',r));const port=proxy.address().port,adb=runtime.adbPath(root),device=process.env.ANDROID_SERIAL||'emulator-5554';assert(/^emulator-\d+$/.test(device));
 execFileSync(adb,['-s',device,'reverse','tcp:'+port,'tcp:'+port]);reverse={adb,device,port};defines=join(out,'defines.json');await writeFile(defines,JSON.stringify({NATIVE_ORIGIN:'http://127.0.0.1:'+port,NATIVE_CONTROL:secret}),{mode:0o600});
 const child=runtime.runNative({root,test:'integration_test/pm01_stock_aftercare_native_local_test.dart',device,defines});assert.equal(await new Promise((y,n)=>{child.once('error',n);child.once('exit',y)}),0);assert(complete);assert.equal(result.failures.length,0);result.passed=true;
}catch(e){result.passed=false;result.error=e.stack;console.error(e.stack);process.exitCode=1}
finally{
 if(picker&&picker.exitCode===null){picker.kill();await pickerDone.catch(()=>{});}if(reverse&&order&&/^[0-9a-f-]{36}$/.test(order)){execFileSync(reverse.adb,['-s',reverse.device,'shell','rm','-f','/sdcard/Download/'+order+'.mp4','/sdcard/pm01-document-picker.xml']);result.cleanup.synthetic_device_file_removed=true;}
 if(defines)await unlink(defines).catch(()=>{});if(reverse){execFileSync(reverse.adb,['-s',reverse.device,'reverse','--remove','tcp:'+reverse.port]);result.cleanup.reverse_removed=true;}
 await web?.close();for(const s of [proxy,server])if(s){s.closeAllConnections();await new Promise(r=>s.close(r));}
 await db?.close();if(created&&/^jx_test_stock_native_[a-f0-9]{16}$/.test(database)){await control.query('DROP DATABASE '+mysql.escapeId(database));result.cleanup.database_removed=true;}await control?.end();
 result.cleanup.services_stopped=true;result.finished_at=new Date().toISOString();await writeFile(join(out,'result.json'),JSON.stringify(result,null,2));
}
