来源78f07c2971e502c8a6c2076967be60b66947e648；最终同版15份关联测试243项通过、0失败、0跳过，8份同次HTTP文件1506份响应格式通过，868份冻结源码未变；不是全量，无本机App/Web。

在根目录设置既有隔离MySQL与本机FFmpeg/ffprobe/字体环境，运行`node docs/reviews/pm01-mcn-income-controls-20261113/RUN_FOCUSED.cjs`；只接受本次开始后新写的8份HTTP。随后用既有Python执行`scripts/validate_contract_batch.py --manifest <运行目录>/runtime-contract-manifest.json --report <运行目录>/contract-batch.json`。不运行本机App/Web或真实服务。

全局87份HTTP清单不减，本轮只复验上述8份。15份测试准确名称与冻结摘要见SOURCE_MANIFEST；不借此前完整1740作当前全量。
