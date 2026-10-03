# PR21 本机发布演练证据核对

## 整合候选的实际补跑

Root 已在 `1165aad`（PR20 App及PR19财务隔离修复已整合）用已有 Node22.5.1/SQLite11.8.1 执行 `backend-check.cjs all`：431项中430通过、0失败、1项缺脱敏旧库样本跳过。未安装依赖。实际结果已保存为[专项汇总](evidence/backend-results.txt)、[运行绑定](evidence/backend-verification.json)和[恢复演练JSON](evidence/release-rehearsal.json)。后续只改前端/文档时复用本次后端证据；最终前端产物另绑定完整提交。

这次恢复78表、180行，2979ms；有限并发160次、并发8、736ms，p50=36ms/p95=45ms/max=52ms，异常0。`MATCHED`与`QUARANTINED`同时成立，私有对象本体未恢复；发布仍`BLOCKS_UNVERIFIED/NOT_APPROVED`，十项正式门禁不代签。

## 原始后端专项核对记录（历史）

2026-10-03。本轮只读核对已有发布专项日志和 JSON 结果，写前端交接材料；没有重跑原始测试、启动额外服务、安装依赖、构建原生包、访问生产或执行发布。现有专项为 **21 项通过，0 失败，0 跳过**。发布检查仍为 `BLOCKS_UNVERIFIED`，`production_release=NOT_APPROVED`。

## 运行时和证据来源

Root 确认成功执行命令为：

```text
/Users/yanghaoran/.nvm/versions/node/v22.5.1/bin/node scripts/backend-check.cjs release
```

仓库根入口把 `release` 交给原 MySQL 测试脚本，专项包括 `test/release-policy.test.cjs` 和 `test/release.integration.test.cjs`。后者运行随机本机 MySQL 库与合成材料，原网络保护由测试入口加载；测试环境配置路径和私有材料留在受控本地目录。本轮不打印配置密码、密钥或业务私有正文。

|证据|实际记录与适用范围|
|---|---|
|[成功日志](/Users/yanghaoran/Code/jingjing-pr21-pages/.local/pr21-release-existing-runtime.log)|TAP 收尾：tests=21、pass=21、fail=0、skipped=0；时长约 6.996 秒。包括恢复隔离、完整性、安全拒绝和有限并发|
|[结构化演练结果](/Users/yanghaoran/Code/jingjing-pr21-pages/.local/ci-evidence/release-rehearsal.json)|`JX_RELEASE_REHEARSAL_V1`；`synthetic_only=true`、`production_access=false`、`paid_services=false`|
|[原专项入口](../../../scripts/backend-check.cjs)|复用 `process.execPath` 启动专项；未修改入口、测试或依赖|
|[原后端交接](../../collaboration/STAGE_12_HANDOFF.md)、[操作说明](../../collaboration/STAGE_12_RUNBOOK.md)、[待双方审阅规则](../../collaboration/CCR-019-release-rehearsal.md)|说明旧记录、恢复库和发布材料的边界；本次前端交接继续保留这些约束|

只读核对时工作树 HEAD 为 `de296201e5407a063dc8c8d3f334c437d9322ff2`。日志和演练 JSON 没有内嵌 Git 提交、Node 或依赖版本字段；Node 22.5.1 的执行上下文来自 Root 留存的实际命令。正式候选材料需要另绑定最终完整提交、运行时、检查人和有效期，不能由这两份文件推定任意后续提交都已通过。

本树 `package-lock.json` 及原 `de296201` 条目锁定 `better-sqlite3=11.8.1`，本轮复用模块版本也是 11.8.1。Node 22.5.1 加复用 11.8.1 已支持这次实际专项；没有做干净安装、重编译原生模块或验证其他锁版本。尤其不能把该结果写成 11.10 环境运行证明。后续合入 PR19/20 若 lock 改变，须按最终候选重新核对版本与适用证据，不擅自安装依赖。

## 合成演练实际检查了什么

