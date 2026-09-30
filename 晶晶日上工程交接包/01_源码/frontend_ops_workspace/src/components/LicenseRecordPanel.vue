<script setup lang="ts">
import { licenseTitle, moneyText, statuses, purposes, type LicenseRecord } from '@/api/modules/licensing'
import { shortSupplyId } from '@/api/modules/supply'
import LicenseTerms from './LicenseTerms.vue'
import ContractText from './ContractText.vue'
defineProps<{ record: LicenseRecord; reviewer?: boolean; busy?: boolean }>()
const emit = defineEmits<{ material: [recordId: string, assetId: string] }>()
const date = (s: string) => new Date(s).toLocaleString('zh-CN',{hour12:false})
</script>
<template>
  <section class="supply-card">
    <div class="section-heading"><h2>{{ licenseTitle(record) }}</h2><span class="supply-badge">{{ statuses[record.current_status] }}</span></div>
    <dl class="supply-facts"><div><dt>记录编号 / 当前版本</dt><dd><span :title="record.id">{{ shortSupplyId(record.id) }}</span> · {{ record.object_version }}</dd></div><div><dt>负责人身份</dt><dd><span :title="record.owner_party_id">{{ shortSupplyId(record.owner_party_id) }}</span></dd></div><div v-if="record.counterparty_id"><dt>另一方身份</dt><dd><span :title="record.counterparty_id">{{ shortSupplyId(record.counterparty_id) }}</span></dd></div><div v-if="record.work_id"><dt>作品来源</dt><dd><span :title="record.work_id">{{ shortSupplyId(record.work_id) }}</span></dd></div></dl>
    <p v-if="record.parent_id" class="muted">关联记录：<span :title="record.parent_id">{{ shortSupplyId(record.parent_id) }}</span></p>
  </section>
  <section v-if="record.kind === 'PRODUCT' || record.kind === 'RESERVATION' || record.kind === 'GRANT'" class="supply-card">
    <h2>许可范围与期限</h2><LicenseTerms :terms="record.data.terms" />
    <dl class="supply-facts"><div><dt>约定总价</dt><dd>{{ moneyText(record.data.price) }}</dd></div><template v-if="record.kind === 'PRODUCT' || record.kind === 'RESERVATION'"><div><dt>取得许可前应付金额</dt><dd>{{ moneyText({currency:record.data.price.currency,amount_minor:record.data.payment_due_minor}) }}</dd></div><div><dt>预留时长</dt><dd>{{ record.data.reservation_minutes }} 分钟</dd></div><div><dt>采用规则</dt><dd><span :title="record.data.rule_id">{{ shortSupplyId(record.data.rule_id) }}</span></dd></div></template></dl>
  </section>
  <section v-if="record.kind === 'PRODUCT' || record.kind === 'RESERVATION'" class="supply-card"><h2>经核验的短试读</h2><p class="long-text preview-text">{{ record.data.preview_text }}</p><p class="muted">这是商品的短试读。作品全文只可通过另行获准的受控阅读读取。</p></section>
  <section v-if="record.kind === 'RESERVATION' || record.kind === 'GRANT'" class="supply-card">
    <h2>本次不可变合同</h2><p v-if="record.kind === 'RESERVATION'" class="supply-warning">预留截止：{{ date(record.data.expires_at) }}。{{ record.current_status === 'REVIEW_REQUIRED' ? '需要人工补救，尚未取得许可。' : '预留和保存合同均不代表已取得许可。' }}</p>
    <p class="muted">合同文本已保存；签署来源需另外核验。不会显示平台自动付款或自动签署成功。</p>
    <p class="identifier">合同内容指纹：{{ record.data.contract.content_sha256 }}</p>
    <details class="contract-details"><summary>查看当时保存的全部约定</summary><ContractText :value="record.data.contract.commitments" label="本次合同承诺" /></details>
    <details class="contract-details"><summary>查看合同采用的全部规则文本</summary><div v-for="rule in record.data.contract.rule_contents" :key="rule.id"><h3>{{ rule.rule_key }} · {{ rule.version }}</h3><ContractText :value="rule.terms" :label="rule.rule_key" /></div></details>
    <p v-if="record.kind === 'GRANT'" class="long-text">发放依据：{{ record.data.reason }}<template v-if="record.data.suspension_reason"><br>暂停原因：{{ record.data.suspension_reason }}</template></p>
  </section>
  <section v-if="record.kind === 'EVIDENCE'" class="supply-card"><h2>外部签署与付款依据</h2><p class="muted">人工核验外部事实；支付渠道结果未上报。</p><p class="identifier">合同内容指纹：{{ record.data.contract_sha256 }}</p><p>外部材料参考：{{ record.data.external_reference }}</p><div v-for="([label,id]) in [['卖方签署材料',record.data.seller_signature_asset_id],['买方签署材料',record.data.buyer_signature_asset_id],['身份核验依据',record.data.identity_asset_id],['付款材料',record.data.payment_asset_id]]" :key="label || ''" class="material-row material-line"><span>{{ label }}：<span v-if="id" :title="id">{{ shortSupplyId(id) }}</span><template v-else>无附件</template></span><button v-if="reviewer && id" type="button" class="outline" :disabled="busy" @click="emit('material',record.id,id)">读取关联材料</button></div></section>
  <section v-if="record.kind === 'PROJECT'" class="supply-card"><h2>项目用途记录</h2><dl class="supply-facts"><div><dt>用途</dt><dd>{{ purposes[record.data.purpose] }}</dd></div><div><dt>地域 / 语言</dt><dd>{{ record.data.territory }} / {{ record.data.language }}</dd></div><div><dt>集数</dt><dd>{{ record.data.episodes }}</dd></div></dl><p class="muted">项目用途不可原地改写；绑定额度后，本阶段不开放释放再用。</p></section>
  <section v-if="record.kind === 'BINDING'" class="supply-card"><h2>已分配项目额度</h2><dl class="supply-facts"><div><dt>项目编号</dt><dd :title="record.data.project_id">{{ shortSupplyId(record.data.project_id) }}</dd></div><div><dt>原作版本</dt><dd :title="record.data.work_version_id">{{ shortSupplyId(record.data.work_version_id) }}</dd></div><div><dt>当时许可范围指纹</dt><dd>{{ record.data.terms_sha256 }}</dd></div></dl></section>
  <section v-if="record.kind === 'READING'" class="supply-card"><h2>指定人阅稿依据</h2><dl class="supply-facts"><div><dt>指定账号</dt><dd :title="record.data.reader_account_id">{{ shortSupplyId(record.data.reader_account_id) }}</dd></div><div><dt>阅读截止</dt><dd>{{ date(record.data.valid_until) }}</dd></div><div><dt>授权依据</dt><dd>{{ record.data.basis_type === 'NDA' ? '保密协议' : '评估授权' }}</dd></div><div><dt>材料编号</dt><dd :title="record.data.basis_asset_id">{{ shortSupplyId(record.data.basis_asset_id) }}</dd></div></dl><button v-if="reviewer" class="outline" type="button" :disabled="busy" @click="emit('material',record.id,record.data.basis_asset_id)">读取阅稿依据</button><p class="muted">只授予评估阅读；不授予生成、训练或发行。当前支持 UTF-8 纯文本及分段水印，不承诺阻止截屏或人工复制。</p></section>
  <section v-if="'review' in record.data && record.data.review" class="supply-card"><h2>已记录的独立核验结论</h2><p>{{ record.data.review.decision === 'APPROVED' ? '批准' : '拒绝' }} · {{ record.data.review.reason }}</p><dl v-if="record.data.review.verification" class="supply-facts"><div><dt>核验实收</dt><dd>{{ moneyText({currency:record.data.review.verification.currency,amount_minor:record.data.review.verification.received_minor}) }}</dd></div><div><dt>收款凭证参考</dt><dd>{{ record.data.review.verification.receipt_ref || '无需付款凭证' }}</dd></div><div><dt>实际收款方</dt><dd :title="record.data.review.verification.payee_party_id">{{ shortSupplyId(record.data.review.verification.payee_party_id) }}</dd></div></dl></section>
  <p v-if="'close_reason' in record.data && record.data.close_reason" class="supply-warning">关闭理由：{{ record.data.close_reason }}</p>
</template>
<style scoped>.preview-text{font-size:16px;line-height:2;max-width:800px}.contract-details{margin-top:20px}.contract-details summary{cursor:pointer;min-height:44px;color:var(--ops-ink)}.contract-details h3{margin-top:20px}</style>
