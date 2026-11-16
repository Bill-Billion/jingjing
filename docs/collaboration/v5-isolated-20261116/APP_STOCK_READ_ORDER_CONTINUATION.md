# 现货读取回写顺序修正
仅stock_pages.dart/load()。原catalog已在写offers前检查mounted/ticket/epoch；video/listings/listing/purchases/purchase原先先修改成员状态、随后才检查，旧请求可能污染新读取结果。
本批统一先将返回值保留在局部变量，再检查mounted/ticket及原api.check(epoch,party)，仅通过后写状态。保留原请求、最终hasRead、catch/finally、分页与权限逻辑。无新增接口或重试/付款动作。
先作仓库外备份备份。未运行测试、编译或接口请求；待同事核重叠重读、切身份、离页、分页、读取失败及私有内容不残留。源码推理不等于动态验证。
