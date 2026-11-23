# PM04 当前任务驾驶舱

> 本页由 board.json 的 PM04 记录生成；原需求、历史统计和原件保留。

[执行入口](README.md) · [计划](PM04_PLAN.md) · [原需求冻结](PM04_REQUIREMENTS_FREEZE_20261118.md)

|任务|阶段|建议负责人|实际领取|执行状态|
|---|---|---|---|---|
|PM04-BE-01|G0|chengcongcong222|chengcongcong222|IN_PROGRESS|
|PM04-FE-02|G0|Bill-Billion|Bill-Billion|IN_PROGRESS|
|PM04-JT-03|G1|chengcongcong222 + Bill-Billion（分别认领）|chengcongcong222|BACKEND_PREPARATION_ONLY|
|PM04-PM-04|G2|产品负责人 + 法务（未指派GitHub人员）|待本人领取|NOT_STARTED_REQUIRED_DEFERRED|
|PM04-BE-05|G2|chengcongcong222|待本人领取|NOT_STARTED_REQUIRED_DEFERRED|
|PM04-FE-06|G2|Bill-Billion|待本人领取|NOT_STARTED_REQUIRED_DEFERRED|
|PM04-QA-07|G2|双方 + 维护者（分别签认）|待本人领取|NOT_STARTED|
|PM04-RL-08|G3|Bill-Billion + chengcongcong222 + 甲方|待本人领取|NOT_STARTED|

共同节奏：独立开发、集中交付，再固定双方版本整批联测，最后维护者实际审阅。

G0 尚未通过；G1 有局部历史证据；G2 原151条含后置未成年人专项必须全覆盖；G3 发布 NO-GO。

PR40历史：App 1155通过/74失败/1跳过；18组0/18、12整链部分、151条19/124/8不变。

JT-03 的本侧领取仅限后端准备，不代表前端认领或已开展新整批联测。

更新领取：本人修改 board.json#pm04_cycle_20261118，再运行 python scripts/pm04_check.py --render。
