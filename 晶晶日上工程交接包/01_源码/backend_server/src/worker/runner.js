'use strict';
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');

function createWorker({ repository, handlers, owner = randomUUID(), leaseMs = 30000, pollMs = 1000, log = () => {} }) {
  if (!(handlers instanceof Map)) throw new Error('WORKER_HANDLERS_INVALID');
  if (!Number.isInteger(leaseMs) || leaseMs < 300 || leaseMs > 3600000 || !Number.isInteger(pollMs) || pollMs < 1 || pollMs > 60000) throw new Error('WORKER_TIMING_INVALID');
  let stopped = false, active = null, busy = false, looping = false;
  const wake = new AbortController();
  const emit = (event, job) => log({ event, job_id: job?.id, task_type: job?.task_type });
  async function tick() {
    if (stopped || busy) return false;
    busy = true;
    try {
      const dispatched = await repository.dispatchOne();
      if (dispatched?.status === 'BLOCKED') emit('outbox_blocked');
      if (stopped) return false;
      const job = await repository.claim(owner, leaseMs);
      if (!job) return Boolean(dispatched);
      if (stopped) return true;
      const controller = new AbortController(); active = controller;
      const pulseStop = new AbortController();
      let lost = false;
      const pulse = (async () => {
        while (!pulseStop.signal.aborted) {
          try { await delay(Math.floor(leaseMs / 3), undefined, { signal: pulseStop.signal }); }
          catch (error) { if (error.name === 'AbortError') return; throw error; }
          try { await repository.heartbeat(job, leaseMs); }
          catch { lost = true; controller.abort(); emit('job_lease_lost', job); return; }
        }
      })();
      try {
        const handler = handlers.get(job.task_type);
        // On repeat delivery a provider adapter MUST reconcile by persisted task ID/stable key.
        const recovering = Boolean(job.provider && (job.attempts > 1 || job.provider_task_id));
        const fn = recovering ? handler?.recover : handler?.execute;
        let outcome;
        if (typeof fn !== 'function') outcome = { status: 'BLOCKED', error_code: recovering ? 'PROVIDER_RECOVERY_UNAVAILABLE' : 'HANDLER_NOT_ENABLED' };
        else {
          outcome = await fn(job, {
            signal: controller.signal,
            idempotency_key: job.id,
            saveProviderTask: (id) => repository.saveProviderTask(job, id),
          });
        }
        if (lost || stopped) return true; // Leave the lease for recovery; do not claim completion on shutdown.
        await repository.finish(job, outcome);
        emit('job_outcome_saved', job);
      } catch (error) {
        if (!lost && !stopped && error.code !== 'LEASE_LOST') {
          // Exceptions have unknown external effect. Only explicit RETRY outcomes are retried automatically.
          await repository.finish(job, { status: 'BLOCKED', error_code: 'HANDLER_OUTCOME_UNKNOWN' });
          emit('job_blocked', job);
        }
      } finally {
        pulseStop.abort(); await pulse; active = null;
      }
      return true;
    } finally { busy = false; }
  }
  return Object.freeze({
    tick,
    stop() { stopped = true; active?.abort(); wake.abort(); },
    async run() {
      if (looping) throw new Error('WORKER_ALREADY_RUNNING');
      looping = true;
      try {
        while (!stopped) {
          if (!await tick() && !stopped) {
            try { await delay(pollMs, undefined, { signal: wake.signal }); }
            catch (error) { if (error.name !== 'AbortError') throw error; }
          }
        }
      } finally { looping = false; }
    },
  });
}
module.exports = { createWorker };
