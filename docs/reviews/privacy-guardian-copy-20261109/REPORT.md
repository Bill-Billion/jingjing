# 本人通知已读和监护资料补全

2026-11-09；后端负责人chengcongcong222；原4/10/17组、计划A。接口0.31.46-rc.1，迁移0211，无新增路径/表。

## 原文与实施补全

[28号第一节](../../sources/contracts-20261029/extracted/28.md)原文：“在 App 内查看/导出个人资料、数字人资产、订单与授权记录；可申请机器可读副本。”[21号第十五条](../../sources/contracts-20261029/extracted/21.md)原文：“提供监护人绑定、使用时长设置、内容查看、消费管理、一键关闭、信息查询与删除等功能。”

本轮是资料提供的流程补全，不重新批准未成年人真实服务：原account-data新增NOTIFICATION_READS、GUARDIAN_CONTROLS、GUARDIAN_CASES、GUARDIAN_USAGE，均需本人QUERY/COPY及PROFILE/ALL范围，无机构身份头。

- 已读只提供本人个人主体的事件编号与阅读时间；组织经办、原消息内容和来源记录不混入。保留已读记录不能恢复原内容权限，原消息仍走原收件箱核权。
- 控制与案件详情每次复用当前监护核验：关系有效、双方账户和实名有效、年龄符合；失效时仅返回本人参与的摘要，detail_access明确要求有效关系，data为空。排除对方账户、证明文件、审核人员和内部审核理由。
- 控制含当前规则、设置及当天预留汇总；监护人不通过个人副本批量取儿童历史。儿童自己的GUARDIAN_USAGE提供按天留存记录，不以监护失效剥夺其本人记录；不是会话级完整历史。
- 申请、监护同意、退款审核和真实执行区分；REFUND_REQUESTED/REQUESTED不显示已退款，监护消费同意不开放付款，预留时长/金额不是实际使用/扣款。

## 实际缺陷与修复

[修复前复现](same-day-before.log)：实名有效期为同日05:00 UTC，04:00读取被错误拒绝。原因是MySQL日期字符串的空格与ISO字符串的T直接比较。guardians/context.person改用统一UTC时间格式比较，不改变期限数值；到期前可用，等于到期即拒绝。

## 验证与边界

[52项相关回归](regression.log)通过，0失败/跳过，含本轮11项专项（含外层测试计数）；[实际HTTP](http.json)共52份，通过[统一接口校验](contract.json)，278份正例/204份反例通过。成长/权益等前批证据不累计成本轮测试。隔离MySQL、合成账号和本机HTTP；监护邀请、儿童同意、独立审核、查询请求、历史模拟付款的退款申请/审核/执行请求及撤销走实际业务方法，通知已读走原业务方法；每日用量用合成记录，不冒称真实儿童使用。早期测试准备重复授予已有权限、MySQL日期格式不符已修正。

无App/网页/实体设备与供应商测试；没有调用真实付款、儿童采集或推送。退款测试只证明请求产生和显示，未以此宣称真实退款成功。监护证明原件、会话级记录、受控原消息及供应商执行仍需逐项核查。

前端负责人Bill-Billion接原第一包四分类，认领/交付/复验未确认；原三包和六路线旧交付保留。后端接着核隐私实际办理/原件与余下会话资料、匹配用途和01/02/04/10/11/12；前端UI/三包和03/05/06/07/08/09。18组有实现/局部证据、0正式关闭；151正式未结案、82局部关联；7类真实工程、昆山短信和8上线包保留。

复跑：后端配置隔离JX_MYSQL_TEST_ENV_FILE后执行 `node scripts/test-mysql.js privacy-guardian-copy privacy-participation-copy contract-six support`；根目录执行 `python scripts/validate_contract.py --runtime-fixtures docs/reviews/privacy-guardian-copy-20261109/http.json --report docs/reviews/privacy-guardian-copy-20261109/contract.json`。

沿原PR39阶段集中交付，提交和远端检查另记；未合并、部署或更新人工3490/离线APK，公网不开。
