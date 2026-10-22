#!/usr/bin/env node
// Prepare only an artist-owned synthetic agreement; the App performs the confirmation.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { resolve, basename, dirname, join } from 'node:path'
const access = resolve(process.env.DELIVERY_ACCESS_FILE)
const f = JSON.parse(await readFile(access, 'utf8'))
assert(f.synthetic_only && new URL(f.base_url).hostname === '127.0.0.1' && new URL(f.base_url).pathname === '/api/v1')
assert(/^jx_test_delivery_[0-9]+_[a-f0-9]{12}$/.test(basename(dirname(access))))
const out = resolve('output/playwright/v5-r04/manual')
await mkdir(out, { recursive: true })
const ledgerFile = join(dirname(access), 'manual-prepare-operations.json')
let ledger = {}
try { ledger = JSON.parse(await readFile(ledgerFile, 'utf8')) } catch (e) { if (e.code !== 'ENOENT') throw e }
const requests = [], checks = []
async function call(name, method, path, role, body, version, acting = true) {
  const a = f.accounts[role]
  let op
  if (method === 'POST') {
    op = ledger[name]
    if (!op) {
      op = ledger[name] = { path, body, version, key: randomUUID() }
      await writeFile(ledgerFile, JSON.stringify(ledger, null, 2), { mode: 0o600 })
    }
    assert.equal(op.path, path)
  }
  const r = await fetch(f.base_url + path, { method, headers: {
    Authorization: 'Bearer ' + a.bearer_token,
    ...(acting ? { 'X-Acting-Party': a.party_id } : {}),
    ...(op ? { 'Content-Type': 'application/json', 'Idempotency-Key': op.key } : {}),
    ...(op?.version ? { 'If-Match': '"' + op.version + '"' } : {}),
  }, ...(op ? { body: JSON.stringify(op.body) } : {}), signal: AbortSignal.timeout(10000) })
  const result = await r.json()
  requests.push({ name, method, path, role, status: r.status, error: result.error?.code })
  assert(r.ok, name + ': ' + r.status + ' ' + result.error?.code)
  return result.data
}
let requestId, failure
try {
  const categories = await call('categories', 'GET', '/customization-categories', 'artist', undefined, undefined, false)
  const category = categories.items.find(c => c.category_code === 'synthetic_r04' && c.submission_available)
  assert(category?.template_version_id)
  const flow = await call('cast', 'GET', '/production/projects/' + f.scenarios.performer.project_id + '/fulfillment', 'producer')
  const project = await call('project', 'GET', '/production/records/' + f.scenarios.performer.project_id, 'producer')
  assert.equal(flow.cast.length, 1)
  const created = await call('create', 'POST', '/customization-requests', 'artist', { template_version_id: category.template_version_id, answers: { story: 'R04人工样片本人约定截图，仅合成测试，不形成真实付款或交付。' } })
  requestId = created.id
  const submitted = await call('submit', 'POST', '/customization-requests/' + requestId + '/submissions', 'artist', {}, created.object_version)
  const accepted = await call('intake', 'POST', '/operations/customization-requests/' + requestId + '/intake', 'producer', {}, submitted.object_version, false)
  await call('bind', 'POST', '/customization-requests/' + requestId + '/manual-sample', 'artist', {
    cast: { uses_identifiable_people: true, cast: flow.cast }, merchant_party_id: f.accounts.producer.party_id, territory: project.data.territory,
    terms: '仅供R04隔离合成测试：使用本人已授权的既有素材制作人工样片，所有权仍归艺人本人。本次仅确认具体素材和委托约定，尚未形成订单、付款或成片交付。',
  }, accepted.object_version)
  const agreement = await call('read', 'GET', '/customization-requests/' + requestId + '/manual-sample', 'artist')
  assert.equal(agreement.data.rights_owner_party_id, f.accounts.artist.party_id)
  assert.equal(agreement.data.confirmation, null)
  assert.equal(agreement.projects.length, 0)
  checks.push('本人创建、提交和绑定，平台以独立岗位受理', '具体既有素材和权利来自同一fixture的真实接口', '本人确认留给App实际操作；没有订单、付款、成片或通用项目权限前置')
} catch (e) { failure = e.message; process.exitCode = 1 }
const value = JSON.stringify({ result: failure ? 'FAIL' : 'PASS', synthetic_only: true, request_id: requestId, requests, checks, failure }, null, 2) + '\n'
for (const a of Object.values(f.accounts)) assert(!value.includes(a.bearer_token))
await writeFile(join(out, 'MANUAL_PREPARE_RESULTS.json'), value)
console.log(JSON.stringify({ result: failure ? 'FAIL' : 'PASS', request_id: requestId, failure }))
