# 复验

固定源码fbab8c2c2be18040224eaeae36b0ecf00c1f134a，配置既有隔离MySQL及媒体工具后从正式树运行`node docs/reviews/pm01-mcn-fulfilled-income-20261114/RUN_BACKEND.cjs`，再以生成的runtime-contract-manifest.json运行scripts/validate_contract_batch.py。16文件272通过、14HTTP1345响应、938源码未变。backendOnlyEnvironment与网络保护，无前端/真实服务。当前无运行时改动，新增测试延伸既有正常同单，不用源码索引代替业务执行。
