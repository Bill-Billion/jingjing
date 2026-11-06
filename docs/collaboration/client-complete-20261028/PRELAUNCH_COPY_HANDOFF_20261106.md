# 前端接续：本人资料副本的范围、授权/模型和文件

接口0.31.36-rc.1，数据库0209，无新增迁移。后端chengcongcong222已实现并本机隔离验证；Bill-Billion本批尚未确认认领。原申请、处理、下载页面已有，不重新派为未开发。

## 三项本批工作

1. 在本人QUERY/COPY申请详情加载 GET `/api/v1/privacy/requests/{request_id}/copy-options`。展示categories中的category、coverage、remaining、file_copy_supported。用户要知道这次具体拿到什么、哪些还在整理。request_completion恒为NOT_CONFIRMED，不据读取成功把整个申请变成完成。
2. 原GET `/requests/{request_id}/data?category=...`兼容扩展CONTRACTS、DIGITAL_MODELS。CONTRACTS返回items[].id和records[]，新旧来源分别ARTIST/SUPPLY，同ID可有两条；记录有avatar_id、person_id（旧档为null）、current_status、object_version及consent（用途/地域/起止/正文等允许字段）。标题用“形象授权记录”，不可称“全部合同”。DIGITAL_MODELS返回本人制作资产id/状态/版本/avatar_id/consent_id/asset_type，不是可下载模型。按next_cursor分页，空页与剩余范围要能理解。
3. ARTIST_MATERIALS/CONTENT数据列表中的本人原件，使用 GET `/requests/{request_id}/copies/{asset_id}/content?category=ARTIST_MATERIALS|CONTENT`，携带账号会话、不带X-Acting-Party。返回受控字节，不是公开URL；展示保存/重试和不可访问原因。错误或切身份后清掉旧下载内容，不自动改用机构会话或下载他人证据。其他文件类型仍走原业务或经审核答复。

## 独立验收

用同一COPY申请查看七类范围 → 授权逐页 → 模型记录 → 本人原件下载，校验内容一致；仅PROFILE的请求不得下载素材；他人、运营、机构头不得以本人名义导出；读取中状态改变必须失败；返回重开仍是同一申请；文件下载成功不得自动结案。当前本批后端77项隐私回归、13份HTTP协议响应已验证，页面未新跑。

接口文件为contracts/openapi.yaml；本批HTTP例子见docs/reviews/prelaunch-20261106/privacy-copy-http.json。后端独立检查：在backend_server运行 `node scripts/test-mysql.js privacy-copy`，需现有本机隔离JX_MYSQL_TEST_ENV_FILE；源码不写配置内容。完整范围与下一批机构/推荐建议见PRELAUNCH_EXECUTION_20261106.md。

兼容说明：旧五类响应字段保持；新增两类须由客户端主动请求。授权/模型仍有明确覆盖限制，具体剩余由copy-options说明。无真实服务、付费动作、共享数据库修改或旧订单重写。
