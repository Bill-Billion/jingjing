当前候选0.31.7-rc.1：新增统一六城快捷目录及四类公开关键词搜索，两个只读入口；原接口兼容，迁移仍0170。前端接法见[城市与搜索交接](../docs/collaboration/client-complete-20261028/FRONTEND_SEARCH_HANDOFF.md)。前一批机构资料、精选与机构通告分页见[公开目录交接](../docs/collaboration/client-complete-20261028/FRONTEND_DIRECTORY_HANDOFF.md)。本批接口已隔离验证，页面接入和整体业务验收仍待完成。

当前候选0.31.5-rc.1：现货真实封面与完整/预览时长，新增2个读取接口，无新迁移（仍0167）。原接口格式不变；处理工具未配置则明确不可用。详见CHANGELOG；本批页面接线与交付状态以当前进度为准。

当前接口候选0.31.4-rc.1：故事上传中断原请求恢复、可选历史保留原因、受审主肖像选择与公开媒体分类；默认附件响应兼容0.31.3前端。沿用迁移0167。验证和启用状态见本轮记录。

当前接口候选0.31.3-rc.1：新增私人故事附件与首次共创建房选择。原文字答案兼容，建房前置校验收紧；迁移0167、接线和验证见CHANGELOG。前端新控件、实际审阅和正式启用另记。

当前候选0.31.0-rc.1：首次上架、机构逐人授权和退回重提，新增6项操作与迁移0166；与页面成套获取。兼容、权限和版本保护见[变更说明](CHANGELOG.md)，测试与上传事实见[本批记录](../docs/tasks/records/CORE-client-complete-A-20261028.md)。以下按原日期保留。

当前候选0.30.2-rc.1：首次机构投稿、新公开邀约、独立公开详情与可读展示名更正。旧接口保留，无数据库迁移。接法、兼容和本机结果见 [变更说明](CHANGELOG.md) 与 [完整计划](../docs/testing/FULL_BUSINESS_CLOSURE_20261028.md)。已集中上传PR39（https://github.com/Bill-Billion/jingjing/pull/39）；实际审阅、合入和正式启用仍未完成。以下记录按原日期保留。

当前个人信息执行接口候选为0.28.0-rc.1：新增本人模型列表、授权撤回、删除申请与动作进度4项，原接口保持兼容。只覆盖已登记制作模型，不代表整体注销完成；详见[接法](../docs/collaboration/V5_PRIVACY_HANDOFF.md)。

以下为历史批次记录；当前数量和状态以上方最新候选及当前进度为准。

当前个人信息接口候选0.27.0-rc.1：437操作、571结构。新增13个账号级接口，机构身份不能代办查看；人工答复与实际删除/注销分开，具体见docs/collaboration/V5_PRIVACY_HANDOFF.md。上传与验收以CORE_CURRENT为准。

当前接口候选0.26.0-rc.1，新增样片委托/本人取片、已付参演变更和项目收入约定，共424操作、557结构。兼容变化、职责和验证见[本批交接](../docs/collaboration/V5_COMPLETION_HANDOFF.md)，实际测试与上传以CURRENT为准。下方历史版本记录保留，不代表当前接口数量。

当前接口版本0.22.0-rc.1，第9轮新增经营/推荐/成长/榜单/月冠军及第7轮会话与补差，累计353个操作、483个结构。接法和兼容范围见[第9轮交接](../docs/collaboration/V5_R09_HANDOFF.md)，实际检查/上传以CURRENT为准。正式服务未启用，模拟支付只在隔离测试脚本提供。

# 0.15.0-rc.1：第二轮集中交接候选

新增只读财务试算，共176操作/306结构。相对0.14.0-rc.3原175操作声明保持，6种旧结构兼容扩展、5种新增。关系可显式选V5供给比例；财务明细旧shares和新allocation二选一。新增可选marketplace_finance、business_gate，旧记录不补字段，旧关系不变含义。

[接法与限制](../docs/collaboration/V5_R02_HANDOFF.md)。隔离实现已测，待队友实际审阅；撮合正式收银、推荐归因、出款未启用，页面及跨端未验收。

---

以下保留此前记录，当前状态以上文为准。

# 0.14.0-rc.3：报价与财务使用同一份定制约定（本地待审）

新定制报价必须在已批准规则内有明确自营财务条款，服务器固定到报价/订单；财务不能换比例或规则。新增可选customization_finance及应计明细rounding，旧记录和算法保留。175项操作不变，3种旧结构只增加可选输出、2种新结构。付款、MCN新版撮合、推荐与跨端验收仍未完成。

[接法、分工及启用边界](../docs/collaboration/V5_R02_CUSTOMIZATION_FINANCE.md)。

---

以下保留旧版本记录。

# 0.14.0-rc.2：由商品决定交易流程（本地待审）

商品规格、报价和订单增加product_profile；分类随规格审核并冻结，服务器拒绝缺故事、混合分类和改类降级。启用TRADE_REQUIRE_V5_PRODUCTS=true后拒绝未分类新商品/新报价；此前已发报价及旧订单保留原约定。接口结构兼容旧记录，开启限制后旧客户端须补分类。175项操作不变，新增1种结构；新版其他商品流程尚未实现，定制收款仍阻断。尚未上传、获队友审阅或正式启用。

[具体接法、启用边界及前端影响](../docs/collaboration/V5_R02_PRODUCT_ROUTING.md)。

---

以下保留旧版本说明。

# 0.14.0-rc.1：平台故事报价和未付款订单（本地待审）

新增故事报价列表；原报价新增可选customization_source，报价/订单新增可选customization引用；分期新增CUSTOMIZATION_INTERIM_CONFIRMED，不能视为样片验收。平台组织配置默认空，必须同时有组织OWNER和受理岗位。新增定制收款暂阻断；旧报价和订单原规则不回写。前端需更新可选引用和节点枚举；尚未获得队友实际审阅或正式启用。

