# 将新报价切换到20261029合同

负责人：后端chengcongcong222；页面Bill-Billion。以下是发布步骤，未在当前网站执行。

1. 同版前端支持接口0.31.16-rc.1的付款枚举、工作日条款、空小时和明确截止时间；先完成隔离测试。前端未接好时不能只切后端开关。
2. 在现有规格管理中创建新版本，保存SCRIPT_BEFORE_INTERIM、acceptance_hours=null、acceptance_working_days=5及有来源的acceptance_calendar；时长、价格、修改次数、权属和取消约定仍逐项明确，不用未批准数字填空。新规格经过另一位有权人员审核；不要原位覆盖旧规格。
3. 日历候选见 calendars/CN_2026.json，来源见同目录README。只覆盖2026年，跨年不能猜测；新年度由后端继续维护官方来源和版本。正式规格所用日历必须经独立审核，本机文件存在不等于已发布。
4. 在全部同版HTTP服务配置 CUSTOMIZATION_CONTRACT_POLICY=CONTRACT_20261029 后统一启动。默认未填仍为LEGACY_COMPATIBLE，供历史环境兼容；空值或其他字符串拒绝启动。沿用现有平台承制方主体配置，不能使用旧河南账号冒充昆山主体。
5. 用隔离测试账号确认：旧规格新报价409；未批准的旧报价审批409；新版完整报价成功；此前已批准的旧报价仍按原承诺确认；旧订单继续付款/交付。新规格缺工作日日历或日历不覆盖时拒绝，不能换请求键绕过。
6. 核对服务版本、全部实例配置及新旧页面后再开放新报价入口。不改历史快照，不直接删旧规格，不批量取消旧报价。若回退需暂停新报价并核对影响，不能仅切回旧模式后继续对新客户使用旧条款。

本说明不授权生产部署、真实付款或收费服务。甲方网站当前未更新，真实服务仍关闭。开关只决定新报价/审批准入，已有订单始终按冻结规则执行；不是全站数据迁移。

独立检查：使用本机隔离MySQL配置运行 backend_server/test/customization-contract-cutover.integration.test.cjs；纯规则运行 test/working-calendar.test.cjs；完整制作运行 test/customization-delivery.integration.test.cjs。具体命令与本批证据见任务记录。

现货准入补充（0.31.17）：本批现货新交易门槛随该版后端生效，不受CUSTOMIZATION_CONTRACT_POLICY开关控制；该开关只管定制报价。应先核对新资格提示与合成认证资料，再更新测试网站。旧已购不重写；新购即使来源是旧商品，也冻结新准入版本。详情见[现货接法](../collaboration/client-complete-20261028/STOCK_ADMISSION_HANDOFF_20261102.md)。

## 艺人认证和免费基础服务（接口0.31.18）

1. 先完成App/网页对空spec_id、空托管到期、免费服务单独入口、分类材料和WITHDRAWN/FAILED状态的接入及同版测试，不只改显示价格。
2. 平台主体配置必须为经确认的当前签约方；现有ARTIST_PLATFORM_MERCHANT_PARTY_ID无效时拒绝办理。合成测试用虚构平台，不冒充昆山真实经营资质。
3. 以新版本发布人工审核商品：HALO_REVIEW、价格1000分、HALO_APPLICATION、halo_level=2、rule_version=CONTRACT_20261029、failure_policy=REVIEW_FEE_NON_REFUNDABLE。其余字段沿旧规格结构，经独立审核后发布。不用商品规格系统发布零元创建/托管商品；免费服务有单独的版本化快照和接口。代做样片1000元不混入本商品。
4. 同版HTTP服务设置ARTIST_CONTRACT_POLICY=CONTRACT_20261029后，新购买只接受新审核规格；免费创建/托管走free-services。默认LEGACY_COMPATIBLE保留历史环境，不等于新要求已生效；空值/未知值拒绝启动。当前运行网站未改此配置。
5. 验收旧收费订单继续原价、原交付和原退款条款，新免费申请不建现金单、不扣晶钻，10元新审核不可常规退款。未结束的旧创建单不被免费申请覆盖；补件沿用原费用，另一次正式申请需新服务。
6. 免费托管权益永久不收费，实际存储仍按当前私有本地配置；不能显示OSS已开通。免费创建只是受理基础档案，交付须本人有效授权、图片及声音文件和独立运营记录；长期模型继续NOT_ENABLED。后续真实建模有权限、服务配置及实际验收后才可声明可用。

这批未更改历史付款、已审核旧申请、旧合同快照，也未启动真实收费、AI或云服务。新流程字段和错误说明见ARTIST_CONTRACT_HANDOFF_20261102。
