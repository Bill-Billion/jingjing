'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..'),backend=path.join(root,'晶晶日上工程交接包/01_源码/backend_server'),load=p=>require(path.join(backend,p));load('scripts/test-network-guard.cjs');
async function main(){
 const dir=path.resolve(process.argv[2]||''),out=path.resolve(process.argv[3]||'');assert.equal(process.argv.length,4);assert.equal(path.dirname(dir),path.join(root,'.local/stock-sandbox'));assert.match(path.basename(dir),/^jx_test_stock_pm03_[a-f0-9]{24}$/);assert(out.startsWith(path.join(root,'.local/qa18')+path.sep));await fs.mkdir(out,{recursive:true});
 const state=JSON.parse(await fs.readFile(path.join(dir,'state.json'),'utf8')),f=JSON.parse(await fs.readFile(path.join(dir,'ui-access.json'),'utf8'));assert(state.synthetic_only&&state.mode==='BATCH'&&state.database===path.basename(dir)&&Date.parse(state.expires_at)>Date.now());
 const file=path.join(out,'prepared.json');let s;try{s=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;s={environment:state.database,operation_key:randomUUID()};await fs.writeFile(file,JSON.stringify(s));}assert.equal(s.environment,state.database);assert(!s.complete,'Do not recreate completed preparation');
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));assert.equal(env.MYSQL_HOST,'127.0.0.1');assert.equal(String(env.MYSQL_PORT),'33316');assert.equal(env.MYSQL_DATABASE,'jx_dev');
 const db=await load('src/infrastructure/database').openDatabase({...env,MYSQL_DATABASE:state.database});try{
 const auth=load('src/modules/auth/repository').createAuthRepository(db,{secret:state.secret}),repo=load('src/modules/customization/repository').createCustomizationRepository(db,{resolvePrincipal:async()=>({subject_ref:(await auth.resolve(f.accounts.producer.bearer_token)).subject_ref})});
 s.template=await repo.publishTemplate({},{category_code:'qa18_story_11',template_version:1,template_snapshot:{title:'第11轮合成私有故事',description:'隔离机测专用，不是真人故事或正式生产模板',fields:[{key:'story',label:'合成故事内容',type:'TEXT',required:true,max_length:1000},{key:'material',label:'私有参考附件',type:'PRIVATE_ATTACHMENT',required:true}]},source_ref:'synthetic:qa18:g15',operation_key:s.operation_key});s.complete=true;await fs.writeFile(file,JSON.stringify(s,null,2));
 }finally{await db.close();}
 console.log(JSON.stringify({environment:s.environment,template_version_id:s.template.template_version_id,synthetic_only:true,complete:true}));
}main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
