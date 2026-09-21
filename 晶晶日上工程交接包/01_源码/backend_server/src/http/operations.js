'use strict';
const express = require('express');
const { status } = require('../infrastructure/database/migrator');
function createOperationsRouter({ databaseReady = async () => false, timeoutMs = 1500 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw new Error('INVALID_HEALTH_TIMEOUT');
  const router = express.Router();
  const reply = (req,res,code,current_status) => res.status(code).set('Cache-Control','no-store').json({
    meta:{ request_id:req.requestId, actor:null, acting_party:null }, data:{ current_status },
  });
  router.get('/health',(req,res) => reply(req,res,200,'UP'));
  router.get('/ready',async(req,res) => {
    let timer, ready = false;
    try { ready = await Promise.race([Promise.resolve().then(databaseReady),new Promise((resolve) => { timer=setTimeout(() => resolve(false),timeoutMs); })]) === true; }
    catch { ready=false; } finally { clearTimeout(timer); }
    reply(req,res,ready ? 200 : 503,ready ? 'READY' : 'NOT_READY');
  });
  return router;
}
function mysqlReady(db) {
  return async () => {
    await db.execute('SELECT 1');
    const schema = await status(db);
    return schema.migrations.length > 0 && schema.migrations.every((migration) => migration.status === 'APPLIED');
  };
}
module.exports = { createOperationsRouter, mysqlReady };
