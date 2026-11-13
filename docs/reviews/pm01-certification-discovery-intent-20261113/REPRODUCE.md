# 同版复验

来源09dd5755718b42f72961e16f1a09e116fc12aa9b；运行pm01-certification-intent-2026-11-13T10-54-04-196Z。12份关联139通过，10份HTTP 678响应通过；SOURCE_MANIFEST记录852份来源未变。仅后端，没有完整全量或本机App/Web。

在正式树根目录按现有本机隔离配置设置JX_MYSQL_TEST_ENV_FILE和已有FFMPEG/FFPROBE/FONT后执行`node docs/reviews/pm01-certification-discovery-intent-20261113/RUN_FOCUSED.cjs`。限定127.0.0.1:33316/jx_dev配置，各集成测试创建独立随机库并阻止外部网络；不指向人工3490或生产。

使用现有依赖环境执行`../core/.local/contract-venv/Scripts/python.exe scripts/validate_contract_batch.py --manifest <新运行目录>/runtime-contract-manifest.json --report <新运行目录>/contract-batch.json`。新运行记录自己的HEAD与摘要；脚本现在一次收齐10份，历史本次补收两份的过程见REPORT。三份业务记录和CHECKS可关联实际编号；所有数据合成，真实服务/设备不代替。
