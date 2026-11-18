# 复验方法

正式树根执行`node docs/reviews/pm01-governance-audit-20261114/RUN_BACKEND.cjs`及`node scripts/check-data-governance.cjs`。无需真实供应商、数据库或前端；自动创建隔离临时资料并清理，网络保护和源码冻结检查启用。16工具检查，19依赖、12数据流，57缺政策引用、5项未找到直接引用。

工具源码712b33f8，业务接口0.31.73-rc.3/0222不变。本轮无新HTTP输出。BEFORE_FIX.tap为2通过13失败，AFTER_FIX.tap为15通过，最终新增保留非合规声明的正例后16通过；前两文件UTF-16LE原字节，最终UTF-8。
