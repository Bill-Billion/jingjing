# 完整回归失败与正式测试前置修复

exec85423已真实退出1，222文件结果{'PASS': 2134, 'FAIL': 29, 'SKIP': 1, 'TODO': 0}，961冻结文件未变、无缺文件。完整失败原始输出在failed-full，未收旧接口文件冒充本次完整接口证据。真实58表旧库未验证继续保留。失败数包含父项和前置未完成的连带失败，不等于同数量业务缺陷。

|文件|本次失败数|处理|
|---|---:|---|
|artists-contract.integration.test.cjs|1|正常服务商户在规格创建前补实名，原艺人/未成年/重复身份反例不动|
|artists.integration.test.cjs|16|前移既有机构身份准备；后续代传素材重核当前身份，避免重复建档|
|identity-adjacent.integration.test.cjs|1|只前移原正常身份准备，所有后续失效/未成年/未知态反例保持|
|licensing.integration.test.cjs|4|版权供给方正常交易规格补实名前置，原授权冲突/限制断言不动|
|projects.integration.test.cjs|1|正常制作方实名前置；其本人素材使用现有本人入口，历史头像仍隔离导入|
|settlement.integration.test.cjs|1|正常制作方实名前置；其本人素材使用现有本人入口，历史头像仍隔离导入|
|settlement-evidence-restriction.integration.test.cjs|1|正常制作方实名前置；其本人素材使用现有本人入口，历史头像仍隔离导入|
|operations.integration.test.cjs|1|运营/发布演练的正常供给方补实名前置；权限、备份恢复和付款断言不改|
|release.integration.test.cjs|1|运营/发布演练的正常供给方补实名前置；权限、备份恢复和付款断言不改|
|organization-merchandise-batch.integration.test.cjs|1|目录前置已实名，机构批量测试不重复建档，直接核实当前身份；原授权与改价断言保留|
|privacy-transaction-copy.integration.test.cjs|1|交易副本测试的个人供给方与平台producer是不同账号；补正常个人供给方实名，原钱账和副本权限断言保留|

本轮只修改上述11个正式测试的明确正常准备，不修改运行时、接口或迁移，接口仍0.31.78-rc.11/0225。原身份/权限、未成年、钱账、重复/未知付款、素材归属、限制/撤权和恢复断言保留；公共身份辅助函数不变，不将个人档案建立改为自动忽略重复。所有修改已在完整进程终态后应用，修后业务验证尚未运行，不能预告通过。

下一步运行这11个受影响文件，收9份同次HTTP和2份同次额外证据，再执行当前222完整后端；候选材料与原草稿PR39集中同步在实际通过后进行。无前端运行/开发、无真实收费/生产/公网、无合入。
