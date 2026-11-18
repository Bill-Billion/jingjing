# 52本人结算金额卡 / 55原订单状态卡

仅改 finance/finance_pages.dart confirming() 的SETTLEMENT金额区及 trade/trade_pages.dart orderView()首卡；未修改共享widgets或全局_tradeReadPanel。库外已备份本次修改前两个完整文件，保留既有51–53底栏、54金额层级和62发票入口。

依据APP_FINANCE_AUDIT的52原画布层级及PREVIEW_55_57_62_ORDER_CANVAS的55直接画布观察。预览仅用于语义层级参考，不当作精确样式属性。

- 52：原api.owner筛选所得snapshot不变，四个原字段全部保留。将尚未付款balance_minor突出，accrued_minor/adjustment_minor/paid_minor放同一独立卡紧凑核对。明确尚未付款不等于可申请收款或到账。无本人快照沿用缺失提示，不推算他方金额、佣金或税费。原确认、权限、指纹、证据和底栏不变。
- 55：原status映射作为首卡主标题，保留全额抵扣/现货/试镜/制作的四种真实说明，原订单编号降辅助并可选择复制。其后真实主体、金额、版本、发票及其他操作原样保留。不构造完成阶段、照片、套餐或任何设计金额。
- 颜色与圆角、字号、间距沿既有AccountTheme及本地尺度选择；不是精确Figma属性校准，不称像素对齐。正文使用自适应Column，无固定高度。

仅静态差异检查与hash，无运行渲染、功能测试、编译、格式化、接口调用、提交或推送。字体缩放、长金额/订单号、不同状态、无本人快照、身份门禁与原操作仍待同事在固定前后端版本验收；未标通过。
