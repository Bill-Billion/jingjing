# 曝光与试镜履约材料必须逐单、逐用途授权

本轮位置：今晚第 9 条业务的曝光履约，兼顾同一实现下的试镜权益；属于流程补全与权限修复，不增加奖励、分成或授权范围。对应前端新增“承制方先提交本单材料，运营从本单候选办理”的交付。来源：前端 157b47e3（含 4840c435、a7bc2921）与当前组合工作树；本记录不代表整组或 151 条验收全部通过。

## 实际缺陷和修复

承制方将文件明确交给另一份权益后，运营仍能把该文件写入本单排期；只交作排期用途的文件，也能直接用来确认履约完成。原读取接口有逐单控制，但写入只查文件所有权、可用性和限制状态，缺少本单提交关系及用途核验。

已在排期新建与履约完成的事务内，同时检查材料提交记录属于本权益、当前承制方、状态为已提交，且用途分别为排期或完成。失败返回 HTTP 409 / REWARD_EVIDENCE_NOT_FOUND；原有文件权属和隐私限制检查仍执行。没有改历史排期读取，也没有重审历史成功操作；成功原请求再次提交仍返回原结果。

| 检查 | 修复前真实结果 | 修复后真实结果 |
| --- | --- | --- |
| 将仅提交给另一权益的文件用于本单排期 | HTTP 200，生成待审核排期 | HTTP 409，本单排期仍为 0 条 |
| 将仅提交为排期用途的文件用于履约完成 | HTTP 200，权益变为已履约 | HTTP 409，保持已确认状态 |
| 明确提交本单完成用途后重试原失败请求 | 未作为红测项 | 成功完成；重复请求返回原版本 |
| 完成后重放原材料提交、原排期成功请求 | 未作为红测项 | 返回原记录；旧排期材料仍可读取 |

## 验证与边界

- 新专项 3 项全部通过，无跳过；兑换模块 6 个测试文件合计 42 项全部通过，无失败或跳过，进程退出 0。
- 使用自动创建清理的隔离 MySQL、合成材料及实际 HTTP；没有生产数据、真实曝光、收费供应商调用。
- 为测试 7 天后履约，仅对该隔离连接调整数据库时间，并延长隔离测试会话到 40 天；结束恢复数据库时间并清理测试库。未改业务有效期规则。
- 初始两次探测分别存在测试 URL 和测试会话过期问题，不能作为缺陷证据。所附 red-confirmed 日志才是纠正测试后两个 HTTP 200 的确认记录。
- 旧集成测试已补四处承制方材料提交前置（曝光/试镜，各排期/完成一次），没有放宽业务检查。核对 scripts/client-testing 与 v5-r05-r12-seed.cjs 未发现这些履约写入调用，无需更改持久模拟资料。
- 此专项不替代新材料提交页面的断网恢复验收，也不替代全部原生 App 和真实服务验收。

## 修改范围

相对前端新交付仅修改以下四个后端文件，另增加本目录证据：

- src/modules/redemption/delivery-evidence.js：第 9 行起新增本单、用途校验。
- src/modules/redemption/fulfillment.js：第 46、78 行分别接入排期、完成校验。
- test/redemption-delivery-evidence.integration.test.cjs：跨单、跨用途、原请求恢复和历史读取回归。
- test/redemption.integration.test.cjs：曝光/试镜既有用例增加明确材料提交前置。

上述路径均相对 晶晶日上工程交接包/01_源码/backend_server。未修改合同、全局任务表、前端页面或进行提交、推送。

## 复验

在 backend_server 目录，按本机已有隔离 MySQL 配置设置 JX_MYSQL_TEST_ENV_FILE 后运行：

```powershell
node --test --test-concurrency=1 test/redemption-lottery.integration.test.cjs test/redemption-checkout.integration.test.cjs test/redemption-lottery-policy.test.cjs test/redemption-policy.test.cjs test/redemption.integration.test.cjs test/redemption-delivery-evidence.integration.test.cjs
```

完整后端回归、最终组合版本和上传由主代理统一执行；本包已冻结。