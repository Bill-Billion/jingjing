# 来源与仓库目录地图

|层次|位置|含义|
|---|---|---|
|V1现有工程|仓库根 `晶晶日上工程交接包/01_源码/`|backend_server与frontend_jingjingshangri_app保持原路径；不是全部已验收|
|V1工程事实摘录|[bootstrap-r02/sources/V1](bootstrap-r02/sources/V1)|旧README/审查/交接原件，含过时判断|
|V2会议材料|[bootstrap-r02/sources/V2](bootstrap-r02/sources/V2)|Word原件；提取版在extracted|
|V3会议反馈|[bootstrap-r02/sources/V3](bootstrap-r02/sources/V3)|Word、Excel和融合记录；32项会议结论空白保持|
|版权与完整范围增量|[bootstrap-r02/sources/DELTA](bootstrap-r02/sources/DELTA)|用户原文与范围记录|
|R0.1/R0.2|[bootstrap-r02](bootstrap-r02)|原始接手包，建议/参数带原始状态；其AGENTS只针对旧接手任务|
|R0.3审阅与核验|[r03/intake_reports](../baselines/r03/intake_reports)|原件快照含需求、设计、backlog、外部条件及历史测试证据|
|R0.6执行基线|[r06](../baselines/r06)|8个接收文件原样入库；当前技术与协作方向|
|当前工程管理|docs/requirements、tasks、status、architecture、collaboration|持续更新入口，与历史快照分开|

[IMPORT_MANIFEST](../baselines/IMPORT_MANIFEST.json)记录接收路径、仓库路径、字节数和SHA-256。历史原件中的工作区绝对路径、旧相对链接和停工措辞均保留原样；clone后以manifest destination与本索引访问，不运行旧迁移/生成脚本覆盖当前台账。导入验证脚本只读原件。

历史README中的相对代码链接原以仓库根为起点，归档后按根路径解释。原有 `docs/project-review-2026-09-10.md`、UI方案、全景和审阅包仍是历史资料，不更换源文件路径；后续有实际迁移任务再改引用。

未入库：本机verification依赖/临时数据库、ZIP副本、报告生成脚本及旧历史备份。共享核验日志是历史证据，不表示本次应用测试通过。
