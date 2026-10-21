<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { useSessionStore } from '@/stores/session'
import { asApiError, type ApiError } from '@/api/client'
import { marketplacePreview, type MarketplacePreview as Preview } from '@/api/modules/finance'
import { amountInput, money } from '@/api/modules/trade'
import { validSupplyId } from '@/api/modules/supply'
import ApiErrorAlert from '@/components/ApiErrorAlert.vue'
const session = useSessionStore(), form = reactive({rule:'',supplier:'',net:'',relation:''})
const result = ref<Preview|null>(null), error = ref<ApiError|null>(null), busy = ref(false)
const valid = computed(() => validSupplyId(form.rule) && validSupplyId(form.supplier) && amountInput(form.net,0) !== null && (!form.relation || validSupplyId(form.relation)))
const roleLabels = {PLATFORM:'平台',SUPPLIER:'供给方',MCN:'MCN机构',REFERRER:'推荐人'}
const productLabels = {STOCK_VIDEO:'现成视频',COMMERCIAL:'商单',AUDITION:'试镜'}
const percent = (bps: number) => `${(bps / 100).toFixed(2)}%`
let epoch = 0, abort: AbortController|null = null
function clear() { epoch++; abort?.abort(); abort = null; result.value = null; error.value = null; busy.value = false; form.rule = form.supplier = form.net = form.relation = '' }
watch(() => [session.token,session.account?.id,session.selectedId,session.revision],clear,{flush:'sync'})
watch(() => [form.rule,form.supplier,form.net,form.relation],() => { result.value = null; epoch++; abort?.abort(); busy.value = false },{flush:'sync'})
onUnmounted(clear)
async function preview() {
  if (!valid.value || busy.value || !session.token || !session.account?.id) return
  const generation = ++epoch; abort?.abort(); abort = new AbortController(); busy.value = true; result.value = null; error.value = null
  try { const r = await marketplacePreview({token:session.token,accountId:session.account.id,partyId:null},{rule_id:form.rule,supplier_party_id:form.supplier,net_minor:amountInput(form.net,0)!,...(form.relation ? {relation_id:form.relation} : {})},abort.signal); if (generation === epoch) result.value = r }
  catch(e) { if (generation === epoch) { const value=asApiError(e); if ([401,403,404].includes(value.status)) clear(); error.value=value } }
  finally { if (generation === epoch) busy.value = false }
}
</script>
<template>
  <section class="supply-card" data-testid="finance-marketplace-preview">
    <h2>按服务器已批准约定只读试算</h2><p class="supply-warning">本页仅试算，不是账面应付，不代表可打款额度或实际到账；不会生成订单或付款。定制自营承制仍采用原订单的独立合同约定。</p>
    <form @submit.prevent="preview"><fieldset :disabled="busy"><div class="trade-fields two">
      <label>已批准的撮合规则编号<input v-model="form.rule" data-testid="finance-preview-rule" required></label><label>实际供给方主体编号<input v-model="form.supplier" data-testid="finance-preview-supplier" required></label>
      <label>净实付金额（人民币分）<input v-model="form.net" data-testid="finance-preview-net" inputmode="numeric" required placeholder="已付扣退款，非负整数分"></label><label>有效MCN关系编号（如适用）<input v-model="form.relation" data-testid="finance-preview-relation" placeholder="没有关系时留空"></label>
    </div><button class="primary" data-testid="finance-preview-submit" :disabled="!valid || busy">{{ busy ? '正在读取服务器试算…' : '读取服务器试算' }}</button></fieldset></form>
    <ApiErrorAlert :error="error" testid="finance-preview-error"/>
    <details v-if="!result"><summary>试算口径核对信息</summary><p class="identifier">PREVIEW_ONLY_NOT_ORDER_OR_PAYABLE</p></details>
    <div v-if="result" data-testid="finance-preview-result"><h3>试算结果</h3><p class="muted">服务器按已批准规则和有效关系计算。平台佣金与扣除平台佣金后供给侧的MCN份额分别展示。</p><dl class="supply-facts"><div><dt>商品类型</dt><dd>{{ productLabels[result.allocation.product_type] }}</dd></div><div><dt>核对基数</dt><dd>净实付 {{ money(result.amounts.net_minor) }}</dd></div><div><dt>平台佣金</dt><dd>{{ percent(result.allocation.platform_bps) }}（净实付基数）</dd></div><div><dt>MCN供给侧份额</dt><dd>{{ percent(result.allocation.mcn_supply_bps) }}（扣除平台佣金后的供给侧基数）</dd></div><div><dt>推荐份额</dt><dd>{{ percent(result.allocation.referral_bps) }}</dd></div><div><dt>服务器尾差记录（人民币分）</dt><dd>{{ result.amounts.rounding_diff_minor }}</dd></div></dl>
      <div class="table-wrap"><table class="preview-amount-table"><thead><tr><th>角色</th><th>试算金额</th><th>主体编号</th></tr></thead><tbody><tr v-for="entry in result.amounts.entries" :key="entry.role"><td>{{ roleLabels[entry.role] }}</td><td>{{ money(entry.amount_minor) }}</td><td class="identifier">{{ entry.party_id }}</td></tr></tbody></table></div>
      <details><summary>原规则及关系核对信息</summary><p class="identifier">试算口径：{{ result.meaning }}</p><p class="identifier">商品类型：{{ result.allocation.product_type }} · 平台 {{ result.allocation.platform_bps }} bps · MCN {{ result.allocation.mcn_supply_bps }} bps · 推荐 {{ result.allocation.referral_bps }} bps</p><p class="identifier">规则 {{ result.rule_id }} · {{ result.rule_content_sha256 }}</p><p v-if="result.relation_reference" class="identifier">关系 {{ result.relation_reference.id }} · 版本 {{ result.relation_reference.version }} · {{ result.relation_reference.sha256 }}</p><p v-else>本次未引用MCN关系。</p></details>
    </div>
  </section>
</template>
<style scoped>fieldset{border:0;padding:0;min-width:0}summary{min-height:44px;align-content:center}form{margin:24px 0}.preview-amount-table{width:100%;min-width:0;table-layout:fixed}.preview-amount-table th,.preview-amount-table td{padding:12px 8px;overflow-wrap:anywhere}.preview-amount-table th:first-child{width:20%}.preview-amount-table th:nth-child(2){width:38%}.preview-amount-table td:nth-child(2){font-variant-numeric:tabular-nums}.preview-amount-table td:last-child{word-break:break-all}</style>
