# 56报价节点与62新申请额度卡

仅 trade/trade_pages.dart quoteView(order:false) 的付款节点及 support/invoices.dart create&&eligibility!=null 的核对区。库外备份 已保存的本轮改前文件，保留累计已有修改。未改API/权限/恢复/计费/共享组件。

56按服务器effectiveQuote返回的实际installments逐项生成独立卡，保留每项trigger、allocations求和及原分配line_id/amount_minor折叠明细。非首款条件说明保留，无节点时全额权益说明保留。没有固定两期、比例或付款状态。order:true复用分支原样保留；未动54金额、55状态、报价接受及权益预留逻辑。

62把available_minor大金额、三态环境说明、原订单编号及原单入口、received/refunded/pending_refund/occupied四项构成和申请范围合入卡。available在顶部展示不重复底部行，字段未删除。原跳转locked及leave保护原样保留；未知恢复区、抬头纵选、填写/提交锁、附件/历史/票据不变，不加邮箱或假媒体。

节点和金额/分项采用宽度受限的Column与可选择文本，无固定高度、ellipsis或单行限制，留窄屏和大字自然换行空间。字号/间距沿既有主题，不宣称精确属性校准。依据已核原画布交接PREVIEW_55_57_62_ORDER_CANVAS，不复制示例金额或状态。

仅静态阅读与diff/hash，未功能测试、编译、格式化、渲染或提交推送。窄屏/大字/长金额、不同节点数、全额抵扣、模拟/正式/未归属环境、原恢复和提交保护待同事固定版本验证，未记通过。
