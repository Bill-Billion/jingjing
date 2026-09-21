# Core CURRENT

- 基线：JX-R06-EXECUTION-BASELINE-20260921；Stage0；用户要求继续推进。
- 当前Task：CORE-S0-002；owner=chengcongcong222；branch=core/s0-002-mysql-foundation；IN_PROGRESS。
- Handshake：起点/origin/integration=ac34c4836c005bd7b4f8b903d21782fe380bc432，dirty=false；REQ-008/011/013/015/032/033/037/042/043/044/045/052（WORK-14基础范围）。
- 契约：0.1.0-rc.1候选在独立[PR #1](https://github.com/Bill-Billion/jingjing/pull/1)，IN_REVIEW；本分支不包含尚未合并的OpenAPI，不替Experience确认。
- 本轮：建立隔离MySQL8、本地异步连接/事务与迁移runner，验证新库/重跑/事务失败及DDL失败恢复边界；禁止生产SQLite回退。
- 环境：Node22.19.0；初检PATH/常见位置未发现MySQL/Docker。便携式本机MySQL仅用于可丢弃测试；不连接生产、不调用收费服务。
- 待验证：真实MySQL连接、迁移、回滚和异常行为。未验证不标PASS；schema/migration边界在PR交叉review前不合入integration。
- 原CORE-S0-000已完成。双流任务记录分别维护；合并两个Core PR时保留双方任务状态与证据，不整份覆盖board/CURRENT。
