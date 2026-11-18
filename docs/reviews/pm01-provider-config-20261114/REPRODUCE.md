# 复验方法

正式树根设置既有隔离库JX_MYSQL_TEST_ENV_FILE，执行`node docs/reviews/pm01-provider-config-20261114/RUN_BACKEND.cjs`；使用本地contract-venv运行scripts/validate_contract_batch.py，manifest取本次输出目录。网络保护和纯后端环境强制启用，禁止App/Web。冻结源码836a3b07，10文件137通过，5HTTP/239响应，接口0.31.73-rc.3/0222。

修前两测试文件13通过3失败，初修后三文件40通过；原TAP是UTF-16LE，最终TAP为UTF-8。合成供应商/验证授权不等于真实服务验证。旧SMS手填版本故意不自动迁移，需重新核验实际摘要。
