// routes/mcn.js - MCN机构管理（V9：管理后台一期+数据看板+批量提现）
const express = require('express')
const db = require('../db')
const config = require('../config')
const auth = require('../middleware/auth')
const router = express.Router()

// MCN入驻申请（V5.0：前3个月免管理费）
router.post('/apply', auth, (req, res) => {
  const { name, licenseUrl, contactName, contactPhone } = req.body
  if (!name || !contactPhone) return res.status(400).json({ message: '请填写机构名称和联系方式' })

  const existing = db.prepare('SELECT id FROM mcn_agencies WHERE user_id = ?').get(req.userId)
  if (existing) return res.status(400).json({ message: '已提交过申请' })

  // V5.0: 前3个月免管理费
  const freeUntil = new Date(Date.now() + config.mcn.freeTrialDays * 86400000).toISOString()

  const result = db.prepare(`INSERT INTO mcn_agencies (user_id, name, license_url, contact_name, contact_phone, free_until)
    VALUES (?,?,?,?,?,?)`).run(req.userId, name, licenseUrl || '', contactName || '', contactPhone, freeUntil)

  // 同步更新身份认证
  db.prepare(`INSERT OR REPLACE INTO user_identities (user_id, identity_type, company_name, status)
    VALUES (?,?,?,?)`).run(req.userId, 'mcn', name, 'pending')

  res.json({
    mcnId: result.lastInsertRowid,
    message: 'MCN入驻申请已提交',
    freeTrial: `前${config.mcn.freeTrialDays}天免管理费，至${freeUntil.slice(0, 10)}`,
  })
})

// 获取MCN信息
router.get('/info', auth, (req, res) => {
  const mcn = db.prepare('SELECT * FROM mcn_agencies WHERE user_id = ?').get(req.userId)
  if (!mcn) return res.json({ status: 'none' })
  const talents = db.prepare(`
    SELECT mt.*, h.name, h.avatar, h.heat, h.sales, h.service_fee, h.verified_level, h.quality_grade
    FROM mcn_talents mt JOIN humans h ON mt.talent_id = h.id
    WHERE mt.mcn_id = ? AND mt.status = 'active'
  `).all(mcn.id)
  res.json({ ...mcn, talents })
})

// 添加旗下艺人
router.post('/talents/add', auth, (req, res) => {
  const { talentId, talentShare } = req.body
  const mcn = db.prepare('SELECT * FROM mcn_agencies WHERE user_id = ? AND status = ?').get(req.userId, 'approved')
  if (!mcn) return res.status(403).json({ message: 'MCN未通过审核' })

  const human = db.prepare('SELECT * FROM humans WHERE id = ?').get(talentId)
  if (!human) return res.status(404).json({ message: '艺人不存在' })

  try {
    db.prepare('INSERT INTO mcn_talents (mcn_id, talent_id, talent_share) VALUES (?,?,?)')
      .run(mcn.id, talentId, talentShare || 100)
    // 更新艺人身份
    db.prepare(`INSERT OR REPLACE INTO user_identities (user_id, identity_type, mcn_id, status)
      VALUES (?,?,?,?)`).run(human.user_id, 'mcn', mcn.id, 'approved')
    res.json({ message: '已添加旗下艺人' })
  } catch (e) {
    res.status(400).json({ message: '该艺人已在其他MCN名下' })
  }
})

// 移除旗下艺人
router.post('/talents/remove', auth, (req, res) => {
  const { talentId } = req.body
  const mcn = db.prepare('SELECT * FROM mcn_agencies WHERE user_id = ?').get(req.userId)
  if (!mcn) return res.status(403).json({ message: '无权限' })
  db.prepare('UPDATE mcn_talents SET status = ? WHERE mcn_id = ? AND talent_id = ?')
    .run('inactive', mcn.id, talentId)
  const human = db.prepare('SELECT user_id FROM humans WHERE id = ?').get(talentId)
  if (human) {
    db.prepare('UPDATE user_identities SET identity_type = ?, mcn_id = NULL WHERE user_id = ?')
      .run('personal', human.user_id)
  }
  res.json({ message: '已移除' })
})

