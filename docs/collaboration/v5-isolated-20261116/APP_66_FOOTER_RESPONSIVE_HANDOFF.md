# 66 制作任务底栏自适应

基线be9775e7。本批仅 production_pages.dart 的 _ProjectDetailState.footer。
原固定两Expanded Row改LayoutBuilder：可用宽小于340或14号字缩放后大于18时，改Column(min,stretch)；其余仍原两Expanded及10间距。
项目留言和版本审阅各只创建一次，原enabled:!locked、returned:load、currentVersion推导、locked/null禁用、openVersion回调、p为空无footer、tradeScaffold.locked全部保留。
只读确认operationCommentLink使用原tradeButton与原导航回调，tradeButton无固定宽高，纵排不需新增代理动作。
无API、权限、读取、写入或公共helper修改。未测试、编译、格式化、运行或业务请求，不称窄屏已验收。阈值为前端防挤压策略，不宣称Figma新几何值。
待同事验证：小屏/大字两按钮完整可读、当前版本为空、pending锁、留言返回重读、版本路由及返回。

SHA256 4f47529cf3226287fff3c69a76e5721fa45201768e890a2ebd4c5574c8f82c19
