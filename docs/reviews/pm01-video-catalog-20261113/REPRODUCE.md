# 本轮复验

来源32992412b94868249844f6534467eaebd7dd461e，运行pm01-video-catalog-2026-11-13T14-11-02-380Z；最终同版12份关联测试250项通过、0失败、1项真实旧库58表样本缺失跳过；10份同次HTTP文件1093份响应格式通过，879份冻结源码未变；不是全量，无本机App/Web。

根目录设置既有隔离MySQL及本机FFmpeg/ffprobe/字体，运行`node docs/reviews/pm01-video-catalog-20261113/RUN_FOCUSED.cjs`，随后用既有Python执行`scripts/validate_contract_batch.py --manifest <运行目录>/runtime-contract-manifest.json --report <运行目录>/contract-batch.json`。10份HTTP及同单记录只接受本次开始后生成的文件；全局88份HTTP清单未减少。

首次复验包装器要求零跳过，业务进程实际退出0、250通过/1跳过，包装器退出1未收集文件。已核对唯一跳过精确名称是旧库58表比较，保留原summary，并用CAPTURE_SAME_RUN核冻结源码后收集同一次新文件；未重跑凑数。提供的RUN_FOCUSED仅容许这一个明确旧库样本跳过，任何其他跳过仍失败，且报告原始计数；不能称旧库比较通过。真实旧库样本未提供，无实库恢复结论。

最终32992412整批重新运行，包装器退出0，已知旧库跳过仍为1；原零跳过包装器及同次捕获说明仅对应BASELINE_BEFORE_BYTES历史运行，不是最终失败。
