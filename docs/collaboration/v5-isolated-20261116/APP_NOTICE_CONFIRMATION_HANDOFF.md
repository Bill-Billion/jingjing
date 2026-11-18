# 本人投稿新版确认：实际接入交接
基线066e111bd4a50cb7d3dc83f1a368e8a413d2c9a8；先读APP_NOTICE_CONFIRMATION_NEXT.md。仅本批五源码文件。其他预览/方案文件未动；只读历史页原文件未改。
## 新操作
私有/notices/notice-confirmation?recordId入口仅本人拥有、parent_id与submission.notice_id关联一致的SUBMISSION。Gate默认私有，每次读取再次核owner/关联；不向接收方或公开目录开放。
原投稿notice_snapshot、上次notice_acknowledgement、当前history.current分别展示完整标题/正文/类型详情/起止/ID/hash；无旧快照明确缺失，不回填。模型新增可选快照关联校验，兼容两字段不存在旧记录。
新表单闭包冻结投稿version与当前object_version/hash/revision_id；POST body只有notice_version/notice_sha256，If-Match原投稿版本。阅读checkbox初始false；提交事实弹窗完整当前内容/冻结版本/业务边界。不表示合同、录用、支付或新增权限。
beforeSubmit重新读取source/current，仅比较冻结双对象，不替换body；不符清勾选、stale并阻断。局部_ConfirmationApi.post捕获POST窗口的412/NOTICE_CONTENT_MISMATCH等明确错误，清勾选并失效，覆盖核对后再变版竞态，不改公共V5Form。
无pending时显式重读双对象并重建新GlobalKey/未勾选表单；V5Form.reload也走双对象重建，不能仅更新If-Match仍复用旧勾选。
## 原请求恢复
新增精确/submissions/{id}/notice-confirmation白名单。restoreOperation先读取本人原SUBMISSION核仍可访问与关联，retry原body/version/key，不要求当前仍IN_REVIEW/SENT/INTERESTED或当前hash一致。
表单pending分支沿原V5Form机制：跳过新canSubmit/勾选/beforeSubmit，用原op.body/op.version；reloadForm在pending下只核源记录访问，不读新通告、不重建、不更新payload。未读取到上下文时提供仅本路径V5RecoveryPanel。
页面恢复与新提交都校验返回id/kind/owner与ack的原请求notice_version/hash；成功后重新读取当前source/current，不把幂等缓存当最新，不自行清pending。未知请求期间不允许重读重建新操作。
局部API观察只处理明确版本/状态/权限错误，未知/5xx继续原pending机制；登录/身份/权限变化清除私有显示并ticket失效。
## 约束
无业务请求、联调、测试、编译、analyzer、formatter、commit/push。此为代码实现，未验证运行正确性。没有接受新版自动操作，历史阅读本身仍无确认副作用。
同事待测：本人/接收方/其他主体、无旧快照、仅对象版本变化、并发正文变化、提交前后变版窗口、状态/期限拒绝、原成功响应丢失后状态变化的同key重放、5xx/pending、身份切换及离页。均未跑。
修改前已在仓库外备份，增量补丁仅本地保留。
## SHA256
- notices/notices_models.dart: fbdb2df7080cfa375cbf3cef6a1b0c3e5c1cd3a5bb7025b64546f4082758da01
- notices/notices_api.dart: 90dfe0dcf7c5ea47ac84251ad9755f28fc47d521521f8c2de08e95674531c387
- notices/notices_confirmation.dart: 03228157f3bfa472772b76be17a2f3054b84d06a346145618554baabe2819cc2
- notices/notices_pages.dart: 57b4cc2122d3450454523db359502675d75058625056d7f8f2220623aec799c9
- app.dart: 2aaaac44ccc3bb78e8295d1ab7bedbd081a0be0ed7e40b2ad4967487ba088e44
