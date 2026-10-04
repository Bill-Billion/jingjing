# 首次远端CI的运行时修复

PR19首次同步ef25dbe的网页CI在 `test:finance` 报 `ReferenceError: sessionStorage is not defined`，PR20同一位置一致。测试真实SSR渲染FinanceView和会话store，却未创建浏览器存储；本机Node26默认提供sessionStorage，CI Node22.19不提供。[失败运行](https://github.com/Bill-Billion/jingjing/actions/runs/37130468822)。

已在现有 `tools/test-finance.mjs` 按仓库其他SSR测试的做法建立独立内存sessionStorage，结束后恢复原描述符；不改页面、权限、请求、依赖或测试断言。本机已有Node22.5.1先复现同一失败；修复后22项通过，Node26关闭Web Storage时同22项通过。Node22.5与CI22.19版本不同，远端复跑结果以PR Checks为准。

此前页面、构建、浏览器与后端证据保持原采集版本；这次仅补齐测试运行环境，不重新计算页面覆盖或代替共享规则审阅。
