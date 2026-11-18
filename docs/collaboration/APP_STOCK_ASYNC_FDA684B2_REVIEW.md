# 现货/许可静态续审（基线fda684b2）
只改stock/stock_pages.dart；修改前已在仓库外备份；增量补丁仅本地保留。
- 媒体onOpened原仅mounted，可能将整页重读前结果回写purchase/opened。现捕获渲染时ticket/epoch/party，读取前后均核对及当前orderId；原api.purchase/bytes/权限检查不变。
- checkout与purchaseAction新增入口busy及确认await后busy守卫，阻止已有确认链在另一提交进行时重入。不改变许可checkbox、报价/版本、pending恢复及API。
- 已存在load先核验再回写不重复修改。未修改许可reader到期/后台清空逻辑、收藏/足迹入口、上架API或共享播放器。
仅源码可达风险修正，未实机复现；未测试/编译/analyzer/formatter/网络请求/提交/推送。没有宣称全部11/14/15/39/40/71/72已验收。
