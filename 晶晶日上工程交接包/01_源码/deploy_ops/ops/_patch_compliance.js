const fs = require('fs');
const f = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/server/server/routes/compliance.js';
let t = fs.readFileSync(f, 'utf8');
const crlf = t.includes('\r\n');
const NL = crlf ? '\r\n' : '\n';
const norm = s => s.split('\n').join(NL);
let changed = [];

// 1) 增加 require
if (!t.includes("require('../services/providers/faceVerify')")) {
  const reA = /(const \{ auth \} = require\('\.\.\/middleware\/auth'\);\r?\n)/;
  const addA = "$1const faceVerify = require('../services/providers/faceVerify');" + NL +
    "const logger = require('../utils/logger');" + NL;
  if (reA.test(t)) { t = t.replace(reA, addA); changed.push('require'); }
}

// 2) 替换 sign 内核身块
const reB = new RegExp(
  "  if \\(config\\.env === 'production'\\) \\{\\r?\\n" +
  "    return res\\.status\\(501\\)\\.json\\(\\{ error: '活体检测服务端验证尚未实现，禁止在生产环境签署授权' \\}\\);\\r?\\n" +
  "  \\}\\r?\\n" +
  "  // 开发/测试环境：校验活水流号格式\\r?\\n" +
  "  if \\(!livenessTxnId \\|\\| livenessTxnId\\.length < 8\\) \\{\\r?\\n" +
  "    return res\\.status\\(400\\)\\.json\\(\\{ error: '请先完成活体检测' \\}\\);\\r?\\n" +
  "  \\}\\r?\\n"
);
const newB = norm(
`  // 人脸核身服务端复验（合规关键：只信阿里云结论，不信任客户端回传；livenessTxnId 即 certifyId）
  if (faceVerify.ready()) {
    const vr = await faceVerify.describeVerify(livenessTxnId);
    if (vr.passed === false) {
      return res.status(403).json({ error: '人脸核身未通过，请重新完成本人验证', subCode: vr.subCode || '' });
    }
    if (vr.passed === null) {
      return res.status(409).json({ error: '暂未获取到有效的人脸核身结论，请重新完成核身后再签署' });
    }
    logger.info('face_verify_sign_pass', { userId: req.userId, humanId, score: vr.score, subCode: vr.subCode || '' });
  } else if (config.env === 'production') {
    // 生产环境但未配置人脸核身能力：安全红线，禁止签署
    return res.status(501).json({ error: '人脸核身服务尚未配置，禁止在生产环境签署授权' });
  } else if (!livenessTxnId || livenessTxnId.length < 8) {
    // 开发/测试环境且未接云：仅校验流水号格式（演示）
    return res.status(400).json({ error: '请先完成活体检测' });
  }
`);
if (reB.test(t)) { t = t.replace(reB, newB); changed.push('sign-block'); }

fs.writeFileSync(f, t, 'utf8');
console.log('CRLF=' + crlf, 'changed=', changed.join(','), 'len=', t.length);
