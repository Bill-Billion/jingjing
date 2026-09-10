// utils/idempotent.js - 幂等工具
// 生产环境应使用 Redis SET NX EX；此处用 SQLite 降级实现
const db = require('../db');

const TTL_SECONDS = 86400; // 幂等键保留24小时

/**
 * 幂等执行：相同 key 在 TTL 内直接返回缓存结果
 * @param {string} key - 幂等键（如 payment:notify:<channel_txn_no>）
 * @param {function} fn - 实际业务函数
 * @returns {Promise<*>}
 */
async function idempotent(key, fn) {
  const existing = db.prepare('SELECT response FROM idempotent_keys WHERE idempotent_key = ?').get(key);
  if (existing) {
    return JSON.parse(existing.response);
  }
  const result = await fn();
  db.prepare('INSERT OR IGNORE INTO idempotent_keys (idempotent_key, response) VALUES (?, ?)')
    .run(key, JSON.stringify(result));
  return result;
}

/**
 * 简单的互斥锁（SQLite事务级，生产环境换 Redis Redlock）
 * @param {string} lockKey
 * @param {function} fn
 * @param {number} timeoutMs
 */
function withLock(lockKey, fn, timeoutMs = 10000) {
  // SQLite 单写者模型 + BEGIN IMMEDIATE 实现行级互斥
  const txn = db.transaction(() => {
    // 插入锁标记（唯一键冲突即被锁）
    try {
      db.prepare(`INSERT INTO idempotent_keys (idempotent_key, response) VALUES (?, 'LOCKED')`)
        .run('lock:' + lockKey);
    } catch (e) {
      throw new Error('操作正在处理中，请稍后重试');
    }
    try {
      const result = fn();
      db.prepare('DELETE FROM idempotent_keys WHERE idempotent_key = ?').run('lock:' + lockKey);
      return result;
    } catch (e) {
      db.prepare('DELETE FROM idempotent_keys WHERE idempotent_key = ?').run('lock:' + lockKey);
      throw e;
    }
  });
  return txn.immediate ? txn.immediate() : txn();
}

// 清理过期幂等键（定时任务调用）
function cleanExpired() {
  db.prepare(`DELETE FROM idempotent_keys WHERE created_at < datetime('now', '-2 days')`).run();
}

module.exports = { idempotent, withLock, cleanExpired };
