# W18 充值退款运营网页接入（源码交付，未验收）

## 本批入口与角色
新增 `/wallet-refunds/operations` 及 `/:recordId`，工作区“财务与运营”可到达，登录后允许返回该明确路径。以登录账号岗位调用，不发送 X-Acting-Party。服务端 `WALLET_REFUND_REVIEW` 与原充值/退款独立性检查是最终权限依据；投影没有 allowed_actions/created_by，本页不假称角色或回避已通过。

## 已接动作及真实端点
- 游标分页清单 GET `/wallet/operations/recharge-refunds`；列表仅摘要，不把缺少evidence字段当空证据。
- 原记录详情 GET 同路径 `/:id`；严格读取扁平投影，并核记录ID/状态/版本/金额/时间/申请类型/任务标记。详情须含真实证据ID。
- 独立核验 POST `/:id/review`：APPROVE/REJECT、核定金额、理由与四项checks。通过金额大于0且不超过申请额；退回为0。通过前需取得本版全部文件并人工勾选核实，监护人申请另核关系；不自动勾选任何审核结论。
- POST `/:id/scheduling`：APPROVED/SUBMITTING/UNKNOWN可登记原任务，明确不等于退款到账。
- POST `/:id/retry`：仅已有task_scheduled且原契约支持的状态，填写理由，明确仅授权原任务重试而非新退款。终态仍可能允许任务层收尾，页面不把它说成二次退款。
- GET `/:id/evidence/:asset_id`：只由当前详情枚举ID取得文件，沿useBusiness受控Blob和下载链接；换页/版本/身份/失权撤销URL与已读集合。现投影没有hash，不冒称hash比对或实际阅看完成。

## 钱账与恢复保护
复用原useBusiness，固定body/key/version及原读取路径，所有写入If-Match，不添加供应商回执输入或直调渠道。未知请求阻止新操作，先读原记录，再按原请求恢复，不用新表单、当前版本或新审核勾选替换原请求。恢复结果也核同记录投影。412撤销当前记录/明确确认/核实勾选，重新读取后才能新提交；刷新未提交表单需明确丢弃。

表单修改、读取记录/版本、身份与证据上下文变化撤销确认。异步读/文件/写有页面代际及session快照关联。错误保留实际错误码/请求号；清单错误不冒充空库。未暴露内部供应商binding、trusted receipt或付款凭据。

## 范围及剩余
仅新增运营前端及必要路由/导航注册，不改后端、公共useBusiness、App或其他业务表单。本人/监护人申请由另批App接入；本页不替代该端，也不增加运营替本人发起/取消接口。

仅源码阅读、范围diff与哈希核对，未测试、编译、分析器、格式化、安装、运行浏览器或调用业务接口。所有角色办理、批准后资金不足、监护关系失效、自审拒绝、未知恢复、版本冲突、证据失权及任务终态由整批交付后同事固定版本联合验证；不计通过或整链完成。

## 文件冻结SHA256
- `business/rechargeRefund.ts`: `fada91fea347c1d5073182b9d4a44025df9de36ac19a5bc3c85284f0138c5ee7`
- `views/RechargeRefundOperationsView.vue`: `37780b4582080f29e6cbbe182be282a1b937dd2667e557f3aa9b79c3c123df47`
- `router/index.ts`: `f9779114eb4a73c08bde7bd775db0c18d3256ff2e62166782cecaa922d000647`
- `router/loginRedirect.ts`: `4d7fe46632a7d3d7ad87cc0c31ca0d25a6a4355b33724267df84e5e11f00dd81`
- `components/WorkspaceNav.vue`: `4aeb195901e80018f67fc4fecabf0052993a6070e0eae45ae18a34f1bfddea73`

同主体权限刷新补审：页内同步监听session.revision，增加页面代际并清记录、列表、游标、证据URL/已读及表单同意，提示重新读取核权。不把revision纳入useBusiness存储上下文，不调用clear/丢弃原pending。原在途操作仍按原请求保留/核对，页面不回写过期内容；未测试。
