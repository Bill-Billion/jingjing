# 当前完整回归的只读排查

同一exec85423仍运行，不提前发布整批结论。当前证据见FULL_PREFLIGHT_REVIEW.json，数字是中间观察，不能当终态。

|位置|已核原因/风险|准备处理与边界|
|---|---|---|
|artists-contract、artists|实际规格创建返回VERIFIED_ADULT_REQUIRED，后续托管等连带失败；artists直到后面的代传素材才准备机构身份|正常机构办事人提前实名；artists前移原准备并在代传素材时重核，避免重复建档；艺人/重复身份/未成年/无权代办断言不改|
|identity-adjacent|实际在21行准备公司规格时失败；原S.person(outsider)在后方，原本就是正常成年前置|仅前移既有准备，不新增第二份实名；后续失效/未知/年龄反例不改。与identity-admission故意无个人档案的前置不同，不混用处理|
|licensing|实际在69行作者创建正常交易规格时VERIFIED_ADULT_REQUIRED；后续授权订单/退款连带失败，含父项共4失败。原前置只准备买方身份|准备明确正常版权供给方前置；不更改授权冲突/内容和受控读取断言|
|projects、settlement、settlement-evidence-restriction|静态发现正常制作方没有身份前置，已有旧素材上传；当前尚待这三文件实际结果|准备制作方实名及其现有本人素材入口，按production已通过方式处理；历史头像仍隔离导入，项目归属/清分/追偿/限制断言不改|

七个副本仅存.local/supplier-full-pending，已node --check通过，不代表业务通过，也未修改正式测试。下一步先收同进程真实终态和完整失败原文，再决定最终应用范围；随后受影响复验和当前完整回归。无前端运行或开发，无真实服务启用、上传或合入。
