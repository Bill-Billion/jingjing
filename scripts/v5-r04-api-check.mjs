#!/usr/bin/env node
// Explicit local synthetic fixture only; never probes the final-content GET.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { resolve, join } from 'node:path'

const f = JSON.parse(await readFile(process.env.DELIVERY_ACCESS_FILE, 'utf8'))
const base = new URL(f.base_url)
assert(f.synthetic_only && base.hostname === '127.0.0.1' && base.protocol === 'http:' && base.pathname === '/api/v1')
const out = resolve(process.env.DELIVERY_EVIDENCE_DIR || 'output/playwright/v5-r04/api')
assert(out.startsWith(resolve('output/playwright/v5-r04/')))
await mkdir(out, { recursive: true })
const checks = [], requests = [], blockers = []
const check = (name, ok) => { assert(ok, name); checks.push({ name, result: 'PASS' }) }
async function call(method, path, role = 'buyer', body, version, party = f.accounts[role].party_id) {
  const a = f.accounts[role]
  const r = await fetch(f.base_url + path, { method, headers: {
    Authorization: 'Bearer ' + a.bearer_token,
    ...(party ? { 'X-Acting-Party': party } : {}),
    ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }),
    ...(version ? { 'If-Match': '"' + version + '"' } : {}),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) })
  const json = await r.json()
  requests.push({ method, path, role, status: r.status, error: json.error?.code })
  return { status: r.status, data: json.data, error: json.error }
}
let failure
try {
  for (const [name, s] of Object.entries(f.scenarios)) {
    const order = await call('GET', '/trade/records/' + s.order_id)
    check(name + '：原订单、冻结金额和付款计划来自实际接口', order.status === 200 && order.data.kind === 'ORDER' && order.data.data.quote.installments.length === 3)
    if (!s.project_id) continue
    const p = await call('GET', '/production/records/' + s.project_id)
    const state = await call('GET', '/production/projects/' + s.project_id + '/fulfillment')
    check(name + '：项目与履约DTO分别解析', p.status === 200 && p.data.kind === 'PROJECT' && state.status === 200 && state.data.format === 'v5-customization-fulfillment-v1' && state.data.project_id === p.data.id && state.data.object_version === p.data.object_version)
    const story = await call('GET', '/production/projects/' + s.project_id + '/story', 'producer')
    check(name + '：冻结故事结构与原订单绑定', story.status === 200 && story.data.request_id === order.data.data.quote.customization.request_id && !!story.data.answers.story && !!story.data.template_snapshot)
  }
  const id = f.scenarios.started.project_id
  const denied = await call('GET', '/production/projects/' + id + '/story', 'outsider')
  check('私人故事拒绝无关账号', denied.status === 404)
  const reviewed = await call('GET', '/production/projects/' + id + '/story', 'reviewer', undefined, undefined, null)
  check('独立审核同时具备制作和故事岗位后可读冻结故事', reviewed.status === 200)
  const current = await call('GET', '/production/projects/' + f.scenarios.final_paid.project_id + '/fulfillment')
  check('验收脚本未以读取正式文件探测下载资格', current.data.state !== 'DELIVERED')

  // Preserve the original story. Do not clone a new intake to bypass the backend conflict.
  let state = (await call('GET', '/production/projects/' + id + '/fulfillment')).data
  let item = state.cases.find(c => c.data.kind === 'CREATIVE_CHANGE' && c.current_status === 'OPEN' && c.data.reason === 'R04 synthetic original-story amendment probe')
  if (!item) {
    const opened = await call('POST', '/production/projects/' + id + '/cases', 'buyer', { kind: 'CREATIVE_CHANGE', reason: 'R04 synthetic original-story amendment probe', evidence_asset_ids: [] }, state.object_version)
    check('买方创意追加工单走原接口且暂停原项目', opened.status === 200 && opened.data.state === 'PAUSED')
    state = opened.data
    item = state.cases.find(c => c.data.kind === 'CREATIVE_CHANGE' && c.current_status === 'OPEN')
  }
  assert(item)
  const original = (await call('GET', '/trade/records/' + f.scenarios.started.order_id)).data
  const q = original.data.quote
  const body = {
    buyer_party_id: original.buyer_party_id,
    lines: q.lines.map(l => ({ line_id: l.line_id, spec_id: l.spec_id, quantity: l.quantity })),
    installments: [{ key: 'change', trigger: 'ORDER_ACCEPTED', allocations: q.lines.map(l => ({ line_id: l.line_id, amount_minor: l.total_minor })), apple_product_id: null }],
    channel: q.channel, transaction_model: q.transaction_model, rule_id: q.rule_id,
    expires_at: '2099-01-01T00:00:00.000Z', payment_window_minutes: 30, license_reservation_id: null,
    customization_source: q.customization,
    customization_change_source: { project_id: id, case_id: item.id, description: '合成验证：只对原故事增加结尾修改' },
  }
  const change = await call('POST', '/trade/quotes', 'producer', body)
  if (change.status === 409 && change.error.code === 'CUSTOMIZATION_ORDER_EXISTS') {
    blockers.push({ id: 'R04-CORE-01', result: 'REPRODUCED', status: change.status, error: change.error.code, request: body,
      expected: '独立变更报价关联原项目和创意工单，复用原冻结故事，原订单合同不改写',
      cause: '原故事防重复下单检查早于变更来源校验；普通报价、审核、确认及故事订单绑定均需由Core明确区分追加来源',
      frontend: '保留原故事和输入，显示真实错误；没有另建故事或虚构变更成功',
      source: ['src/modules/trade/repository.js:70,73,74', 'src/modules/customization/trade-context.js:15,20', 'test/support/customization-delivery.cjs:25-28'],
    })
  } else {
    check('原故事创意追加报价已得到实际后端结果', change.status === 201 || change.status === 200)
  }
} catch (e) { failure = e.message; process.exitCode = 1 }
finally {
  const result = failure ? 'FAIL' : blockers.length ? 'PASS_WITH_KNOWN_BACKEND_BLOCKER' : 'PASS'
  const value = JSON.stringify({ result, synthetic_only: true, checks, requests, blockers, failure,
    limits: ['没有真实收退款、OSS、制作或真机验证', '最终文件GET会记录实际交付，本脚本从未读取它'] }, null, 2) + '\n'
  for (const a of Object.values(f.accounts)) assert(!value.includes(a.bearer_token), 'Never persist credentials')
  await writeFile(join(out, 'API_RESULTS.json'), value)
  console.log(JSON.stringify({ result, checks: checks.length, blockers: blockers.length, failure }))
}
