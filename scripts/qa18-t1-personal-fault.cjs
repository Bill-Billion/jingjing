'use strict';
// Controlled corruption/restoration of this new synthetic finance record only.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const root=path.resolve(__dirname,'..'),load=p=>require(path.join(root,'晶晶日上工程交接包/01_源码/backend_server',p));load('scripts/test-network-guard.cjs');
async function main(){
 const [operation,directory]=process.argv.slice(2);assert.equal(process.argv.length,4);assert(['damage','restore'].includes(operation));
 const dir=path.resolve(directory);assert(dir.startsWith(path.join(root,'.local/qa18')+path.sep));
 const p=JSON.parse(await fs.readFile(path.join(dir,'prepared.json'),'utf8'));assert(p.complete&&/^jx_test_stock_pm03_[a-f0-9]{24}$/.test(p.environment));
 const state=JSON.parse(await fs.readFile(path.join(root,'.local/stock-sandbox',p.environment,'state.json'),'utf8'));assert(state.synthetic_only&&state.mode==='BATCH'&&state.database===p.environment&&Date.parse(state.expires_at)>Date.now());
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const[k,v]of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const db=await load('src/infrastructure/database').openDatabase({...env,MYSQL_DATABASE:p.environment}),file=path.join(dir,'finance-fault.private.json');
 const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex'),parse=x=>typeof x==='string'?JSON.parse(x):x;
 try{
  const [[row]]=await db.execute('SELECT id,kind,data_json FROM finance_records WHERE id=?',[p.agreement.id]);assert(row&&row.kind==='AGREEMENT');const current=parse(row.data_json);
  if(operation==='damage'){
   await assert.rejects(fs.access(file),e=>e.code==='ENOENT');
   const modified={...current,synthetic_fault:'QA18_T1_SOURCE_FAILURE_ONLY'};
   await fs.writeFile(file,'',{flag:'wx',mode:0o600});await require('./test-fixtures/private-state.cjs').protectPrivateState(file);
   await fs.writeFile(file,JSON.stringify({environment:p.environment,id:row.id,original:current,original_sha256:hash(current),modified_sha256:hash(modified)}));
   await db.execute('UPDATE finance_records SET data_json=? WHERE id=?',[JSON.stringify(modified),row.id]);
   console.log(JSON.stringify({operation,environment:p.environment,id:row.id,original_sha256:hash(current),modified_sha256:hash(modified)}));
  }else{
   let saved;try{saved=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT'){console.log(JSON.stringify({operation,status:'NO_ACTIVE_FAULT'}));return;}throw e;}
   assert.equal(saved.environment,p.environment);assert.equal(saved.id,row.id);assert.equal(hash(saved.original),saved.original_sha256);
   // MySQL JSON storage normalizes object-key order. Compare the exact saved
   // structure plus our one marker; any additional change still blocks restore.
   assert(isDeepStrictEqual(current,{...saved.original,synthetic_fault:'QA18_T1_SOURCE_FAILURE_ONLY'}),'Do not overwrite any other concurrent change');
   await db.execute('UPDATE finance_records SET data_json=? WHERE id=?',[JSON.stringify(saved.original),row.id]);
   const [[restored]]=await db.execute('SELECT data_json FROM finance_records WHERE id=?',[row.id]);assert.equal(hash(parse(restored.data_json)),saved.original_sha256);
   await fs.rename(file,path.join(dir,'finance-fault-restored-'+Date.now()+'.private.json'));
   console.log(JSON.stringify({operation,environment:p.environment,id:row.id,restored_sha256:saved.original_sha256}));
  }
 }finally{await db.close();}
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
