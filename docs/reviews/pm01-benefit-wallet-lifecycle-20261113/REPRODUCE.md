# 复验方法

固定来源：1d1e1a52025a959fb09b80032bfd22e038077a66；本次运行：pm01-benefit-wallet-2026-11-13T09-23-13-775Z。SOURCE_MANIFEST冻结850份源码，FINAL_BACKEND为11份关联测试136通过/0失败/0跳过。未运行完整后端，不运行本机App/Web。

在正式树根目录、依照现有隔离测试环境配置JX_MYSQL_TEST_ENV_FILE后执行`node docs/reviews/pm01-benefit-wallet-lifecycle-20261113/RUN_FOCUSED.cjs`。脚本限定本机33316/jx_dev测试环境，各集成测试创建独立随机数据库，网络保护阻止真实服务。不得指向人工3490或生产。凭据只在本机配置，不入证据。

使用项目现成校验环境执行`../core/.local/contract-venv/Scripts/python.exe scripts/validate_contract_batch.py --manifest <新运行目录>/runtime-contract-manifest.json --report <新运行目录>/contract-batch.json`。默认系统Python缺jsonschema，已记录命令未进入检查，不要误用默认环境。HTTP_MANIFEST和FINAL_CONTRACT保留实际路径、摘要、1332响应数量。脚本会输出新运行目录，禁止混入旧文件充数；新运行的HEAD应另记，不能称为本次旧来源。

COCREATION_RECORDS/WALLET_RECORDS保存同房间、同权益、同账户、同订单及退款编号；它们是合成记录。初始失败文本保留，最终136已包含修正，历史/中间检查不可相加。partial-lifecycle-evidence的SHA已挂原验收六条PARTIAL，不改变原预期或正式PASS。
