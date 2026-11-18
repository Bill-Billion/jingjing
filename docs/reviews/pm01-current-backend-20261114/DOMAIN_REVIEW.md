# 六域审阅准备：第84轮当前后端差异自查

来源：[PM01 W01](../../sources/pm01-20261111/03_本轮施工任务与验收.md)原文：“分域审阅PR39，单列迁移、权限、钱账、授权、删除及发布配置”。这是后端负责人提供的自查依据，维护者尚未审阅，PR未合入；不是六项新增商业需求，也不是151条标准全部结案。

下列代码路径相对`晶晶日上工程交接包/01_源码/backend_server`。具体同版断言及其结果见最终CHECKS和SOURCE_MANIFEST，不能从测试数量推算业务完成比例。

## 迁移与恢复

实现：`src/operations/backup.js`、`src/operations/recovery-check.js`、`src/operations/private-object-inventory.js`、`src/infrastructure/database/migrator.js`、`src/infrastructure/database/recovery-guard.js`。

已核行为：失败迁移保留现场；备份校验和目标检查通过后恢复到新的隔离库，核资金、旧订单、权限和任务事实。0224至0225升级保留已有交稿记录。数据库恢复不自动切换服务。

复验：`test/migrations.test.cjs`、`test/migration-rollback.integration.test.cjs`、`test/release.integration.test.cjs`、`test/customization-handoff.integration.test.cjs`。

仍缺：真实改造前58表旧库样本，对应等价性检查保留未验证；隔离恢复不证明生产切换、真实对象备份或上线回退已获批准。不能用新建样本冒充旧库。

## 权限与办理人交接

实现：`src/modules/party/representatives.js`、`src/modules/governance/operator-access.js`、`src/modules/privacy/representative-copy.js`。

已核行为：企业当前已接受的TRADE授权和有效成员关系决定交易代办；离职、撤回、过期阻止新动作；其他有效代表可接续原单。普通成员保留本人故事权，财务代办不扩成签署、供应商或独立审核权。

复验：`test/party.integration.test.cjs`、`test/notice-representative.integration.test.cjs`、`test/audition-representative.integration.test.cjs`、`test/invitation-representative.integration.test.cjs`、`test/customization-representative.integration.test.cjs`、`test/customization-handoff.integration.test.cjs`、`test/privacy-representative-copy.integration.test.cjs`。

83轮补审核批准时原任务主体当前权限：制作文件转派、制作版本争议暂停、供稿成员资格暂停都阻止批准，合法恢复可接续；原件摘要/实际字节和独审禁止自审继续生效。共用来源读取接受内部事务，外部请求不能指定该事务或替代原主体。纳入本轮完整回归的production-text/text-moderation测试包含这些反例。

仍缺：合成身份和授权状态仅验证服务器规则；真实机构身份、签章权限及所有所需端在最新候选上的实际办理仍需对应证明。

## 钱账与逆向处理

实现：`src/modules/settlement/review.js`、`src/modules/settlement/recovery.js`、`src/modules/trade/providers.js`。

已核行为：独审裁定不提前当到账；分次追回在凭据复核后按实际额入账，重复回执不重记；凭据受限阻止付款复核。履约和退款沿原机构、原订单归属，不转给替换机构。旧付款证据不会被追回流程抹去。

复验：`test/settlement.integration.test.cjs`、`test/settlement-evidence-restriction.integration.test.cjs`、`test/refund-restore-authority.integration.test.cjs`、`test/refund-restore.integration.test.cjs`。原机构正常履约及部分退款证据仍保留第70轮来源；本轮实际结果须以最终CHECKS为准，不把旧证据当作新的独立财务审阅。

前73轮发现的七天内有效推荐被100条其他点击截断，已在74轮修复：按完整微秒时间及ID继续读取批次，保留分类/主体/有效期/自购排除/冻结费率，不追改旧单。本轮将referral-window.integration.test.cjs纳入当前完整回归。面试未入选权益的已完成记录允许独审补救，并保留此前实际完成排期；不把已入选或其他已兑现权益扩大为可退款。抽奖制作金完整兑现/原单退款为80轮新增验证，不是本轮新增业务。

