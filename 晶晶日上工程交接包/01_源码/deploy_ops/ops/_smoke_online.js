// 线上全接口回归冒烟（在服务器本机执行，打 127.0.0.1:3000）
// 含三个历史 bug 的真实复现验证；所有测试数据在 finally 中清理；不输出任何密钥。
const BASE = 'http://127.0.0.1:3000';
const path = require('path');
process.chdir('/opt/jjsr');
const Database = require('/opt/jjsr/node_modules/better-sqlite3');
const db = new Database('/opt/jjsr/jingjingshangri.db');
const { signToken } = require('/opt/jjsr/middleware/auth');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS  ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; fails.push(name); console.log('FAIL  ' + name + (extra ? '  ' + extra : '')); }
}
async function req(method, p, { token, body } = {}) {
  const opt = { method, headers: {} };
  if (token) opt.headers['Authorization'] = 'Bearer ' + token;
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch(BASE + p, opt);
  let json = null, text = await r.text();
  try { json = text ? JSON.parse(text) : null; } catch (e) { /* keep text */ }
  return { status: r.status, json, text: text.slice(0, 200) };
}
const GET = (p, o) => req('GET', p, o);
const POST = (p, body, o = {}) => req('POST', p, { ...o, body });

const TEST_PHONE = '19900000999';
const DIRTY_TITLE = '__SMOKE_DIRTY__';
const HUMAN_NAME = '__SMOKE_HUMAN__';
let testUserId = null, testHumanId = null, dirtyId = null;

