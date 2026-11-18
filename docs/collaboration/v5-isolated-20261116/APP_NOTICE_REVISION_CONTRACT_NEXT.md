# 通告修订能力：下一批接入依据
基于fda684b2及当前源码只读核对。未发接口请求、未测试、未修改App。下列后端能力已存在，运行环境是否同版待核，不再笼统称为契约不存在。

路径前缀：后端位于晶晶日上工程交接包/01_源码/backend_server/src；前端位于同级frontend_jingjingshangri_app/lib。

## 1. 优先：授权修订历史（只读）
- HTTP：GET /api/v1/notices/announcements/:record_id/history，cursor/limit分页。
- 依据：http/notices-routes.js:23；modules/notices/revisions.js:73–86。
- 返回notice_id、current（notice_id/object_version/revision_id/notice_sha256/notice）、items、next_cursor。
- 发布者需通过当前主体权限；非发布者必须有可访问的关联投稿，只得到APPROVED修订去除作者/审核人元数据的投影。不能接成公开历史目录。
- 发布者items为完整NOTICE_REVISION记录；投稿者items为id/current_status/base_snapshot/notice/notice_sha256，须区分DTO，不能统一硬套NoticeRecord。
- 拟动notices_api.dart、notices_models.dart及notices_pages.dart的私有详情入口。增加真实分页、失败与空态、身份代际守卫；不改变当前通告或投稿。

## 2. 后续：投稿方阅读新版后确认
- POST /api/v1/notices/submissions/:record_id/notice-confirmation。
- body为notice_version、notice_sha256，If-Match绑定投稿object_version，Idempotency-Key沿既有机制。
- 依据：http/notices-routes.js:15；modules/notices/revisions.js:56–71。
- 必须投稿owner；投稿状态仅IN_REVIEW/SENT/INTERESTED；后端核通告当前版本和内容摘要，保存notice_acknowledgement但不改变投稿状态。
- assertAccepted在同文件:7–10可抛NOTICE_REVISION_ACK_REQUIRED。应先给本人查看原版本与当前内容，再明确确认，不能自动同意或将其当签署/授权。
- 拟动notices_api.dart恢复白名单、notices_models.dart快照校验、notices_submission.dart及详情的只读提示与唯一确认动作。保留pending、版本冲突与重新读取；不能生成新请求掩盖旧请求未知结果。

## 3. 后续：已发布通告修订申请
- POST /api/v1/notices/announcements/:record_id/revisions；body notice/reason，If-Match绑定原通告版本，Idempotency-Key。
- 依据：http/notices-routes.js:14；modules/notices/revisions.js:11–19、43–54及审核:21–40。
- 当前通告必须PUBLISHED，不能改变type/project_id；仍核成年实名发布资格/机构范围、有效期、隐私限制及项目归属；内容相同拒绝。
- 结果是IN_REVIEW的NOTICE_REVISION，不是立即修改公开内容。独立审核批准后才更新原通告，旧投稿后续可能需重新确认。
- 拟动notices_pages.dart已有表单复用、notices_api.dart、notices_models.dart；需新增修订记录识别和pending恢复，而非将创建通告接口冒充编辑。
- 官方通告的运营权限不能以普通本人路径开放。

## 已核前端缺口与实施顺序
notices_models.dart:117起NoticeRecord种类白名单没有NOTICE_REVISION；notices_api.dart:8–18恢复路径不含修订/新版确认；notices目录未见上述历史/确认调用和快照字段的显式接入。现有发布、撤回、回复与素材授权均须保留。
先完成第1项低风险读取；第2、3项为有后端依据但需要完整幂等恢复的写入，不应只加按钮。前端与后端静态存在不代表已经联调，也不扩大到CASE补材、客服聊天或全域聚合。修改前须重新读取最新文件并库外备份。
