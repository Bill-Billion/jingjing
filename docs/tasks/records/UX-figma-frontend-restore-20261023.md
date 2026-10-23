# 按新版Figma逐页还原前端

2026-10-23，Experience / Bill-Billion。用户要求全部页面按新版设计还原，并汇总需求或设计不合理问题。

本轮已完成现有App业务页面和Web工作区的视觉改造，并登记103幅设计的路由、状态和未完成差异。**不能称103幅全部逐像素一致**：统一摘要/聚合、公开媒体、认证和财务等24类需求或设计问题仍需产品/Core/Experience协作，见[汇总报告](../../reviews/figma-frontend-restore-20261023/REPORT.md)。未提供的数据不写示例，已关闭能力不因还原设计而开放。

- [逐页原稿与实际截图](../../testing/evidence/figma-frontend-restore-20261023/index.html)：646张App选图，174张Web图；103节点逐一映射，最后局部复拍覆盖旧case+width。
- [检查清单](../../testing/evidence/figma-frontend-restore-20261023/CHECKS.json)：App491、Web13组297通过，Dart/Vue静态检查及两端普通网页构建通过。
- [最后局部复拍](../../testing/evidence/figma-frontend-restore-20261023/last-details/index.html)与[正常登录财务页](../../testing/evidence/figma-frontend-restore-20261023/last-details/finance/index.html)分别实拍，控制故障、真实状态和初轮工具失败分别标记。

起点75e003f设计证据，已同步integration/0bd350d，含PR33/34/35。目录`.local/figma-frontend-restore`，分支`ux/figma-frontend-restore-20261023`。API、数据库及正式服务配置没有变化；现有权限、原请求恢复、付款/授权/验收的独立事实保留。PC没有新版逐屏稿，按同一视觉系统适配。

本侧：统一主题、主页与主壳、各业务域、五个缺失入口、状态修复、逐页截图、报告与本地检查。辅助代理按分域实施及审图，**不等于另一位同事实际审阅**。对方：未代其认领；产品先确认报告口径，Core按既有8项交接和确认后的新契约处理，Experience随后补对应页面闭环。PR35已经修复的追加报价与MCN员工范围不再当当前阻断。

边界：标题仍为思源宋体700子集，与原稿Black存在差异；完整正文17.8MB且f7故事页仍记录外部字体请求。部分页只有相关模板或关闭入口，统一合同/作品库、整单结算视图等差异见报告；未将关联截图冒充独立状态通过。浏览器和合成资料不证明真机、真实支付/签署/生成或影像质量。

撤回方式：本轮仅前端及文档/截图，可在分支回退本阶段提交；没有数据库升级或生产状态回滚。普通lib/main.dart构建不含截图夹具入口或凭据。本轮12个随机测试库已确认删除，初轮全部6个测试端口关闭，临时账号运行凭据、私有构建和截图工作副本已清理；[收尾记录](../../testing/evidence/figma-frontend-restore-20261023/final-checks/CLEANUP.json)可核对。

本轮已集中上传，唯一合并入口为[草稿PR36](https://github.com/Bill-Billion/jingjing/pull/36)，目标integration；实施提交d320173。远端自动检查请以申请当前提交的实际状态为准，不以本地结果冒充远端通过。同事尚未实际审阅，未合入integration/main、未部署。

远端首轮App及两组服务器检查通过，网页运行在Azure镜像安装FFmpeg时长时间等待，已取消取回日志并修正CI安装源、下载超时和按需安装。此项不改页面、业务或依赖锁定版本，全部原浏览器用例保留；最新远端结论仍以PR当前提交为准。见[安装修正依据](../../testing/evidence/figma-frontend-restore-20261023/final-checks/CI_INSTALLATION_FIX.json)。

后续CI暴露短信脚本仍等待默认折叠手机侧栏中的身份项；已改为真实展开导航并核对可见、可选状态，未改产品代码。普通账号、短信及第14—20阶段共138项本地实际API浏览器复验通过，历史证据已恢复；见[复验记录](../../testing/evidence/figma-frontend-restore-20261023/final-checks/CI_LOCAL_RECHECK.json)。随后再次清理隔离服务及运行凭据，最终状态见收尾记录。
