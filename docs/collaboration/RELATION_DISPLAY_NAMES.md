# 待共同审阅：合作详情显示双方名称

本侧已实现并隔离测试；队友尚未审阅，未进入共同版本。对应现有CCR-015商单合作边界，本次仅补可读名称。

- 新增GET `/api/v1/gigs/relations/{record_id}/parties`，统一格式在 `contracts/openapi.yaml`。必须登录并提供X-Acting-Party；限合作双方有效OWNER，不开放公共人员搜索或独立审核员目录。
- 返回 `record_id`、`source=CURRENT_DISPLAY_NAME` 和两个 `party_id/display_name`。允许名称null；只读当前主体资料，不写入或替代历史合同。无账号、手机号或证件。Cache-Control为no-store。
- 不改变旧GigRecord，不迁移数据库、不改写任何写入接口。旧客户端照常运行；新版客户端遇旧服务器404/NOT_FOUND显示名称未提供。真实403、GIG_NOT_FOUND仍按无权/不存在处理，503显示失败。
- App与网页调用已补好。重新加载先清旧名称；切换身份忽略旧回复；不得把另一条合作的名称显示进当前记录。网页转义文字，不按HTML解释名称。
- 影响：后端gigs、App商单详情及账号会话对这条未知路由的兼容、网页合作详情。页面命名采用既有卡片布局，App为现有MCN合作详情页（/gigs/record）、网页沿用WEB-21-02；没有重新设计整体版式。
- 审阅重点：姓名披露范围、当前显示名与法定名称的区别、旧版本兼容。队友不必更改数据库或重复开发接口；合入前须实际检查本说明和相应代码。

验证、分工与限制见 `docs/tasks/records/CORE-full-flow-names-20261005.md`。
