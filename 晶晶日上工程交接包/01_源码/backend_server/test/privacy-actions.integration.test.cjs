'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path');
const {randomUUID: key, randomBytes} = require('node:crypto'), mysql = require('mysql2/promise');
const {digest} = require('../src/modules/governance/content');
const {openDatabase} = require('../src/infrastructure/database');
const {migrate} = require('../src/infrastructure/database/migrator');

test('personal withdrawal and model deletion use real transactions and durable provider results',
  {skip: !process.env.JX_MYSQL_TEST_ENV_FILE}, async t => {
  const env = JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE, 'utf8'));
  for (const [k, v] of Object.entries({NODE_ENV:'test', DB_CLIENT:'mysql', MYSQL_HOST:'127.0.0.1', MYSQL_PORT:'33316', MYSQL_USER:'jx_local', MYSQL_DATABASE:'jx_dev'})) assert.equal(env[k], v);
  const name = `jx_test_${process.pid}_${randomBytes(6).toString('hex')}`;
  const control = await mysql.createConnection({host:env.MYSQL_HOST, port:Number(env.MYSQL_PORT), user:env.MYSQL_USER, password:env.MYSQL_PASSWORD, database:env.MYSQL_DATABASE});
  let db, server;
  try {
    await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
    db = await openDatabase({...env, MYSQL_DATABASE:name}); await migrate(db);
    const S = await require('./support/customization-delivery.cjs').seed(db);
    const {buyer, producer, reviewer, outsider} = S.people;
    const {order} = await S.newOrder();
    async function consentFor(person) {
      const material = await S.upload(person, 'AVATAR_MATERIAL'), proof = await S.upload(person, 'CONSENT_EVIDENCE');
      const avatar = await S.supply.createAvatar(person.ctx, {party_id:person.personal_party_id, display_name:'Synthetic deletion subject', material_asset_ids:[material.id], operation_key:key()});
      let consent = await S.supply.createConsent(person.ctx, {consent:{avatar_id:avatar.id, subject_party_id:person.personal_party_id,
        features:['FACE'], purposes:['PRIVATE','AI_TRAIN'], territories:['CN'], valid_from:'2020-01-01T00:00:00.000Z',
        valid_until:'2099-01-01T00:00:00.000Z', terms:'Synthetic rights fixture only', evidence_asset_ids:[proof.id]}, operation_key:key()});
      consent = await S.supply.reviewConsent(reviewer.ctx, {record_id:consent.id, expected_version:consent.object_version, decision:'APPROVED', reason:'Synthetic', operation_key:key()});
      return consent;
    }
    const consent = await consentFor(buyer), foreignConsent = await consentFor(outsider);
    // Imported synthetic pre-existing models. Creation is independently covered by
    // production.integration; this fixture is not evidence of a live provider.
    const project = key(), projectData = {buyer_party_id:buyer.personal_party_id, merchant_party_id:S.org.party_id,
      producer_party_id:S.org.party_id, assignee_account_id:producer.account_id, consent_ids:[consent.id, foreignConsent.id]};
    await db.execute("INSERT INTO production_records(id,kind,order_id,created_by,current_status,data_json,data_sha256) VALUES (?,'PROJECT',?,?,'READY',?,?)",
      [project, order.id, producer.account_id, JSON.stringify(projectData), digest(projectData)]);
    async function model(c = consent) {
      const id = key(), data = {avatar_id:c.data.consent.avatar_id, consent_id:c.id, provider_code:'synthetic.delete',
        environment:'SANDBOX', config_revision:'synthetic-1', upstream_asset_ref:'private.provider.ref.'+id, asset_type:'LONG_LIVED_AVATAR'};
      await db.execute("INSERT INTO production_records(id,kind,project_id,order_id,created_by,current_status,data_json,data_sha256) VALUES (?,'DIGITAL_ASSET',?,?,?,'READY',?,?)",
        [id, project, order.id, producer.account_id, JSON.stringify(data), digest(data)]);
      return {id, data};
    }
    let target = await model(); const foreign = await model(foreignConsent);
    server = require('../src/http/account-api').createAccountApi({db, secret:S.secret, supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');
    await new Promise(r => server.once('listening',r));
    const base = `http://127.0.0.1:${server.address().port}/api/v1/privacy`, fixtures = [];
    async function call(method, url, person = buyer, body, version, operation = key(), party = null) {
      const response = await fetch(base+url,{method, headers:{Authorization:'Bearer '+person.token,
        ...(body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':operation}),
        ...(version===undefined?{}:{'If-Match':'"'+version+'"'}), ...(party?{'X-Acting-Party':party}:{})},
        ...(body===undefined?{}:{body:JSON.stringify(body)})});
      const value = await response.json();
      const schema = response.status!==200 ? 'ErrorResponse' : url.includes('/model-assets') ? 'PrivacyModelListResponse'
        : url.includes('/actions') ? 'PrivacyActionListResponse' : /\/(consent-withdrawals|model-deletions)$/.test(url) ? 'PrivacyActionResponse' : 'PrivacyRequestResponse';
      fixtures.push({method,path:new URL(base+url).pathname,schema,value});
      return {status:response.status,...value};
    }
    const ok = r => {assert.equal(r.status,200,JSON.stringify(r)); return r.data;};
    const bad = (r, code) => assert.equal(r.error?.code,code,JSON.stringify(r));
    const create = async(type='DELETE', scopes=['DIGITAL_MODELS'], person=buyer) => ok(await call('POST','/requests',person,{type,scopes,details:'Synthetic personal processing request'}));
    let request = await create(), deletion;
    const url = suffix => '/requests/'+request.id+'/'+suffix;
    const current = async() => request = ok(await call('GET','/requests/'+request.id));
    await t.test('only the subject sees model targets; organization and operator cannot act as the subject',async()=>{
      const list = ok(await call('GET',url('model-assets')+'?limit=1'));
      assert.equal(list.items.length,1); assert.equal(list.items[0].asset_id,target.id);
      assert.ok(!JSON.stringify(list).includes('private.provider.ref')); assert.equal(list.coverage,'PRODUCTION_MODELS_ONLY');
      bad(await call('GET',url('model-assets'),outsider),'PRIVACY_REQUEST_NOT_FOUND');
      bad(await call('GET',url('model-assets'),reviewer),'PRIVACY_REQUEST_NOT_FOUND');
      bad(await call('GET',url('model-assets'),buyer,undefined,undefined,key(),buyer.personal_party_id),'ACTING_PARTY_NOT_ALLOWED');
      const other = await create('DELETE',['DIGITAL_MODELS'],outsider);
      bad(await call('POST','/requests/'+other.id+'/model-deletions',outsider,{asset_id:target.id,asset_version:1},other.object_version),'PRIVACY_TARGET_NOT_FOUND');
    });
    await t.test('scope, version, consent ownership and explicit withdrawal are required',async()=>{
      const copy = await create('COPY');
      bad(await call('GET','/requests/'+copy.id+'/model-assets'),'PRIVACY_ACTION_SCOPE_MISMATCH');
      bad(await call('POST',url('model-deletions'),buyer,{asset_id:target.id,asset_version:1}),'EXPECTED_VERSION_REQUIRED');
      bad(await call('POST',url('model-deletions'),buyer,{asset_id:target.id,asset_version:1},request.object_version),'CONSENT_WITHDRAWAL_REQUIRED');
      bad(await call('POST',url('consent-withdrawals'),buyer,{consent_id:foreignConsent.id,consent_version:2,reason:'Synthetic'},request.object_version),'PRIVACY_TARGET_NOT_FOUND');
    });
    await t.test('action-record failure rolls back consent, audit, request and outbox together',async()=>{
      await db.withConnection(c=>c.query("CREATE TRIGGER privacy_action_fail BEFORE INSERT ON privacy_actions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic rollback'"));
      try {assert.equal((await call('POST',url('consent-withdrawals'),buyer,{consent_id:consent.id,consent_version:consent.object_version,reason:'Synthetic'},request.object_version)).status,503);}
      finally {await db.withConnection(c=>c.query('DROP TRIGGER privacy_action_fail'));}
      const [[c]] = await db.execute('SELECT current_status FROM supply_records WHERE id=?',[consent.id]); assert.equal(c.current_status,'APPROVED');
      assert.equal((await current()).object_version,1);
    });
    await t.test('withdrawal retries are idempotent and authorization is actually unusable',async()=>{
      const operation=key(), body={consent_id:consent.id,consent_version:consent.object_version,reason:'Withdraw my synthetic face authorization'};
      const results=await Promise.all([call('POST',url('consent-withdrawals'),buyer,body,request.object_version,operation),call('POST',url('consent-withdrawals'),buyer,body,request.object_version,operation)]);
      assert.equal(ok(results[0]).action_id,ok(results[1]).action_id);await current();
      const [[raw]]=await db.execute('SELECT * FROM supply_records WHERE id=?',[consent.id]);
      const data=typeof raw.data_json==='string'?JSON.parse(raw.data_json):raw.data_json;
      assert.equal(raw.current_status,'WITHDRAWN');
      assert.equal(require('../src/modules/works/consent-policy').coversConsent({...raw,data},{feature:'FACE',purpose:'AI_TRAIN',territory:'CN'},new Date().toISOString()),false);
      assert.equal(ok(await call('GET',url('actions'))).items[0].status,'CONSENT_WITHDRAWN');
    });
    await t.test('deletion and privacy action are atomic; failed recording creates no external job',async()=>{
      await db.withConnection(c=>c.query("CREATE TRIGGER privacy_action_fail BEFORE INSERT ON privacy_actions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic rollback'"));
      try {assert.equal((await call('POST',url('model-deletions'),buyer,{asset_id:target.id,asset_version:1},request.object_version)).status,503);}
      finally {await db.withConnection(c=>c.query('DROP TRIGGER privacy_action_fail'));}
      const [[row]]=await db.execute('SELECT current_status FROM production_records WHERE id=?',[target.id]);assert.equal(row.current_status,'READY');
      const [[count]]=await db.execute("SELECT COUNT(*) AS n FROM platform_jobs WHERE task_type='PRODUCTION_DIGITAL_HUMAN'");assert.equal(Number(count.n),0);
    });
    await t.test('same deletion is queued once; order need not be paid to exercise withdrawal',async()=>{
      const operation=key(), body={asset_id:target.id,asset_version:1};
      const results=await Promise.all([call('POST',url('model-deletions'),buyer,body,request.object_version,operation),call('POST',url('model-deletions'),buyer,body,request.object_version,operation)]);
      deletion=ok(results[0]);assert.equal(deletion.action_id,ok(results[1]).action_id);await current();
      bad(await call('POST',url('model-deletions'),buyer,body,request.object_version),'PRIVACY_ACTION_ALREADY_RECORDED');
      const state=ok(await call('GET',url('actions')));assert.equal(state.items.find(x=>x.action_id===deletion.action_id).status,'QUEUED');
      assert.equal(state.request_completion,'NOT_CONFIRMED');
    });
    const jobs=require('../src/infrastructure/jobs/repository').createJobRepository(db);
    let ready=false, confirmed=false, submits=0, queries=0, configuration='synthetic-1';
    const provider={
      async assertReady(){if(!ready)throw Object.assign(Error('disabled'),{code:'PROVIDER_NOT_CONFIGURED'});},
      async descriptor(){return {provider_code:'synthetic.delete',environment:'SANDBOX',config_revision:configuration};},
      async submit(input){submits++;assert.equal(input.operation,'DELETE_LONG_LIVED');return {request_key:input.request_key,status:'PENDING',task_id:'synthetic.task.'+input.request_key};},
      async query(input){queries++;return {request_key:input.request_key,status:'SUCCEEDED',deleted:confirmed};}
    };
    const handlers=require('../src/modules/production/handlers').createProductionHandlers(db,{provider});
    const worker=require('../src/worker/runner').createWorker({repository:jobs,handlers});
    const jobRow=async()=>{const [[r]]=await db.execute("SELECT j.* FROM privacy_actions a JOIN production_records g ON g.id=a.result_record_id JOIN platform_jobs j ON j.id=JSON_UNQUOTE(JSON_EXTRACT(g.data_json,'$.job_id')) WHERE a.id=?",[deletion.action_id]);return r;};
    async function tickModel(){const before=await jobRow();for(let n=0;n<10;n++){await worker.tick();const after=await jobRow();if(after.attempts>before.attempts)return;}assert.fail('Expected deletion job to run');}
    const state=async()=>ok(await call('GET',url('actions'))).items.find(x=>x.action_id===deletion.action_id);
    await t.test('missing provider configuration leaves a visible failure and never calls upstream',async()=>{
      await tickModel();assert.equal(submits,0);assert.equal((await state()).status,'NEEDS_ATTENTION');
      assert.equal((await state()).job_status,'BLOCKED');
    });
    async function retry(){const job=await jobRow();await jobs.manualRetry(job.id,{actor_ref:reviewer.account_id,reason_ref:'synthetic:approved-retry',additional_attempts:5});}
    await t.test('changed provider account cannot receive a deletion for the former account',async()=>{
      ready=true;configuration='another-merchant';await retry();await tickModel();
      assert.equal(submits,0);assert.equal((await state()).status,'NEEDS_ATTENTION');configuration='synthetic-1';
    });
    await t.test('accepted task and an unconfirmed deletion receipt do not mean deleted',async()=>{
      target=await model();deletion=ok(await call('POST',url('model-deletions'),buyer,{asset_id:target.id,asset_version:1},request.object_version));await current();
      await tickModel();assert.equal(submits,1);assert.equal((await state()).status,'WAITING_PROVIDER');
      const job=await jobRow();await db.execute('UPDATE platform_jobs SET next_run_at=CURRENT_TIMESTAMP(6) WHERE id=?',[job.id]);
      await tickModel();assert.equal(queries,1);assert.equal((await state()).status,'NEEDS_ATTENTION');
      const [[asset]]=await db.execute('SELECT current_status FROM production_records WHERE id=?',[target.id]);assert.equal(asset.current_status,'DELETING');
    });
    await t.test('verified receipt completes only that model and retry recovers without resubmitting',async()=>{
      confirmed=true;await retry();await tickModel();assert.equal(submits,1);assert.equal(queries,2);
      assert.equal((await state()).status,'MODEL_DELETED');
      assert.equal((await current()).current_status,'FOLLOW_UP');
      assert.equal(ok(await call('GET',url('actions'))).request_completion,'NOT_CONFIRMED');
      const second=await create(), list=ok(await call('GET','/requests/'+second.id+'/model-assets'));
      const asset=list.items.find(x=>x.asset_id===target.id);
      ok(await call('POST','/requests/'+second.id+'/model-deletions',buyer,{asset_id:target.id,asset_version:asset.asset_version},second.object_version));
      const [[count]]=await db.execute("SELECT COUNT(*) AS n FROM platform_jobs WHERE task_type='PRODUCTION_DIGITAL_HUMAN'");assert.equal(Number(count.n),2);
    });
    await t.test('tampered result cannot be exposed as successful deletion',async()=>{
      const job=await jobRow(),[[row]]=await db.execute('SELECT * FROM production_records WHERE id=?',[job.payload_ref]);
      const data=typeof row.data_json==='string'?JSON.parse(row.data_json):row.data_json;
      const changed={...data,asset_id:foreign.id};
      await db.execute('UPDATE production_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(changed),digest(changed),row.id]);
      assert.equal((await call('GET',url('actions'))).status,503);
      await db.execute('UPDATE production_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(data),digest(data),row.id]);
    });
    const out=path.resolve(__dirname,'../../../..','.local/privacy-actions-http-fixtures.json');
    await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
  } finally {
    if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});
    if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();
  }
});
