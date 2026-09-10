// routes/theater.js - 晶典剧场
const express = require('express')
const db = require('../db')
const auth = require('../middleware/auth')
const router = express.Router()

// 晶典剧场首页数据
router.get('/', (req, res) => {
  const lottery = db.prepare(`
    SELECT l.*, p.title as drama_title, p.cover
    FROM lotteries l LEFT JOIN projects p ON l.project_id = p.id
    WHERE l.status = 'active' ORDER BY l.id DESC LIMIT 1
  `).get()
  const dramas = db.prepare(`
    SELECT p.*, h.name as talent_name, h.avatar as talent_avatar
    FROM projects p LEFT JOIN humans h ON p.talent_id = h.id
    WHERE p.status = '筹拍中' ORDER BY p.raised_amount DESC
  `).all()
  const history = [
    { period: '第2期', drama: '《江南旧梦》', winner: '数字人"林清雪"', date: '2026-07-15' },
    { period: '第1期', drama: '《星河纪元》', winner: '数字人"夜辰"', date: '2026-05-20' }
  ]
  res.json({
    brand: {
      name: '晶典剧场',
      desc: '平台自制大剧 · 每月抽选艺人参演',
      slogan: '每个人都有机会成为大剧演员'
    },
    lottery: lottery ? {
      id: lottery.id,
      title: lottery.title,
      prize: lottery.prize,
      condition: lottery.conditions,
      joined: lottery.joined_count,
      endDate: lottery.end_date,
      daysLeft: Math.ceil((new Date(lottery.end_date) - new Date()) / 86400000)
    } : null,
    dramas: dramas.map(p => ({
      id: p.id,
      title: p.title,
      cover: p.cover,
      type: p.type,
      talentName: p.talent_name,
      talentAvatar: p.talent_avatar,
      raised: p.raised_amount,
      goal: p.goal_amount,
      percent: Math.round(p.raised_amount / p.goal_amount * 100),
      status: p.status,
      tags: ['可投资', '可参演']
    })),
    history
  })
})

// 报名抽奖
router.post('/lottery', auth, (req, res) => {
  const { lotteryId } = req.body
  const lottery = db.prepare('SELECT * FROM lotteries WHERE id = ?').get(lotteryId)
  if (!lottery) return res.status(404).json({ message: '抽奖活动不存在' })
  if (lottery.status !== 'active') return res.status(400).json({ message: '抽奖活动已结束' })
  try {
    db.prepare('INSERT INTO lottery_signups (lottery_id, user_id) VALUES (?,?)').run(lotteryId, req.userId)
    db.prepare('UPDATE lotteries SET joined_count = joined_count + 1 WHERE id = ?').run(lotteryId)
    res.json({ message: '报名成功' })
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ message: '您已报名，请勿重复' })
    }
    res.status(500).json({ message: '报名失败' })
  }
})

// 我的抽奖记录
router.get('/lottery/my', auth, (req, res) => {
  const list = db.prepare(`
    SELECT s.*, l.title, l.prize, l.end_date, l.status as lottery_status,
           p.title as drama_title, p.cover
    FROM lottery_signups s
    LEFT JOIN lotteries l ON s.lottery_id = l.id
    LEFT JOIN projects p ON l.project_id = p.id
    WHERE s.user_id = ? ORDER BY s.created_at DESC
  `).all(req.userId)
  res.json({
    list: list.map(s => ({
      id: s.id,
      lotteryId: s.lottery_id,
      title: s.title,
      prize: s.prize,
      dramaTitle: s.drama_title,
      cover: s.cover,
      endDate: s.end_date,
      isWinner: !!s.is_winner,
      status: s.is_winner ? '已中奖' : (s.lottery_status === 'active' ? '待开奖' : '未中奖'),
      date: s.created_at
    }))
  })
})

module.exports = router
