'use strict';
// A bounded loopback fixture for one synthetic infringement case. No purchase or provider.
const assert = require('node:assert/strict');
const {createHash,randomBytes,randomUUID} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

const root=path.resolve(__dirname,'..');
const code=path.join(root,'晶晶日上工程交接包/01_源码');
const load=file=>require(path.join(code,'backend_server',file));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const product='053168fb6e06b80680101702a733357309368809';
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2'};
load('scripts/test-network-guard.cjs');

async function main(){
  const out=path.resolve(process.argv[2]||'');
  assert(out.startsWith(path.join(root,'.local/qa18')+path.sep));
  await fs.mkdir(out,{recursive:true});
  await fs.writeFile(path.join(out,'CREATE_ONCE'),'S3-C bounded fixture',{flag:'wx'});
  const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
  for(const [key,value] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'})) assert.equal(env[key],value);
  const candidateCode=execFileSync('git',['diff','--name-only',product,'--','contracts',path.relative(root,path.join(code,'backend_server','src'))],{cwd:root,encoding:'utf8'});
  assert.equal(candidateCode,'');
  const baseline=path.join(root,'docs/testing/evidence/pm04-g1-quality-baseline-20261127');
  const builds={
    app:{base:path.join(code,'frontend_jingjingshangri_app/build/web'),manifest:'APP_BROWSER_BUILD_MANIFEST.json'},
    web:{base:path.join(code,'frontend_ops_workspace/dist'),manifest:'VUE_BUILD_MANIFEST.json'},
  };
  const database='jx_test_qa18_s3c_rights_'+randomBytes(10).toString('hex');
  const expires=new Date(Date.now()+30*60000).toISOString();
  const status={product,database,expires_at:expires,started_at:new Date().toISOString(),builds:{},synthetic_only:true,source:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()};
  const save=()=>fs.writeFile(path.join(out,'STATUS.json'),JSON.stringify(status,null,2)+'\n');
  for(const [surface,build] of Object.entries(builds)){
    const bytes=await fs.readFile(path.join(baseline,build.manifest)), manifest=JSON.parse(bytes);
    assert.equal(manifest.source,product);
    for(const file of manifest.files) assert.equal(sha(await fs.readFile(path.join(build.base,file.path))),file.sha256,file.path);
    status.builds[surface]={manifest:build.manifest,sha256:sha(bytes),files:manifest.files.length};
  }
  const mysql=load('node_modules/mysql2/promise');
  let admin, db, server, watch, timer, stopping=false;
  async function stop(){
    if(stopping)return;
    stopping=true;
    clearInterval(watch);
    clearTimeout(timer);
    if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
    await db?.close();
    await admin?.end();
    status.status='STOPPED';
    status.stopped_at=new Date().toISOString();
    await save();
  }
  process.once('SIGTERM',stop);
  process.once('SIGINT',stop);
  try{
    admin=await mysql.createConnection({host:env.MYSQL_HOST,port:+env.MYSQL_PORT,user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
    await admin.query('CREATE DATABASE '+mysql.escapeId(database)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
    db=await load('src/infrastructure/database').openDatabase({...env,MYSQL_DATABASE:database});
    await load('src/infrastructure/database/migrator').migrate(db);
    const [migrations]=await db.execute('SELECT version,name,status FROM platform_schema_migrations ORDER BY version');
    assert.equal(migrations.length,225);
    assert(migrations.every(r=>r.status==='APPLIED'));
    status.last_migration=migrations.at(-1);
    status.migrations=migrations.length;
    const S=await load('test/helpers/stock-seed.cjs').seedStock(db);
    const {buyer,seller,reviewer,outsider,buyer2}=S;
    const {maintainOperatorGrant}=load('src/modules/governance/operator-access');
    for(const entry of [{u:reviewer,action:'SUPPORT_HANDLE'},{u:outsider,action:'SUPPORT_HANDLE'},{u:outsider,action:'PRIVACY_REVIEW'},{u:reviewer,action:'PRIVACY_REVIEW'}]){
      await maintainOperatorGrant(db,{account_id:entry.u.account_id,action:entry.action,enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:s3c-rights',reason:'Isolated case and independent review'});
    }
    async function material(actor,text){
      const bytes=Buffer.from(text);
      const file=await S.supply.upload(actor.ctx,{party_id:actor.personal_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:bytes,operation_key:randomUUID()});
      return {id:file.id,sha256:sha(bytes)};
    }
    const materials={applicant:await material(buyer,'S3-C synthetic rights claimant evidence.'),respondent:await material(seller,'S3-C synthetic counter notice evidence.')};
    const listing=await S.listing();
    const disk=await require('./test-fixtures/qa18-disk-storage.cjs').openQaStorage(path.join(out,'private-storage'),{seed:S.bytes});
    const api=load('src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:disk.storageFactory});
    server=http.createServer(async(req,res)=>{
      if(Date.now()>=Date.parse(expires)){res.writeHead(410).end();return;}
      const u=new URL(req.url,'http://127.0.0.1');
      const match=u.pathname.match(/^\/__(app|web)\/(.*)$/);
      if(!match){api(req,res);return;}
      const base=builds[match[1]].base;
      let file=path.resolve(base,decodeURIComponent(match[2])||'index.html');
      if(!file.startsWith(base+path.sep)){res.writeHead(403).end();return;}
      let bytes;
      try{bytes=await fs.readFile(file);}
      catch(e){
        if(!['ENOENT','EISDIR'].includes(e.code)||path.extname(file)){res.writeHead(404).end();return;}
        file=path.join(base,'index.html');
        bytes=await fs.readFile(file);
      }
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(bytes);
    });
    await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
    const base_url='http://127.0.0.1:'+server.address().port+'/api/v1';
    const accounts=Object.fromEntries(Object.entries({buyer,seller,operator:reviewer,independent:outsider,unrelated:buyer2}).map(([role,a])=>[role,{account_id:a.account_id,party_id:a.personal_party_id,bearer_token:a.token}]));
    const accessFile=path.join(out,'access.private.json');
    await fs.writeFile(accessFile,'',{flag:'wx'});
    await require('./test-fixtures/private-state.cjs').protectPrivateState(accessFile);
    await fs.writeFile(accessFile,JSON.stringify({product,synthetic_only:true,base_url,database,expires_at:expires,accounts,listing:listing.id,materials}));
    status.status='RUNNING';
    status.base_url=base_url;
    status.listing=listing.id;
    status.materials=materials;
    status.no_payment=true;
    await save();
    watch=setInterval(()=>fs.access(path.join(out,'stop')).then(stop).catch(()=>{}),500);
    timer=setTimeout(stop,Math.max(1,Date.parse(expires)-Date.now()));
    console.log(JSON.stringify({status:'READY',base_url,expires_at:expires,database}));
  }catch(error){status.fixture_error=error.code||error.name;await stop();throw error;}
}
main().catch(error=>{console.error(error.code||error.message);process.exitCode=1;});
