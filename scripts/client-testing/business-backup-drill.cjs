// Explicitly selected synthetic fixture only. Restore to a NEW database, verify, stop, retain evidence.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),backend=path.join(root,'晶晶日上工程交接包/01_源码/backend_server');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function run(name,output){
 assert(/^jx_test_explore_[0-9]+_[a-f0-9]{12}$/.test(name));
 const out=path.resolve(root,output);assert(out.startsWith(path.join(root,'.local')+path.sep)||out.startsWith(path.join(root,'docs/testing/evidence')+path.sep));assert(!fs.existsSync(out),'Use a fresh evidence file');fs.mkdirSync(path.dirname(out),{recursive:true});
 const env=JSON.parse(fs.readFileSync(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8')),mysql=require(path.join(backend,'node_modules/mysql2/promise'));
 require('./persistent-story.cjs').assertEnv({...env,MYSQL_DATABASE:name},name);
 const base=path.join(root,'.local/client-persistent'),original=path.join(base,name);
 const checks=[],report={synthetic_only:true,started_at:new Date().toISOString(),source_database:name,checks};let runtime;
 const check=(id,details)=>checks.push({id,result:'PASS',...details});
 async function snapshot(database){
  const db=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database});
  try{const [tables]=await db.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME',[database]);const result=[];for(const t of tables){const [rows]=await db.query('SELECT * FROM '+mysql.escapeId(t.TABLE_NAME));const texts=rows.map(r=>JSON.stringify(r)).sort();result.push({table:t.TABLE_NAME,rows:rows.length,sha256:hash(texts.join('\n'))});}return result;}finally{await db.end();}
 }
 try{
  const manager=await require('./business-backup.cjs').createManager();
  const before=await snapshot(name),lock=path.join(original,'runtime.lock');fs.writeFileSync(lock,'drill-owned-lock',{flag:'wx'});
  try{await assert.rejects(manager.backup(name));}finally{fs.unlinkSync(lock);}check('running_fixture_rejected',{});
  const backup=await manager.backup(name);report.backup=backup;assert(manager.verify(backup.file).valid);check('encrypted_database_and_assets',{tables:backup.tables,asset_files:backup.asset_files});
  const restored=await manager.restore(backup.file);report.restored=restored;assert.notEqual(restored.database,name);
  const after=await snapshot(restored.database);assert.deepEqual(after,before);check('every_business_table_restored',{tables:after});
  assert.deepEqual(await snapshot(name),before);check('original_database_unchanged',{});
  const files=fs.readdirSync(path.join(original,'assets')).sort();for(const f of files)assert.equal(hash(fs.readFileSync(path.join(original,'assets',f))),hash(fs.readFileSync(path.join(base,restored.database,'assets',f))));check('every_private_asset_restored',{files:files.length});
  // Interrupted restore must never be usable, even with a valid manifest and database.
  const marker=path.join(base,restored.database,'RESTORE_INCOMPLETE');fs.writeFileSync(marker,'drill');
  try{await assert.rejects(require('./persistent-story.cjs').start(restored.database,{hours:1}));}finally{fs.unlinkSync(marker);}check('incomplete_restore_cannot_start',{});
  runtime=await require('./persistent-story.cjs').start(restored.database,{hours:1});
  await assert.rejects(manager.backup(restored.database));check('actual_running_restored_fixture_rejected',{});
  const c=runtime.access.scenarios.complete,a=runtime.access.accounts[c.roles.applicant];
  const res=await fetch(runtime.access.base_url+'/stock/purchases/'+c.order_id+'/content',{headers:{Authorization:'Bearer '+a.bearer_token,'X-Acting-Party':a.party_id}});assert.equal(res.status,200);const bytes=Buffer.from(await res.arrayBuffer());assert.equal(bytes.toString('ascii',4,8),'ftyp');check('restored_paid_order_download',{order_id:c.order_id,bytes:bytes.length,sha256:hash(bytes)});
  // Feedback is a separate encrypted archive; exercise it with the SAME restored order ID.
  const campaign='demo-drill-'+Date.now(),dir=path.join(root,'.local/client-feedback',campaign);fs.mkdirSync(path.join(dir,'records'),{recursive:true});
  fs.writeFileSync(path.join(dir,'people.json'),JSON.stringify({buyer:{id:'buyer',name:'模拟买家',code:crypto.randomBytes(24).toString('hex')},'feedback-reviewer':{id:'reviewer',name:'测试负责人',code:crypto.randomBytes(24).toString('hex')}}));
  const store=require('./store.cjs').openStore(path.join(dir,'records'));const issue=store.create({id:'buyer',name:'模拟买家'},crypto.randomUUID(),{description:'模拟订单恢复检查 '+c.order_id});store.close();
  const fm=require('./backup.cjs').createManager(path.join(root,'.local')),fb=fm.backup(campaign),target=campaign+'-restored';fm.restore(fb.file,target);
  const restoredStore=require('./store.cjs').openStore(path.join(root,'.local/client-feedback',target,'records'));
  try{assert.equal(restoredStore.list({id:'buyer'}).issues[0].id,issue.id);}finally{restoredStore.close();}
  assert.deepEqual(fs.readFileSync(path.join(dir,'records/records.json')),fs.readFileSync(path.join(root,'.local/client-feedback',target,'records/records.json')));check('feedback_restored_with_same_order_reference',{campaign,restored_campaign:target,issue_id:issue.id,order_id:c.order_id});
  report.result='PASS';
 }catch(e){report.result='FAIL';report.failure={name:e.name,code:e.code||null,message:e.message};throw e;}
 finally{if(runtime){await runtime.stop();report.restored_runtime_stopped=true;report.credentials_removed=!fs.existsSync(path.join(runtime.dir,'access.json'));}report.finished_at=new Date().toISOString();fs.writeFileSync(out,JSON.stringify(report,null,2));}
 console.log(JSON.stringify({result:report.result,checks:checks.length,output:path.relative(root,out),source_retained:true,restored_retained:true}));
}
if(require.main===module)run(...process.argv.slice(2)).catch(()=>{console.error('恢复演练未通过，查看本地证据；不输出私有配置。');process.exitCode=1;});
module.exports={run};
