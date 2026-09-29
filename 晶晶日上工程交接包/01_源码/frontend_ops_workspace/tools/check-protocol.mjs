#!/usr/bin/env node
/**
 * 账号接口协议自检。
 *
 * 用途：前端 src/api 与 src/config/actions.ts 里写了一批"我假设后端是这样的"，
 * 这个脚本把这些假设逐条打成可执行的断言。桩服务器和真实后端都能跑，
 * 只要地址对——所以将来 PR #11 真合并、后端能起来时，改一下地址就能复核。
 *
 *   node tools/check-protocol.mjs                                  # 默认打桩
 *   node tools/check-protocol.mjs http://127.0.0.1:3000             # 打真实后端
 *
 * 只读 + 创建会话，不做任何破坏性写入（不删主体、不改名称）。
 * 退出码 0 表示全部通过。
 */

const BASE = (process.argv[2] || 'http://127.0.0.1:3210').replace(/\/$/, '')
const PHONE = '13900000001'
const STUB_CODE = '123456'

let pass = 0
let fail = 0
const failures = []

function check(label, condition, detail = '') {
  if (condition) {
    pass += 1
    console.log(`  ✓ ${label}`)
  } else {
    fail += 1
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
    console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`)
  }
}

const uuid = () => crypto.randomUUID()

async function call(path, { method = 'GET', body, token, key, headers = {} } = {}) {
  const h = { Accept: 'application/json', 'X-Request-Id': uuid(), ...headers }
  if (body !== undefined) h['Content-Type'] = 'application/json'
  if (token) h['Authorization'] = `Bearer ${token}`
  if (key) h['Idempotency-Key'] = key
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* 保留 null，让断言去报"响应不是 JSON" */
  }
  return { status: res.status, json, text, headers: res.headers }
}

/** 所有错误响应共有的形状要求 */
function checkErrorEnvelope(label, r, expectCode) {
  const e = r.json?.error
  check(`${label}：状态码 ${r.status}`, r.status === r.__expectStatus, `实际 ${r.status}`)
  check(`${label}：error.code = ${expectCode}`, e?.code === expectCode, `实际 ${e?.code}`)
  check(`${label}：带 meta.request_id`, typeof r.json?.meta?.request_id === 'string' && r.json.meta.request_id.length > 0)
  check(`${label}：retryable 是布尔`, typeof e?.retryable === 'boolean', `实际 ${typeof e?.retryable}`)
  check(`${label}：details 是数组`, Array.isArray(e?.details), `实际 ${typeof e?.details}`)
  check(`${label}：不返回 data 字段`, !('data' in (r.json || {})))
}

async function main() {
  console.log(`\n协议自检目标：${BASE}\n`)

  // ───────── 1. 探针 ─────────
  console.log('[1] 公开探针')
  const health = await call('/health')
  check('/health 返回 2xx', health.status >= 200 && health.status < 300, `实际 ${health.status}`)
  check('/health data.current_status 存在', typeof health.json?.data?.current_status === 'string')
  check('/health 带 meta.request_id', typeof health.json?.meta?.request_id === 'string')
  check('/health 回显 X-Request-Id', !!health.headers.get('X-Request-Id'))

  const ready = await call('/ready')
  const readyStatus = ready.json?.data?.current_status
  check('/ready 只返回 READY 或 NOT_READY', ['READY', 'NOT_READY'].includes(readyStatus), `实际 ${readyStatus}`)
  check(
    '/ready 状态与 HTTP 码一致（READY→2xx，NOT_READY→503）',
    (readyStatus === 'READY' && ready.status === 200) || (readyStatus === 'NOT_READY' && ready.status === 503),
    `status=${ready.status} current_status=${readyStatus}`,
  )

  // ───────── 2. 申请验证码的参数校验 ─────────
  console.log('\n[2] 申请验证码：参数与幂等')
  const noKey = await call('/api/v1/auth/sms-challenges', { method: 'POST', body: { phone: PHONE, purpose: 'LOGIN' } })
  noKey.__expectStatus = 400
  checkErrorEnvelope('缺 Idempotency-Key', noKey, 'INVALID_REFERENCE')
  check(
    '缺 Idempotency-Key 时状态是 4xx（说明幂等键是强制项）',
    noKey.status >= 400 && noKey.status < 500,
    `实际 ${noKey.status}`,
  )

  const extraField = await call('/api/v1/auth/sms-challenges', {
    method: 'POST',
    key: uuid(),
    body: { phone: PHONE, purpose: 'LOGIN', injected: 'x' },
  })
  extraField.__expectStatus = 400
  checkErrorEnvelope('未知字段被拒', extraField, 'INVALID_INPUT')

  const badPhone = await call('/api/v1/auth/sms-challenges', {
    method: 'POST',
    key: uuid(),
    body: { phone: '12345', purpose: 'LOGIN' },
  })
  badPhone.__expectStatus = 400
  checkErrorEnvelope('手机号格式错被拒', badPhone, 'INVALID_INPUT')

  const sendKey = uuid()
  const sent = await call('/api/v1/auth/sms-challenges', {
    method: 'POST',
    key: sendKey,
    body: { phone: PHONE, purpose: 'LOGIN' },
  })

  if (sent.status === 503) {
    // 短信未接入是**合法**状态，不是失败。要验证的是：它必须是规范的 503 + 错误码
    console.log('\n  ⓘ 后端报告短信未接入（503），按预期校验错误结构：')
    sent.__expectStatus = 503
    checkErrorEnvelope('短信未接入', sent, sent.json?.error?.code)
    check(
      '503 的错误码是 SMS_NOT_READY 或 SMS_CHALLENGE_UNAVAILABLE',
      ['SMS_NOT_READY', 'SMS_CHALLENGE_UNAVAILABLE'].includes(sent.json?.error?.code),
      `实际 ${sent.json?.error?.code}`,
    )

    // 同键重试必须命中"不重发"，不能是新的 500
    const retry = await call('/api/v1/auth/sms-challenges', {
      method: 'POST',
      key: sendKey,
      body: { phone: PHONE, purpose: 'LOGIN' },
    })
    check('同键重试仍返回 503（不重发短信）', retry.status === 503, `实际 ${retry.status}`)
    check(
      '同键重试的错误码是 SMS_CHALLENGE_UNAVAILABLE（说明命中幂等记录）',
      retry.json?.error?.code === 'SMS_CHALLENGE_UNAVAILABLE',
      `实际 ${retry.json?.error?.code}`,
    )
    console.log('\n  ⓘ 短信未接入，跳过登录相关断言。请用 STUB_SMS=on 起桩后重跑。')
    return finish()
  }

  sent.__expectStatus = 200
  const ch = sent.json?.data
  check('申请成功返回 200', sent.status === 200, `实际 ${sent.status}`)
  check('challenge_id 是不透明 ID', typeof ch?.challenge_id === 'string' && ch.challenge_id.length > 0)
  check('current_status = SENT', ch?.current_status === 'SENT', `实际 ${ch?.current_status}`)
  check('expires_at 是 ISO 时间', !Number.isNaN(Date.parse(ch?.expires_at || '')), `实际 ${ch?.expires_at}`)
  check('resend_after 是 ISO 时间', !Number.isNaN(Date.parse(ch?.resend_after || '')), `实际 ${ch?.resend_after}`)
  check('响应里不含验证码字段', !('code' in (ch || {})) && !('verification_code' in (ch || {})))
  check('响应里不回显验证码明文', !JSON.stringify(sent.json).includes(STUB_CODE))
  check('Cache-Control: no-store', (sent.headers.get('Cache-Control') || '').includes('no-store'))

  const replay = await call('/api/v1/auth/sms-challenges', {
    method: 'POST',
    key: sendKey,
    body: { phone: PHONE, purpose: 'LOGIN' },
  })
  check(
    '同键同内容重放返回同一个 challenge_id（幂等生效）',
    replay.json?.data?.challenge_id === ch?.challenge_id,
    `首次 ${ch?.challenge_id} / 重放 ${replay.json?.data?.challenge_id}`,
  )

  const conflict = await call('/api/v1/auth/sms-challenges', {
    method: 'POST',
    key: sendKey,
    body: { phone: '13900000002', purpose: 'LOGIN' },
  })
  conflict.__expectStatus = 409
  checkErrorEnvelope('同键不同内容', conflict, 'IDEMPOTENCY_CONFLICT')

  // ───────── 3. Bearer 校验 ─────────
  console.log('\n[3] Bearer 令牌校验')
  const noBearer = await call('/api/v1/me')
  noBearer.__expectStatus = 401
  checkErrorEnvelope('无 Bearer', noBearer, 'AUTHENTICATION_REQUIRED')

  const shortBearer = await call('/api/v1/me', { token: 'abc' })
  shortBearer.__expectStatus = 401
  checkErrorEnvelope('非 43 字符 Bearer 被拒', shortBearer, 'AUTHENTICATION_REQUIRED')

  const jwtBearer = await call('/api/v1/me', {
    headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc' },
  })
  check('旧 JWT 形态的令牌被拒（4xx）', jwtBearer.status === 401, `实际 ${jwtBearer.status}`)

  // ───────── 4. 登录 ─────────
  console.log('\n[4] 验证码登录')
  const wrongCode = await call('/api/v1/auth/sessions', {
    method: 'POST',
    key: uuid(),
    body: { phone: PHONE, challenge_id: ch.challenge_id, code: '000000' },
  })
  wrongCode.__expectStatus = 401
  checkErrorEnvelope('验证码错误', wrongCode, 'INVALID_CREDENTIALS')

  const loginKey = uuid()
  const loginBody = { phone: PHONE, challenge_id: ch.challenge_id, code: STUB_CODE }
  const login = await call('/api/v1/auth/sessions', { method: 'POST', key: loginKey, body: loginBody })
  check('登录成功返回 2xx', login.status >= 200 && login.status < 300, `实际 ${login.status}`)

  const token = login.json?.data?.access_token
  check('access_token 存在且长度 43', typeof token === 'string' && token.length === 43, `实际长度 ${token?.length}`)
  check('token_type = Bearer', login.json?.data?.token_type === 'Bearer')
  check('expires_at 是 ISO 时间', !Number.isNaN(Date.parse(login.json?.data?.expires_at || '')))
  check('account 里带 allowed_actions', Array.isArray(login.json?.data?.account?.allowed_actions))

  const loginReplay = await call('/api/v1/auth/sessions', { method: 'POST', key: loginKey, body: loginBody })
  check(
    '同键重放返回同一个令牌（不产生第二个会话）',
    loginReplay.json?.data?.access_token === token,
    '两个令牌不一致 → 会产生第二个会话',
  )

  if (!token) return finish()

  // ───────── 5. 账号与主体列表 ─────────
  console.log('\n[5] 账号与主体列表')
  const me = await call('/api/v1/me', { token })
  check('/me 返回 2xx', me.status === 200, `实际 ${me.status}`)
  check('/me 带 ETag', typeof me.headers.get('ETag') === 'string' && me.headers.get('ETag').startsWith('"'))
  check(
    '/me 的 ETag 与 object_version 一致',
    me.headers.get('ETag') === `"${me.json?.data?.object_version}"`,
    `ETag=${me.headers.get('ETag')} object_version=${me.json?.data?.object_version}`,
  )
  check('/me 的 actor.account_id 有值', typeof me.json?.meta?.actor?.account_id === 'string')
  check('/me 的 meta.acting_party 为 null', me.json?.meta?.acting_party === null)

  const parties = await call('/api/v1/me/parties', { token })
  check('/me/parties 返回 2xx', parties.status === 200, `实际 ${parties.status}`)
  const page = parties.json?.data
  check('data 是 {items, next_cursor}', Array.isArray(page?.items) && 'next_cursor' in (page || {}))
  check('至少有一个主体', (page?.items?.length || 0) > 0)

  const first = page?.items?.[0]
  check('每行是 {party, membership}', !!first?.party && !!first?.membership)
  check('party.allowed_actions 是数组', Array.isArray(first?.party?.allowed_actions))
  check(
    'party.capabilities[].allowed_actions 是数组（当前实现恒为空）',
    Array.isArray(first?.party?.capabilities?.[0]?.allowed_actions ?? []),
  )
  check(
    '⚠️ membership.allowed_actions 为空数组（服务端硬编码，不是权限被拒）',
    Array.isArray(first?.membership?.allowed_actions) && first.membership.allowed_actions.length === 0,
    `实际 ${JSON.stringify(first?.membership?.allowed_actions)}`,
  )
  check('next_cursor 是字符串或 null，不用空字符串占位', page?.next_cursor === null || typeof page?.next_cursor === 'string')
  check('next_cursor 不为空字符串', page?.next_cursor !== '')

  const observedActions = new Set([
    ...(me.json?.data?.allowed_actions || []),
    ...(page?.items || []).flatMap((i) => i.party?.allowed_actions || []),
  ])
  console.log(`     实测 allowed_actions 词表：${[...observedActions].sort().join(', ') || '(空)'}`)
  check(
    'allowed_actions 用大写下划线写法（不是示例文件里的点号小写）',
    [...observedActions].every((a) => /^[A-Z][A-Z0-9_]*$/.test(a)),
    `出现非大写下划线写法：${[...observedActions].filter((a) => !/^[A-Z][A-Z0-9_]*$/.test(a)).join(', ')}`,
  )

  // ───────── 6. 分页与游标 ─────────
  console.log('\n[6] 分页与游标')
  const p1 = await call('/api/v1/me/parties?limit=1', { token })
  check('limit=1 只返回 1 条', p1.json?.data?.items?.length === 1, `实际 ${p1.json?.data?.items?.length}`)

  const cursor = p1.json?.data?.next_cursor
  if (cursor) {
    const p2 = await call(`/api/v1/me/parties?limit=1&cursor=${encodeURIComponent(cursor)}`, { token })
    check('带 cursor 能翻到下一页', (p2.json?.data?.items?.length || 0) > 0)
    const id1 = p1.json?.data?.items?.[0]?.party?.id
    const id2 = p2.json?.data?.items?.[0]?.party?.id
    check('两页不重复', id1 !== id2, `两页都是 ${id1}`)

    const tampered = cursor.slice(0, -2) + (cursor.endsWith('aa') ? 'bb' : 'aa')
    const bad = await call(`/api/v1/me/parties?cursor=${encodeURIComponent(tampered)}`, { token })
    bad.__expectStatus = 400
    checkErrorEnvelope('篡改 cursor（说明游标是签名的不透明串）', bad, 'INVALID_CURSOR')
  } else {
    console.log('  ⓘ 只有一页数据，跳过游标断言（把桩的数据加到 3 条以上可覆盖）')
  }

  const badLimit = await call('/api/v1/me/parties?limit=0', { token })
  badLimit.__expectStatus = 400
  checkErrorEnvelope('limit=0 被拒', badLimit, 'INVALID_LIMIT')

  const bigLimit = await call('/api/v1/me/parties?limit=101', { token })
  bigLimit.__expectStatus = 400
  checkErrorEnvelope('limit=101 超上限被拒', bigLimit, 'INVALID_LIMIT')

  const unknownParam = await call('/api/v1/me/parties?sort=name', { token })
  unknownParam.__expectStatus = 400
  checkErrorEnvelope('未知查询参数被拒', unknownParam, 'INVALID_INPUT')

  // ───────── 7. 未实现的操作 ─────────
  console.log('\n[7] 未实现的操作')
  const notImpl = await call('/api/v1/identity-verifications/current', { token })
  check('未实现操作返回 404（不返回假成功）', notImpl.status === 404, `实际 ${notImpl.status}`)
  check('且带 error.code', typeof notImpl.json?.error?.code === 'string', `实际 ${notImpl.json?.error?.code}`)

  // ───────── 8. 退出登录 ─────────
  console.log('\n[8] 退出登录')
  const revoke = await call('/api/v1/auth/sessions/current', { method: 'DELETE', token, key: uuid() })
  check('退出返回 2xx', revoke.status >= 200 && revoke.status < 300, `实际 ${revoke.status}`)
  check('current_status = REVOKED', revoke.json?.data?.current_status === 'REVOKED', `实际 ${revoke.json?.data?.current_status}`)

  const afterRevoke = await call('/api/v1/me', { token })
  check('令牌撤销后再调 /me 返回 401（撤销真的生效）', afterRevoke.status === 401, `实际 ${afterRevoke.status}`)

  finish()
}

function finish() {
  console.log(`\n${'─'.repeat(56)}`)
  console.log(`通过 ${pass} 项，失败 ${fail} 项`)
  if (fail) {
    console.log('\n失败清单：')
    for (const f of failures) console.log(`  · ${f}`)
  }
  console.log('')
  process.exit(fail ? 1 : 0)
}

main().catch((e) => {
  console.error('\n自检脚本自身出错：', e)
  process.exit(2)
})
