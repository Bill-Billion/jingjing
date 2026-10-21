'use strict';
const {randomUUID} = require('node:crypto');
const {id, label, version, error} = require('../party/policy');
const {digest} = require('../governance/content');
const one = async (tx, sql, args = []) => (await tx.execute(sql, args))[0][0];

// Only references leave this boundary. Provider identifiers, project documents and
// other people's contracts must not become visible through a privacy request.
function checked(row) {
  if (!row) throw error('PRIVACY_TARGET_NOT_FOUND', 404);
  const data = typeof row.data_json === 'string' ? JSON.parse(row.data_json) : row.data_json;
  if (digest(data) !== row.data_sha256) throw error('STORED_CONTENT_MISMATCH', 503);
  return {...row, data};
}
function deletionScope(request, decode) {
  const value = decode(request.request_json, request.request_sha256);
  if (!['DELETE', 'CLOSE_ACCOUNT'].includes(value.type) ||
      !value.scopes.some(s => ['ALL', 'ARTIST_MATERIALS', 'DIGITAL_MODELS'].includes(s))) {
    throw error('PRIVACY_ACTION_SCOPE_MISMATCH', 409);
  }
}
async function ownConsent(tx, accountId, consentId, lock = 'FOR SHARE') {
  const row = checked(await one(tx, "SELECT * FROM supply_records WHERE id=? AND kind='CONSENT' " + lock, [id(consentId)]));
  const party = await one(tx, "SELECT id FROM parties WHERE id=? AND kind='PERSON' AND personal_account_id=? FOR SHARE",
    [row.data.consent.subject_party_id, accountId]);
  if (!party) throw error('PRIVACY_TARGET_NOT_FOUND', 404);
  return row;
}
function createPrivacyActions({db, resolvePrincipal, actor, load, owned, command, change, match, decode}) {
  async function withRequest(ctx, input, run) {
    return db.withTransaction(async tx => {
      const account = await actor(tx, ctx);
      const request = await load(tx, input.request_id);
      owned(account, request);
      deletionScope(request, decode);
      return run(tx, account, request);
    });
  }
  const scopedDb = tx => ({withTransaction: fn => fn(tx), execute: (...args) => tx.execute(...args)});
  async function record(tx, account, request, kind, target, resultId) {
    const actionId = randomUUID();
    await tx.execute('INSERT INTO privacy_actions(id,request_id,action_kind,target_id,result_record_id) VALUES (?,?,?,?,?)',
      [actionId, request.id, kind, target, resultId]);
    // A new execution action invalidates a pending response review. Historical
    // responses remain intact; none of these actions completes the whole request.
    const updated = await change(tx, account, request, 'FOLLOW_UP', {},
      'EXECUTION_REQUESTED', kind === 'CONSENT_WITHDRAWAL' ? '本人已撤回指定授权，相关资料清理仍需分别核对' : '已登记指定模型的删除任务，等待核实供应商结果');
    return {request_id: request.id, object_version: updated.object_version, action_id: actionId,
      action_kind: kind, target_id: target, request_completion: 'NOT_CONFIRMED'};
  }
  function page(input) {
    if (input.after) id(input.after);
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) throw error('INVALID_LIMIT', 400);
  }
  return {
    async withdrawConsent(ctx, input) {
      id(input.consent_id); version(input.consent_version); label(input.reason, 1000);
      return withRequest(ctx, input, async (tx, account, request) => {
        const consent = await ownConsent(tx, account.id, input.consent_id, 'FOR UPDATE');
        return command(tx, account, 'WITHDRAW_CONSENT', input, async () => {
          match(request, input.expected_version);
          if (await one(tx, "SELECT id FROM privacy_actions WHERE request_id=? AND action_kind='CONSENT_WITHDRAWAL' AND target_id=?",
              [request.id, consent.id])) throw error('PRIVACY_ACTION_ALREADY_RECORDED', 409);
          if (consent.current_status === 'WITHDRAWN') {
            if (consent.object_version !== input.consent_version) throw error('VERSION_CONFLICT', 412);
          } else {
            await require('../works/repository').createSupplyRepository(scopedDb(tx), {resolvePrincipal})
              .withdrawConsent(ctx, {record_id: consent.id, expected_version: input.consent_version,
                reason: input.reason, operation_key: input.operation_key});
          }
          return record(tx, account, request, 'CONSENT_WITHDRAWAL', consent.id, consent.id);
        });
      });
    },
    async deleteModel(ctx, input) {
      id(input.asset_id); version(input.asset_version);
      return withRequest(ctx, input, async (tx, account, request) => {
        const asset = checked(await one(tx, "SELECT * FROM production_records WHERE id=? AND kind='DIGITAL_ASSET'", [input.asset_id]));
        await ownConsent(tx, account.id, asset.data.consent_id);
        return command(tx, account, 'DELETE_MODEL', input, async () => {
          match(request, input.expected_version);
          if (await one(tx, "SELECT id FROM privacy_actions WHERE request_id=? AND action_kind='MODEL_DELETION' AND target_id=?",
              [request.id, asset.id])) throw error('PRIVACY_ACTION_ALREADY_RECORDED', 409);
          const result = await require('../production/repository').createProductionRepository(scopedDb(tx), {resolvePrincipal})
            .requestPersonalDeletion(ctx, {asset_id: asset.id, expected_version: input.asset_version, operation_key: input.operation_key});
          return record(tx, account, request, 'MODEL_DELETION', asset.id, result.id);
        });
      });
    },
    async modelAssets(ctx, input) {
      page(input);
      return withRequest(ctx, input, async (tx, account, request) => {
        const [rows] = await tx.execute(`SELECT a.* FROM production_records a
          JOIN supply_records c ON c.id=JSON_UNQUOTE(JSON_EXTRACT(a.data_json,'$.consent_id')) AND c.kind='CONSENT'
          JOIN parties p ON p.id=JSON_UNQUOTE(JSON_EXTRACT(c.data_json,'$.consent.subject_party_id'))
          WHERE a.kind='DIGITAL_ASSET' AND p.kind='PERSON' AND p.personal_account_id=? AND a.id>?
          ORDER BY a.id LIMIT ?`, [account.id, input.after || '', input.limit + 1]);
        const items = [];
        for (const raw of rows.slice(0, input.limit)) {
          const asset = checked(raw), consent = await ownConsent(tx, account.id, asset.data.consent_id);
          items.push({asset_id: asset.id, asset_version: asset.object_version, asset_status: asset.current_status,
            consent_id: consent.id, consent_version: consent.object_version, consent_status: consent.current_status,
            avatar_id: asset.data.avatar_id});
        }
        return {request_id: request.id, items, next_cursor: rows.length > input.limit ? rows[input.limit - 1].id : null,
          coverage: 'PRODUCTION_MODELS_ONLY', request_completion: 'NOT_CONFIRMED'};
      });
    },
    async modelCreations(ctx, input) {
      page(input);
      return withRequest(ctx, input, async (tx, account, request) => {
        const [rows] = await tx.execute(`SELECT g.* FROM production_records g
          JOIN supply_records c ON c.id=JSON_UNQUOTE(JSON_EXTRACT(g.data_json,'$.consent_id')) AND c.kind='CONSENT'
          JOIN parties p ON p.id=JSON_UNQUOTE(JSON_EXTRACT(c.data_json,'$.consent.subject_party_id'))
          WHERE g.kind='GENERATION' AND JSON_UNQUOTE(JSON_EXTRACT(g.data_json,'$.operation'))='CREATE_LONG_LIVED'
            AND p.kind='PERSON' AND p.personal_account_id=? AND g.id>?
          ORDER BY g.id LIMIT ?`, [account.id, input.after || '', input.limit + 1]);
        const items = [];
        for (const raw of rows.slice(0, input.limit)) {
          // Match the producer's project -> generation lock order. Never lock a
          // generation first and wait on its project while a worker does the reverse.
          const hint = checked(raw);
          const project = checked(await one(tx, "SELECT * FROM production_records WHERE id=? AND kind='PROJECT' FOR SHARE", [hint.project_id]));
          const generation = checked(await one(tx, "SELECT * FROM production_records WHERE id=? AND kind='GENERATION' FOR SHARE", [raw.id]));
          const consent = await ownConsent(tx, account.id, generation.data.consent_id);
          const job = await one(tx, 'SELECT * FROM platform_jobs WHERE id=? FOR SHARE', [generation.data.job_id]);
          if (generation.data.operation !== 'CREATE_LONG_LIVED' || generation.project_id !== project.id ||
              generation.data.avatar_id !== consent.data.consent.avatar_id ||
              !project.data.consent_ids.includes(consent.id) || project.order_id !== generation.order_id ||
              !job || job.task_type !== 'PRODUCTION_DIGITAL_HUMAN' || job.payload_ref !== generation.id ||
              job.provider !== generation.data.provider_code) throw error('STORED_CONTENT_MISMATCH', 503);
          let asset = null;
          if (generation.current_status === 'SUCCEEDED') {
            let resultId;
            try { resultId = id(generation.data.result?.asset_id); } catch { throw error('STORED_CONTENT_MISMATCH', 503); }
            asset = checked(await one(tx, "SELECT * FROM production_records WHERE id=? AND kind='DIGITAL_ASSET' FOR SHARE", [resultId]));
            if (generation.data.result.asset_type !== 'LONG_LIVED_AVATAR' || asset.data.asset_type !== 'LONG_LIVED_AVATAR' || asset.project_id !== generation.project_id || asset.order_id !== generation.order_id ||
                asset.data.consent_id !== consent.id || asset.data.avatar_id !== generation.data.avatar_id ||
                ['provider_code','environment','config_revision'].some(k => asset.data[k] !== generation.data[k])) {
              throw error('STORED_CONTENT_MISMATCH', 503);
            }
          } else if (generation.data.result !== null || job.status === 'SUCCEEDED') throw error('STORED_CONTENT_MISMATCH', 503);
          const status = asset ? 'MODEL_REGISTERED' : ['BLOCKED','FAILED'].includes(job.status) ? 'NEEDS_ATTENTION'
            : ['RUNNING','RETRY'].includes(job.status) || generation.current_status === 'PENDING' ? 'WAITING_PROVIDER' : 'QUEUED';
          items.push({generation_id:generation.id, consent_id:consent.id, consent_version:consent.object_version,
            consent_status:consent.current_status, avatar_id:generation.data.avatar_id, status, job_status:job.status,
            asset_id:asset?.id || null, asset_version:asset?.object_version || null, asset_status:asset?.current_status || null});
        }
        return {request_id:request.id, items, next_cursor:rows.length > input.limit ? rows[input.limit - 1].id : null,
          coverage:'PRODUCTION_MODEL_CREATIONS_ONLY', request_completion:'NOT_CONFIRMED'};
      });
    },
    async actions(ctx, input) {
      page(input);
      return withRequest(ctx, input, async (tx, account, request) => {
        const [rows] = await tx.execute('SELECT * FROM privacy_actions WHERE request_id=? AND id>? ORDER BY id LIMIT ?',
          [request.id, input.after || '', input.limit + 1]);
        const items = [];
        for (const row of rows.slice(0, input.limit)) {
          let status, jobStatus = null;
          if (row.action_kind === 'CONSENT_WITHDRAWAL') {
            const consent = await ownConsent(tx, account.id, row.target_id);
            status = consent.current_status === 'WITHDRAWN' ? 'CONSENT_WITHDRAWN' : 'NEEDS_ATTENTION';
          } else {
            const asset = checked(await one(tx, "SELECT * FROM production_records WHERE id=? AND kind='DIGITAL_ASSET' FOR SHARE", [row.target_id]));
            await ownConsent(tx, account.id, asset.data.consent_id);
            const generation = checked(await one(tx, "SELECT * FROM production_records WHERE id=? AND kind='GENERATION' FOR SHARE", [row.result_record_id]));
            if (generation.data.operation !== 'DELETE_LONG_LIVED' || generation.data.asset_id !== asset.id ||
                generation.data.consent_id !== asset.data.consent_id || generation.data.avatar_id !== asset.data.avatar_id ||
                generation.project_id !== asset.project_id) throw error('STORED_CONTENT_MISMATCH', 503);
            const job = await one(tx, "SELECT * FROM platform_jobs WHERE id=? FOR SHARE", [generation.data.job_id]);
            if (!job || job.payload_ref !== generation.id || job.task_type !== 'PRODUCTION_DIGITAL_HUMAN') throw error('STORED_CONTENT_MISMATCH', 503);
            jobStatus = job.status;
            status = generation.current_status === 'SUCCEEDED' && generation.data.result?.deleted === true && asset.current_status === 'DELETED'
              ? 'MODEL_DELETED' : ['BLOCKED', 'FAILED'].includes(job.status) ? 'NEEDS_ATTENTION'
                : ['RUNNING', 'RETRY'].includes(job.status) || generation.current_status === 'PENDING' ? 'WAITING_PROVIDER' : 'QUEUED';
          }
          items.push({action_id: row.id, action_kind: row.action_kind, target_id: row.target_id, status, job_status: jobStatus});
        }
        return {request_id: request.id, items, next_cursor: rows.length > input.limit ? rows[input.limit - 1].id : null,
          request_completion: 'NOT_CONFIRMED'};
      });
    },
  };
}
module.exports = {createPrivacyActions};
