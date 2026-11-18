# 复现与限制

源码05ce5201e41aad3e684d9d3f1dfc5bb5da58154c，本次pm01-rank-boundaries-2026-11-13T17-03-16-802Z。从仓库根配置既有本机33316测试库及媒体工具环境，执行`node docs/reviews/pm01-rank-boundaries-20261114/RUN_BACKEND.cjs`，再用contract-venv Python运行`scripts/validate_contract_batch.py --manifest <本次目录>/runtime-contract-manifest.json --report <本次目录>/contract-batch.json`。一次性库自动清理。

10文件119项，7份同次HTTP584响应；独立专项7项、规则新增2项包含其中。测试时间只替换本测试进程A.now；合成资格/支付/媒体均不是真实服务。业务源码未改，无本机前端。初次调用生成脚本时工作目录误设为backend而未找到文件，改从根执行；一次AGENTS读取路径误设后已从根重读，非业务故障。首次6项与扩展13项通过为中间结果，不相加。
