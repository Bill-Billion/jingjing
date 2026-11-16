# 已发布通告修改申请交接

基线：477766abff18431ceb098088399884435275d85f。仅静态实现和源码核对；未测试、编译、格式化、运行 App 或发业务请求。未自行提交/推送。

## 已实现
- 新私有路由 /notices/revision-request?recordId=，默认 notices 主体 Gate；本人、根 NOTICE、PUBLISHED、非 OFFICIAL 才显示新申请入口。直达页仍重新读取校验归属，当前资格以服务器为准。
- 独立页面和请求，不复用新建的 rule_id/project_id:null：type/project_id 从冻结原 NOTICE 原样保留；仅发送 notice/reason。原版本作为 If-Match。
- 原通告完整内容与版本展示，拟修改字段独立，明确阅读勾选默认 false。日期控制器未改变其本地分钟字符串时直接保留原始 ISO，包括秒/毫秒；改变后沿 v5InputDate 转 UTC，并校验开始早于结束。
- beforeSubmit 重读源记录比对冻结版本/状态。POST 的确定版本/范围/资格错误由本页 API 包装撤销勾选并冻结旧表单。普通网络未知不冒充失效。
- 冲突仍留本页草稿，不自动更新基线。共享表单“读取最新”仅标明旧基线失效，不把旧正文移植到新 If-Match；用户选择“放弃本页草稿并重新读取原通告”并经过原离页草稿确认后，才建立新上下文和未勾选表单。
- 独立 NoticeRevisionResponse 复用完整修订校验，额外要求 IN_REVIEW、base_snapshot.object_version 等于原请求版本、notice 深相等且 reason 等于实际请求。不是 NoticeRecord，也不按返回修订编号导航普通记录。
- 成功/原请求恢复都转原 NOTICE 的私有授权修订历史，重新读取真实审核状态；不以创建时缓存响应推定当前结果。不提供自审、撤回或公开历史。

## 结果未知恢复
- 精确 /announcements/<UUID>/revisions 白名单。
- 表单恢复仍沿原 V5Form op.body/op.version/原 key；恢复 reread 仅检查原记录仍可访问、id/kind/owner/根关联，不要求仍 PUBLISHED、不检查新截止或新稿勾选。
- _RevisionApi.post 用实际传给 POST 的原 body/version 校验响应，避免恢复时拿最新源/输入作预期。
- 无上下文页有精确 V5RecoveryPanel；NoticesApi.restoreOperation 有独立分支，列表恢复导航按可信返回 parent_id 回原通告历史。
- mounted/ticket/epoch/party 校验在源读取之后、发布状态之前；身份变化清空私有源内容。既有确认页、只读历史、公共 AccountApi/V5Form 未改。

## 范围与备份
源文件共5个：notices/notices_revision_request.dart（新增），notices_api.dart，notices_models.dart，notices_pages.dart，app.dart。
修改前已在仓库外备份原4文件，增量补丁仅本地保留。未包含其他预览或矩阵改动。

## 待同事验证（未验证）
本人/非本人/机构/官方权限，所有类型details与非空project锁定；日期秒毫秒/时区/未编辑往返；未改内容和私联拒绝；原单关闭及资格过期；412与POST竞态；未知请求同key重放及跨页恢复；修订批准后缓存响应恢复；身份切换/离页；草稿放弃提示。服务器未限制同原单只有一条待审申请，本页不宣称去重全量待审。未增加本地持久化草稿或自动移植旧稿到新基线。

## 冻结 SHA256

- notices/notices_revision_request.dart: 9bd319f221917735a2871031da08060f17266f75027f54ebfe7597ca2ae8d5c8
- notices/notices_api.dart: 3e2458100c90d53272427e4a632e7f600b469e7fcd1ca57b3eba0ff0496ffcbf
- notices/notices_models.dart: 52c6fcf341e2156b2979207d0e4005b914dff0dd304a0e85efac5351e0a0653c
- notices/notices_pages.dart: 05a0b15a4e4570fa1f7e5b089521dc219598450407c7541d553d201737594739
- app.dart: e8badc47598419bb6ca4915e7d45038ff6262a903b79634141617b7ff6d93e4b
