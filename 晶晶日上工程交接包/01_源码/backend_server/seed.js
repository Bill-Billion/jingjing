// seed.js - 填充测试数据（艺人、视频模板、项目、评价、场景模板）
const db = require('./db');

console.log('开始填充测试数据...');

// 清空旧数据（按依赖顺序）
db.exec(`
  DELETE FROM order_reviews;
  DELETE FROM video_templates;
  DELETE FROM authorization_agreements;
  DELETE FROM video_orders;
  DELETE FROM project_milestones;
  DELETE FROM project_roles;
  DELETE FROM projects;
  DELETE FROM scene_templates;
  DELETE FROM sample_library;
  DELETE FROM talent_deposits;
  DELETE FROM wallets;
  DELETE FROM humans;
  DELETE FROM users;
`);

// 创建测试用户
const userIds = [];
for (let i = 1; i <= 6; i++) {
  const r = db.prepare(`INSERT INTO users (phone, nickname, avatar, role, is_auth, is_talent, status, created_at)
    VALUES (?, ?, NULL, 'talent', 1, 1, 'active', datetime('now'))`).run(
    `1380000000${i}`, `艺人${i}`
  );
  userIds.push(r.lastInsertRowid);
  // 钱包
  db.prepare(`INSERT INTO wallets (user_id, balance, frozen, pending, total_income, total_withdrawn, id_verified, created_at)
    VALUES (?, 0, 0, 0, 0, 0, 1, datetime('now'))`).run(r.lastInsertRowid);
}

// 艺人数据（V10.1：全部真人写实风格，不使用动漫/二次元/3D卡通形象）
const humans = [
  { name: '苏婉儿', tags: '古风,温柔,汉服', style: '古风', specialty: '古装祝福、宫廷剧、古装逆袭', heat: 9850, sales: 326, price: 9900, province: '河南', city: '郑州市', district: '金水区', lat: 34.75, lng: 113.65, quality: 'S', verified: 'gold', avatar: '/uploads/avatars/avatar1.jpg' },
  { name: '凌零', tags: '现代,职场,干练', style: '现代', specialty: '商务祝福、品牌代言', heat: 8720, sales: 289, price: 19900, province: '浙江', city: '杭州市', district: '西湖区', lat: 30.27, lng: 120.15, quality: 'S', verified: 'gold', avatar: '/uploads/avatars/avatar2.jpg' },
  { name: '顾承宇', tags: '古装,历史,正剧', style: '古装', specialty: '历史正剧、古装史诗、男主戏', heat: 7650, sales: 178, price: 29900, province: '陕西', city: '西安市', district: '雁塔区', lat: 34.23, lng: 108.94, quality: 'A', verified: 'silver', avatar: '/uploads/avatars/avatar3.jpg' },
  { name: '萧云舟', tags: '动作,军旅,硬汉', style: '现代', specialty: '军旅谍战、动作悬疑、硬汉戏', heat: 6890, sales: 145, price: 9900, province: '江苏', city: '南京市', district: '玄武区', lat: 32.06, lng: 118.80, quality: 'A', verified: 'silver', avatar: '/uploads/avatars/avatar4.jpg' },
  { name: '林晚晴', tags: '青春,甜宠,都市', style: '现代', specialty: '青春校园、都市甜宠、生日祝福', heat: 5430, sales: 267, price: 9900, province: '上海', city: '上海市', district: '徐汇区', lat: 31.19, lng: 121.43, quality: 'B', verified: 'none', avatar: '/uploads/avatars/avatar5.jpg' },
  { name: '晶典艺人A', tags: '御姐,成熟,代言', style: '现代', specialty: '高端品牌代言、企业祝福', heat: 4320, sales: 89, price: 69900, province: '北京', city: '北京市', district: '朝阳区', lat: 39.92, lng: 116.44, quality: 'A', verified: 'gold', avatar: '/uploads/avatars/avatar6.jpg' },
];

const humanIds = [];
const insertHuman = db.prepare(`INSERT INTO humans
  (user_id, name, avatar, tags, style, specialty, province, city, district, lat, lng, price, service_fee, heat, sales, status, quality_grade, verified_level, level, films, schedule, subsidy_until, is_new_talent, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'active', ?, ?, '3', 0, 'available', datetime('now', '+90 days'), 0, datetime('now'))`);

