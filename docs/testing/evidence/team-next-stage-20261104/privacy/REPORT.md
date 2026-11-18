# A 包：本人注销、展示名更正及结果未知

执行人 Bill-Billion；2026-11-04，北京时间约 10:03 开始。基线 PR39 `b0cb4afff8eb6f5b9d64b053374064e2f09530b0`，接口 `0.31.31-rc.1`，数据库迁移 `0209`。测试使用本机独立工作树、随机 MySQL 测试库、Android 模拟器、合成身份、运营网页和模拟身份会话；未使用真实手机号、短信或真实服务。后端没有修改；共享规则仍需另一方实际审阅。

## 实现与复现

原 App 的本人注销及更正详情缺少首次提出执行方案入口；关闭执行响应丢失后也没有可跨重开保存的原申请编号。原始测试在基线暴露缺少对应入口和编号，其中首次方案测试还有滚动助手未找到控件的错误；不能将该助手错误单独当作业务复现。

现在只为本人 `CLOSE_ACCOUNT/ALL` 和 `CORRECT/PROFILE` 或 `ALL` 提供方案入口，更正范围限展示名。读取本人适用的已审规则并支持空页后继续分页；提交前重新读取，规则失效时保留输入并要求重选。账号、申请和处理目标不匹配时不提交。注销明确确认后，发请求前先保存不含会话令牌或请求正文的本人账号与申请编号；连接中断、响应丢失或 401 时提示结果未知，不自动重发，不称资料或备份已删除。明确执行返回后也仅称账号访问关闭，历史合同和留存另行核对。

## 实际同申请联调

|编号及验收关联|前提、操作与预期|实际|
|---|---|---|
|TEAM-A-NATIVE-CLOSE；ACC-DEL-23.01、E2E-11 局部|App 新建注销申请 `5f94d1f9-b227-496e-b07a-400de84ee174`；运营网页受理、核验，另一运营独审；App 选择依据、提出方案并本人确认。响应在服务端提交后模拟丢失。|App 保留原编号并显示未知；服务端独立记录仅一次执行、账号 `CLOSED`，旧会话 401；执行结果 `ACCOUNT_ACCESS_CLOSED`、`data_erasure=NOT_CONFIRMED`。不声称供应商或备份删除。|
|TEAM-A-NATIVE-CORRECT；ACC-DEL-23.01 局部|另一合成账号从 App 新建申请 `2c053e13-0909-4834-87bd-e9a45c3a89e9`，网页受理及独审，App 选择依据并明确执行。|同一申请的目标账号展示名在隔离数据库实际更新。|
|TEAM-A-REOPEN；ACC-DEL-23.01、E2E-11 局部|单独用真实本机存储写入以上合成申请编号，随后安装不再写入编号的同包测试入口、强停并重启进程。|[实际页面截图](android-reopen-reference.png)显示原编号和“结果尚未确认”。这一步单独验证持久化；没有声称 Flutter 集成测试卸载应用后的数据仍在。|

[脱敏结果](native-result.json)记录申请、审核、执行和隔离库清理。`integration_test/team_privacy_native_local_test.dart` 操作 Android 实际页面，使用合成登录会话注入；`scripts/team-next-privacy-native-check.mjs` 创建随机库、运行本机后端和运营网页，测试后清理。需要现有隔离 `JX_MYSQL_TEST_ENV_FILE`、Mac Flutter/Android 工具链及 Chrome；`JX_TOOLCHAINS_HOME`、`ANDROID_SERIAL`、`CHROME_BIN`、`JX_TEST_WEB_PORT` 可指定本机环境。该脚本只接受 `NODE_ENV=test` 和 `127.0.0.1:33316` 的测试配置，并启用项目外网保护；测试凭据不入库。

补入账号页滚动后，用同一可复跑脚本对最终源码重新执行：[最终脱敏结果](native-result-final.json)中的新注销申请 `0a9582b6-4b1a-4503-b96f-370edfcef67f` 与新更正申请 `fac721cf-dd27-45a0-9213-b8c6c77feda7` 均按同样的 Android—运营网页链通过；随机测试库、服务和本次端口转发均已清理。[源码 SHA-256](SOURCE_SHA256.txt)记录该版本文件。

运行 `flutter test --no-pub test/privacy`：18 项通过，包括规则空页、停用重选、账号切换后迟到响应、错目标、401、响应未知与多编号滚动；`flutter test --no-pub test/account`：128 项通过；`node scripts/backend-check.cjs privacy`：58 项通过。试镜后端 `auditions` 回归 52 项通过，其中已交付素材引用和删除前重查由既有后端保护。本地测试数量不能代替 151 项正式验收。

重启示例入口仅用于本机合成测试，种入参数应使用合成 UUID，不可嵌入真实用户资料。其余隐私分类、供应商删除回执、所有权限／断网逆向与另一方实审均未完成；151 项保持原 `NOT_RUN`。
