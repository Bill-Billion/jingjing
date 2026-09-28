#!/usr/bin/env node
/**
 * 本地验收桩服务器 —— ⚠️ 这不是后端，不要当成后端用。
 *
 * 为什么存在：前端登录页要按 PR #11 的协议验收——验证码、登录、读账号、读主体、
 * 错误码展示、幂等键复用。真实后端需要 MySQL + 迁移 + 密钥才能起，本地起不来。
 * 所以这里按**运行时真实实现**抄一份最小桩，只求协议一致。
 *
 * 字段与行为依据（逐条对照，不是凭想象写的）：
 *   contracts/openapi.yaml                              版本 0.2.0-rc.1
 *   backend_server/src/http/account-api.js              路由、头校验、错误兜底、分页
 *   backend_server/src/modules/auth/repository.js       challenge/login/accountData 的返回结构
 *   backend_server/src/modules/party/policy.js          allowedActions 的三档取值
 *
 * 有意与真实实现保持一致的"不友好"之处，别删：
 *   - Idempotency-Key 必填，格式 ^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$
 *   - Bearer 必须严格 43 字符 ^Bearer [A-Za-z0-9_-]{43}$
 *   - 请求体拒绝未知字段（shape 校验）
 *   - limit 取值 1..100，默认 20；cursor 是签名过的不透明串，改一个字符就 400
 *   - error.retryable 恒为 false —— 真实实现就是这么写的，别在桩里"改好"
 *   - error.message 是通用文案，不暴露内部细节
 *   - 未实现的 5 个操作走兜底 404 NOT_FOUND（与真实 catch-all 一致）
 *
 * 用法：
 *   node tools/dev-stub-server.mjs                  # 短信可用，验证码固定 123456
 *   STUB_SMS=off node tools/dev-stub-server.mjs     # 短信未接入，申请验证码返回 503
 *   STUB_PORT=3210 node tools/dev-stub-server.mjs
 *
 * 桩里所有实体名称都带"（桩）"字样，允许被截图的界面一眼看出不是真实数据。
 */

import http from 'node:http'
import { createHmac, randomUUID } from 'node:crypto'

const PORT = Number(process.env.STUB_PORT || 3210)
const SMS_ENABLED = (process.env.STUB_SMS || 'on').toLowerCase() !== 'off'
const CURSOR_SECRET = randomUUID()
const CURSOR_SCOPE = 'parties'

/** 桩里唯一的正确验证码。真实后端是随机的，这里固定是为了验收方便。 */
const STUB_CODE = '123456'

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'
const PERSON_PARTY_ID = '22222222-2222-4222-8222-222222222222'
const ORG_PARTY_ID = '33333333-3333-4333-8333-333333333333'

// —— 与 policy.js allowedActions() 完全同构 ——
function allowedActions(partyKind, roleCode, partyStatus) {
  if (roleCode !== 'OWNER' || ['SUSPENDED', 'CLOSED'].includes(partyStatus)) return []
  const actions = ['READ_PARTY']
  actions.push('REQUEST_CAPABILITY')
  if (partyKind === 'ORGANIZATION') actions.push('MANAGE_MEMBERS')
  return actions
}

// —— 与 account-data 结构同构 ——
const accountData = {
  id: ACCOUNT_ID,
  display_name: '测试账号（桩）',
  current_status: 'ACTIVE',
  object_version: 3,
  allowed_actions: ['READ_ACCOUNT', 'LIST_PARTIES', 'CREATE_ORGANIZATION'],
}

const PERSON_PARTY = {
  party_id: PERSON_PARTY_ID,
  kind: 'PERSON',
  display_name: '个人主体（桩）',
  current_status: 'ACTIVE',
  object_version: 1,
  role_code: 'OWNER',
  capabilities: [{ code: 'AUTHOR', current_status: 'PENDING_REVIEW' }],
}
const ORG_PARTY = {
  party_id: ORG_PARTY_ID,
  kind: 'ORGANIZATION',
  display_name: '某文化传媒有限公司（桩）',
  current_status: 'ACTIVE',
  object_version: 5,
  role_code: 'OWNER',
  capabilities: [
    // 五个能力全部从 PENDING_REVIEW 开始，不允许自审通过。
    // 桩里刻意不放 ACTIVE 的能力——"已生效的能力"会被截图当成"审批真的过了"。
    { code: 'MCN', current_status: 'PENDING_REVIEW' },
    { code: 'SCRIPT_SUPPLIER', current_status: 'PENDING_REVIEW' },
  ],
}
const ALL_PARTIES = [PERSON_PARTY, ORG_PARTY]

