// Offline backup/restore for marked synthetic MySQL fixtures only. Never overwrites a database.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {validateManifest,assertEnv}=require('./persistent-story.cjs');
const root=path.resolve(__dirname,'../..'),backend=path.join(root,'晶晶日上工程交接包/01_源码/backend_server');
const LIMIT=256*1024*1024,MAGIC=Buffer.from('JXDBK001'),pattern=/^jx_test_(?:story|artists|explore)_[0-9]+_[a-f0-9]{12}$/;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function safeFile(file,max=LIMIT){const s=fs.lstatSync(file);assert(s.isFile()&&!s.isSymbolicLink()&&s.size<=max,'Invalid file');return fs.readFileSync(file);}
function safeDir(base,child,create=false){const parent=fs.realpathSync(base),target=path.join(parent,child);assert(path.dirname(target)===parent);if(create&&!fs.existsSync(target))fs.mkdirSync(target,{mode:0o700});assert(fs.realpathSync(target)===target&&!fs.lstatSync(target).isSymbolicLink());return target;}
function validatePayload(p){
 assert(p?.format===1&&pattern.test(p.database)&&p.synthetic_only===true);
 validateManifest(p.manifest,p.database);
 assert(typeof p.sql==='string'&&p.sql.length>0&&p.sql.length<LIMIT&&hash(Buffer.from(p.sql))===p.sql_sha256);
 assert(Array.isArray(p.assets)&&p.assets.length<=10000);
 const names=new Set();let size=Buffer.byteLength(p.sql);
 for(const f of p.assets){assert(/^[a-f0-9]{64}\.bin$/.test(f.name)&&!names.has(f.name));names.add(f.name);assert(typeof f.data==='string');const b=Buffer.from(f.data,'base64');assert(b.toString('base64')===f.data&&b.length<=16*1024*1024&&hash(b)===f.sha256);size+=b.length;}
 assert(size<LIMIT);return p;
}
function seal(p,key){validatePayload(p);const raw=Buffer.from(JSON.stringify(p));assert(raw.length<=LIMIT);const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);c.setAAD(MAGIC);const body=Buffer.concat([c.update(zlib.gzipSync(raw)),c.final()]);return Buffer.concat([MAGIC,iv,c.getAuthTag(),body]);}
function unseal(b,key){assert(b.length>36&&b.length<=LIMIT&&b.subarray(0,8).equals(MAGIC));const c=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(8,20));c.setAAD(MAGIC);c.setAuthTag(b.subarray(20,36));const raw=Buffer.concat([c.update(b.subarray(36)),c.final()]);return validatePayload(JSON.parse(zlib.gunzipSync(raw,{maxOutputLength:LIMIT}).toString('utf8')));}
function option(v){assert(typeof v==='string'&&!/[\r\n\0]/.test(v));return '"'+v.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';}
async function createManager({localRoot=path.join(root,'.local'),envFile=process.env.JX_MYSQL_TEST_ENV_FILE,mysql=process.env.JX_MYSQL_EXE,dump=process.env.JX_MYSQLDUMP_EXE}={}){
 const local=fs.realpathSync(localRoot),fixtures=safeDir(local,'client-persistent',true),backups=safeDir(local,'client-business-backups',true);
 const keyFile=path.join(local,'client-business-backup-key.bin');
 function key(create=false){if(create&&!fs.existsSync(keyFile))fs.writeFileSync(keyFile,crypto.randomBytes(32),{flag:'wx',mode:0o600});const b=safeFile(keyFile,32);assert(b.length===32);return b;}
 const env=JSON.parse(safeFile(envFile,65536).toString('utf8'));assert(env.MYSQL_DATABASE==='jx_dev');
 assertEnv({...env,MYSQL_DATABASE:'jx_test_story_1_aabbccddeeff'},'jx_test_story_1_aabbccddeeff');
 const driver=require(path.join(backend,'node_modules/mysql2/promise'));
 async function connect(database){return driver.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database});}
 async function cli(exe,args,input){
  assert(exe&&fs.statSync(exe).isFile(),'Explicit local MySQL executable required');
  const config=path.join(backups,'client-'+crypto.randomUUID()+'.cnf');
  fs.writeFileSync(config,'[client]\nhost=127.0.0.1\nport=33316\nuser=jx_local\npassword='+option(env.MYSQL_PASSWORD)+'\n',{flag:'wx',mode:0o600});
  // mysql.exe on Windows can close Node's named-pipe stdin early. Use a private regular file.
  const inputFile=input===undefined?null:config+'.sql';let inputFd;
  if(inputFile){fs.writeFileSync(inputFile,input,{flag:'wx',mode:0o600});inputFd=fs.openSync(inputFile,'r');}
  try{return await new Promise((resolve,reject)=>{
   const child=spawn(exe,['--defaults-extra-file='+path.basename(config),...args],{cwd:backups,windowsHide:true,stdio:[inputFd===undefined?'ignore':inputFd,'pipe','pipe']});
   const chunks=[];let bytes=0,stderr='',inputError;
   const timer=setTimeout(()=>{child.kill();reject(Object.assign(new Error('Timeout'),{code:'TIMEOUT'}));},120000);
   child.stdout.on('data',b=>{bytes+=b.length;if(bytes>LIMIT){child.kill();inputError='OUTPUT_LIMIT';}else chunks.push(b);});
   child.stderr.on('data',b=>{if(stderr.length<65536)stderr+=b.toString('utf8');});
   child.on('error',e=>{clearTimeout(timer);reject(e);});
   child.on('close',code=>{clearTimeout(timer);if(code!==0||inputError)reject(Object.assign(new Error('Command failed'),{code:inputError||code,stderr}));else resolve(Buffer.concat(chunks).toString('utf8'));});
  });}
  catch(e){const code=/ERROR (\d{4})/.exec(String(e.stderr||''))?.[1]||String(e.code||e.status||'UNKNOWN');throw Object.assign(new Error('Local database command failed; code='+code+'; private output suppressed'),{code});}
  finally{if(inputFd!==undefined)fs.closeSync(inputFd);if(inputFile)fs.rmSync(inputFile,{force:true});fs.unlinkSync(config);}
 }
 function load(file){assert(/^[a-zA-Z0-9-]+\.jxdb$/.test(file));return unseal(safeFile(path.join(backups,file)),key());}
 async function marker(db,id){const [rows]=await db.query('SELECT id,synthetic_only FROM client_test_environment');assert(rows.length===1&&rows[0].id===id&&rows[0].synthetic_only===1,'Not the marked synthetic database');}
 return {
  async backup(name){
   assert(pattern.test(name));const dir=safeDir(fixtures,name),manifest=JSON.parse(safeFile(path.join(dir,'manifest.json')).toString('utf8'));validateManifest(manifest,name);
   assert(!fs.existsSync(path.join(dir,'RESTORE_INCOMPLETE')),'Incomplete fixture');
   // Same exclusive lock as runtime.start: refuse active or stale locks; never stop a user's session.
   const lock=path.join(dir,'runtime.lock'),fd=fs.openSync(lock,'wx',0o600);fs.writeFileSync(fd,String(process.pid));let db;
   try{
    db=await connect(name);await marker(db,manifest.environment_id);
    const [tables]=await db.query('SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=?',[name]);assert(tables.length>0&&tables.every(t=>t.ENGINE==='InnoDB'),'Only transactional test tables supported');
    const sql=await cli(dump,['--single-transaction','--skip-lock-tables','--set-gtid-purged=OFF','--no-tablespaces','--hex-blob','--skip-comments','--skip-add-drop-table',name]);
    const assets=[];
    if(manifest.file_store){const dirAssets=safeDir(dir,'assets');for(const n of fs.readdirSync(dirAssets).sort()){assert(/^[a-f0-9]{64}\.bin$/.test(n),'Unexpected private asset file');const b=safeFile(path.join(dirAssets,n),16*1024*1024);assets.push({name:n,data:b.toString('base64'),sha256:hash(b)});}}
    const payload={format:1,synthetic_only:true,database:name,created_at:new Date().toISOString(),manifest,sql,sql_sha256:hash(Buffer.from(sql)),assets};
    const bytes=seal(payload,key(true)),file='business-'+Date.now()+'-'+crypto.randomBytes(4).toString('hex')+'.jxdb';
    fs.writeFileSync(path.join(backups,file),bytes,{flag:'wx',mode:0o600});return {file,encrypted:true,tables:tables.length,asset_files:assets.length,sha256:hash(bytes),source_unchanged:true};
   }finally{if(db)await db.end();fs.closeSync(fd);fs.unlinkSync(lock);}
  },
  verify(file){const p=load(file);return {valid:true,synthetic_only:true,asset_files:p.assets.length,sql_sha256:p.sql_sha256};},
  async restore(file){
   const p=load(file),name=p.database.replace(/_[0-9]+_[a-f0-9]{12}$/,`_${process.pid}_${crypto.randomBytes(6).toString('hex')}`);assert(name!==p.database&&pattern.test(name));
   // New directory + CREATE DATABASE without IF NOT EXISTS. Never import over an existing database.
   const dir=path.join(fixtures,name);fs.mkdirSync(dir,{mode:0o700});const pending=path.join(dir,'RESTORE_INCOMPLETE');fs.writeFileSync(pending,'Restore not verified. Do not start.',{flag:'wx',mode:0o600});
   let admin,db,created=false,stage='create';
   try{
    admin=await connect('jx_dev');await admin.query('CREATE DATABASE '+driver.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');created=true;
    stage='import';await cli(mysql,['--binary-mode','--default-character-set=utf8mb4',name],p.sql);
    stage='marker';
    db=await connect(name);await marker(db,p.manifest.environment_id);
    stage='manifest';const manifest={...p.manifest,database:name,database_env:{...p.manifest.database_env,...env,MYSQL_DATABASE:name}};
    // Retain business IDs and private bytes; sessions are rotated by normal fixture startup.
    delete manifest.access.base_url;manifest.restored_from={database:p.database,backup:file,at:new Date().toISOString()};validateManifest(manifest,name);
    if(manifest.file_store){fs.mkdirSync(path.join(dir,'assets'),{mode:0o700});for(const a of p.assets)fs.writeFileSync(path.join(dir,'assets',a.name),Buffer.from(a.data,'base64'),{flag:'wx',mode:0o600});}
    fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});
    fs.unlinkSync(pending);return {database:name,source_database:p.database,asset_files:p.assets.length,synthetic_only:true,source_unchanged:true,started:false,feedback_restored:false};
   }catch(e){throw new Error('Restore failed; incomplete target retained for inspection, never start it. Source untouched. Target='+name+' created='+created+' stage='+stage+' code='+(e.code||e.name));}
   finally{if(db)await db.end();if(admin)await admin.end();}
  }
 };
}
module.exports={createManager,validatePayload,seal,unseal,option};
if(require.main===module)(async()=>{const [action,input]=process.argv.slice(2);assert(['backup','verify','restore'].includes(action));const m=await createManager();console.log(JSON.stringify(await m[action](input)));})().catch(()=>{console.error('业务备份操作失败：请检查本机隔离配置、标记、文件和运行锁；不会覆盖原库，不输出凭据。恢复未完成的目录不得启动。');process.exitCode=1;});
