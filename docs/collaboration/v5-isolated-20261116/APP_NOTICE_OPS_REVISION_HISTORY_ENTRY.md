# W03 运营原通告修订历史入口

基线 3f0db7c2。仅源码静态接入，未测试、编译、运行页面或请求业务接口。修改前已在仓库外备份。

## 范围与依据
- 新增 NoticeRevisionHistory.vue，只在 BusinessView 的 notices/reviews 已读取根 NOTICE 详情挂载；不是本人发布入口或全局修订队列。
- 后端 notices/repository.js:51 通用列表不接受 NOTICE_REVISION，故未给通用 kind 筛选添加无效值。
- 已有 GET /notices/announcements/:id/history（revisions.js:70–85）允许 NOTICE_REVIEW 岗位无 acting-party 读取完整历史。组件使用账号级 readBusiness，不发送 X-Acting-Party，最终岗位权限仍由服务器核验。

## 原通告到独审
1. 运营在原通告详情明确读取修订历史。
2. 当前快照、各修改申请的 base_snapshot/notice/reason 通过已有 BusinessDetails 展开；验证原通告ID、修订kind/parent/version/hash、快照结构及游标。
3. 仅待审修订显示进入 /notices/reviews/:revisionId 的入口。链接不自动提交。
4. 现有审核页通用详情读取支持该记录；currentVersion来自修订自身object_version。review-content三个checks与后端 revisions.review 一致，原 useBusiness 的版本/key/body及pending恢复不改变。服务器还会核对原通告基线版本、当前资格及审核回避。

## 身份、分页与草稿
- 监听账号、token、session.revision、所选主体、原通告ID及版本；变化清历史、游标并递增代际。
- 每次返回核对请求代际和session快照；卸载使在途结果失效。
- 后续页current快照的版本/hash/revision_id发生变化时停止拼接、清旧页并提示重读；重复ID或游标也停止展示。
- 失败不当空列表；任何失败清除旧私有历史，401/403/404明确提示权限失效。finally只释放同代请求；身份刷新时clear也释放锁。
- 父页locked包含原busy/pending等状态，组件不会在原待恢复期间提供跳转；正常RouterLink继续经过父页onBeforeRouteUpdate/onBeforeRouteLeave及allowDiscard，不额外清pending或草稿。

## 保留边界
这不是全局待审修订队列，需从原通告进入。未重建本人Web修改申请/新版确认。未改后端、总矩阵或总索引。其他并行文件变化不属本专项。
待集中联测：真实审核岗位/回避拒绝、权限刷新、分页期间原通告更新、草稿离页提示、修订审核及原请求恢复。不能据静态接入宣称通过。

## 文件冻结 SHA256
- `NoticeRevisionHistory.vue`：`a65f7ac5ddca2402853777d0e0c60b593f01aad648971a59e252d2b68228624b`
- `BusinessView.vue`：`602a16e2e31ad347eb7f29dcf887279e5939837a012e0a037dffb9eee144f95b`
