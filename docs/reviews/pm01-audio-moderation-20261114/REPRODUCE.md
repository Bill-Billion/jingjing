# 复验与限制

正式树根配置隔离MySQL与JX_TEST_FFMPEG/JX_TEST_FFPROBE/JX_TEST_FONT，运行 `node docs/reviews/pm01-audio-moderation-20261114/RUN_BACKEND.cjs`。入口使用纯后端环境与外网保护，冻结并核对源码，捕获同次HTTP。再以contract-venv对输出runtime-contract-manifest.json运行validate_contract_batch.py。

本批7b0f75f0，14文件135项、6HTTP/143响应。新增13项含6单元与7集成（含父测试）。实际FFmpeg合成音频与FFprobe，SDK客户端为本机替身、私有存储为内存，准入验证只写一次性测试库，不代表真实供应商可用或语义审核质量。失败TAP为PowerShell原UTF-16LE字节保留，最终日志为UTF8。
