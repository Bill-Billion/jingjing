# 实际失败与处理

- 制作专项在c47bb82a上，转派后PRODUCTION_FILE与争议暂停后PRODUCTION_VERSION仍被批准：实际200，预期403/409。INITIAL_FAILURE.tap保留；2通过/3失败含父检查，实际两个反例。7e14a34修复后专项5通过，13文件154通过，PRODUCTION_ONLY_*只作中间版本证据。
- 后续SUPPLY_ASSET原机构上传人资格暂停，批准未抛SUPPLY_PARTY_FORBIDDEN。SUPPLY_INITIAL_FAILURE.tap保留，9通过/2失败含父检查，实际一个反例。b6be09f7补供稿当前权限；ALL_SOURCES_TARGET_FIXED.tap为两文件16通过，最终FINAL_*为统一13文件155通过。
- 新独审调用原来源仓库的现有权限判定，复用同一事务，原主体由任务所有人解析，不接受调用方指定身份。制作源和供稿源都核当前原文件绑定；原件字节校验保留第82轮修复。
- 执行观察句柄结束后再次查询提示Unknown process；从原运行目录最终exit_code=0、结束时间、155检查和九份新鲜HTTP核实完成，没有重启测试或借旧数据。
- 没有本机前端/真实服务执行。合成供应商和隔离权限布置不是实际运营签收。
