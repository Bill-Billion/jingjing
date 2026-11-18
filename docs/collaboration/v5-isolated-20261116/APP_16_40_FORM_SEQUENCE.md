# 16 / 40 真实表单顺序调整

## 依据与范围
按此前已读 V5 16 的人物、用途/时间/场地、价格及确认层级，和 40 的正式媒体/独立预览、商品许可、逐人授权/证据层级，调整实际 App 已有组件顺序。只修改三个文件，不修改独立预览或矩阵。

## 共享插槽与默认行为
V5Form 新增可空 beforeField 回调，默认 null，参数为原字段、values、change、enabled。字段循环中以 list spread 插入回调返回的 UI，再渲染原 Padding 字段。未传参数时 null-aware spread 不增加任何元素；原扁平 children 序列及 extra 尾部顺序不变，没有新增 wrapper、key 或控制器。字段校验、dirty、busy/pending/completed、版本冲突、恢复与 footer 逻辑均未修改。
静态搜索仅以下两个页面传入 beforeField。回调仅构建现有 UI、读取已加载值，不执行 API 请求；原上传操作仍只由用户触发原 _StockUpload，原 set/enabled 原样传递。

## 16：auditions_pages.dart，_bookingForm
原独立价格区整体移到 adult_confirmed 字段前。实际顺序为人物方案摘要、用途说明与原时间/场地/用途字段、真实价格或未公开状态、原成年确认、原安全核查动作。价格金额、说明完全沿用 o.raw，未新增报价。owner 权限、时段范围校验、恢复和回跳未改。没有联系人新字段、草稿、直接付款或新确认项。

## 40：stock_listing_form.dart
- publication_id 字段前插入原媒体与独立预览面板，只有一个 _StockUpload。
- city 字段前插入原已审商品与销售许可面板，仍由选定 publication_id 查已有 publications；无选定版本时不造价格。
- 原尾部 extra 只保留权利证明、材料核对与许可边界，不重复上传器。
- 原 formKey、previous/version/restore、beforeSubmit recheck、全部字段、资格、参与人去重、正式与预览分离、上传恢复及锁均保留。
- 人物资格选择继续前置，未为了视觉隐藏业务前提；没有原稿封面上传、可任填售价、草稿能力。商品名称和价格仍来自已审版本。

## 未扩展页面
30 已有单行目的、说明、附件及联系边界。31 已有三类型选择、真实目标/授权、说明与私有材料。37 建档与后续材料/服务流程仍分步，未把原稿上传控件伪接至建档接口。本批不改这三页。

## 静态核对及待测
已库外备份三个原文件，完整阅读局部 diff，并搜索 beforeField 调用点。未运行测试、编译、analyzer、格式化或浏览器，不声明 Flutter 视觉验收。待同事检查16公开/未公开价格、40选版/上传及原未决操作恢复、窄屏大字布局；亦需回归未启用插槽的原表单。未提交推送。

## 冻结 SHA-256
- `lib/stock/v5_support.dart`: `86cadd03b154ca649162cd8cb8426e2c80fec9dc0ff79b972bba4e408524d9c4`
- `lib/auditions/auditions_pages.dart`: `ad7a214bc7aac7fbaf602268db12cdd0d19e93ff67c9669cb0875f8f7c039665`
- `lib/stock/stock_listing_form.dart`: `f48dac8434fdf1ec83165e241f6c9c7d6b2c3ff0238b217654533b6339ee30eb`
