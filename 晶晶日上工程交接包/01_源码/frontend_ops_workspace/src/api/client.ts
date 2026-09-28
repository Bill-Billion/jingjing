/**
 * 统一请求层。
 *
 * 它只做四件事，别的什么都不做：
 *   1. 拼地址、带公共头（Content-Type / X-Request-Id / Idempotency-Key / Authorization / X-Acting-Party）
 *   2. 把 {meta, data} 或 {meta, error} 拆开
 *   3. 把非 2xx 统一抛成 ApiError（含状态码、错误码、请求编号）
 *   4. 网络层异常也抛 ApiError，不让它变成"静默失败"
 *
 * 刻意不做的事：
 *   - 不自动重试写操作（写操作的重试必须复用同一个 Idempotency-Key，交给调用方决定）
 *   - 不把错误吞掉换成假数据（项目硬约束：页面不能假装成功）
 */

import type { ErrBody, ErrorBody, Meta, OkBody } from './types'

/**
 * 接口来源。
 * 默认空字符串 = 同源。开发时由 Vite 把 /api 代理到后端，这样就不需要后端
 * 配置 CORS 白名单（STAGE_2_ACCOUNT_API.md 也把"同源代理"列为推荐做法之一）。
 * 打包部署时通过 VITE_API_ORIGIN 指定真实域名。
 */
const API_ORIGIN: string = import.meta.env.VITE_API_ORIGIN ?? ''

/** 业务接口前缀 */
export const API_BASE = `${API_ORIGIN}/api/v1`
/** 探针地址前缀（/health、/ready 不在 /api/v1 下） */
export const HEALTH_BASE = API_ORIGIN

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly retryable: boolean
  readonly requestId: string | null
  readonly details: unknown[]

  constructor(init: {
    status: number
    code: string
    message: string
    retryable?: boolean
    requestId?: string | null
    details?: unknown[]
  }) {
    super(init.message)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.retryable = init.retryable ?? false
    this.requestId = init.requestId ?? null
    this.details = init.details ?? []
  }
}

let unauthorized: ((token: string) => void) | null = null
export function onUnauthorized(handler: (token: string) => void) { unauthorized = handler }

export function outcomeUnknown(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 0 || error.status >= 500 || error.code === 'UNEXPECTED_RESPONSE_SHAPE' || error.code === 'COMMIT_OUTCOME_UNKNOWN' || error.code === 'IDEMPOTENCY_IN_PROGRESS')
}

export function asApiError(e: unknown): ApiError {
  return e instanceof ApiError ? e : new ApiError({ status: 0, code: 'CLIENT_REQUEST_FAILED', message: '请求结果未确认，请重试原操作。', retryable: true })
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Bearer 令牌 */
  token?: string | null
  /** 主体级接口必须带，且必须与地址里的 party_id 一致 */
  actingParty?: string | null
  /** 写操作必须带。调用方负责"重试复用同一个键" */
  idempotencyKey?: string
  /** 修改已有对象时必带，值形如 "1" */
  ifMatch?: string | number
  signal?: AbortSignal
}

/** 生成一个请求编号（X-Request-Id），服务端会回显同一个值 */
export function newRequestId(): string {
  return crypto.randomUUID()
}

/** 生成一个幂等键（Idempotency-Key） */
export function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

export interface ApiResult<T> {
  data: T
  meta: Meta
  /** 服务端回显的请求编号，出问题时给后端看这个 */
  requestId: string
  /** 回显的 ETag（去掉引号），用于后续 If-Match */
  version: string | null
}

/**
 * 发一次请求。
 * 失败一定抛 ApiError，绝不返回"看起来成功"的空结果。
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const { method = 'GET', body, token, actingParty, idempotencyKey, ifMatch, signal } = options

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Request-Id': newRequestId(),
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (actingParty) headers['X-Acting-Party'] = actingParty
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
  if (ifMatch !== undefined && ifMatch !== null) headers['If-Match'] = `"${ifMatch}"`

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
      // 会话令牌走 Bearer 头而不是 Cookie，这里不涉及凭据模式
      credentials: 'omit',
    })
  } catch (e) {
    // 连不上后端、被浏览器拦截、请求被取消——全部如实抛出，不假装成功
    throw new ApiError({
      status: 0,
      code: 'NETWORK_UNREACHABLE',
      message: '连接中断，请求结果未确认。请保留原内容重试。',
      retryable: true,
    })
  }

  const echoRequestId = response.headers.get('X-Request-Id')
  const etag = response.headers.get('ETag')

  // 响应体不一定是 JSON（例如网关返回的 HTML 错误页），要能兜住
  let raw: string
  try { raw = await response.text() } catch {
    throw new ApiError({ status: 0, code: 'NETWORK_UNREACHABLE', message: '连接中断，请求结果未确认。请保留原内容重试。', retryable: true })
  }
  let parsed: unknown = null
  if (raw) {
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = null
    }
  }

  if (!response.ok) {
    if (response.status === 401 && token) unauthorized?.(token)
    const errBody = (parsed as ErrBody | null)?.error
    throw toApiError(response.status, errBody, echoRequestId, raw)
  }

  const ok = parsed as OkBody<T> | null
  if (!ok || typeof ok !== 'object' || !('data' in ok)) {
    throw new ApiError({
      status: response.status,
      code: 'UNEXPECTED_RESPONSE_SHAPE',
      message: '服务器返回了 2xx，但响应体不是约定的 {meta, data} 结构。',
      requestId: echoRequestId,
    })
  }

  return {
    data: ok.data,
    meta: ok.meta,
    requestId: echoRequestId ?? ok.meta?.request_id ?? '',
    version: etag ? etag.replace(/"/g, '') : null,
  }
}

function toApiError(
  status: number,
  errBody: ErrorBody | undefined,
  echoRequestId: string | null,
  rawText: string,
): ApiError {
  if (errBody && typeof errBody.code === 'string') {
    return new ApiError({
      status,
      code: errBody.code,
      message: errBody.message,
      retryable: errBody.retryable,
      requestId: echoRequestId,
      details: errBody.details,
    })
  }
  // 拿不到 {meta, error} 结构：可能是网关/代理返回的，如实说明
  return new ApiError({
    status,
    code: `HTTP_${status}`,
    message: `服务器返回 ${status}，但响应体不是约定的错误结构。原始内容前 200 字：${rawText.slice(0, 200)}`,
    requestId: echoRequestId,
  })
}

/** 探针：GET /health 或 /ready。返回 true/false，不抛异常（探针失败是正常情况） */
export async function probe(path: '/health' | '/ready'): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(`${HEALTH_BASE}${path}`, { headers: { Accept: 'application/json' } })
    const text = await res.text()
    let status = ''
    try {
      const parsed = JSON.parse(text) as OkBody<{ current_status?: string }>
      status = parsed?.data?.current_status ?? ''
    } catch {
      /* 忽略：下面按状态码给出说明 */
    }
    if (res.ok) return { ok: true, detail: status || 'UP' }
    return { ok: false, detail: status || `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) }
  }
}
