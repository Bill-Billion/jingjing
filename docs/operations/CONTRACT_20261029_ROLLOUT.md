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
