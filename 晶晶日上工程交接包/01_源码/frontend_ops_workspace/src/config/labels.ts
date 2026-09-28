/**
 * 状态词表：把后端返回的枚举翻成中文，同时**保留原值**。
 *
 * 为什么要保留原值、而不是只显示中文：
 *   这一层是"翻译"，不是"改写"。运营人员看中文，联调的人看原值，
 *   出了争议以原值为准。所以界面上永远是「中文 + 原值」两段并排，
 *   而不是把 ACTIVE 换成"正常"就把 ACTIVE 丢掉。
 *
 * 为什么要有这张表、而不是各处硬编码字符串：
 *   枚举值来自 contracts/openapi.yaml（PR #11 / 0.2.0-rc.1），
 *   这里是唯一一份前端副本。后端改了枚举，只改这一个文件。
 *
 * ⚠️ 后端加了新枚举而这里没跟上时，lookup 不会瞎猜——
 *    它把 `known` 置为 false，界面按"未识别"如实展示原值。
 *    宁可显示一个生词，也不要显示一个编出来的中文。
 */

/** 视觉语气，映射到 tokens.css 里的状态色 */
export type Tone = 'ok' | 'warn' | 'bad' | 'off'

export interface Label {
  /** 中文说法 */
  text: string
  /** 视觉语气 */
  tone: Tone
}

export interface Resolved extends Label {
  /** 原值，始终回显 */
  code: string
  /** 词表里有没有这个取值。false 时界面必须按"未识别"展示 */
  known: boolean
}

/** 账号状态：Account.current_status（openapi.yaml:1326） */
const ACCOUNT_STATUS: Record<string, Label> = {
  ACTIVE: { text: '正常', tone: 'ok' },
  SUSPENDED: { text: '已停用', tone: 'bad' },
  DELETION_PENDING: { text: '待注销', tone: 'warn' },
}

/** 主体状态：Party.current_status（openapi.yaml:1389） */
const PARTY_STATUS: Record<string, Label> = {
  PENDING_REVIEW: { text: '待审核', tone: 'warn' },
  ACTIVE: { text: '生效中', tone: 'ok' },
  SUSPENDED: { text: '已停用', tone: 'bad' },
  CLOSED: { text: '已关闭', tone: 'off' },
}

/**
 * 业务能力状态：Capability.current_status（openapi.yaml:1360）
 * 注意与主体状态不是同一套：能力有 REJECTED，主体没有；
 * 主体有 CLOSED，能力没有。所以不能共用一张表。
 */
const CAPABILITY_STATUS: Record<string, Label> = {
  PENDING_REVIEW: { text: '待审核', tone: 'warn' },
  ACTIVE: { text: '已开通', tone: 'ok' },
  SUSPENDED: { text: '已停用', tone: 'bad' },
  REJECTED: { text: '未通过', tone: 'off' },
}

/** 主体类型：Party.kind（openapi.yaml:1374） */
const PARTY_KIND: Record<string, Label> = {
  PERSON: { text: '个人', tone: 'off' },
  ORGANIZATION: { text: '机构', tone: 'off' },
}

/** 业务能力代码：Capability.code（openapi.yaml:1354） */
const CAPABILITY_CODE: Record<string, Label> = {
  AUTHOR: { text: '作者', tone: 'off' },
  SCRIPT_SUPPLIER: { text: '剧本供应方', tone: 'off' },
  PRODUCER: { text: '制作方', tone: 'off' },
  MCN: { text: 'MCN 机构', tone: 'off' },
  BRAND_CLIENT: { text: '企业客户', tone: 'off' },
}

/** 成员角色：Membership.roles（openapi.yaml:2368） */
const MEMBER_ROLE: Record<string, Label> = {
  OWNER: { text: '所有者', tone: 'ok' },
  MEMBER: { text: '成员', tone: 'off' },
}

export type LabelKind =
  | 'account-status'
  | 'party-status'
  | 'party-kind'
  | 'capability-status'
  | 'capability-code'
  | 'member-role'

const TABLES: Record<LabelKind, Record<string, Label>> = {
  'account-status': ACCOUNT_STATUS,
  'party-status': PARTY_STATUS,
  'party-kind': PARTY_KIND,
  'capability-status': CAPABILITY_STATUS,
  'capability-code': CAPABILITY_CODE,
  'member-role': MEMBER_ROLE,
}

/**
 * 查词。查不到就如实回原值，并把 known 置 false —— 调用方据此提示"未识别"，
 * 而不是把它当成一个正常状态。
 */
export function resolveLabel(kind: LabelKind, code: string): Resolved {
  const hit = TABLES[kind][code]
  if (hit) return { ...hit, code, known: true }
  return { text: code, tone: 'off', code, known: false }
}
