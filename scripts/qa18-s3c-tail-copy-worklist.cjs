'use strict';
// Build a platform-internal worklist on a read-only copy of the retained COPY/ALL case.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {spawnSync,execFileSync}=require('node:child_process');
const {createHash,randomBytes}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const backend=path.join(root,'晶晶日上工程交接包/01_源码/backend_server');
const load=p=>require(path.join(backend,p));
load('scripts/test-network-guard.cjs');
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const source='jx_test_qa18_privacy_170df71eb1fc4e2a6be5';
const id='124e64c9-6829-4f71-b2ef-4265a223cdb0';
const product='053168fb6e06b80680101702a733357309368809';
const categories=['PROFILE','ARTIST_MATERIALS','PRIVATE_STORY','TRANSACTIONS','CONTENT','CONTRACTS','DIGITAL_MODELS'];

async function main(){
  const out=path.resolve(process.argv[2]||'');
  assert(out.startsWith(path.join(root,'.local/qa18')+path.sep));
  await fs.mkdir(out,{recursive:true});
  const original=path.join(root,'.local/qa18/s1-core-20261127/11-privacy');
  const fixture=await read(path.join(original,'access.json'));
  const status=await read(path.join(original,'STATUS.json'));
  assert(fixture.synthetic_only&&fixture.database===source&&status.status==='STOPPED');
  assert(Date.parse(fixture.session_expires_at)<Date.now());
  const env=await read(process.env.JX_MYSQL_TEST_ENV_FILE);
  for(const [k,v] of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
  const priorDir=process.argv[3]&&path.resolve(process.argv[3]);
  if(priorDir)assert(priorDir.startsWith(path.join(root,'.local/qa18')+path.sep));
  const prior=priorDir&&await read(path.join(priorDir,'RESULT.json'));
  if(prior){
    assert.equal(prior.product,product);
    assert.equal(prior.source,source);
    assert.equal(prior.id,id);
    assert.equal(prior.responses.length,19);
    assert.equal(prior.checks.length,7);
    assert.match(prior.clone,/^jx_test_qa18_tail_privacy_[a-f0-9]{20}$/);
  }
  const clone=prior?.clone||'jx_test_qa18_tail_privacy_'+randomBytes(10).toString('hex');
  const evidence={product,source,clone,id,mode:'LOOPBACK_GET_ONLY',started_at:new Date().toISOString(),checks:[],responses:[]};
  evidence.checkout=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const cfg=path.join(out,'mysql.private.cnf');
  assert(!/[\r\n\0]/.test(env.MYSQL_PASSWORD));
  await fs.writeFile(cfg,'',{flag:'wx'});
  await require('./test-fixtures/private-state.cjs').protectPrivateState(cfg);
  await fs.writeFile(cfg,'[client]\nhost=127.0.0.1\nport=33316\nuser=jx_local\npassword="'+env.MYSQL_PASSWORD.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"\n');
  function dump(database){
    const args=['--defaults-extra-file='+cfg,'--single-transaction','--skip-lock-tables','--set-gtid-purged=OFF','--no-tablespaces','--hex-blob','--skip-comments','--skip-add-drop-table','--skip-extended-insert','--order-by-primary',database];
    const r=spawnSync(process.env.JX_MYSQLDUMP_EXE,args,{stdio:['ignore','pipe','pipe'],encoding:'utf8',windowsHide:true,maxBuffer:64*1024*1024,timeout:30000});
    assert.equal(r.status,0,r.stderr?.match(/ERROR \d+/)?.[0]||r.error?.code||'MYSQL_DUMP_FAILED');
    return r.stdout;
  }
  const mysql=load('node_modules/mysql2/promise');
  const conn=database=>({host:env.MYSQL_HOST,port:+env.MYSQL_PORT,user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database});
  async function audit(expected){
    const check=await mysql.createConnection(conn(clone));
    try{
      const [tables]=await check.execute('SHOW TABLES');
      for(const t of tables){
        const table=Object.values(t)[0];
        assert.match(table,/^[a-z0-9_]+$/);
        const [copy]=await check.query('SELECT * FROM '+mysql.escapeId(clone)+'.'+mysql.escapeId(table));
        const [original]=await check.query('SELECT * FROM '+mysql.escapeId(source)+'.'+mysql.escapeId(table));
        const src=new Set(original.map(r=>JSON.stringify(r)));
        const copied=new Set(copy.map(r=>JSON.stringify(r)));
        assert([...src].every(r=>copied.has(r)),table+' original row changed');
        const extra=copy.filter(r=>!src.has(JSON.stringify(r)));
        if(table==='auth_sessions')assert.equal(extra.length,3);
        else if(table==='privacy_events'){
          assert.equal(extra.length,expected);
          assert(extra.every(r=>r.request_id===id&&r.event_code==='COPY_DATA_ACCESSED'&&r.actor_account_id===fixture.accounts.producer.account_id));
        }else assert.equal(extra.length,0,table);
      }
      return {tables_checked:tables.length,new_synthetic_sessions:3,new_expected_copy_audits:expected,business_rows_unchanged:true};
    }finally{await check.end();}
  }
  let db,server;
  try {
    const sql=dump(source);
    evidence.original_sql_sha256=hash(sql);
    if(prior){
      assert.equal(hash(sql),prior.original_sql_sha256);
      evidence.audit=await audit(8);
      evidence.source_unchanged=true;
      evidence.prior_http_responses=prior.responses.length;
      evidence.prior_case_status='FOLLOW_UP';
      evidence.result='PASS_POSTRUN_AUDIT';
      return;
    }
    assert(!/^\s*(?:(?:CREATE|DROP)\s+DATABASE|USE\s+|DELIMITER\b)/im.test(sql));
    const admin=await mysql.createConnection(conn(env.MYSQL_DATABASE));
    try{await admin.query('CREATE DATABASE '+mysql.escapeId(clone)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');}
    finally{await admin.end();}
    const imp=await mysql.createConnection({...conn(clone),multipleStatements:true});
    try{await imp.query(sql);}finally{await imp.end();}
    const canonical=require('./qa18-batch-backup.cjs').canonicalDump;
    assert.equal(canonical(dump(clone)),canonical(sql));
    db=await load('src/infrastructure/database').openDatabase({...env,MYSQL_DATABASE:clone});
    const secret=randomBytes(32).toString('base64'),security=load('src/modules/auth/security').createSecurity(secret),now=Date.now();
    const tokens={};
    for(const role of ['producer','buyer','outsider']){
      const u=fixture.accounts[role];
      const token=randomBytes(32).toString('base64url');
      await db.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms,authenticated_ms) VALUES(?,?,?,?)',[security.digest('token',token),u.account_id,now+180000,now]);
      tokens[role]=token;
    }
    const [old]=await db.execute('SELECT current_status,object_version FROM privacy_requests WHERE id=?',[id]);
    assert.deepEqual(old,[{current_status:'FOLLOW_UP',object_version:4}]);
    const disk=await require('./test-fixtures/qa18-disk-storage.cjs').openQaStorage(path.join(original,'private-storage'));
    const storageFactory=()=>({getBuffer:disk.storageFactory().getBuffer,put:async()=>{throw Error('READ_ONLY_STORAGE');}});
    const app=load('src/http/account-api').createAccountApi({db,secret,supplyStorageFactory:storageFactory});
    server=http.createServer((req,res)=>{if(req.method!=='GET'){res.writeHead(405).end();return;}return app(req,res);});
    await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok);});
    const base='http://127.0.0.1:'+server.address().port+'/api/v1/privacy';
    const req='/requests/'+id,op='/operations'+req;
    async function get(role,route,status=200){
      const response=await fetch(base+route,{headers:{Authorization:'Bearer '+tokens[role]},signal:AbortSignal.timeout(10000)});
      const b=Buffer.from(await response.arrayBuffer());
      const j=response.headers.get('content-type')?.includes('json')?JSON.parse(b):null;
      evidence.responses.push({role,route,status:response.status,sha256:hash(b),...j?.error?.code?{code:j.error.code}:{}});
      assert.equal(response.status,status,route+' '+j?.error?.code);
      return j?.data??b;
    }
    const mine=await get('buyer',req);
    assert.equal(mine.current_status,'FOLLOW_UP');
    assert.equal(mine.request.type,'COPY');
    assert.deepEqual(mine.request.scopes,['ALL']);
    const options=await get('producer',op+'/copy-options');
    assert.equal(options.request_completion,'NOT_CONFIRMED');
    assert.deepEqual(new Set(options.categories.map(c=>c.category)),new Set(categories));
    for(const cat of categories){
      const path='/data?category='+cat+'&limit=20';
      const [operator,applicant]=await Promise.all([get('producer',op+path),get('buyer',req+path)]);
      assert.deepEqual(operator,applicant,cat);
      assert.equal(operator.category,cat);
      assert.equal(operator.next_cursor,null,cat);
      assert(operator.items.every(row=>!Object.keys(row).some(k=>['object_key','provider_ref','evidence_ref','bank_document'].includes(k))));
      evidence.checks.push({category:cat,coverage:operator.coverage,metadata_items:operator.items.length,follow_up:options.categories.find(c=>c.category===cat).remaining,release:'NOT_AUTHORIZED_BY_INVENTORY'});
    }
    await get('outsider',req+'/copy-options',404);
    await get('outsider',op+'/data?category=PROFILE',403);
    const originalFile=mine.result.files[0];
    const body=await get('buyer',req+'/evidence/'+originalFile.id+'/content');
    assert.equal(hash(body),originalFile.content_sha256);
    assert.equal(body.length,4032);
    evidence.original_copy={id:originalFile.id,bytes:body.length,sha256:hash(body)};
    evidence.remaining_at_source=mine.result.remaining_actions;
    assert.equal((await fetch(base+req,{method:'POST'})).status,405);
    evidence.audit=await audit(8);
    assert.equal(hash(dump(source)),evidence.original_sql_sha256,'ORIGINAL_CHANGED');
    evidence.source_unchanged=true;
    evidence.cloned_business_unchanged=true;
    evidence.result='PASS_INTERNAL_INVENTORY_ONLY';
  }catch(error){evidence.result='FAIL';evidence.failure=error.code||error.message;throw error;}
  finally{
    if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
    await db?.close();
    await fs.unlink(cfg);
    evidence.finished_at=new Date().toISOString();
    await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(evidence,null,2)+'\n');
  }
  console.log(JSON.stringify({result:evidence.result,id,inventory_categories:evidence.checks.length,http_responses:evidence.responses.length}));
}
main().catch(error=>{console.error(error.code||error.message);process.exitCode=1;});
