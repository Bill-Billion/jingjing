# 64 官方设计局部对齐与65空态修复

基线7bbd84b2。依据协调者提供的官方 Figma context.txt + reference.png（64 node4016:10955），已读技能及完整上下文、查看参考图。仅两个源文件；未测试/编译/格式化/业务请求/运行截图，未提交推送。

## 65 确证修复
projects/project_pages.dart：原 !busy && rows.isEmpty 改为 !busy && error == null && rows.isEmpty。读取失败不再同时宣称没有参与项目；分页/恢复/API/权限不变。未猜测65几何。

## 64 本页实现
customization/customization_page.dart 的 _StoryEditorState：
- 28/36标题、12/18眉题、18顶部间距、内容横边20；官方画布背景#101513。
- 独立 _editorTheme 继承AccountTheme.data，局部输入深底#1c2420/12圆角/12内边距、14/22文字、12/18标签；真实品类卡保留原选择条件和回调，用原稿选中#293a22、强调#b9f34a。
- 原多重深卡嵌套（整模板卡+每字段卡）改原模板标题+全宽原field组件；未删模板字段、必填/错误信息、控制器、附件或上传绑定。
- 草稿前说明收为个人定制与多人共创另办两说明卡，不制造模式切换；当前办理真实状态保留。
- 底部平台对接卡16圆角#202c23，采用原稿静态说明，并保留先保存后上传、非即时交付/不自动授权与分享边界。
- 底栏原唯一保存/提交按钮：48最小高、12圆角、138:202比例、10间距、20横边，保留小屏大字竖排。保存个人草稿改“保存业务草稿”；提交制作需求改“提交给制作专员”。补充草稿/重提标签不变。

## 功能核对与有意保留
load/save/retry/choose/leave/confirm/compareCurrent 等业务方法未改。pending、locked、conflict、submissionAvailable及allows条件原样；原PopScope/离页确认/身份清空/上传恢复/表单ValueKey原样。AccountTheme只封装Theme(data)，因此局部Theme继承原data不删额外运行逻辑。
原图人物、雨巷示例、90秒偏好均为动态业务数据，未塞示例或假阵容。正式故事后才能开房的既有条件不变；附件仍用原 StoryAttachmentPanel，不把上传图标造为上传成功。原多类型动态模板并不等于原稿固定三字段，因此内容高度未声称1:1；材料组件/复杂审核错误态仍沿原UI，未改共享组件。
同事待验证：各模板字段长文、必填、选择、附件保存上传恢复、补充请求、版本冲突、未知结果、离页、大字窄屏以及真实两个底栏动作。全部未运行。


## 冻结SHA256
customization/customization_page.dart: 7d440536314bcc11772aeedab110b1dd72bd348d88a77a87716c304f153c63ba
projects/project_pages.dart: dfb398b320b7d77ba39a879f0cc37193db262c937b25e7ad978c1cb7d2897c91
