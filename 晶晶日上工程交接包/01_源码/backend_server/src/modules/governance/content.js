'use strict';
// Internal, pure content format. Authorization, persistence and signatures belong to services.
const {createHash, timingSafeEqual} = require('node:crypto');
const MAX_BYTES = 65536;
const fail = code => { throw Object.assign(new Error(code), {code}); };

function canonical(value) {
  const visiting = new Set();
  let nodes = 0;
  function visit(item, depth) {
    if (++nodes > 4096 || depth > 24) fail('CONTENT_TOO_COMPLEX');
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'string') {
      if (item.length > MAX_BYTES || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(item)) fail('INVALID_TEXT');
      return item;
    }
    if (typeof item === 'number') {
      if (!Number.isFinite(item) || Math.abs(item) > Number.MAX_SAFE_INTEGER || Object.is(item, -0)) fail('INVALID_NUMBER');
      return item;
    }
    if (!item || typeof item !== 'object') fail('NON_JSON_CONTENT');
    if (visiting.has(item)) fail('CYCLIC_CONTENT');
    const array = Array.isArray(item);
    if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(item))) fail('NON_JSON_CONTENT');
    const descriptors = Object.getOwnPropertyDescriptors(item);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some(k => typeof k !== 'string' || (!array || k !== 'length') && (!descriptors[k].enumerable || !Object.hasOwn(descriptors[k], 'value')))) fail('NON_JSON_CONTENT');
    visiting.add(item);
    let output;
    if (array) {
      if (item.length > 4096 || keys.length !== item.length + 1) fail('NON_JSON_CONTENT');
      output = [];
      for (let i = 0; i < item.length; i++) {
        if (!Object.hasOwn(descriptors, String(i))) fail('NON_JSON_CONTENT');
        output.push(visit(descriptors[i].value, depth + 1));
      }
    } else {
      output = Object.fromEntries(keys.sort().map(k => [visit(k, depth + 1), visit(descriptors[k].value, depth + 1)]));
    }
    visiting.delete(item);
    return output;
  }
  const text = JSON.stringify(visit(value, 0));
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) fail('CONTENT_TOO_LARGE');
  return text;
}
const copy = value => JSON.parse(canonical(value));
const digest = value => createHash('sha256').update(canonical(value), 'utf8').digest('hex');
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function shape(value, keys) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) fail('INVALID_CONTENT_SHAPE');
}
function ref(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)) fail('INVALID_REFERENCE');
}
function label(value, max) {
  if (typeof value !== 'string' || !value.trim() || Array.from(value).length > max) fail('INVALID_LABEL');
}
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) fail('INVALID_INSTANT');
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) fail('INVALID_INSTANT');
  return time;
}
function objectTerms(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || !Object.keys(value).length) fail('MISSING_TERMS');
}
function hashed(body) { return freeze(copy({...body, content_sha256: digest(body)})); }
function checkHash(record) {
  const {content_sha256, ...body} = record;
  if (typeof content_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(content_sha256) || !timingSafeEqual(Buffer.from(content_sha256, 'hex'), Buffer.from(digest(body), 'hex'))) fail('CONTENT_HASH_MISMATCH');
}
const ruleFields = ['format_version', 'id', 'rule_key', 'version', 'terms', 'content_sha256'];
function checkRule(content) {
  shape(content, ruleFields);
  if (content.format_version !== 'rule-content-v1') fail('UNKNOWN_CONTENT_FORMAT');
  ref(content.id); label(content.rule_key, 100); label(content.version, 64); objectTerms(content.terms); checkHash(content);
}
function createRuleContent(input) {
  const body = copy(input);
  shape(body, ['id', 'rule_key', 'version', 'terms']);
  ref(body.id); label(body.rule_key, 100); label(body.version, 64); objectTerms(body.terms);
  return hashed({format_version: 'rule-content-v1', ...body});
}
function verifyRuleContent(input) { const value = copy(input); checkRule(value); return freeze(value); }

// Caller must load these status facts from an authorized repository, not an HTTP body.
function usableRule(input, at) {
  const row = copy(input);
  shape(row, ['content', 'current_status', 'effective_at']);
  checkRule(row.content);
  if (row.current_status !== 'EFFECTIVE' || instant(row.effective_at) > instant(at)) fail('RULE_NOT_EFFECTIVE');
  return row.content;
}
const snapshotFields = ['format_version', 'id', 'contract_version_id', 'party_ids', 'created_at', 'rule_contents', 'commitments', 'object_version', 'current_status', 'signing_method', 'content_sha256'];
function checkSnapshot(value) {
  shape(value, snapshotFields);
  if (value.format_version !== 'contract-content-v1') fail('UNKNOWN_CONTENT_FORMAT');
  ref(value.id); ref(value.contract_version_id); instant(value.created_at); objectTerms(value.commitments);
  if (value.object_version !== 1 || value.current_status !== 'SEALED' || value.signing_method !== 'NOT_SIGNED') fail('INVALID_SNAPSHOT_STATE');
  if (!Array.isArray(value.party_ids) || !value.party_ids.length || value.party_ids.length > 100) fail('INVALID_PARTIES');
  value.party_ids.forEach(ref);
  if (new Set(value.party_ids).size !== value.party_ids.length) fail('DUPLICATE_PARTY');
  if (!Array.isArray(value.rule_contents) || !value.rule_contents.length || value.rule_contents.length > 100) fail('INVALID_RULES');
  value.rule_contents.forEach(checkRule);
  if (new Set(value.rule_contents.map(r => r.id)).size !== value.rule_contents.length || new Set(value.rule_contents.map(r => r.rule_key)).size !== value.rule_contents.length) fail('CONFLICTING_RULES');
  checkHash(value);
}
function sealUnsignedContent(input) {
  const body = copy(input);
  shape(body, ['id', 'contract_version_id', 'party_ids', 'created_at', 'rules', 'commitments']);
  instant(body.created_at);
  if (!Array.isArray(body.rules)) fail('INVALID_RULES');
  const rules = body.rules.map(row => usableRule(row, body.created_at));
  const value = hashed({format_version: 'contract-content-v1', id: body.id, contract_version_id: body.contract_version_id,
    party_ids: body.party_ids, created_at: body.created_at, rule_contents: rules, commitments: body.commitments,
    object_version: 1, current_status: 'SEALED', signing_method: 'NOT_SIGNED'});
  checkSnapshot(value);
  return value;
}
function verifyUnsignedContent(input) {
  const value = copy(input);
  checkSnapshot(value); // Historical content is verified without re-evaluating today's rule status.
  return freeze(value);
}
module.exports = {canonical, digest, createRuleContent, verifyRuleContent, sealUnsignedContent, verifyUnsignedContent};
