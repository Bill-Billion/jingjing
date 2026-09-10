// scripts/aliyun_compliance_selftest.js
// 阿里云实人认证/人脸核身/内容机审 接入自测：
//  A. 缺 AK（降级）：provider ready=false、文本走本地词库、图片/视频转人工、实名维持现状、非生产演示签署、核身503
//  B. mock 云响应：二要素 T/F、人脸 init/describe(T/低分/处理中)、机审 labels 命中/干净、签署云端复验通过/拒绝、实名不一致拒绝
//  全程临时库 + 隔离端口，不触网、不写真实数据。
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDb = path.join(os.tmpdir(), 'aliyun_selftest_' + Date.now() + '.db');
process.env.SQLITE_PATH = tmpDb;
process.env.PORT = '3198';
process.env.NODE_ENV = 'development';
// V12.6 起合规默认 provider 切到火山；本脚本是阿里云 V12.5 备用实现的回归自测，显式钉住 aliyun（在 require config 之前）
process.env.COMPLIANCE_PROVIDER = 'aliyun';
// 确保不读到任何真实阿里云凭证
delete process.env.ALIYUN_ACCESS_KEY_ID; delete process.env.ALIYUN_ACCESS_KEY_SECRET;
delete process.env.MODERATION_API_KEY; delete process.env.MODERATION_API_SECRET;
delete process.env.CLOUDAUTH_ELEMENT_SCENE_ID; delete process.env.CLOUDAUTH_FACE_SCENE_ID;

const config = require('../config');
const db = require('../db');
const { signToken } = require('../middleware/auth');
const idVerify = require('../services/providers/idVerify');
const faceVerify = require('../services/providers/faceVerify');
const moderation = require('../services/providers/moderation');
const aliyunClient = require('../services/providers/aliyunClient');
const cryptoUtil = require('../utils/crypto');

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log('  ✗ FAIL: ' + m); } }

