# 当前施工入口：W28恢复旧执行凭据失效与待处理核对

正式树worktrees/client-testing，分支core/full-business-closure-20261028；先读[后端CURRENT](status/CORE_CURRENT.md)、[前端CURRENT](status/EXPERIENCE_CURRENT.md)、[报告](reviews/pm01-restore-fencing-20261112/REPORT.md)及[接续](reviews/pm01-restore-fencing-20261112/NEXT_BACKEND.md)，核实际Git。

业务a16c6488修复旧租约恢复后仍有效和待执行/重试统计漏项；完整同版后端1633项通过、0失败、1项旧库样本对照跳过；同次78份文件6055份HTTP响应格式通过，840份冻结源码未变。接口0.31.59-rc.1/0212，未放行恢复库。前候选fd5afead三组远端全成功；候选5effb3c3已上传原草稿PR39，说明已同步；服务器自动检查43242813888运行中，甲方测试工具检查43242813754运行中，App 与管理网页业务页面检查43242813955运行中；观察于2026-11-12 14:59:23 UTC，未完成不计通过。未实审未合入未启用，最终回执本地保存随下批同步。禁止前端开发修补，维护者阶段末审阅；真实/收费/生产/公网不开，不动3490与离线APK。18组0/18、12部分、151为19/76/56，未开发数不详。
