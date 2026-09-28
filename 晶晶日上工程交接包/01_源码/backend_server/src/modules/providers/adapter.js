'use strict';
const { descriptor, assertUsable, failure } = require('./readiness');
const { createLogger } = require('../../infrastructure/observability');
const methods = Object.freeze({ IdentityProvider:['verify'],PaymentProvider:['create','query','refund'],ObjectStorageProvider:['put','get','sign','remove'],
  ModerationProvider:['inspect'],DigitalHumanProvider:['submit','query'],ESignProvider:['create','query'],SmsProvider:['send'] });
function createAdapter({ provider, repository, inspect, operations = {}, logger = createLogger(), timeoutMs = 15000 }) {
  const identity = descriptor(provider);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw failure('INVALID_PROVIDER_TIMEOUT');
  return Object.freeze({
    identity,
    async inspect() { return inspect ? inspect() : { implemented:false, configured:false }; },
    async call(method, input, context = {}) {
      const controller = new AbortController(); let timer;
      const meta = { request_id:context.request_id, actor:context.actor, acting_party:context.acting_party, job_id:context.job_id,
        payment_tx_id:context.payment_tx_id, provider_code:identity.provider_code, capability_code:identity.capability_code };
      if (!methods[identity.provider_kind].includes(method) || typeof operations[method] !== 'function') {
        logger.warn('provider_call_blocked', { ...meta, error_code:'PROVIDER_OPERATION_NOT_IMPLEMENTED' });
        throw failure('PROVIDER_OPERATION_NOT_IMPLEMENTED');
      }
      try { await assertUsable(repository, identity, await this.inspect()); }
      catch (cause) {
        const known = ['PROVIDER_NOT_IMPLEMENTED','PROVIDER_NOT_CONFIGURED','PROVIDER_ENVIRONMENT_NOT_VERIFIED','PROVIDER_NOT_VERIFIED','PROVIDER_CONFIGURATION_CHANGED','VERIFICATION_EVIDENCE_REQUIRED'];
        const code = known.includes(cause?.code) ? cause.code : 'PROVIDER_STATE_UNAVAILABLE';
        logger.warn('provider_call_blocked', { ...meta, error_code:code });
        throw failure(code);
      }
      logger.info('provider_call_started', meta);
      try {
        // No automatic retry: timeout may mean the provider accepted the operation.
        const result = await Promise.race([
          Promise.resolve().then(() => operations[method](input, { ...context, signal:controller.signal })),
          new Promise((_,reject) => { timer=setTimeout(() => { controller.abort(); reject(failure('PROVIDER_OUTCOME_UNKNOWN')); },timeoutMs); }),
        ]);
        logger.info('provider_call_returned', { ...meta, provider_request_id:result?.provider_request_id });
        return result;
      } catch (cause) {
        const code = cause?.code === 'PROVIDER_OUTCOME_UNKNOWN' ? cause.code : 'PROVIDER_CALL_FAILED';
        logger.error('provider_call_failed', { ...meta, error_code:code });
        throw failure(code); // No raw provider response/credential in public errors.
      } finally { clearTimeout(timer); }
    },
  });
}
module.exports = { methods, createAdapter };
