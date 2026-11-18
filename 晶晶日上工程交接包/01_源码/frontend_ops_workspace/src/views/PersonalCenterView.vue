<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {useRoute} from 'vue-router'
import {useSessionStore} from '@/stores/session'
import {usePersonalCenter} from '@/composables/usePersonalCenter'
import {personalCategories,personalMoney,personalTarget,type PersonalCategory,type PersonalItem,type PersonalSource} from '@/api/modules/personalCenter'
import {statuses as tradeStatuses} from '@/api/modules/trade'
import {statuses as licenseStatuses} from '@/api/modules/licensing'
import {statusLabels as projectStatuses} from '@/api/modules/projects'
import {statusLabels as financeStatuses} from '@/api/modules/finance'
import {supplyStatus} from '@/api/modules/supply'
import {productionStatus} from '@/api/modules/production'
import {gigStatuses} from '@/api/modules/gigs'
import {states} from '@/business/labels'
import ServiceWorkspace from '@/components/ServiceWorkspace.vue'
import ApiErrorAlert from '@/components/ApiErrorAlert.vue'
import StateValue from '@/components/StateValue.vue'
const route=useRoute(),session=useSessionStore(),category=computed(()=>String(route.params.category||'contracts') as PersonalCategory)
const ui=usePersonalCenter(()=>({token:session.token,accountId:session.account?.id||'',partyId:session.selectedId,revision:session.revision,category:category.value}))
const {sections,error,loading}=ui,initialized=ref(false),reading=computed(()=>loading.value||sections.value.some(section=>section.loading)),partial=computed(()=>sections.value.some(section=>!!section.error))
const intro=computed(()=>category.value==='contracts'?'按当前身份集中查找封存内容、订单和各类约定，继续核对原始版本。':category.value==='works'?'按来源查找作品历史版本、制作项目和已购视频，进入原业务继续办理。':'分别查看当前身份已登记的收入核算与商单佣金来源；每笔保留原币种、环境和核算记录。')
function initialize(){initialized.value=true;void ui.load()}
watch(ui.signature,()=>{if(initialized.value&&ui.ready.value)void ui.load()},{flush:'sync'})
function status(source:PersonalSource,item:PersonalItem){const value=item.current_status;if(value==='SEALED')return'内容已封存';if(source==='PRODUCTION_PROJECTS')return productionStatus({kind:'PROJECT',current_status:value});const labels:Record<string,string>=item.source_domain==='TRADE'||item.source_domain==='STOCK_PURCHASE'?tradeStatuses:item.source_domain==='LICENSE'?licenseStatuses:item.source_domain==='SUPPLY'?supplyStatus:item.source_domain==='PROJECTS'?projectStatuses:item.source_domain==='FINANCE'?financeStatuses:item.source_domain==='GIGS'?gigStatuses:states;return labels[value]||value}
const stamp=(at:string)=>new Date(at).toLocaleString()
</script>
<template>
 <ServiceWorkspace data-gallery="WEB-PERSONAL-CENTER" :title="personalCategories[category]" :intro="intro" :error="error" @ready="initialize">
  <template #heading><button class="outline" data-testid="personal-refresh" :disabled="reading" @click="ui.load">刷新当前身份</button></template>
  <nav class="service-tabs" aria-label="我的业务分类"><RouterLink v-for="(label,key) in personalCategories" :key="key" :to="'/me/business/'+key">{{label}}</RouterLink></nav>
  <p class="service-muted personal-scope">按来源分别展示，来源内按创建时间从新到旧排列。每次读取 20 条候选记录；展示数量是当前已读数量。</p>
  <p v-if="category==='contracts'" class="supply-warning">封存内容、订单约定与许可预留分别列出。内容封存只表示版本已固定，签署和付款请核对原业务。</p>
  <p v-else-if="category==='works'" class="supply-warning">历史作品版本逐条保留。制作进度、已购视频的授权与下载条件以原业务当前核验为准。</p>
  <p v-else class="supply-warning">仅列已登记核算，不汇总跨环境或币种的金额；商家留存、待付与净支付分别展示。此页不核验银行到账。</p>
  <p v-if="loading" role="status">正在读取当前身份的{{personalCategories[category]}}…</p>
  <p v-if="partial" class="supply-notice" role="status">部分来源暂时未能加载。已读内容仍可查看，请在对应来源中重试。</p>
  <button v-if="error" class="outline" data-testid="personal-retry-all" :disabled="reading" @click="ui.load">重新读取当前身份</button>
  <div v-if="!error" class="personal-sections">
   <section v-for="section in sections" :key="category+section.source" class="supply-card personal-section" :data-testid="'personal-section-'+section.source" :aria-labelledby="'personal-heading-'+section.source">
    <div class="section-heading personal-section-heading"><div><h2 :id="'personal-heading-'+section.source">{{section.label}}</h2><p v-if="section.loaded" class="service-muted">已显示 {{section.items.length}} 项</p></div><button class="outline" :data-testid="'personal-refresh-'+section.source" :disabled="loading||section.loading" @click="ui.readSource(section.source,'refresh')">从头读取此来源</button></div>
    <p v-if="section.loading" role="status">正在读取此来源…</p>
    <div v-if="section.error" class="personal-source-error"><p role="alert">这部分暂时未能加载，请重试。{{section.retryAppend?'已读内容和原翻页位置仍保留。':''}}</p><ApiErrorAlert :error="section.error"/><button class="outline" :data-testid="'personal-retry-'+section.source" :disabled="loading||section.loading" @click="ui.readSource(section.source,'retry')">{{section.retryAppend?'重试原下一页':'重试此来源'}}</button></div>
    <article v-for="item in section.items" :key="item.key" class="service-result personal-record" :data-testid="'personal-item-'+item.key">
     <div class="personal-record-heading"><h3>{{item.title}}</h3><StateValue :code="item.current_status" :label="status(section.source,item)"/></div>
     <p class="service-muted">创建于 {{stamp(item.created_at)}} · 原记录版本 {{item.object_version}}</p>
     <template v-if="item.income">
      <p class="personal-income-scope"><span class="service-status">{{item.income.environment==='SANDBOX'?'测试环境':'正式环境'}}</span> {{item.income.currency}} · 仅已登记核算</p>
      <p v-if="item.income.meaning==='MERCHANT_RETAINED_NOT_TRANSFER'" class="personal-retained"><strong>商家账面留存 {{personalMoney(item.income.retained_minor)}}</strong><span>此金额不作为再次向商家转账的待付款。</span></p>
      <dl class="personal-income-grid"><div><dt>已入账应计</dt><dd>{{personalMoney(item.income.accrued_minor)}}</dd></div><div><dt>已审核调整</dt><dd>{{personalMoney(item.income.adjustment_minor,true)}}</dd></div><div><dt>已核验净支付</dt><dd>{{personalMoney(item.income.verified_paid_minor)}}</dd></div><div><dt>账面待付</dt><dd>{{personalMoney(item.income.pending_minor)}}</dd></div><div><dt>商家账面留存</dt><dd>{{personalMoney(item.income.retained_minor)}}</dd></div><div><dt>账面待冲回／追回</dt><dd>{{personalMoney(item.income.recovery_due_minor)}}</dd></div></dl>
      <p class="service-muted">净支付已扣除支付退回。待付不表示已满足付款条件；需要冲回的金额不会在此自动追收。</p>
     </template>
     <p v-else-if="section.source==='COMMISSIONS'" class="supply-notice">仅提供佣金来源记录，不提供本人的结算金额；请进入原明细核对，不与结算台账重复相加。</p>
     <p class="service-text service-muted">{{item.notice}}</p>
     <RouterLink :to="personalTarget(section.source,item)" class="button-link outline" :data-testid="'personal-open-'+item.key">{{section.source==='CONTRACT_SNAPSHOTS'?'读取封存原文':category==='income'?'查看原核算明细':'打开原业务记录'}}</RouterLink>
    </article>
    <p v-if="section.loaded&&!section.items.length&&!section.cursor&&!section.error" class="supply-empty">{{section.source==='FINANCE'?'暂无已登记的收入核算。':section.source==='COMMISSIONS'?'暂无当前身份可核对的佣金来源记录。':'此来源暂无当前身份可读取的记录。'}}</p>
    <p v-if="section.loaded&&!section.items.length&&section.cursor&&!section.error" class="service-muted">本页没有当前可读取的记录，后面仍有待核对的记录。</p>
    <button v-if="section.cursor&&!section.error" class="outline" :data-testid="'personal-more-'+section.source" :disabled="loading||section.loading" @click="ui.readSource(section.source,'next')">{{section.items.length?'读取此来源更早记录':'继续读取此来源'}}</button>
   </section>
  </div>
 </ServiceWorkspace>
</template>
<style scoped>
.personal-scope{line-height:1.8}.personal-section-heading,.personal-record-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}.personal-section-heading h2{margin:0}.personal-section-heading p{margin-bottom:0}.personal-record-heading h3{min-width:0;overflow-wrap:anywhere;flex:1}.personal-source-error{border-left:3px solid var(--editorial-accent,#aa352a);padding:12px 16px;margin:16px 0}.personal-income-scope{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.personal-income-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:20px 0}.personal-income-grid>div{padding:12px 0;border-top:1px solid var(--ops-border);min-width:0}.personal-income-grid dt{font-size:12px;color:var(--ops-text-2);line-height:1.6}.personal-income-grid dd{margin:8px 0 0;font-size:18px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.personal-retained{display:grid;gap:8px;border-left:3px solid var(--editorial-accent,#aa352a);padding:12px 16px}.personal-retained span{font-size:13px;color:var(--ops-text-2)}@media(max-width:760px){.personal-income-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.personal-section-heading{display:grid}.personal-record-heading{display:grid}}
</style>
