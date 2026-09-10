// services/volcVisual.js - 火山方舟视觉服务层（Seedream 文生图 + Seedance 文/图生视频异步任务）
// 方舟 Bearer Key 体系；视频为异步任务：创建→轮询→转存 /uploads/ai。含并发、重试、成本流水、任务持久化与重启恢复。
// 注意（见项目档案08/D-火山）：真人照片图生视频须走方舟“真人人像库 asset://”授权链，普通 http 真人图会被风控。
const config = require('../config');
const db = require('../db');
const logger = require('../utils/logger');
const quota = require('./aiQuota');
const storage = require('./storage');

const V = config.volc;
const U = config.aiQuota.unitCostFen;

function arkHeaders() {
  if (!V.arkApiKey) throw new Error('未配置 ARK_API_KEY');
  return { Authorization: `Bearer ${V.arkApiKey}`, 'Content-Type': 'application/json' };
}

// 把上游可访问的素材 URL 转存到本地 /uploads/ai，返回相对 URL；asset:// 等非 http 资源直接透传
async function persistRemote(remoteUrl, ext) {
  if (!/^https?:\/\//i.test(remoteUrl)) return remoteUrl;
  const r = await quota.withRetry(() => fetch(remoteUrl));
  if (!r.ok) throw new Error(`转存上游素材失败 http=${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const saved = await storage.put({ key: `ai/${name}`, body: buf });
  return saved.url;
}

// ---------------- 任务表辅助 ----------------
function insertTask(o) {
  const now = Date.now();
  const info = db.prepare(`INSERT INTO ai_generation_tasks
    (task_type,upstream_id,user_id,status,model,request_json,cost_fen,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(o.taskType, o.upstreamId || null, o.userId || null, o.status || 'pending', o.model || null,
      o.request ? JSON.stringify(o.request).slice(0, 4000) : null, o.costFen || 0, now, now);
  return getTask(info.lastInsertRowid);
}
function updateTask(id, patch) {
  const fields = Object.keys(patch).filter((k) => k !== 'id');
  const sets = fields.map((f) => `${f}=?`).join(',');
  const vals = fields.map((f) => (typeof patch[f] === 'object' && patch[f] !== null ? JSON.stringify(patch[f]) : patch[f]));
  db.prepare(`UPDATE ai_generation_tasks SET ${sets}, updated_at=? WHERE id=?`).run(...vals, Date.now(), id);
  return getTask(id);
}
function getTask(id) { return db.prepare('SELECT * FROM ai_generation_tasks WHERE id=?').get(id); }

// ---------------- Seedream 文生图（同步） ----------------
async function textToImage({ prompt, size = '1024x1024', userId = null } = {}) {
  if (!prompt || !prompt.trim()) throw new Error('缺少画面描述 prompt');
  quota.assertBudget(U.t2iPerImage);
  const release = await quota.acquire('t2i');
  const t0 = Date.now();
  const local = insertTask({ taskType: 'seedream_t2i', userId, status: 'running', model: V.t2iModel, request: { prompt, size }, costFen: U.t2iPerImage });
  try {
    const call = async () => {
      const r = await fetch(`${V.arkBaseUrl}/images/generations`, { method: 'POST', headers: arkHeaders(), body: JSON.stringify({ model: V.t2iModel, prompt, response_format: 'url', size }) });
      const txt = await r.text(); let j; try { j = JSON.parse(txt); } catch { throw Object.assign(new Error(`文生图非JSON http=${r.status} ${txt.slice(0, 150)}`), { status: r.status }); }
      if (!r.ok || j.error) throw Object.assign(new Error(j.error?.message || `文生图失败 http=${r.status}`), { status: r.status });
      return j;
    };
    const j = await quota.withRetry(call);
    const item = (j.data && j.data[0]) || {};
    let relUrl = null;
    if (item.url) relUrl = await persistRemote(item.url, 'png');
    else if (item.b64_json) {
      const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
      const saved = await storage.put({ key: `ai/${name}`, body: Buffer.from(item.b64_json, 'base64'), contentType: 'image/png' });
      relUrl = saved.url;
    }
    quota.logCost({ svc: 'ark', action: 'seedream_t2i', model: V.t2iModel, userId, ok: 1, billedUnits: 1, unit: 'image', estCostFen: U.t2iPerImage, requestId: j.id || null, meta: j.usage || null });
    await finalizeSucceeded(local.id, { resultUrl: relUrl, usage: j.usage || null, source: 'sync' });
    logger.info('volc_t2i_ok', { ms: Date.now() - t0, taskId: local.id });
    return getTask(local.id);
  } catch (e) {
    quota.logCost({ svc: 'ark', action: 'seedream_t2i', model: V.t2iModel, userId, ok: 0, estCostFen: 0, meta: { error: e.message } });
    updateTask(local.id, { status: 'failed', error: e.message, finished_at: Date.now() });
    throw e;
  } finally { release(); }
}

// ---------------- Seedance 视频（异步任务） ----------------
function buildVideoContent({ prompt, imageUrl }) {
  const content = [];
  if (imageUrl) content.push({ type: 'image_url', image_url: { url: imageUrl } }); // http(s)/data: 普通素材；真人须 asset://
  content.push({ type: 'text', text: prompt || '人物自然说话，口型与语音同步，镜头稳定，写实风格' }); // Seedance 文本节点 text 必须为字符串
  return content;
}

// 创建视频任务（不阻塞，返回本地任务；后台自动轮询转存）
async function createVideoTask({ type = 't2v', prompt, imageUrl = null, duration = 5, ratio = '9:16', resolution = '480p', userId = null, generateAudio = true } = {}) {
  if (type === 'i2v' && !imageUrl) throw new Error('图生视频必须提供 imageUrl');
  const estCost = U.videoPerSecond480p * Number(duration || 5);
  quota.assertBudget(estCost);
  // Seedance 1.5/2.0 官方新方式：resolution/duration/ratio 为顶层字段，generate_audio 为布尔
  const body = {
    model: V.t2vModel,
    content: buildVideoContent({ prompt, imageUrl }),
    generate_audio: !!generateAudio,
    resolution,
    duration: Number(duration || 5),
    ratio,
    watermark: true, // 合规：AI 生成视频强制水印
  };
  const release = await quota.acquire('video');
  try {
    const j = await quota.withRetry(async () => {
      const r = await fetch(`${V.arkBaseUrl}/contents/generations/tasks`, { method: 'POST', headers: arkHeaders(), body: JSON.stringify(body) });
      const txt = await r.text(); let o; try { o = JSON.parse(txt); } catch { throw Object.assign(new Error(`创建视频任务非JSON http=${r.status} ${txt.slice(0, 150)}`), { status: r.status }); }
      if (!r.ok || o.error) throw Object.assign(new Error(o.error?.message || `创建视频任务失败 http=${r.status}`), { status: r.status });
      return o;
    });
    if (!j.id) throw new Error('方舟未返回任务ID');
    const local = insertTask({ taskType: type === 'i2v' ? 'seedance_i2v' : 'seedance_t2v', upstreamId: j.id, userId, status: 'running', model: V.t2vModel, request: body, costFen: estCost });
    logger.info('volc_video_created', { localId: local.id, upstreamId: j.id, type });
    startAutoPoll(local.id); // 后台推进，不阻塞接口返回
    return getTask(local.id);
  } finally { release(); }
}

const polling = new Set();
async function fetchUpstream(upstreamId) {
  const r = await fetch(`${V.arkBaseUrl}/contents/generations/tasks/${upstreamId}`, { headers: arkHeaders() });
  const txt = await r.text(); let j; try { j = JSON.parse(txt); } catch { throw Object.assign(new Error(`查询任务非JSON http=${r.status}`), { status: r.status }); }
  if (j.error) throw new Error(j.error.message || '上游任务错误');
  return j;
}

// 推进单个本地任务到终态（轮询一次；未结束则安排下一次）
async function pump(localId) {
  const local = getTask(localId);
  if (!local || !local.upstream_id) return;
  try {
    const up = await fetchUpstream(local.upstream_id);
    if (up.status === 'succeeded') {
      const videoUrl = up.content && up.content.video_url;
      const rel = videoUrl ? await persistRemote(videoUrl, 'mp4') : null;
      const fin = await finalizeSucceeded(localId, { resultUrl: rel, usage: up.usage || null, source: 'poll' });
      if (fin.ok) quota.logCost({ svc: 'ark', action: local.task_type, model: local.model, userId: local.user_id, ok: 1, billedUnits: 5, unit: 'second', estCostFen: local.cost_fen, requestId: local.upstream_id });
      polling.delete(localId);
      logger.info('volc_video_done', { localId, rel, advanced: fin.ok });
    } else if (up.status === 'failed' || up.status === 'cancelled') {
      const msg = (up.error && (up.error.message || up.error.code)) || '上游任务失败';
      updateTask(localId, { status: 'failed', error: msg, finished_at: Date.now() });
      quota.logCost({ svc: 'ark', action: local.task_type, model: local.model, userId: local.user_id, ok: 0, estCostFen: 0, requestId: local.upstream_id, meta: { error: msg } });
      polling.delete(localId);
    } else {
      updateTask(localId, { status: 'running' });
      if (Date.now() - local.created_at > V.task.pollTimeoutMs) {
        updateTask(localId, { status: 'failed', error: '视频生成超时', finished_at: Date.now() }); polling.delete(localId); return;
      }
      setTimeout(() => pump(localId), V.task.pollIntervalMs);
    }
  } catch (e) {
    // 网络抖动不致命，安排重试，超过总超时才判失败
    if (Date.now() - local.created_at > V.task.pollTimeoutMs) { updateTask(localId, { status: 'failed', error: e.message, finished_at: Date.now() }); polling.delete(localId); }
    else setTimeout(() => pump(localId), V.task.pollIntervalMs);
  }
}
function startAutoPoll(localId) { if (!polling.has(localId)) { polling.add(localId); setTimeout(() => pump(localId), V.task.pollIntervalMs); } }

// 进程启动时恢复未完成任务（服务器重启不丢任务）
function resumeUnfinished() {
  const rows = db.prepare(`SELECT id FROM ai_generation_tasks WHERE status IN ('pending','running') AND upstream_id IS NOT NULL`).all();
  rows.forEach((r) => startAutoPoll(r.id));
  if (rows.length) logger.info('volc_visual_resume', { count: rows.length });
}

// ---------------- 交付物版本化 + 审核位 + 供应商回调（工程化整改） ----------------
const crypto = require('crypto');

// 轮询与 webhook 共用的终态推进：CAS 保证只有 pending/running 能推进一次，二者互斥不重复；
// 每次成功写一条 deliverable_versions（不覆盖旧文件），并按开关置交付审核状态。
async function finalizeSucceeded(localId, { resultUrl = null, usage = null, source = 'poll', reason = null } = {}) {
  const before = getTask(localId);
  if (!before) return { ok: false, why: 'no_task' };
  const now = Date.now();
  const cas = db.prepare(`UPDATE ai_generation_tasks
    SET status='succeeded', result_url=COALESCE(?, result_url), result_meta=?, usage_json=?, finished_at=?, updated_at=?
    WHERE id=? AND status IN ('pending','running')`)
    .run(resultUrl, JSON.stringify(usage || {}), JSON.stringify(usage || {}), now, now, localId);
  if (cas.changes === 0) return { ok: false, why: 'already_terminal', task: getTask(localId) };

  const cur = getTask(localId);
  const versionNo = cur.version_no || 1;
  let deliverable = 'approved', reviewStatus = 'approved', reviewReason = null;
  if (config.aiDeliverable.reviewEnabled) {
    // 开启审核：本地敏感词预审；命中即驳回，否则进入人工流转（pending_review），通过后才是可交付物
    let promptText = '';
    try { promptText = (JSON.parse(cur.request_json || '{}').prompt) || ''; } catch (e) {}
    const mod = require('./providers/moderation');
    const m = await mod.moderateText(promptText);
    if (m.decision === 'reject') { deliverable = 'rejected'; reviewStatus = 'rejected'; reviewReason = m.reason || '本地预审驳回'; }
    else { deliverable = 'pending_review'; reviewStatus = 'pending'; }
  }
  db.prepare('UPDATE ai_generation_tasks SET deliverable_status=?, review_reason=? WHERE id=?').run(deliverable, reviewReason, localId);
  db.prepare(`INSERT INTO deliverable_versions
    (task_id,version_no,result_url,result_meta,reason,source,review_status,review_reason,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(localId, versionNo, resultUrl, JSON.stringify(usage || {}), reason, source, reviewStatus, reviewReason, now);
  logger.info('ai_deliverable_version', { localId, versionNo, source, deliverable });
  return { ok: true, deliverable, versionNo, task: getTask(localId) };
}

// 人工/管理员审核：通过/驳回，同步最新版本行；只有 pending_review 可流转
function reviewDeliverable(localId, decision, { reviewerId = null, reason = null } = {}) {
  const t = getTask(localId);
  if (!t) throw Object.assign(new Error('任务不存在'), { status: 404 });
  const next = decision === 'approve' ? 'approved' : 'rejected';
  const r = db.prepare("UPDATE ai_generation_tasks SET deliverable_status=? WHERE id=? AND deliverable_status='pending_review'")
    .run(next, localId);
  if (r.changes === 0) throw Object.assign(new Error('任务不在待审核状态，无法流转'), { status: 409 });
  const ver = db.prepare('SELECT MAX(version_no) v FROM deliverable_versions WHERE task_id=?').get(localId).v || (t.version_no || 1);
  db.prepare('UPDATE deliverable_versions SET review_status=?, review_reason=?, reviewer_id=?, reviewed_at=? WHERE task_id=? AND version_no=?')
    .run(next, reason, reviewerId, Date.now(), localId, ver);
  logger.info('ai_deliverable_review', { localId, decision, reviewerId });
  return getTask(localId);
}

// HMAC-SHA256 回调验签；密钥取 ARK_WEBHOOK_SECRET，缺省回退 ARK_API_KEY，都没有则拒
function verifyWebhookSig(rawBody, signature) {
  const secret = config.aiDeliverable.webhookSecret;
  if (!secret || !signature) return false;
  const expect = crypto.createHmac('sha256', secret).update(Buffer.from(rawBody)).digest('hex');
  const a = Buffer.from(String(signature).replace(/^sha256=/, ''));
  const b = Buffer.from(expect);
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch (e) { return false; }
}

// 供应商异步回调：验签→按 upstream_id 定位→幂等→CAS 推进（与轮询互斥，不重复出账/推进）
async function handleSupplierWebhook(rawBody, signature) {
  if (!verifyWebhookSig(rawBody, signature)) throw Object.assign(new Error('供应商回调验签失败'), { status: 401 });
  let evt;
  try { evt = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody); }
  catch (e) { throw Object.assign(new Error('回调体不是合法JSON'), { status: 400 }); }
  const upstreamId = evt.id || evt.task_id;
  if (!upstreamId) throw Object.assign(new Error('回调缺少任务ID'), { status: 400 });
  const t = db.prepare('SELECT * FROM ai_generation_tasks WHERE upstream_id=?').get(upstreamId);
  if (!t) throw Object.assign(new Error('本地无对应任务'), { status: 404 });
  if (t.status === 'succeeded' || t.status === 'failed') return { ok: true, duplicated: true, taskId: t.id, status: t.status };

  if (evt.status === 'succeeded') {
    const url = evt.content && evt.content.video_url;
    const rel = url ? await persistRemote(url, 'mp4') : t.result_url;
    const fin = await finalizeSucceeded(t.id, { resultUrl: rel, usage: evt.usage || null, source: 'webhook' });
    if (fin.ok) quota.logCost({ svc: 'ark', action: t.task_type, model: t.model, userId: t.user_id, ok: 1, billedUnits: 5, unit: 'second', estCostFen: t.cost_fen, requestId: upstreamId });
    return { ok: true, ...fin };
  }
  if (evt.status === 'failed' || evt.status === 'cancelled') {
    const msg = (evt.error && (evt.error.message || evt.error.code)) || '供应商回调任务失败';
    const r = db.prepare("UPDATE ai_generation_tasks SET status='failed', error=?, finished_at=?, updated_at=? WHERE id=? AND status IN ('pending','running')")
      .run(msg, Date.now(), Date.now(), t.id);
    return { ok: true, failed: true, advanced: r.changes === 1 };
  }
  return { ok: true, ignored: true, upstreamStatus: evt.status };
}

// 重做/重生成：新建一条任务行（版本号+1、挂 parent_task_id、保留原请求），绝不覆盖旧任务/旧文件
function regenerateTask(parentId, { reason = '重做', userId = null } = {}) {
  const p = getTask(parentId);
  if (!p) throw Object.assign(new Error('原任务不存在'), { status: 404 });
  const now = Date.now();
  const info = db.prepare(`INSERT INTO ai_generation_tasks
    (task_type,upstream_id,user_id,status,model,request_json,cost_fen,version_no,parent_task_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(p.task_type, null, userId != null ? userId : p.user_id, 'pending', p.model, p.request_json,
      p.cost_fen, (p.version_no || 1) + 1, parentId, now, now);
  logger.info('ai_regenerate', { parentId, newId: info.lastInsertRowid, reason });
  return getTask(info.lastInsertRowid);
}

function visualStatus() {
  return { t2iModel: V.t2iModel, t2vModel: V.t2vModel, arkKeyConfigured: !!V.arkApiKey, inflight: quota.inflightCount() };
}

module.exports = {
  textToImage, createVideoTask, getTask, startAutoPoll, resumeUnfinished, visualStatus, persistRemote,
  finalizeSucceeded, reviewDeliverable, verifyWebhookSig, handleSupplierWebhook, regenerateTask,
};
