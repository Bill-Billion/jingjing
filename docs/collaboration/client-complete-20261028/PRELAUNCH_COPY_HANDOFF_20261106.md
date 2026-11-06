# 前端接续：本人资料副本的范围、授权/模型和文件

接口0.31.38-rc.1，数据库0209，无新增迁移。后端chengcongcong222已实现并本机隔离验证；Bill-Billion本批尚未确认认领。原申请、处理、下载页面已有，不重新派为未开发。

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

## 接续：本人订单、钱账与合同副本（0.31.38增量）

后端已实现并通过隐私93项/交易31项回归及41份HTTP响应校验。本批列入同一副本页，尚未确认Bill-Billion认领，不另做订单付款流程。账号会话、不带X-Acting-Party；仅本人QUERY/COPY，读取不结案。迁移仍0209，无新依赖。

`GET /api/v1/privacy/requests/{request_id}/transaction-data?section=ORDERS&limit=20`列个人买方/供给方订单。TRANSACTIONS、CONTRACTS或ALL申请可列；保存每页next_cursor。机构经办单不混入。原data交易分类仍是旧买方索引，保持兼容。

选定订单后传`order_id`，section分别为SUMMARY、PAYMENTS、REFUNDS、JOURNAL、CONTRACT。每个订单和section单独保存游标；SUMMARY/CONTRACT没有分页。钱账需TRANSACTIONS/ALL，合同需CONTRACTS/ALL；不能因为列表可见就猜后续权限。

|内容|页面应怎样说明|
|---|---|
|SUMMARY|订单原价、当前状态、分期约定；financial的累计收款、累计退款和净收分别显示，金额单位分|
|PAYMENTS/REFUNDS|每笔状态、金额、对应分期/分项、渠道与测试/正式环境；UNKNOWN写结果待确认，REQUESTED写申请中，不算已付款/已退款|
|JOURNAL|已经确认的收款/退款事实，保留source_id便于关联；不把净额作为每笔实收，不展示不存在的银行凭证|
|CONTRACT|标题“订单条款副本”，说明已去内部审核字段；copy_sha256只对应terms，source_content_sha256只用于原件关联，二者不能互换；NOT_SIGNED写未签署，不能写已签约|

合同terms保留原规则与当时报价，不按当前商品价格或新30/40/30重新计算旧单。copy_kind为REDACTED_CONTRACT_COPY，redacted_paths说明具体去除路径。COPY只是申请类型，不是已完成；coverage为OWN_TRADE_RECORDS_ONLY，钱包/清分和其他协议不在本次结果里，remaining须保留。

同记录验收：本人两笔订单→逐页重开→一笔模拟付款100元→部分退款25元→核收100/退25/净75→保存条款副本核摘要；另一笔未知付款不能出现收款流水；新增退款申请不能增加已退金额。再验个人供给方、机构经办单、切账号、申请范围不符、跨订单游标、断网恢复和停用账号。不得自动转机构请求、重放付款或将403/503显示为空清单。

[实际HTTP及测试证据](../../reviews/prelaunch-transaction-copy-20261106/REPORT.md)。本批原生/网页未新跑，发布≠认领≠交付≠复验；队友拿到后独立接入，后端继续钱包及其他范围，不互相等待。
