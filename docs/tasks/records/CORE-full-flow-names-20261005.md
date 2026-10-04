# 第五批：合作对象看得懂，测试角色分得清

本侧继续承担主测与必要修复。起点为 `162b64a`，开工工作树干净；本轮 fetch 后 `origin/integration` 仍为 `28662ab`。工作分支 `core/full-flow-acceptance-20261005`，包含第21、22份待审依赖。没有替队友审阅、上传、合并或部署。

## 这次解决什么

此前MCN合作详情只有双方长编号。现在App与网页显示双方当前显示名称，保留编号；文字明确说明名称可变，不代表已核实的法定名称。现有合作条款、内容摘要、历史订单与佣金不变。这里只补直接合作详情，没有把所有商单和排行榜扩成通用人员目录。

新增只读接口 `GET /api/v1/gigs/relations/{record_id}/parties`。先确认当前账号、有效负责人身份和合作参与方权限，再返回两方的编号与显示名称；不返回账号、手机、证件或密钥。不新增表，不改变旧记录返回格式。旧服务器明确返回404/NOT_FOUND时展示“名称暂未提供”；真正的GIG_NOT_FOUND、403和服务故障不能当成功。App原来的通用404处理会清身份，本轮测试发现后已限定兼容到这一条可选查询的未知路由。

商单隔离资料中的七个角色通过已有改名接口获得角色名称，例如“林小禾·合作演员（合成测试）”“星桥·商单客户（合成测试）”。这些是假资料，不代表真实身份认证或甲方业务参数。

## 做了哪些验证

|检查|实际结果|范围与限制|
|---|---|---|
|服务器规则、真实HTTP与隔离MySQL|24项通过、0跳过|含双方可查、无关人拒绝、撤销成员关系后拒绝、缺身份/未登录拒绝、改显示名不改历史内容|
|App账号与商单|52项通过|含名称对应编号、重复编号拒绝、切换身份迟到响应拒绝、权限失败清名称、旧服务器兼容|
|网页商单|19组通过；类型检查通过|含恶意文字转义、记录不匹配、403/503拒绝、旧服务器兼容|
|接口约定|4644条结构断言通过|40个真实HTTP返回样本；结构检查不是业务测试次数|
|真实浏览器页面|网页1组、App1组通过，无页面异常|网页名称与编号、退出清理；App返回值与卡片检查并保存390/320宽截图；画布内名称另由控件断言和实际截图复核|
|App静态检查及网页构建|通过|仅浏览器构建，未生成新安卓安装包、未真机验收|

首次检查暴露并纠正：Dart参数写法；测试库配置的相对路径；测试夹具不符合成员同意约束（改用真实撤权场景，不放宽数据库约束）；旧服务器404触发身份保护；控件测试重开页面未实际重建；浏览器文字选择器重复/无法读取Flutter画布文字。均区分测试脚本问题与产品问题，不把脚本修正算成新的业务功能。

## 双方怎样接手

本侧已写好后端与两端调用、兼容保护、测试及模拟资料。队友需要审阅名称披露范围和页面体验，不需要自己再写同一套接口。共享变更见 `docs/collaboration/RELATION_DISPLAY_NAMES.md`，尚未经队友批准；按本阶段集中交付，不逐小任务推送。

独立复跑：根目录 `node scripts/backend-check.cjs gigs`（先设置隔离的JX_MYSQL_TEST_ENV_FILE）；网页目录 `node tools/test-gigs.mjs` 和 `npx vue-tsc --noEmit`；App目录 `flutter test test/gigs test/account --no-pub`。接口校验 `python scripts/validate_contract.py --runtime-fixtures .local/gigs-http-fixtures.json`，使用已安装contracts依赖的Python环境。

实际页面：先运行 `node scripts/full-flow-business.cjs gigs start --test-only`、本机网页5205和App网页8774，再运行 `scripts/pr17-ui-browser-check.mjs --relation-names-only` 与 `scripts/pr17-app-browser-check.mjs --relation-names-only`。设置 `CHROME_PATH`、`JX_BROWSER_EVIDENCE_DIR`、`JX_APP_BUILD_DIR`；详细方法沿用 `docs/testing/FULL_FLOW_ACCEPTANCE.md`。结束使用 `node scripts/full-flow-business.cjs gigs stop`，不复用未关闭的测试运行。

证据：`docs/testing/evidence/20261005/relation-names/`。原始失败调试截图留本机，没有冒充成功截图。正式截图中可见的编号和人物均为合成资料。本轮没有真实短信、真实付款、OSS、公网入口或生产数据操作。

## 下一步

本侧整理五批变更成一个可审阅成果，准备包含修复和模拟业务的新版安卓包；手机访问方式明确后再提供测试入口。队友审阅账号保护、文件异常处理与新增名称接口；甲方继续补OSS。随后进行手机身份切换、合作确认、文件保存和断网恢复的验收。已有旧安卓包不会自动得到本地修复。

收尾：任务记录校验通过（41项任务、60项需求）；商单夹具已关闭并清理运行记录，网页5205、App网页8774及隔离MySQL已关闭。首次失败截图保存在本机 `.local/relation-names-first-attempt`，未入Git。
