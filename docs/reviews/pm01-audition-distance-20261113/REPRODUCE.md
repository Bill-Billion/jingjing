# 同版复验

来源a1a7b2222594c61325c465289b625dd8471b5f98，接口0.31.62-rc.1/0215，运行pm01-audition-distance-2026-11-13T11-49-38-500Z。最终同版12份关联测试102项通过、0失败、0跳过；10份HTTP文件498份响应格式通过，861份冻结源码未变；未跑完整全量或本机App/Web。12测试文件和冻结摘要见SOURCE_MANIFEST。

根目录使用既有隔离MySQL和本机FFMPEG/FFPROBE/FONT环境，执行`node docs/reviews/pm01-audition-distance-20261113/RUN_FOCUSED.cjs`。脚本开启网络防护、禁本机App/Web，按开始时间收10HTTP与业务记录。再用既有Python运行`scripts/validate_contract_batch.py --manifest <运行目录>/runtime-contract-manifest.json --report <运行目录>/contract-batch.json`。正式统一清单84项，本轮10项含已存在可选交样选项文件，不能声称全84重跑。

所有用户、授权、资格和格点均合成，测试创建并删除独立随机库。旧全量/前批成功不替代本次关联结果。
