# CORE-S0-000｜基线入库与协作初始化

- Owner：chengcongcong222；Stage0；REQ-043/044/045；分支core/r06-collaboration-bootstrap。
- 起点：eba5daedf71016b5c05661498a89fba57a4b21ed；2026-09-21核对远端main及本地干净；后续integration发布结果以远端引用为证。
- 用户输入：R0.6为多版需求归并后的最新执行初始化；上传方案、组织协作、认领并整理本地。未要求本次实现全部Stage0–6。
- 改动：原件/哈希、当前入口、根指令、需求/任务/双流CURRENT、Stage/CP、CCR/PR模板、文档验证脚本。源码保持原路径。
- 评审范围：文档治理初始化，不修改schema/OpenAPI主文件/权限支付等实现或生产release配置，无技术共享边界变更；不冒充另一流review。
- 验收：运行 `python scripts/collaboration_check.py`；`git diff --check`；核对新文件凭据模式和归档字节；比对业务源码无变更；推送后核对远端任务分支与integration。
- 结果：本地文档校验PASS；94份归档原件的工作树及Git暂存blob哈希均匹配，60项登记/59项范围/30项任务覆盖正确、依赖无环；当前链接与git diff --cached --check通过。新增材料常见凭据模式扫描无命中（非完整安全审计）。详见 [验证记录](CORE-S0-000-validation.json)。
- 发布实证：2026-09-21已推送初始化提交c52de880863c398da8c636708a433af03426c0f7；git ls-remote确认origin/core/r06-collaboration-bootstrap与origin/integration均指向该提交，origin/main仍为eba5daedf71016b5c05661498a89fba57a4b21ed。本记录和DONE状态作为后续普通提交同步，不预写最终提交哈希。
- 结论：CORE-S0-000完成；仅协作初始化。下一项CORE-S0-001已认领、未开始，Stage0整体尚未完成。
- 未运行：App/后端业务测试、Flutter/Web构建、MySQL/迁移、真实Provider、生产部署。
- 恢复：保留main及原始本地材料；如需修正文档提交追加commit。不能用reset/强推删队友工作。

真实commit可用 `git log --oneline -- docs/tasks/records/CORE-S0-000.md` 获取；首次发布不在commit内容里预写尚不存在的commit哈希。
