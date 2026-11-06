# 商单正常制作、原单分账与客服裁定补验

2026-11-04。独立测试补原 E2E04，属于今晚后端负责的通告商单路线，映射原组9/10/11/16/17；不改变18组、12路线、151标准，不代前端批准。业务源码修复在新网页构建 `web-fulfillment-fix` 实测。最终统一构建与上传由主线另记。

## 已能办成什么

同一新建商单从付款后的首次制作页开始，由个人制作方按姓名选择本人负责；选择本人已审剧本、上传开工证明，建立项目。随后剧本→样片→粗剪→成片逐段提交、独立审核、买家预览确认，最终下载文件与上传原文件字节完全相同。

原单22%平台费与供给侧规则可直接带入结算页，参与方和费率不能重编。实际页面创建结算约定、独立核验、买家/卖家/平台三方确认，再生成、核验和三方确认结算单。买家随后提出质量异议，卖家补充说明，独立客服先要求核查、再准许恢复。全部27项主要办理操作与1项下载通过；上传证明另有3个实际页面请求。共28个页面检查、30个成功页面POST响应。直接HTTP另25次，含原商单报价/接受、制作开工审核及账目核对。

这里的“恢复”是争议状态恢复，真实分账出款仍为 `MARKETPLACE_PAYOUT_NOT_ENABLED`。不能将账面应得说成已打款。

## 原文与实施补全

- [08号第三条](../../../sources/contracts-20261029/extracted/08.md)：“平台抽佣（数字商品 18%、商单/线下 22%）在供给侧分成前先行计取；返佣、晶钻等按平台规则处理。”本单实际10001分：供给7801、平台2200、机构0。
- [19号第十六条](../../../sources/contracts-20261029/extracted/19.md)：“平台设置争议处理与客服介入机制。”本次实际办理质量异议、补说明、客服要求核查和恢复；未自动退款或增加钱账。
- **流程补全**：本人制作不应查数据库填写自己的账号编号；按当前有效个人OWNER提供本人姓名选项。非本人、停用账号/成员或机构不套用这条规则，机构仍按原成员查询权限。
- **流程补全**：财务页应能读取服务器早已冻结的两层分账格式，不能只支持旧比例行。新约定沿原订单快照，只填写结算时间与条款；旧协议保留原格式。错误规则、改费率仍由服务器拒绝。没有新增收费规则、外部支付产品或保留期限。

## 两处实际缺口及修复

|修前|修后|证据|
|---|---|---|
|个人制作方首次建项目要求输入自己的内部账号编号，成员选项为空|本人有效身份提供姓名选项并带入本人账号；机构权限不变|[修前](fulfillment-second/first-production-form.png)、[修后首次创建](fulfillment-green/first-production-form.png)|
|商单结算页只生成旧shares行；新allocation行既不能创建，也不能通过响应校验/正常显示|原单冻结分账只读带入，严格校验与展示现代格式；兼容旧shares，拒绝两种混用|[修前](fulfillment-third/commercial-finance-first-form.png)、[修后创建](fulfillment-green/commercial-finance-first-form.png)、[独立审核](fulfillment-green/finance-review-agreements.png)|

变更：`ProductionView.vue`、`FinanceView.vue`、`api/modules/finance.ts`、`FinanceRecordPanel.vue`。没有后端规则、接口或迁移变更。App对应兼容由主线负责，本报告未运行其完整原生链。

## 同一组记录与结果

|记录|编号|
|---|---|
|商单订单|c175d614-9b77-4929-8233-59d8e3538e1e|
|模拟付款|c1115443-6258-454c-90a3-512da1119197|
|制作项目|2381af32-5d48-4bc3-8810-02a00cbe85a5|
|最终成片|dd766ebd-9a26-4ca2-8bf2-bf3bbd359026|
|结算约定|b5c91733-ede2-431c-93bb-0717438f7ca2|
|结算单|78913ae9-a682-4fcd-957b-ec6a26857326|
|质量异议|64df827a-1040-4552-bf5e-96e30065312b|

[完整预期/实际请求与清理](fulfillment-green/results.json)；[最终执行日志](fulfillment-green.log)。最终项目ACCEPTED，异议RESOLVED，累计入账10001分，供给7801、平台2200，恢复前后无重复入账/付款。真实出款可用额0并明确未启用。客服暂停时同样不出款；由于该产品本已关闭出款，本场景不证明启用真实渠道后的暂停闸门。

## 检查与重跑

- 页面同单专项1组通过，28页全PASS，未用HTTP替代失败页面继续。
- 正式 `npm run test:finance`：原28检查＋新16检查通过；旧格式合计不足100%拒绝、现代费率/机构范围/角色重叠/非参与方扣除拒绝、本人负责人状态负例。
- `node tools/test-production.mjs`：18检查通过；`node tools/test-trade.mjs`：28检查通过；类型检查通过。新增16项及交易回归是保持定制shares格式边界后最后执行，见 `commercial-ui-checks-final.log`、`trade-regression-final.log`。
- 服务端两条实际反例：使用错误原单规则、修改原单平台费率均409 `MARKETPLACE_SOURCE_MISMATCH`。
- 新前端专项进入 `test:finance`。完整页面测试为显式运行的 `.browser.cjs`，不加入普通后端gigs套件，也不被默认测试发现；必须配置隔离数据库、网页构建和证据目录，缺少则明确报错，不用跳过冒充通过。

在工作树根目录、先构建修后网页后执行：

```powershell
$env:JX_MYSQL_TEST_ENV_FILE='J:\worktrees\full-flow\.local\mysql\runtime\test-env.json'
$env:JX_INDEPENDENT_EVIDENCE_DIR=(Join-Path (Get-Location) 'docs/testing/evidence/tonight-gigs-agency-20261104/new-fulfillment-run')
$env:JX_INDEPENDENT_WEB=(Join-Path (Get-Location) '.local/tonight-gigs-agency-20261104/web-fulfillment-fix')
node --test 晶晶日上工程交接包/01_源码/backend_server/test/gigs-fulfillment-dispute.browser.cjs
```

需要本机Edge，独占5191；端口冲突报错不杀他人进程。新的 `finance-response-capture` 是单独随机库的真实GET原始响应，供契约检查，不冒充上面同单页面记录。

## 前提、旧失败与未覆盖

账号/已登录会话、独立运营权限和生效规则为合成前置；成人核验和支付回执仅注入模拟供应商结果。艺人、授权、供给档案与剧本审核通过真实仓库命令建立；商单报价/接受和开工审核经真实HTTP。四段制作文件为本地产生的不可识别人动画，不验证AI生成或真人表演品质。没有SQL强改订单/制作/争议状态。

旧失败单独保留：first为创建人自审夹具，second漏了粗剪而被正确拦截；after-fix为断言未等上传回读完成；final为误将禁用出款的可用额预期2200，纠正为0并核禁用原因后green通过。third是首次四段正常制作成功，但建项当时通过接口，不能冒称已修后首次建页。

未覆盖退款型REMEDIED裁定、所有取消时钟边界、真实资金划拨、完整App/安卓同单链，以及全部151条正式验收。已有上一独立订单验证部分/全额退款及机构旧账，但不能拼成此次同单退款。财务旧输入的其他非本单场景也未宣称全部消除内部编号。

自己的Edge、预览和后端均关闭，随机库已删除，`cleanup`三个字段为true。没有覆盖人工会话、调用收费服务、启用生产或开放公网，未提交推送。
