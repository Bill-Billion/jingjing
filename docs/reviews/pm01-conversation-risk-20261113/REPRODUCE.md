# 同版复验

来源0c831612c9eeeb3bed573b43e76c51eefc383c33，运行backend-acceptance-2026-11-13T12-23-51-061Z-608691，接口0.31.63-rc.1/0217。最终同版完整后端1740项通过、0失败、1项跳过；86份同次HTTP文件7014份响应格式通过，867份冻结源码未变；无本机App/Web。源文件摘要、精确测试文件和跳过原因见SOURCE_MANIFEST及FINAL_BACKEND。

根目录设置既有隔离MySQL及FFMPEG/FFPROBE/FONT环境，执行`node scripts/run-backend-acceptance.cjs`，默认all开启网络保护且不启动App/Web。测试新建随机隔离库并清理，禁止换成真实库。按开始时间收集scripts/runtime-contract-manifest.json的86个HTTP文件及本批两个会话记录/通告记录，复制到本次运行目录后用`scripts/validate_contract_batch.py --manifest <本次目录>/runtime-contract-manifest.json --report <本次目录>/contract-batch.json`验证；不能用旧文件补缺。

真实旧库样本未提供的对照仍跳过，其他失败或源文件变化不能计通过。初次路径错误未启动测试，不是一次通过；其后30项成功和最终完整结果分别保存。