/** 与 account-api.js 的 partyData / membershipData 逐字段对齐 */
const partyData = (p) => ({
  id: p.party_id,
  kind: p.kind,
  display_name: p.display_name,
  current_status: p.current_status,
  object_version: p.object_version,
  capabilities: p.capabilities.map((c) => ({
    code: c.code,
    current_status: c.current_status,
    allowed_actions: [],
  })),
  allowed_actions: allowedActions(p.kind, p.role_code, p.current_status),
})
const membershipData = (p) => ({
  id: `m-${p.party_id}`,
  account_id: ACCOUNT_ID,
  party_id: p.party_id,
  current_status: 'ACTIVE',
  roles: [p.role_code],
  object_version: p.object_version,
  allowed_actions: [],
})

// —— 内存态：一次进程内的会话与幂等记录，重启即清空 ——
const challenges = new Map() // challenge_id -> { key, fingerprint, code, expires_ms, resend_ms, status }
const challengeByKey = new Map() // idempotency key -> challenge_id
let sessionToken = null
let sessionExpiresMs = 0
const loginByKey = new Map() // idempotency key -> { fingerprint, token }

// —— 校验工具，与 policy.js 同规则 ——
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/
const ID_RE = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/
const PHONE_RE = /^1[3-9][0-9]{9}$/
const BEARER_RE = /^Bearer ([A-Za-z0-9_-]{43})$/

class HttpError extends Error {
  constructor(code, status) {
    super(code)
    this.code = code
    this.status = status
  }
}
const fail = (code, status) => {
  throw new HttpError(code, status)
}
/** 未知字段一律拒绝，和真实 shape() 一致 */
function shape(input, keys) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_INPUT', 400)
  if (Object.keys(input).some((k) => !keys.includes(k))) fail('INVALID_INPUT', 400)
}
const readRef = (v) => {
  if (typeof v !== 'string' || !REF_RE.test(v)) fail('INVALID_REFERENCE', 400)
  return v
}
const readId = (v) => {
  if (typeof v !== 'string' || !ID_RE.test(v)) fail('INVALID_ID', 400)
  return v
}
const readPhone = (v) => {
  if (typeof v !== 'string' || !PHONE_RE.test(v)) fail('INVALID_INPUT', 400)
  return v
}

function signCursor(encoded) {
  return createHmac('sha256', CURSOR_SECRET)
    .update([ACCOUNT_ID, CURSOR_SCOPE, encoded].join('\u0000'))
    .digest('hex')
}
function decodeCursor(raw) {
  if (typeof raw !== 'string' || raw.length > 512) fail('INVALID_CURSOR', 400)
  const [encoded, mac, extra] = raw.split('.')
  if (extra || !encoded || !mac || !/^[a-f0-9]{64}$/.test(mac)) fail('INVALID_CURSOR', 400)
  if (signCursor(encoded) !== mac) fail('INVALID_CURSOR', 400)
  return Buffer.from(encoded, 'base64url').toString('utf8')
}

