# 机构经营接口增量

GET `/api/v1/engagement/mcn/dashboard`，原登录及X-Acting-Party不变。新增可选字段不要求旧客户端立即变更，当前不安排前端任务。

|字段|含义|
|---|---|
|person_ids|原单/购买快照参与人去重；商单旧数据取数字人关联|
|person_id|兼容字段，仅单人时填值，多人或未知为null|
|attribution_basis|AUDITION_ORDER_SNAPSHOT、STOCK_PURCHASE_SNAPSHOT、COMMERCIAL_AVATAR_LINK或NOT_RECORDED|
|business_type|AUDITION、STOCK_VIDEO、COMMERCIAL、OTHER|
|audition|无试镜为null；有时含booking_id、status、acceptance_result、accepted_at|
|acceptance_result|PENDING、ACCEPTED、DECLINED、EXPIRED、NOT_RECORDED；审计事件判断，退款后仍保留原接单事实|

按person_id筛选支持试镜订单、现货购买参与人及既有商单。日期仍按订单创建UTC左闭右开；金额是查询时订单累计款项，并非期间流水。生产回执才汇总；沙盒行可见但不计汇总，合成测试使用PRODUCTION标签也不代表真实付款。

多人订单只有一行整单金额；不得将按各艺人分别筛选后的总数相加，也不得当每人应得分账。员工需当前READ_INCOME授权、本人有效委托及实际指派；试镜识别booking_id指派，多人整单要求全部参与人可读。未新增现货员工指派接口。负责人沿原权限保留历史查看。

上限500单，truncated为真不能称完整账本。关系/指派列表沿既有口径，不随新增订单筛选改成业务结果。试镜无记录时audition为null；旧商单未知艺人不根据当前指派猜测。新字段不暴露地点、样片或拒绝理由，不改合同、结算或许可。