humans.forEach((h, i) => {
  const r = insertHuman.run(
    userIds[i], h.name, h.avatar, h.tags, h.style, h.specialty,
    h.province, h.city, h.district, h.lat, h.lng, h.price,
    h.heat, h.sales, h.quality, h.verified
  );
  humanIds.push(r.lastInsertRowid);

  // 授权协议
  db.prepare(`INSERT INTO authorization_agreements (user_id, human_id, scope, status, signed_at, copyright_agreed, license_term_months)
    VALUES (?, ?, 'video', 'active', datetime('now'), 1, 36)`).run(userIds[i], r.lastInsertRowid);
  db.prepare(`INSERT INTO authorization_agreements (user_id, human_id, scope, status, signed_at, copyright_agreed, license_term_months)
    VALUES (?, ?, 'endorsement', 'active', datetime('now'), 1, 36)`).run(userIds[i], r.lastInsertRowid);
  if (i < 4) {
    db.prepare(`INSERT INTO authorization_agreements (user_id, human_id, scope, status, signed_at, copyright_agreed, license_term_months)
      VALUES (?, ?, 'film', 'active', datetime('now'), 1, 36)`).run(userIds[i], r.lastInsertRowid);
  }

  // 保证金记录（first_income模式）
  db.prepare(`INSERT INTO talent_deposits (user_id, human_id, required_amount, paid_amount, status, collection_mode, created_at)
    VALUES (?, ?, 50000, 0, 'pending', 'first_income', datetime('now'))`).run(userIds[i], r.lastInsertRowid);
});

// 视频模板（每个艺人3个档位）
const insertTemplate = db.prepare(`INSERT INTO video_templates
  (talent_id, title, category, duration, price, sold, description, status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'))`);

const templateData = [
  ['基础祝福', '祝福视频', 15, 9900, 156, '15秒以内，适合生日、节日祝福'],
  ['精品祝福', '祝福视频', 30, 29900, 98, '30秒精品祝福，可定制台词和场景'],
  ['豪华定制', '祝福视频', 60, 69900, 34, '60秒豪华定制，多场景切换，含品牌露出'],
];

humanIds.forEach((hid) => {
  templateData.forEach(t => {
    insertTemplate.run(hid, t[0], t[1], t[2], t[3], Math.floor(Math.random() * 100), t[4]);
  });
});

// 定制剧项目（V10.1：全部使用晶典自有IP；金额为"已定席制作费/目标制作预算"，非募资、非投资）
const projects = [
  { title: '黄帝史诗·天下合', intro: '上古炎黄合盟、涿鹿定鼎。你从部落少年一步步成长为定鼎天下的轩辕，做自己人生的主角。', type: '古装史诗', goal: 500000, raised: 328000, clients: 26, cover: '/uploads/banners/banner1.jpg' },
  { title: '少年龙武', intro: '平凡少年习武自强，为守护家人与城市一路逆袭，热血成长由你主演。', type: '热血成长', goal: 300000, raised: 189000, clients: 21, cover: '/uploads/banners/banner3.jpg' },
  { title: '边境暗影', intro: '边境缉毒行动暗流涌动，你带领行动组撕开毒网，悬疑动作大戏等你入局。', type: '悬疑短剧', goal: 800000, raised: 656000, clients: 34, cover: '/uploads/banners/banner2.jpg' },
];

// V10.1：状态统一 recruiting（业务代码只认该状态）；定制剧平台服务费5%
const insertProject = db.prepare(`INSERT INTO projects
  (title, cover, type, intro, goal_amount, raised_amount, client_count, status, talent_id, service_rate, start_date, end_date, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, 'recruiting', ?, 5, datetime('now'), datetime('now','+45 days'), datetime('now'))`);

const projectIds = [];
projects.forEach((p, i) => {
  const r = insertProject.run(p.title, p.cover, p.type, p.intro, p.goal, p.raised, p.clients, humanIds[i % humanIds.length]);
  projectIds.push(r.lastInsertRowid);
});

// 项目里程碑（V10.1：ratio 用小数，金额按各项目目标预算动态计算，节点名与 config 对齐）
const insertMilestone = db.prepare(`INSERT INTO project_milestones
  (project_id, name, ratio, amount, status) VALUES (?, ?, ?, ?, 'pending')`);

const milestones = [
  ['剧本审核', 0.20],
  ['开机', 0.25],
  ['粗剪审核', 0.25],
  ['成片交付', 0.30],
];

projectIds.forEach((pid, idx) => {
  const goal = projects[idx].goal;
  milestones.forEach(m => insertMilestone.run(pid, m[0], m[1], Math.floor(goal * m[1])));
});

// 项目角色（彩蛋档）
const insertRole = db.prepare(`INSERT INTO project_roles
  (project_id, name, price, rights, stock_total, stock_sold) VALUES (?, ?, ?, ?, ?, ?)`);

projectIds.forEach(pid => {
  // V10.1 去投资化：席位权益只描述内容交付物，不出现"出品人/份额/收益/票房"
  insertRole.run(pid, '彩蛋档', 100000, '片尾彩蛋出镜+成片数字人收藏', 100, Math.floor(Math.random() * 50));
  insertRole.run(pid, '配角', 200000, '有台词角色+片尾署名+成片片段', 30, Math.floor(Math.random() * 10));
  insertRole.run(pid, '主角', 500000, '主演出演+片尾主演署名+完整成片交付', 20, Math.floor(Math.random() * 6));
});

