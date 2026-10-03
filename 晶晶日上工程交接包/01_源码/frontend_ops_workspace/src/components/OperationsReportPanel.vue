<script setup lang="ts">
import {domains,reportKinds,reportStatus,reportMoney,type Report} from '@/api/modules/operations'
import {shortSupplyId} from '@/api/modules/supply'
defineProps<{report:Report}>()
const categories:Record<string,string>={RECEIPT:'真实收款',REFUND:'真实退款',ACCRUAL:'应计份额',ADJUSTMENT:'独立调整',PAYOUT:'真实付款扣减',PAYOUT_RETURN:'付款退回',PROJECT:'制作项目'}
</script>
<template><section class="supply-card ops-report-panel"><div class="supply-section-heading"><h2>{{reportKinds[report.request.kind]}}</h2><span class="status-chip">{{reportStatus[report.current_status]}}</span></div>
<dl class="ops-facts"><dt>请求环境</dt><dd>{{report.request.environment==='PRODUCTION'?'正式交易环境':'沙盒环境'}}</dd><dt>UTC 开始（含）</dt><dd>{{report.request.period_start}}</dd><dt>UTC 结束（不含）</dt><dd>{{report.request.period_end}}</dd><dt>申请身份</dt><dd>{{report.party_id?'本方主体 '+shortSupplyId(report.party_id):'独立经营报表操作者'}}</dd></dl>
<p v-if="['PENDING','RUNNING','RETRY'].includes(report.current_status)" class="supply-notice" role="status">申请已保存，尚无可下载结果。后台生成未运行时会保持等待；刷新以读取实际状态。</p>
<p v-if="report.error_code" class="supply-warning">实际阻塞原因：{{report.error_code}}。请核对原业务和运行条件后再申请同任务重试。</p>
<template v-if="report.result"><div class="ops-summary"><div><span>实际生成时间（UTC）</span><strong>{{report.result.generated_at}}</strong></div><div><span>已冻结明细</span><strong>{{report.result.row_count}} 条</strong></div><div><span>口径版本</span><strong>{{report.result.metric_version}}</strong></div></div>
<h3>本次口径汇总</h3><div class="ops-totals"><div v-for="(value,key) in report.result.totals" :key="key"><span>{{categories[key]||key}}</span><strong>{{report.request.kind==='WORKLOAD'?value+' 个项目':reportMoney(value)}}</strong></div></div><p v-if="!Object.keys(report.result.totals).length" class="supply-empty">本次期间内没有符合口径的明细。</p>
<p class="muted">{{report.request.kind==='CASH'?'收款与退款分别展示，不代表利润；结算份额不会重复作为收入。':report.request.kind==='SETTLEMENT'?'结算明细按本次获准份额展示；应计、调整和真实付出分开保留。':'制作状态为生成时的实际状态；本表不把项目数当作金额。'}}</p>
<div class="table-wrap"><table><thead><tr><th>业务来源</th><th>类别或状态</th><th>金额 / 数量</th><th>实际发生时间（UTC）</th></tr></thead><tbody><tr v-for="(row,n) in report.result.rows" :key="n"><td>{{domains[row.domain]}} · {{shortSupplyId(row.record_id)}}</td><td>{{row.status||categories[row.category]}}</td><td>{{row.amount_minor===null?'1 个项目':reportMoney(row.amount_minor)}}</td><td>{{row.occurred_at}}</td></tr></tbody></table></div>
<h3>结果限制与来源说明</h3><ul><li v-for="(text,n) in report.result.limitations" :key="n" class="ops-text">{{text}}</li></ul><p class="muted">这是已冻结的 JSON 结果，完整指纹已核对；CSV 是服务器另行生成的字节内容，JSON 指纹不作为 CSV 字节指纹。</p></template>
<details class="ops-technical"><summary>任务编号、JSON 指纹与完整来源</summary><dl><dt>报表任务编号</dt><dd>{{report.id}}</dd><dt>JSON 快照 SHA-256</dt><dd>{{report.content_sha256||'尚未生成'}}</dd></dl><div v-for="s in report.result?.sources||[]" :key="s.domain+s.record_id" class="ops-source"><span>{{domains[s.domain]}} · {{s.record_id}}</span><code>{{s.content_sha256}}</code></div><div v-for="(row,n) in report.result?.rows||[]" :key="n" class="ops-source"><span>原事实 {{row.source_id}} · {{row.party_id||'未指定单方'}} </span><code>{{row.source_sha256}}</code></div></details></section></template>
