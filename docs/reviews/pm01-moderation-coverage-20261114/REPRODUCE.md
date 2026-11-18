# 复验与限制

正式树根配置隔离MySQL与JX_TEST_FFMPEG/JX_TEST_FFPROBE/JX_TEST_FONT，运行 `node docs/reviews/pm01-moderation-coverage-20261114/RUN_BACKEND.cjs`。入口使用纯后端环境与网络保护，捕获同次HTTP。再以contract-venv对输出runtime-contract-manifest.json运行validate_contract_batch.py。

本批d6fa71f2，12文件122项、5HTTP/136响应。新增16项含7单元+9集成（含父测试）。SDK客户端为本机替身、媒体音轨由真实FFprobe读合成视频；准入验证只写一次性测试库，不代表真实供应商可用。独立音频仍拒绝。修前UTF-16LE日志按原字节保存。