(async () => {
  // 基线计数（清理后必须回到基线）
  const base = {
    humans: db.prepare('SELECT COUNT(*) c FROM humans').get().c,
    agree: db.prepare('SELECT COUNT(*) c FROM authorization_agreements').get().c,
    dep: db.prepare('SELECT COUNT(*) c FROM talent_deposits').get().c,
    users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
    lib: db.prepare('SELECT COUNT(*) c FROM sample_library').get().c,
  };
  console.log('BASELINE ' + JSON.stringify(base));

  try {
    // ---- 准备测试用户 + 自签 JWT（用服务自身 secret，不打印）----
    db.prepare("DELETE FROM users WHERE phone=?").run(TEST_PHONE);
    const r0 = db.prepare("INSERT INTO users (phone,nickname,role,status,is_auth,is_talent) VALUES (?,?, 'user','active',0,0)")
      .run(TEST_PHONE, '__SMOKE_USER__');
    testUserId = r0.lastInsertRowid;
    const token = signToken({ userId: testUserId, role: 'user' });
    ok('mint test JWT', typeof token === 'string' && token.length > 20);

    // ========== 一、公开 GET（期望 2xx + 业务 JSON）==========
    let r = await GET('/api/health');
    ok('GET /api/health 200', r.status === 200 && r.json && r.json.status === 'ok', r.status + ' ver=' + (r.json && r.json.version));
    ok('health version=10.1.0', r.json && r.json.version === '10.1.0');

    r = await GET('/api/humans');
    const humanList = r.json && r.json.list;
    ok('GET /api/humans 200+list', r.status === 200 && Array.isArray(humanList), 'n=' + (humanList && humanList.length));
    const firstId = humanList && humanList.length ? humanList[0].id : 1;

    r = await GET('/api/humans/' + firstId);
    ok('GET /api/humans/:id 200', r.status === 200 && r.json && r.json.id === firstId);

    r = await GET('/api/humans/meta/regions');
    ok('GET /api/humans/meta/regions 200', r.status === 200 && r.json && Array.isArray(r.json.provinces));

    r = await GET('/api/humans/' + firstId + '/pricing-suggest');
    const yuan = r.json && r.json.currentPrice;
    ok('GET humans pricing-suggest 200', r.status === 200 && r.json && r.json.suggestedMin, JSON.stringify(r.json && { c: r.json.currentPrice, min: r.json.suggestedMin }));
    ok('V12.2 currentPrice 单位为元(<10000)', typeof yuan === 'number' && yuan < 10000, 'currentPrice=' + yuan);

    r = await GET('/api/humans/' + firstId + '/showreels');
    ok('GET humans showreels 200', r.status === 200 && r.json && Array.isArray(r.json.showreels));

    // ===== 历史 bug ②：projects 分页非法入参不得 500/SQL syntax error =====
    for (const q of ['', '?page=abc&size=xyz', '?page=-5&pageSize=0', '?size=99999', '?page=1.8&pageSize=bad', '?page=2&pageSize=2']) {
      r = await GET('/api/projects' + q);
      ok('bug2 GET /api/projects' + (q || '(none)'), r.status === 200 && r.json && Array.isArray(r.json.list), 'status=' + r.status + ' page=' + (r.json && r.json.page) + ' size=' + (r.json && r.json.pageSize));
    }
    r = await GET('/api/projects/market/roles');
    ok('GET /api/projects/market/roles 200', r.status === 200 && Array.isArray(r.json.list));
    r = await GET('/api/projects/1');
    ok('GET /api/projects/1 200', r.status === 200 || r.status === 404, 'status=' + r.status);

    // ===== 历史 bug ③：samples 脏中文文本（库内已有3条真实脏数据）=====
    r = await GET('/api/samples/library');
    let dirtyReal = 0;
    if (r.status === 200 && r.json && r.json.library) {
      for (const g of Object.keys(r.json.library)) {
        for (const it of r.json.library[g]) {
          if (Array.isArray(it.characters) && Array.isArray(it.tags)) dirtyReal++;
        }
      }
    }
    ok('bug3 GET /api/samples/library 200（真实脏数据3条不500）', r.status === 200 && dirtyReal >= 3, 'parsedRows=' + dirtyReal);

    // 再插入一条“极端脏数据”强化验证（半截JSON+中文纯文本+顿号分号换行）
    db.prepare(`INSERT INTO sample_library (genre,title,outline,characters,tags,market_data,heat_score,status)
      VALUES ('悬疑推理', ?, '冒烟用极端脏数据', ?, ?, ?, 1, 'active')`)
      .run(DIRTY_TITLE,
        '主角：测试主角（脏中文纯文本；顿号、逗号，半截JSON {"broken',
        '测试、冒烟,回归；分号；换行\n另一个标签',
        '这根本不是JSON的中文纯文本');
    dirtyId = db.prepare('SELECT id FROM sample_library WHERE title=?').get(DIRTY_TITLE).id;
    r = await GET('/api/samples/library');
    let found = null;
    if (r.status === 200 && r.json && r.json.library) {
      for (const g of Object.keys(r.json.library)) {
        const f = r.json.library[g].find(x => x.title === DIRTY_TITLE);
        if (f) { found = f; break; }
      }
    }
    ok('bug3 极端脏数据行不500', r.status === 200 && !!found, 'status=' + r.status);
    ok('bug3 脏characters兜底为数组', !!found && Array.isArray(found.characters) && found.characters.length >= 1, found ? JSON.stringify(found.characters).slice(0, 80) : '');
    ok('bug3 脏tags按分隔符切分为数组', !!found && Array.isArray(found.tags) && found.tags.length >= 3, found ? JSON.stringify(found.tags) : '');
    ok('bug3 脏market_data包成{raw}', !!found && found.market_data && found.market_data.raw === '这根本不是JSON的中文纯文本');

    // 其余公开接口
    const pubs = [
      ['GET', '/api/endorsement/packages'], ['GET', '/api/endorsement/tasks'],
      ['GET', '/api/packages'], ['GET', '/api/scene-templates'], ['GET', '/api/theater'],
      ['GET', '/api/videos/templates'], ['GET', '/api/compliance/scopes'],
      ['GET', '/api/compliance/check/' + firstId + '/video'],
      ['GET', '/api/order-reviews/talent/' + firstId],
    ];
    for (const [m, p] of pubs) {
      r = await GET(p);
      let note = '';
      if (p === '/api/packages' && r.json) {
        const arr = r.json.list || r.json.packages || r.json;
        const first = Array.isArray(arr) ? arr[0] : null;
        note = first ? ('firstPrice=' + first.price) : '';
        ok('V122 packages price 单位为元', !first || first.price < 100000, note);
      }
      ok('PUB ' + m + ' ' + p, r.status === 200, 'status=' + r.status);
    }

    // ========== 二、受保护接口无 token 必须 401 ==========
    const prot = [
      ['GET', '/api/orders/all'], ['GET', '/api/mcn/dashboard'], ['GET', '/api/settlement/wallet'],
      ['GET', '/api/messages/conversations'], ['GET', '/api/videos/my'], ['GET', '/api/admin/dashboard'],
      ['GET', '/api/samples/my'], ['GET', '/api/contacts/received'], ['GET', '/api/identity/status'],
      ['GET', '/api/ai/status'],
    ];
    for (const [m, p] of prot) {
      r = await GET(p);
      ok('401 ' + m + ' ' + p, r.status === 401, 'status=' + r.status);
    }
    for (const p of ['/api/ai/copy', '/api/ai/blessing', '/api/ai/tts', '/api/ai/video', '/api/ai/image', '/api/ai/voice-clone']) {
      r = await POST(p, {});
      ok('401 POST ' + p + '（AI强制登录）', r.status === 401, 'status=' + r.status);
    }
    // bug① 端点本身也需要登录
    r = await POST('/api/humans', { name: HUMAN_NAME });
    ok('POST /api/humans 无token=401', r.status === 401, 'status=' + r.status);

    // ========== 三、历史 bug ①：创建数字人 15 列对齐（带 token 走通）==========
    r = await POST('/api/humans', {
      name: HUMAN_NAME, tags: '测试,冒烟', style: '温暖', specialty: '接口回归',
      province: '浙江省', city: '嘉兴市', district: '南湖区', price: 99,
      scopeVideo: 1, scopeEndorsement: 1,
    }, { token });
    ok('bug1 POST /api/humans 创建成功不再16/15报错', r.status === 200 && r.json && r.json.id, 'status=' + r.status + ' resp=' + r.text.slice(0, 120));
    if (r.json && r.json.id) {
      testHumanId = r.json.id;
      const row = db.prepare('SELECT * FROM humans WHERE id=?').get(testHumanId);
      ok('bug1 status正确落在status列=pending', row && row.status === 'pending', row && row.status);
      const isoish = row && /20\d\d-/.test(String(row.subsidy_until));
      ok('bug1 subsidy_until未被错位（是日期而非pending）', !!isoish, row && String(row.subsidy_until));
      ok('bug1 字面量列 is_new_talent=1/quality=B/verified=none', row && row.is_new_talent === 1 && row.quality_grade === 'B' && row.verified_level === 'none');
      const ag = db.prepare('SELECT scope, signed_at FROM authorization_agreements WHERE human_id=? ORDER BY scope').all(testHumanId);
      ok('bug1 授权记录2条(video+endorsement)且signed_at有值', ag.length === 2 && ag.every(x => !!x.signed_at), JSON.stringify(ag));
      const dep = db.prepare('SELECT * FROM talent_deposits WHERE user_id=?').get(testUserId);
      ok('bug1 保证金记录同步创建', !!dep && dep.collection_mode === 'first_income');
    }
    // 带 token 访问受保护接口应非 401（证明鉴权链路正常）
    r = await GET('/api/orders/all', { token });
    ok('带token GET /api/orders/all 非401', r.status !== 401, 'status=' + r.status);
    r = await GET('/api/ai/status', { token });
    ok('带token GET /api/ai/status 非401（不触发上游费用）', r.status !== 401, 'status=' + r.status);

  } catch (e) {
    console.log('SMOKE_EXCEPTION ' + e.message + '\n' + e.stack);
    fail++; fails.push('EXCEPTION');
  } finally {
    // ========== 清理全部测试数据 ==========
    if (testHumanId) {
      db.prepare('DELETE FROM authorization_agreements WHERE human_id=?').run(testHumanId);
      db.prepare('DELETE FROM humans WHERE id=?').run(testHumanId);
    }
    if (testUserId) {
      db.prepare('DELETE FROM talent_deposits WHERE user_id=?').run(testUserId);
      db.prepare('DELETE FROM users WHERE id=?').run(testUserId);
    }
    if (dirtyId) db.prepare('DELETE FROM sample_library WHERE id=?').run(dirtyId);
    db.prepare("DELETE FROM sample_library WHERE title=?").run(DIRTY_TITLE);
    db.prepare("DELETE FROM humans WHERE name=?").run(HUMAN_NAME);
    db.prepare("DELETE FROM users WHERE phone=?").run(TEST_PHONE);

    const after = {
      humans: db.prepare('SELECT COUNT(*) c FROM humans').get().c,
      agree: db.prepare('SELECT COUNT(*) c FROM authorization_agreements').get().c,
      dep: db.prepare('SELECT COUNT(*) c FROM talent_deposits').get().c,
      users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
      lib: db.prepare('SELECT COUNT(*) c FROM sample_library').get().c,
    };
    console.log('AFTER CLEAN ' + JSON.stringify(after));
    const residue = JSON.stringify(after) !== JSON.stringify(base);
    ok('测试数据零残留（计数回到基线）', !residue, 'base=' + JSON.stringify(base) + ' after=' + JSON.stringify(after));
    db.close();
  }
  console.log('\n==== SMOKE SUMMARY pass=' + pass + ' fail=' + fail + ' ====');
  if (fail) { console.log('FAILS: ' + fails.join(' | ')); process.exit(1); }
  process.exit(0);
})();
