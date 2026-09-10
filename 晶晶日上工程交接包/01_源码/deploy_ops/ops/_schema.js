const fs = require('fs');
const f = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/server/server/migrations/001_initial.js';
let t = fs.readFileSync(f, 'utf8');
const targets = ['user_identities','face_materials','content_reviews','authorization_agreements','humans'];
// 按 CREATE TABLE 块切
const re = /CREATE TABLE[^;]*;/gis;
let m;
while ((m = re.exec(t))) {
  const block = m[0];
  if (targets.some(x => block.includes(x))) {
    console.log('--------------------------------------------------');
    // 去掉中文注释行避免控制台乱码，仅保留结构
    console.log(block.split('\n').filter(l => !/^\s*--/.test(l)).join('\n'));
  }
}
