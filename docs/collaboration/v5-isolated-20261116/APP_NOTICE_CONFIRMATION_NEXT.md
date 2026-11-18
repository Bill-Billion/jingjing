# 投稿新版确认：下一批接入方案

基于 fda684b2 及当前源码的只读核对。仅为接入设计，确认页尚未实施；未发接口请求、未测试或编译。历史页交付后须按最新 DTO 和路由重新核对，不以本文件代替运行验收。

本文后端路径相对 backend_server/src，前端路径相对 frontend_jingjingshangri_app/lib，均位于晶晶日上工程交接包/01_源码。

## 1. 后端响应、权限及版本
- http/notices-routes.js:15：POST /api/v1/notices/submissions/:id/notice-confirmation。
- Body 仅 notice_version、notice_sha256；X-Acting-Party 为本人当前主体，If-Match 为投稿 object_version，Idempotency-Key 沿原请求机制。
- modules/notices/revisions.js:56–71：投稿必须关联通告且调用方为投稿 owner。新操作状态限定 IN_REVIEW、SENT、INTERESTED。
- 同时校验投稿 expected_version、当前通告 notice_version 及 notice_sha256。
- 调用 currentSubmission 继续核有效期、通告开放、人物/许可及材料等。阅读确认不能替代资格核验。
- 保存 data.notice_acknowledgement = {...snapshot(currentNotice), account_id}。
- 返回完整 SUBMISSION，保持原状态，object_version 加一及内容摘要更新；不产生录用、签约、付款或额外授权事实。
- http/notices-routes.js:7–9 处理 If-Match、ETag 和通用响应。不能把 ETag 的投稿版本误用为通告版本。

## 2. 幂等与原 pending 恢复
- modules/notices/context.js:12 的 command 用账号、操作名 ACK_REVISION、operation_key 定位，校验完整输入指纹并重放已保存结果。
- 当前访问权限检查在 command 前；版本、状态及当前内容检查在 command 内。原请求成功但响应丢失后，不应因当前状态或版本变化而在前端禁掉原请求恢复。
- account/account_api.dart:225–262、328–348 已按账号/主体/路径/body/version 关联原 key 并记录未知结果。恢复只允许原 body、原 version、原 key，不改公共机制。
- NoticesApi.recoveryLabel 精确增加 notice-confirmation 路径，不放宽到任意写接口。
- NoticesApi.restoreOperation 先读取当前投稿确认仍可访问，再用 retry 重放原请求。读取结果可作提示，不能替换 pending 内容。
- 不因当前 acknowledgement 看似匹配而自行清除 pending；原请求的恢复结果仍需核实。
- 原请求恢复不属于一次新的同意，不要求重新勾选后改成新 body；也不得将恢复按钮变成自动确认最新版本。

## 3. 模型与历史对照
复用授权历史页的快照 DTO，明确校验：
notice_id、object_version、revision_id（可空）、notice_sha256、notice。

SUBMISSION 的两个可选历史字段：
- notice_snapshot：投稿时依据。
- notice_acknowledgement：上次明确确认的版本，可额外含 account_id。

history.current 为本次可读取的最新内容。校验关联 notice_id 与投稿关联通告一致，完整 notice 沿 validateNotice。页面分别呈现原投稿依据、上次已确认（如有）及当前通告，完整展示 noticeFacts，不能仅显示哈希或标题。

旧记录没有 notice_snapshot 时明确显示未保存原投稿版本，不用 current 回填历史。匹配语义沿后端 revisions.js:7–10：notice_id、revision_id、notice_sha256；不能仅因 object_version 变化断言正文变更。提交仍绑定当前完整 object_version。

## 4. 用户明确阅读与拟改方法
- notices_models.dart：可选快照与关联 ID 校验；兼容无快照旧记录。
- notices_api.dart：确认路径、响应校验及原请求恢复白名单。
- notices_pages.dart 或独立确认 panel：由本人 SUBMISSION 私有详情进入，复用已落历史模型；公众历史页不开放确认。
- 复用 V5Form 唯一提交和原恢复机制，不复制另一套提交处理。
- 初始阅读勾选为 false。可用文案：我已阅读当前通告变化，确认本次投稿继续依据此版本办理。
- 明确说明此动作不等于接受合同、正式录用或增加肖像/声音/训练/商用权限。
- 提交确认弹窗显示真实通告标题、版本、当前内容及业务边界。
- 新请求冻结 submission.version、current.object_version、current.notice_sha256、revision_id。
- beforeSubmit 可重新读取投稿和 current，只核对被冻结对象，不自动改成最新版本。
- 成功后重读投稿与 current；不能把幂等缓存响应推断成当前仍为最新。

## 5. 刷新、冲突与失效
- 412、NOTICE_CONTENT_MISMATCH：重读投稿及 current，撤销阅读勾选，要求重新明确确认。
- 不能仅让 V5Form.reload 更新投稿 If-Match，同时继续携带旧通告摘要和已勾选状态。
- 无 pending 时，当前内容变化后明确重建确认上下文；不可悄悄复用先前阅读同意。
- NOTICE_CANNOT_CONFIRM、NOTICE_SUBMISSION_EXPIRED、NOTICE_NOT_OPEN：保持只读并说明不能继续，不自动发新请求。
- NOTICE_REVISION_ACK_REQUIRED：提示本人阅读新版，不代本人确认。
- 401/403/404、身份切换、离页：沿原域权限、epoch、ticket 处理，清除失效的私有显示。
- 网络未知、5xx、IDEMPOTENCY_IN_PROGRESS：保留原 pending，禁新确认，仅恢复原请求。
- 有 pending 时，刷新、重新挂载表单、改稿或生成新 key 都不能绕过原未知结果。
- 读取门禁依旧由后端执行；前端显示条件不是权限证明。

## 6. 实施与待验边界
先等待授权历史页的模型与入口稳定，再基于最新文件实现本方案。实施前库外备份。不得新增自动确认或新授权语义。

待同事在固定前后端版本核验：本人/接收方/其他主体、无快照旧投稿、正文修订、仅记录版本变化、失效通告、过期投稿、权限撤回、两个版本并发修改、网络结果未知及原 key 重放、离页/切身份后返回。以上均为待验项目，未预填通过。
