# PM04 前端阶段回执（2026-11-23）

## 收到、已完成与当前证据

- 原要求：[前端指令](../../pm04/PM04_FRONTEND_CODEX.md)、[执行计划](../../pm04/PM04_PLAN.md)、[历史 App 失败源](../pm03-joint-20261118/APP_FAILURES_FOLLOWUP.json)。FE-02 已实际开始，不把历史 74 项当作未开发功能。原有前端工作树和未提交内容不动。
- [逐项记录 74 项](APP_FAILURE_TRIAGE.csv)，每项保留原日志行；74 项均已按现有行为或合成回包精确复测通过，仍需固定候选全量与远端复验。未知不猜为产品缺陷、也不当通过。本机早期全量额外 1 个样片截图失败在未修改的同机基线同样复现（`databaseFactory not initialized`），不混入原74；另以测试专用离线图片缓存替身完成单项复测，不改产品缓存。
- [e7e6ae8d](https://github.com/Bill-Billion/jingjing/commit/e7e6ae8d) 同机四文件 45通过/12失败→52通过/6失败，无新增失败：旧价不发 checkout POST；预览撤权后清内容；退出或切身份后清私有剧本；原制作反馈/通告撤回以原记录、原键和版本重试。
- [f4d4d1cf](https://github.com/Bill-Billion/jingjing/commit/f4d4d1cf) 同机同四文件 58/58：通告读取失败保留过滤条件、重读不写入，401 保留原回跳且不继续办理；剧本确认、样片原版本反馈及独立制作/许可入口。
- [a740b357](https://github.com/Bill-Billion/jingjing/commit/a740b357) 三文件 29/29：四类条件匹配（包括独立试镜入口）的同条件续页、命中理由、回到普通搜索；单条/批量通知结果未知时先挡住另行刷新，仅恢复同身份、同快照、同 key 的原操作。
- [a48c9862](https://github.com/Bill-Billion/jingjing/commit/a48c9862) 原样接入 PR43 的两文件合成 Stage16 夹具 `62fa0a3`。仅本机 Node/解析及通用启动/合成供应者 13 项通过；本机无独立 MySQL 配置，preflight 明确拒跑 `ISOLATED_TEST_ENV_REQUIRED`，本机未触达实际制作浏览器。远端 [45132805455](https://github.com/Bill-Billion/jingjing/actions/runs/45132805455) 已用合成隔离库跑通 Stage16；Stage18 准备时成年实名前置 409，随后七步仍跳过，原负例不得删除。后端运行时、接口 `0.31.79-rc.1` 和 0225 迁移未变。

- [权限与发票专项](https://github.com/Bill-Billion/jingjing/commit/423b05cbd7e727aac8da7e4815831f05b8d5ed5c) 4/4：登录后只读原许可不发办理写入；私人钱包仅在「我的」读取，广场公共窗不读取；错申请的真实样式合成依据不可见，回原申请正确重读后才可选；发票失败不显可申零额，原订单按真实收/退/待退/占用重读，不误报真实票据。
- 远端 [App 选定套件](https://github.com/Bill-Billion/jingjing/actions/runs/45132805455/job/137551955999) 实际 checkout `3556c6236ede31d1f56ea9555b323a71f81242a7`：分析 0 warning（78 info）、863通过/56失败/1跳过；较同套的 844/74/1 修复18条加新增标题用例。这个回执不包含上方较新的4个专项，不代本机完整 App 回归。

- [定制、试镜及合同专项](https://github.com/Bill-Billion/jingjing/commit/7d767dbaec6d27120f04312e4c11b34bf4dacc2d)：定制／试镜两文件 18/18，合同两文件 13/13，其中 10 条为历史失败复测。
- [远端更新运行](https://github.com/Bill-Billion/jingjing/actions/runs/45134278515) 实际 checkout `26e98e91cf233b7881b8cc79db430958d247702c`，App 选定套件 867/52/1，不包含上述新专项；独立库浏览器 Stage16 与 Stage18 通过，Stage19 合成供给准备时 `POST /supply/avatars` 准确返回成年账号前置 409，随后六步跳过。
- 另保留 `a48c9862` 本机完整 App 1173/57/1、Vue npm test/构建及 Flutter Web 构建通过；不是上述远端选定套件计数。

- 项目会签、个人权益、结算回执、帐号与艺人材料、项目/制作/补件再确认：固定候选 App 目录树见 `3faccc76`；三次专项分别 8/8（会签/权益）、37/37（账号/艺人）、69/69（财务与项目/制作/定制），此次合计覆盖19条历史失败。另修复旧历史版本页测试助手依赖单一宿主造成的失败，不计入历史74。
- [远端 App 复验](https://github.com/Bill-Billion/jingjing/actions/runs/45136191488/job/137563031988) 实际 checkout `2d3c8071` 选定套件 876/43/1；含一条上述本机已修正的历史版本页助手问题，不宣称远端已全部通过。

- [固定候选远端复验](https://github.com/Bill-Billion/jingjing/actions/runs/45137744540/job/137567973638)：选定 App 896/23/1；同 App 代码树 `3faccc76` 本机全量 1206/24/1（24＝历史23，加基线也失败的本机数据库工厂截图），全量 analyzer 和 Flutter Web 构建退出0。
- 后续本机专项：帮助/制作介绍14/14，合作/许可73/73，通告7/7，验证12条历史失败。
- [Stage19 隔离网页已通过](https://github.com/Bill-Billion/jingjing/actions/runs/45136191488/job/137563031740)。Stage20 推进至报表 worker 后失败：新增隔离托管单的 2900 进入同期现金入账，先前期望仅两制作的20000；此次修正同时严格核对两制作各期、独立托管、原退款、六个来源明细，节点单元15/15，实际浏览器待重跑。

- 最后 11 项本机专项：实际消息/公开搜索/身份/广场 39/39，艺人 53/53，评价/权益12/12。另做 [FE-06 前端预核对](FRONTEND_G2_PRECHECK_20261123.md)，监护/钱包/隐私/权益/合同独立回归 60通过/1既有跳过，不代正式专项。

- [远端 f9d0b419](https://github.com/Bill-Billion/jingjing/actions/runs/45138605272) 选定 App 908/11/1。Stage20 报表已真正走通，最后浏览器旧断言要求79项、实际80项。当前仅改测试共用同一 80 项/7 类口径，按真实路由逐个访问，明确校验 W18 充值退款仅在财务分组一次、原地址/标题/高亮正确，保留 390px 界面测试；更改后需重新跑 Stage20 和后五步。

## 固定候选复验

App 固定输入 `ebaef1837b0020f577901dd46b54f6324a23aba1`，目录树 `453e5e42bc6bda600f20bd449a09cda7ecf7fe96`。此后改动仅证据文档和浏览器脚本，无 App 或 Vue 源码差异。

- 完整 App 1230通过、0失败、1既有跳过：`test/privacy/pm01_live_copy_test.dart` 只有指定同库隔离执行器注入 `JX_PM01_APP_FIXTURE` 才可运行。本机没有这份合成夹具；不算通过，也不混入原74。
- 全量 Dart 静态分析退出0、无 warning/error（106 infos），历史截图整文件49/49。
- 同 App 源码的隔离 Android debug APK 构建成功；固定无效 HTTPS 及 `.acceptance` 后缀，SHA-256 `d3b858553ed77e9ff8cdd9aec327824ebdc9ff31369dd7817df71f66397a9b71`。没有安装、没有替换旧 APK，不是签名包或真机验收。
- 同一固定 Vue 源码的 `npm test` 及 `npm run build` 退出0，不代替真实隔离浏览器。


## 构建和设备：分开记

| 项目 | 当前真实证据 | 仍未验证 |
|---|---|---|
| App analyzer | `0a668ef3` 同 CI 范围 10 个 warning 清零、exit 0；本机 `7d767dba` 全目录 exit 0（104 info、零 warning/error） | 远端最新候选及剩余回归 |
| Android | `f4d4d1cf` 独立一次性树，官方仓库既有脚本只加入 debug 应用后缀、无效 HTTPS 地址和测试标识，`assembleDebug` 成功。APK SHA256 `931fb2383d8be113ef162c15f1364ae0e71933a37b3c3a93339b9a7448be48b3` | 未安装、未替换旧 APK，非签名发布、非真机/业务 验收 |
| Flutter Web | 本机 `0a668ef3` 成功，固定 `a48c9862` 编译通过 | 新版完整回执及同记录实操 |
| Vue 管理网页 | 本机 `0a668ef3` npm test、类型检查/构建及本机回环模拟登录下导航通过，固定 `a48c9862` 编译通过 | Stage16、18 与 19 已通过；Stage20 报表及后续五步仍待验，不拿本机模拟代验 |

固定命令运行输入 `a48c98625da81661b778077271ef89d2893f922a`：App 目录树 `e8e5ec273200f5dbfd48f563f81a8df59834493a`，Vue `9c9b60b2dbf839fc0fc00299d8058fea0b860059`，后端 `1b3b6b86cec55c8fa1cf0979b8d3b874122f2b2e`；这不是只凭 HEAD 就声称全部检查通过。较新提交必须另记准确受测版本。

## 能独立准备与必须共同验收的边界

| 事项 | 前端已可执行 | 仍需实际外部条件 |
|---|---|---|
| FE-02 (G0) | 按现有功能与原断言定位剩余失败、可复现才做小补丁，按固定候选重跑 App/分析/Android/两种 Web 构建 | 自动检查全绿不是凭提交宣布；正式真机仍另验 |
| JT-03 (G1) | 保留 [17 范围与角色对照](../../collaboration/PM03_BATCH_DELIVERY_ALIGNMENT_20261117.md) 和 [PR40 联合交接](../../collaboration/PM03_JOINT_HANDOFF_20261118.md)，使用独立合成账号验证同一记录、权限、原 key/版本；准备 App/Flutter Web/Vue 可操作版本 | 后端已冻结 SHA、共享合成环境及角色/同一业务 ID；同订单的原文审核、退款/下载回执、多方角色实操和维护者审阅未签 |
| FE-06 (G2) | 保留 [原要求冻结表](../../pm04/PM04_REQUIREMENTS_FREEZE_20261118.md) 的八组证据与 W18 既有入口；一旦确证未成年付费越权、儿童资料泄漏或原退款丢失立即 P0 | G2 专项仍必交，不把本机/合成环境、单端/单案例当所有未成年人覆盖；真实外部服务和真机单列 |
| QA-07／RL-08 | 按现有交付、失败与外部依赖留下查验证据，不代签 | 尚未正式整批验收、版本签收或上线决定；保持 NO-GO |

18组 0/18、12条整链历史部分、151条 19/124/8，不修改 PR40 原始历史回执、不合并、不部署。