// 评价数据
const insertReview = db.prepare(`INSERT INTO order_reviews
  (order_no, order_type, user_id, talent_id, quality_rating, speed_rating, service_rating, accuracy_rating, overall_rating, content, status, created_at)
  VALUES (?, 'video', ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now', ?))`);

const reviewContents = [
  '效果非常好，很逼真，朋友都以为是真人录的！',
  '交付很快，质量超出预期，下次还会再来。',
  '艺人很配合，改了两次都很耐心，最终效果很满意。',
  '送给老婆的生日礼物，她特别开心，值了！',
  '古风造型很有韵味，成片自然逼真，家人看了都夸好。',
  '客服态度好，视频质量高，推荐！',
];

humanIds.forEach((hid, i) => {
  for (let j = 0; j < 3; j++) {
    const rating = 4 + Math.floor(Math.random() * 2);
    insertReview.run(
      `TEST${hid}${j}`, userIds[(i + j + 1) % 6], hid,
      rating, rating, rating, rating, rating,
      reviewContents[(i * 3 + j) % reviewContents.length],
      `-${j + 1} days`
    );
  }
});

// 场景模板
const insertScene = db.prepare(`INSERT INTO scene_templates
  (name, category, icon, suggested_price, suggested_duration, default_message, description, sort_order, status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'))`);

const scenes = [
  ['生日祝福', 'birthday', 'cake', 9900, 15, '祝你生日快乐，万事如意！', '适合生日祝福场景', 1],
  ['新年祝福', 'newyear', 'celebration', 9900, 15, '新年快乐，恭喜发财！', '适合新年/春节祝福', 2],
  ['婚礼祝福', 'wedding', 'favorite', 29900, 30, '祝你们新婚快乐，百年好合！', '适合婚礼祝福', 3],
  ['企业开业', 'business', 'business', 69900, 30, '祝贵公司开业大吉，生意兴隆！', '适合企业开业/周年庆', 4],
  ['毕业祝福', 'graduation', 'school', 9900, 15, '祝你毕业快乐，前程似锦！', '适合毕业季祝福', 5],
  ['节日问候', 'holiday', 'card_giftcard', 9900, 15, '祝你节日快乐，阖家幸福！', '适合各种节日问候', 6],
  ['鼓励加油', 'encourage', 'thumb_up', 9900, 15, '相信你一定可以的，加油！', '适合鼓励/打气', 7],
  ['表白告白', 'love', 'favorite', 29900, 30, '我喜欢你很久了，做我女朋友吧！', '适合表白/告白', 8],
];
scenes.forEach(s => insertScene.run(...s));

// 样片库数据
const insertSample = db.prepare(`INSERT INTO sample_library
  (genre, title, outline, characters, tags, heat_score, cover_url, sort_order, status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'))`);

// 样片选剧库（V10.1：自有IP类型蓝本，genre 对齐 config.sample.genres；主角可由客户本人出演）
const samples = [
  ['古装逆袭', '黄帝史诗·天下合', '上古炎黄合盟、涿鹿定鼎，部落少年轩辕一路成长为定鼎天下的共主。', '主角：轩辕（可定制为客户本人）；其他角色：嫘祖、蚩尤、风后、力牧', '古装,史诗,逆袭', 95, '/uploads/banners/banner1.jpg', 1],
  ['青春校园', '少年龙武', '平凡少年习武自强，为守护家人与城市一路逆袭的热血成长故事。', '主角：龙武（可定制为客户本人）；其他角色：师父沈铮、女主林溪、兄弟阿策、宿敌', '青春,热血,成长', 90, '/uploads/banners/banner3.jpg', 2],
  ['军旅谍战', '边境暗影', '边境缉毒行动暗流涌动，行动组组长带队撕开层层毒网的悬疑动作故事。', '主角：组长陆衍（可定制为客户本人）；其他角色：卧底老枪、情报员苏蔓、反派毒枭、技术支援', '军旅,谍战,悬疑', 86, '/uploads/banners/banner2.jpg', 3],
];
samples.forEach(s => insertSample.run(...s));

console.log('测试数据填充完成！');
console.log(`- 用户: ${userIds.length} 个`);
console.log(`- 艺人: ${humanIds.length} 位`);
console.log(`- 视频模板: ${humanIds.length * 3} 个`);
console.log(`- 项目: ${projects.length} 个`);
console.log(`- 项目里程碑: ${projects.length * 4} 个`);
console.log(`- 项目角色: ${projects.length * 3} 个`);
console.log(`- 评价: ${humanIds.length * 3} 条`);
console.log(`- 场景模板: ${scenes.length} 个`);
console.log(`- 样片库: ${samples.length} 个`);
