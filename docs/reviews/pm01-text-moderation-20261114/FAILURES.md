# 保留的失败及处理

1. INITIAL_FAILURE：旧运行时600正常、601任务BLOCKED，真实业务缺口；新增分段与独审接续后通过。
2. INITIAL_IMPLEMENTATION_FAILURE：新代码误写jobs.renew，实际公共方法为heartbeat；已改用原方法，不新增续租实现。
3. INITIAL_FIXTURE_FAILURE：MySQL驱动已解析JSON，夹具再次JSON.parse失败并连带留下临时停权状态；按字符串/对象两种驱动格式读取，全部重跑。
4. INITIAL_CRASH_FIXTURE_FAILURE：Object.create继承冻结数据库对象，无法赋值withTransaction；夹具改对象副本包装后真实注入最终写入失败并恢复，不修改运行时来迁就测试。
5. INITIAL_RELATED_BACKEND/INITIAL_CAPTURE：149业务通过，但误收未由本组生成的隐私HTTP文件，被STALE检查拒绝。收集器保留原12测试文件，剔除此非产物并完整重跑，最终8文件均为当次。

未删除失败日志，不把首次通过与最终通过相加；最终依据FINAL_BACKEND/FINAL_CONTRACT。
