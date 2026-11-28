'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
const { protectPrivateState } = require('./private-state.cjs');

const root = path.resolve(__dirname,'../..');
const backend = path.join(root,'晶晶日上工程交接包/01_源码/backend_server');
const load = file => require(path.join(backend,file));
load('scripts/test-network-guard.cjs');

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = async file => JSON.parse(await fs.readFile(file,'utf8'));

async function cloneRecords({source, directory, out, actors, proof, resume, restoreFiles=true}){
  assert.match(source,/^jx_test_(stock_pm03_[a-f0-9]{24}|qa18_(?:privacy|champion|points)_[a-f0-9]{20})$/);
  assert(path.resolve(out).startsWith(path.join(root,'.local/qa18')+path.sep));
  assert(path.resolve(directory).startsWith(path.join(root,'.local')+path.sep));
  const original=await read(path.join(directory,'access.json'));
  assert(original.synthetic_only && Date.parse(original.expires_at)<Date.now());
  assert.equal(new URL(original.base_url).hostname,'127.0.0.1');
  assert.equal(original.database||path.basename(directory),source);
  const env=await read(process.env.JX_MYSQL_TEST_ENV_FILE);
  for(const [key,value] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[key],value);
  await fs.mkdir(out,{recursive:true});
  const cfg=path.join(out,'client.private.ini');
  await fs.writeFile(cfg,'',{flag:'wx'});
  await protectPrivateState(cfg);
  const password=env.MYSQL_PASSWORD;
  assert(!/[\r\n\0]/.test(password));
  await fs.writeFile(cfg,'[client]\nhost=127.0.0.1\nport=33316\nuser=jx_local\npassword="'+password.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"\n');
  const cliRoot=process.env.QA18_MYSQL_CLI_ROOT;
  const cliCfg=cliRoot?path.join(cliRoot,path.relative(root,cfg)):cfg;
  assert.equal(await fs.realpath(cliCfg),await fs.realpath(cfg));
  function dump(database) {
    const args=['--defaults-extra-file='+cliCfg,'--single-transaction','--skip-lock-tables','--set-gtid-purged=OFF',
      '--no-tablespaces','--hex-blob','--skip-comments','--skip-add-drop-table','--skip-extended-insert','--order-by-primary',database];
    const r=spawnSync(process.env.JX_MYSQLDUMP_EXE,args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],maxBuffer:64*1024*1024,timeout:45000});
    assert.equal(r.status,0,r.stderr?.match(/(?:Got error:|ERROR)\s*\d+/)?.[0]||r.error?.code||'MYSQL_DUMP_FAILED');
    return r.stdout;
  }
  const snapshot=dump(source);
  assert(!/^\s*(?:(?:CREATE|DROP)\s+DATABASE|USE\s+|DELIMITER\b)/im.test(snapshot));
  const mysql=load('node_modules/mysql2/promise');
  if(resume){
    assert.match(resume.clone,/^jx_test_qa18_s4delta_[a-f0-9]{20}$/);
    assert(resume.source_database===source&&resume.original_sql_unchanged);
    assert.equal(resume.initial_dump_sha256,hash(snapshot));
    assert(path.resolve(resume.directory).startsWith(path.join(root,'.local/qa18')+path.sep));
  }
  const database=resume?.clone||'jx_test_qa18_s4delta_'+randomBytes(10).toString('hex');
  const options={host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password,database:'jx_dev'};
  let admin,db;
  try {
    if(!resume){
      admin=await mysql.createConnection(options);
      await admin.query('CREATE DATABASE '+mysql.escapeId(database)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
      const importer=await mysql.createConnection({...options,database,multipleStatements:true});
      try {await importer.query(snapshot);} finally {await importer.end();}
      const canonical=require('../qa18-batch-backup.cjs').canonicalDump;
      assert.equal(canonical(dump(database)),canonical(snapshot));
      await admin.end();
      admin=null;
    }
    db=await load('src/infrastructure/database').openDatabase({...env,MYSQL_DATABASE:database});
    const [[migration]]=await db.execute("SELECT COUNT(*) count,MAX(version) latest FROM platform_schema_migrations WHERE status='APPLIED'");
    assert.equal(Number(migration.count),225);
    assert.equal(Number(migration.latest),225);
    const [[inventory]]=await db.execute('SELECT COUNT(*) count FROM information_schema.tables WHERE table_schema=?',[database]);
    const files=restoreFiles?await require('../qa18-environment-assets.cjs').references(db):[];
    const preserved=new Map();
    for(const asset of files) {
      const filename=hash(asset.object_key);
      const bytes=resume?await fs.readFile(path.join(resume.directory,'private-storage',filename)):
        await fs.readFile(path.join(directory,'files',filename))
        .catch(error=>{if(error.code!=='ENOENT')throw error;return fs.readFile(path.join(directory,'preserved-files',filename));})
        .catch(error=>{if(error.code!=='ENOENT')throw error;return fs.readFile(path.join(directory,'private-storage',filename));});
      assert.equal(bytes.length,Number(asset.byte_size),asset.table+':'+asset.id);
      assert.equal(hash(bytes),asset.content_sha256,asset.table+':'+asset.id);
      preserved.set(asset.object_key,bytes);
    }
    const disk=await require('./qa18-disk-storage.cjs').openQaStorage(path.join(out,'private-storage'),{seed:preserved});
    const secret=randomBytes(32).toString('base64');
    const security=load('src/modules/auth/security').createSecurity(secret);
    const now=Date.now(),expires=now+45*60000,roles={};
    for(const name of actors){
      const account=original.accounts[name];
      const [[status]]=await db.execute('SELECT current_status FROM identity_accounts WHERE id=?',[account.account_id]);
      assert.equal(status.current_status,'ACTIVE');
      const token=randomBytes(32).toString('base64url');
      await db.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms,authenticated_ms) VALUES(?,?,?,?)',
        [security.digest('token',token),account.account_id,expires,now]);
      roles[name]={account_id:account.account_id,party_id:account.party_id,bearer_token:token};
    }
    Object.assign(proof,{source_database:source,clone:database,initial_dump_sha256:hash(snapshot),schema_tables:Number(inventory.count),
      migration_count:Number(migration.count),exact_restored_file_count:files.length,new_synthetic_sessions:actors.length});
    async function close() {
      try {
        assert.equal(hash(dump(source)),proof.initial_dump_sha256,'ORIGINAL_SQL_CHANGED');
        proof.original_sql_unchanged=true;
      }finally{
        await db.close();
        await fs.unlink(cfg);
      }
    }
    return {db,roles,secret,disk,expires,close};
  }catch(error){
    await admin?.end();
    await db?.close();
    await fs.unlink(cfg);
    throw error;
  }
}
module.exports={load,root,read,hash,cloneRecords};
