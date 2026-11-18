# 62 开票原单入口去重与54–62静态复核
基线a5be9c13。未重新取得订单组清晰原画布，本批仅依据现有源码可证实的动作重复，不猜新视觉。
support/invoices.dart：创建态已有底栏“核对原订单”，正文又有“核对原订单与付款”。仅将正文入口限制为非创建态；创建态继续使用原底栏，路径同为invoiceBusinessRoute(widget.orderId)，原leave和locked保持。非创建态正文入口不变。
确认提交仍为底栏唯一主动作，createSubmitLocked及submit未改；附件、原订单、返回申请列表、读取、未知恢复与版本均不变。没有新增签署、到账、开票成功或邮箱能力。
只读检查trade_pages.dart：cashierFooter已有窄屏/大字纵排；报价接受、已形成订单及付款返回动作在底栏，无证据要求重复改动。contracts/contract_page.dart标题与规则行已有Expanded。未据此声称54–62所有状态均已审核。
已库外备份；仅静态diff阅读，未功能测试、编译、运行App或提交。finance并行改动不属本批。
