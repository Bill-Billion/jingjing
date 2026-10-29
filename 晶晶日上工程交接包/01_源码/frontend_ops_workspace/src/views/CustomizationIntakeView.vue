<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useSessionStore } from '@/stores/session'
import { useCustomizationStore } from '@/stores/customization'
import { asApiError } from '@/api/client'
import type { IntakeStatus } from '@/api/modules/customization'
import WorkspaceNav from '@/components/WorkspaceNav.vue'
import ApiErrorAlert from '@/components/ApiErrorAlert.vue'
import CustomizationSubmission from '@/components/CustomizationSubmission.vue'
import StoryAttachmentList from '@/components/StoryAttachmentList.vue'
import { useStoryAttachments } from '@/composables/useStoryAttachments'
import '@/styles/supply.css'
import '@/styles/operations.css'

const session = useSessionStore(), ui = useCustomizationStore(), route = useRoute(), router = useRouter()
const { rows,nextCursor,detail,status,error,notice,loading,busy,pending,locked,conflicted,reconfirmed,canIntake,supplement,supplementItems,canSupplement,history,historyCursor,historyVersion,quotes,quotesCursor } = storeToRefs(ui)
const requestId = computed(() => String(route.params.requestId || ''))
const statusText = {SUBMITTED:'平台待查看',INTAKE:'受理中'}
const initializing = ref(true), menuOpen = ref(false)
const files = useStoryAttachments(()=>({token:session.token,accountId:session.account?.id || '',requestId:detail.value?.id || requestId.value,revision:session.revision,identityTag:session.selectedId}),{canUpload:()=>false,onUploaded:()=>{},onRevoked:()=>{},onForbidden:()=>ui.clear()})
let disposed = false
async function loadPage() {
  if (!session.token || !session.account?.id) return
  if (requestId.value) { const r = await ui.read(requestId.value); if (r) { await ui.readSupplement(r.id); if(detail.value?.template_snapshot.fields.some(f=>f.type==='PRIVATE_ATTACHMENT'))await files.load() } }
  else await ui.load()
}
async function intake() { await ui.intake(); if (detail.value && !pending.value) await ui.readSupplement(detail.value.id) }
const quoteLabels = {IN_REVIEW:'待独立复核',APPROVED:'已复核，待买方确认',REJECTED:'已拒绝',ACCEPTED:'已生成订单'}
function fieldLabel(key: string) { return detail.value?.template_snapshot.fields.find(f => f.key === key)?.label || key }
function leave() {
  if (busy.value || pending.value) { notice.value = '本次受理结果尚未确认，请先在当前页核对并恢复原请求。'; return false }
  files.clear(); ui.clear(); return true
}
function beforeUnload(e: BeforeUnloadEvent) { if (pending.value || busy.value) { e.preventDefault(); e.returnValue = '' } }
onBeforeRouteLeave(leave)
onBeforeRouteUpdate(leave)
watch(() => route.fullPath, () => { menuOpen.value = false; if (!initializing.value) void loadPage() })
watch(() => [session.token,session.account?.id,session.selectedId,session.revision], () => { if (!initializing.value) void loadPage() })
onMounted(async () => {
  window.addEventListener('beforeunload',beforeUnload)
  const c = session.capture()
  try {
    await session.loadAccount()
    if (!disposed && session.current(c)) { initializing.value = false; await loadPage() }
  } catch(e) { if (!disposed && session.current(c)) error.value = asApiError(e) }
  finally { if (!disposed) initializing.value = false }
})
onUnmounted(() => { disposed = true; window.removeEventListener('beforeunload',beforeUnload); files.clear(); ui.clear() })
</script>

