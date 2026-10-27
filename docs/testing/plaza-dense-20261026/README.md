# 紧凑广场最终检查

2026-10-27。设计与逐页实拍入口：[图册](../../ux/plaza-dense-20261026/index.html)；问题和双方下一步：[总报告](../../reviews/plaza-dense-20261026/REPORT.md)。

- [CHECKS.json](CHECKS.json)：最后源码的普通main.dart与专用隔离身份网页构建、现有CI声明范围的Dart分析、597项实际Flutter测试全部通过，0跳过。70个隐藏加载事件未计入测试数量。普通与专用构建哈希分别保存。
- [main-build.log](main-build.log)、[fixture-build.log](fixture-build.log)、[ci-analyze.log](ci-analyze.log)：最终检查输出；应用不新增运行依赖。
- [API/浏览器检查](api/README.md)、[覆盖表](api/COVERAGE.md)：36组行为按实际运行选取，逐行有bundle哈希与PNG来源；末次只改入口短标签，因此复验相应P06/P07三宽，其余引用b95等原通过证据。原失败、脚本校准和真实撤权复核保留，不冒称单次自动化全绿。

## 复现

在Flutter工程目录运行当前`.github/workflows/pr11-frontend-checks.yml`中声明的`dart analyze`与`flutter test`范围。当前工作分支已经把`lib/plaza`、`test/plaza`、子页布局和恢复测试纳入同一检查。构建命令：

```sh
flutter build web --release --no-pub --no-wasm-dry-run --no-web-resources-cdn
```

专用身份入口必须加`--dart-define=FIGMA_RESTORE_SYNTHETIC_ONLY=true --target=test/support/figma_restore_browser_main.dart`，由本轮只绑定127.0.0.1的fixture服务装载临时身份；普通main.dart没有引入它。真实HTTP合成库、复现命令及清理说明见API目录，不提交访问文件或依赖/构建输出。

本机SDK为3.47.5。一次额外的广范围`flutter analyze`曾在分析服务启动阶段出现JSON消息截断，未修改SDK；随后使用项目原有CI的`dart analyze`命令正常通过。最终结论以实际CI声明范围为准。没有重测运营网页的未改页面，也没有把合成图/色条、原生真机、正式素材质量或真实支付写为已验收。