// V5.0 MCN数据看板（增强版）
router.get('/dashboard', auth, (req, res) => {
  const mcn = db.prepare('SELECT * FROM mcn_agencies WHERE user_id = ?').get(req.userId)
  if (!mcn) return res.status(404).json({ message: 'MCN不存在' })

  const talents = db.prepare('SELECT talent_id, talent_share, joined_at FROM mcn_talents WHERE mcn_id = ? AND status = ?').all(mcn.id, 'active')
  const talentIds = talents.map(t => t.talent_id)

  let totalMcnIncome = 0
  let totalTalentIncome = 0
  let orderCount = 0
  let monthMcnIncome = 0
  let monthOrderCount = 0
  let pendingWithdraw = 0

  if (talentIds.length > 0) {
    const placeholders = talentIds.map(() => '?').join(',')
    const videoOrders = db.prepare(`SELECT net_amount, talent_id, created_at FROM video_orders WHERE talent_id IN (${placeholders}) AND settle_status = 'settled'`).all(...talentIds)
    const endOrders = db.prepare(`SELECT net_amount, talent_id, created_at FROM endorsement_orders WHERE talent_id IN (${placeholders}) AND settle_status = 'settled'`).all(...talentIds)
    const allOrders = [...videoOrders, ...endOrders]
    orderCount = allOrders.length
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    allOrders.forEach(o => {
      const rel = talents.find(t => t.talent_id === o.talent_id)
      const freeTrial = rel && rel.joined_at
        ? (Date.now() - new Date(rel.joined_at).getTime()) < config.mcn.freeTrialDays * 86400000
        : false
      const mcnPart = freeTrial ? 0 : Math.floor(o.net_amount * config.mcn.managementFeeRate)
      const talentPart = o.net_amount - mcnPart
      totalTalentIncome += talentPart
      totalMcnIncome += mcnPart
      if (o.created_at >= monthStart) {
        monthMcnIncome += mcnPart
        monthOrderCount++
      }
    })
  }

  // 待提现金额
  const mcnWallet = db.prepare('SELECT balance, frozen FROM wallets WHERE user_id = ?').get(req.userId)
  if (mcnWallet) pendingWithdraw = mcnWallet.balance

  // 免管理费状态
  const isFreeTrial = mcn.free_until && new Date(mcn.free_until) > new Date()

  res.json({
    mcnId: mcn.id,
    name: mcn.name,
    status: mcn.status,
    isFreeTrial,
    freeUntil: mcn.free_until,
    managementFeeRate: isFreeTrial ? 0 : config.mcn.managementFeeRate,
    talentCount: talents.length,
    totalOrders: orderCount,
    monthOrders: monthOrderCount,
    // V11 金额边界统一为「元」（DB 内部仍为分）
    totalMcnIncome: totalMcnIncome / 100,
    monthMcnIncome: monthMcnIncome / 100,
    totalTalentIncome: totalTalentIncome / 100,
    pendingWithdraw: pendingWithdraw / 100,
    walletBalance: mcnWallet ? mcnWallet.balance / 100 : 0,
    walletFrozen: mcnWallet ? mcnWallet.frozen / 100 : 0,
  })
})

// V5.0 旗下艺人收益列表
router.get('/artists', auth, (req, res) => {
  const mcn = db.prepare('SELECT * FROM mcn_agencies WHERE user_id = ?').get(req.userId)
  if (!mcn) return res.status(404).json({ message: 'MCN不存在' })

  const page = parseInt(req.query.page) || 1
  const pageSize = parseInt(req.query.pageSize) || 20
  const offset = (page - 1) * pageSize

  const list = db.prepare(`
    SELECT h.id, h.name, h.avatar, h.heat, h.sales, h.price, h.verified_level, h.quality_grade,
           h.status, mt.talent_share, mt.joined_at,
           (SELECT COUNT(*) FROM video_orders v WHERE v.talent_id = h.id AND v.status = 'completed') as completed_orders,
           (SELECT COALESCE(SUM(net_amount),0) FROM video_orders v WHERE v.talent_id = h.id AND v.settle_status = 'settled') as video_income,
           (SELECT COALESCE(SUM(net_amount),0) FROM endorsement_orders e WHERE e.talent_id = h.id AND e.settle_status = 'settled') as end_income,
           (SELECT AVG(overall_rating) FROM order_reviews r WHERE r.talent_id = h.id AND r.status = 'active') as avg_rating,
           (SELECT COUNT(*) FROM order_reviews r WHERE r.talent_id = h.id AND r.status = 'active') as review_count
    FROM mcn_talents mt
    JOIN humans h ON mt.talent_id = h.id
    WHERE mt.mcn_id = ? AND mt.status = 'active'
    ORDER BY h.heat DESC
    LIMIT ? OFFSET ?
  `).all(mcn.id, pageSize, offset)

  const total = db.prepare('SELECT COUNT(*) as c FROM mcn_talents WHERE mcn_id = ? AND status = ?')
    .get(mcn.id, 'active').c

  res.json({
    list: list.map(a => ({
      id: a.id, name: a.name, avatar: a.avatar, heat: a.heat, sales: a.sales,
      price: a.price / 100, verifiedLevel: a.verified_level, qualityGrade: a.quality_grade,
      status: a.status, talentShare: a.talent_share, joinedAt: a.joined_at,
      completedOrders: a.completed_orders,
      totalIncome: (a.video_income + a.end_income) / 100,
      avgRating: a.avg_rating ? Math.round(a.avg_rating * 10) / 10 : 0,
      reviewCount: a.review_count,
    })),
    pagination: { page, pageSize, total },
  })
})

