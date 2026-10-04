# 测试证据：历史批次与当前版本分别看

## 本轮重新检查的固定代码d721725

|检查|真实结果|证据|
|---|---|---|
|服务器完整检查流程|各组通过；最终回归443通过、1项因缺脱敏旧库样本跳过；各组有重复，不相加|backend-current-checks.json|
|App当前CI业务范围|249通过、0失败|app-current-ci-checks.json|
|App全部测试目录|533通过、27失败；不能称全绿|app-all-tests-failures.json、05_OPEN_CHECK_FAILURES.md|
|网页九组业务及类型|176通过，类型检查通过；已有SSR重复provider警告|web-current-checks.json|
|远端版本和依赖|共同版本28662ab，第21、22份仍OPEN，本地含二者|git-baseline.json|

本轮只整理与复测，没有修改业务代码。没有重新运行全部浏览器业务操作，也没有安卓实机、真实服务或旧库迁移验收。以下历史结果保留其原版本，不累计成当前版本的总通过数。

## 五批历史证据

|批次|主要成果|当时测试|仓库记录|
|---|---|---|---|
|一|身份循环修复；六组主流程模拟资料|App241、实际浏览器13组；后端结果见原记录|docs/tasks/records/CORE-full-flow-20261005.md|
|二|付款退款恢复、撤权；私有内容重读失败清理|实际流程9组、App72、网页174|docs/tasks/records/CORE-full-flow-risks-20261005.md|
|三|商单、选角、发行；证明重读和旧提示清理|网页28组、项目22、商单18、App53|docs/tasks/records/CORE-full-flow-business-20261005.md|
|四|App商单/项目操作，设备保存异常提示|浏览器16组、App相关82|docs/tasks/records/CORE-full-flow-app-20261005.md|
|五|合作双方名称及模拟角色命名|后端24、App52、网页19、两端实际页面各1组|docs/tasks/records/CORE-full-flow-names-20261005.md|

原始JSON和截图在 `docs/testing/evidence/20261005/`。其中before-fix和script-before-update是失败或脚本修正前的证据；不能当作当前失败数量，也不能删除后假装未发生。第五批已修复第四批记录中的合作名称问题，原第四批报告仍保留当时状态。

如需用户直接看图，先看 `relation-names/screenshots/` 的App合作名称窄屏图及网页合作详情图，再按批次定位具体流程。图片里是合成角色，不是生产资料。
