// scripts/volc_visual_face_neg_live.js
// 火山 visual 人脸核身（CertSrcFaceComp）【真实负向联调 · 一次性 · 仅本地开发自测，不上线】。
// 安全约束：
//  - 凭证只从 secrets/volc/compliance.env 读入并注入【本进程】process.env，绝不打印、不写日志、不入库、不回显；
//  - 必须使用【明显虚构】的姓名 + 身份证号（禁止任何真实他人公民信息）；
//  - 预期命中 algorithm_base_resp.status_code=210207（姓名身份证不匹配）即证明 V4 签名与链路已通；
//  - 输出全部脱敏：只给业务码/是否通过/请求号前 6 位/是否含 byted_token，不含密钥、不含完整证件号、不含人脸图。
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// 1) 从 secrets 文件注入 env（不打印内容）
const envFile = path.join(__dirname, '..', 'secrets', 'volc', 'compliance.env');
if (!fs.existsSync(envFile)) {
  console.error('[LIVE] 未找到 secrets/volc/compliance.env，跳过真实联调（不影响 mock 自测）');
  process.exit(3);
}
const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
for (const line of lines) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let val = m[2].trim().replace(/^['"]|['"]$/g, '');
  if (m[1] === 'VOLC_COMPLIANCE_ACCESS_KEY_ID' || m[1] === 'VOLC_COMPLIANCE_SECRET_ACCESS_KEY' || m[1] === 'VOLC_COMPLIANCE_REGION') {
    process.env[m[1]] = val;
  }
}
if (!process.env.VOLC_COMPLIANCE_ACCESS_KEY_ID || !process.env.VOLC_COMPLIANCE_SECRET_ACCESS_KEY) {
  console.error('[LIVE] compliance.env 中缺少 VOLC_COMPLIANCE_ACCESS_KEY_ID/SECRET_ACCESS_KEY');
  process.exit(3);
}

// 2) 生成一张合法的 120x120 灰度 PNG（纯色块，非任何真实人脸；只为通过图片格式解析以触达姓名/身份证权威校验）
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function makeGrayPng(size = 120) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const row = Buffer.alloc(size, 128);
  const raw = Buffer.concat(Array.from({ length: size }, () => Buffer.concat([Buffer.from([0]), row])));
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

async function fetchSyntheticFaceBase64() {
  // 公版/已授权的正面人像样照（randomuser 模特素材，非任何真实公民身份信息），仅用于通过“是否含人脸”的前置检测，
  // 以触达姓名/身份证权威比对；姓名与身份证号仍为明显虚构，预期返回 210207。绝不用真实他人证件照。
  const urls = [
    'https://randomuser.me/api/portraits/women/68.jpg',
    'https://randomuser.me/api/portraits/men/32.jpg',
    'https://randomuser.me/api/portraits/women/44.jpg',
  ];
  for (const u of urls) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const resp = await fetch(u, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compliance-selftest)', 'Accept': 'image/jpeg' } });
      clearTimeout(timer);
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer());
        // 必须是真 JPEG（魔数 ffd8ff）且体积合理，避免把 HTML 拦截页当图片
        if (buf.length > 3000 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
          console.log('[LIVE] 已获取人像样图 %s 字节（JPEG，模特素材，非真实公民信息）', buf.length);
          return buf.toString('base64');
        }
        console.log('[LIVE] %s 返回非 JPEG（len=%s magic=%s），跳过', u, buf.length, buf.slice(0, 3).toString('hex'));
      }
    } catch (e) { console.log('[LIVE] 人像源不可用(%s)：%s，尝试下一源', u, e && e.name); }
  }
  return '';
}

// 生成一个【格式合法（GB11643 校验位正确）但内容虚构】的 18 位身份证号：
// 合法的行政区划码+出生日期+顺序码，仅为通过“号码格式校验(210202)”以触达“姓名/身份证权威比对”；
// 顺序码随机、姓名明显虚构，因此权威比对必然返回 210207 姓名身份证不匹配（不对应任何真实公民）。
function buildFictionalWellFormedId(prefix17) {
  const w = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const map = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += Number(prefix17[i]) * w[i];
  return prefix17 + map[sum % 11];
}

(async () => {
  const config = require('../config');
  const volcFace = require('../services/providers/volc/faceVerify');
  const volcClient = require('../services/providers/volc/volcClient');

  const cred = volcClient.credentials();
  // 只回布尔与长度，绝不回传内容
  console.log('[LIVE] 凭证注入: enabled=%s hasAk=%s(akLen=%s) hasSk=%s(skLen=%s) region=%s',
    cred.enabled, cred.hasAk, (process.env.VOLC_COMPLIANCE_ACCESS_KEY_ID || '').length,
    cred.hasSk, (process.env.VOLC_COMPLIANCE_SECRET_ACCESS_KEY || '').length, config.volcCompliance.region);
  console.log('[LIVE] visual endpoint=%s service=%s action=%s version=%s',
    config.volcCompliance.visual.host, config.volcCompliance.visual.service,
    config.volcCompliance.visual.action, config.volcCompliance.visual.version);
  if (!volcFace.ready()) { console.error('[LIVE] faceVerify 未就绪，终止'); process.exit(4); }

  // 3) 明显虚构的姓名 + 格式合法但内容虚构的身份证号；图片用已授权模特样照，失败回退纯色 PNG
  const faceB64 = await fetchSyntheticFaceBase64() || makeGrayPng(120);
  const fictionalId = buildFictionalWellFormedId('11010119900307666');
  const fictional = { name: '虚构测试人物甲', idNo: fictionalId, facePictureBase64: faceB64 };
  console.log('[LIVE] 虚构证件号校验位已构造（脱敏：%s********%s，长度%s）', fictionalId.slice(0, 6), fictionalId.slice(-1), fictionalId.length);
  const t0 = Date.now();
  const r = await volcFace.initVerify(fictional);
  const cost = Date.now() - t0;

  // 4) 脱敏输出
  const masked = {
    costMs: cost,
    gotCertifyId: !!r.certifyId,
    passed: r.passed,                 // 预期 false（姓名身份证不匹配）
    subCode: r.subCode,
    error: r.error,
    bytedTokenPresent: !!r.bytedToken,
  };
  console.log('[LIVE] 脱敏结果=' + JSON.stringify(masked));

  const code = Number(r.subCode);
  if (code === 210207) {
    console.log('[LIVE][PASS] 链路已通：V4 签名被接受，权威校验返回 210207 姓名身份证不匹配（符合预期负向）。');
    process.exit(0);
  }
  if (r.passed === false) {
    console.log('[LIVE][PASS] 链路已通：返回明确不通过子码 %s（负向成立，非 210207 但同为业务拒绝）。', code || 'n/a');
    process.exit(0);
  }
  if (r.passed === null && /signature|auth|access.?key|sign/i.test(String(r.error))) {
    console.error('[LIVE][FAIL] 疑似签名/鉴权未通过：' + r.error);
    process.exit(5);
  }
  console.log('[LIVE][WARN] 返回非预期形态（passed=%s subCode=%s error=%s），需人工判读是否链路问题。', r.passed, r.subCode, r.error);
  process.exit(6);
})().catch((e) => {
  // 异常信息也可能含 URL，但不会含 SK；为稳妥只打 message/name
  console.error('[LIVE][ERROR]', e && e.name, e && e.message);
  process.exit(7);
});
