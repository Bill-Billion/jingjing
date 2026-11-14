# 首次关联运行：业务通过，证据收集失败

exec 会话 10717 实际退出码为 1。summary.json 的 exit_code=0 只对应后端测试子进程，166 项通过；随后收集器发现 audition-publisher-identity-http.json 为数组而非规定的对象，报 INVALID_EVIDENCE 并退出。不得将该 summary 单独解释为整批成功。

原始输出和原始数组均保留。本轮在终态后只修正测试输出为 synthetic_only/cases 对象，未修改业务或断言。当前有效结果来自后续 run pm01-audition-publisher-2026-11-14T14-53-40-774Z，exec 79325 实际退出 0，接口校验 exec 17485 实际退出 0；见上级 FINAL_BACKEND.json 与 FINAL_CONTRACT.json。
