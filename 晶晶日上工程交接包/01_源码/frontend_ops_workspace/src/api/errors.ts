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
  GIG_PARTY_FORBIDDEN: '请使用本商业合作参与方的有效负责人身份。',
  GIG_REVIEW_FORBIDDEN: '当前账号没有独立商单审核或榜单生成权限。',
  GIG_NOT_FOUND: '商业记录不存在，或当前身份无权读取。',
  GIG_RULE_NOT_EFFECTIVE: '原商单规则当前未生效，请核对真实版本。',
  GIG_NOT_PUBLISHED: '此需求当前未发布，不能提交或继续采用提案。',
  GIG_EXPIRED: '此商单已到期，请核对原需求。',
  MCN_CAPABILITY_REQUIRED: '发起或采用直接合作需要当前有效的 MCN 能力，前端不能自行批准。',
  RELATION_NOT_APPLICABLE: '直接 MCN 关系已变化、未生效或不在期限内，请核对原关系。',
  RELATION_SCOPE_CONFLICT: '本次排他合作与有效直接关系冲突，请核对原约定。',
  MCN_EXCEEDS_PLATFORM: 'MCN 费率不能高于平台费率；MCN 费用从平台费用中划分。',
  COMMERCIAL_CONSENT_REQUIRED: '本人 FACE 与 VOICE 的已审商业同意未覆盖本次地域或期限，请核对原同意记录。',
  COMMERCIAL_AGREEMENT_MISMATCH: '提案状态、买卖主体或原商业协议不一致，请重新核对。',
  COMMERCIAL_AGREEMENT_CHANGED: '原提案、规则或直接关系已变化，请读取最新记录后重新确认。',
  COMMERCIAL_LINES_MISMATCH: '商单报价只能使用原提案的单项本人服务，数量必须为一。',
  COMMERCIAL_ORDER_EXISTS: '此提案已关联订单，请读取已有报价与订单。',
  COMMERCIAL_ORDER_REQUIRED: '此订单没有真实商单履约关联，不能核算商业佣金。',
  COMMISSION_MANUAL_REVIEW_REQUIRED: '订单收款、退款或状态存在需人工核实的事实，当前不能计算佣金。',
  INVALID_RANKING_DATE: '榜单日期须为已经完成的历史日期，按 UTC 零时生成。',
  SUPPLY_EVIDENCE_MISMATCH: '私有证据用途或主体归属与本项商单不一致。',
  PRIVATE_CONTENT_MISMATCH: '私有文件的大小或内容指纹未能核对，不能使用该内容。',
  SELF_REVIEW_FORBIDDEN: '不能审核自己提交或本人所属机构及参与方的材料。',
  PROJECT_PARTY_FORBIDDEN: '请使用本项目发起方或指定参与方的有效负责人身份。',
  PROJECT_REVIEW_FORBIDDEN: '当前账号没有独立项目核验权限。',
  PROJECT_NOT_FOUND: '项目记录不存在，或当前身份无权查看。',
  PROJECT_PARTY_NOT_ACTIVE: '本项目相关主体已停用或关闭，请核对实际身份。',
  PROJECT_CANCELLED: '项目已经取消，不能继续办理本项业务。',
  PROJECT_NOT_USABLE: '项目已取消或使用期限已结束，不能继续确认或发行。',
  PROJECT_PLAN_REQUIRED: '尚未提交项目方案，请先明确六层权利与确认顺序。',
  PROJECT_PLAN_NOT_APPROVED: '当前项目方案尚未通过独立核验。',
  PROJECT_PLAN_ALREADY_EXISTS: '已有项目方案，不能再增加招募角色。',
  PROJECT_NOT_STARTED: '项目尚未启动，暂不能提交成片材料或发行申请。',
  PROJECT_VERSION_SUPERSEDED: '这份方案或成片已被新版本替代，请重新读取当前版本。',
  PROJECT_CONFIRMATIONS_REQUIRED: '当前准确内容尚未取得全部指定方的批准确认。',
  PROJECT_RIGHTS_EXPIRED: '当前方案中的权利期限已经结束，请另提新方案。',
  PROJECT_EVIDENCE_REQUIRED: '证明须是发起方所有、可用且用途正确的私有材料。',
  PROJECT_EVIDENCE_FORBIDDEN: '当前身份无权下载本事项的原始证明。',
  ROLE_NOT_OPEN: '角色已停止开放报名，请刷新公开目录。',
  ROLE_PRICE_MISMATCH: '报名金额与该角色明确固定价不一致，请核对原条款。',
  ROLE_CAPACITY_REACHED: '本角色确认人数已达到明确名额，不能再选入。',
  ALREADY_APPLIED: '本人已向本角色报名，请读取已有候选记录。',
  CANDIDATE_TRANSITION_INVALID: '候选状态已变化，请重新读取后作出当前允许的决定。',
  CAST_INCOMPLETE: '招募角色尚未全部达到本人确认的实际人数。',
  CAST_CONSENT_NOT_AVAILABLE: '角色本人同意尚未满足本项目用途、地域及期限。',
  CAST_AVATAR_MISMATCH: '候选数字人与本人同意记录不一致，请核对。',
  CAST_CHANGED_RECONFIRM_REQUIRED: '入选名单已变化，须提交新方案并重新核验、会签。',
  CAST_FUNDING_REQUIRED: '有价角色尚未关联已实际付款的 OTHER 角色明细。',
  CAST_FUNDING_NOT_VERIFIED: '角色订单金额、收款方、付款或退款状态与本次约定不符。',
  FUNDING_ALREADY_ASSIGNED: '这条角色付款明细已用于另一候选，不能重复关联。',
  RIGHTS_LAYERS_REQUIRED: '须明确填写脸声、原作、剧本、音乐、改编及成片六层权利。',
  RIGHTS_SCOPE_MISMATCH: '各层权利用途与地域须覆盖本项目准确范围。',
  RIGHTS_PERIOD_TOO_SHORT: '权利有效期未覆盖项目使用期限。',
  REQUIRED_RIGHTSHOLDER_MISSING: '确认方缺少本次所需的真实权利人或本人主体。',
  UNRELATED_CONFIRMER: '指定确认方与本方案无权利或参与关系，请核对。',
  CONFIRMATION_CYCLE: '确认顺序存在循环，请明确可以依次完成的前置关系。',
  UNKNOWN_CONFIRMATION_DEPENDENCY: '前置主体未列入本版确认方，请核对顺序。',
  CONFIRMER_NOT_AUTHORIZED: '当前身份不是本版指定的确认方。',
  CONFIRMATION_VERSION_MISMATCH: '本版内容或独立审核状态已变化，请重新读取后确认。',
  CONFIRMATION_PREDECESSOR_REQUIRED: '本方的前置确认尚未对这份准确内容批准。',
  ALREADY_CONFIRMED: '本方已经决定，不能覆盖历史确认；新版本须重新确认。',
  PRODUCTION_PROJECT_MISMATCH: '关联制作项目的实际买方与本项目发起方不一致。',
  SOURCE_RELEASE_CONSENT_REQUIRED: '原制作的脸声依据尚未取得本次公开分享或发行同意。',
  DISTRIBUTION_LICENSE_REQUIRED: '实际改编作品许可及付款尚不满足发行权条件。',
  FINAL_DELIVERY_NOT_ACCEPTED_PAID: '制作当前成片尚未验收，或原订单尚未实际付清。',
  FINAL_VERSION_CHANGED: '准确成片内容已变化，请重新建立材料版并审核、会签。',
  CHANNEL_NOT_APPROVED: '所选渠道尚未通过独立核验。',
  RELEASE_ALREADY_PENDING: '本渠道已有未结束的发行申请，请读取原申请。',
  RELEASE_PREDECESSOR_REQUIRED: '本次补件或重新申请须明确关联前次发行记录。',
  RELEASE_PREDECESSOR_USED: '前次记录已关联后续申请，请读取最新申请。',
  INVALID_RELEASE_PREDECESSOR: '前次记录的项目、渠道或当前状态不允许本次重提。',
  RELEASE_MATERIAL_REQUIRED: '本次成片或发行须提供 1 至 30 份实际私有材料。',
  EXTERNAL_TRANSITION_INVALID: '外部报告与当前发行事实不匹配，请核对实际凭据及状态。',
  EXTERNAL_EVENT_IN_FUTURE: '外部事实的发生时间不能晚于当前时间。',
  MANUAL_VERIFICATION_REQUIRED: '请逐项核实本次真实材料后明确保存核验结论。',
  PRODUCTION_PARTY_FORBIDDEN: '当前身份没有本项目的制作权限，请核对有效成员关系与实际分配。',
  PRODUCTION_REVIEW_FORBIDDEN: '当前账号没有独立制作核验权限。',
  PRODUCTION_NOT_FOUND: '制作记录不存在，或当前身份无权查看。',
  PRODUCTION_MERCHANT_REQUIRED: '需原订单商家的有效负责人身份办理。',
  PRODUCTION_BUYER_REQUIRED: '需本项目买方的有效负责人身份提交客户决定。',
  PRODUCTION_ASSIGNEE_REQUIRED: '只有原制作方当前获分配账号可以办理本项制作。',
  ASSIGNEE_NOT_MEMBER: '该负责账号不是原制作方的有效成员，请重新核对。',
  PRODUCTION_SCRIPT_NOT_APPROVED: '所选剧本版本尚未双审通过，或不属于本项目可用版本。',
  PRODUCTION_LICENSE_PROJECT_MISMATCH: '许可项目与原订单约定不一致，请核对实际绑定。',
  PRODUCTION_LICENSE_NOT_READY: '本用途、地域或制作权尚未满足当前许可条件。',
  PRODUCTION_ALREADY_EXISTS: '原订单这条制作明细已经建立项目，请读取已有项目。',
  PRODUCTION_NOT_READY: '项目尚未通过独立开工核验，当前不能制作。',
  PRODUCTION_ORDER_BLOCKED: '原订单状态或退款限制已阻止继续制作，请核对原订单。',
  PRODUCTION_PAYMENT_REQUIRED: '原订单开工所需首期尚未实际核实到账，不能上传或生成。',
  PRODUCTION_CONSENT_NOT_AVAILABLE: '当前同意状态、用途、地域或有效期不满足本次制作。',
  PRODUCTION_CONDITIONS_NOT_VERIFIED: '实际合同、身份、签署和权利尚未逐项核验齐备。',
  PREVIOUS_VERSION_NOT_ACCEPTED: '前阶段当前版本尚未客户验收，不能提交本阶段。',
  CURRENT_APPROVED_VERSION_REQUIRED: '需当前内部已批准的版本；请重新读取项目和版本。',
  PRODUCTION_FILE_NOT_READY: '私有文件尚不可引用、格式不符或不属于本项目。',
  DISTINCT_PREVIEW_REQUIRED: '成片原文件与预览须为不同内容，请上传实际预览。',
  FINAL_DELIVERY_NOT_READY: '当前成片尚未验收或原约定款项未全部收齐，最终下载暂不可用。',
  FINAL_ALREADY_ACCEPTED: '当前成片已经客户验收，不能覆盖重交。',
  ACCEPTANCE_CHECKS_INCOMPLETE: '请实际读取本版并完成所需检查，再确认验收。',
  REVISION_LIMIT_REACHED: '本明细客户修改次数已达原约定上限，不能自动增加次数或加价。',
  SCRIPT_NOT_ACCEPTED: '当前剧本版本尚未客户验收，不能生成视频。',
  AI_TRAIN_CONSENT_REQUIRED: '长期数字人需要当前有效且明确包含 AI_TRAIN 的真实同意。',
  AI_PROCESS_LICENSE_REQUIRED: '原许可尚不包含本次 AI_PROCESS 权利。',
  AVATAR_CONSENT_MISMATCH: '数字人和同意记录不一致，请核对原记录。',
  DIGITAL_ASSET_ALREADY_REQUESTED: '已有未完成请求或长期资产，请查询原实际任务。',
  DIGITAL_ASSET_NOT_READY: '实际长期资产尚未就绪，不能发起本次生成。',
  DIGITAL_ASSET_NOT_DELETABLE: '该资产当前不能发起删除，请查询实际状态。',
  PROVIDER_NOT_IMPLEMENTED: '实际生成服务尚未实现，本次不能执行。',
  PROVIDER_NOT_CONFIGURED: '实际服务尚未配置，本次不能执行。',
  PROVIDER_NOT_VERIFIED: '实际服务尚未完成核验，本次不能执行。',
  GENERATION_OUTCOME_UNKNOWN: '原外部生成结果尚未确认，请查询实际任务并独立恢复原请求。',

  LICENSE_PAYMENT_NOT_READY: '关联订单尚未达到原许可条款要求的已核实付款金额，或存在退款限制；请核对原订单与付款记录。',
  TRADE_PARTY_FORBIDDEN: '请使用本交易买卖方的有效负责人身份。',
  TRADE_REVIEW_FORBIDDEN: '当前账号没有独立交易审核权限。',
  TRADE_REFUND_FORBIDDEN: '当前账号没有本项退款复核或执行权限。',
  TRADE_NOT_FOUND: '记录不存在，或当前身份无权查看。',
  LICENSE_PARTY_FORBIDDEN: '当前身份不能办理许可，请使用有效负责人身份。',
  LICENSE_REVIEW_FORBIDDEN: '当前账号尚未取得独立许可核验权限。',
  LICENSE_NOT_FOUND: '许可记录不存在，或当前身份无权查看。',
  WORK_NOT_APPROVED: '作品尚未完成权属与内容双审，不能办理本项许可。',
  WORK_NOT_USABLE: '此作品版本当前不能用于许可，请核对原作与供给状态。',
  RULE_NOT_EFFECTIVE: '规则版本尚未生效，请向规则维护人员核对。',
  LICENSE_SCOPE_CONFLICT: '本次范围与已有独家约定冲突，请重新核对范围；审批不能绕过冲突。',
  SELF_PURCHASE_FORBIDDEN: '不能购买当前身份自己供给的商品。',
  PRODUCT_NOT_LISTED: '商品已不在上架状态，请返回目录重新选择。',
  LICENSE_PERIOD_ENDED: '本商品的开发期已结束，当前不能预留。',
  EVIDENCE_NOT_READY: '证明材料尚不能引用，请核对归属、用途及上传结果。',
  CONTRACT_MISMATCH: '材料对应的合同内容与本次预留不一致，请核对合同指纹。',
  VERIFICATION_MISMATCH: '签署、身份、币种、金额或收款方未与约定匹配，请逐项核对。',
  RESERVATION_NOT_HELD: '预留已不在待生效状态，请刷新当前记录。',
  LICENSE_CONDITIONS_NOT_VERIFIED: '许可条件尚未独立核验齐备，不能发放。',
  LICENSE_PERIOD_NOT_ACTIVE: '尚未进入许可开始时间，或开发期已结束。',
  RECEIPT_ALREADY_USED: '这笔收款凭证已用于另一份许可，请核实实际付款，不能重复使用。',
  LICENSE_NOT_ACTIVE: '许可已不在有效状态，请刷新查看。',
  PROJECT_ALREADY_BOUND: '此项目已经绑定本许可，不重复分配额度。',
  LICENSE_QUOTA_EXHAUSTED: '本许可的项目额度已经用完。',
  INVALID_PROJECT: '项目用途、地域、语言或集数不完整，请核对。',
  READING_EXPIRED: '阅读截止时间已过，请重新核对授权。',
  READING_FORBIDDEN: '当前账号和身份没有有效的阅稿授权，或授权已过期、撤销。',
  READING_FORMAT_NOT_SUPPORTED: '当前受控阅读只支持 UTF-8 纯文本，无法读取此文件格式。',
  CLOSE_FORBIDDEN: '本记录当前不能关闭，请刷新核对状态。',
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
  SNAPSHOT_NOT_FOUND: '内容不存在或当前身份无权查看。请核对合同编号与所选身份。',
  RULE_NOT_FOUND: '这份合同下无法读取该规则，请重新读取合同后选择。',
  SUPPLY_PARTY_FORBIDDEN: '当前身份没有办理供给或读取私有稿件的权限。请使用有效负责人身份。',
  SUPPLY_REVIEW_FORBIDDEN: '当前账号未获这项独立审核权限。',
  SUPPLY_NOT_FOUND: '记录或材料不存在，或当前身份无权查看。',
  SUPPLIER_NOT_APPROVED: '请先取得当前供给申请的审核批准。',
  PREVIOUS_VERSION_MISMATCH: '已有更新修订，请刷新记录并从最新版本重新填写。',
  PRIVATE_MATERIAL_NOT_READY: '材料尚不可引用，请核对归属、用途和上传结果。',
  UPLOAD_RECONCILIATION_REQUIRED: '上传结果需要人工核对，暂不能再次上传这份材料。',
  PROJECT_LICENSE_NOT_READY: '项目绑定、改稿或制作权、用途范围或开发期限未满足，请核对当前许可与项目。',
  REVIEW_ALREADY_RECORDED: '本版本这项审核已有结论，请查看记录。',
  REVIEW_NOT_PENDING: '申请已处理，请刷新查看当前结论。',
  WORK_NOT_DRAFT: '只有草稿可以提交审核，请刷新查看当前状态。',
  WORK_NOT_SUBMITTED: '该版本尚不能审核，请刷新当前状态。',
  WORK_ALREADY_WITHDRAWN: '该版本已撤回，请刷新查看。',
  RIGHTS_HOLDER_REQUIRED: '请明确至少一位权利人及其证明。',
  RIGHTS_PARTY_NOT_FOUND: '权利主体不存在，请核对主体编号。',
  UNKNOWN_BUSINESS_ACTION: '无法核对所选服务，请重新选择。',
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
