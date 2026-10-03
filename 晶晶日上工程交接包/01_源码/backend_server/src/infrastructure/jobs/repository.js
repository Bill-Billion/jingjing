'use strict';
const { randomUUID, createHash } = require('node:crypto');

const error = (code) => Object.assign(new Error(code), { code });
function text(value, max, name) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > max || /[\x00-\x1f]/.test(value)) throw error(`INVALID_${name}`);
  return value;
}
function integer(value, min, max, name) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw error(`INVALID_${name}`);
  return value;
}
function spec(input) {
  // References only: no provider secrets, raw private documents or signed URLs.
  return {
    task_type: text(input.task_type, 80, 'TASK_TYPE'),
    business_key: text(input.business_key, 191, 'BUSINESS_KEY'),
    provider: input.provider == null ? null : text(input.provider, 80, 'PROVIDER'),
    payload_ref: text(input.payload_ref, 512, 'PAYLOAD_REF'),
    max_attempts: integer(input.max_attempts, 1, 1000, 'MAX_ATTEMPTS'),
  };
}
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const leaseWhere = "id=? AND status='RUNNING' AND lease_owner=? AND lease_token=? AND lease_until>CURRENT_TIMESTAMP(6)";
const leaseValues = (job) => [job.id, job.lease_owner, job.lease_token];
function fenced(result) { if (result.affectedRows !== 1) throw error('LEASE_LOST'); }
function backoffMs(attempts) { return Math.min(300000, 1000 * 2 ** Math.min(18, Math.max(0, attempts - 1))); }