|检查|现有结果|不能据此填写的正式结论|
|---|---|---|
|旧库只读盘点和保留|SYNTHETIC 来源，2 表、2 行对账 `MATCHED`；状态 `RETAINED_REVIEW_REQUIRED`；已核验付款、转换账号、启用许可均为 0|没有拿到真实脱敏旧库或完成账号/授权/金额单位映射；历史 paid 字段没有变成真实到账|
|重复、并发和内容完整性|重复保留收敛、并发保留不重复，篡改内容被拒绝；大整数、原金额和二进制保持|合成样本结果不代表所有真实旧库结构、历史承诺或金额已获准迁移|
|加密备份|保留不可变付款和待处理任务；错密钥、改写、截断和覆盖均拒绝；单连接备份路径实际执行|不代表密钥实际异地保管、备份频率、生产数据规模或正式灾备时限已验收|
|新库恢复|78 表、180 行 `MATCHED`，约 1589ms；单连接恢复实际执行；只排除恢复隔离元数据的比较|不是完整生产灾备或任意历史时间点恢复；不是外部私有文件本体恢复|
|恢复后的限制|`runtime_status=QUARANTINED`；真实 API/worker 入口拒绝启动；外键失败整体回滚，错摘要、结构注入和非空库覆盖拒绝|MATCHED 不表示可以收款、重复执行外部任务或删除隔离标记；没有自动解锁或发布批准|
|私有对象|`external_objects_restored=false`|对象存储实际文件、版本、权限和删除记录恢复尚未完成|
|发布证据和配置|缺项阻止；正式已登记供应商仍需实时复核；记录绑定版本，`transport_checked=false`|表单已填、进程正在运行、沙箱成功或登记正式证据均不能代替真实网络验证和发布批准|
|有限并发与安全|160 次真实 HTTP 读取，并发 8；约 482ms，p50=23ms、p95=29ms、max=39ms，异常响应 0；重复写入只生成一份业务对象和账本；伪造 paid、未授权和非法标识被拒绝|这是本轮隔离环境观测，没有生产容量、所有设备性能或独立安全审计承诺|

结构化恢复记录的 `payload_sha256` 是恢复内容摘要，不是加密备份文件摘要、私有对象摘要或前端下载 CSV hash；运行时保持隔离，与内容对账结果分别记录。

## 十项正式门禁仍待补

[原示例清单](../../collaboration/release-review.example.json)的十项均为 `MISSING`，providers 为空。本轮未修改该文件，没有将以下任意项标成已满足。工具即使接受准确候选、有效时间和检查人声明，也只返回 `DECLARED_EVIDENCE_REQUIRES_REVIEW`；缺失或过期材料是 `MISSING_OR_OUTDATED`，发布仍为 `NOT_APPROVED`。

|清单字段|当前状态|下一步实际材料及负责人|
|---|---|---|
|peer_review|MISSING|Core/Experience 对准确候选的共用权限、历史事实和恢复规则实际审阅；不得代另一方签字|
|frontend_journeys|MISSING|Experience 与 Root 在最终共同候选保留 App/Web 完整操作、权限拒绝、未知请求恢复及私有缓存清理证据；安排见 [前端收尾计划](page-plan.md)|
|real_devices|MISSING|实际设备负责人补设备/系统/包版本、签名、音视频/下载和权限结果；浏览器或后端演练不替代真机|
|sanitized_legacy_rehearsal|MISSING|材料提供方给一致脱敏副本；Core 与业务方补归属、授权、金额单位、历史承诺及付款核验映射|
|database_restore|MISSING|维护者对实际候选和正式所需规模核对备份策略、密钥保管、外部事实、恢复时限与隔离放行条件；合成 MATCHED 不自动满足此项|
|private_object_restore|MISSING|实际存储负责人完成对象本体、版本、权限、删除记录与摘要检查；数据库备份不含对象字节|
|security_review|MISSING|独立实际审阅者检查正式候选的权限、私有材料、凭据及运行配置，保留发现与修复结果|
|target_load|MISSING|项目方先确定目标负载，Core 在获准环境核验规模、资源和失败恢复；160 次并发 8 不替代目标负载验收|
|incident_contacts|MISSING|项目方指定故障负责人、联系渠道、轮值、可接受数据损失和恢复时限；本文件不擅自填人名或时限|
|product_and_contracts|MISSING|项目方补产品、价格、授权、供应商合同、隐私与发布材料；自动出款和长期数字人真实网络接入不标正式可用|

供应商清单须按实际启用范围补齐。即便已登记 `PRODUCTION_VERIFIED`，检查也只显示 `RECORDED_REQUIRES_LIVE_RECHECK`；真实服务验证及正式发布由实际负责人另行验收，合成供应商证据不会满足该要求。

## 前端交接的当前完成范围

本轮已核对原代码和日志，写出 PR21 无新增页面/API 的接手安排、现有演练结果及十项未完成门禁。App32-01验通知及详情、App32-02验项目留言；经营报表及 CSV 验收安排在 Web33，不新增 App 报表页。最终共同候选本机自动回归及独立App/Web只读联合验收已完成，见[实际范围](ui-checks.md)和[产物绑定](evidence/verification-summary.json)；原有状态写入场景引用18–20准确原证据。未代做真实设备、正式服务、真实旧库、私有对象恢复或发布批准。后续材料绑定最终完整提交，Root 汇总各负责人真实检查结果后再形成可审阅的发布方案。
