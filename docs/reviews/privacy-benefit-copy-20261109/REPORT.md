# 本人成长、佣金与奖励资料补全

2026-11-09；后端负责人chengcongcong222。原4/14/17组、计划A本人资料；本阶段六分类接入原account-data接口，不增加商业规则。

[28号第一节](../../sources/contracts-20261029/extracted/28.md)原文：“在 App 内查看/导出个人资料、数字人资产、订单与授权记录；可申请机器可读副本。”

流程补全：把系统已持有的成长/星光、推荐佣金、权益领取/抽奖、已审核排期/本人补救和抵扣记录提供本人。按个人主体、申请范围、分页和字段白名单读取；不导出机构经办、对方账户、随机票号、供应商证明或审核底稿。历史规则保留，未配置星光不发放，计提不等于到账，奖励过期仍能取得历史，但不获得新的使用权。

接口0.31.45-rc.1，迁移0211，无新增路径或表。成长用PROFILE范围，其余五类用TRANSACTIONS，ALL亦可；只允许本人的QUERY/COPY申请，不带机构身份头。副本不代表原件或隐私申请已办理完毕。

## 验证

专项初验10项通过，随后[146项相关回归](regression.log)通过，0失败/跳过，专项包含在回归内；[实际HTTP](http.json)记录65份，均通过[统一接口校验](contract.json)，274份正例/200份反例通过。实际业务方法生成成长、审核库存、兑换和补救申请/独立复核，随后使用真实本机HTTP取得副本。佣金、星光明细、抽奖、排期和抵扣部分使用合成存储边界资料，不冒称这些业务完整链条已验。隔离随机MySQL；无真实供应商、收费、生产或公网。

前端接原本人资料包，六分类接法写入前端总计划；认领/交付/复验未确认。旧前端交付保留，不重复派工。后端继续通知阅读/监护详细材料、隐私实际执行/供应商原件、匹配对账及原六路线；其余七类正式工程、昆山短信和八个上线包仍按总计划。18组有实现/局部证据、正式关闭0；151正式未结案、82条局部证据关联，不是151未开发功能。

本阶段按原PR39集中交付；未更新人工3490或离线APK，未合并或部署。提交与远端检查结果另记。

复跑：后端目录配置隔离JX_MYSQL_TEST_ENV_FILE后运行 `node scripts/test-mysql.js privacy-benefit-copy privacy-participation-copy engagement redemption wallet`；根目录执行 `python scripts/validate_contract.py --runtime-fixtures docs/reviews/privacy-benefit-copy-20261109/http.json --report docs/reviews/privacy-benefit-copy-20261109/contract.json`。
