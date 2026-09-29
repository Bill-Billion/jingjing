import { ApiError, request, type ApiResult } from '../client'

export type TextValue = string | number | boolean | null | TextValue[] | { [key: string]: TextValue }
export type TextObject = { [key: string]: TextValue }
export interface RuleContent {
  format_version: 'rule-content-v1'
  id: string
  rule_key: string
  version: string
  terms: TextObject
  content_sha256: string
}
export interface SnapshotContent {
  format_version: 'contract-content-v1'
  id: string
  contract_version_id: string
  party_ids: string[]
  created_at: string
  rule_contents: RuleContent[]
  commitments: TextObject
  object_version: 1
  current_status: 'SEALED'
  signing_method: 'NOT_SIGNED'
  content_sha256: string
}
export const serviceActions = {
  START_PAYMENT: '支付服务',
  START_IDENTITY_CHECK: '实名服务',
  START_SIGNING: '电子签服务',
  START_DIGITAL_HUMAN: '数字人服务',
} as const
export type ServiceAction = keyof typeof serviceActions
export const serviceReasons = {
  PROVIDER_NOT_IMPLEMENTED: '服务尚未接入',
  PROVIDER_NOT_CONFIGURED: '服务尚未配置',
  PROVIDER_ENVIRONMENT_NOT_VERIFIED: '当前环境尚未验证',
  PROVIDER_NOT_VERIFIED: '服务尚未验证',
  PROVIDER_CONFIGURATION_CHANGED: '服务配置已改变，需要重新验证',
  VERIFICATION_EVIDENCE_REQUIRED: '缺少服务验证记录',
  PROVIDER_STATE_UNAVAILABLE: '暂时无法确认服务状态',
  PROVIDER_ENVIRONMENT_MISMATCH: '服务环境不匹配',
} as const
export type ServiceReadiness = {
  action: ServiceAction
  environment: 'SANDBOX' | 'PRODUCTION'
} & ({ current_status: 'NOT_ENABLED'; reason_code: keyof typeof serviceReasons } | { current_status: 'SERVICE_READY'; reason_code: null })
export interface ReaderIdentity { token: string; partyId: string; accountId: string }

export const isContractId = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const string = (value: unknown, max = 64): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max
const hash = (value: unknown): boolean => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const exact = (value: Record<string, unknown>, keys: string[]): boolean => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
const textObject = (value: unknown): value is TextObject => object(value) && Object.keys(value).length > 0

function ruleContent(value: unknown): value is RuleContent {
  return object(value) && exact(value, ['format_version', 'id', 'rule_key', 'version', 'terms', 'content_sha256']) &&
    value.format_version === 'rule-content-v1' && string(value.id) && string(value.rule_key, 100) &&
    string(value.version) && textObject(value.terms) && hash(value.content_sha256)
}
function snapshotContent(value: unknown): value is SnapshotContent {
  if (!object(value) || !exact(value, ['format_version', 'id', 'contract_version_id', 'party_ids', 'created_at', 'rule_contents', 'commitments', 'object_version', 'current_status', 'signing_method', 'content_sha256'])) return false
  const rules = value.rule_contents, parties = value.party_ids
  return value.format_version === 'contract-content-v1' && string(value.id) && string(value.contract_version_id) &&
    Array.isArray(parties) && parties.length >= 1 && parties.length <= 100 && parties.every(id => string(id)) && new Set(parties).size === parties.length &&
    typeof value.created_at === 'string' && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(value.created_at) && Number.isFinite(Date.parse(value.created_at)) &&
    Array.isArray(rules) && rules.length >= 1 && rules.length <= 100 && rules.every(ruleContent) &&
    new Set(rules.map(rule => rule.id)).size === rules.length && new Set(rules.map(rule => rule.rule_key)).size === rules.length &&
    textObject(value.commitments) && value.object_version === 1 && value.current_status === 'SEALED' && value.signing_method === 'NOT_SIGNED' && hash(value.content_sha256)
}
function readiness(value: unknown): value is ServiceReadiness {
  return object(value) && exact(value, ['action', 'environment', 'current_status', 'reason_code']) &&
    typeof value.action === 'string' && Object.hasOwn(serviceActions, value.action) &&
    (value.environment === 'SANDBOX' || value.environment === 'PRODUCTION') &&
    ((value.current_status === 'SERVICE_READY' && value.reason_code === null) ||
      (value.current_status === 'NOT_ENABLED' && typeof value.reason_code === 'string' && Object.hasOwn(serviceReasons, value.reason_code)))
}
function verified<T>(result: ApiResult<unknown>, identity: ReaderIdentity, matches: (data: unknown) => data is T): ApiResult<T> {
  if (!matches(result.data) || !result.meta || !string(result.meta.request_id, 128) ||
    result.meta.actor?.account_id !== identity.accountId || result.meta.acting_party !== identity.partyId) {
    throw new ApiError({ status: 200, code: 'UNEXPECTED_RESPONSE_SHAPE', message: '暂时无法确认这份内容，请重新读取。', requestId: result.requestId })
  }
  return result as ApiResult<T>
}
const options = (identity: ReaderIdentity, signal?: AbortSignal) => ({ token: identity.token, actingParty: identity.partyId, cache: 'no-store' as const, signal })
export async function readSnapshot(identity: ReaderIdentity, snapshotId: string, signal?: AbortSignal) {
  const result = await request<unknown>(`/contract-snapshots/${encodeURIComponent(snapshotId)}/content`, options(identity, signal))
  return verified(result, identity, (data): data is SnapshotContent => snapshotContent(data) && data.id === snapshotId && data.party_ids.includes(identity.partyId))
}
export async function readSnapshotRule(identity: ReaderIdentity, snapshotId: string, ruleId: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ snapshot_id: snapshotId })
  const result = await request<unknown>(`/rule-versions/${encodeURIComponent(ruleId)}/content?${query}`, options(identity, signal))
  return verified(result, identity, (data): data is RuleContent => ruleContent(data) && data.id === ruleId)
}
export async function readServiceReadiness(identity: ReaderIdentity, snapshotId: string, action: ServiceAction, signal?: AbortSignal) {
  const query = new URLSearchParams({ action })
  const result = await request<unknown>(`/contract-snapshots/${encodeURIComponent(snapshotId)}/business-readiness?${query}`, options(identity, signal))
  return verified(result, identity, (data): data is ServiceReadiness => readiness(data) && data.action === action)
}
