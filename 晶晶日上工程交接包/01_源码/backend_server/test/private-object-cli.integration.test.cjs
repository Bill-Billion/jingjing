'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),mysql=require('mysql2/promise');
const {randomBytes}=require('node:crypto'),{spawnSync}=require('node:child_process');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
const B=require('../src/operations/backup'),F=require('../src/operations/data-format'),{digest}=require('../src/modules/governance/content');
test('private object evidence is tied to real encrypted snapshot and CLI remains offline',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_objects_'+randomBytes(6).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db;
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./helpers/stock-seed.cjs').seedStock(db),snapshot=await B.backup(db,{source_ref:'synthetic.private.objects'});
  const fixture=await fs.mkdtemp(path.resolve(__dirname,'../../../../.local/private-object-cli-')),objects=path.join(fixture,'objects');await fs.mkdir(objects);
  const backup=path.join(fixture,'snapshot.jxb'),keyFile=path.join(fixture,'key.json'),output=path.join(fixture,'private-inventory.json'),key=randomBytes(32),evidence=[];
  await fs.writeFile(keyFile,JSON.stringify({key_base64:key.toString('base64')}),{flag:'wx',mode:0o600});await B.writeEncrypted(backup,snapshot.payload,key);
  const base=['--file',backup,'--key-file',keyFile,'--sha256',snapshot.manifest.payload_sha256];
  const cli=(command,args=[],override=base)=>{
   const child=spawnSync(process.execPath,[path.resolve(__dirname,'../scripts/release-tools.cjs'),command,...override,...args],{env:{...process.env,JX_MYSQL_TEST_ENV_FILE:'',MYSQL_HOST:'unreachable.invalid'},encoding:'utf8',timeout:20000,windowsHide:true});
   assert.equal(child.error,undefined);const result=JSON.parse((child.status===0?child.stdout:child.stderr).trim());
   for(const secret of [env.MYSQL_PASSWORD,key.toString('base64'),...S.bytes.keys()])assert.ok(!(child.stdout+child.stderr).includes(secret));
   evidence.push({command,exit_code:child.status,result});return {code:child.status,result};
  };
  let inventory;
  await t.test('authenticated snapshot exports private inventory without database or provider access',async()=>{
   const x=cli('object-inventory',['--output',output]);assert.equal(x.code,0);inventory=JSON.parse(await fs.readFile(output,'utf8'));
   assert.equal(x.result.inventory_sha256,F.hash(inventory));assert.equal(inventory.backup_payload_sha256,snapshot.manifest.payload_sha256);assert.equal(inventory.entries.length,S.bytes.size);
   assert.equal(x.result.external_bytes_included,false);assert.equal(x.result.recovery_authorized,false);
  });
  await t.test('existing inventory, wrong snapshot digest and wrong decryption key are refused',async()=>{
   assert.equal(cli('object-inventory',['--output',output]).result.code,'EEXIST');
   assert.equal(cli('object-inventory',['--output',output],[...base.slice(0,-1),'0'.repeat(64)]).result.code,'BACKUP_CHECKSUM_MISMATCH');
   const wrong=path.join(fixture,'wrong-key.json');await fs.writeFile(wrong,JSON.stringify({key_base64:randomBytes(32).toString('base64')}));
   assert.equal(cli('object-inventory',['--output',output],['--file',backup,'--key-file',wrong,'--sha256',snapshot.manifest.payload_sha256]).result.code,'BACKUP_AUTHENTICATION_FAILED');
  });
  await t.test('actual bytes are compared with the same encrypted backup rather than a caller-edited inventory',async()=>{
   let x=cli('object-verify',['--object-root',objects]);assert.equal(x.result.counts.MISSING,inventory.entries.length);
   for(const e of inventory.entries)await fs.writeFile(path.join(objects,e.local_file),S.bytes.get(e.object_key));
   x=cli('object-verify',['--object-root',objects]);assert.equal(x.result.counts.MATCHED,inventory.entries.length);assert.equal(x.result.all_reference_bytes_match,true);
   for(const field of ['current_acl_checked','provider_versions_checked','provider_transport_checked','physical_objects_restored','physical_objects_deleted','recovery_authorized'])assert.equal(x.result[field],false);
   const edited=JSON.parse(await fs.readFile(output,'utf8'));edited.entries=[];await fs.writeFile(output,JSON.stringify(edited));
   assert.equal(cli('object-verify',['--object-root',objects]).result.counts.MATCHED,inventory.entries.length);
  });
  await t.test('wrong bytes, wrong size and missing originals are distinguished without changing source',async()=>{
   const entry=inventory.entries[0],file=path.join(objects,entry.local_file),body=S.bytes.get(entry.object_key);
   await fs.writeFile(file,Buffer.alloc(body.length));assert.equal(cli('object-verify',['--object-root',objects]).result.counts.DIGEST_MISMATCH,1);
   await fs.writeFile(file,Buffer.from('wrong size'));assert.equal(cli('object-verify',['--object-root',objects]).result.counts.SIZE_MISMATCH,1);
   await fs.unlink(file);assert.equal(cli('object-verify',['--object-root',objects]).result.counts.MISSING,1);await fs.writeFile(file,body);
  });
  await t.test('a newer privacy register blocks an otherwise matching object and retains absent-later suppressions',async()=>{
   const e=inventory.entries[0],data={format:'JX_PRIVACY_SUPPRESSION_V1',source_ref:'synthetic.latest',captured_at:new Date().toISOString(),files:[{asset_id:e.references[0].id,object_key:e.object_key,content_sha256:e.content_sha256},{asset_id:'synthetic-later',object_key:'private/synthetic/later-absent.bin',content_sha256:'a'.repeat(64)}],accounts:[]};
   const register=path.join(fixture,'latest-register.json');await fs.writeFile(register,JSON.stringify(data),{mode:0o600});
   const args=['--object-root',objects,'--manifest',register,'--register-sha256',digest(data)];let x=cli('object-verify',args);
   assert.equal(x.result.counts.SUPPRESSED_PRESENT,1);assert.equal(x.result.counts.SUPPRESSED_ABSENT,1);assert.equal(x.result.all_reference_bytes_match,false);assert.equal(x.result.latest_register_supplied,true);
   await fs.unlink(path.join(objects,e.local_file));x=cli('object-verify',args);assert.equal(x.result.counts.SUPPRESSED_ABSENT,2);assert.equal(x.result.recovery_authorized,false);
   assert.equal(cli('object-verify',[...args.slice(0,-1),'0'.repeat(64)]).result.code,'PRIVACY_RECOVERY_REGISTER_INVALID');
   await fs.writeFile(path.join(objects,e.local_file),S.bytes.get(e.object_key));
  });
  await t.test('directory junctions and symlinks cannot redirect the local object check',async()=>{
   const link=path.join(fixture,'object-alias');await fs.symlink(objects,link,process.platform==='win32'?'junction':'dir');
   try{assert.equal(cli('object-verify',['--object-root',link]).result.code,'PRIVATE_OBJECT_DIRECTORY_INVALID');}
   finally{await fs.unlink(link).catch(()=>fs.rmdir(link));}
   const e=inventory.entries[0],file=path.join(objects,e.local_file);await fs.unlink(file);await fs.symlink(objects,file,process.platform==='win32'?'junction':'dir');
   try{assert.equal(cli('object-verify',['--object-root',objects]).result.counts.UNSAFE_FILE,1);}
   finally{await fs.unlink(file).catch(()=>fs.rmdir(file));}
  });
  const after=await B.backup(db,{source_ref:'synthetic.private.objects.after'});assert.deepEqual(after.manifest.tables,snapshot.manifest.tables);
  await fs.writeFile(path.resolve(__dirname,'../../../../.local/private-object-cli-journey.json'),JSON.stringify({synthetic_only:true,backup_payload_sha256:snapshot.manifest.payload_sha256,objects:inventory.entries.length,database_unchanged:true,evidence,limits:['local synthetic bytes only; no live storage or provider ACL/version check','latest register input is synthetic and not independent approval','inventory covers native object_key tables, not arbitrary provider URLs or JSON references','no restoration, deletion, database write, frontend or release']},null,2));
 }finally{if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
