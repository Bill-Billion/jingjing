# 原文、实施补全与本轮边界

[00号用户服务协议第二条](../../sources/contracts-20261029/extracted/00.md:23)原文：“用户须使用真实身份信息注册。浏览可使用基础功能；发布、交易、创建数字人前须完成 L1 实名认证（免费）。”映射ACC-DEL-02.01及PM01 W01/W10/W11，沿既有年龄与机构代办模型，不增加光环收费，不改变旧合同快照。

实施补全：实际登录账户的实名与被代理艺人/机构资格分开；重放办理请求也过当前实名门禁。原文没有逐字列员工或重复请求算法，这些是实施解释，不能当作原文引用。历史读取及可信付款事实保留，不能借实名过期抹去已收款。

改动是artists.repository的createVariant/submitListing、works.repository的createAvatar、trade.repository的stockCheckout/preparePayment及stock.context的买方实名复用。旧个人已有artist_people时仍导向艺人流程；机构兼容入口仍需实际办事人实名，不把它升级为完整现代数字人托管交付。sellerEligibility只返回艺人资格，本轮仅静态核清，未新增查询功能。

新增45项测试中形象版本用LOOK；同实现的VOICE没有单独新增全组合。现货付款准备调用真实业务仓库、可信到账通过模拟供应商结果直接应用；其他指定办理使用实际HTTP。没有付款页面、真实KYC/资金或完整年龄规则已验的结论。

历史资料变更：gigs、production、projects、settlement、settlement-evidence-restriction、privacy-actions共6文件7个旧头像准备改为test/helpers/historical-avatar.cjs隔离导入。原后续断言保留；supply真实新建/审计失败回滚仍由已实名机构办事人运行。该test-only导入不用于产品运行时，不证明真实旧库迁移。
