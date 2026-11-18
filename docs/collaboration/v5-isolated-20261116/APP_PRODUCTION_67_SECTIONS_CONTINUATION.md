# 67 真实版本分区续批
先库外备份，仅production_pages.dart的_VersionReviewState。
- 本页绑定版本/版本历史/本版修改记录为明确页内分区定位，使用已渲染区块滚动，不伪称切换提交版本或完整tab。
- 新增按需ProductionApi.page(projectId,kind:VERSION,cursor)原授权服务读取，每次一页。真实版本标题/状态/编号/说明显示在本页；页内不切换当前验收对象、不自动读媒体或标记已读。
- 历史列表按ID去重、游标循环检查，显示未读取/读取失败/空页/继续读取，不声明时间排序、全量或一致快照。原API已执行身份epoch及projectScope。
- 本地异步核ticket/父load ticket/epoch/party；原load重置历史副状态并使旧请求失效；销毁也失效。
- contentCard、原version_id绑定、stale/conflict/read/checklist、feedbackForm、submit及pending恢复未改。原反馈仍限定本页version_id；当前媒体和提交区域不被隐藏。
- 静态读模型发现分页字段为nextCursor，已使用真实字段；未运行编译或测试。
非完整三tab像素还原。新历史数据只是获准记录元信息，不获得历史媒体或提交授权；没有跨项目聚合。
同事待测：分页/重复游标/失败重试、刷新期间旧响应、身份变化、脚本与视频定位、大字滚动、提交仍绑定原版本及未知恢复。均未验证。

## 交叉静态复核修正
库外备份production67-navigation-fix-004607。撤掉依赖懒ListView未挂载GlobalKey的滚动定位，改同一可见位置ChoiceChip切换只读记录面板：本页绑定版本说明、真实按需版本历史、原本版反馈。原播放器与验收表单始终保留，不切换version_id或复制提交。该方案不依赖远端子项已挂载，不声称原稿完整三tab。分页合并同ID只接受更大的row.version，相同版本保留先读项，避免旧页覆盖新记录。未运行测试/编译。