const app = require('../app'); // 起服务于 3198
const BASE = 'http://127.0.0.1:3198';
async function api(p, method, body, token) {
  const r = await fetch(BASE + p, {
    method: method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // 等服务起来
  for (let i = 0; i < 40; i++) { try { const h = await fetch(BASE + '/api/health'); if (h.ok) break; } catch {} await sleep(100); }

  const u = db.prepare("INSERT INTO users (nickname,phone,role,status,is_auth,is_talent) VALUES ('自测','13900000000','user','active',0,0)").run();
  const userId = u.lastInsertRowid;
  const token = signToken({ userId, role: 'user' });
  const h = db.prepare("INSERT INTO humans (user_id,name,status) VALUES (?,'自测数字人','active')").run(userId);
  const humanId = h.lastInsertRowid;

  console.log('\n== A. 缺凭证降级路径 ==');
  ok(idVerify.ready() === false, 'A1 二要素未配置应 ready=false');
  ok(faceVerify.ready() === false, 'A2 人脸核身未配置应 ready=false');
  ok(moderation.cloudConfigured() === false, 'A3 云机审未配置应 false');

  const tBad = await moderation.moderateText('加微信私聊交易刷单');
  ok(tBad.decision === 'reject' && tBad.provider === 'local', 'A4 本地敏感词应 reject，实际=' + tBad.decision);
  const tOk = await moderation.moderateText('祝你生日快乐身体健康');
  ok(tOk.decision === 'pass', 'A5 正常文本应 pass，实际=' + tOk.decision);
  const img = await moderation.moderateImage({ url: 'http://x/a.jpg' });
  ok(img.decision === 'review' && img.needsHuman === true, 'A6 图片云不可用应转人工，实际=' + img.decision);
  const vid = await moderation.moderateVideo({ url: 'http://x/a.mp4' });
  ok(vid.decision === 'review', 'A7 视频云不可用应转人工，实际=' + vid.decision);

  // 实名提交（缺云→维持现状自动通过 + 标注 + 身份证加密）
  const idResp = await api('/api/identity/submit', 'POST', { identityType: 'personal', realName: '张三', idCard: '11010119900307123X' }, token);
  ok(idResp.status === 200 && idResp.body.status === 'approved' && idResp.body.verifiedBy === 'unverified_auto',
    'A8 缺云个人实名应 approved/unverified_auto，实际=' + JSON.stringify(idResp.body));
  const row = db.prepare('SELECT id_card FROM user_identities WHERE user_id=?').get(userId);
  ok(row.id_card && row.id_card !== '11010119900307123X' && (row.id_card.match(/:/g) || []).length === 2,
    'A9 身份证号必须 AES 加密落库，实际=' + row.id_card);
  ok(cryptoUtil.decrypt(row.id_card) === '11010119900307123X', 'A10 身份证密文应可解密还原');
  const stResp = await api('/api/identity/status', 'GET', null, token);
  ok(stResp.status === 200 && !('idCard' in (stResp.body || {})) && stResp.body.realName === '张三', 'A11 status 不回传身份证号');
  const badFmt = await api('/api/identity/submit', 'POST', { identityType: 'personal', realName: '李四', idCard: '123' }, token);
  ok(badFmt.status === 400, 'A12 非法身份证号应 400，实际=' + badFmt.status);

  // 非生产缺云：授权签署演示（长流水号通过、短号400）
  const signOk = await api('/api/compliance/sign', 'POST', { humanId, scope: 'display', livenessTxnId: 'DEMO123456' }, token);
  ok(signOk.status === 200, 'A13 非生产演示签署应通过，实际=' + signOk.status + ' ' + JSON.stringify(signOk.body));
  const signBad = await api('/api/compliance/sign', 'POST', { humanId, scope: 'video', livenessTxnId: 'x' }, token);
  ok(signBad.status === 400, 'A14 短流水号演示应 400，实际=' + signBad.status);
  const fv503 = await api('/api/face-verify/init', 'POST', { humanId, facePictureUrl: 'http://x/f.jpg' }, token);
  ok(fv503.status === 503, 'A15 未配置核身 init 应 503，实际=' + fv503.status);

  console.log('\n== B. mock 阿里云响应 ==');
  // 注入 mock client + 场景ID
  config.aliyun.cloudauth.elementSceneId = 1001;
  config.aliyun.cloudauth.faceSceneId = 2002;
  config.aliyun.cloudauth.facePassScore = 80;
  let elemMode = 'T';
  const mockCA = {
    async elementSmartVerify() {
      return { body: { code: '200', requestId: 'r1', resultObject: { passed: elemMode, subCode: elemMode === 'T' ? '' : 'IDENTITY_NOT_MATCH' } } };
    },
    async initSmartVerify() { return { body: { code: '200', resultObject: { certifyId: 'CERT-' + Date.now() } } }; },
    async describeSmartVerify(req) {
      if (describeMode === 'T') return { body: { code: '200', resultObject: { passed: 'T', passedScore: 92.5, subCode: '' } } };
      if (describeMode === 'low') return { body: { code: '200', resultObject: { passed: 'T', passedScore: 40, subCode: '' } } };
      if (describeMode === 'F') return { body: { code: '200', resultObject: { passed: 'F', passedScore: 12, subCode: 'FACE_NOT_MATCH' } } };
      return { body: { code: '200', resultObject: {} } }; // 处理中
    },
  };
  let describeMode = 'T';
  let textLabels = '', textReason = '', imgLabels = '';
  const mockGR = {
    async textModeration() { return { body: { code: 200, requestId: 'g1', data: { labels: textLabels, reason: textReason } } }; },
    async imageModeration() { return { body: { code: 200, data: { labels: imgLabels, reason: imgLabels ? 'hit' : '' } } }; },
    async videoModeration() { return { body: { code: 200, data: { taskId: 'TASK9' } } }; },
  };
  aliyunClient.ready = () => true;
  aliyunClient.cloudauthClient = () => mockCA;
  aliyunClient.greenClient = () => mockGR;

  ok(idVerify.ready() && faceVerify.ready(), 'B1 mock 后 provider 应 ready');
  elemMode = 'T'; const eT = await idVerify.verifyElement({ name: '张三', idNo: '11010119900307123X' });
  ok(eT.passed === true, 'B2 二要素 T 应 passed=true');
  elemMode = 'F'; const eF = await idVerify.verifyElement({ name: '李四', idNo: '11010119900307123X' });
  ok(eF.passed === false, 'B3 二要素 F 应 passed=false');

  const init = await faceVerify.initVerify({ name: '张三', idNo: '11010119900307123X', facePictureUrl: 'http://x/f.jpg', userId: String(userId) });
  ok(!!init.certifyId, 'B4 init 应返回 certifyId');
  describeMode = 'T'; const dT = await faceVerify.describeVerify(init.certifyId);
  ok(dT.passed === true && dT.score === 92.5, 'B5 describe T/92.5 应通过，实际=' + JSON.stringify(dT));
  describeMode = 'low'; const dLow = await faceVerify.describeVerify(init.certifyId);
  ok(dLow.passed === false, 'B6 相似度低于阈值应不通过');
  describeMode = 'F'; const dF = await faceVerify.describeVerify(init.certifyId);
  ok(dF.passed === false, 'B7 passed=F 应不通过');
  describeMode = 'proc'; const dP = await faceVerify.describeVerify(init.certifyId);
  ok(dP.passed === null, 'B8 处理中应 passed=null');

  // 机审解析
  textLabels = ''; textReason = ''; const cT = await moderation.moderateText('正常内容');
  ok(cT.decision === 'pass' && cT.provider === 'aliyun', 'B9 云判干净应 pass，实际=' + cT.decision + '/' + cT.provider);
  textLabels = 'abuse'; const cR = await moderation.moderateText('违规');
  ok(cR.decision === 'reject', 'B10 云 labels 命中应 reject，实际=' + cR.decision);
  textLabels = ''; textReason = '';
  imgLabels = 'porn'; const cI = await moderation.moderateImage({ url: 'http://x/a.jpg' });
  ok(cI.decision === 'reject', 'B11 云图片命中应 reject，实际=' + cI.decision);
  imgLabels = ''; const cIok = await moderation.moderateImage({ url: 'http://x/a.jpg' });
  ok(cIok.decision === 'pass', 'B12 云图片干净应 pass，实际=' + cIok.decision);
  const cV = await moderation.moderateVideo({ url: 'http://x/a.mp4' });
  ok(cV.decision === 'review' && cV.taskId === 'TASK9', 'B13 视频异步应 review+taskId，实际=' + JSON.stringify(cV));

  // 云端复验下签署：T 通过
  describeMode = 'T';
  const signCloud = await api('/api/compliance/sign', 'POST', { humanId, scope: 'endorsement', livenessTxnId: 'CERT-CLOUD-T' }, token);
  ok(signCloud.status === 200, 'B14 云端核身通过应签署成功，实际=' + signCloud.status + ' ' + JSON.stringify(signCloud.body));
  // 云端复验 F → 403
  describeMode = 'F';
  const signCloudF = await api('/api/compliance/sign', 'POST', { humanId, scope: 'film', livenessTxnId: 'CERT-CLOUD-F' }, token);
  ok(signCloudF.status === 403, 'B15 云端核身不通过应 403，实际=' + signCloudF.status);
  // 云端处理中(null) → 409
  describeMode = 'proc';
  const signCloudP = await api('/api/compliance/sign', 'POST', { humanId, scope: 'video', livenessTxnId: 'CERT-CLOUD-P' }, token);
  ok(signCloudP.status === 409, 'B16 核身处理中应 409，实际=' + signCloudP.status);

  // 实名不一致 → rejected
  elemMode = 'F';
  const idRej = await api('/api/identity/submit', 'POST', { identityType: 'personal', realName: '假名字', idCard: '11010119900307123X' }, token);
  ok(idRej.body.status === 'rejected', 'B17 二要素不一致实名应 rejected，实际=' + JSON.stringify(idRej.body));
  elemMode = 'T';

  console.log('\n========================================');
  console.log(`RESULT: PASS=${pass}  FAIL=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('SELFTEST CRASH:', e); process.exit(2); });
