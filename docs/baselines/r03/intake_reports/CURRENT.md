# CURRENT｜R0.3修订完成，待最终批准施工

2026-09-21。基线`JX-DESIGN-R03-20260921-REVIEW`；前版`JX-INTAKE-20260920-DRAFT-01`在history原样保留。先读[00总览](00_INTAKE_SUMMARY.md)、[03设计](03_TARGET_DESIGN.md)、[04任务](04_FULL_DELIVERY_BACKLOG.md)、[07差异](07_R03_REVISION_DIFF.md)。

## 已决定与未授权

用户已接受总体方向，并明确采用R0.3：正式MySQL 8；取消独立代办/评估商品/多层分销/通用竞拍/独立交易所/通用IM；保留直接MCN单笔佣金、受控阅读、许可与三端；五入口、版本化规格、强制合同/交易快照和Provider Readiness。**这些是范围决定，不是业务施工批准。** 修订版最终通过前不写业务代码、不将规范写入repo、不建施工分支、不提交/推送/部署。

## 当前交付

- 60项编号不变，59项当前纳入，REQ027明确排除；原32项会议结论空白；源码状态与外部状态不因文档修订升级。
- 14 WORK/42交付子任务，按22个不重复预算的切片覆盖Wave A–F；2020–3160人时，甲1100–1724、乙920–1436。Codex协作暂排57周内部滚动占位，不预设倍速，不是上线承诺；第2周与Wave A出口重估。
- 原COND01/02退出；COND03移入WORK14-A；MySQL访问层/异步事务、并发验证、旧数据迁移是基础任务，当前还未实现或安装。
- F01–F14全部安排Wave A真实性与安全修复；真实上游、完整财务和制作能力在相关包及F验收。早期拒绝假成功不等于已接通供应商。

## 仓库和证据

本地main@eba5daedf71016b5c05661498a89fba57a4b21ed，账号chengcongcong222；9月21日检查HEAD/status未变，源码干净，未fetch/pull。Git/gh已在上轮安装。本轮没有应用测试/构建/网络产品验证；9月20日代码/测试事实保留在01/evidence，不能更新为今天通过。报告一致性验证见[evidence/r03_report_validation.json](evidence/r03_report_validation.json)。

## 后续

最终审阅通过后按WORK01入库R0.3及指令，再进入Wave A：契约和快照基础、MySQL、主体权限与14项缺陷。先计划头2周，不先承诺整项目日期。Provider/真实旧库样本/规格缺口阻塞对应实证，不阻断无关内部工作。未取得完整六条正文之前，未知生产数字保持空；测试数据隔离。

## 报告维护

02/04 JSON为当前结构化记录；03与R03_EXECUTION_NOTES为设计/排期说明。历史原件在history，新增审阅原文在sources，哈希及接收依据在SOURCE_READ_LOG。

派生入口：`render_requirements_r03.py`生成02.md；`build_backlog_r03.py`（或build_backlog.py）按当前R0.3估算输入生成04.md/json；`validate_reports.py`只校验报告，不运行应用测试。后续调整估算须同步生成输入，不能只手改04.md。

`revise_r03.py`、`revise_design_r03.py`、`update_related_r03.py`是本轮从历史快照应用审阅的迁移脚本，后续已有新决定时不要重跑覆盖。旧build_intake/apply_repository_evidence/finalize_reports已加停止保护，防止恢复被取消范围。原始脚本在历史目录，非当前生成入口。
