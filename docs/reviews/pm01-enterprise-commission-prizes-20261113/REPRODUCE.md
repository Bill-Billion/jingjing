# 复验

来源8f25ce893b7007dbe0463a1b25deb46e818a82b1，运行pm01-enterprise-prizes-2026-11-13T10-36-24-184Z。19份相关测试207通过、0失败、0跳过，12份HTTP响应1667份格式通过；不是完整后端。SOURCE_MANIFEST冻结852份来源。

在正式树根目录按已有本机隔离配置设置JX_MYSQL_TEST_ENV_FILE及既有FFMPEG/FFPROBE/FONT环境后，执行`node docs/reviews/pm01-enterprise-commission-prizes-20261113/RUN_FOCUSED.cjs`。脚本限制本机33316/jx_dev测试配置，每项用独立随机库，网络保护禁止真实服务；不得指向人工3490或生产。凭据不进入报告。

脚本输出新运行目录，使用现有环境执行`../core/.local/contract-venv/Scripts/python.exe scripts/validate_contract_batch.py --manifest <新运行目录>/runtime-contract-manifest.json --report <新运行目录>/contract-batch.json`。新运行记录自己的HEAD和摘要，不混用历史输出。HTTP_MANIFEST保留本次路径/摘要，新复验需重新产生文件。

FINAL_BACKEND/FINAL_CONTRACT是最终结果；INTERMEDIATE_BACKEND全量含失败和跳过，探针及首次失败只作诊断历史。两个probe脚本只用于当时旧来源复现，不是最终通过依据。七份业务记录为隔离合成资料，退款/中奖/企业订单编号可关联；四条局部证据摘要挂原验收PARTIAL，不代表正式签收。
