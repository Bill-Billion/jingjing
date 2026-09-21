// R0.6: this historical script expects removed demo/autoapproval behavior.
throw new Error('LEGACY_SELFTEST_RETIRED: 请运行 npm run test:legacy-safety；旧脚本不可作为当前验收。');

// scripts/volc_compliance_selftest.js
// 火山引擎合规三件套（V12.6）本地自测：默认 provider=volc。
//  A. 缺合规凭证（安全降级）：volcClient/人脸/二要素 ready=false 且不崩、不误判、不伪造；文本本地词库、图片/视频转人工；
//     实名维持现状(unverified_auto)且身份证 AES 加密；非生产演示签署；未接云 face init 503。
//  B. mock 火山 HTTP（真实 V4 签名 → 本地 mock server，不触公网）：
//     人脸有源通过 / 210207 姓名身份证不符 / 210311 人脸不符 / 处理中 null / 低分不过 / 坏响应 fail-closed；断言确有 V4 签名头；
//     rms 二要素三态判定策略一致/不一致/无结论；rms 缺 host/AppID/bizType 门控（即使配了 AK 也不臆造通过）；
//     文本涉黄涉政拦截/正常放行、图片视频转人工、rms 字段未调研时云判返回 null 回退本地。
//  C. provider 切换 + HTTP 端到端（临时 SQLite + 隔离端口）：facade 可切回 aliyun 备用实现；
//     人脸通过→/sign 200；人脸不通过→403；处理中→409；生产缺核身→501 红线。
// 全程临时库 + 隔离端口 + mock，不触网、不写真实数据、不含任何真实凭证。
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDb = path.join(os.tmpdir(), 'volc_selftest_' + Date.now() + '.db');
process.env.SQLITE_PATH = tmpDb;
process.env.PORT = '3199';
process.env.NODE_ENV = 'development';
// 默认即 volc，这里显式声明，避免本机 .env 里 COMPLIANCE_PROVIDER 干扰
process.env.COMPLIANCE_PROVIDER = 'volc';
// 确保不读到任何真实火山合规凭证 / 不走系统代理
delete process.env.VOLC_COMPLIANCE_ACCESS_KEY_ID;
delete process.env.VOLC_COMPLIANCE_SECRET_ACCESS_KEY;
['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy'].forEach((k) => delete process.env[k]);

const config = require('../config');
const db = require('../db');
const { signToken } = require('../middleware/auth');
const idVerifyFacade = require('../services/providers/idVerify');
const faceFacade = require('../services/providers/faceVerify');
const moderationFacade = require('../services/providers/moderation');
const volcClient = require('../services/providers/volc/volcClient');
const volcFace = require('../services/providers/volc/faceVerify');
const volcId = require('../services/providers/volc/idVerify');
const volcMod = require('../services/providers/volc/moderation');
const aliyunId = require('../services/providers/aliyun/idVerify');
const aliyunFace = require('../services/providers/aliyun/faceVerify');
const aliyunMod = require('../services/providers/aliyun/moderation');
const cryptoUtil = require('../utils/crypto');

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log('  ✗ FAIL: ' + m); } }

