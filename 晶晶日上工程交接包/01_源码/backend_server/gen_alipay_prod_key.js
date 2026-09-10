// 生成支付宝开放平台「公钥模式」RSA2(2048) 密钥对（正式应用）
// 应用私钥 = 仅留存本机/服务器，绝不回显、绝不进前端；应用公钥 = 粘贴到开放平台
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'secrets', 'alipay', 'prod');
fs.mkdirSync(dir, { recursive: true });
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const oneline = (pem) =>
  pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
fs.writeFileSync(path.join(dir, 'app_private_key.pem'), privateKey, { mode: 0o600 });
fs.writeFileSync(path.join(dir, 'app_private_key_oneline.txt'), oneline(privateKey));
fs.writeFileSync(path.join(dir, 'app_public_key.txt'), oneline(publicKey));
// .gitignore 兜底，防止密钥入库
fs.writeFileSync(path.join(__dirname, 'secrets', '.gitignore'), '*\n', { flag: 'w' });
console.log('KEY_DIR=' + dir);
console.log('PUBLIC_KEY_ONELINE_START');
console.log(oneline(publicKey));
console.log('PUBLIC_KEY_ONELINE_END');
console.log('privLen=' + oneline(privateKey).length + ' pubLen=' + oneline(publicKey).length);
