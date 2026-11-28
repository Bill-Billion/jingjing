'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { root, load, read, hash } = require('./test-fixtures/qa18-s4-delta-clone.cjs');

const origin = 'http://127.0.0.1:54418';

async function select() {
  const batch = await fs.realpath(path.resolve(process.argv[3]));
  const out = await fs.realpath(path.resolve(process.argv[4]));
  assert.equal(path.dirname(batch), path.join(root, '.local/stock-sandbox'));
  assert.match(path.basename(batch), /^jx_test_stock_pm03_[a-f0-9]{24}$/);
  assert(out.startsWith(path.join(root, '.local/qa18') + path.sep));
  const access = await read(path.join(batch, 'access.json'));
  const gateway = await read(path.join(out, 'GATEWAY.json'));
  assert(access.synthetic_only && access.mode === 'BATCH' && gateway.database === path.basename(batch));
  assert.equal(gateway.origin, origin);
  assert(Date.parse(gateway.expires_at) > Date.now());
  return {batch,out,access,gateway};
}

async function sql(gateway, action) {
  const env = await read(process.env.JX_MYSQL_TEST_ENV_FILE);
  for (const [key, value] of Object.entries({NODE_ENV:'test', DB_CLIENT:'mysql', MYSQL_HOST:'127.0.0.1',
    MYSQL_PORT:'33316', MYSQL_DATABASE:'jx_dev', MYSQL_USER:'jx_local'})) assert.equal(env[key], value);
  const db = await load('src/infrastructure/database').openDatabase({...env, MYSQL_DATABASE:gateway.database});
  try { return await action(db); } finally { await db.close(); }
}

async function grant({access,gateway}) {
  return sql(gateway, async db => {
    const {maintainOperatorGrant} = load('src/modules/governance/operator-access');
    const {account_id} = access.accounts.reviewer;
    const [rows] = await db.execute('SELECT object_version FROM governance_operator_grants WHERE account_id=? AND action_code=?',
      [account_id, 'SUPPORT_HANDLE']);
    if (!rows.length) await maintainOperatorGrant(db,{account_id,action:'SUPPORT_HANDLE',enabled:true,
      expected_version:0,expires_at:gateway.expires_at,authority_ref:'synthetic:s4-b-local-feedback',
      reason:'Isolated same-ticket Android and web smoke.'});
    return {role:'reviewer',grant:'SUPPORT_HANDLE',expires_at:gateway.expires_at};
  });
}

