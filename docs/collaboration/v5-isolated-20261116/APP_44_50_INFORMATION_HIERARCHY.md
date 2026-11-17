# 实际 App 44/50 信息层级续补

基于 3a8c8803 与 PREVIEW_43_50_GROWTH_WALLET_CLEAR_CANVAS.md 已核原画布结构。仅调整真实数据布局，不用独立预览示例填充业务。

## 50 资金流水
wallet_pages.dart 的 _recordTile 保留 ExpansionTile、原 ValueKey、展开图标及 _recordBody。将真实类别和日期/状态作为摘要，真实 amount_minor 仍通过 v5Money，或 points 明确晶钻单位；缺值不显示金额，不造0、不猜收支正负或收入色。去掉重复类别，金额22px加粗。内容可用宽度不足300或14px字体缩放后大于20时上下布局，否则左摘要右金额，文本不设截断或固定高度。未改变账户域切换、查询、请求和恢复。

## 44 认证补材
artists_pages.dart 仅 HALO/NEEDS_MATERIAL 的既有独立审核意见移到红色补材状态卡之后、artistNextStep及facts之前；保留原reason及reviewed_at展示。旧位置排除该组合避免重复，其他状态原先顺序不变。不制造缺项清单、已完成阶段或费用数据。

## 交接与边界
已库外备份。仅源码与 diff 静态检查，未渲染、测试、编译、分析器、格式化、浏览器或推送。视觉表现、窄屏/大字/长金额及展开交互待集中交付后同事验证，不声称像素对齐。

源码 SHA256：
- wallet_pages.dart：`9dfe93f31f366726fd89d80ed8360b2d054eff561135aef7ad03fd209de7191b`
- artists_pages.dart：`f4130c1ba486c2b1da770be6ec77719ec8257b48248c35b5d2546e15e6cff657`
