# 视频商品配置后端交接

接口0.31.65-rc.1，迁移0218—0221。chengcongcong222已开发并隔离验证；Bill-Billion仍只做既有UI，本文件不代表其认领新页面。本轮未开发修补或运行本机前端。

## 操作顺序与权限

1. 沿原交易规格独审、现货销售规则及权属/内容审核流程，准备正式现货商品。新模块不创建价格、不更改许可，不替代商品生产或审核。
2. 持现有`CUSTOMIZATION_TEMPLATE_PUBLISH`权限者提交品类CATEGORY；持`SUPPLY_REVIEW_CONTENT`权限的另一人审核。提议人不能自审。
3. 提交COLLECTION，明确HOLIDAY/THEME/TEMPLATE、主题代码、起止时间、品类和1—50个已审现货商品。内容审核员不能是任一商品卖方的有效成员。集合是单独商品的运营集合，不是新增打包收银或折扣合同。
4. 提交PLACEMENT，绑定已发布集合、推荐位置代码、有效期和排序。公开列表按排序值及ID分页；不可用项目过滤后可能空页，仍应使用继续游标。
5. 修改以新版本提交，原版在新版通过审核前继续展示；发布原子替换旧版。两个并发草稿只能有一个替换同一当前版本，另一份保留待处理并返回来源基线变化。
6. 作者权限或内容审核权限均可撤下配置。来源品类/集合换版或撤下、现货下架/撤权、时间过期即时限制展示；来源变动须重新提交版本并独审。旧记录及已成交订单保留。

所有接口需要登录，不接受`X-Acting-Party`。新增/修改操作携带`Idempotency-Key`；修改、审核、撤下必须携带`If-Match`。不确定结果重试原键，读指定版本核对状态；不能用新的键猜测重发。

## 接口

|方法和路径（统一前缀/api/v1/product-catalog）|用途|
|---|---|
|POST /records|按kind、code、content提交新配置|
|POST /records/{record_id}/revisions|以content提交新版本|
|POST /records/{record_id}/reviews|APPROVE及三项明确核验，或REJECT及空checks|
|POST /records/{record_id}/withdrawals|撤下待审/已发布配置，保留原因|
|GET /records?kind=…|运营版本列表，含处理中/驳回/历史|
|GET /records/{record_id}|读取指定历史版本|
|GET /catalog?kind=…|登录用户读取可用配置；支持code、集合category_id、推荐slot_code|
|GET /catalog/{entity_id}|读取业务实体当前发布版本|

具体字段和错误响应以[统一接口](../../../contracts/openapi.yaml)为准。kind为CATEGORY/COLLECTION/PLACEMENT。所有配置标题/说明是普通文本，未知可执行字段、脚本标记和价格覆盖字段拒绝；排序值0—10000。集合/推荐时间使用规范UTC毫秒时间。

## 成交与下架边界

公开商品只返回原StockOffer中的报价、许可、商品ID及offer_sha256，不能返回原件地址或内部审核材料。消费者沿原`POST /api/v1/stock/checkout`提交商品ID和报价摘要。运营入口撤下不会单独撤销既有购买许可；商品权属撤回仍按现货原规则限制下载。不得把推荐撤下称为全渠道停售。

本轮测试用隔离账户、合成资格/已审素材和模拟支付证明；审核断言不代表合成视频通过真实质量审查，文件夹具不代表真实成片。正式运营配置、前端接入、真实服务和独立签收仍待。
