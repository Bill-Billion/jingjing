// routes/scripts.js - V5.0 剧本方入驻与IP保护API
const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const crypto = require('crypto');
const { validate, v } = require('../middleware/validate');
const router = express.Router();

// 剧本方入驻申请
router.post('/apply', auth, validate({
  realName: [v.required],
  penName: [v.required],
  bio: [v.required],
}), (req, res) => {
  const { realName, penName, bio, works } = req.body;

  const existing = db.prepare('SELECT id FROM scriptwriters WHERE user_id = ?').get(req.userId);
  if (existing) return res.status(400).json({ message: '已提交过入驻申请' });

  // TODO: 实名信息AES加密存储
  db.prepare(`INSERT INTO scriptwriters (user_id, real_name, pen_name, bio, works, status)
    VALUES (?,?,?,?,?, 'pending')`).run(
    req.userId, realName, penName, bio, JSON.stringify(works || [])
  );
  res.json({ message: '入驻申请已提交，平台将在3个工作日内审核' });
});

// 上传剧本（需审核通过的剧本方）
router.post('/upload', auth, validate({
  title: [v.required],
  category: [v.required],
  synopsis: [v.required],
}), (req, res) => {
  const { title, category, genre, wordCount, synopsis, fileUrl, filingNumber } = req.body;

  const writer = db.prepare("SELECT * FROM scriptwriters WHERE user_id = ? AND status = 'approved'")
    .get(req.userId);
  if (!writer) return res.status(403).json({ message: '请先完成剧本方入驻审核' });

  // A digest of submitted metadata is neither a file digest nor third-party evidence.
  const submissionDigest = crypto.createHash('sha256')
    .update(JSON.stringify({ title, synopsis, fileUrl: fileUrl || '' }))
    .digest('hex');
  const evidenceTxid = null;

  const r = db.prepare(`INSERT INTO scripts
    (scriptwriter_id, title, category, genre, word_count, synopsis, file_url, filing_number, evidence_hash, evidence_txid, digest_kind, status)
    VALUES (?,?,?,?,?,?,?,?,?,?, 'submission_metadata_v1', 'pending')`).run(
    writer.id, title, category, genre || '', wordCount || 0, synopsis,
    fileUrl || '', filingNumber || '', submissionDigest, evidenceTxid
  );

  res.json({
    message: '材料已保存；仅生成提交信息摘要，尚无第三方存证',
    scriptId: r.lastInsertRowid,
    submissionDigest, digestScope: 'submission_metadata',
    evidenceHash: null, evidenceStatus: 'not_verified', trustedTimestamp: false,
  });
});

// 获取我的剧本列表
router.get('/my', auth, (req, res) => {
  const writer = db.prepare('SELECT id FROM scriptwriters WHERE user_id = ?').get(req.userId);
  if (!writer) return res.json({ list: [] });

  const list = db.prepare('SELECT * FROM scripts WHERE scriptwriter_id = ? ORDER BY created_at DESC')
    .all(writer.id);
  res.json({
    list: list.map(s => ({
      id: s.id, title: s.title, category: s.category, genre: s.genre,
      wordCount: s.word_count, synopsis: s.synopsis,
      status: s.status, evidenceHash: null, evidenceStatus: 'not_verified', trustedTimestamp: false,
      submissionDigest: s.digest_kind === 'submission_metadata_v1' ? s.evidence_hash : null,
      recordedDigest: s.evidence_hash,
      digestScope: s.digest_kind === 'submission_metadata_v1' ? 'submission_metadata' : 'legacy_unclassified',
      filingNumber: s.filing_number, createdAt: s.created_at,
    })),
  });
});

// 浏览剧本库（仅通过审核的制作团队和平台监制可见，需NDA）
router.get('/browse', auth, (req, res) => {
  res.status(503).json({
    code: 'SCRIPT_READING_NOT_READY', status: 'not_enabled',
    message: '受控阅稿尚未启用，当前无法浏览他人剧本',
  });
});

module.exports = router;
