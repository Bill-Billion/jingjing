'use strict';
// Deliberately offline/loopback-only. Never accepts an arbitrary live database or shell restore command.
const fs=require('node:fs/promises'),crypto=require('node:crypto'),path=require('node:path');
const F=require('../src/operations/data-format'),B=require('../src/operations/backup'),L=require('../src/operations/legacy');
async function config(file){const env=JSON.parse(await fs.readFile(file,'utf8'));if(env.NODE_ENV!=='test'||env.DB_CLIENT!=='mysql'||env.MYSQL_HOST!=='127.0.0.1'||String(env.MYSQL_PORT)!=='33316'||env.MYSQL_USER!=='jx_local'||env.MYSQL_DATABASE!=='jx_dev')throw F.fail('ISOLATED_CONTROL_REQUIRED');return env;}
function target(v){if(!/^jx_test_\d+_[a-f0-9]{12}$/.test(v||''))throw F.fail('ISOLATED_TARGET_REQUIRED');return v;}
function parse(argv){const [command,...rest]=argv,out={command};const allowed=['env-file','database','file','key-file','source-ref','source-kind','sha256','manifest','reviewer-ref','latest-register-confirmed'];for(let n=0;n<rest.length;n+=2){const k=rest[n]?.replace(/^--/,'');if(!rest[n]?.startsWith('--')||!allowed.includes(k)||Object.hasOwn(out,k)||!rest[n+1]||rest[n+1].startsWith('--'))throw F.fail('INVALID_ARGUMENTS');out[k]=rest[n+1];}return out;}
async function key(file){const v=JSON.parse(await fs.readFile(file,'utf8'));const bytes=Buffer.from(v.key_base64||'','base64');if(bytes.length!==32||bytes.toString('base64')!==v.key_base64)throw F.fail('BACKUP_KEY_REQUIRED');return bytes;}
async function main(argv=process.argv.slice(2)){
 const a=parse(argv);if(a.command==='key-create'){const bytes=crypto.randomBytes(32);await fs.writeFile(a.file,JSON.stringify({key_base64:bytes.toString('base64')}),{flag:'wx',mode:0o600});return {result:'CREATED',key_printed:false};}
 if(a.command==='legacy-inspect'){const result=L.inspect(a.file,{source_ref:a['source-ref'],source_kind:a['source-kind']});return {result:'INSPECTED_ONLY',source_sha256:result.manifest.source_sha256,tables:result.manifest.tables.map(t=>({name:t.name,rows:t.row_count})),business_conversion:'NOT_PERFORMED'};}
 if(!['backup','restore','legacy-retain','release-check','privacy-register','privacy-replay'].includes(a.command))throw F.fail('UNKNOWN_OPERATION');const env=await config(a['env-file']);const db=await require('../src/infrastructure/database').openDatabase({...env,MYSQL_DATABASE:target(a.database)});
 try{
 if(a.command==='privacy-register'){const r=await require('../src/operations/privacy-recovery').capture(db,{source_ref:a['source-ref']});await fs.writeFile(a.file,JSON.stringify(r.data),{flag:'wx',mode:0o600});return {result:'REGISTER_EXPORTED',sha256:r.sha256,contains_private_references:true};}
 if(a.command==='privacy-replay')return await require('../src/operations/privacy-recovery').replay(db,JSON.parse(await fs.readFile(a.file,'utf8')),{expected_sha256:a.sha256,reviewer_ref:a['reviewer-ref'],latest_register_confirmed:a['latest-register-confirmed']==='true'});
 if(a.command==='backup'){const r=await B.backup(db,{source_ref:a['source-ref']});const encrypted=await B.writeEncrypted(a.file,r.payload,await key(a['key-file']));return {result:'BACKED_UP',payload_sha256:r.manifest.payload_sha256,file_sha256:encrypted.sha256,tables:r.manifest.tables.length,external_objects_included:false};}
 if(a.command==='restore')return await B.restore(db,await B.readEncrypted(a.file,await key(a['key-file'])),{expected_sha256:a.sha256});
 if(a.command==='legacy-retain'){const r=await L.retain(db,L.inspect(a.file,{source_ref:a['source-ref'],source_kind:a['source-kind']}).payload);return await L.reconcile(db,r.id);}
 return await require('../src/operations/release-check').inspect(db,JSON.parse(await fs.readFile(a.manifest,'utf8')),env);
 }finally{await db.close();}
}
if(require.main===module)main().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(JSON.stringify({result:'BLOCKED',code:/^[A-Z][A-Z0-9_]*$/.test(e.code||'')?e.code:'OPERATION_FAILED'}));process.exitCode=1;});
module.exports={main,parse,config,target};
