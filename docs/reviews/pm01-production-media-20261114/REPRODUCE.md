# 复验与限制

正式树根配置隔离MySQL及JX_TEST_FFMPEG/JX_TEST_FFPROBE/JX_TEST_FONT，运行 `node docs/reviews/pm01-production-media-20261114/RUN_BACKEND.cjs`，再使用contract-venv对输出runtime-contract-manifest.json运行validate_contract_batch.py。纯后端环境与外网保护，源码冻结并核对，同次新HTTP记录。

本批a80c1e61/0.31.73-rc.1/0222，21文件232项、11HTTP/1120响应。新增12项含新链10项（含父项）与两个既有集成新增回归。FFmpeg真实处理合成素材，身份/付款/审核/私有存储仍为合成；无真实供应商、无前端。MySQL新库实际执行0222，未借此声称真实旧库升级/回退。首次测试辅助函数覆盖process、首次修后像素阈值与规则摘要资料错误均保留原日志；修前23通过11失败含后续级联。