[本批详细接法和边界](../docs/collaboration/V5_R02_PLATFORM_QUOTES.md)。

---

# 本地候选0.13：补件、重新提交和历史版本

第二轮补件部分新增6个接口与10种结构，原168项操作和285种结构保持；实际已实现，但仍本地，尚未集中上传、双方审阅或页面验收。报价/订单关联尚未完成。[本批接法与权限边界](../docs/collaboration/V5_R02_SUPPLEMENTS.md)。补件草稿只有本人能看；正式回复不表示审核通过；主需求受理状态与补件办理状态分开。

---

以下为此前版本记录。

# 当前接口候选：故事保存、提交与运营受理

0.12.0-rc.1 新增8项故事接口和13种结构。共168项操作、285种结构；163项登记隔离实现，原5项未实现入口仍保留。原160项操作及272种结构保持兼容。接口候选不是已获双方批准的正式发布。

[前端如何接这一轮](../docs/collaboration/V5_R01_STORY_INTAKE.md)：八项均已接真实服务器和隔离MySQL；29项专项、99份HTTP返回格式已验证。前端页面、附件、补件报价、正式模板及真实业务仍按该页分开记录。共享格式待另一方实际审阅。

执行 `node scripts/backend-check.cjs customization` 需要明确隔离测试库；然后执行 `python scripts/validate_contract.py --runtime-fixtures .local/customization-http-fixtures.json`（使用已安装锁定依赖的Python）。`scripts/customization-sandbox.cjs` 提供可重建的合成联调资料，不能用于生产。

---

以下为此前记录，状态以各自当时版本为准。

# 页面与服务器的数据约定

当前候选0.10.0-rc.1：本阶段新增23项结算、付款凭据、发行收入和争议接口，并保留第八、九阶段全部接口。共148项操作、252种结构；143项已接隔离实现，其余5项原有入口仍未实现。自动出款未实现也未启用。旧125项操作与212个定义结构逐项核对不变。

[队友怎样接结算页面](../docs/collaboration/STAGE_10_API.md) · [分工、升级与验收](../docs/collaboration/STAGE_10_HANDOFF.md) · [实际上传和审阅状态](../docs/status/CORE_CURRENT.md)。候选格式需对方审阅，程序字段和测试通过不代表真实业务启用。

## 以下为历史版本说明

0.7.0-rc.1：新增15项制作、版本反馈、验收和数字人任务接口，共85项操作、153种结构；80项已接隔离实现，原有5项仍未实现。具体数字人供应商网络适配仍未实现，不能把任务接口存在当作真实生成可用。旧字段保持，样片/成片付款节点改为检查实际当前验收结果。详见[第七阶段页面说明](../docs/collaboration/STAGE_7_API.md)。

## 之前版本说明
0.8.0-rc.1：第八阶段新增18项商单、直接合作、佣金与榜单接口，共88项操作、161种结构。旧路径不变，仅报价增加可选commercial_offer_id及对应商业约定。候选约定待队友审阅。基于第六阶段；第七阶段制作接口仍在独立申请，合并时须保留双方定义。详见[第八阶段页面说明](../docs/collaboration/STAGE_8_API.md)。

## 以下为此前版本记录

0.6.0-rc.1：新增16项订单、支付、退款及旧单入口；旧字段保持。支付通知使用供应商签名与交易编号去重，不要求用户Bearer或Idempotency-Key；普通写入仍要求两者。报价确认使用返回的content_sha256；重复提交返回记录当前状态。付款成功与签署、制作完成分开。共享审阅及真实渠道验证待完成。详见[第六阶段接口](../docs/collaboration/STAGE_6_API.md)。

当前候选版本0.5.0-rc.1，主文件[openapi.yaml](openapi.yaml)。共54个操作，其中49个已接入独立MySQL账号API并进行隔离测试；其余5个仍未实现。具体状态见各操作的x-implementation-status及[实现清单](implementation.json)。这些是后端自验结果，不是短信供应商已开通、前端已联调或正式上线。

新增的账号API独立于旧app.js，不接受旧JWT或客户端自报角色。调用方法与环境准备见[第二阶段接口交付](../docs/collaboration/STAGE_2_ACCOUNT_API.md)。[协议细则](PROTOCOL.md) · [变更记录](CHANGELOG.md) · [旧接口映射](LEGACY_MAPPING.md)。第一阶段合并并不自动批准本次新增格式，仍需队友核对。

Python3.10或以上，先在仓库根安装锁定开发工具，再验证：

```text
python -m venv .local/contract-venv
.local/contract-venv/Scripts/python.exe -m pip install -r contracts/requirements-lock.txt
.local/contract-venv/Scripts/python.exe scripts/validate_contract.py
```

Linux将Scripts/python.exe替换成bin/python。安装需要网络，校验期间禁用外部网络。运行账号接口集成测试后可进一步核对实际HTTP返回：

```text
.local/contract-venv/Scripts/python.exe scripts/validate_contract.py --runtime-fixtures .local/account-api-http-fixtures.json
```

[示例](examples/platform.json)与[反例](tests/schema_cases.json)均为合成数据，不能拿示例令牌当作登录凭据。格式校验不替代并发、权限或供应商真实验证。

第三阶段新增两个只读内容接口，说明见[规则合同读取接线](../docs/collaboration/STAGE_3_READ_API.md)。原规则/合同文件元数据接口仍未实现，不伪造asset ID。校验实际返回时另执行`--runtime-fixtures .local/governance-http-fixtures.json`。当前仅本地集成待审第11份依赖，未推送或批准新格式。
