# 41 试镜设置主动作底栏接入

## 依据与范围
基于 e1784379 后的现有源码，修改前已在仓库外备份。41 公开设置语义的历史观察见 APP_AUDITIONS_HANDOFF.md；该记录不包含底栏精确几何。本批沿用既有 V5 单一主操作底栏模式，属于现有布局能力接入，不声称取得新的原图证据或完成整页像素验收。

仅在 auditions/auditions_offer_form.dart 新方案 V5Form 和 auditions/auditions_pages.dart 已发布方案公开设置 V5Form 各增加 actionInFooter: true。原两个表单所在 V5Frame 未设置自定义 footer，各场景仅一个主表单候选；无共享组件修改。

## 现有机制与业务边界
stock/v5_support.dart 已有 V5Frame 单一主表单选择与底栏接管，V5Form._action 使用原 pending、busy、completed、canSubmit、conflict/reviewed 门禁与原 submit；正文在底栏接管时不再重复输出主按钮。多个候选或自定义 footer 时沿现有安全回退。此前“共享表单缺少底栏出口”的历史观察已被后续实现覆盖，本批只使用现成功能。

新方案仍是“提交本版试镜方案独立审核”，不等同立即发布。已发布方案仍是“保存试镜公开设置”，只提交 public_booking/public_price 到原 visibility 路径并使用原版本。原未知请求仍显示“恢复原请求核对”，不新增提交代理、草稿保存或假预览。人物、资格、同意、表单确认、原 pending、离页保护及所有请求/解析逻辑均保持不变。

## 静态差异及待验
两个 Dart 文件分别只增加一行参数。41 已有 SwitchListTile，不重复改开关；本批不改16/17、总矩阵或总摘要。

仅阅读源码、查看文本差异与计算文件哈希；未运行测试、编译、analyzer、格式化、业务请求或浏览器。底栏实际显示、窄屏/大字号/键盘、安全区、成功后状态与未知请求恢复交同事集中验证，不宣称运行通过。未提交或推送。
