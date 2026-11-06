# 前端接续：本人副本、机构批量、推荐

2026-11-06；后端负责人chengcongcong222，前端负责人Bill-Billion。接口0.31.39-rc.1；在0.31.38上兼容新增4个接口，迁移0210/0211仅新增批量任务及逐项结果表。业务提交f950966a已集中发布原PR39，本机验证通过；新远端检查已排队，最终状态以PR头为准；认领/交付/复验未确认。既有六路线及隐私申请页面不重做。

## 1. 本人副本：扩展已有接续工作

沿[原副本交接](PRELAUNCH_COPY_HANDOFF_20261106.md)，加`GET /api/v1/privacy/requests/{request_id}/account-data`。不带机构身份头；QUERY/COPY申请本人可读。按section和申请范围：ACCOUNT、PREFERENCES、ARTISTS需PROFILE；WALLET、FINANCE需TRANSACTIONS；FINANCE_AGREEMENTS需CONTRACTS；ALL覆盖上述。每页最多100，next_cursor原样保存，FINANCE游标是十进制字符串，不转JS数字。ACCOUNT/PREFERENCES不分页。

显示清楚“已取得哪些、还缺哪些”，不把NOT_CONFIRMED显示完成；WALLET每条是记录，不可把所有amount直接加成余额；FINANCE可为负数，单位分；清分协议为脱敏副本，源摘要与副本摘要分开，不假称签署。机构经办单与机构钱包不混入本人副本。

验收：同一申请各section逐页重开、保存副本；换账号/范围不符拒绝；偏好默认关闭；模拟/正式标识保留；断网不自动结案，403/503不显示空清单。既有素材、故事、交易副本接法一并继续，不拆成另一套隐私流程。

## 2. 机构批量：新页面接入工作

`POST /api/v1/engagement/mcn/batches`：身份头X-Acting-Party、原Idempotency-Key，body为items，最多20项。每项key唯一且不超过64字符，action与input按OpenAPI；input不可自带party_id或operation_key。

|动作|输入|成功表示|
|---|---|---|
|ARTIST_LISTING|person_id、avatar_id、原listing资料|艺人展示提交审核，未自动批准|
|STOCK_LISTING|原现货上架输入，包括选定的销售规则/权利资料|现货已提交，未自动上架|
|PRICE_REVISION|record_id、expected_version、unit_minor|生成待审新版规格；审核后再用原修改上架流程，不显示已生效|
|MCN_ASSIGNMENT|booking_id或order_id二选一、account_id|原经纪业务分派成功，受逐人权限约束|
|PRODUCTION_ASSIGNMENT|record_id、expected_version、assignee_account_id、reason|制作负责人分派成功|

`GET /api/v1/engagement/mcn/batches/{batch_id}`查询结果，不产生业务动作。只允许发起账号和当前有效机构权限；每一项重查艺人/目标权限。页面必须逐项显示：SUCCEEDED提交成功；REJECTED业务拒绝并说明原因；RETRY_REQUIRED先查原批次再恢复；NOT_RUN未执行；UNAVAILABLE当前无法查看原结果，不能断言历史失败。COMPLETED只表示本批各项提交成功，未代审核。

断网后保存账号/机构/原键/原始items，先GET；再恢复时POST原完整内容及原键，后端跳过已有成功项、重试其余项。**不要删掉成功项后沿用原键**，会409；改内容应另建明确的新批次。登出、切身份时隔离本地待恢复信息，不自动重放。

验收同批包含允许、无权、旧版本和无效负责人；确认有效项已提交、失败项有原因；刷新/两次点击/丢响应不重复派单；撤权后历史结果隐藏；调价不改旧订单。当前默认仅创建者重开，不新增他人审批权。

## 3. 推荐：新入口连接，原搜索保留

`GET /api/v1/discovery/recommendations?kind=ARTIST|STOCK|AUDITION|NOTICE`，兼容city/q/limit/cursor，不带机构身份头。每条items为`{item:原公共目录对象,reasons:[原因]}`，原卡片取item，不重新复制数据库字段。个人设置仍用已有隐私偏好personalization；默认false。后端再次核权和公开状态。

原因翻译：RECENT_PURCHASE_CITY“与你近期购买内容的城市相关”；RECENT_BROWSING_CITY“与你近期浏览内容的城市相关”；PUBLIC_CATALOG“公开内容”。算法版本CITY_ACTIVITY_V1、最多500个目录候选；catalog_truncated时保留“查看更多/搜索全部”，不能说搜索已穷尽。首版是城市关联，不展示伪造匹配率，不改变价格或既有榜单。

关闭后显示普通公共目录。偏好或候选变化导致409 RECOMMENDATION_CHANGED时从首屏重新读取，避免死循环；不能继续把旧个性化缓存当新结果。切账号清旧结果。验收默认关闭→主动开启并留下有效浏览→同城靠前→关闭恢复普通结果；已撤回内容不可见；已付款现货参与而未付款不参与；相同商品售价始终相同。

## 交付方式与限制

本批后端20项专项、154项受影响模块检查通过，54份真实HTTP结构已逐字段检查，详见[报告](../../reviews/prelaunch-independent-20261106/REPORT.md)。同版隔离合成资料；前端记录原生/网页各自预期、实际结果和同组记录编号。共享规则仍须实际互审，集中原PR39，不另开逐项申请，不合入/部署/启用真实服务。

前端三个工作包建议按本人副本→机构批量→推荐推进，认领后在EXPERIENCE_CURRENT登记，不把本交接当已认领。后端继续剩余个人协议、条款对账及原六路线，不等待页面停止独立工作。
