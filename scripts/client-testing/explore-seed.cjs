// One retained test database for all product areas. Never reads application .env.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),http=require('node:http');
const root=path.resolve(__dirname,'../..'),backend=path.join(root,'晶晶日上工程交接包/01_源码/backend_server');
require(path.join(backend,'scripts/test-network-guard.cjs'));
const load=p=>require(path.join(backend,p));
async function main(){
 const env=JSON.parse(fs.readFileSync(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 assert(env.NODE_ENV==='test'&&env.DB_CLIENT==='mysql'&&env.MYSQL_HOST==='127.0.0.1'&&env.MYSQL_PORT==='33316'&&env.MYSQL_USER==='jx_local'&&env.MYSQL_DATABASE==='jx_dev');
 const mysql=load('node_modules/mysql2/promise'),name='jx_test_explore_'+process.pid+'_'+crypto.randomBytes(6).toString('hex');
 const control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
 let db,server;try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
  db=await load('src/infrastructure/database').openDatabase({...env,MYSQL_DATABASE:name});await load('src/infrastructure/database/migrator').migrate(db);
  const samples=path.join(root,'.local/client-samples'),f=await require('../v5-r05-r12-seed.cjs').prepare(db,()=>{},{samples});
  const app=load('src/http/account-api').createAccountApi({db,secret:f.secret,supplyStorageFactory:f.storageFactory,tradeEnv:{CUSTOMIZATION_MERCHANT_PARTY_ID:f.merchantId}});
  server=http.createServer(app);server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  await f.setup('http://127.0.0.1:'+server.address().port+'/api/v1');
  f.scenarios.production=await require('./explore-production.cjs').seed(db,f.common,{full:fs.readFileSync(path.join(samples,'sample-2-full.mp4')),preview:fs.readFileSync(path.join(samples,'sample-2-preview.mp4'))});
  for(const n of [2,3]){
   const input={...f.stock.listingInput,description:'甲方样片 '+n+' · 仅测试展示'};
   for(const [field,kind] of [['file_id','full'],['preview_file_id','preview']])input[field]=(await f.stock.supply.upload(f.stock.seller.ctx,{party_id:f.stock.seller.personal_party_id,purpose:'WORK_CONTENT',media_type:'video/mp4',body:fs.readFileSync(path.join(samples,`sample-${n}-${kind}.mp4`)),operation_key:crypto.randomUUID()})).id;
   const listing=await f.stock.stock.create(f.stock.seller.ctx,{...input,operation_key:crypto.randomUUID()});
   const reviewed=await f.stock.reviewListing(await f.stock.reviewListing(listing,'RIGHTS'),'CONTENT');
   f.scenarios['sample_'+n]={listing_id:reviewed.id};
  }
  // Human readable synthetic names; identifiers and privileges do not change.
  const labels={buyer:'体验客户小晶',producer:'体验制作平台',reviewer:'体验独立审核员',artist:'体验艺人小夏',participant:'体验共创参与者',stock_buyer:'体验客户小林',stock_seller:'体验视频作者',stock_reviewer:'体验视频审核员',notices_buyer:'体验通告发布人',notices_seller:'体验报名艺人',notices_reviewer:'体验通告审核员',auditions_buyer:'体验试镜客户',auditions_seller:'体验试镜艺人',auditions_reviewer:'体验试镜审核员'};
  for(const [role,label] of Object.entries(labels))if(f.people[role])await db.execute('UPDATE identity_accounts SET display_name=? WHERE id=?',[label,f.people[role].account_id]);
  await db.execute('UPDATE parties SET display_name=? WHERE id=?',['体验制作平台（模拟机构）',f.merchantId]);
  const [syntheticPeople]=await db.execute('SELECT id FROM artist_people WHERE identity_key IS NOT NULL');for(const p of syntheticPeople)await db.execute('UPDATE artist_people SET identity_key=? WHERE id=?',[load('src/modules/governance/content').digest(['SIMULATED_ONLY',crypto.createHash('sha256').update('synthetic:'+p.id).digest('hex')]),p.id]);
  const accounts=Object.fromEntries(Object.entries(f.people).map(([role,u])=>[role,{account_id:u.account_id,party_id:u.acting_party_id,bearer_token:u.token}]));
  const access={synthetic_only:true,payment_simulation:true,accounts,scenarios:f.scenarios};
  // Production credentials and callbacks are never routed. Existing business ACLs still apply.
  const rules=['GET','POST','PATCH'].map(m=>[m,/^\/api\/v1\/(?:me|parties|organizations|customization-categories|contract-snapshots|rule-versions|finance|categories|governance|supply|artists|licensing|trade|customization-requests|operations|production|projects|gigs|notices|auditions|stock|wallet|engagement|cocreation|redemption|privacy|media|directory|discovery|support|invoices)(?:\/.*)?$/]);
  rules.push(['DELETE',/^\/api\/v1\/me\/collections\/history(?:\/[^/]+\/[^/]+)?$/]);
  const dir=await require('./persistent-story.cjs').retain({env,database:name,secret:f.secret,access,tradeEnv:{CUSTOMIZATION_MERCHANT_PARTY_ID:f.merchantId},supplyEnv:{ARTIST_PLATFORM_MERCHANT_PARTY_ID:f.merchantId},rules,db,files:f.allFiles()});
  const enrichment=await require('./explore-enrich.cjs').enrich(db,JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'))),dir);fs.writeFileSync(path.join(dir,'enrichment.json'),JSON.stringify(enrichment,null,2));
  const plaza=await require('./plaza-enrich.cjs').enrich(db,JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'))),dir);fs.writeFileSync(path.join(dir,'plaza-enrichment.json'),JSON.stringify(plaza,null,2));
  const manifestFile=path.join(dir,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestFile));
  const complete=await require('./complete-enrich.cjs').enrich(db,manifest,dir);
  manifest.access.scenarios.complete=complete;
  manifest.supplyEnv={...manifest.supplyEnv,NODE_ENV:'test',INVOICE_SANDBOX_ENABLED:'true'};
  fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2),{mode:0o600});
  fs.writeFileSync(path.join(dir,'complete-enrichment.json'),JSON.stringify(complete,null,2));
  console.log(JSON.stringify({database:name,retained:true,manifest:path.relative(root,path.join(dir,'manifest.json')),scenarios:Object.keys(f.scenarios)}));
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();await control.end();}
}
main().catch(e=>{console.error(JSON.stringify({error:e.code||e.message,at:e.stack?.split('\n').slice(1,3)}));process.exitCode=1;});
