/**
 * allowed_actions 词表与"能不能显示这个按钮"的判定。
 *
 * ⚠️ 关于词表，有一件事必须先说清楚（2026-09-23 检查 PR #11 时发现）：
 *
 * 同一个 allowed_actions 字段，三个地方三种写法：
 *
 *   1) 实际运行的后端返回的是「全大写下划线」，例如：
 *        READ_ACCOUNT / LIST_PARTIES / CREATE_ORGANIZATION
 *        READ_PARTY / REQUEST_CAPABILITY / MANAGE_MEMBERS
 *      —— 来源 src/modules/party/policy.js 与实际 HTTP 返回样本。
 *      这是本文件采用的词表。
 *
 *   2) 契约示例文件 contracts/examples/platform.json 用的是「点号小写」：
 *        account.read / party.read / party.profile.update / works.submit ...
 *
 *   3) 契约静态用例 contracts/tests/schema_cases.json 又用了 payment.create。
 *
 * 契约里这个字段的 schema 只约束「字符串、1–100 字符、不重复」，没有枚举，
 * 所以离线校验发现不了。而 PROTOCOL.md 要求「客户端对未知动作保持禁用」——
 * 如果照示例文件写，运行时返回的 READ_PARTY 会被判成未知动作，按钮就永远是灰的。
 *
 * 结论：**前后端联调前，一切以实际 HTTP 返回为准，不要以示例文件为准。**
 * 这个问题已作为合入前待确认项记录在
 * docs/tasks/records/REVIEW-20260923-pr11-account-api.md。
 */

/**
 * 已知动作（按运行时实际返回值整理）。
 * 出现不在这里的取值时，按未知识别，界面保持禁用——这是刻意的保守策略。
 */
export const KNOWN_ACTIONS = {
  // 账号级（GET /api/v1/me 返回）
  READ_ACCOUNT: '查看账号',
  LIST_PARTIES: '查看我的身份',
  CREATE_ORGANIZATION: '创建机构',
  PRODUCTION_REVIEW: '独立制作核验',
  PROJECT_REVIEW: '独立项目与发行核验',

  // 主体级（GET /api/v1/me/parties 返回的 party.allowed_actions）
  READ_PARTY: '查看主体',
  REQUEST_CAPABILITY: '申请业务能力',
  MANAGE_MEMBERS: '管理成员',
} as const;

export type KnownAction = keyof typeof KNOWN_ACTIONS;

const KNOWN = new Set<string>(Object.keys(KNOWN_ACTIONS))

/** 这个动作前端是否认识。不认识时必须保守处理。 */
export function isKnownAction(action: string): action is KnownAction {
  return KNOWN.has(action)
}

/**
 * 判断界面是否应该把某个动作显示为可用。
 *
 * ⚠️ 这只决定「显示」，不决定「能不能做」。
 * 真正的鉴权在服务端——PROTOCOL.md 明确写了 allowed_actions 不能替代写时鉴权。
 * 所以：允许的操作照样会被后端 403 拒绝，页面必须如实显示那个 403。
 *
 * @param allowed 后端返回的 allowed_actions
 * @param action  想判断的动作
 */
export function canDisplay(allowed: readonly string[] | undefined | null, action: KnownAction): boolean {
  if (!allowed || allowed.length === 0) return false
  // 同时要求"后端允许"且"前端认识"；不认识的取值不会命中这里
  return allowed.includes(action) && isKnownAction(action)
}

/** 把 allowed_actions 翻译成中文，用于调试展示；不认识的取值原样保留并标记。 */
export function describeActions(allowed: readonly string[] | undefined | null): string[] {
  if (!allowed) return []
  return allowed.map((a) => {
    const label = (KNOWN_ACTIONS as Record<string, string>)[a]
    return label ? `${label}（${a}）` : `${a} ← 前端未识别的动作`
  })
}

/** 找出后端返回了但前端不认识的取值。联调时用它一眼看出词表是否对不上。 */
export function unknownActions(allowed: readonly string[] | undefined | null): string[] {
  if (!allowed) return []
  return allowed.filter((a) => !isKnownAction(a))
}
