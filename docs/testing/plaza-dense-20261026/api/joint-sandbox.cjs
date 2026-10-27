'use strict';
// Disposable synthetic database and loopback HTTP, never a production launcher.
const fs=require('node:fs/promises'),path=require('node:path'),{randomBytes}=require('node:crypto');
const root=path.resolve(__dirname,'../../../..'),backend=path.join(root,'晶晶日上工程交接包/01_源码/backend_server');
require(path.join(backend,'scripts/test-network-guard.cjs'));
const http=require('node:http'),mysql=require(path.join(backend,'node_modules/mysql2/promise'));
async function main(){
  if(process.argv.length!==2||!process.env.JX_MYSQL_TEST_ENV_FILE)throw Error('Set JX_MYSQL_TEST_ENV_FILE for the isolated local MySQL');
  const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
  for(const [key,value]of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))if(env[key]!==value)throw Error('Refusing non-isolated environment');
  const name='jx_test_plaza_'+process.pid+'_'+randomBytes(6).toString('hex'),out=path.join(root,'.local/plaza-dense-sandbox',name);
  let control,db,server,created=false,cleanupPromise,timer,watcher,stopped=false,ready=false;
  const cleanup=()=>cleanupPromise||(cleanupPromise=(async()=>{
    clearTimeout(timer);clearInterval(watcher);const failed=[];
    const step=async(key,fn)=>{try{await fn();return true;}catch{failed.push(key);return false;}};
    const credentials=await step('credentials',()=>fs.unlink(path.join(out,'access.json')).catch(e=>{if(e.code!=='ENOENT')throw e;}));
    if(server)await step('http',async()=>{server.closeAllConnections();await new Promise((resolve,reject)=>server.close(e=>e&&e.code!=='ERR_SERVER_NOT_RUNNING'?reject(e):resolve()));});
    if(db)await step('pool',()=>db.close());
    let removed=!created;if(created&&/^jx_test_plaza_[0-9]+_[a-f0-9]{12}$/.test(name))removed=await step('database',()=>control.query('DROP DATABASE '+mysql.escapeId(name)));
    if(control)await step('control',()=>control.end());
    const result={status:failed.length?'CLEANUP_FAILED':'STOPPED',synthetic_only:true,database_removed:removed,credentials_removed:credentials,failed_steps:failed};
    await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'status.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(failed.length)process.exitCode=1;
  })());
  function stop(){stopped=true;if(ready)cleanup().catch(()=>{console.error('CLEANUP_FAILED');process.exitCode=1;});}
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try{
    control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
    await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');created=true;
    db=await require(path.join(backend,'src/infrastructure/database')).openDatabase({...env,MYSQL_DATABASE:name});
    await require(path.join(backend,'src/infrastructure/database/migrator')).migrate(db);
    const f=await require('./joint-seed.cjs').prepare(db);if(stopped)throw Error('Stopped during preparation');
    const origins=['http://127.0.0.1:5500','http://localhost:5500','http://127.0.0.1:5000','http://localhost:5000','http://127.0.0.1:5173','http://localhost:5173'];
    if(process.env.JX_UI_ORIGIN){const u=new URL(process.env.JX_UI_ORIGIN);if(u.protocol!=='http:'||!['127.0.0.1','localhost'].includes(u.hostname))throw Error('Loopback UI origin required');origins.push(u.origin);}
    const app=require(path.join(backend,'src/http/account-api')).createAccountApi({db,secret:f.secret,supplyStorageFactory:f.storageFactory,supplyEnv:{ARTIST_PLATFORM_MERCHANT_PARTY_ID:f.merchantId},allowedOrigins:origins});
    server=http.createServer((req,res)=>{
      const p=new URL(req.url,'http://127.0.0.1').pathname;
      const allowed=/^\/api\/v1\/(artists|stock|notices|auditions|operations)(\/|$)/.test(p)||/^\/api\/v1\/me(?:\/parties)?$/.test(p)||p==='/api/v1/privacy/preferences'||/^\/api\/v1\/trade\/records(?:\/|$)/.test(p)||/^\/(health|ready)$/.test(p);
      if(allowed)return app(req,res);
      res.writeHead(403,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:{code:'LOCAL_FIXTURE_ROUTE_DISABLED'}}));
    });
    server.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
    const base_url='http://127.0.0.1:'+server.address().port+'/api/v1';await fs.mkdir(out,{recursive:true});
    await fs.writeFile(path.join(out,'access.json'),JSON.stringify({synthetic_only:true,base_url,accounts:f.accounts,scenarios:f.scenarios},null,2),{mode:0o600});
    await fs.writeFile(path.join(out,'status.json'),JSON.stringify({status:'RUNNING',synthetic_only:true,database:name,host:'127.0.0.1',port:server.address().port,expires_in_minutes:240},null,2));
    ready=true;watcher=setInterval(()=>fs.access(path.join(out,'stop')).then(stop).catch(e=>{if(e.code!=='ENOENT')stop();}),500);watcher.unref();timer=setTimeout(stop,240*60*1000);
    console.log(JSON.stringify({status:'READY',base_url,access_file:path.relative(root,path.join(out,'access.json')),stop_file:path.relative(root,path.join(out,'stop')),synthetic_only:true,city:f.scenarios.city,artists:f.scenarios.artists.length,stock:f.scenarios.stock.length,notices:f.scenarios.notices.length,expires_in_minutes:240,limits:'Synthetic pictogram PNGs and playable color-bar MP4 only; all identities and payment facts are synthetic; real payment routes are blocked.'}));
  }catch(e){await cleanup();throw e;}
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
