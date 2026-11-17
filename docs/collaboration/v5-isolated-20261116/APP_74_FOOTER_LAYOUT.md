# 74 帮助反馈底栏最小整理

依据 PREVIEW_73_74_CLEAR_CANVAS 中原画布布局观察，结合真实 App 当前双业务分域。修改前已在仓库外备份。

- support_pages.dart：正文“反馈提交”区保留说明，移除与底栏重复的提交/记录两个按钮；底栏现有原路由主动作保留。
- support_pages.dart、tickets.dart：各自底栏 Wrap 增加 runSpacing: 8，换行后保留纵向间距。不改变横向间距或强制固定宽高。
- 未改路由目标、权限、提交逻辑、草稿/未知结果恢复、共享组件或73设置；不改收藏页。
- 此为源码静态布局整理，未运行截图、窄屏/大字号、键盘/安全区或功能验收；未测试、编译、格式化、提交或推送。未声称完整还原原稿。

## 冻结文件
- support_pages.dart：7059 → 6839 字节；SHA256 `dbbc139cc6e620207c50ab7bee7a415d372e71f493aedd510878cb49fb4b20ed`
- tickets.dart：25368 → 25383 字节；SHA256 `dd10f8601cd8c4615f2ad8903f3f41d1edebf252ec8ae408f7c6a3ba23040892`
