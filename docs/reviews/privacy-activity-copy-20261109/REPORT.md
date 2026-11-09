# 本人反馈、发票与收藏浏览副本：开发和验证记录

2026-11-09；后端负责人 chengcongcong222。原第4/13/17组、计划A“个人资料完整提供”的增量，仍在上线前补缺与完整验收阶段。阶段范围为三类资料、八个读取分类；不新增商业产品，不把局部副本当全部个人信息已提供。

## 依据与实施补全

[甲方28号第一节](../../sources/contracts-20261029/extracted/28.md)原文：“在 App 内查看/导出个人资料、数字人资产、订单与授权记录；可申请机器可读副本。”

实施补全：将现有客服、开票与收藏浏览记录纳入现有本人副本入口；按个人主体归属过滤，公开来源每次重新核权、历史消息和票据校验存储摘要、明确范围与继续办理。不改变保留期限、票据金额、退款或旧订单条款；机构经办材料不自动当作本人私有资料。三类原业务已有，补统一取得途径。

## 已实现

- PROFILE：SUPPORT_TICKETS（本人反馈/投诉摘要）、SUPPORT_MESSAGES（面向本人的消息与附件引用）、FAVORITES、BROWSING_HISTORY、COLLECTION_SETTINGS。
- TRANSACTIONS：INVOICE_REQUESTS、INVOICE_HISTORY、INVOICE_DOCUMENTS。已签发与已替换票据按历史保存；待审核和被驳回票据不提供，开票方内部证据不出库。
- 沿用 `GET /api/v1/privacy/requests/{request_id}/account-data`，账号登录、不带机构身份头，仅本人QUERY/COPY申请且范围匹配。分页不自动办结申请。
- 历史消息按记录编号和版本排序分页；收藏浏览按序号分页。游标须属于本人所选分类；清理后的游标返回400，重新第一页。浏览复用运行配置和清理规则，关闭/删除/过期不重建，失权公开内容不返回标题城市。
- 附件只返回原业务引用，不能据此认为文件还可下载。下载沿原客服/发票接口重新校验个人身份、文件状态及权限，不提供存储地址或绕过下载保护。

接口 **0.31.43-rc.1**，数据库仍0211；新增八个响应分类，没有新增路径和表。前端按[总计划](../../collaboration/client-complete-20261028/FRONTEND_UI_AND_INTEGRATION_PLAN_20261109.md)第一包接续；认领、交付、复验尚未确认。

## 验证

[相关模块回归](regression.log)180项通过、0失败/跳过；最终分类输入保护后[专项复验](focused.log)10项通过，与180项重叠，不累计成功能数。75份实际HTTP返回见[http.json](http.json)，全部通过接口校验，另260份正例与192份反例通过；结果见[contract.json](contract.json)。所有数据为隔离随机MySQL库中的合成资料，无人工库、生产或收费调用。测试包含客服建单/受理回复、真实业务模拟订单收款后开票、独立复核和更正历史、下载模拟凭证及本人证据、越权/停用/篡改/保留边界。

最初扩展测试错误地为模拟发票附加PDF，被既有INVOICE_SIMULATION_FILE_FORBIDDEN正确拒绝；改为按原模拟凭证下载验证。附件删除场景使用错误状态DELETED，改为真实表状态ERASED。未改生产规则以迁就测试。

限制：不验证真实税务发票或供应商原件；未运行新版App/网页；机构发票反例为合成的存储边界，不是机构真实开票整链。其他个人资料、监护/活动/通知等记录仍需核对，原18组/12路线/151标准不因此关闭。前批6f54cb46页面和工具检查已成功，数据库组开工时仍在运行；本轮提交另核。

## 下一步

后端继续通知、监护、活动及隐私办理记录的本人范围和受控提供，并做匹配条款与原01/02/04/10/11/12六路线。前端沿原三个增量包及03/05/06/07/08/09六路线接续UI和整链。7类真实工程、昆山短信、经营配置、运维、OSS和发行按原8个上线包推进；外部资料仍申请，不重复索要。

复跑：在后端目录设置已有JX_MYSQL_TEST_ENV_FILE后，执行 `node scripts/test-mysql.js privacy-activity-copy privacy support invoices collections`；最终专项用privacy-activity-copy。库名随机且结束清理，脚本强制本机测试配置。接口核验在仓库根执行 `python scripts/validate_contract.py --runtime-fixtures docs/reviews/privacy-activity-copy-20261109/http.json --report docs/reviews/privacy-activity-copy-20261109/contract.json`。未新增或改变数据库迁移。
