# C05/C06 公开机构目录读取态补正
只改public_discovery.dart/_DirectoryState，不改09搜索State、API、Gate、媒体权限或其他模块。
1. clearFilters原先在城市/关键词变化时只清rows而不发请求，空态却称没有资料。新增hasRead，仅本次成功目录响应后置true；非追加读取开始/clearFilters置false。未读且无错误时提示点击查找，只有实际成功读取后才显示空结果。
2. 机构通告读取错误原noticeError与空列表同时显示“没有公开通告”。空态新增父读取结束及noticeError==null条件，保留原错误与原重试按钮。原401/403/404/409清rows/notices逻辑不动。
先备份，增量patch位于仓库外：库外备份。
仅静态核对条件与load/loadNotices/clearFilters流，无测试/编译/analyzer/formatter/业务请求/commit/push。待同事验证条件修改未查找、成功空列表、一般错误、权限失败、追加分页。
SHA256: 5d029a13974b7ca88396272c0929478c68a9126ea19c3b8a22fc53d289cee24d
