# 本批复验入口

业务ea5df2a0699c81960fb4c260cf37ad82927cb386，接口0.31.59-rc.1/0212；正式树worktrees/client-testing。运行backend-acceptance-2026-11-12T11-01-15-707Z-e0d00a。

- 已有本机隔离数据库配置：相邻full-flow树.local/mysql/runtime/test-env.json，仅127.0.0.1:33316/jx_dev。不要换成生产连接。
- 六组专项：recharge-refund-api、recharge-refund-recovery、recharge-refunds、privacy-guardian-copy、privacy-account-copy、privacy-execution.integration.test.cjs，共67项通过。另跑contract-six.integration.test.cjs的7项监护/合同回归，共74项；首次误写不存在的guardian.integration文件名没有形成这组检查，最终明确以contract-six独立结果为准。
- 从backend_server运行node --test及上述文件，配置JX_MYSQL_TEST_ENV_FILE；NODE_OPTIONS加载scripts/test-network-guard.cjs。所有资金回执为规范化合成数据，材料为合成字节。
- 全量从仓库根运行node scripts/run-backend-acceptance.cjs --profile all，清除外部NODE_OPTIONS与JX_INDEPENDENT_FULL_UI/JX_INDEPENDENT_WEB，JX_PM01_STOCK_WEB及JX_PM01_NOTICES_WEB为0；沿用已有ffmpeg/ffprobe和arial.ttf。没有本机前端运行。
- summary.json必须result=PASS或PASS_WITH_SKIP、exit_code=0、FAIL=0、missing_files/changed_sources/artifact_errors为空。唯一旧库对比跳过单列；不能拿新建库迁移通过当真实旧库升级完成。
- scripts/runtime-contract-manifest.json现含76份HTTP输入。本次运行结束后检查每份文件mtime不早于开始时间，复制到固定运行目录，重新核源码哈希；同时收集退款HTTP、恢复监护及原充值三份同次业务记录。
- 契约检查用相邻core树.local/contract-venv/Scripts/python.exe运行scripts/validate_contract_batch.py。等待最终result=PASS且elapsed_seconds存在，不采用中间“尚未完成”报告。
- 上传前核full_business_check、acceptance_progress --check、acceptance_work_queue --check、audit_requirement_trace --check、collaboration_check --render及git diff --check。本批另验24项登记反例、7项批量契约工具测试；历史验收状态不改。

当前13个HTTP操作属于后端接入，不构成前端页面验收。外部可信回执/发送不存在路由，真实处理器仍未注册；维护者阶段末审阅，未自动合入或启用。

