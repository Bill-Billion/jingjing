# 队友检查清单与双方分工

以下均为待队友实际检查，没有预先替队友勾选通过。本侧已完成的自动与浏览器检查是辅助证据。

|由谁检查|具体操作或审阅内容|怎样算通过|状态|
|---|---|---|---|
|队友|登录后切换个人/机构，身份详情403或404|页面不持续刷新；旧业务数据清除；仍可退出及主动恢复|待审阅|
|队友|样片或证明先成功读取，再模拟服务失败/授权暂停|旧内容、已读和确认勾选清除；不得同时显示旧成功与新失败|待审阅|
|队友|合作本人及MCN分别打开同一合作；无关人尝试访问|双方有当前名称及编号；无关人拒绝；不披露手机或证件|待审阅|
|队友|旧服务器没有新增名称接口|明确“名称暂未提供”；真正越权仍不能继续；历史记录格式不变|待审阅|
|本侧+用户手机|安装新版，保存文件、断网后恢复、退出重登|没有崩溃或假保存成功；旧账号私有内容不可继续查看|新包未准备，尚未验收|
|甲方+本侧|OSS实际私有存储、真实服务及主体更换|真实配置与权限已核实，并有独立验收证据|等待材料及后续接入|

## 代码从哪里看

- 身份切换：App `lib/account/account_session.dart`、`account_page.dart`，对应 `test/account/account_widgets_test.dart`。
- 样片重读：App `lib/production/production_pages.dart`、网页 `src/views/ProductionView.vue`。
- 项目文件：App `lib/projects/project_pages.dart`、`test/projects/project_download_test.dart`、网页 `src/views/ProjectsView.vue`。
- 商单文件提示：网页 `src/composables/useGigs.ts`。
- 合作名称：后端gigs路由/仓储、统一 `contracts/openapi.yaml`、App和网页gigs详情。共享权限说明见 `docs/collaboration/RELATION_DISPLAY_NAMES.md`。
- 模拟资料及浏览器验收：`scripts/full-flow*`、`scripts/pr17*`、`scripts/pr18*`、`scripts/pr20-ui-test-server.cjs`。都是隔离工具，不是正式环境造数脚本。

完整文件清单和差异由交付工具生成。没有数据库迁移；新增一个只读合作名称接口，旧记录格式与写入接口保持。App对旧路由404的兼容只限此查询，不能扩大成忽略所有404。

建议审阅顺序：先身份及文件权限，再名称接口，最后模拟资料和页面提示。队友可直接在独立工作目录复测，不要覆盖自己的未提交改动。本分支尚未上传，远端暂不能直接取得此次五批修复；集中推送后再提供准确远端入口，不能提前宣称已经同步。
