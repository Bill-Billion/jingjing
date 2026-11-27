'use strict';
// A bounded G15 check from category selection through the original submission and case recovery.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID, randomBytes} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const backend = path.join(root, '晶晶日上工程交接包/01_源码/backend_server');
const load = file=>require(path.join(backend,file));
load('scripts/test-network-guard.cjs');

async function main() {
  const out=path.resolve(process.argv[2] || '');
  assert(out.startsWith(path.join(root,'.local/qa18')+path.sep));
  await fs.mkdir(out,{recursive:true});
  await fs.writeFile(path.join(out,'CREATE_ONCE'),'story case tail',{flag:'wx'});
  const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
  for (const [key,value] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',
    MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'})) assert.equal(env[key],value);
  const mysql=load('node_modules/mysql2/promise');
  const name='jx_test_qa18_tail_story_'+randomBytes(10).toString('hex');
  const report={product:'053168fb6e06b80680101702a733357309368809',
    checkout:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
    database:name, started_at:new Date().toISOString(), requests:[], scenarios:[], records:{}};
  const control=await mysql.createConnection({host:env.MYSQL_HOST,port:+env.MYSQL_PORT,
    user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
  let db,server,created=false;
  try {
    await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
    created=true;
    db=await load('src/infrastructure/database').openDatabase({...env,MYSQL_DATABASE:name});
    await load('src/infrastructure/database/migrator').migrate(db);
    const [migrations]=await db.execute('SELECT version,name,status FROM platform_schema_migrations ORDER BY version');
    assert.equal(migrations.length,225);
    assert(migrations.every(row=>row.status==='APPLIED'));
    report.last_migration=migrations.at(-1);
    const f=await load('test/support/customization-delivery.cjs').seed(db);
    const {buyer,producer,reviewer,outsider}=f.people;
    for (const u of [producer,reviewer]) await f.grant(u,'COCREATION_REVIEW');
    server=load('src/http/account-api').createAccountApi({db,secret:f.secret,supplyStorageFactory:f.storageFactory,
      tradeEnv:{CUSTOMIZATION_MERCHANT_PARTY_ID:f.org.party_id}}).listen(0,'127.0.0.1');
    await new Promise((ok,bad)=>{server.once('listening',ok);server.once('error',bad);});
    async function request(method,url,{user=buyer,party=user.acting_party_id,body,version,op=randomUUID(),status=200,code}={}) {
      const res=await fetch('http://127.0.0.1:'+server.address().port+'/api/v1'+url,{method,headers:{
        Authorization:'Bearer '+user.token, ...(party?{'X-Acting-Party':party}:{}),
        ...(version?{'If-Match':'"'+version+'"'}:{}),
        ...(body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':op}),
      },...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(12000)});
      const value=await res.json();
      report.requests.push({method,path:url,status:res.status,...(value.error?{code:value.error.code}:{})});
      assert.equal(res.status,status,url+' '+JSON.stringify(value.error));
      if(code) assert.equal(value.error.code,code);
      return res.ok?value.data:value.error;
    }

    const categories=await f.stories.categories(buyer.ctx);
    const original=categories.items.find(item=>item.template_snapshot.fields.some(field=>field.key==='story'));
    assert(original,'Fixture has a published family story');
    const choice=await f.stories.publishTemplate(producer.ctx,{category_code:'synthetic_memory',
      template_version:1,template_snapshot:{title:'Synthetic memory',description:'Isolated fixture only',
        fields:[{key:'memory',label:'Memory',type:'TEXT',required:true,max_length:500}]},
      source_ref:'synthetic:qa18-s3c-tail-memory',operation_key:randomUUID()});
    const listed=await request('GET','/customization-categories',{party:null});
    assert.deepEqual(listed.items.find(row=>row.template_version_id===choice.template_version_id)
      .template_snapshot.fields.map(field=>field.key),['memory']);
    assert(listed.items.some(row=>row.template_version_id===original.template_version_id));

    const draft=await request('POST','/customization-requests',{body:{template_version_id:choice.template_version_id,answers:{}}});
    report.records.story_id=draft.id;
    const storyPath='/customization-requests/'+draft.id;
    const missing=await request('POST',storyPath+'/submissions',{body:{},version:draft.object_version,status:422});
    assert(missing.details.some(field=>field.field==='answers.memory'&&field.reason==='REQUIRED'));
    const reopened=await request('GET',storyPath);
    assert.equal(reopened.current_status,'DRAFT');
    assert.equal(reopened.object_version,draft.object_version);
    const saved=await request('PATCH',storyPath,{body:{answers:{memory:'Synthetic text for one submission.'}},version:draft.object_version});
    const submit={body:{},version:saved.object_version,op:randomUUID()};
    // Read the original command again after acceptance as a client recovering an unknown response would.
    const submitted=await request('POST',storyPath+'/submissions',submit);
    assert.equal(submitted.current_status,'SUBMITTED');
    assert.equal(submitted.submission.template_snapshot.fields[0].key,'memory');
    assert.equal((await request('POST',storyPath+'/submissions',submit)).submission.id,submitted.submission.id);
    assert.equal((await request('GET',storyPath)).submission.content_sha256,submitted.submission.content_sha256);
    await request('GET',storyPath,{user:outsider,status:404});
    const [[submissions]]=await db.execute('SELECT COUNT(*) n FROM customization_submissions WHERE request_id=?',[draft.id]);
    assert.equal(Number(submissions.n),1);
    report.records.submission_id=submitted.submission.id;
    report.scenarios.push({name:'category-specific required question, same-draft correction and original submission replay',status:'PASS',submission_count:1});

    const rule=await request('POST','/cocreation/rules',{user:producer,party:null,body:{rule:{
      version:'synthetic-tail-case',source_ref:'synthetic:qa18-case',max_people:40,extension_days:7,
      participation_terms:'Synthetic separate participation and consent.',benefit:{service_code:'synthetic',description:'synthetic',credit_minor:1000,valid_days:30},
    }}});
    await request('POST','/cocreation/rules/'+rule.id+'/review',{user:reviewer,party:null,
      version:rule.object_version,body:{decision:'APPROVE',reason:'Synthetic independent review'}});
    const room=await request('POST','/cocreation/rooms',{body:{request_id:draft.id,rule_id:rule.id,
      producer_party_id:f.org.party_id,title:'Synthetic isolated case',deadline:new Date(Date.now()+2*86400000).toISOString(),
      purpose:'PRIVATE',territory:'CN'}});
    report.records.room_id=room.id;
    const roomPath='/cocreation/rooms/'+room.id;
    const cancel={kind:'CANCEL',reason:'Synthetic unpaid room cancellation request',new_deadline:null};
    await request('POST',roomPath+'/cases',{user:outsider,version:room.object_version,body:cancel,status:404});
    const originalCancel={version:room.object_version,op:randomUUID(),body:cancel};
    const opened=await request('POST',roomPath+'/cases',originalCancel);
    report.records.case_id=opened.id;
    const paused=await request('GET',roomPath);
    assert.equal(paused.current_status,'PAUSED');
    assert.equal((await request('POST',roomPath+'/cases',originalCancel)).id,opened.id);
    await request('POST',roomPath+'/cases',{version:paused.object_version,body:cancel,status:409,code:'COCREATION_CASE_ALREADY_OPEN'});
    const reject={user:reviewer,party:null,version:opened.object_version,op:randomUUID(),
      body:{decision:'REJECT',reason:'Synthetic independent decline'}};
    const reviewPath='/cocreation/cases/'+opened.id+'/review';
    const reviewed=await request('POST',reviewPath,reject);
    assert.equal(reviewed.current_status,'REJECTED');
    assert.equal((await request('POST',reviewPath,reject)).id,opened.id);
    const after=await request('GET',roomPath);
    assert.equal(after.current_status,room.current_status);
    assert.equal(after.deadline,room.deadline);
    const [[cases]]=await db.execute("SELECT COUNT(*) n FROM cocreation_records WHERE parent_id=? AND kind='CASE'",[room.id]);
    assert.equal(Number(cases.n),1);
    report.scenarios.push({name:'unpaid room, one pause case, independent decline, original-key recovery and reopening',status:'PASS',case_count:1,initial_room_status:room.current_status,final_room_status:after.current_status});
  } catch(error) {
    report.failure={name:error.name,message:error.message};
    throw error;
  } finally {
    try {
      if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
      if(db)await db.close();
      if(created)await control.query('DROP DATABASE '+mysql.escapeId(name));
      report.isolated_database_dropped=created;
    } finally {
      await control.end();
      report.finished_at=new Date().toISOString();
      await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');
    }
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
