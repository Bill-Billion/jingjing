# V5 实际 App 阶段交接
更新时间：2026-11-16T10:53:54.858100+00:00
本批可交付代码与缺口清单，不是全量完成、视觉验收或可部署声明。

## 基线、安全与版本
- 原前端 HEAD：f9c4c1b7a3c4ba60a240b1cb55e6ce8182a61533。
- 本批以该 HEAD 加原已有未提交源码为基线；snapshot 保存原状态，不能把累计增量直接套裸 HEAD。
- 后端固定交接版本：8a7ac3115cb103ad7778d77276f7464ca03c3e15。本轮未运行或改动后端。
- working 为隔离副本，另有恢复前检查点。原工作树覆盖范围 431 个文件的哈希复核无变化，见 ORIGINAL_PRESERVATION_CHECK.json。
- 新提交副本与原工作树独立，目标新分支 handoff/v5-isolated-20261116。最终提交 SHA 以 git 历史及远端核验为准。
- 未运行 Flutter/接口/功能测试、编译、分析器、格式化器，未安装 SDK。没有合并原 PR 或部署。

## 做了什么，没做到什么
已通过 Chrome 原 Figma APP V5 画布串行读取 75 个主页面编号（01–74 + 24A）与 28 个扩展状态（S01–S18、C01–C10）。
对照代码实现了不同深度的局部布局、真实入口、状态说明与少量已有交互补齐；共 41 个 Dart 文件相对 snapshot 有变化。
“原稿已读”“有独立函数”“修改过代码”均不等于页面完整实现。部分页面仅改标题/分组，既有正确状态保持不改；所有页面尚未进行 Flutter 视觉验收或业务验证。

有据的改善包括：
- 真数据的四列精选、目录/个人资料、消息气泡、商品/订单/许可紧凑布局。
- 真实预约、交付、报价、充值、评选、资料审核、制作与共创工作区的层次和入口。
- 认证通过/补件、商品退回、付款结果待核、归档只读、退款应退与已核实区分。
- 原权限与恢复路径继续沿用；删除硬编码审核费和试镜48小时说明，读取真实约定。
- 静态审阅发现的重复标题/重复成长数值已收敛。
不补造草稿、签署、客服、头像、金额、名录、统计或业务状态。

## 103 项状态矩阵
docs/collaboration/PM03_V5_FIGMA_PAGE_MAP_20261116.csv 每项指向对应交接与缺口。
S08、S12 的旧目录名与画布内容不一致，已按最新“长期模型未开放”“作品客服未开放”记录。
关键完整实现阻塞：
- S05：付款契约缺明确失败和未扣款事实，不能把 CLOSED/UNKNOWN 当失败。
- S10：缺星探恢复事件及日期，不能凭当前有效资格伪造恢复成功。
- S16：本人共创片段文件端点是否执行验收、付款、许可完整条件，仍需同事后端核实。
- 其他跨域聚合、草稿、公开名录、发票邮箱和动态阶段等见 APP_FUNCTION_CONTRACT_GAPS.csv / APP_REMAINING_GAPS_20261116.md。

## 独立 npm 视觉预览
visual-preview-v5 有 103 个目录项/renderer key；不是 Flutter App，也不连业务接口。
只有 04/05 已对原稿做独立预览校准，其余不能称逐屏视觉一致。源码审计确认103唯一显式renderer键无缺键，但广泛复用模板，28个S/C同工厂。已纠正有据的状态样例边界及S08/S12旧目录语义，未做全量视觉校准。详见 APP_PREVIEW_AUDIT.md。
本机执行 npm run dev，监听 http://127.0.0.1:4177/；服务仅本机，非公网交付。
按钮/人物/媒体/价格为展示样例，不构成真实业务成功。预览与真实 App 是两个独立产物。

## 补丁与应用
APP_V5_BATCH_CURRENT.patch：仅当前累计 App 增量，before 为 snapshot；APP_V5_BATCH_CURRENT_FILES.json 记录每文件前后 SHA256。
独立批次 patch 有的以初始 snapshot、有的以检查点或该批写前版本为基线，只作溯源，不能与累计补丁重复应用。
交接提交应以独立副本复原 snapshot 已有改动，再叠加累计增量。不要直接覆盖原工作树。
已在独立提交副本对累计补丁执行 git apply --check，静态适用性通过；41 个 before/after 哈希与完整 227 个 lib 文件一致。冻结后再核 41 个改动文件，无后续变动。
静态补丁适用性、文件哈希和 diff 审阅不等于编译或功能测试。

## 分模块记录
- APP_04_05_HANDOFF.md
- APP_ACCOUNT_HANDOFF.md
- APP_AFTERCARE_ENTERPRISE_HANDOFF.md
- APP_AFTERCARE_INVOICE_HANDOFF.md
- APP_ARTISTS_HANDOFF.md
- APP_ARTIST_STATES_HANDOFF.md
- APP_AUDITIONS_HANDOFF.md
- APP_AWARDS_HANDOFF.md
- APP_CERTIFICATION_HANDOFF.md
- APP_CHANNEL_STATES_HANDOFF.md
- APP_COMMERCE_COLLECTIONS_HANDOFF.md
- APP_COMMON_STATES_HANDOFF.md
- APP_COMMUNICATION_STATES_HANDOFF.md
- APP_DISCOVERY_MEDIA_HANDOFF.md
- APP_FINANCE_HANDOFF.md
- APP_LICENSE_HANDOFF.md
- APP_MCN_HANDOFF.md
- APP_MESSAGES_HANDOFF.md
- APP_NOTICES_HANDOFF.md
- APP_NOTICES_RESUME_HANDOFF.md
- APP_PAYMENT_STATES_HANDOFF.md
- APP_PLAZA_HANDOFF.md
- APP_PRODUCTION_HANDOFF.md
- APP_PROJECTS_HANDOFF.md
- APP_PURCHASE_AUDITION_STATES_HANDOFF.md
- APP_REDEMPTION_HANDOFF.md
- APP_SCOUT_COCREATION_STATES_HANDOFF.md
- APP_SEARCH_HANDOFF.md
- APP_SETTINGS_HANDOFF.md
- APP_STOCK_SELLER_HANDOFF.md
- APP_WALLET_HANDOFF.md

## 同事验收清单：全部待测
记录实际前端提交 SHA、固定后端 SHA、环境和同一个业务记录 ID。
1. 登录 → 最小写入 → 运营读取同一记录。
2. W11 商品/许可 → 订单 → 模拟付款 → 权益 → 播放/下载。
3. 分别审核 KEEP 与 REVOKE 售后，复核当前许可而非旧付款成功。
4. 进一步验证订单未知结果恢复、重复点击、登录失效、角色权限、撤下与旧许可、归档只读、退款到账证据。
5. 普通通告后续验证。
必须区分模拟记账/真实到账、内容确认/真实签署、申请受理/退款已到账。本清单没有任何通过结果。


## 仓库交付定位
本目录存放本批交接记录；文中 working 根目录文件名请在本目录查找。累计及分批 patch 仅为本地备份，不入仓库，实际交接以本分支真实源码 Git diff 为准。
分批文档中的“未提交/未推送”是当时历史状态；本次交付提交与远端状态以 Git 为准。源码仍未编译、未功能或联调测试，未合并、未部署。
