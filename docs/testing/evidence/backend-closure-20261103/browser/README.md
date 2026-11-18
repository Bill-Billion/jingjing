# 当前构建网页复验

21组消息、业务留言、审计和报表检查通过，77项菜单入口检查无404。构建摘要与同记录编号见原始web-browser-results.json。原生App未在本轮重跑。

完整截图保留在本机.local/backend-closure-browser20/screenshots；本目录仅分发下列三张代表图，原报告其他截图路径属于本机证据，不宣称均已上传。

- [pr20-web-notification-detail-desktop.png](screenshots/pr20-web-notification-detail-desktop.png)
- [pr20-web-comments-390-narrow.png](screenshots/pr20-web-comments-390-narrow.png)
- [pr20-web-report-390-narrow.png](screenshots/pr20-web-report-390-narrow.png)

第一次环境准备缺少已有ffmpeg路径，未执行页面检查；补路径后重新构建和21组全跑通过，结束后API、网页和随机数据库已清理。旧检查日志混入启动失败输出的工具问题已修复，8项检查通过。
