'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');
const { randomUUID } = require('node:crypto');
const context = new AsyncLocalStorage();
const allowed = new Set(['request_id','actor','acting_party','provider_code','capability_code','provider_request_id','job_id','payment_tx_id','method','status_code','duration_ms','error_code']);
function safeFields(input = {}) {
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key)) continue;
    if (typeof value === 'number' && Number.isFinite(value)) result[key] = value;
    else if (typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,128}$/.test(value)) result[key] = value;
  }
  return result;
}
function createLogger(write = (line, level) => (level === 'error' ? console.error(line) : console.log(line))) {
  const log = (level, event, meta) => {
    // Allowlist avoids exposing nested credentials, raw provider bodies or signed URLs.
    const record = { ...safeFields(context.getStore()), ...safeFields(meta), time: new Date().toISOString(), level,
      event: /^[a-zA-Z0-9_.:-]{1,100}$/.test(event) ? event : 'unclassified_event' };
    write(JSON.stringify(record), level);
  };
  return Object.freeze({ info: (event, meta) => log('info',event,meta), warn: (event,meta) => log('warn',event,meta), error: (event,meta) => log('error',event,meta) });
}
function requestContext(logger = createLogger()) {
  return (req,res,next) => {
    const request_id = randomUUID(); // Never trust client-supplied actor/party or unbounded request IDs.
    req.requestId = request_id; res.setHeader('X-Request-Id', request_id);
    const started = Date.now();
    context.run({ request_id }, () => {
      res.once('finish', () => logger.info('http_request_finished', { request_id, method:req.method, status_code:res.statusCode, duration_ms:Date.now()-started }));
      next();
    });
  };
}
module.exports = { createLogger, requestContext, context };