const send = (res, status, payload) => {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (c) => {
      raw += c
      if (raw.length > 16 * 1024) req.destroy()
    })
    req.on('end', () => {
      if (!raw) return resolve({})
      let parsed
      try {
        parsed = JSON.parse(raw)
      } catch {
        return reject(new HttpError('INVALID_JSON', 400))
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return reject(new HttpError('INVALID_INPUT', 400))
      }
      resolve(parsed)
    })
    req.on('error', () => resolve({}))
  })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const path = url.pathname
  const requestId = req.headers['x-request-id'] || randomUUID()

  // 与真实实现一致：每次响应都带请求号、禁止缓存，额外加一个桩标记头
  res.setHeader('X-Request-Id', requestId)
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Stub-Server', 'dev-only-not-the-real-backend')

  const meta = (actor = null) => ({ request_id: requestId, actor, acting_party: null })
  const ok = (data, status = 200) => send(res, status, { meta: meta(req.account ? { account_id: ACCOUNT_ID } : null), data })

  console.log(`[stub] ${req.method} ${path}${url.search}`)

  try {
    // ---------- 公开探针 ----------
    if (req.method === 'GET' && path === '/health') {
      return ok({ current_status: 'UP' })
    }
    if (req.method === 'GET' && path === '/ready') {
      // 短信开关不影响进程就绪：未接入的可选供应商只禁用自己那项能力，不把整个 API 置为不可用
      return ok({ current_status: 'READY' })
    }

    // ---------- 申请验证码 ----------
    if (req.method === 'POST' && path === '/api/v1/auth/sms-challenges') {
      const key = readRef(req.headers['idempotency-key'])
      const body = await readBody(req)
      shape(body, ['phone', 'purpose'])
      readPhone(body.phone)
      if (body.purpose !== 'LOGIN') fail('INVALID_INPUT', 400)

      const fingerprint = `${body.phone}|${body.purpose}`

      // 幂等重放
      const priorId = challengeByKey.get(key)
      if (priorId) {
        const prior = challenges.get(priorId)
        if (prior.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', 409)
        if (prior.status !== 'SENT') fail('SMS_CHALLENGE_UNAVAILABLE', 503)
        return ok({
          challenge_id: prior.id,
          current_status: 'SENT',
          expires_at: new Date(prior.expires_ms).toISOString(),
          resend_after: new Date(prior.resend_ms).toISOString(),
        })
      }

      // 真实实现是"先落库、再调供应商、失败标记 UNKNOWN、再抛 503"。
      // 这里照抄这个顺序：所以同一个键重试会命中 SMS_CHALLENGE_UNAVAILABLE，
      // 而不是再发一次短信——这正是客户端要能正确显示的两种情况。
      const id = randomUUID()
      const now = Date.now()
      const record = {
        id,
        key,
        fingerprint,
        code: SMS_ENABLED ? STUB_CODE : null,
        status: 'PENDING',
        expires_ms: now + 5 * 60 * 1000,
        resend_ms: now + 60 * 1000,
      }
      challenges.set(id, record)
      challengeByKey.set(key, id)

      if (!SMS_ENABLED) {
        record.status = 'UNKNOWN'
        fail('SMS_NOT_READY', 503)
      }

      record.status = 'SENT'
      console.log(`[stub]   → 验证码 = ${STUB_CODE}（桩固定值），challenge_id = ${id}`)
      return ok({
        challenge_id: id,
        current_status: 'SENT',
        expires_at: new Date(record.expires_ms).toISOString(),
        resend_after: new Date(record.resend_ms).toISOString(),
      })
    }

    // ---------- 验证码登录 ----------
    if (req.method === 'POST' && path === '/api/v1/auth/sessions') {
      const key = readRef(req.headers['idempotency-key'])
      const body = await readBody(req)
      shape(body, ['phone', 'challenge_id', 'code'])
      readPhone(body.phone)
      readId(body.challenge_id)
      if (typeof body.code !== 'string' || !/^[0-9]{6}$/.test(body.code)) fail('INVALID_INPUT', 400)

      const fingerprint = `${body.phone}|${body.challenge_id}|${body.code}`
      const prior = loginByKey.get(key)
      if (prior) {
        // 同键同内容 → 返回原来那次的结果，绝不发第二个令牌
        if (prior.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', 409)
        return ok({
          access_token: prior.token,
          token_type: 'Bearer',
          expires_at: new Date(prior.expires_ms).toISOString(),
          account: accountData,
        })
      }

      const c = challenges.get(body.challenge_id)
      const now = Date.now()
      // 与真实实现一致：手机号/挑战/验证码任一不对，统一 401，不区分原因（防枚举）
      if (!c || c.status !== 'SENT' || c.expires_ms <= now) fail('INVALID_CREDENTIALS', 401)
      if (c.code !== body.code) fail('INVALID_CREDENTIALS', 401)

      const token = Buffer.from(randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''))
        .toString('base64url')
        .slice(0, 43)
      const expires_ms = now + 2 * 60 * 60 * 1000
      sessionToken = token
      sessionExpiresMs = expires_ms
      loginByKey.set(key, { fingerprint, token, expires_ms })
      c.status = 'CONSUMED'
      console.log(`[stub]   → 签发令牌（桩）：${token.slice(0, 8)}… 长度 ${token.length}`)
      return ok({ access_token: token, token_type: 'Bearer', expires_at: new Date(expires_ms).toISOString(), account: accountData })
    }

    // ---------- 以下都需要 Bearer ----------
    if (path.startsWith('/api/v1/')) {
      const authHeader = req.headers['authorization']
      const m = typeof authHeader === 'string' ? authHeader.match(BEARER_RE) : null
      if (!m) fail('AUTHENTICATION_REQUIRED', 401)
      if (m[1] !== sessionToken || Date.now() >= sessionExpiresMs) fail('AUTHENTICATION_REQUIRED', 401)
      req.account = { id: ACCOUNT_ID }

      if (req.method === 'GET' && path === '/api/v1/me') {
        res.setHeader('ETag', `"${accountData.object_version}"`)
        return ok(accountData)
      }

      if (req.method === 'GET' && path === '/api/v1/me/parties') {
        for (const k of url.searchParams.keys()) {
          if (!['cursor', 'limit'].includes(k)) fail('INVALID_INPUT', 400)
        }
        const rawLimit = url.searchParams.get('limit')
        const limit = rawLimit === null ? 20 : Number(rawLimit)
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail('INVALID_LIMIT', 400)

        let after = ''
        const rawCursor = url.searchParams.get('cursor')
        if (rawCursor !== null) after = decodeCursor(rawCursor)

        const startIdx = after ? ALL_PARTIES.findIndex((p) => p.party_id === after) + 1 : 0
        const window = ALL_PARTIES.slice(startIdx, startIdx + limit + 1)
        const more = window.length > limit
        const items = window.slice(0, limit)
        let next_cursor = null
        if (more && items.length) {
          const encoded = Buffer.from(items[items.length - 1].party_id).toString('base64url')
          next_cursor = `${encoded}.${signCursor(encoded)}`
        }
        return ok({
          items: items.map((p) => ({ party: partyData(p), membership: membershipData(p) })),
          next_cursor,
        })
      }

      if (req.method === 'DELETE' && path === '/api/v1/auth/sessions/current') {
        readRef(req.headers['idempotency-key'])
        sessionToken = null
        sessionExpiresMs = 0
        return ok({ current_status: 'REVOKED' })
      }

      // 与真实实现一致：未实现的操作用同一个兜底 404，不暴露存在性
      fail('NOT_FOUND', 404)
    }

    fail('NOT_FOUND', 404)
  } catch (e) {
    // 错误兜底照抄真实实现：5xx 一律收敛成 503 + 通用文案，不吐出内部细节
    const isClient = Number.isInteger(e.status) && e.status >= 400 && e.status < 500
    const safeCode = typeof e.code === 'string' && /^[A-Z][A-Z0-9_]*$/.test(e.code)
    const status = isClient ? e.status : 503
    const code = (isClient && safeCode) || ['SMS_NOT_READY', 'SMS_CHALLENGE_UNAVAILABLE', 'COMMIT_OUTCOME_UNKNOWN'].includes(e.code)
      ? e.code
      : 'SERVICE_UNAVAILABLE'
    send(res, status, {
      meta: meta(req.account ? { account_id: ACCOUNT_ID } : null),
      error: {
        code,
        message: status === 503 ? '服务暂不可用，请稍后核对状态' : '请求未通过校验或权限检查',
        retryable: false,
        details: [],
      },
    })
    if (status === 503) console.log(`[stub]   ! ${status} ${code}（这是桩按真实实现返回的，不是页面造假）`)
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log('')
  console.log('  ⚠️  本地验收桩已启动 —— 这不是真实后端，只用于前端协议验收')
  console.log(`     地址        http://127.0.0.1:${PORT}`)
  console.log(`     短信开关    ${SMS_ENABLED ? 'on （申请验证码返回 SENT，验证码固定 123456）' : 'off（申请验证码返回 503 SMS_NOT_READY）'}`)
  console.log('     数据        全部是桩内内存数据，实体名称都带"（桩）"')
  console.log('')
})
