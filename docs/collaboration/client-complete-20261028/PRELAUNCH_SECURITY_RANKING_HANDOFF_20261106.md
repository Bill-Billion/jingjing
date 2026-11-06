# 本人登录/换号副本与榜单规则：前端接续

后端负责人 chengcongcong222；前端负责人 Bill-Billion。接口0.31.41-rc.1/迁移0211，原PR39集中交付；本批认领、页面交付和复验未确认。保留原三个工作包：本人副本、机构批量、推荐与榜单；已交付旧六路线不重新派工。

## 1．本人副本：在原页增加两类资料

已有本人COPY/QUERY申请，范围PROFILE或ALL时调用：

`GET /api/v1/privacy/requests/{request_id}/account-data?section=SESSION_RECORDS&limit=30`

或 `section=PHONE_CHANGES`。分页继续带服务端 `next_cursor`，不要自行构造。请求只用本人登录，不传机构 `X-Acting-Party`。接口仍为 `getPrivacyAccountCopy`，完整结构以 contracts/openapi.yaml 为准。

- 登录记录：`copy_ref`仅用于副本定位；不能作登录令牌。显示 `authenticated_at`（空值写“历史记录未记载”）、`expires_at`、`revoked`和`current_status`。会话有效不等于用户此刻在线。
- 换号记录：显示 `old_phone_mask/new_phone_mask`、`current_status`、`object_version`、时间；不索取或导出完整手机号、验证码、密文和会话凭证。
- 两类都明确“系统当前保留的记录，不是全部历史”；`history_complete=false`、`credential_material=EXCLUDED`。返回列表不能把申请改为已办结，空列表不等于从未登录/换号。
- 会话已清理导致 `INVALID_CURSOR` 时，提示记录已变化并重新从第一页加载；其他503明确读取失败，不显示空列表冒充无记录。退出账号清除缓存；切机构不扩大本人申请权限。

验收：先本人申请，再分页、刷新、返回；旧时间为空正确说明；不同账号及机构拒绝；已有游标被清理后明确恢复；副本中找不到令牌/完整号码。后端合成案例见本轮报告，页面仍须自行同版验证。

## 2．推荐与榜单包：运营规则接最新合同

运营新建 `POST /api/v1/engagement/rules` 的 `rule` 增加 `ranking_contract_policy: CONTRACT_20261029`；新合同艺人规则权重固定 `[3000,2500,2000,1000,1500]`，等级系数固定 `[0,10000,13000,16000]`（L0占位不变，L1—L3对应1.0/1.3/1.6）。新页面展示合同含义，不能仍让运营任意输入后显示保存成功；其他合法字段及原独立审核保持。

现有运营表单在 `frontend_ops_workspace/src/business/engagement.ts`，原页面能用，不需整页重做。历史无此标志的规则展示其真实值，不把旧记录改成新值。创建人不能自审；批准失败时保留原表单及请求编号。

`RANKING_CONTRACT_POLICY_REQUIRED`：提示需要选择最新合同规则；`RANKING_CONTRACT_RATE_MISMATCH`：提示权重/系数与合同不一致并校正新草稿。不是重试付款类错误，不生成新的重复请求。服务端切换配置由后端管理，页面不直接改环境。

公开榜单目前是 `personalized:false`，不要把关闭个人推荐做成强行改变公共排名或隐去全榜。本人参与榜单授权沿已有机制；公共规则解释还将由后端补接口，不要求页面读取内部规则表或订单证据。

验收：新规则固定值、异常提示、独立审核、旧规则原值展示、断网原键恢复；正式切换及成交到榜单同记录需双方共同验证。没有更改机构批量包的接口。

## 共同版本与交付

后端本轮160项模块检查、最终15项专项（重叠）和46份HTTP通过；不代表页面已接或整链完成。前端在自己的分支按本批共同版本接两处增量，提供提交、页面入口、同记录步骤和结果；后端组合复验后再安排人工。不得把接口上传写成已认领。

[原三个包](PRELAUNCH_INDEPENDENT_HANDOFF_20261106.md) · [原文/证据](../../reviews/prelaunch-security-ranking-20261106/REPORT.md) · [下一步](PRELAUNCH_NEXT_TASKS_20261106.md)

本阶段代码提交 afea76a511b7d68706fce15d8ade9086dfe96f47 已集中上传原PR39，远端分支和PR头均已核实。服务器、App/网页、甲方测试工具三组远端检查已启动，尚无全部最终结果；本回执随阶段同步，最新检查以PR当前头为准。前批3d3014e8三组成功不能代替新检查。未合入integration/468df28a或部署；本批接法已发布，前端认领/交付/复验未确认。
