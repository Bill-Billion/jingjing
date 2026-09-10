// scripts/gen_alipay_rsa_keypair.js
// 跨平台生成支付宝开放平台「公钥模式」所需 RSA2 密钥对（Windows 无 openssl 也可用）。
// 用法：
//   node scripts/gen_alipay_rsa_keypair.js [输出目录，默认 ./certs]
// 产物：
//   app_private_pkcs8.pem   应用私钥（PKCS8，填到 .env 的 ALIPAY_PRIVATE_KEY 或 ALIPAY_PRIVATE_KEY_PATH）
//   alipay_public.pem       支付宝公钥占位（注意：最终要填的是【支付宝平台】生成后回传的公钥，不是你自己的公钥）
//   app_public.pem          应用公钥（上传到开放平台「接口加签方式→公钥」后，平台据此回传支付宝公钥）
// 说明：
//   - RSA2 = SHA256withRSA，密钥长度 2048；
//   - 应用私钥务必只存在服务器 .env/certs，绝不进 git、APP、前端；
//   - 上传 app_public.pem 内容到开放平台后，把平台显示的「支付宝公钥」贴回 alipay_public.pem（或 ALIPAY_PUBLIC_KEY）。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const outDir = path.resolve(process.argv[2] || './certs');
fs.mkdirSync(outDir, { recursive: true });

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const privPath = path.join(outDir, 'app_private_pkcs8.pem');
const appPubPath = path.join(outDir, 'app_public.pem');
fs.writeFileSync(privPath, privateKey, { mode: 0o600 });
fs.writeFileSync(appPubPath, publicKey);

// 单行 base64（方便直接粘到开放平台文本框 / .env 内联）
const oneLine = (pem) => pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
console.log('已生成:');
console.log('  应用私钥(PKCS8 PEM):', privPath);
console.log('  应用公钥(上传开放平台):', appPubPath);
console.log('\n--- 应用公钥单行（复制到开放平台「接口加签方式→自定义公钥」）---');
console.log(oneLine(publicKey));
console.log('\n下一步：开放平台保存应用公钥后，复制平台给出的【支付宝公钥】，');
console.log('填入 .env 的 ALIPAY_PUBLIC_KEY（或写入 ./certs/alipay_public.pem 并配 ALIPAY_PUBLIC_KEY_PATH）。');
