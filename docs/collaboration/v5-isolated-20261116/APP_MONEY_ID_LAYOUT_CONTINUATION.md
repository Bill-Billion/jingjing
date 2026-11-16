# 长金额与完整编号最小布局修正
仅wallet_pages.dart/_recordTile和finance_widgets.dart/financeIdFact，其他helper布局未改。
- 钱包列表：原amount_minor优先、points其次判断及v5Money原样；完整金额移入受宽度约束subtitle，不限行不省略，trailing只保留原箭头；原ExpansionTile key/children和展开行为保持。
- 财务编号：默认尾号和原复制完整id按钮保持，新增用户主动展开的完整SelectableText(id)。不改变ID、不增加日志、上传或分享动作。
修改前两文件备份至仓库外备份；本批patch同目录。
静态比对仅上述两个方法。未测试、编译、analyzer、formatter或运行App，未提交推送。待同事核长金额/负值/大字体、展开与编号选择复制；不称已验证。
## SHA256
- wallet/wallet_pages.dart: 2629b791b0c0dda885ad3811b83e6f028f82475e7fc75e526d6cd487d1b35474
- finance/finance_widgets.dart: 1728dd07bfbfa51c8ae0d738e314994caf1b3eb574da67f64d18906fc8564afd
