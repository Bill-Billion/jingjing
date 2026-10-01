# iPhone真机安装与验收记录

2026-10-01，用户连接iPhone并要求安装当前图册版App。当前源代码为 `ux/pr14-pages / a424d24`；此次没有推送、合并、部署或修改业务代码。

## 实际结果

- 系统USB已识别iPhone；用户说明此前未信任电脑，按新的连接状态重新检查后，Flutter仍只列出macOS和Chrome。
- 当前开发工具目录是 `/Library/Developer/CommandLineTools`。常用安装/下载目录、系统索引和应用启动服务均未找到完整Xcode，`devicectl`不可用。扩大文件名搜索也未返回Xcode应用或安装包，但部分无关目录不可访问，不能断言所有磁盘位置都没有。
- 钥匙串代码签名检查为0个可用开发签名身份，尚未配置个人或团队签名。
- CocoaPods已从官方RubyGems安装到任务忽略目录，`pod --version`实际返回1.17.0。Homebrew的重复证书链接和Ruby后置步骤错误未通过修改证书或信任其他软件源解决；改用可运行的Ruby与官方gem安装。工具依赖新增libyaml0.2.5/Ruby4.0.7，OpenSSL升级至3.6.4_1；没有修改用户Shell配置或系统开发工具选中路径。
- App Store的Xcode搜索页首次加载与一次重试均失败。已打开[Apple官方下载页](https://developer.apple.com/download/applications/)，实际停在Apple账号登录；未输入账号凭据或接受许可。

**当前尚未构建或安装原生App，真机页面与操作检查未运行。** [脱敏环境记录](evidence/iphone-readiness-20261001.json)只证明上述准备与阻塞，不能当作真机通过证据。

## 继续条件与检查范围

先定位已有完整Xcode，或完成官方下载安装及初次打开初始化，再配置本人可用的开发签名。完整工具、设备信任和签名就绪后，从同一工作分支构建安装；手机联调还需手机可达的隔离测试接口地址，现有Mac的127.0.0.1地址不能直接用于手机。

原生检查覆盖首页、五主入口、登录/身份、作者作品表单、许可与绑定、合同和受控阅读；重点记录字体换行、刘海/底部安全区、键盘避让、滚动与返回、系统文件选择和前后台阅读清空。每项运行结果及真机截图另行追加，未运行不计为通过。

环境准备使用任务内SDK和Pods，后续命令采用任务路径：

```sh
export PATH="/Users/yanghaoran/Code/jingjing-pr11-pages/.local/tools/ios-tools/bin:/Users/yanghaoran/Code/jingjing-pr11-pages/.local/tools/flutter-3.47.5/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin"
flutter devices --machine
pod --version
```

依赖放在忽略的 `.local/tools`，不上传SDK、gem或原生构建产物。[Flutter官方iOS准备说明](https://docs.flutter.dev/platform-integration/ios/setup) · [当前图册版交付](README.md)
