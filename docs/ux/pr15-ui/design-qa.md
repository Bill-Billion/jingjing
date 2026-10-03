# 第15份：原图册与真实页面对照

2026-10-02。视觉基准固定为原图册 `acd5f99 / design/full-ui-20260929/manifest.json` 最终图片；原图未修改。本批18张参考视图已有设计，采用同一组字体、留白、卡片、边框、图标和操作层级接入真实接口。

|页面组|图册最终视图|实现与实际截图|
|---|---|---|
|App订单与报价|APP-13-01-v2|报价/订单/旧记录分组、状态和真实金额；[列表](evidence/screenshots/pr15-app-orders-mobile.png)|
|App报价确认|APP-11-01|返回标题、双方、分项、规格折叠、付款节点，底部安全区确认；[报价](evidence/screenshots/pr15-app-quote-mobile.png)|
|App保存合同|APP-11-02-v2|未签署提示、保存信息、中文报价/节点摘要、完整合同折叠；[合同](evidence/screenshots/pr15-app-contract-mobile.png)|
|App订单详情|APP-14-01-v2|原报价与合同、已核实财务事实、付款及关联许可入口；[订单](evidence/screenshots/pr15-app-order-mobile.png)|
|App付款和结果|APP-12-01-v2、APP-12-02|约定渠道、金额、服务端状态、未开放客户端与避免重复办理提示；[付款](evidence/screenshots/pr15-app-payment-mobile.png)、[未知结果](evidence/screenshots/pr15-app-unknown-recovered-mobile.png)|
|App退款|APP-31-01|关联原付款、原条款折叠、逐项元金额、原因、提交确认；[表单](evidence/screenshots/pr15-app-refund-form-mobile.png)、[申请结果](evidence/screenshots/pr15-app-refund-requested-mobile.png)|
|App旧记录|APP-13-01-v2及同类详情|原99/4901元、原报告状态、不能追认到账提示；[历史记录](evidence/screenshots/pr15-app-legacy-mobile.png)|
|网页规格及审核|WEB-09-02、WEB-09-04-v2|分组横向标签、主动填写商业值；左侧原规格、右侧独立决定；[规格表单](evidence/screenshots/pr15-web-spec-form-desktop.png)、[审核](evidence/screenshots/pr15-web-review-specifications-desktop.png)|
|网页报价及审核|WEB-13-01-v2、02、03、04|列表、两列报价表单、多行与逐项分期；买方确认及独立审核各自办理；[列表](evidence/screenshots/pr15-web-quotes-desktop.png)、[表单](evidence/screenshots/pr15-web-quote-form-desktop.png)、[审核](evidence/screenshots/pr15-web-review-quotes-desktop.png)、[确认](evidence/screenshots/pr15-web-quote-confirm-desktop.png)|
|网页订单与付款|WEB-14-01、WEB-15-01-v2|订单保存条款、付款节点和财务事实分组，后续办理紧接摘要；[订单](evidence/screenshots/pr15-web-order-desktop.png)、[付款建立](evidence/screenshots/pr15-web-payment-create-desktop.png)、[未知付款](evidence/screenshots/pr15-web-payment-unknown-desktop.png)|
|网页退款|WEB-15-02-v2、WEB-15-03-v2|原付款读取、逐项分金额、原因；左侧申请右侧审核，独立执行在下；[申请](evidence/screenshots/pr15-web-refund-form-desktop.png)、[审核](evidence/screenshots/pr15-web-review-refunds-desktop.png)、[结果](evidence/screenshots/pr15-web-refund-result-desktop.png)|
|网页历史依据|WEB-15-04-v2|原明细、条款和私有原件；历史核对与到账分开；[登记](evidence/screenshots/pr15-web-legacy-form-desktop.png)、[核对](evidence/screenshots/pr15-web-legacy-reviewed-desktop.png)|

App暖白铜橙内容页；管理网页浅色深绿工作台、220px侧栏和64px顶栏，规格/合同/技术编号默认折叠。原值完整保留；订单与退款里的已知合同字段使用中文显示名称，不改请求或内容指纹。

## 实际适配与检查范围

- App从订单内确认具体节点后建立付款记录，再进入结果详情。真实客户端SDK尚未启用，图册中的付款按钮不能替换成虚假扣款动作。
- App订单合同来自 `ORDER.data.contract`。已成交报价和规格用中文摘要，完整原始约定保留在折叠区。示例昵称、价格、时间、统计数和商业默认值没有补进实际页面；只有真实主体编号时显示编号。
- 管理网页审核保持左侧原资料、右侧决定及理由。合同及长规格折叠，避免操作被长文本推到页尾。真实接口要求更多字段时允许页面更长；不声称逐像素复制参考图。
- App采用390×844、320×693视口，表单/详情没有底栏；返回主壳后五项入口保留。管理网页采用1440×1000桌面、390×844窄屏，窄屏变单列，所有菜单保持可见；窄屏布局是适配方案。
- 截图来自最终Flutter Web和Vue生产预览，经正常短信登录与真实隔离HTTP/MySQL加载。根侧实际查看关键报价、合同、付款、退款、历史、审核及窄屏截图。接口数据与正常点击检查另见[验证记录](ui-checks.md)，图片覆盖和文件指纹见[页面清单](page-plan.json)。

手机视口验证不代表iPhone原生验收。合成支付传输不代表真实渠道、SDK或商户资质已验证；未开放制作、验收、结算页面不计为开发完成。
