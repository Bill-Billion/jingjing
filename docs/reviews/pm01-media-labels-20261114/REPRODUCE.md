# 复验

在正式树根提供既有隔离MySQL配置与JX_TEST_FFMPEG/JX_TEST_FFPROBE/JX_TEST_FONT，运行 `node docs/reviews/pm01-media-labels-20261114/RUN_BACKEND.cjs`。入口使用backendOnlyEnvironment与网络保护，不运行前端；输出本次冻结源码、检查与新鲜HTTP副本。再以contract-venv执行scripts/validate_contract_batch.py，manifest为本次runtime-contract-manifest.json。

本轮7文件80项，4HTTP/125响应。媒体17项包含4个新增场景组；实际FFmpeg合成视频两变体、真实私有读取方法与内存存储，不是真实OSS/供应商；未借旧全量结果。修前13/4的UTF-16LE日志按原字节保存。
