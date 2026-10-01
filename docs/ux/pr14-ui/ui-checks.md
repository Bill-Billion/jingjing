> 本次集中交付首次远端网页失败已定位并修正：供给编号默认折叠的正文被SSR断言误算为可见；未改页面或权限，网页57项重新通过。[原因与最终交付检查](delivery-review-20261002.md#本次远端检查发现并修正的测试问题)。

> 2026-10-02集中交付：以下证据适用于已追加到原第14份申请的功能版本`6605e83`；本次GitHub检查以[申请当前版本](https://github.com/Bill-Billion/jingjing/pull/14)为准。未合并或部署，真机未验收。[提交范围与本轮审查](delivery-review-20261002.md)。下方保留此前各轮事实。

> 2026-10-02导航增量：相关账号/许可/导航54项通过（含新增5项），修改文件静态分析和Web构建通过；实际浏览器390/320宽验证通过。本轮与此前96项范围有重叠，不相加。新构建SHA256：`0300c1aa0749b2e734d194826438cccb825dda3a543d9233d6e713664630f379`。未做真机测试。[详细事实与截图](tab-navigation-20261002.md)。

# 实际操作与验证记录

2026-09-30。使用本批随机隔离 MySQL、真实账号和许可 HTTP、合成短信、进程内私有文件传输；从正常页面登录，没有向页面注入会话或审批角色。

## 原图册样式修订：最终检查

- App：最终完整受影响范围96项全部通过，包含账号、合同、供给、许可、导航和原交互/启动；覆盖320宽大字号、字段无障碍名称、空登录/空邀请灰置及未知请求按原body和幂等编号恢复。之前93项和38项复核有重叠，不相加。`dart analyze` 无问题，接3242接口的最终Flutter Web构建成功。最终 `main.dart.js` SHA256为 `67b6568b562b533e3707a39833305b26aaaad6fb5d66a30288a6bbf2f8e67f87`。
- 网页：许可21、供给19、合同17项共57项全部通过；独立隔离账号真实浏览器24项另行通过；最终typecheck/build通过。账号联调前两次因测试手机号环境和表格选择器不匹配失败，日志保留；成功结果以 `vue-style-account-isolated-e2e.log` 为准。
- 网页最终只读实拍：39组通过、183张截图，涵盖1440×900、390×844、320×693及真实长页滚动、完整编号展开和独立核验空选状态；没有业务写入、运行错误或全页横向溢出。治理合同用有效独立快照后成功读取；旧混用许可内嵌编号的404不算成功详情验证。
- App最终只读实拍：29组通过、95张390/320截图，全部来自上方最终构建的实际网络响应；账号分组、有效治理合同、许可/绑定/正文及五入口正常。邀请空态白底和真实灰置已复拍；没有业务写入或运行异常。[最终App实拍](evidence/style-app-runtime.json)。
- 两端逐页原图映射、截图尺寸/哈希与实际路由见[覆盖清单](evidence/style-coverage.json)，目视结论及接口适配见[样式验收](style-qa.md)。原生真机与生产服务没有在本轮执行。

[App最终96项](evidence/style-flutter-final-tests.log) · [最终静态分析](evidence/style-dart-final-analyze.log) · [最终App构建](evidence/style-flutter-final-build.log) · [邀请空态与原请求恢复](evidence/style-flutter-invite-tests.log) · [网页许可21项](evidence/vue-style-licensing-tests.log) · [供给19项](evidence/vue-style-supply-tests.log) · [合同17项](evidence/vue-style-contracts-tests.log) · [账号真实联调24项](evidence/vue-style-account-isolated-e2e.log) · [网页类型检查](evidence/vue-style-typecheck.log) · [网页构建](evidence/vue-style-build.log) · [网页逐页实拍](evidence/style-web-runtime.json)

本机 `flutter analyze` 的中文路径LSP输出遇到SDK自身Content-Length读取问题，改用同一任务SDK的 `dart analyze` 成功完成等价静态分析，没有修改SDK或项目来绕过诊断。Vue保留现有构建体积提示；Flutter最终交付为JS构建；Wasm干跑成功，但未执行Wasm应用或真机包验收。视觉修订没有修改后端，保留下面原功能阶段的MySQL/HTTP证据，不重复跑相同后端测试计数。

- 收尾资料：新脚本语法、差异格式、凭据脱敏、原图册及主检出未被修改均核对通过；[本轮资料检查](evidence/style-collaboration-check.json)只验证资料结构与链接，应用结果以实际测试及浏览器报告为准。

## 功能交付阶段已执行的检查（视觉修订前）

- App：任务内 Flutter/Dart 静态检查无问题；账号、合同、供给、许可、导航 82 项通过，包含 17 项许可检查。现有交互和启动 9 项另行通过；两组测试文件不重复。3242 接口配置的 Flutter Web 构建成功。
- 网页：许可原20项及最终新增的状态/范围语义1项、供给19项、合同17项全部通过，共57项，类型检查及构建成功。新增检查和最终构建单独留日志；没有将旧20项日志写成21项全量运行。所有新旧业务页面共用12项导航，详情和审核正确高亮。
- 后端：原第14份许可专项在随机 MySQL 25 项通过、0跳过；40份实际HTTP返回对应格式校验1664项通过，启动器17份许可返回校验1641项通过。这两次格式检查都含相同1624项静态检查，不能相加。
- 实际网页：原19组完整流程通过；项目改稿另1组通过；未知请求换页保护另1组通过。最终390×844视口及正文截图另1组通过；文案修正后仅复拍关联页面，没有重复计业务流程。
- 最终 App 浏览器：7组通过，覆盖正常登录、真实目录及详情、新预留、已发放许可、关联绑定、带水印全文、五主入口。8张390×844截图及实际路由已保存，构建指纹为 `a96ec5a4398047bf187cedc4720cd02103dbd63f04b854182e83f3ab8b8a4e83`。根侧另实点核对登录、选本、新预留、返回和关联绑定，亲自检查最终阅读与绑定截图。
- 交付资料：任务/需求及364个当前资料链接检查通过；新脚本语法、差异格式、证据脱敏与截图链接检查通过。资料检查中的 `application_tests: NOT_RUN` 只说明该资料脚本不运行应用测试，应用结果以本页实际日志为准。[资料检查报告](evidence/collaboration-check.json)。

[App 82项](evidence/flutter-tests.log) · [App原交互9项](evidence/flutter-shell-tests.log) · [App静态检查](evidence/flutter-analyze.log) · [App构建](evidence/flutter-build.log) · [App真实流程7组](evidence/app-runtime.json) · [网页许可原20项](evidence/vue-licensing-tests.log) · [最终状态语义1项](evidence/vue-status-semantics.log) · [网页供给](evidence/vue-supply-tests.log) · [网页合同](evidence/vue-contracts-tests.log) · [网页构建](evidence/vue-build.log) · [网页真实流程19组](evidence/web-runtime.json) · [网页真实改稿](evidence/web-adaptation-runtime.json) · [未知请求导航](evidence/web-pending-navigation-runtime.json) · [最终视口检查](evidence/web-final-screenshots-runtime.json) · [后端与格式](api-review.md)

## 本轮发现与修复

1. App许可请求添加了接口不接受的 `Cache-Control` 请求头，浏览器预检失败，导致真实目录无数据。按实际 CORS 约定移除多余请求头；服务端已有 `no-store`，客户端没有保存正文。最终构建实点确认恢复。读取失败改为重新读取提示，未知写入才提示恢复原请求。
2. 金额和期限的误导：统一把 CNY 整数分精确显示为元；不同权利逐项呈现。读取历史合同的保存时状态与外部签署核验分开；超时发放返回人工补救仍显示未获许可。
3. 权限清理边界：身份变化也清掉尚未上传的 File；App材料权限失效时显示重新核对入口，不让文件控件抛异常；阅读前后核验，迟到、失焦、到期和撤销不恢复正文。
4. 未知写入换页丢失恢复依据：结果未核对时阻止普通页内跳转，保留原编号、请求和版本。成功后才允许正常离开；退出或身份变化仍按私有内容清理要求处理。没有把私有材料持久化作为恢复方案。
5. 许可深链接登录后恢复目标只读页面；预留或绑定不会因登录自动提交。两端登记项目和绑定记录使用各自状态名称，不冒充许可已生效。网页地域和语言显示中文名称并保留原代码，接口请求和范围比较仍使用原代码。

## 验证范围

实际上传校验字节与哈希，受控正文使用后台真实水印，HTML标签按文字显示。浏览器发起材料下载证明接口和传输，不能证明用户完成了系统保存。网页正文可见期间每15秒核验、App每30秒核验；没有撤销推送，到期用本地截止清空，重新读取仍由服务器判定。

本机 Vue 构建保留既有大文件分包提示；Flutter JS 构建成功但部分依赖未满足可选 WebAssembly 干跑条件，没有宣称 Wasm 构建成功。真机安装包、生产供应商、真实签约付款和远端新增检查尚未执行。上传、合并与部署另记，当前页面结果不能当作已上线。
