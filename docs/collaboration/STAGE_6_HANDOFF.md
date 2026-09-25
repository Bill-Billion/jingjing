# 第六阶段交付、外部条件与故障处理

本阶段交付报价、订单、支付宝/Apple核验、退款和旧单依据保留。仅后端已实现并在隔离环境检查；共同审核、前端联调与真实启用仍待完成。

新增MySQL迁移0041–0049，保持原迁移不变。新增TRADE_REVIEW和TRADE_REFUND权限，真实人员未授权；应通过已有受控授权命令按组织批准记录配置，不能由页面勾选自获权限。商品/报价/退款/旧单审核均排除创建者及买卖方所属机构成员。两种权限分别负责商业材料核验和退款审核执行。

升级前在隔离副本执行原有迁移命令，确认已有数据保留，再跑trade和licensing测试。MySQL DDL不是完整事务回滚；失败时按迁移工具记录定位失败编号，保留前面已成功的表，不直接删除数据库或修改已执行迁移。回退代码须评估新记录已被使用的影响；本轮不执行生产升级或回退。

## 外部条件

运行时使用TRADE_ALIPAY_和TRADE_APPLE_专用变量，不能靠旧演示配置启用新支付。

- 支付宝：ENABLED、APP_ID、MERCHANT_ID、MERCHANT_PARTY_ID、PRIVATE_KEY、PUBLIC_KEY、NOTIFY_URL、CONFIG_REVISION；通知地址必须HTTPS。网关由运行环境固定选择，不接页面传入地址。
- Apple：ENABLED、BUNDLE_ID、APP_APPLE_ID、MERCHANT_PARTY_ID、PRIVATE_KEY、KEY_ID、ISSUER_ID、ROOT_CERT_PATHS、CONFIG_REVISION。ROOT_CERT_PATHS为JSON路径数组，证书来自Apple官方PKI；不同环境独立校验。商品须配置Consumable、人民币价格，并和每个付款节点的商品编号一致；不能用最后一笔收据猜订单。
- ENABLED须为true且必需配置完整；仍需已有外部服务状态表记录对应环境的验证证据。PaymentProvider / alipay或apple / order_payment，环境SANDBOX或PRODUCTION。config_revision由环境与当前完整配置计算SHA256；只记录摘要，不打印配置或密钥。密钥、收款主体等变化后必须重新验证。
- 正式商业合同、收款主体、渠道权限、Apple商品及App审核、真实签约实名、通知地址部署和真实付款退款测试尚未具备，不得凭本地通过改成正式可用。

支付宝使用既有官方SDK，查询/退款均开启validateSign，通知验RSA2及商户。Apple使用锁定版本3.1.0官方服务端库，校验证书/JWS、Bundle、环境、商品、订单令牌、金额、币种、数量和交易类型；无生产失败转沙箱。测试中的可替换对象只在服务器测试构造器传入，HTTP无法选择。

参考：[支付宝官方Node SDK](https://github.com/alipay/alipay-sdk-nodejs-all)、[Apple官方Node服务端库](https://github.com/apple/app-store-server-library-node)、[Apple证书](https://www.apple.com/certificateauthority/)。这些说明支持接入方式，不能代替本项目真实渠道验收。

## 出错后怎么处理

- 提交超时或进程中断：保留UNKNOWN/SUBMITTING和原支付/退款编号，先调用核对接口。查询失败不改变到账事实。不能新编号重发扣款；不能直接改数据库为成功。
- 重复通知：同一支付平台交易只记录一次到账，同一退款只记录一次退款。不同交易真的扣了两次，则保留两笔事实并把订单转人工核对，不能隐藏第二笔资金。
- 付款迟到、订单已取消或许可预留过期：保留真实收款，标记人工复核；不自动重启过期许可。按合同决定退款或重新签约，本阶段不提供绕过核验的一键放行。
- 退款：申请与批准只保留意图；支付宝核对确认后才记退款。Apple以已验证完整退款为准。退款撤销、部分撤销、家庭共享等不支持结果转人工核对，不擅自恢复许可或改写旧事实。
- 旧单：原记录、原金额、证据和报告的付款状态保留。VERIFIED_REFERENCE_ONLY仍不是渠道入账。完整旧库迁移仍需脱敏样本、身份匹配和迁移核对，在原迁移任务中继续，不擅自把登记材料当迁移完毕。

## 范围边界

此处收付款记录为订单事实；平台分账、佣金结算、打款和财务对账仍由后续相应阶段完成。没有新增微服务、队列产品、通用竞拍或多层分销。制作验收由第七阶段提供可信结果，当前尾款条件默认拒绝。

[页面调用说明](STAGE_6_API.md) · [待审共享改动](CCR-013-orders-payments.md) · [本轮证据](../tasks/records/CORE-S3-001-stage6-20260925.md)。
