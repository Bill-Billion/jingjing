# PM04 JT-03：后端准备与同记录联测清单

2026-11-19，本侧 chengcongcong222 仅认领后端准备。当前不是新一轮跨端联合测试结果；前端 FE-02 尚待本人认领及集中交付。双方准确候选齐备后再统一联测，维护者最后实际审核。各端原本负责的动作仍以 [17范围逐角色台账](../../collaboration/v5-isolated-20261116/PM03_ROLE_ACTION_INDEX_20261117.md) 为准，四组已接接口不重派。

## 共同基线和复现

规划 [PR41](https://github.com/Bill-Billion/jingjing/pull/41) / `aa106e9f601e9be3c7715181b402c59e4ade69a3` 基于 PR40 完整联合候选 `0786030e88e905013c61e3d7e00c052c99301cde`。后端CI修复在 [PR42](https://github.com/Bill-Billion/jingjing/pull/42)，本地环境补丁与证据另交 `handoff/pm04-environment-20261119`（包含PR42），保留原正在运行的CI。当前 API `0.31.79-rc.1` / 迁移 `0225` 共225项，没有新增产品契约。

本次核实首次启动阻断：`v5-r05-r12-seed.cjs` 即使收到 BATCH 已生成的 `samples`，仍生成不会使用的备用媒体，并硬编码 `/opt/homebrew/bin/ffmpeg`。全新工作树只按说明设置 `JX_TEST_FFMPEG` 时，已生成4份样片但启动 exit1/ENOENT；旧机器缓存掩盖此问题。修复 `66272c93` 直接复用已提供样片；确需生成备用样片时遵循 `JX_TEST_FFMPEG`、`FFMPEG_PATH`、PATH，并限制30秒执行。本机验证结果见 [环境回执](ENVIRONMENT_PREPARATION.json)。不修改业务权限或真实服务。

前端独立电脑新建自己的环境，不复制后端 `access.json`、验证码、会话、数据库或地址。已过期的 PM03 环境只保留历史证据，不重新续时。执行方式沿用 [环境说明](../../collaboration/PM03_LOCAL_ENVIRONMENT_20261115.md)，但本阶段使用 **`--pm03-batch`**，不是旧首批两业务模式。

```powershell
# 在最终核定的真实工作树根目录执行；先按既有说明准备本机隔离 MySQL/依赖。
$env:JX_MYSQL_TEST_ENV_FILE=(Resolve-Path '<本机隔离测试配置>').Path
$env:JX_TEST_FFMPEG=(Get-Command ffmpeg).Source
node scripts/stock-sandbox.cjs --pm03-batch
# 另一终端用刚输出的目录；这是后端准备检查，会新增并保留合成记录。
node scripts/pm03-batch-smoke.cjs '<本次 ENV_DIRECTORY>'
```

环境只监听回环，8小时；生成新随机库，停止保留记录，恢复必须同一 HEAD、同一源码摘要且未过期。最终联测前再创建新环境，不以本次准备环境的剩余寿命约束前端集中开发。`access.versions.frontend_reference` 是夹具历史来源 1d9c0fc4，**不能当实际 App 构建 SHA**；实际 App、管理网页、后端 SHA 和产物摘要须分别登记。

## 范围、角色与记录来源

表中的 `scenarios` 来自本机受控 `access.json`。每台机器生成不同 ID；同一轮各角色必须使用同一环境中的同一记录。只有下列已有样例明确列出，其余从合法业务入口创建并登记，不能手填虚构 ID 或把样例存在算流程通过。

|原范围|已有准备入口|后续同记录核对与仍缺证据|
|---|---|---|
|W03 普通通告|`ordinary_notice`、`notice_receipt`；notices_buyer/seller/reviewer|当前规则的发布、修订、确认、独审和原投稿；`notice_*` 旧星探样例不能冒充当前普通规则|
|W04/W05 本人副本|本人账号及原副本页面/API；没有专门预置完整副本案|申请人→处理人→另一独审→同申请文件/撤权，联测时合法新建案件|
|W06 机构批量|`mcn`、mcn_owner/mcn_staff 及原 Web 批量入口|批次由有权主体新建；登记逐项ID、成员/价格变化、拒绝项和原批恢复|
|W07 条件匹配|原两端明确条件匹配入口；本人和机构角色|四类条件/理由、游标、真实目标链接及权限；不能用静态列表代验|
|W08 新旧合同付款|`commercial`、`cocreation_ready`、原订单/报价入口|分别固定当前/历史合同标签、报价摘要、期款ID和商户；合成旧已付款样例不代表当前交互已付款|
|W11 现货|`stock_unpaid/paid/unlisted/dispute/pending`；stock_buyer/seller/reviewer|同订单支付、权益、文件及独审 KEEP/REVOKE；金额批准与真实模拟到账分开|
|W12 人工定制|buyer/producer/reviewer、既有定制和交付入口；`cocreation_ready` 含已制作项目|完整独立定制案从合法入口创建，记录需求/报价/阶段版本/补件/售后ID；不把共创项目当已验定制全链|
|W13 试镜|`audition_offer`、`audition_ready/awaiting/accepted/delivered/fulfilled`；auditions_*|同预约接拒、文件、确认、追加结算和退款；已有真实合成JPEG/MP4，不代表真人质量验收|
|W14 通告商单|`notice_receipt`、`notice_interested`、`commercial`|原key丢响应/跨截止恢复、CASE/报价/订单串联；旧意向样例与当前商单规则分别标注|
|W15 共创|`cocreation`、`cocreation_ready`；buyer/participant/producer/reviewer/co_actor_*|授权、支付、制作、独审、领取与退款；同room/order/project/snippet关联|
|W16 券|`coupon`、`full_coupon`；buyer及独审|后端smoke生成HOLD并保存ID/版本；跨端读取后释放/核销/全额开工/取消退款|
|W17 奖品|`lottery.pool_id`、既有库存与奖品入口|实际抽取后登记抽取/奖品/排期/履约/独审/补救记录，池存在不等于兑现|
|W18 钱包充值退款|`wallet`、`guardian_refund`；stock_seller监护、stock_buyer2子女、reviewer独审|同充值、关系、证据、案件、任务、累计退款；本人退款另建案，历史未成年退款不要求新付费|
|W19 曝光冠军|`ranking`、`competition`；stock_*及reviewer|提名、票决、异议、奖励文件与截止恢复；原operation key贯穿，不把409判成此前失败|
|W20 机构交接|`mcn`；mcn_owner/mcn_staff及本人|原人员、授权、派单、预约/订单；成员撤销与委托撤回分别验证|
|W21 隐私注销|`privacy.request_id`；buyer/producer/reviewer|同申请、处理、独审、依据、执行及恢复；真实外部删除另列未验|
|W22 参演发行清算|`participation`、`income`；artist/buyer/producer/reviewer|候选、约定、会签、履约、发行、收入和清算记录；合法规则目录读取只是其中一步|

合成文件来源为 BATCH 的 `samples/` 和受控 `files/`。试镜图是色条，原文件名 `test-portrait.jpg` 不代表真人肖像。每条文件验收须记业务 asset/file ID、返回字节摘要/长度、允许角色及拒绝角色；磁盘文件存在或 FFmpeg 可运行不能代替业务文件读取授权。

历史可追溯例子：退款案件 `efa9e07c-a4ce-42f2-835a-76c2688e0c2f`、原充值 `76a08d0f-659d-4a85-a1a5-66f3dbe15e7e`、HOLD `025f59af-3a2d-4e02-905e-4c8895a917a3`，见 [PM03 原始联合报告](../pm03-joint-20261118/REPORT.md)。它们属于已过期旧环境，不是本次新样例或新通过数。

## 双方集中交付时需补齐

1. 前端填写本人 CURRENT、74项逐项归因/复测、App与管理网页完整候选SHA；后端交付准确SHA、API/迁移和当前CI终态。保留前端未交增量。
2. 在隔离联合候选中整合实际增量，核源代码和产物摘要，再构建实际 Flutter App/FlutterWeb/管理网页。不是合入正式分支，不用独立npm预览代替App验收。
3. 每行记录同次环境、各角色account/party、原业务ID/key/version、动作和返回、钱账/许可/文件、失败及复测证据。凭据只存本机受控目录，不进入Git或聊天。
4. 完成集中联合测试后，G2继续原151条及后置未成年人必交专项；实体机、真实外部条件和维护者签收仍待完成。18组0/18、12部分、151条19/124/8和17范围0整项DONE保持。
