# 同版复验

来源188fa0e316a98f103a24b2be6e15b703144d8ffc，接口0.31.61-rc.1/0214，运行pm01-support-assignment-2026-11-13T11-32-21-843Z。最终同版14份关联测试文件，206项通过、0失败、0项跳过；同次9份HTTP文件801份响应格式通过，856份冻结源码未变。最终为关联回归0跳过，中间全量仍保留4失败/1跳过原记录，不等于完整正式验收。

从正式树根目录设置既有隔离JX_MYSQL_TEST_ENV_FILE、JX_TEST_FFMPEG/FFPROBE/FONT，执行`node docs/reviews/pm01-support-assignment-20261113/RUN_FOCUSED.cjs`，限定14份关联文件，不加任何Web/App配置。测试配置限定127.0.0.1:33316/jx_dev，各测试创建独立库并用网络防护；不指向3490或真实服务。

脚本按运行开始时间核9份HTTP及2份业务记录新鲜度并收集到该运行目录；再用既有Python环境执行`scripts/validate_contract_batch.py --manifest <该运行目录>/runtime-contract-manifest.json --report <该运行目录>/contract-batch.json`。HTTP_MANIFEST记录本次实际文件哈希。业务记录另外按相同新鲜度收集；新运行保留自己的HEAD/源码清单，不伪称本次编号。
