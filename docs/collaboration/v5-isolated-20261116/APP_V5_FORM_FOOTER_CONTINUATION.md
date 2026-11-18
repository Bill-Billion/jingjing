# V5Form 可选底栏实际续补
本批已实施，不再把16/17底栏列作后端或未实施缺口。未测试、编译、analyzer、formatter、启动App、commit或push。
备份与本批补丁：仓库外 库外备份。
## 实现
- V5Form新增actionInFooter，默认false。原唯一tradeButton提取内部_action，所有pending/busy/completed/canSubmit/conflict/reviewed与submit原样保留。
- V5Frame复用_forms注册，只有一个启用候选且无显式footer时承接该action。没有Frame、显式footer或多候选均回退正文。
- _V5ActionScope仅传播布局所有权，InheritedWidget在所有权切换时让表单重建，正文与footer互斥；不增加提交代理或第二业务回调。
- canSubmit/action/actionInFooter变化通过现有post-frame formChanged刷新；冲突复核checkbox补同样通知。原注册/销毁、输入、身份切换、提交finally及latest通知保留。
- 返回仍原V5Frame.leave，dirty确认、未知请求/上传锁未改。footer只转移原主按钮，不伪造保存草稿。
- 仅16 _bookingForm与17 delivery启用。18独立reviewSubmitAction不动。

## 全部调用者（27处，改前行号）
- wallet/wallet_pages.dart：312、454、545、579、848
- auditions/auditions_offer_form.dart：168
- auditions/auditions_actions.dart：538（仅delivery启用）
- auditions/auditions_pages.dart：484、568（预约启用）、688、872、913、979、998
- notices/notices_pages.dart：706、826、918、977
- notices/notices_submission.dart：287、344
- gigs/gig_conversation.dart：259、287、322、386
- stock/stock_listing_form.dart：372
- stock/stock_pages.dart：753、943
其他25调用点保持默认false。未改API、请求体、版本或业务规则。

## 静态边界与同事待测
人工读取本地定义和diff，确认构造参数/唯一原回调/注册与销毁/刷新路径。未作运行正确性声明。
首次挂载在注册后下一帧迁移按钮；布局所有权变化触发依赖重建。父级canSubmit变动通过下一帧同步footer；实际提交仍读取最新widget与内部状态校验。
待测：首帧迁移与卸载、窄屏/键盘、dirty返回、提交中返回、未知恢复、冲突读取后复核、材料数量变化、会话切换、无Frame/已有footer/多候选回退、其余默认调用无变化。不得把这些待测项写成通过。

## 保存指纹 SHA256
- stock/v5_support.dart: 54000fc7b55f89c06308d5ccfe94f64367d9e64813cc5fc0d80b1599ebc7c877
- auditions/auditions_pages.dart: b218242fcf02934cbe33265a17c829957a0893f020c497a1200b5524474ee5a3
- auditions/auditions_actions.dart: 8622b3ff866696dda07cf268b2dff91e8ef64862f610f81e6223cf0dceca2666

## 补审修正：旧footer回调防重复
submit入口新增busy/completed即时护栏；确认弹窗await之后、设置busy之前再次检查mounted/busy/completed，阻止另一路提交期间或已完成后继续。原pending、canSubmit、冲突复核、版本及body逻辑不变。
footer仍可能在post-frame同步前短暂保持旧视觉状态，但旧回调不能绕过最新busy/completed与原入口canSubmit检查。现有提交finally/latest/复核均有本表单setState再formChanged；注册/移除发生在树更新周期，后续调度沿用既有机制。没有宣称运行验证。
最新v5_support.dart SHA256: ef5c26c9d09a298a08a259f087e45bfe92d198f45c9b6c86000e163cfc4af963
