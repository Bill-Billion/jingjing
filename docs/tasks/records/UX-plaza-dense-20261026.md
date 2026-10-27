# 紧凑广场、子页面与接口联调

用户授权：按已确认dense-v2更新原Figma，一并完善子页，再按稿还原前端；接口或设计问题报告随PR提交并告知。执行跨至2026-10-27，批次名保留20261026。

起点integration/767d2ffc；工作树`.local/figma-frontend-restore`，分支`ux/plaza-dense-subpages-20261026`。已有未上传设计资产保留。核对PR37/2b07109e，普通业务后端src、迁移和契约与共同版本相同，本轮不依赖它的体验工具。

本侧负责原Figma、Flutter公开发现与相关详情/投稿、针对检查和报告。后端不改；明星、粗定位、城市标准、缩略图等交接事项不代另一方认领。没有部署生产、执行真实支付或合入共同分支。

当前状态：原Figma26页及状态与原主页已更新并保存、读回最终命名版本；前端完成本侧逐图修正与真实隔离接口联通。最终普通/测试专用构建、CI范围分析及597个实际测试通过（0跳过）；320/390/768逐页实拍已完成，最终中性入口文字版补验结果以本轮覆盖表为准。该结果为本侧检查，非另一位同事或甲方人工审阅。

- [26页设计与实际截图](../../ux/plaza-dense-20261026/index.html)
- [最终本地检查](../../testing/plaza-dense-20261026/CHECKS.json)
- [Figma更新与实际远端节点](../../ux/plaza-dense-20261026/FIGMA_UPDATE.md)
- [问题报告](../../reviews/plaza-dense-20261026/REPORT.md)
- [接口报告](../../reviews/plaza-dense-20261026/API_REPORT.md)
- [浏览器逐项覆盖](../../testing/plaza-dense-20261026/api/COVERAGE.md)

交付目标为integration上的前端PR；上传、远端检查、他人实际审阅与合入分别核实。尚未把本侧代理检查写成另一位同事实审。


双方下一步：本侧集中推送并核对本申请的远端检查；请另一位同事按报告实际审阅。Core/产品可确认明星编排、城市标准/定位和缩略素材契约，接手状态仍待其确认；未约定内容不以假成功代替。

本次联合随机库、短期凭据及专用5500/53781服务已清理并独立核实，共用MySQL与PR37体验环境保留；见[joint-cleanup.json](../../testing/plaza-dense-20261026/api/joint-cleanup.json)。

远端代码提交`0cdba9b91417772bf94e1b868b40958c2cafb80c`已推送，服务器与前端自动检查已启动。GitHub连接创建PR返回403 `Resource not accessible by integration`；未绕过权限拒绝，PR尚未创建。申请正文见[准备稿](../../reviews/plaza-dense-20261026/PR_DESCRIPTION.md)，等待用户恢复该连接的PR写权限或提供其创建的PR链接。

上述实现提交的两套远端工作流、四组检查均已成功：[远端结果](../../testing/plaza-dense-20261026/REMOTE_CHECKS.json)。后续仅提交交接文档，不改变已验业务源码；PR权限阻塞仍单列。