// V5.0 批量提现
router.post('/withdraw/batch', auth, (req, res) => {
  const { artistIds, amounts } = req.body
  const mcn = db.prepare('SELECT * FROM mcn_agencies WHERE user_id = ? AND status = ?').get(req.userId, 'approved')
  if (!mcn) return res.status(403).json({ message: 'MCN未通过审核' })

  // 验证艺人归属
  const placeholders = artistIds.map(() => '?').join(',')
  const owned = db.prepare(`SELECT talent_id FROM mcn_talents WHERE mcn_id = ? AND status = 'active' AND talent_id IN (${placeholders})`)
    .all(mcn.id, ...artistIds)
  if (owned.length !== artistIds.length) {
    return res.status(400).json({ message: '包含非旗下艺人' })
  }

  // TODO: 接入支付机构批量代付接口
  // 当前创建批量提现记录
  const batchNo = 'BW' + Date.now()
  res.json({
    message: '批量提现申请已提交',
    batchNo,
    count: artistIds.length,
    totalAmount: amounts.reduce((s, a) => s + a, 0),
    note: '实际转账由持牌支付机构执行，T+7到账',
  })
})

// V5.0 数据导出（CSV）
router.get('/export', auth, (req, res) => {
  const mcn = db.prepare('SELECT * FROM mcn_agencies WHERE user_id = ?').get(req.userId)
  if (!mcn) return res.status(404).json({ message: 'MCN不存在' })

  const { startDate, endDate } = req.query
  const talents = db.prepare('SELECT talent_id FROM mcn_talents WHERE mcn_id = ? AND status = ?').all(mcn.id, 'active')
  const talentIds = talents.map(t => t.talent_id)

  let orders = []
  if (talentIds.length > 0) {
    const placeholders = talentIds.map(() => '?').join(',')
    let sql = `SELECT order_no, talent_id, amount, net_amount, status, settle_status, created_at
      FROM video_orders WHERE talent_id IN (${placeholders})`
    const params = [...talentIds]
    if (startDate) { sql += ' AND created_at >= ?'; params.push(startDate) }
    if (endDate) { sql += ' AND created_at <= ?'; params.push(endDate) }
    orders = db.prepare(sql).all(...params)
  }

  // 生成CSV
  const header = '订单号,艺人ID,订单金额(分),艺人收入(分),状态,结算状态,创建时间\n'
  const csv = header + orders.map(o =>
    `${o.order_no},${o.talent_id},${o.amount},${o.net_amount},${o.status},${o.settle_status},${o.created_at}`
  ).join('\n')

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="mcn_earnings.csv"')
  // BOM for Excel UTF-8
  res.send('\uFEFF' + csv)
})

// V5.0 粉丝画像
router.get('/fan-profile', auth, (req, res) => {
  const mcn = db.prepare('SELECT * FROM mcn_agencies WHERE user_id = ?').get(req.userId)
  if (!mcn) return res.status(404).json({ message: 'MCN不存在' })

  // TODO: 接入用户画像数据（基于订单数据聚合）
  // 当前返回Mock结构
  res.json({
    ageDistribution: { '18-24': 30, '25-34': 40, '35-44': 20, '45+': 10 },
    genderDistribution: { male: 35, female: 65 },
    topRegions: ['广东', '浙江', '江苏', '北京', '上海'],
    note: '粉丝画像基于订单收货/注册信息聚合，不含个人隐私数据',
  })
})

// V5.0 旗下艺人热度排名
router.get('/ranking', auth, (req, res) => {
  const mcn = db.prepare('SELECT * FROM mcn_agencies WHERE user_id = ?').get(req.userId)
  if (!mcn) return res.status(404).json({ message: 'MCN不存在' })

  const list = db.prepare(`
    SELECT h.id, h.name, h.avatar, h.heat, h.sales,
           (SELECT COUNT(*) FROM video_orders v WHERE v.talent_id = h.id AND v.status = 'completed') as orders
    FROM mcn_talents mt
    JOIN humans h ON mt.talent_id = h.id
    WHERE mt.mcn_id = ? AND mt.status = 'active'
    ORDER BY h.heat DESC LIMIT 50
  `).all(mcn.id)

  res.json({
    list: list.map((a, i) => ({
      rank: i + 1, id: a.id, name: a.name, avatar: a.avatar,
      heat: a.heat, sales: a.sales, orders: a.orders,
    })),
  })
})

module.exports = router
