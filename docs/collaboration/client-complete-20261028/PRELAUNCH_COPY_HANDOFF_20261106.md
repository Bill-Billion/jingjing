# 前端接续：本人资料副本的范围、授权/模型和文件

接口0.31.37-rc.1，数据库0209，无新增迁移。后端chengcongcong222已实现并本机隔离验证；Bill-Billion本批尚未确认认领。原申请、处理、下载页面已有，不重新派为未开发。

## 三项本批工作

1. 在本人QUERY/COPY申请详情加载 GET `/api/v1/privacy/requests/{request_id}/copy-options`。展示categories中的category、coverage、remaining、file_copy_supported。用户要知道这次具体拿到什么、哪些还在整理。request_completion恒为NOT_CONFIRMED，不据读取成功把整个申请变成完成。
2. 原GET `/requests/{request_id}/data?category=...`兼容扩展CONTRACTS、DIGITAL_MODELS。CONTRACTS返回items[].id和records[]，新旧来源分别ARTIST/SUPPLY，同ID可有两条；记录有avatar_id、person_id（旧档为null）、current_status、object_version及consent（用途/地域/起止/正文等允许字段）。标题用“形象授权记录”，不可称“全部合同”。DIGITAL_MODELS返回本人制作资产id/状态/版本/avatar_id/consent_id/asset_type，不是可下载模型。按next_cursor分页，空页与剩余范围要能理解。
3. ARTIST_MATERIALS/CONTENT数据列表中的本人原件（故事附件见下方增量），使用 GET `/requests/{request_id}/copies/{asset_id}/content?category=ARTIST_MATERIALS|CONTENT`，携带账号会话、不带X-Acting-Party。返回受控字节，不是公开URL；展示保存/重试和不可访问原因。错误或切身份后清掉旧下载内容，不自动改用机构会话或下载他人证据。其他文件类型仍走原业务或经审核答复。

## 独立验收

用同一COPY申请查看七类范围 → 授权逐页 → 模型记录 → 本人原件下载，校验内容一致；仅PROFILE的请求不得下载素材；他人、运营、机构头不得以本人名义导出；读取中状态改变必须失败；返回重开仍是同一申请；文件下载成功不得自动结案。当前本批后端77项隐私回归、13份HTTP协议响应已验证，页面未新跑。

接口文件为contracts/openapi.yaml；本批HTTP例子见docs/reviews/prelaunch-20261106/privacy-copy-http.json。后端独立检查：在backend_server运行 `node scripts/test-mysql.js privacy-copy`，需现有本机隔离JX_MYSQL_TEST_ENV_FILE；源码不写配置内容。完整范围与下一批机构/推荐建议见PRELAUNCH_EXECUTION_20261106.md。

兼容说明：旧五类响应字段保持；新增两类须由客户端主动请求。授权/模型仍有明确覆盖限制，具体剩余由copy-options说明。无真实服务、付费动作、共享数据库修改或旧订单重写。

## 本次接续：故事历史、补件草稿和附件（前批三项的增量）

0.31.37-rc.1/0209。前批三项已发布，尚未确认Bill-Billion认领；本批是在同一资料副本页继续补故事分支，不重新派申请/审核页面。后端已通过完整隐私85项、故事75项及实际HTTP结构验证；页面尚未验。

- 从原`data?category=PRIVATE_STORY`得到story.id。读取`GET /api/v1/privacy/requests/{request_id}/stories/{story_id}/data?section=SUBMISSIONS|SUPPLEMENTS|ATTACHMENTS&limit=20`；后续使用返回的next_cursor，同一section、同一故事单独保存游标。不可将三个清单的游标混用。
- SUBMISSIONS按正式提交顺序返回id、submission_number、template_version_id、template_snapshot、answers、submitted_at和content_sha256；标签写“正式版本1/2…”，不得把未提交草稿混到正式历史。
- SUPPLEMENTS按补件顺序返回客户可见items、responses、current_status、requested_at及正式重提编号/时间。OPEN的draft_answers仅本人可见；RESPONDED的draft_answers为null，正式答案按response_submission_id定位。运营账号及内部审核记录不返回。
- ATTACHMENTS返回既有附件元数据，包括READY/UPLOADING/REVOKED；READY原件通过`/requests/{request_id}/copies/{asset_id}/content?category=PRIVATE_STORY`复制。仍是账号会话、不带身份头，文件读取中失权要失败，不能改成公开链接。
- `copy-options`现在PRIVATE_STORY的file_copy_supported为true，remaining说明历史和草稿可从此处取得。旧数据列表仍只提供当前文字，保持兼容；完整个人副本仍不自动结案。

同一故事验收：首次正式提交旧文件 → 补件换新文件仅保存 → 本人看得到补件草稿，运营只能看旧正式版 → 正式重提 → 复制两版答案和各自文件，校验字节 → 再开补件，确认新草稿仍单列。另查机构创建的故事不能走本人副本、跨故事游标拒绝、切身份/断网恢复不串资料。证据见[故事副本报告](../../reviews/prelaunch-story-copy-20261106/REPORT.md)。