仍缺：渠道凭据为合成；市场分配付款和自动打款门禁仍未启用。未完成真实收银、清分、银行回执、税务或生产对账。

## 人格、合同与使用授权

实现：`src/modules/artists/context.js`、`src/modules/governance/business-gate.js`、`src/modules/production/provider.js`。

已核行为：撤回、失效、用途或受让人不符时阻止新制作及受控素材读取；面部授权不自动涵盖声音。历史合同快照保留，退款逐案KEEP只保留原有效许可。

复验：`test/cast-rights.integration.test.cjs`、`test/projects.integration.test.cjs`、`test/licensing.integration.test.cjs`，以及退款恢复权限检查。

仍缺：具体签署产品、长期数字人资产与真实供应商撤回证据；SERVICE_READY不证明实际签署或付款，机构代管不转移艺人资产。

## 资料删除与恢复后限制

实现：`src/modules/privacy/execution.js`、`src/modules/privacy/erasure.js`、`src/modules/privacy/closure.js`、`src/operations/privacy-recovery.js`。

已核行为：实际删除目标需与审核范围和当前存储配置一致；回复丢失可按原目标恢复。当前对象不存在只记CURRENT_OBJECT_ABSENT，历史版本和备份另审，整申请不自动完成。注销仍核余额、争议和机构责任；恢复后需重施限制。

复验：`test/privacy-execution.integration.test.cjs`、`test/privacy-cross-module.integration.test.cjs`、`test/privacy-response-delivery.integration.test.cjs`及恢复检查。

仍缺：本地替身对象和合成数据库不能证明真实OSS版本、备份、外部模型或供应商已删；正式保留依据及实际注销人工验收仍待。

## 发布配置与外部服务

实现：`src/operations/release-check.js`、`src/modules/governance/business-gate.js`；离线配置工具`scripts/provider_config_audit.py`相对仓库根目录。

已核行为：填齐候选表仍只得到DECLARED_EVIDENCE_REQUIRES_REVIEW；供应商已登记仍需实测，不自动发布。缺配置、隔离恢复库、无实际审阅或真实测试证据均不能换成已上线。无效UTF-8仍拒绝；82轮后长文本按600码点/60重叠逐段核全部内容，已知回执持久化、未知不重发，全部正常也要求全文独审。分段是实施方案，不宣称真实检测质量或计费/吞吐达标。配置修订变化需要重新核验，旧准入不自动等价新产品已验。

复验：`test/release.integration.test.cjs`、`test/provider-readiness.integration.test.cjs`、`test/provider-foundation.test.cjs`；离线配置11项、材料扫描反例10项、个人资料目录5项已执行通过，目录50分类/15组/两个接口一致；仅目录不证明完整实际交付。结果见OFFLINE_TOOL_CHECKS.json，未调用收费或真实服务。

仍缺：九项外部服务的产品绑定与真实验证、实体设备、维护者审阅、负载/安全/事故职责和部署授权仍分项待完成。本轮不执行前端、外部调用或部署。

## 怎样用于审阅

维护者取得同一候选后，按上述代码、同版断言和原需求检查。后端完整回归通过只提供自查证据；维护者结论、设备、真实服务及正式启用分别登记。若发现具体业务缺口，由后端负责人继续修复并重新冻结验证，不用整理文档替代业务开发。

本轮相对73轮的运行时/接口准确路径见RUNTIME_DIFF_SCOPE.json。此前交易/奖品/长文本的修复说明是对现有实现的核对，不新增本轮功能；最终全量测试结果已在FINAL_BACKEND.json、FINAL_CONTRACT.json登记；选定域断言见DOMAIN_REVIEW.json，重复归属不能相加算业务进度。当前维护者审阅、真实服务和所需端限制不因代码自查取消。
