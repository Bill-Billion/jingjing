# 第一轮前端交接：用户交故事，运营开始受理

2026-10-17，前端负责人 Bill-Billion。App 和运营网页已接第一轮文字故事流程，实际验证和当前交付状态见下方记录。当前分支 `ux/v5-r01-story-frontend`，完整后端依赖是 `core/v5-r04-customization-delivery / c93fe96ca89936300ab44e762b105a344d845d4c`。第2—4轮后端虽已包含，相关新页面没有因此计入完成。

## 现在能办什么

买家从广场的“把我的故事拍成片”进入，选择已发布品类，填写该版本的问题。未填完可以保存，从“我的故事与草稿”找回；每份记录显示简短编号，以便区分同一品类的多份草稿。清空文字后保存会真实清空。正式提交后的故事使用清楚、可复制的只读正文展示。必填项通过检查并再次确认后，正式提交到平台，页面显示“平台待查看”。这一步不要求创建数字人或取得星探资格。

有故事受理岗位的运营人员进入网页“故事收件与受理”，看到正式提交的摘要，打开提交时的问题和答案，点击“开始受理”。网页显示实际受理账号和时间；买家重新读取后看到“平台受理中”。受理不会改写用户原提交，也不表示报价、收款、授权通过或制作开工。

App 主入口已迁移为广场／试镜／通告／消息／我的。未接入的试镜、现成视频和完整通告如实说明；原合同、历史订单、许可、项目和制作作为实际子业务保留。网页公共菜单加入收件入口，共41项。

## 双方接下来各做什么

|事情|本前端已处理|接下来谁处理|
|---|---|---|
|第一轮 App 和运营页面|动态文字／选项、草稿、正式提交、收件及受理已接入|Core 按下面方法实际复验并反馈；前端修复页面问题|
|版本冲突、重复和未知结果|412 保留输入并要求核对；未知写入只恢复原键、原内容及原版本|双方检查失败和恢复流程，不把自测当交叉审阅|
|私有故事与身份|只读本人当前身份的草稿；切账号、身份或失权时清空旧内容，隔离迟到响应|Core 复核权限与下面的最小后端修复|
|第二轮页面|本阶段尚未实施补件、重提、报价复核和确认订单|前端接着按[第二轮交接](V5_R02_HANDOFF.md)推进，Core 支持已有接口|
|进入共同版本|当前未合入 `integration`|双方实际审阅后，维护者按阶段整合；原 PR23 的旧待审依赖仍单列|

## 需要 Core 实际检查的两处改动

没有改数据库、接口路径、成功返回或业务状态机。联调发现，错误过滤器只保留 `answers.story` 这样的字段路径，会吞掉整份答案的 `answers / TOO_LARGE` 等提示。本次仅允许 `answers`、`responses` 根字段通过既有固定原因白名单，不返回用户正文或任意异常详情；补了真实 HTTP 回归，确认错误不修改草稿、不回显私密文字。这是兼容性修复，仍需 Core 实际审阅。

本机合成联调工具另外开放 `GET /api/v1/parties/<UUID>`，供已有账号页刷新当前身份。接口继续执行真实成员权限，其他身份拒绝，写操作继续禁止。没有开放短信、其他业务或外网访问。

## 怎样独立复验

先保留自己的改动，获取本前端完整分支。不要把本分支整体直接合入 `main`，也不要另建一份重复包含旧后端链的申请。本轮审阅应聚焦相对 `c93fe96` 的前端增量及上述联调修复。

按[第一轮后端说明](V5_R01_STORY_INTAKE.md)准备本机隔离 MySQL，并在仓库根启动资料：

```bash
JX_MYSQL_TEST_ENV_FILE="$PWD/.local/mysql/runtime/test-env.json" node scripts/customization-sandbox.cjs
```

使用它本次输出的 `access_file` 和 `base_url`，不要复制他人的 token。资料包括合成模板、买家和运营会话；它们不是正式商品或真实账号。60分钟自动停止，需更多时间时先结束并重建。

网页在 `晶晶日上工程交接包/01_源码/frontend_ops_workspace`：

```bash
npm ci --no-audit --no-fund
VITE_BACKEND_ORIGIN=http://127.0.0.1:本次端口 npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

App 浏览器验收入口放在 `test/support`，正常 `lib/main.dart` 不引用它。仅为本机合成会话初始化一次登录响应；账号、身份、故事保存、提交和状态均走真实 HTTP。根目录先生成被忽略的编译参数：

```bash
CUSTOMIZATION_ACCESS_FILE=/本机本次/access.json node scripts/prepare-r01-app-fixture.cjs
```

在 `晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app`，使用仓库 CI 固定的 Flutter 3.47.5：

```bash
flutter pub get --enforce-lockfile
flutter build web --no-pub --target test/support/r01_browser_main.dart --dart-define-from-file=.local/r01-browser-defines.json --output .local/r01-browser-build
python3 -m http.server 5000 --bind 127.0.0.1 --directory .local/r01-browser-build
```

此测试构建含临时合成会话，只能留在忽略的本机目录，用完关闭并删除，不能作为发布文件上传。正常产品构建仍用 `flutter build web --no-pub`，不传这些参数。

真实串联按顺序执行：

1. 根目录运行 `scripts/v5-r01-app-browser-check.mjs`，环境变量 `CUSTOMIZATION_ACCESS_FILE` 指向本次资料；结果中的 `request_id` 是 App 刚保存、找回、清空再正式提交的同一需求。
2. 在网页目录运行 `tools/e2e-customization.mjs`，传同一资料和 `CUSTOMIZATION_REQUEST_ID`。它使用真正的运营页面开始受理，并验证无权会话清空旧正文。
3. 根目录再次运行 App 脚本，加 `--verify-intake` 和同一需求编号，验证实际状态和提交内容不变。App 两次使用同一 `CUSTOMIZATION_EVIDENCE_DIR`；网页另设证据目录。

脚本默认调用本机 Chrome，可通过 `CHROME_PATH` 指定；不安装额外浏览器库，复用网页锁定依赖。结果只保存对象编号、状态、校验值和合成截图，不保存会话凭据。停止联调工具后检查其 `status.json`，确认随机库、访问文件和端口清理；再停止本机 MySQL。

## 实际检查和限制

最终数量、同一需求编号及串联结果见[本轮检查记录](../testing/evidence/v5-r01-frontend/RESULTS.json)，页面实拍见同目录。当前已通过 App 完整269项、网页190项；新增故事专项分别包含于这些数量中，不能再次相加。后端错误边界专项43项通过。静态检查、产品构建、真实浏览器和清理结果另列，不能互相替代。

必填私有附件的模板可以保存文字，但不能正式提交。附件上传、补件报价、新付款制作页面、真实支付／电子签／生成服务、安卓和 iOS 真机仍未在本阶段验收。正式模板、岗位和发布也没有启用。

本次 Figma MCP 因无编辑权限拒绝访问，使用仓库已有 V5 分区截图和现有组件适配，未验证当前 live 原型或逐像素一致。具体对应见[页面映射](../ux/gallery-page-map.md)和[导航验收](../ux/navigation-acceptance.md)。

回退时撤回本轮前端增量即可；没有本轮数据库迁移。已提交故事继续保留在原后端，不能靠回退页面删除历史内容。测试服务使用一次性随机库，不连接正式业务库。

上传、远端检查与申请以[前端当前状态](../status/EXPERIENCE_CURRENT.md)为准；本机通过不等于 Core 已审阅、共同版本已更新或正式上线。