function createJobRepository(db) {
  async function insertJob(tx, input) {
    const value = spec(input), digest = hash(value);
    await tx.execute(`INSERT INTO platform_jobs
      (id,task_type,business_key,provider,payload_ref,max_attempts,intent_hash) VALUES (?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE id=id`, [randomUUID(), value.task_type, value.business_key, value.provider, value.payload_ref, value.max_attempts, digest]);
    const [[row]] = await tx.execute('SELECT * FROM platform_jobs WHERE task_type=? AND business_key=?', [value.task_type, value.business_key]);
    if (row.intent_hash !== digest) throw error('JOB_IDEMPOTENCY_CONFLICT');
    return row;
  }
  return Object.freeze({
    // Pass the domain transaction to atomically persist a business change and its task.
    enqueue: (input, tx) => tx ? insertJob(tx, input) : db.withTransaction((scope) => insertJob(scope, input)),
    async get(id) {
      const [[row]] = await db.execute('SELECT * FROM platform_jobs WHERE id=?', [id]);
      return row || null;
    },
    async claim(owner, leaseMs) {
      text(owner, 191, 'LEASE_OWNER'); integer(leaseMs, 100, 3600000, 'LEASE_MS');
      return db.withTransaction(async (tx) => {
        const [[row]] = await tx.execute(`SELECT * FROM platform_jobs WHERE
          (status IN ('PENDING','RETRY') AND next_run_at<=CURRENT_TIMESTAMP(6))
          OR (status='RUNNING' AND lease_until<=CURRENT_TIMESTAMP(6))
          ORDER BY next_run_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`);
        if (!row) return null;
        if (row.attempts >= row.max_attempts) {
          await tx.execute(`UPDATE platform_jobs SET status='FAILED',last_error='ATTEMPTS_EXHAUSTED',
            lease_owner=NULL,lease_token=NULL,lease_until=NULL WHERE id=?`, [row.id]);
          return null;
        }
        const token = randomUUID();
        await tx.execute(`UPDATE platform_jobs SET status='RUNNING',attempts=attempts+1,lease_owner=?,lease_token=?,
          lease_until=TIMESTAMPADD(MICROSECOND,?,CURRENT_TIMESTAMP(6)) WHERE id=?`, [owner, token, leaseMs * 1000, row.id]);
        const [[claimed]] = await tx.execute('SELECT * FROM platform_jobs WHERE id=?', [row.id]);
        return claimed;
      });
    },
    async heartbeat(job, leaseMs) {
      integer(leaseMs, 100, 3600000, 'LEASE_MS');
      const [result] = await db.execute(`UPDATE platform_jobs SET lease_until=TIMESTAMPADD(MICROSECOND,?,CURRENT_TIMESTAMP(6)) WHERE ${leaseWhere}`, [leaseMs * 1000, ...leaseValues(job)]);
      fenced(result);
    },
    async saveProviderTask(job, providerTaskId) {
      if (!job.provider) throw error('JOB_HAS_NO_PROVIDER');
      text(providerTaskId, 191, 'PROVIDER_TASK_ID');
      const [result] = await db.execute(`UPDATE platform_jobs SET provider_task_id=? WHERE ${leaseWhere}
        AND (provider_task_id IS NULL OR provider_task_id=?)`, [providerTaskId, ...leaseValues(job), providerTaskId]);
      fenced(result);
    },
    async finish(job, outcome) {
      if (!outcome || !['SUCCEEDED','RETRY','FAILED','BLOCKED'].includes(outcome.status)) throw error('INVALID_JOB_OUTCOME');
      const resultRef = outcome.status === 'SUCCEEDED' ? text(outcome.result_ref, 512, 'RESULT_REF') : null;
      const code = outcome.status === 'SUCCEEDED' ? null : text(outcome.error_code, 80, 'ERROR_CODE');
      if (code && !/^[A-Z][A-Z0-9_]*$/.test(code)) throw error('INVALID_ERROR_CODE');
      const status = outcome.status === 'RETRY' && job.attempts >= job.max_attempts ? 'FAILED' : outcome.status;
      const [result] = await db.execute(`UPDATE platform_jobs SET status=?,result_ref=?,last_error=?,
        next_run_at=TIMESTAMPADD(MICROSECOND,?,CURRENT_TIMESTAMP(6)),lease_owner=NULL,lease_token=NULL,lease_until=NULL
        WHERE ${leaseWhere}`, [status, resultRef, code, backoffMs(job.attempts) * 1000, ...leaseValues(job)]);
      fenced(result);
    },
    async manualRetry(id, { actor_ref, reason_ref, additional_attempts }, transaction) {
      text(actor_ref, 191, 'ACTOR_REF'); text(reason_ref, 512, 'REASON_REF');
      integer(additional_attempts, 1, 100, 'ADDITIONAL_ATTEMPTS');
      // Internal trusted operator capability; callers must authorize outside infrastructure.
      const run = async (tx) => {
        const [[row]] = await tx.execute('SELECT * FROM platform_jobs WHERE id=? FOR UPDATE', [id]);
        if (!row || !['FAILED','BLOCKED'].includes(row.status)) throw error('JOB_NOT_RETRYABLE');
        const limit = integer(Math.max(row.max_attempts, row.attempts + additional_attempts), 1, 1000, 'MAX_ATTEMPTS');
        await tx.execute(`INSERT INTO platform_job_retries
          (id,job_id,actor_ref,reason_ref,previous_status,previous_error,attempts_before,max_attempts_before) VALUES (?,?,?,?,?,?,?,?)`,
        [randomUUID(), id, actor_ref, reason_ref, row.status, row.last_error, row.attempts, row.max_attempts]);
        await tx.execute(`UPDATE platform_jobs SET status='RETRY',max_attempts=?,next_run_at=CURRENT_TIMESTAMP(6) WHERE id=?`, [limit, id]);
      };
      return transaction ? run(transaction) : db.withTransaction(run);
    },
    async publish(tx, eventKey, input) {
      if (!tx) throw error('OUTBOX_REQUIRES_TRANSACTION');
      text(eventKey, 191, 'EVENT_KEY'); const value = spec(input), digest = hash(value);
      await tx.execute(`INSERT INTO platform_outbox (id,event_key,job_spec,intent_hash) VALUES (?,?,?,?)
        ON DUPLICATE KEY UPDATE id=id`, [randomUUID(), eventKey, JSON.stringify(value), digest]);
      const [[row]] = await tx.execute('SELECT id,intent_hash FROM platform_outbox WHERE event_key=?', [eventKey]);
      if (row.intent_hash !== digest) throw error('OUTBOX_IDEMPOTENCY_CONFLICT');
      return row.id;
    },
    async dispatchOne() {
      // Dispatch and job insert share ONE transaction: a crash cannot commit one without the other.
      return db.withTransaction(async (tx) => {
        const [[row]] = await tx.execute("SELECT * FROM platform_outbox WHERE status='PENDING' ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED");
        if (!row) return null;
        try {
          const job = await insertJob(tx, typeof row.job_spec === 'string' ? JSON.parse(row.job_spec) : row.job_spec);
          await tx.execute("UPDATE platform_outbox SET status='DISPATCHED',job_id=?,dispatched_at=CURRENT_TIMESTAMP(6) WHERE id=?", [job.id, row.id]);
          return { id: row.id, status: 'DISPATCHED', job_id: job.id };
        } catch (cause) {
          if (cause.code !== 'JOB_IDEMPOTENCY_CONFLICT') throw cause;
          await tx.execute("UPDATE platform_outbox SET status='BLOCKED',last_error=? WHERE id=?", [cause.code, row.id]);
          return { id: row.id, status: 'BLOCKED' };
        }
      });
    },
  });
}
module.exports = { createJobRepository, backoffMs, spec };
