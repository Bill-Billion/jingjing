"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { randomUUID: key, randomBytes, createHash } = require('node:crypto');
const { openDatabase } = require('../src/infrastructure/database');
const { migrate } = require('../src/infrastructure/database/migrator');

// One disposable story across the full handoff journey. Storage faults are injected,
// while HTTP authorization, transactions and all migrations use the actual backend.
test('one story: upload recovery, private corrections, formal history and first room', {
  skip: !process.env.JX_MYSQL_TEST_ENV_FILE,
}, async () => {
  const env = JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE, 'utf8'));
  assert.equal(env.NODE_ENV, 'test');
  assert.equal(env.MYSQL_HOST, '127.0.0.1');
  assert.equal(String(env.MYSQL_PORT), '33316');
  assert.ok(['jx_local', 'jx_dev'].includes(env.MYSQL_USER));
  const database = 'jx_test_story_room_' + randomBytes(8).toString('hex');
  const control = await mysql.createConnection({ host: env.MYSQL_HOST,
    port: Number(env.MYSQL_PORT), user: env.MYSQL_USER, password: env.MYSQL_PASSWORD,
    database: env.MYSQL_DATABASE });
  const report = { synthetic_only: true, contract_version: '0.31.4-rc.1',
    implementation_commit: '7882a98648bf339d999f61c40c8d47084d725433',
    migration: '0167', records: {}, steps: [],
    limits: ['HTTP integration, not a new App or Vue click-through',
      'Synthetic storage faults; no real OSS or paid provider called',
      'Invitation progress only; participation, payment and delivery are outside this journey'] };
  let db, server;
  async function step(name, expected, work) {
    try { const actual = await work(); report.steps.push({ name, expected, actual, status: 'PASS' }); }
    catch (error) { report.steps.push({ name, expected, actual: String(error.message), status: 'FAIL' }); throw error; }
  }
  try {
    await control.query('CREATE DATABASE ' + mysql.escapeId(database) + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
    db = await openDatabase({ ...env, MYSQL_DATABASE: database, MYSQL_CONNECTION_LIMIT: '1' });
    await migrate(db);
    const f = await require('./support/customization-delivery.cjs').seed(db);
    const { buyer, producer, reviewer, outsider, artist } = f.people;
    const buyerOrg = await f.parties.createOrganization(buyer.ctx, { display_name: 'synthetic alternate identity', operation_key: key() });
    const template = await require('../src/modules/customization/free-creation').publish(f.stories, producer.ctx,
      { template_version: 1, source_ref: 'synthetic:single-story-journey', operation_key: key() });
    let failBefore = false, failRead = false, writes = 0, onWritten = null;
    const storageFactory = () => ({
      async put(input) {
        if (failBefore) { failBefore = false; throw Object.assign(Error('synthetic write failed'), { code: 'PROVIDER_CALL_FAILED', status: 503 }); }
        writes++;
        const result = await f.storageFactory().put(input);
        if (onWritten) { const hook = onWritten; onWritten = null; hook(); }
        return result;
      },
      async getBuffer(objectKey) {
        if (failRead) { failRead = false; throw Error('synthetic storage read unavailable'); }
        return f.files.get(objectKey);
      },
    });
    server = require('../src/http/account-api').createAccountApi({ db, secret: f.secret,
      supplyStorageFactory: storageFactory, tradeEnv: { CUSTOMIZATION_MERCHANT_PARTY_ID: f.org.party_id } }).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = 'http://127.0.0.1:' + server.address().port + '/api/v1';
    async function request(method, url, body, { user = buyer, party = user.acting_party_id, version, op = key(), signal } = {}) {
      const response = await fetch(base + url, { method, signal, headers: {
        Authorization: 'Bearer ' + user.token, ...(party ? { 'X-Acting-Party': party } : {}),
        ...(body === undefined ? {} : { 'Content-Type': Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json', 'Idempotency-Key': op }),
        ...(version ? { 'If-Match': '"' + version + '"' } : {}),
      }, ...(body === undefined ? {} : { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) }) });
      const value = (response.headers.get('content-type') || '').includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer());
      return { status: response.status, value, cache: response.headers.get('cache-control') };
    }
    function ok(response) { assert.equal(response.status, 200, JSON.stringify(response.value)); return Buffer.isBuffer(response.value) ? response.value : response.value.data; }
    function denied(response, status, code) { assert.equal(response.status, status, JSON.stringify(response.value)); if (code) assert.equal(response.value.error.code, code); return { status: response.status, code: response.value.error?.code }; }
    const ops = { user: producer, party: null };
    let story, oldFile, newFile, correction, room;
    let storyUrl, attachments;
    const oldBytes = Buffer.from('Synthetic original story attachment. Not personal data.');
    const newBytes = Buffer.from('Synthetic corrected story attachment. Not personal data.');
    const hash = bytes => createHash('sha256').update(bytes).digest('hex');
    await step('新建私人故事', '创建草稿，运营列表和详情均不可见', async () => {
      story = ok(await request('POST', '/customization-requests', { template_version_id: template.template_version_id, answers: {} }));
      report.records.story_id = story.id;
      storyUrl = '/customization-requests/' + story.id; attachments = storyUrl + '/attachments';
      assert.equal(story.current_status, 'DRAFT');
      denied(await request('GET', storyUrl, undefined, ops), 404);
      assert.ok(!ok(await request('GET', '/operations/customization-requests', undefined, ops)).items.some(x => x.id === story.id));
      return { story_id: story.id, status: story.current_status, operator_visible: false };
    });
    await step('预留成功但文件未写入，恢复原请求', '暂时读不到存储时不盲写；恢复后同一记录变为可用，额度不重复占用', async () => {
      const op = key(), url = attachments + '?display_name=original.txt&media_type=text%2Fplain';
      const send = () => request('POST', url, oldBytes, { op });
      failBefore = true; denied(await send(), 503);
      const reserved = ok(await request('GET', attachments + '?include_retention=true')).items;
      assert.equal(reserved.length, 1); assert.equal(reserved[0].current_status, 'UPLOADING');
      assert.equal(reserved[0].retention_reason, null);
      failRead = true; denied(await send(), 409, 'ASSET_UPLOAD_RECONCILIATION_REQUIRED'); assert.equal(writes, 0);
      oldFile = ok(await send()); assert.equal(oldFile.id, reserved[0].id); assert.equal(oldFile.current_status, 'READY');
      assert.equal(ok(await send()).id, oldFile.id); assert.equal(writes, 1);
      assert.equal(ok(await request('GET', attachments)).items.length, 1);
      report.records.original_asset_id = oldFile.id;
      return { asset_id: oldFile.id, status: oldFile.current_status, record_count: 1, successful_writes: writes };
    });
    await step('保存、返回列表、重新打开', '同一草稿和附件可恢复，运营仍不可读', async () => {
      story = ok(await request('PATCH', storyUrl, { answers: { story: 'synthetic test data', material: oldFile.id } }, { version: story.object_version }));
      assert.ok(ok(await request('GET', '/customization-requests')).items.some(x => x.id === story.id));
      const reopened = ok(await request('GET', storyUrl)); assert.deepEqual(reopened.answers, story.answers);
      denied(await request('GET', attachments + '/' + oldFile.id + '/content', undefined, ops), 404);
      return { story_id: reopened.id, restored_asset_id: reopened.answers.material, operator_download: 404 };
    });
    await step('正式提交及运营下载', '运营只能在正式提交后读取，下载内容逐字节一致', async () => {
      story = ok(await request('POST', storyUrl + '/submissions', {}, { version: story.object_version }));
      report.records.original_submission_id = story.submission.id;
      const downloaded = await request('GET', attachments + '/' + oldFile.id + '/content', undefined, ops);
      assert.deepEqual(ok(downloaded), oldBytes); assert.equal(downloaded.cache, 'no-store');
      return { status: story.current_status, asset_id: oldFile.id, sha256: hash(downloaded.value), bytes_equal: true };
    });
    await step('运营要求补件，上传时断开请求后恢复', '原请求恢复同一新附件，不重复写入', async () => {
      story = ok(await request('POST', '/operations' + storyUrl + '/intake', {}, { ...ops, version: story.object_version }));
      correction = ok(await request('POST', '/operations' + storyUrl + '/supplements', { items: [{ field_key: 'material', reason: 'synthetic test data', instruction: 'synthetic test data' }] }, { ...ops, version: story.object_version }));
      const op = key(), url = attachments + '?display_name=corrected.txt&media_type=text%2Fplain';
      const abort = new AbortController();
      onWritten = () => abort.abort();
      await assert.rejects(request('POST', url, newBytes, { op, signal: abort.signal }), error => error.name === 'AbortError');
      const before = writes;
      newFile = ok(await request('POST', url, newBytes, { op })); assert.equal(writes, before);
      assert.equal(ok(await request('GET', attachments)).items.length, 2);
      report.records.replacement_asset_id = newFile.id;
      return { asset_id: newFile.id, status: newFile.current_status, repeated_write: false, http_request_aborted_after_storage_write: true };
    });
    await step('换文件但仅保存私稿', '本人重开可见新文件；运营仍只有旧文件，无法下载新文件', async () => {
      correction = ok(await request('PATCH', storyUrl + '/supplement', { answers: { story: 'synthetic test data', material: newFile.id }, responses: { material: 'synthetic test data' } }, { version: correction.object_version }));
      const reopened = ok(await request('GET', storyUrl + '/supplement'));
      assert.equal(reopened.draft.answers.material, newFile.id);
      assert.deepEqual(ok(await request('GET', attachments, undefined, ops)).items.map(x => x.id), [oldFile.id]);
      assert.deepEqual(ok(await request('GET', attachments + '/' + oldFile.id + '/content', undefined, ops)), oldBytes);
      denied(await request('GET', attachments + '/' + newFile.id + '/content', undefined, ops), 404);
      const retained = ok(await request('GET', attachments + '?include_retention=true')).items;
      assert.equal(retained.find(x => x.id === oldFile.id).retention_reason, 'FORMAL_SUBMISSION');
      assert.equal(retained.find(x => x.id === newFile.id).retention_reason, null);
      return { private_draft_asset: newFile.id, operator_visible_assets: [oldFile.id], new_download: 404 };
    });
    await step('正式重提及历史附件保留', '当前版本引用新文件，旧版本仍引用旧文件，两者显示正式版本保留原因，旧文件不可撤回', async () => {
      story = ok(await request('POST', storyUrl + '/supplement-submissions', {}, { version: correction.object_version }));
      assert.equal(story.submission.answers.material, newFile.id);
      const history = ok(await request('GET', storyUrl + '/submissions')).items;
      assert.equal(history.length, 2);
      const versions = [];
      for (const entry of history) versions.push(ok(await request('GET', storyUrl + '/submissions/' + entry.id)));
      assert.ok(versions.some(x => x.submission.answers.material === oldFile.id)); assert.ok(versions.some(x => x.submission.answers.material === newFile.id));
      report.records.submission_ids = history.map(x => x.id);
      const retained = ok(await request('GET', attachments + '?include_retention=true')).items;
      assert.ok(retained.every(x => x.retention_reason === 'FORMAL_SUBMISSION'));
      assert.deepEqual(ok(await request('GET', attachments + '/' + newFile.id + '/content', undefined, ops)), newBytes);
      assert.deepEqual(ok(await request('GET', attachments + '/' + oldFile.id + '/content', undefined, ops)), oldBytes);
      const revoke = denied(await request('POST', attachments + '/' + oldFile.id + '/revocations', {}, { version: oldFile.object_version }), 409);
      return { current_asset_id: newFile.id, historical_asset_id: oldFile.id, retention_reason: 'FORMAL_SUBMISSION', revoke };
    });
    await step('首次建房、邀请和人数进度', '同一故事无报价、无待补件，选择实际可用承制方和已审核规则建房，邀请合成人物；重复建房被拒绝', async () => {
      for (const person of [producer, reviewer]) await f.grant(person, 'COCREATION_REVIEW');
      let rule = ok(await request('POST', '/cocreation/rules', { rule: { version: 'synthetic-journey', source_ref: 'synthetic:journey', max_people: 40, extension_days: 7, participation_terms: 'Synthetic participation only; no cash; separate authorization.', benefit: { service_code: 'synthetic-clip', description: 'synthetic service credit', credit_minor: 1000, valid_days: 30 } } }, ops));
      rule = ok(await request('POST', '/cocreation/rules/' + rule.id + '/review', { decision: 'APPROVE', reason: 'synthetic independent review' }, { user: reviewer, party: null, version: rule.object_version }));
      const providers = ok(await request('GET', '/cocreation/creation-options?request_id=' + story.id + '&kind=PRODUCER')).items;
      const rules = ok(await request('GET', '/cocreation/creation-options?request_id=' + story.id + '&kind=RULE')).items;
      assert.ok(providers.some(x => x.id === f.org.party_id)); assert.ok(rules.some(x => x.id === rule.id));
      assert.equal(ok(await request('GET', storyUrl + '/quotes')).items.length, 0);
      const args = { request_id: story.id, rule_id: rule.id, producer_party_id: f.org.party_id, title: 'synthetic test data', deadline: new Date(Date.now() + 600000).toISOString(), purpose: 'PRIVATE', territory: 'CN' };
      room = ok(await request('POST', '/cocreation/rooms', args)); report.records.room_id = room.id;
      const actor = await f.actorCast(artist);
      const invite = ok(await request('POST', '/cocreation/rooms/' + room.id + '/invitations', { person_id: actor.person.id }, { version: room.object_version }));
      report.records.invitation_id = invite.id;
      assert.ok(ok(await request('GET', '/cocreation/invitations', undefined, { user: artist })).items.some(x => x.id === invite.id));
      const progress = ok(await request('GET', '/cocreation/rooms/' + room.id)); assert.equal(progress.counts.joined_count, 0);
      assert.ok(ok(await request('GET', '/cocreation/rooms')).items.some(x => x.id === room.id));
      denied(await request('POST', '/cocreation/rooms', args), 409, 'COCREATION_ROOM_EXISTS');
      return { room_id: room.id, invitation_id: invite.id, counts: progress.counts, duplicate: 'COCREATION_ROOM_EXISTS' };
    });
    await step('切换机构身份及其他账号隔离', '同一账号切到自己的机构不能读取个人故事；其他账号也不能读取故事、附件、历史或房间', async () => {
      const results = [];
      for (const identity of [{ party: buyerOrg.party_id }, { user: outsider }]) {
        for (const url of [storyUrl, attachments, storyUrl + '/submissions', attachments + '/' + oldFile.id + '/content', '/cocreation/rooms/' + room.id]) {
          results.push(denied(await request('GET', url, undefined, identity), 404));
        }
      }
      assert.equal(ok(await request('GET', storyUrl)).id, story.id);
      return { denied_requests: results.length, switched_back_story_id: story.id };
    });
  } finally {
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    if (db) await db.close();
    await control.query('DROP DATABASE IF EXISTS ' + mysql.escapeId(database));
    await control.end();
    report.disposable_database_removed = true;
    const output = path.resolve(__dirname, '../../../..', '.local/story-room-journey.json');
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
  }
});
