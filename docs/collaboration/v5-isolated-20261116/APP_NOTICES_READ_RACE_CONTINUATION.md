# 通告读取代际与商单会话空态补正
范围基于当前已推送续批之后的最新文件，仅两处确证问题。
- notices_pages.load：public/records/record/new规则每个await后，先mounted/ticket，再api.check原epoch与party，最后回写publicNotice/rows/record/rules/cursor。public沿原公开读取null party；其他沿原party。catalog本来已有门禁不改。保留函数末尾校验、循环游标去重、hasRead/错误/finally原行为。
- gig_conversation：原load失败可能保留conversation并清空rows，空态新增error==null，避免错误和没有消息同时显示。未改发送、参与权限、附件或恢复。
修改前已在仓库外备份；增量补丁仅本地保留。
仅源码静态核对，未测试/编译/analyzer/formatter/联调/API业务请求/提交推送。待同事验证重叠读取、切身份/离页后返回、规则分页慢响应、会话刷新错误。
未改预览、公共发现、矩阵、共创或production。
## SHA256
- notices/notices_pages.dart: 59b85ca018caa6adb0ae1805dfc02d792fc6b14bf82e12a2d2d89f2534933c05
- gigs/gig_conversation.dart: e1251d4330ce498c52f8aa7081788cf7723aa8fa88b1610af59da7c917fc6082