<template>
  <div class="supply-workspace operations-workspace customization-workspace editorial-workspace" data-design="V5-R02-story-supplement-quote">
    <header class="supply-header">
      <RouterLink to="/workspace" class="supply-brand">晶晶日上</RouterLink><span>运营与合作方工作台</span>
      <div class="account-actions"><span class="account-name">{{ session.account?.display_name || '当前账号' }}</span><button @click="session.logout().then(() => router.push('/login'))">退出</button></div>
    </header>
    <div class="supply-layout">
      <aside class="supply-sidebar">
        <button class="outline customization-menu-toggle" data-testid="customization-menu-toggle" type="button" aria-controls="customization-workspace-menu" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">工作区导航 <span>{{ menuOpen ? '收起' : '展开' }}</span></button>
        <div id="customization-workspace-menu" class="customization-menu" :class="{ expanded: menuOpen }"><WorkspaceNav/><div class="supply-identity"><p>故事受理人员</p><p class="muted">以当前账号的受理岗位办理。</p></div></div>
      </aside>
      <main class="supply-main">
        <nav aria-label="故事模块" class="supply-actions"><RouterLink to="/operations/customization/mine" class="table-link">我的故事 · 创建与续写</RouterLink><RouterLink to="/operations/customization" aria-current="page" class="table-link">运营收件与受理</RouterLink></nav>
        <RouterLink v-if="requestId" to="/operations/customization" class="customization-back">← 返回故事收件</RouterLink>
        <div class="supply-heading">
          <div><p class="eyebrow">定制制作 · 故事收件</p><h1>{{ requestId ? detail?.submission.template_snapshot.title || '故事提交详情' : '故事收件与受理' }}</h1><p class="muted">核对正式故事，逐项补资料，再按同一版本办理平台报价。</p></div>
          <button class="outline" data-testid="customization-refresh" :disabled="locked || initializing" @click="loadPage">刷新当前记录</button>
        </div>
        <ApiErrorAlert :error="error" testid="customization-error"/>
        <p v-if="notice" class="supply-notice" role="status">{{ notice }}</p>
        <p v-if="initializing || loading || busy" role="status" class="muted">{{ busy ? '正在提交受理操作…' : '正在读取故事收件…' }}</p>

        <section v-if="pending && !busy" class="supply-card" data-testid="customization-pending">
          <h2>操作结果待确认</h2><p>请先核对当前状态，再恢复同一次操作。</p>
          <div class="supply-actions">
            <button class="outline" data-testid="customization-check-pending" :disabled="loading" @click="ui.checkPending">核对当前记录</button>
            <button class="primary" data-testid="customization-retry-pending" :disabled="loading || !pending.checked" @click="ui.retryPending">恢复原操作请求</button>
          </div>
        </section>

        <template v-if="!requestId">
          <section class="supply-card">
            <div class="section-heading"><h2>已提交故事</h2><label class="customization-filter">办理状态<select :value="status" data-testid="customization-status" :disabled="locked || initializing" @change="ui.setStatus(($event.target as HTMLSelectElement).value as IntakeStatus | '')"><option value="SUBMITTED">平台待查看</option><option value="INTAKE">受理中</option><option value="">全部已提交</option></select></label></div>
            <div v-if="rows.length" class="table-wrap"><table data-testid="customization-table"><thead><tr><th>故事品类</th><th>当前状态</th><th>提交时间（UTC）</th><th>受理时间（UTC）</th><th>操作</th></tr></thead><tbody><tr v-for="r in rows" :key="r.id"><td><strong>{{ r.category_title }}</strong><p class="identifier">{{ r.id }}</p></td><td><span class="supply-badge">{{ statusText[r.current_status] }}</span></td><td><time :datetime="r.submitted_at">{{ r.submitted_at }}</time></td><td><time v-if="r.intake_at" :datetime="r.intake_at">{{ r.intake_at }}</time><span v-else class="muted">尚未开始</span></td><td><RouterLink :to="`/operations/customization/${r.id}`" :data-testid="`customization-open-${r.id}`" class="table-link">查看提交</RouterLink></td></tr></tbody></table></div>
            <p v-else-if="!loading && !initializing && !error" class="supply-empty" data-testid="customization-empty">当前状态下没有可见的已提交故事。</p>
            <div v-if="nextCursor" class="supply-actions"><button class="outline" data-testid="customization-more" :disabled="locked" @click="ui.load(true)">继续读取</button></div>
          </section>
        </template>

        <ApiErrorAlert :error="files.error.value" testid="customization-attachment-error"/>
        <p v-if="files.notice.value" class="supply-notice" role="status">{{ files.notice.value }}</p>
        <StoryAttachmentList v-if="detail?.template_snapshot.fields.some(f=>f.type==='PRIVATE_ATTACHMENT')" :items="files.rows.value" :loaded="files.loaded.value" :next-cursor="files.nextCursor.value" :locked="locked || files.locked.value" :downloading="files.downloading.value" operator @load="files.load($event)" @download="files.download"/>
        <template v-if="requestId && detail">
          <div class="ops-columns">
            <CustomizationSubmission :attachments="files.rows.value" :attachment-busy="files.locked.value || !!files.downloading.value" @download-attachment="files.download" :request="detail"/>
            <section class="supply-card ops-action" data-testid="customization-intake-actions">
              <h2>受理记录</h2>
              <dl class="supply-facts intake-facts">
                <div><dt>当前状态</dt><dd><span class="supply-badge" data-testid="customization-current-status">{{ statusText[detail.current_status] }}</span></dd></div>
                <div><dt>受理人员账号</dt><dd data-testid="customization-intake-by">{{ detail.intake_by || '尚未受理' }}</dd></div>
                <div><dt>受理时间（UTC）</dt><dd data-testid="customization-intake-at"><time v-if="detail.intake_at" :datetime="detail.intake_at">{{ detail.intake_at }}</time><span v-else>尚未受理</span></dd></div>
              </dl>
              <template v-if="detail.current_status === 'SUBMITTED' && detail.allowed_actions.includes('INTAKE')">
                <p>开始受理后，会记录当前账号和操作时间。用户提交的故事将保留原样。</p>
                <label v-if="conflicted" class="customization-confirm"><input v-model="reconfirmed" data-testid="customization-reconfirm" type="checkbox" :disabled="locked">我已核对更新后的提交，确认开始受理。</label>
                <button class="primary" data-testid="customization-intake" :disabled="!canIntake" @click="intake">开始受理</button>
              </template>
              <p v-else-if="detail.current_status === 'SUBMITTED'" class="muted">当前账号可查看此提交，暂无受理操作权限。</p>
              <p v-else class="muted">受理已经开始。请核对补充要求；未补齐及未重新受理的版本不能报价。</p>
              <p class="muted">开始受理不收取费用，也不表示内容、授权或制作开工已经批准。</p>
            </section>
          </div>
          <section v-if="supplement" class="supply-card" data-testid="customization-supplement-context">
            <div class="section-heading"><h2>补充要求与正式回复</h2><span class="supply-badge">{{ supplement.supplement ? supplement.supplement.current_status === 'OPEN' ? '等待用户补充' : '用户已正式回复，仍需人工核对' : '暂无补充要求' }}</span></div>
            <template v-if="supplement.supplement">
              <p class="muted">提出时间（UTC）：{{ supplement.supplement.requested_at }} · 运营只读取正式版本，不读取用户未提交的草稿。</p>
              <article v-for="item in supplement.supplement.items" :key="item.field_key" class="customization-item">
                <h3>{{ fieldLabel(item.field_key) }}</h3><p class="long-text">需要补充的原因：{{ item.reason }}</p><p class="long-text">怎样补充：{{ item.instruction }}</p>
                <p v-if="supplement.supplement.response" class="long-text" data-testid="customization-formal-response">用户正式回复：{{ supplement.supplement.response.responses[item.field_key] }}</p>
              </article>
              <p v-if="supplement.supplement.current_status === 'OPEN'" class="muted">等待用户正式重提。重提后回到待查看，不会自动视为合格或批准报价。</p>
            </template>
            <form v-if="supplement.allowed_actions.includes('REQUEST_SUPPLEMENT') && detail.current_status === 'INTAKE'" data-testid="customization-supplement-form" @submit.prevent="ui.supplementRequest">
              <h3>逐项提出补充要求</h3><p class="muted">请选择原故事中的问题，分别写清原因和应补内容。附件问题可要求换文件；用户保存补件草稿后，还须正式提交，运营才能读取新文件。</p>
              <fieldset :disabled="locked">
                <div v-for="(item,n) in supplementItems" :key="n" class="customization-item">
                  <label>需要补充的问题<select v-model="item.field_key" :data-testid="`customization-supplement-field-${n}`" required><option value="">请选择原故事字段</option><option v-for="field in detail.template_snapshot.fields" :key="field.key" :value="field.key">{{ field.label }}</option></select></label>
                  <label>为什么需要补充<textarea v-model="item.reason" :data-testid="`customization-supplement-reason-${n}`" maxlength="500" required></textarea></label>
                  <label>请用户怎样补充<textarea v-model="item.instruction" :data-testid="`customization-supplement-instruction-${n}`" maxlength="1000" required></textarea></label>
                  <button v-if="supplementItems.length > 1" type="button" class="outline" @click="supplementItems.splice(n,1)">移除此项</button>
                </div>
                <label v-if="conflicted" class="customization-confirm"><input v-model="reconfirmed" data-testid="customization-supplement-reconfirm" type="checkbox">我已核对最新故事、补件上下文及保留的输入，确认再次提出要求。</label>
                <div class="supply-actions"><button type="button" class="outline" data-testid="customization-supplement-add" :disabled="supplementItems.length >= detail.template_snapshot.fields.length" @click="supplementItems.push({field_key:'',reason:'',instruction:''})">添加补充项</button><button class="primary" data-testid="customization-supplement-submit" :disabled="!canSupplement">发送逐项补充要求</button></div>
              </fieldset>
            </form>
          </section>
          <section class="supply-card" data-testid="customization-quotes">
            <div class="section-heading"><h2>平台报价与关联订单</h2><button class="outline" data-testid="customization-load-quotes" :disabled="locked" @click="ui.loadQuotes()">读取本故事的报价</button></div>
            <p class="muted">报价须由平台签约机构负责人兼具故事受理权限办理。普通收件员不能代表平台报价；独立复核仍由另一位有权人员完成。</p>
            <RouterLink v-if="detail.current_status === 'INTAKE' && supplement?.allowed_actions.includes('REQUEST_SUPPLEMENT')" :to="`/trade/quotes/new?customizationRequest=${detail.id}`" class="button-link primary" data-testid="customization-create-quote">按当前正式故事办理平台报价</RouterLink>
            <p v-else class="muted">请先处理开放补件，并在正式重提后重新受理，再办理报价。</p>
            <article v-for="q in quotes" :key="q.id" class="customization-item"><h3>{{ quoteLabels[q.current_status] }}</h3><p class="identifier">报价编号：{{ q.id }}</p><p>{{ q.source_is_current ? '引用当前正式故事版本' : '引用旧故事版本，请勿继续确认' }}</p><div class="supply-actions"><RouterLink :to="`/trade/quotes/${q.id}`" class="button-link outline">以获准买卖主体查看报价</RouterLink><RouterLink :to="`/trade/reviews/quotes/${q.id}`" class="button-link outline" :data-testid="`customization-review-quote-${q.id}`">由独立交易复核员查看</RouterLink><RouterLink v-if="q.order_id" :to="`/trade/orders/${q.order_id}`" class="button-link outline">查看原订单实际状态</RouterLink></div></article>
            <button v-if="quotesCursor" class="outline" :disabled="locked" @click="ui.loadQuotes(true)">继续读取报价</button>
            <p class="muted">存在订单不代表签署、付款或开工。交易明细读取仍需原有买卖方或独立复核权限。</p>
          </section>
          <section class="supply-card" data-testid="customization-history">
            <div class="section-heading"><h2>正式提交历史</h2><button class="outline" data-testid="customization-load-history" :disabled="locked" @click="ui.loadHistory()">读取正式历史</button></div>
            <div class="supply-actions"><button v-for="version in history" :key="version.id" class="outline" :disabled="locked" :data-testid="`customization-history-${version.submission_number}`" @click="ui.readHistory(version.id)">第 {{ version.submission_number }} 版 · {{ version.submitted_at }}</button></div><button v-if="historyCursor" class="outline" :disabled="locked" @click="ui.loadHistory(true)">继续读取历史</button>
            <template v-if="historyVersion"><h3 data-testid="customization-history-version">正式第 {{ historyVersion.submission_number }} 版</h3><CustomizationSubmission :attachments="files.rows.value" :attachment-busy="files.locked.value || !!files.downloading.value" @download-attachment="files.download" :request="{...detail,submission:historyVersion.submission}"/><article v-for="item in historyVersion.supplement_response?.items || []" :key="item.field_key" class="customization-item"><h3>{{ fieldLabel(item.field_key) }}</h3><p class="long-text">当时要求：{{ item.instruction }}</p><p class="long-text">当时原因：{{ item.reason }}</p><p class="long-text">正式回复：{{ historyVersion.supplement_response?.responses[item.field_key] }}</p></article></template>
          </section>
        </template>
      </main>
    </div>
  </div>
</template>

<style scoped>
.customization-item{padding:20px 0;border-top:1px solid var(--ops-border)}.customization-item label{display:block;margin-bottom:16px}.customization-item textarea{min-height:90px}.customization-workspace fieldset{border:0;padding:0;margin:0;min-width:0}.customization-back{display:inline-flex;min-height:44px;align-items:center;margin-bottom:16px;color:var(--ops-ink);font-size:14px;text-decoration:none}
.customization-workspace .customization-menu-toggle{display:none}
.customization-filter{display:flex;align-items:center;gap:12px}.customization-filter select{width:180px;margin:0}.intake-facts{grid-template-columns:1fr;margin-bottom:24px}
.customization-confirm{display:flex;align-items:flex-start;gap:10px;margin:20px 0}.customization-confirm input{margin-top:5px;flex:none}.customization-workspace table th:last-child{width:100px}
@media(max-width:760px){.customization-filter{width:100%;justify-content:space-between}.customization-filter select{width:180px}.customization-workspace .customization-menu-toggle{display:flex;width:100%;justify-content:space-between}.customization-menu:not(.expanded){display:none}.customization-menu.expanded{margin-top:12px}}
</style>
