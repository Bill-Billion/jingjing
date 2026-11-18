# 本轮复验

来源bf8c18db785f5da747d13db7d67b3cb90701f9b2，运行pm01-archive-scope-2026-11-13T12-54-44-527Z。最终同版6份关联测试149项通过、0失败、0跳过，7份同次HTTP文件766份响应格式通过，868份冻结源码未变；本次不是完整全量，无本机App/Web。精确文件和摘要见SOURCE_MANIFEST。

在根目录设置既有隔离MySQL环境，执行`node docs/reviews/pm01-conversation-archive-scope-20261113/RUN_FOCUSED.cjs`；自动开启网络防护，不启动App/Web。再用既有Python执行`scripts/validate_contract_batch.py --manifest <运行目录>/runtime-contract-manifest.json --report <运行目录>/contract-batch.json`。只取开始后本次产生的7HTTP和时序记录，不能用旧文件补数。

统一清单已有87份，本次只复跑7份；前0c831612的86份/7014响应和1740完整后端是修复前基线。当前同版源码未变，不宣称重新完成全量。