// ---------- mock 火山 visual(cv) HTTP：场景由请求体 idcard_name 选择，同时捕获 V4 签名头 ----------
const lastSig = { authorization: '', xDate: '', xSha: '', action: '', reqKey: '', image: '' };
const mockServer = http.createServer((req, res) => {
  let chunks = '';
  req.on('data', (d) => { chunks += d; });
  req.on('end', () => {
    lastSig.authorization = req.headers['authorization'] || '';
    lastSig.xDate = req.headers['x-date'] || '';
    lastSig.xSha = req.headers['x-content-sha256'] || '';
    const url = new URL(req.url, 'http://localhost');
    lastSig.action = url.searchParams.get('Action') || '';
    let body = {};
    try { body = JSON.parse(chunks || '{}'); } catch { body = {}; }
    lastSig.reqKey = body.req_key || '';
    lastSig.image = body.image || '';
    const name = String(body.idcard_name || '');

    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const base = (extra) => ({ code: 10000, status: 10000, message: 'Success', request_id: 'mock-req-id', ...extra });

    if (name.includes('姓名不符')) {
      return send(200, base({ data: { result: false, source_comp_details: { score: 0 }, byted_token: '' }, algorithm_base_resp: { status_code: 210207, message: 'name and idcard not match' } }));
    }
    if (name.includes('人脸不符')) {
      return send(200, base({ data: { result: false, source_comp_details: { score: 0.000002 }, byted_token: '' }, algorithm_base_resp: { status_code: 210311, message: 'face not match' } }));
    }
    if (name.includes('处理中')) {
      return send(200, base({ data: {}, algorithm_base_resp: { status_code: 0, message: 'success' } }));
    }
    if (name.includes('坏响应')) {
      return send(500, { code: 50000, status: 50000, message: 'mock internal error', data: null });
    }
    if (name.includes('低分')) {
      return send(200, base({ data: { result: true, source_comp_details: { score: 0.0000001 }, byted_token: 'tok-low' }, algorithm_base_resp: { status_code: 0 } }));
    }
    // 默认：有源人脸通过
    return send(200, base({
      data: { result: true, source_comp_details: { score: 0.9123, thresholds: { '1e-4': 0.0001 } }, byted_token: 'MOCK_BYTED_TOKEN', req_measure_info: { value: 1 } },
      algorithm_base_resp: { status_code: 0, message: 'success' },
    }));
  });
});

