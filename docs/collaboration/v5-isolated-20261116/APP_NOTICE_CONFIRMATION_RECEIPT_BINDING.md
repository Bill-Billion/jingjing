# 本人投稿新版确认：原请求回执版本绑定

## 范围与依据

修改前两个源码文件已在仓库外备份。本批仅修改 `lib/notices/notices_api.dart` 和 `lib/notices/notices_confirmation.dart`，不改变普通修改申请、只读历史、后端或共享写入机制。

此前校验已包含投稿 ID、SUBMISSION 类型、本人所有权及确认的通告版本和正文摘要，但尚未将返回投稿版本绑定原请求的 If-Match。此项是回执关联补强，不表示已观察到后端错发回执或越权。

后端静态依据（路径相对 backend_server/src）：
- `modules/notices/revisions.js:56–69`：acknowledgeRevision 校验原投稿 expected_version、通告 notice_version、正文摘要与可确认状态，再保存投稿。
- `modules/notices/context.js:11`：save 返回 object_version 加一后的记录。
- `modules/notices/context.js:12`：command 按账号、操作、幂等键及完整输入指纹关联请求；重放返回已保存的原 result_json，而非重读后的当前记录。因此恢复应核对原请求版本加一，不应要求回执等于后续最新投稿版本。

## 实际变更

- NoticesApi.post 仅对 `/submissions/:id/notice-confirmation` 启用专用回执校验。进入写入前冻结实际传入的 submission version、notice_version、notice_sha256；响应校验使用这些原请求标量，而不是页面后来读取的值。
- validateConfirmation 新增 submissionVersion，要求返回投稿 object_version 等于 submissionVersion + 1；保留既有 ID、类型、所有权及通告版本/摘要校验。
- 首次页面提交采用 frozen.version；页面恢复和通用恢复均采用原 pending.version。缺少原版本时抛出 uncertain 的 INVALID_V5_RESPONSE，不使用当前重读版本替代。
- 缺版本会在专用 post 进入底层写入之前阻断，原 pending 不被删除。响应关联不符通过现有 validate 抛 uncertain：AccountApi 在校验成功后才清 pending，失败沿既有路径保存原 body/key/version。
- 原明确阅读勾选、当前上下文校验、身份/权限处理、beforeSubmit、reload、恢复动作和成功后重新读取均保留。此动作仍不等于合同、录用、付款或新增授权。

## 静态范围与冻结摘要

人工阅读局部 diff、所有 validateConfirmation 调用点以及 V5Api.post/retry 与 AccountApi 校验清理顺序；未运行测试、编译、分析、格式化或业务请求，未提交推送。动态成功/旧回执/缺版本/身份变化及恢复仍待独立联测。

SHA-256：
- notices_api.dart：`48a732a356514099388d6bfde1e46029fc9373c956cdeff1e9cd842865ed069b`
- notices_confirmation.dart：`0159013b7833b951a2a255f0fcd607b328dd3432caae5f1adb1957d817978ca2`
