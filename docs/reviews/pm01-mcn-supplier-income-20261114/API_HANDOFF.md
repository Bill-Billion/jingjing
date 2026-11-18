# 机构经营看板字段接续

接口0.31.71-rc.1/0221，原GET /api/v1/engagement/mcn/dashboard；无新路由、无迁移。本轮未接页面、不代Bill-Billion认领。

- orders[].income_role为SUPPLIER或MCN，来自该订单冻结分配，不是当前用户自选角色。
- supplier_expected_minor、supplier_accrual_minor为本机构供给预期/净额应计；mcn_expected_minor、mcn_accrual_minor为经纪预期/净额应计；另一角色字段为0。
- organization_expected_minor、organization_accrual_minor为本机构在该订单的对应金额。订单总报价/实收/退款/净收独立保留，不能把订单实收当机构收入。
- 顶层新增total_supplier_expected_minor、total_supplier_accrual_minor、total_organization_expected_minor、total_organization_accrual_minor。旧total_accrual_minor继续仅经纪应计；不得把旧字段和新机构合计再相加。
- 汇总只含已核实PRODUCTION回执，沙盒/未付仍逐单可辨但不汇总；期间依据ORDER_CREATED_AT_UTC，金额为查询时订单全生命周期，非期间资金流水。truncated=true仍不能当全量。
- 员工仍需要全参与人当前委托、逐人READ_INCOME以及本笔指派；供给现货指派沿MANAGE_LISTINGS和全部艺人授权。负责人可查原历史，不回写旧合同。

个人中心FINANCE仍只展示已登记财务协议和入账项；看板为ACCRUAL_NOT_PAYOUT，不是银行余额、已打款或可提现。接口保留原经纪字段兼容；未来页面展示新机构合计须明确字段含义。非marketplace_finance来源不猜供给方应计，其他自营承制合同按原业务财务另查。
