// routes/sceneTemplates.js - V5.0 场景化视频模板API
// 婚礼伴郎祝福、年会视频、毕业寄语、情人节表白等场景模板
const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const { validate, v } = require('../middleware/validate');
const router = express.Router();

// 预置场景模板（首次启动时自动初始化）
const DEFAULT_TEMPLATES = [
  { name: '生日祝福', category: 'birthday', icon: 'cake', suggested_price: 9900, suggested_duration: 15,
    default_message: '祝你生日快乐，愿你每一天都充满阳光和欢笑！', description: '适合朋友、家人、同事生日祝福', sort_order: 1 },
  { name: '婚礼祝福', category: 'wedding', icon: 'favorite', suggested_price: 29900, suggested_duration: 30,
    default_message: '祝你们新婚快乐，百年好合，永结同心！', description: '伴郎/伴娘/亲友婚礼祝福视频', sort_order: 2 },
  { name: '年会祝福', category: 'annual', icon: 'celebration', suggested_price: 69900, suggested_duration: 30,
    default_message: '祝公司年会圆满成功，新的一年再创辉煌！', description: '企业年会、客户答谢、开业庆典', sort_order: 3 },
  { name: '毕业寄语', category: 'graduation', icon: 'school', suggested_price: 9900, suggested_duration: 15,
    default_message: '毕业快乐！愿你前程似锦，未来可期！', description: '同学毕业祝福、老师寄语', sort_order: 4 },
  { name: '情人节表白', category: 'valentine', icon: 'favorite_border', suggested_price: 29900, suggested_duration: 20,
    default_message: '遇见你是我最大的幸运，愿我们一直走下去。', description: '情人节/纪念日/表白视频', sort_order: 5 },
  { name: '春节祝福', category: 'festival', icon: 'festival', suggested_price: 9900, suggested_duration: 15,
    default_message: '新年快乐！恭喜发财，万事如意！', description: '春节/新年节日祝福', sort_order: 6 },
  { name: '中秋祝福', category: 'festival', icon: 'festival', suggested_price: 9900, suggested_duration: 15,
    default_message: '中秋快乐，花好月圆，阖家幸福！', description: '中秋节节日问候', sort_order: 7 },
  { name: '开业庆典', category: 'opening', icon: 'store', suggested_price: 69900, suggested_duration: 30,
    default_message: '祝开业大吉，生意兴隆，财源广进！', description: '新店开业、公司成立祝贺', sort_order: 8 },
  { name: '圣诞节祝福', category: 'festival', icon: 'festival', suggested_price: 9900, suggested_duration: 15,
    default_message: 'Merry Christmas! 愿你度过一个温暖快乐的圣诞节！', description: '圣诞节节日祝福', sort_order: 9 },
  { name: '母亲节祝福', category: 'festival', icon: 'favorite', suggested_price: 9900, suggested_duration: 15,
    default_message: '妈妈，节日快乐！感谢您一直以来的爱与付出。', description: '母亲节/父亲节感恩祝福', sort_order: 10 },
  { name: '鼓励加油', category: 'custom', icon: 'thumb_up', suggested_price: 9900, suggested_duration: 15,
    default_message: '加油！你一定可以的，相信自己！', description: '考试/面试/比赛鼓励视频', sort_order: 11 },
  { name: '自定义场景', category: 'custom', icon: 'edit', suggested_price: 9900, suggested_duration: 15,
    default_message: '', description: '完全自定义祝福语和场景', sort_order: 99 },
];

// 初始化默认模板（幂等）
function initDefaultTemplates() {
  const count = db.prepare('SELECT COUNT(*) as c FROM scene_templates').get().c;
  if (count === 0) {
    const stmt = db.prepare(`INSERT INTO scene_templates
      (name, category, icon, suggested_price, suggested_duration, default_message, description, sort_order)
      VALUES (?,?,?,?,?,?,?,?)`);
    for (const t of DEFAULT_TEMPLATES) {
      stmt.run(t.name, t.category, t.icon, t.suggested_price, t.suggested_duration,
        t.default_message, t.description, t.sort_order);
    }
  }
}
initDefaultTemplates();

// 获取场景模板列表（公开接口，支持按分类筛选）
router.get('/', (req, res) => {
  const { category } = req.query;
  let sql = "SELECT * FROM scene_templates WHERE status = 'active'";
  const params = [];
  if (category && category !== 'all') {
    sql += ' AND category = ?';
    params.push(category);
  }
  sql += ' ORDER BY sort_order ASC, id ASC';
  const list = db.prepare(sql).all(...params);
  res.json({ list });
});

// 获取单个模板详情
router.get('/:id', (req, res) => {
  const tpl = db.prepare("SELECT * FROM scene_templates WHERE id = ? AND status = 'active'").get(req.params.id);
  if (!tpl) return res.status(404).json({ message: '模板不存在' });
  res.json({ template: tpl });
});

// 艺人创建自定义模板（需登录+艺人身份）
router.post('/', auth, validate({
  name: [v.required],
  category: [v.required],
}), (req, res) => {
  const { name, category, suggestedPrice, suggestedDuration, defaultMessage, description } = req.body;
  const human = db.prepare("SELECT id FROM humans WHERE user_id = ? AND status = 'active' LIMIT 1").get(req.userId);
  if (!human) return res.status(403).json({ message: '仅艺人可创建自定义模板' });

  const r = db.prepare(`INSERT INTO scene_templates
    (name, category, suggested_price, suggested_duration, default_message, description, sort_order)
    VALUES (?,?,?,?,?,?,50)`).run(
    name, category, suggestedPrice || 9900, suggestedDuration || 15,
    defaultMessage || '', description || ''
  );
  res.json({ message: '模板创建成功', id: r.lastInsertRowid });
});

module.exports = router;
