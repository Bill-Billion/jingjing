# 甲方浏览器测试工具

这是仅供隔离验收使用的工具，不是正式客服系统，不挂载到生产服务器。产品入口仍使用现有Flutter/Vue页面和原业务API。负责人准备好后，甲方只需链接与个人邀请码，不需要执行命令。

## 准备顺序

1. 从本轮受测代码构建。Flutter使用本仓库test/support/client_testing_main.dart，CLIENT_TEST_ONLY=true，base-href /app/，输出到App工程.local/client-web，并指定--no-web-resources-cdn。本专用入口只在运行时读取当前邀请身份，不包含任何账号令牌。普通lib/main.dart构建不加载测试入口。
2. Vue先运行npm run type-check，再运行npm run build-only -- --base /workspace/ --outDir .local/client-web，VITE_API_ORIGIN留空。同源测试启动脚本在测试服务器提供HTML时注入，不进入正式构建。
3. 设置JX_MYSQL_TEST_ENV_FILE为既有隔离MySQL配置；设置FFMPEG_PATH为本机ffmpeg路径。按需启动scripts/customization-sandbox.cjs、artists-sandbox.cjs、customization-delivery-sandbox.cjs、v5-r05-r12-sandbox.cjs。只能使用这些脚本新建的随机测试库，不读生产.env。
4. 调用node scripts/client-testing/prepare.cjs <本轮access.json路径...>。默认在.local/client-session生成私有配置及invitations.json。原目录存在时拒绝覆盖；程序接口prepare(files,{folder,campaign,origin,port})可指定新的会话目录和沿用的反馈批次。邀请按测试角色生成，交付时为实际测试人独立分配，不要群发全部角色邀请码。名称可在该批次people.json中按实际分配登记；同一邀请码不要多人共享。
5. node scripts/client-testing/server.cjs <本轮config.json>。默认只绑定127.0.0.1:3490；不自动开公网。先完成本机浏览器检查。公开HTTPS地址确定后，将origin设为精确地址并重启，反向代理只能到这个端口，不能直接公开隔离API或MySQL。
6. 测试结束在本轮config.json同目录创建stop文件。工具关闭会话，反馈继续保留。各隔离业务资料用自己的stop文件清理，确认其status.json中的database_removed和credentials_removed均为true。不要停止共用MySQL。

## 业务资料关闭后继续处理问题

node scripts/client-testing/review.cjs <批次名>生成独立问题工作台配置，默认127.0.0.1:3491、1小时，仅反馈负责人身份可进入。按输出配置路径启动server.cjs即可。配置没有业务账号或目标服务，即使业务库已清理仍能查看、处理及导出反馈。此入口也不自动开放公网。

记录只允许一个进程写入。正常退出会释放writer.lock；意外终止后须先核对原进程已退出，再移除该单个锁文件，不能删除records.json或清空整个批次。生产使用的MySQL规则没有改变；JSON原子持久化只用于本机低并发测试记录，不能直接当作正式客服数据架构。

## 验证

- node --test scripts/client-testing/portal.test.cjs：无外部依赖，检查鉴权、隔离、去重、版本冲突、截图、代理绑定、失效关闭、重启和离线问题处理。
- browser-check.mjs：实际故事App/运营网页与反馈闭环，需要.local/client-session-verified中的本轮私有配置和构建。默认Edge，可用CHROME_PATH指定本机浏览器。
- route-check.mjs：同一私有会话下逐个打开测试入口；只读检查不代表每条完整业务验收。

首次脚本诊断失败、测试版本、已知限制和最终记录见docs/testing/CLIENT_BROWSER_TESTING_20261025.md。真实手机号短信、真实支付和生产部署没有随本工具授权。
