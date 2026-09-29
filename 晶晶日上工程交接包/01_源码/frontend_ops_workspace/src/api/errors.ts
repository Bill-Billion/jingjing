/**
 * 后端错误码 → 一句人话。
 *
 * 为什么单独放一个文件：后端返回的 message 是固定的通用文案
 * （见 account-api.js 的错误处理中间件，4xx 一律是"请求未通过校验或权限检查"），
 * 页面需要的是"出了什么事 + 我该怎么办"。这里只做翻译，不改变语义，也不吞错误。
 *
 * 写文案的规矩：
 *   · 一句话，说清下一步。不解释系统怎么实现的，那不是用户的事。
 *   · 不道歉、不卖萌、不用感叹号。
 *   · 不认识的错误码必须把原始 code 露出来（由 ApiErrorAlert 负责显示），
 *     不许改写成"操作失败"糊过去。
 */

/** 已知错误码的说明。键是后端返回的 error.code。 */
const CODE_MESSAGES: Record<string, string> = {
  NETWORK_UNREACHABLE: '连接中断，请求结果未确认。请保留原内容重试。',
  UNEXPECTED_RESPONSE_SHAPE: '服务器回复未能确认结果，请重试原操作。',
  IDEMPOTENCY_IN_PROGRESS: '上一项操作仍在处理中，请稍后重试原操作。',
  IDEMPOTENCY_CONFLICT: '本次请求与原操作不一致，请刷新并核对记录。',
  ALREADY_MEMBER: '这个账号已经是机构成员。',
  INVITATION_ALREADY_PENDING: '已向这个账号发出邀请，请等待对方处理。',
  INVITEE_NOT_AVAILABLE: '找不到可邀请的账号，请向对方核对账号编号。',
  INVALID_EXPIRY: '请选择有效的邀请截止时间。',
  OWNER_REMOVAL_FORBIDDEN: '不能移除机构负责人。',
  ACCOUNT_NOT_ACTIVE: '账号已停用，请联系平台管理员。',
  PARTY_NOT_ACTIVE: '该身份已停用或关闭，请切换其他身份。',
  INVITER_NO_LONGER_AUTHORIZED: '邀请人的权限已改变，请联系机构负责人重新确认。',
  MEMBERSHIP_NOT_ACTIVE: '该成员关系已失效，请刷新查看。',
  // —— 短信与登录 ——
  SMS_NOT_READY: '短信服务暂不可用，请稍后重试或联系平台管理员。',
  SMS_CHALLENGE_UNAVAILABLE: '这条验证码已失效，请重新获取。',
  AUTHENTICATION_REQUIRED: '登录已过期，请重新登录。',
  SMS_DEBUG_LOGGING_FORBIDDEN: '短信发送被服务器配置拦截，请联系平台管理员。',

  // —— 输入 ——
  INVALID_JSON: '请求格式有误，请刷新页面后重试。',
  BODY_TOO_LARGE: '提交的内容过大。',
  INVALID_INPUT: '填写内容不合法，请检查后重试。',
  INVALID_DISPLAY_NAME: '名称不能为空，也不能超过长度限制。',
  INVALID_REFERENCE: '请求参数格式不正确。',
  INVALID_ID: '编号格式不正确。',
  INVALID_CURSOR: '翻页位置已失效，请回到第一页。',
  INVALID_LIMIT: '每页条数需要在 1 到 100 之间。',

  // —— 权限与可见性 ——
  PARTY_ACTION_FORBIDDEN: '当前身份没有这项操作的权限。',
  ACTING_PARTY_REQUIRED: '请求缺少必要的身份信息，请刷新页面重试。',
  ACTING_PARTY_MISMATCH: '请求中的身份信息不一致，已被拒绝。',
  ORIGIN_NOT_ALLOWED: '当前访问地址不在允许范围内，请联系平台管理员。',

  // —— 版本与重放 ——
  EXPECTED_VERSION_REQUIRED: '缺少版本信息，无法保存。',
  INVALID_VERSION: '版本信息格式不正确。',
  VERSION_CONFLICT: '这条记录已被他人修改，请刷新后重试。',
  INVITATION_NOT_PENDING: '这条邀请已不是待接受状态。',
  INVITATION_EXPIRED: '这条邀请已过期。',

  // —— 限流与服务 ——
  RATE_LIMITED: '操作过于频繁，请稍后再试。',
  /**
   * ⚠️ 这个码在当前后端里**不会出现**，照样译是因为契约里定义了它。
   * repository.js 抛的 SMS_OUTCOME_UNKNOWN 会被自己的 catch 改写成 SMS_NOT_READY，
   * account-api.js 错误码白名单里的 COMMIT_OUTCOME_UNKNOWN 也没有任何地方产生。
   * 详见 docs/tasks/records/REVIEW-20260923-pr11-account-api.md 追加发现 5。
   */
  COMMIT_OUTCOME_UNKNOWN: '提交结果暂未确认，请用同样的内容重试。',
  SERVICE_UNAVAILABLE: '服务暂不可用，请稍后重试。',
  NOT_FOUND: '找不到该内容，或你没有权限查看。',
}

/** 按 HTTP 状态码兜底（当后端没有给出可识别的 code） */
const STATUS_MESSAGES: Record<number, string> = {
  400: '请求不合法，请检查后重试。',
  401: '手机号或验证码不正确。',
  403: '没有权限进行这项操作。',
  404: '找不到该内容，或你没有权限查看。',
  409: '请求与已有记录冲突，请重新发起。',
  412: '数据已被他人修改，请刷新后重试。',
  413: '提交的内容过大。',
  428: '缺少必要的版本信息。',
  429: '操作过于频繁，请稍后再试。',
  503: '服务暂不可用，请稍后重试。',
}

export interface ErrorLike {
  status: number;
  code: string;
  /** 后端返回的原始 message */
  message: string;
  retryable: boolean;
  requestId?: string | null;
}

/** 取一句给人看的中文说明。找不到就返回 null，让调用方决定怎么展示。 */
export function explainError(e: ErrorLike): string | null {
  // 前端自己产生的校验错误（CLIENT_*）：message 本来就是给人看的话，直接用
  if (e.code.startsWith('CLIENT_')) return e.message;
  const byCode = CODE_MESSAGES[e.code];
  if (byCode) return byCode;
  const byStatus = STATUS_MESSAGES[e.status];
  if (byStatus) return byStatus;
  return null;
}

/**
 * 这个错误是否值得重试。留给以后做「重试」按钮时用——当前登录页没有这个按钮，
 * 因为用户手动再点一次就是重试。
 *
 * ⚠️ 下面三行兜底不是保险，而是**主力**：后端的错误处理中间件把 error.retryable
 * 写死成 false（account-api.js 的兜底里），所以 e.retryable 实际上永远是 false，
 * 连 503 这种明显可重试的情况也是。详见 REVIEW-20260923-pr11-account-api.md 追加发现 4。
 * 等后端真的给 retryable 赋值之后，这里可以简化成只看 e.retryable。
 */
export function isRetryable(e: ErrorLike): boolean {
  if (e.retryable) return true;
  return e.status === 429 || e.status === 503 || e.status >= 500;
}