const app = require('../app'); // 起服务于 3199
const BASE = 'http://127.0.0.1:3199';
async function api(p, method, body, token) {
  const r = await fetch(BASE + p, {
    method: method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null; try { j = await r.json(); } catch { }
  return { status: r.status, body: j };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // 起 mock 火山 server
  await new Promise((resolve) => mockServer.listen(31991, '127.0.0.1', resolve));
  const mockPort = mockServer.address().port;
  // 等业务服务起来
  for (let i = 0; i < 40; i++) { try { const h = await fetch(BASE + '/api/health'); if (h.ok) break; } catch { } await sleep(100); }

  const u = db.prepare("INSERT INTO users (nickname,phone,role,status,is_auth,is_talent) VALUES ('火山自测','13900000001','user','active',0,0)").run();
  const userId = u.lastInsertRowid;
  const token = signToken({ userId, role: 'user' });
  const h = db.prepare("INSERT INTO humans (user_id,name,status) VALUES (?,'自测数字人','active')").run(userId);
  const humanId = h.lastInsertRowid;

  // ============ A. 缺合规凭证：安全降级（不崩、不误判通过、不伪造） ============
  console.log('\n== A. 缺凭证安全降级 ==');
  ok(idVerifyFacade.providerName() === 'volc', 'A0 默认 provider 应为 volc，实际=' + idVerifyFacade.providerName());
  ok(volcClient.ready() === false, 'A1 缺 AK/SK volcClient.ready=false');
  ok(volcClient.rmsReady() === false, 'A2 缺 rms 配置 rmsReady=false');
  ok(idVerifyFacade.ready() === false, 'A3 二要素 facade ready=false');
  ok(faceFacade.ready() === false, 'A4 人脸 facade ready=false');
  ok(moderationFacade.cloudConfigured() === false, 'A5 云机审 cloudConfigured=false');

  const elem = await idVerifyFacade.verifyElement({ name: 'x', idNo: '11010119900307123X' });
  ok(elem.ready === false && elem.passed === null, 'A6 二要素未就绪必须 passed=null（不伪造一致），实际=' + JSON.stringify(elem));
  const fInit = await faceFacade.initVerify({ name: 'x', idNo: '11010119900307123X', facePictureBase64: 'AAAA' });
  ok(fInit.ready === false && !fInit.certifyId, 'A7 人脸未就绪 init 不发流水号');

  const tPol = await moderationFacade.moderateText('法轮功台独色情诈骗广告');
  ok(tPol.decision === 'reject', 'A8 涉政涉黄涉诈本地词库应 reject，实际=' + tPol.decision);
  const tOk = await moderationFacade.moderateText('祝你生日快乐身体健康');
  ok(tOk.decision === 'pass', 'A9 正常文本应 pass，实际=' + tOk.decision);
  const img = await moderationFacade.moderateImage({ url: 'http://x/a.jpg' });
  ok(img.decision === 'review' && img.needsHuman === true, 'A10 图片 rms 未就绪应转人工，实际=' + img.decision);
  const vid = await moderationFacade.moderateVideo({ url: 'http://x/a.mp4' });
  ok(vid.decision === 'review' && vid.needsHuman === true, 'A11 视频 rms 异步未就绪应转人工，实际=' + vid.decision);

  // 实名：rms 未就绪 → 维持现状自动通过但显式标注 unverified_auto，身份证 AES 加密
  const idResp = await api('/api/identity/submit', 'POST', { identityType: 'personal', realName: '本人通过', idCard: '11010119900307123X' }, token);
  ok(idResp.status === 200 && idResp.body.status === 'approved' && idResp.body.verifiedBy === 'unverified_auto',
    'A12 rms 未就绪实名应 approved/unverified_auto，实际=' + JSON.stringify(idResp.body));
  const row = db.prepare('SELECT id_card FROM user_identities WHERE user_id=?').get(userId);
  ok(row.id_card && row.id_card !== '11010119900307123X' && (row.id_card.match(/:/g) || []).length === 2, 'A13 身份证必须 AES-256-GCM 加密落库');
  ok(cryptoUtil.decrypt(row.id_card) === '11010119900307123X', 'A14 身份证密文可解密还原');
  const badFmt = await api('/api/identity/submit', 'POST', { identityType: 'personal', realName: '李四', idCard: '123' }, token);
  ok(badFmt.status === 400, 'A15 非法身份证号应 400，实际=' + badFmt.status);

  // 非生产缺云：演示签署（长流水号过、短号400）；未接云 face init 503
  const signDemo = await api('/api/compliance/sign', 'POST', { humanId, scope: 'display', livenessTxnId: 'DEMO123456' }, token);
  ok(signDemo.status === 200, 'A16 非生产演示签署应 200，实际=' + signDemo.status);
  const signShort = await api('/api/compliance/sign', 'POST', { humanId, scope: 'video', livenessTxnId: 'x' }, token);
  ok(signShort.status === 400, 'A17 短流水号演示应 400，实际=' + signShort.status);
  const fv503 = await api('/api/face-verify/init', 'POST', { humanId, facePictureBase64: 'AAAA' }, token);
  ok(fv503.status === 503, 'A18 未接云人脸 init 应 503，实际=' + fv503.status);

  // ============ B. 注入 dummy 凭证 + 指向 mock 火山，走真实 V4 签名 HTTP ============
  console.log('\n== B. mock 火山 V4 HTTP（人脸/rms/机审） ==');
  config.volcCompliance.accessKeyId = 'AKDUMMYNOTREAL0000000000';
  config.volcCompliance.secretAccessKey = 'c2tE1b21a5r1bW9kZHVtbXlza3RoYXRpc25vdHJlYWw='; // 60 位内 dummy，仅本地 mock 验签用
  config.volcCompliance.visual.host = `127.0.0.1:${mockPort}`;
  config.volcCompliance.visual.protocol = 'http:';
  volcClient._reset();
  volcFace._resetCache();

  ok(volcClient.ready() === true, 'B1 注入 dummy 凭证后 volcClient.ready=true');
  ok(faceFacade.ready() === true, 'B2 visual 人脸只依赖 AK/SK，应 ready=true（无需 rms AppID）');

  // B-人脸：有源通过（真实签名 HTTP → mock）
  const iPass = await volcFace.initVerify({ name: '本人通过', idNo: '11010119900307123X', facePictureBase64: 'data:image/jpeg;base64,QUJDREVGRw==' });
  ok(!!iPass.certifyId && iPass.passed === true, 'B3 有源人脸通过应发流水号且 passed=true，实际=' + JSON.stringify({ c: !!iPass.certifyId, p: iPass.passed }));
  ok(lastSig.authorization.startsWith('HMAC-SHA256 Credential=') && lastSig.authorization.includes('/cv/request') && lastSig.authorization.includes('SignedHeaders=') && lastSig.authorization.includes('Signature='),
    'B4 mock 应收到火山 V4 签名头(HMAC-SHA256/Credential/cv/request/SignedHeaders/Signature)，实际=' + lastSig.authorization.slice(0, 48));
  ok(!!lastSig.xDate && /^\d{8}T\d{6}Z$/.test(lastSig.xDate) && lastSig.xSha.length === 64, 'B5 应有 X-Date 与 X-Content-Sha256(64hex)');
  ok(lastSig.action === 'CertSrcFaceComp' && lastSig.reqKey === 'cert_src_face_comp', 'B6 Action/req_key 正确：' + lastSig.action + '/' + lastSig.reqKey);
  ok(iPass.bytedToken === 'MOCK_BYTED_TOKEN', 'B7 应解析 byted_token');
  const dPass = await volcFace.describeVerify(iPass.certifyId);
  ok(dPass.passed === true && dPass.score === 0.9123 && dPass.threshold === 0.0001, 'B8 describe 取回通过结论与分值，实际=' + JSON.stringify({ p: dPass.passed, s: dPass.score }));
  // 上送 image 必须是纯 base64（data URL mime 前缀已被剥离）
  ok(lastSig.image === 'QUJDREVGRw==' && !lastSig.image.startsWith('data:'), 'B9 上送 image 应已剥离 data URL mime 前缀，实际=' + lastSig.image);

  // 210207 姓名身份证不符
  const i207 = await volcFace.initVerify({ name: '测试姓名不符', idNo: '11010119900307999X', facePictureBase64: 'AAAA' });
  ok(i207.passed === false && i207.subCode === 210207, 'B10 210207 姓名身份证不符应 passed=false，实际=' + JSON.stringify({ p: i207.passed, s: i207.subCode }));
  const d207 = await volcFace.describeVerify(i207.certifyId);
  ok(d207.passed === false && d207.subCode === 210207, 'B11 describe 210207 仍为不通过');

  // 210311 人脸不符
  const i311 = await volcFace.initVerify({ name: '测试人脸不符', idNo: '11010119900307123X', facePictureBase64: 'AAAA' });
  ok(i311.passed === false && i311.subCode === 210311, 'B12 210311 人脸不符应 passed=false，实际=' + JSON.stringify({ p: i311.passed, s: i311.subCode }));

  // 处理中 null
  const iProc = await volcFace.initVerify({ name: '测试处理中', idNo: '11010119900307123X', facePictureBase64: 'AAAA' });
  ok(iProc.passed === null, 'B13 处理中应 passed=null（非不通过），实际=' + iProc.passed);
  const dProc = await volcFace.describeVerify(iProc.certifyId);
  ok(dProc.passed === null && dProc.processing === true, 'B14 describe 处理中 processing=true');
  const dUnknown = await volcFace.describeVerify('VFC_NOT_EXIST_9999');
  ok(dUnknown.passed === null && dUnknown.processing === true, 'B15 未知流水号应 passed=null（不放行）');

  // 低分不过（result=true 但 score<1e-4）
  const iLow = await volcFace.initVerify({ name: '测试低分', idNo: '11010119900307123X', facePictureBase64: 'AAAA' });
  ok(iLow.passed === false, 'B16 相似度低于 1e-4 阈值应不通过，实际=' + iLow.passed);

  // 坏响应 fail-closed
  const iBad = await volcFace.initVerify({ name: '测试坏响应', idNo: '11010119900307123X', facePictureBase64: 'AAAA' });
  ok(iBad.passed === null && iBad.passed !== true, 'B17 坏响应必须 fail-closed（passed=null 绝不通过），实际=' + iBad.passed);
  ok(volcFace.parseFaceResp('garbage').passed === null && volcFace.parseFaceResp({}).passed === null, 'B18 非对象/空对象响应 passed=null');

  // B-rms 二要素：三态判定策略（不涉及线上字段名，线上字段待调研喂入）
  ok(volcId.decideElementVerdict({ concluded: true, matched: true }) === true, 'B19 二要素一致策略→true');
  ok(volcId.decideElementVerdict({ concluded: true, matched: false }) === false, 'B20 二要素不一致策略→false');
  ok(volcId.decideElementVerdict({ concluded: false }) === null && volcId.decideElementVerdict({}) === null && volcId.decideElementVerdict({ concluded: true }) === null,
    'B21 未结论/缺 matched 必须 null（不臆断）');
  // rms 门控：仅有 AK/SK，缺 host/AppID/bizType → 仍 not ready，绝不发起、绝不通过
  ok(volcId.ready() === false, 'B22 缺 rms host/AppID/bizType 二要素 ready=false');
  config.volcCompliance.rms.host = `127.0.0.1:${mockPort}`;
  config.volcCompliance.rms.appId = 'APP_DUMMY';
  volcClient._reset();
  ok(volcClient.rmsReady() === true && volcId.ready() === false, 'B23 有 host+AppID 但缺二要素 bizType，idVerify 仍 not ready');
  config.volcCompliance.rms.idVerifyBizType = 'BIZ_DUMMY';
  ok(volcId.ready() === true, 'B24 host+AppID+bizType 齐后 ready=true（线上仍需调研补字段）');
  const elemPending = await volcId.verifyElement({ name: '张三', idNo: '11010119900307123X' });
  ok(elemPending.passed === null, 'B25 字段未调研前即使 ready 也只能 passed=null（绝不臆造一致），实际=' + elemPending.passed);
  // 复位 rms（保持待审批缺省）
  config.volcCompliance.rms.host = ''; config.volcCompliance.rms.appId = ''; config.volcCompliance.rms.idVerifyBizType = '';
  volcClient._reset();

  // B-机审：rms 未就绪时文本本地、图片视频人工；即便临时配了 textBizType，云字段未调研→null→回退本地
  const mPol = await volcMod.moderateText('涉政：法轮功 港独');
  ok(mPol.decision === 'reject', 'B26 文本涉政应拦截，实际=' + mPol.decision);
  const mSex = await volcMod.moderateText('色情裸聊加vx');
  ok(mSex.decision === 'reject', 'B27 文本涉黄/引流应拦截，实际=' + mSex.decision);
  const mClean = await volcMod.moderateText('今天天气很好适合散步');
  ok(mClean.decision === 'pass', 'B28 正常文本应放行，实际=' + mClean.decision);
  const mImg = await volcMod.moderateImage({ url: 'http://x/a.jpg' });
  ok(mImg.decision === 'review', 'B29 图片应转人工，实际=' + mImg.decision);
  const mVid = await volcMod.moderateVideo({ url: 'http://x/a.mp4' });
  ok(mVid.decision === 'review', 'B30 视频应异步转人工，实际=' + mVid.decision);
  ok(volcFace.stripMimePrefix('data:image/png;base64,QUJD') === 'QUJD' && volcFace.stripMimePrefix('QUJD') === 'QUJD', 'B31 stripMimePrefix 去 mime 前缀且纯 base64 不变');

  // ============ C. provider 切换 + HTTP 端到端 ============
  console.log('\n== C. provider 切换 / HTTP 端到端 / 红线 ==');
  // facade 可切回阿里云备用实现，再切回火山
  config.compliance.provider = 'aliyun';
  ok(idVerifyFacade.active() === aliyunId && faceFacade.active() === aliyunFace && moderationFacade.active() === aliyunMod, 'C1 切 aliyun 应指向 V12.5 备用实现');
  ok(idVerifyFacade.providerName() === 'aliyun', 'C2 providerName=aliyun');
  config.compliance.provider = 'volc';
  ok(idVerifyFacade.active() !== aliyunId && faceFacade.active() !== aliyunFace, 'C3 切回 volc 应指向火山实现');
  ok(idVerifyFacade.providerName() === 'volc', 'C4 providerName=volc');

  // HTTP 端到端：人脸通过（mock）→ result true → /sign 200
  const initHttp = await api('/api/face-verify/init', 'POST', { humanId, facePictureBase64: 'AAAA' }, token);
  ok(initHttp.status === 200 && !!initHttp.body.certifyId, 'C5 HTTP face init 应 200+certifyId，实际=' + initHttp.status + ' ' + JSON.stringify(initHttp.body));
  const resHttp = await api('/api/face-verify/result/' + initHttp.body.certifyId, 'GET', null, token);
  ok(resHttp.body.passed === true, 'C6 HTTP result 应 passed=true，实际=' + JSON.stringify(resHttp.body));
  const sign200 = await api('/api/compliance/sign', 'POST', { humanId, scope: 'endorsement', livenessTxnId: initHttp.body.certifyId }, token);
  ok(sign200.status === 200, 'C7 人脸通过服务端复验后 /sign 应 200，实际=' + sign200.status + ' ' + JSON.stringify(sign200.body));

  // /sign 403：种子一条“人脸不通过”结论（等价 init 命中 210311 后缓存）
  volcFace._seedVerdict('VFC_FALSE_403', { passed: false, score: 0.000002, threshold: 0.0001, subCode: 210311, bytedToken: '' });
  const sign403 = await api('/api/compliance/sign', 'POST', { humanId, scope: 'film', livenessTxnId: 'VFC_FALSE_403' }, token);
  ok(sign403.status === 403, 'C8 人脸不通过 /sign 应 403，实际=' + sign403.status);
  // /sign 409：未知/处理中流水号
  const sign409 = await api('/api/compliance/sign', 'POST', { humanId, scope: 'video', livenessTxnId: 'VFC_NULL_409' }, token);
  ok(sign409.status === 409, 'C9 处理中(null) /sign 应 409，实际=' + sign409.status);

  // 生产红线：production 且人脸未就绪 → 501
  const savedAk = config.volcCompliance.accessKeyId, savedSk = config.volcCompliance.secretAccessKey, savedEnv = config.env;
  config.volcCompliance.accessKeyId = ''; config.volcCompliance.secretAccessKey = ''; config.env = 'production';
  volcClient._reset();
  const sign501 = await api('/api/compliance/sign', 'POST', { humanId, scope: 'video', livenessTxnId: 'WHATEVER123' }, token);
  ok(sign501.status === 501, 'C10 生产缺核身能力 /sign 必须 501 红线，实际=' + sign501.status);
  // 复原
  config.volcCompliance.accessKeyId = savedAk; config.volcCompliance.secretAccessKey = savedSk; config.env = savedEnv;
  volcClient._reset();

  // 人审流转：rms 未就绪时视频/图片统一转人工，已由 B29/B30 与 A10/A11 覆盖；review 提交落库路径与阿里云自测同构、不重复造数。

  console.log('\n========================================');
  console.log(`RESULT: PASS=${pass}  FAIL=${fail}  TOTAL=${pass + fail}`);
  mockServer.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('SELFTEST CRASH:', e); try { mockServer.close(); } catch { } process.exit(2); });
