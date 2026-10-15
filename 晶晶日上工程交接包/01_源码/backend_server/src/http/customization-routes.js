'use strict';
const express = require('express');
const { createHmac, timingSafeEqual } = require('node:crypto');
const { createCustomizationRepository } = require('../modules/customization/repository');
const { shape, id, ref, version, error } = require('../modules/party/policy');

// Authenticated HTTP boundary only. Business facts and permissions live in the repository.
function createCustomizationRouter({ db, resolvePrincipal, secret }) {
  const router = express.Router();
  const repo = createCustomizationRepository(db, { resolvePrincipal });
  const wrap = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
  const key = req => ref(req.get('Idempotency-Key'));
  function acting(req, required = true) {
    const value = req.get('X-Acting-Party');
    if (!value && required) throw error('ACTING_PARTY_REQUIRED', 400);
    req.actingParty = value ? id(value) : null;
    return req.actingParty;
  }
  function operator(req) {
    if (req.get('X-Acting-Party')) throw error('ACTING_PARTY_NOT_ALLOWED', 400);
    req.actingParty = null;
  }
  function expected(req) {
    const value = req.get('If-Match');
    if (!value) throw error('EXPECTED_VERSION_REQUIRED', 428);
    if (!/^"[1-9][0-9]*"$/.test(value)) throw error('INVALID_VERSION', 400);
    return version(Number(value.slice(1, -1)));
  }
  function reply(req, res, data) {
    if (data.object_version) res.set('ETag', '"' + data.object_version + '"');
    res.status(200).json({ meta: { request_id: req.requestId, actor: { account_id: req.account.id }, acting_party: req.actingParty || null }, data });
  }
  function mac(req, scope, encoded) {
    return createHmac('sha256', secret).update(JSON.stringify(['customization-cursor-v1', req.account.id, req.actingParty || null, scope, encoded])).digest('hex');
  }
  function page(req, isOperator = false, historyId = null) {
    shape(req.query, historyId ? ['cursor','limit'] : ['cursor', 'limit', 'current_status']);
    const limitText = req.query.limit;
    if (limitText !== undefined && (typeof limitText !== 'string' || !/^[1-9][0-9]{0,2}$/.test(limitText))) throw error('INVALID_LIMIT', 400);
    const limit = limitText === undefined ? 20 : Number(limitText);
    if (limit > 100) throw error('INVALID_LIMIT', 400);
    const current_status = req.query.current_status ?? null;
    const statuses = isOperator ? ['SUBMITTED', 'INTAKE'] : ['DRAFT', 'SUBMITTED', 'INTAKE'];
    if (current_status !== null && !statuses.includes(current_status)) throw error('INVALID_FILTER', 400);
    const scope = JSON.stringify(historyId ? ['submission-history',historyId] : [isOperator ? 'intake' : 'own', current_status]);
    let after = '';
    if (req.query.cursor !== undefined) {
      try {
        const cursor = req.query.cursor;
        if (typeof cursor !== 'string' || cursor.length > 256) throw Error();
        const [encoded, signature, extra] = cursor.split('.');
        if (!encoded || !signature || extra !== undefined || !/^[A-Za-z0-9_-]+$/.test(encoded) || !/^[a-f0-9]{64}$/.test(signature)) throw Error();
        if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(mac(req, scope, encoded), 'hex'))) throw Error();
        after = id(Buffer.from(encoded, 'base64url').toString('utf8'));
      } catch { throw error('INVALID_CURSOR', 400); }
    }
    return { after, limit, current_status, scope };
  }
  function paged(req, res, data, scope) {
    let next_cursor = null;
    if (data.next_cursor) {
      const encoded = Buffer.from(id(data.next_cursor)).toString('base64url');
      next_cursor = encoded + '.' + mac(req, scope, encoded);
    }
    reply(req, res, { items: data.items, next_cursor });
  }
  router.get('/customization-categories', wrap(async (req, res) => {
    shape(req.query, []); operator(req);
    reply(req, res, await repo.categories(req));
  }));
  router.post('/customization-requests', wrap(async (req, res) => {
    shape(req.query, []); shape(req.body, ['template_version_id', 'answers']);
    reply(req, res, await repo.create(req, { party_id: acting(req), ...req.body, operation_key: key(req) }));
  }));
  router.get('/customization-requests', wrap(async (req, res) => {
    const party_id = acting(req), p = page(req);
    paged(req, res, await repo.list(req, { party_id, after: p.after, limit: p.limit, current_status: p.current_status }), p.scope);
  }));
  router.get('/customization-requests/:request_id', wrap(async (req, res) => {
    shape(req.query, []);
    reply(req, res, await repo.get(req, { request_id: id(req.params.request_id), party_id: acting(req, false) }));
  }));
  router.patch('/customization-requests/:request_id', wrap(async (req, res) => {
    shape(req.query, []); shape(req.body, ['answers']);
    reply(req, res, await repo.save(req, { request_id: id(req.params.request_id), party_id: acting(req), ...req.body, expected_version: expected(req), operation_key: key(req) }));
  }));
  router.post('/customization-requests/:request_id/submissions', wrap(async (req, res) => {
    shape(req.query, []); shape(req.body, []);
    reply(req, res, await repo.submit(req, { request_id: id(req.params.request_id), party_id: acting(req), expected_version: expected(req), operation_key: key(req) }));
  }));
  router.get('/operations/customization-requests', wrap(async (req, res) => {
    operator(req); const p = page(req, true);
    paged(req, res, await repo.inbox(req, { after: p.after, limit: p.limit, current_status: p.current_status }), p.scope);
  }));
  router.post('/operations/customization-requests/:request_id/intake', wrap(async (req, res) => {
    shape(req.query, []); shape(req.body, []); operator(req);
    reply(req, res, await repo.intake(req, { request_id: id(req.params.request_id), expected_version: expected(req), operation_key: key(req) }));
  }));
  router.get('/customization-requests/:request_id/supplement', wrap(async (req,res)=>{
    shape(req.query,[]);reply(req,res,await repo.getSupplement(req,{request_id:id(req.params.request_id),party_id:acting(req,false)}));
  }));
  router.post('/operations/customization-requests/:request_id/supplements',wrap(async(req,res)=>{
    shape(req.query,[]);shape(req.body,['items']);operator(req);
    reply(req,res,await repo.requestSupplement(req,{request_id:id(req.params.request_id),items:req.body.items,expected_version:expected(req),operation_key:key(req)}));
  }));
  router.patch('/customization-requests/:request_id/supplement',wrap(async(req,res)=>{
    shape(req.query,[]);shape(req.body,['answers','responses']);
    reply(req,res,await repo.saveSupplement(req,{request_id:id(req.params.request_id),party_id:acting(req),...req.body,expected_version:expected(req),operation_key:key(req)}));
  }));
  router.post('/customization-requests/:request_id/supplement-submissions',wrap(async(req,res)=>{
    shape(req.query,[]);shape(req.body,[]);
    reply(req,res,await repo.submitSupplement(req,{request_id:id(req.params.request_id),party_id:acting(req),expected_version:expected(req),operation_key:key(req)}));
  }));
  router.get('/customization-requests/:request_id/submissions',wrap(async(req,res)=>{
    const request_id=id(req.params.request_id),party_id=acting(req,false),p=page(req,false,request_id);
    paged(req,res,await repo.submissionHistory(req,{request_id,party_id,after:p.after,limit:p.limit}),p.scope);
  }));
  router.get('/customization-requests/:request_id/submissions/:submission_id',wrap(async(req,res)=>{
    shape(req.query,[]);reply(req,res,await repo.getSubmission(req,{request_id:id(req.params.request_id),submission_id:id(req.params.submission_id),party_id:acting(req,false)}));
  }));
  return router;
}
module.exports = { createCustomizationRouter };
