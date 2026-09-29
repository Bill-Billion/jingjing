/**
 * 后端返回结构。
 * 依据：contracts/openapi.yaml 0.2.0-rc.1（PR #11）+ 实际 HTTP 返回样本
 *      docs/tasks/records/CORE-S1-002-HTTP-evidence/synthetic-http-responses.json
 *
 * 注意：类型是照着运行时实际返回写的，不是照示例文件写的（两者在
 * allowed_actions 上不一致，详见 src/config/actions.ts 顶部说明）。
 */

/** 每个响应的公共头，服务端识别出来的调用者 */
export interface Meta {
  request_id: string
  actor: { account_id: string } | null
  acting_party: string | null
}

/** 业务主体：签约与经营的单位，不是账号，也不是数字人 */
export type PartyKind = 'PERSON' | 'ORGANIZATION'

export type PartyStatus = 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED'

/** 业务能力。五类，全部只能申请，状态从 PENDING_REVIEW 开始 */
export type CapabilityCode = 'AUTHOR' | 'SCRIPT_SUPPLIER' | 'PRODUCER' | 'MCN' | 'BRAND_CLIENT'

export type CapabilityStatus = 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED'

export interface CapabilityGrant {
  code: CapabilityCode
  current_status: CapabilityStatus
  allowed_actions: string[]
}

export interface Party {
  id: string
  kind: PartyKind
  display_name: string
  current_status: PartyStatus
  object_version: number
  capabilities: CapabilityGrant[]
  allowed_actions: string[]
}

export type MembershipStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED'

export interface Membership {
  id: string
  account_id: string
  party_id: string
  current_status: MembershipStatus
  /** 机构内角色，目前只有 OWNER / MEMBER */
  roles: string[]
  object_version: number
  /** ⚠️ 后端目前恒定返回空数组（见 account-api.js 中的硬编码） */
  allowed_actions: string[]
}

/** 主体列表的一行：主体 + 当前账号在该主体里的成员关系 */
export interface PartyAccess {
  party: Party
  membership: Membership
}

export interface Account {
  id: string
  display_name: string
  current_status: 'ACTIVE' | 'SUSPENDED' | 'DELETION_PENDING'
  object_version: number
  allowed_actions: string[]
}

/** POST /api/v1/auth/sms-challenges 的返回。SENT 只代表供应商受理，不代表用户已收到 */
export interface SmsChallenge {
  challenge_id: string
  current_status: 'SENT'
  /** 验证码有效期，RFC3339 UTC */
  expires_at: string
  /** 这个时间之前不能重发 */
  resend_after: string
}

/** POST /api/v1/auth/sessions 的返回 */
export interface Session {
  access_token: string
  token_type: 'Bearer'
  expires_at: string
  account: Account
}

export interface Page<T> {
  items: T[]
  next_cursor: string | null
}

/** 错误响应体：{ meta, error } */
export interface ErrorBody {
  code: string
  message: string
  retryable: boolean
  details: unknown[]
}

/** 成功响应体：{ meta, data } */
export interface OkBody<T> {
  meta: Meta
  data: T
}

export interface ErrBody {
  meta: Meta
  error: ErrorBody
}

export type InvitationStatus = 'INVITED' | 'ACCEPTED' | 'DECLINED' | 'REVOKED' | 'EXPIRED'
export interface Invitation {
  invitation_id: string
  party_id: string
  inviter_account_id?: string
  invitee_account_id?: string
  current_status: InvitationStatus
  object_version: number
  expires_at: string
  /** Sent receipt saved only in this browser tab; not an outgoing-list API. */
  needsRefresh?: boolean
}
export interface Member {
  id: string
  party_id: string
  account_id: string
  role_code: 'OWNER' | 'MEMBER'
  current_status: MembershipStatus
  object_version: number
}
export interface AccountCommand {
  kind: 'create' | 'rename' | 'capability' | 'invite' | 'respond' | 'revoke' | 'remove'
  label: string
  key: string
  party?: string
  version?: number
  name?: string
  code?: CapabilityCode
  account?: string
  expires?: string
  invitation?: string
  decision?: 'ACCEPT' | 'DECLINE'
}