async function review({batch,out,access}, ticket) {
  assert.match(ticket, /^[\da-f-]{36}$/);
  const role = access.accounts.reviewer;
  const {chromium} = require(path.join(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/node_modules/playwright-core'));
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
  const proof = {ticket, checks:[], result:'FAIL'};
  const save = () => fs.writeFile(path.join(out,'vue-smoke.json'),JSON.stringify(proof,null,2)+'\n');
  try {
    const page = await browser.newPage({locale:'zh-CN',timezoneId:'Asia/Shanghai',viewport:{width:1400,height:1050},
      userAgent:'Mozilla/5.0 AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'});
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const endpoint = '/api/v1/support/operations/tickets/' + ticket;
    function received(uri, method='GET') {
      const result = page.waitForResponse(r => new URL(r.url()).pathname===uri && r.request().method()===method,
        {timeout:15_000});
      void result.catch(() => {});
      return result;
    }
    await page.goto(origin + '/support/operations/' + ticket);
    await page.getByTestId('phone-input').fill(role.phone);
    const challenge = received('/api/v1/auth/sms-challenges','POST');
    await page.getByTestId('send-code').click();
    const issued = await challenge;
    assert.equal(issued.status(), 200);
    const id = (await issued.json()).data.challenge_id;
    assert.match(id, /^[\da-f-]{36}$/);
    const sms = await read(path.join(batch, 'sms', id+'.json'));
    assert(sms.synthetic_only && sms.phone === role.phone);
    await page.getByTestId('code-input').fill(sms.code);
    const login = received('/api/v1/auth/sessions','POST');
    const readTicket = received(endpoint);
    await page.getByTestId('submit-login').click();
    const session = await login;
    assert.equal(session.status(),200);
    assert.equal((await session.json()).data.account.id,role.account_id);
    const data = await readTicket;
    assert.equal(data.status(),200);
    const {data: record} = await data.json();
    assert.equal(record.id,ticket);
    assert.equal(record.current_status,'SUBMITTED');
    proof.checks.push({normal_sms_login:true, independent_account:role.account_id, read:record.current_status});
    const link = page.getByRole('button',{name:/读取本次材料/});
    await link.waitFor();
    const download = page.waitForResponse(r => new URL(r.url()).pathname.startsWith(endpoint+'/assets/'));
    void download.catch(() => {});
    await link.click();
    const file = await download;
    assert.equal(file.status(),200);
    const bytes = await file.body();
    const localSample = await fs.readFile(path.join(batch, 'samples/test-portrait.jpg'));
    assert(bytes.equals(localSample), 'Same feedback attachment must match the Android input file.');
    proof.checks.push({scope:'vue', bytes:bytes.length, sha256:hash(bytes), same_app_attachment:true});

    async function act(action, message, status) {
      await page.getByLabel('选择操作').selectOption(action);
      await page.getByLabel('本次说明').fill(message);
      const waiting = received(endpoint+'/actions','POST');
      await page.getByRole('button',{name:'确认本次处理',exact:true}).click();
      const response = await waiting;
      assert.equal(response.status(),200);
      const {data} = await response.json();
      assert.deepEqual([data.id,data.current_status],[ticket,status]);
      proof.checks.push({action, status, version:data.object_version});
      await page.getByText(message,{exact:true}).waitFor();
    }
    await act('START','S4B-Support-start','PROCESSING');
    await act('ANSWER','S4B-Support-reply','ANSWERED');
    await page.screenshot({path:path.join(out,'vue-same-ticket.png')});
    proof.result='PASS';
  } catch(error) {
    proof.error=error.message.replace(/(?<!\d)\d{6,11}(?!\d)/g,'[NUMBER]');
    throw error;
  } finally { await save(); await browser.close(); }
}

async function verify({batch,out,access,gateway}, ticket) {
  assert.match(ticket, /^[\da-f-]{36}$/);
  return sql(gateway, async db => {
    const [[ticketRow]] = await db.execute('SELECT id,created_by,object_version,current_status FROM support_tickets WHERE id=?',[ticket]);
    assert.deepEqual([ticketRow.id,ticketRow.created_by,Number(ticketRow.object_version),ticketRow.current_status],
      [ticket,access.accounts.buyer.account_id,3,'ANSWERED']);
    const [rows] = await db.execute('SELECT action_code, actor_account_id FROM support_events WHERE ticket_id=? ORDER BY object_version',[ticket]);
    assert.deepEqual(rows.map(r => [r.action_code,r.actor_account_id]),
      [['SUBMIT',access.accounts.buyer.account_id],['START',access.accounts.reviewer.account_id],['ANSWER',access.accounts.reviewer.account_id]]);
    const [files] = await db.execute('SELECT f.id,f.object_key,f.content_sha256,f.byte_size FROM support_asset_refs l JOIN supply_assets f ON f.id=l.asset_id WHERE l.ticket_id=?',[ticket]);
    assert.equal(files.length,1);
    const file = files[0];
    const sample = await fs.readFile(path.join(batch,'samples/test-portrait.jpg'));
    assert.equal(file.content_sha256,hash(sample));
    const bytes = await fs.readFile(path.join(batch,'files',hash(Buffer.from(file.object_key))));
    assert(bytes.equals(sample) && Number(file.byte_size)===bytes.length);
    const deviceDownload = await fs.readFile(path.join(out,'android-downloaded.bin'));
    assert(deviceDownload.equals(bytes),'Android file saved through the native picker must match.');
    const proof={database:gateway.database,ticket:ticketRow,events:rows,attachment:{id:file.id,sha256:file.content_sha256,bytes:bytes.length},result:'PASS'};
    await fs.writeFile(path.join(out,'mysql-smoke.json'),JSON.stringify(proof,null,2)+'\n');
    return proof;
  });
}

async function main() {
  const input = await select();
  switch(process.argv[2]) {
    case 'grant': return grant(input);
    case 'vue': return review(input, process.argv[5]);
    case 'verify': return verify(input, process.argv[5]);
    default: throw Error('Expected grant, vue or verify');
  }
}
main().then(result => {if (result) console.log(JSON.stringify(result));})
  .catch(error => {console.error(error.message.replace(/(?<!\d)\d{6,11}(?!\d)/g,'[NUMBER]'));process.exitCode=1;});
