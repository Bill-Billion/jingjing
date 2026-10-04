# 远端CI的浏览器存储环境修复

继承[PR19财务测试修复](../pr19-ui/ci-fixes.md)。本地关闭Node26 Web Storage时，operations SSR测试同样复现 `sessionStorage is not defined`；因此在原 `tools/test-operations.mjs` 使用独立内存存储并恢复原描述符，所有原断言保留。

已有Node22.5.1修复后22项通过，Node26关闭Web Storage同22项通过；CI Node22.19的结果由原PR Checks确认。仅修改测试运行环境，真实UI、权限、CSV、后端和依赖均保持原版本，旧浏览器证据不冒称重新执行。
