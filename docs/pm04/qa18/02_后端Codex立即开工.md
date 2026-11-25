# 后端 Codex 立即执行指令 — PM04 G1 原18组统一机测

> 授权范围：**马上开始机器测试**；不是立项新的业务开发。你是统一机测总主办，保留本人的后端职责，协调前端Codex在其工作树测试App/FlutterWeb/Vue。直接执行T0与G01，并在仓库交付实际回执。无需再次征求是否开展测试。

## 必须先读（优先级依次）

1. `AGENTS.md`、`docs/pm04/README.md`、`docs/status/CORE_CURRENT.md`、`docs/status/EXPERIENCE_CURRENT.md`
2. 本包 `docs/pm04/qa18/01_统一机测总计划.md`、`03_18组与12链矩阵.md`、`04_登记与协作规范.md`
3. `docs/testing/FULL_BUSINESS_ACCEPTANCE_20261028.json`（151条唯一正式登记）、`docs/tasks/board.json`（CORE/UX原18组任务）、`docs/requirements/baseline.json`（60条原REQ）、`docs/sources/pm03-20261115/dashboard-data.json`（18组及E2E来源）
4. `docs/pm04/JOINT_ENVIRONMENT_20261124.md` 与 `docs/pm04/CI_PRIVACY_FOLLOWUP_20261125.md`（在PR43），以及 `docs/testing/ACCEPTANCE_WORK_QUEUE_20261102.md` 的现有历史线索

## 冻结基线（执行前实时验证，若不同则以真实提交更新清单）

- 2026-11-25：PR41前端 `80d826565764e9f2e912004418716a3c45e462ed`，当时4/4 CI成功。
- PR43只读后台环境受测源码 `7e35958a6e53de1f33f526de16a0f2be0e5cb60c`，交接HEAD `d9edd9a3364a78a8589b4fb989f03b29154be943` 含旧前端。不要整体合并 PR43 的旧前端。
- API `0.31.79-rc.1`、迁移 `0225`/225；不承认无来源的运行数。
- 需要时在隔离 QA 候选独立分支保留已有 PR41 端侧成果，再选取 PR43 的**确有必要**的环境脚本（不是全分支无差别覆盖）。对照两个工作树业务服务目录一致性，以实际源码树和openapi判断；先机测不必合入 `integration/main`。

## 第一条命令前先做

- 确认干净工作树；有未提交修改则先保护，不丢数据、不强行reset、不覆盖前端分支。
- 确认 Node22/MySQL8/FFmpeg、Git、受控权限、回环地址；连接不可用则明确报告，不设假PASS。
- 对正式源运行：

```bash
python scripts/full_business_check.py
python scripts/acceptance_work_queue.py --check
python scripts/acceptance_progress.py --check
python scripts/pm04_check.py
```

- 从本包安装的登记脚本生成本轮执行矩阵（以下三SHA均为实际被测源码输入，若与示例不同须替换；environment须是本次**真实**独立环境标识）：

```bash
python scripts/qa18_registry.py init \
  --run-id pm04-g1-discovery-20261125-01 \
  --round discovery \
  --backend-sha 7e35958a6e53de1f33f526de16a0f2be0e5cb60c \
  --app-sha 80d826565764e9f2e912004418716a3c45e462ed \
  --web-sha 80d826565764e9f2e912004418716a3c45e462ed \
  --environment <你新建环境实际ID> \
  --note '两端冻结组合；PR43作为独立本地后端测试运行目录'
python scripts/qa18_registry.py export --run-id pm04-g1-discovery-20261125-01
```

**注意**：命令中的 `<...>` 是占位，不要字面复制运行。Windows PowerShell使用单行或PowerShell自己的续行符；不要求Linux shell环境。

## G01：现在就运行

- 用合法的真实隔离 MySQL 环境（`JX_MYSQL_TEST_ENV_FILE` 必须指向你本机新建的安全测试配置），先查当前实际文件存在并运行：

```bash
node --test "晶晶日上工程交接包/01_源码/backend_server/test/stock.integration.test.cjs" "晶晶日上工程交接包/01_源码/backend_server/test/auditions.integration.test.cjs"
```

- 依据原组1的全部正式预期（从151登记自动筛选 `groups` 含`01`）继续补当前版缺少的角色、上架审核、试镜价格/资格、退回重提、付款限制等断言；优先复用原真实接口与当前脚本，不重复编造实现。
- App/Web必须由真实Flutter/Vue运行或准确远端CI完成其对应必要项；后端若没Flutter/Chrome，登记为 `BLOCKED` 并转前端执行，不得在后端机上用API结果替它们签字。
- 对每条实际断言保留命令、退出码、文件摘要、源码/环境ID、预期与实际；使用 `qa18_registry.py record` 追加**具体标准×端×场景**结果。没有真正执行的项保持NOT_RUN。
- G01首轮状态在本包报告生成器生成，立即进入G02；普通FAIL集中留缺陷单，P0安全/钱账立即停止相关链处理。

## 批次继续顺序

`G01→G02→…→G16→G17(E2E-01…12)→G18`。已有现货、私有文件、异常付款等联测报告，可逐证据匹配并减少无谓重做；仅同数据/相同SHA/实际范围一致才能用于本轮，其他全部保留为历史线索。

第一轮结束：逐条缺陷定责，集中小修并完成针对性复验。修补源SHA变化后建立新 `full_regression` 轮次，从原全部18组、12路线及所有所需机测槽位重跑，生成对比报告。此轮不直接让甲方手工遍历所有业务。

## 当前要交的东西（不是承诺未来执行）

- 新的测试候选工作树准确来源及SHA、测试工具环境、第一轮注册 `config.json` / `manifest.json` / `matrix.csv`
- G01实际运行原日志与结果（成功/失败都保留），可证据指向的缺陷登记，剩余槽位数量
- 下一组G02启动条件、需前端代跑的端侧清单（只提供准确条款+复现步骤，不代领取）
- `qa18_registry.py report` 的实际输出、日报摘要、更新原PM04驾驶舱的**执行事实**；不修改历史接受统计

## 明确禁止

不增加“MCN带艺人入驻冷启动新链”；**原E2E-10仍在已有需求内必须照验**。不删151/12/18、不重新发明商业定价、不因提示找不到就放松年龄/权限门禁、不用不同订单拼一条链、不将API PASS写成App PASS、不删除测试或改弱断言造绿、不合并正式分支、不部署、不发真钱、不操作旧离线安装包。
