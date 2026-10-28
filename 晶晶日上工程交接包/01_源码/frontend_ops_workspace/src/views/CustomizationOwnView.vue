<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useSessionStore } from '@/stores/session'
import { useOwnStoryStore } from '@/stores/customizationOwn'
import { asApiError } from '@/api/client'
import { hasRequiredAttachment, type StoryStatus } from '@/api/modules/customizationOwn'
import WorkspaceNav from '@/components/WorkspaceNav.vue'
import ApiErrorAlert from '@/components/ApiErrorAlert.vue'
import CustomizationStoryFields from '@/components/CustomizationStoryFields.vue'
import CustomizationSubmission from '@/components/CustomizationSubmission.vue'
import '@/styles/supply.css'
import '@/styles/operations.css'

const base = '/operations/customization/mine', route = useRoute(), router = useRouter(), session = useSessionStore(), ui = useOwnStoryStore()
const {categories,categoryId,rows,nextCursor,status,detail,supplement,draftAnswers,draftResponses,fieldErrors,error,notice,loading,busy,conflicted,reconfirmed,recoveryRequired,preservedDraft,editingSupplement,pending,history,historyCursor,historyVersion,template,dirty,locked,activeIdentity,isSupplement,canEdit,canSave,canSubmit} = storeToRefs(ui)
const requestId = computed(() => String(route.params.requestId || '')), creating = computed(() => route.name === 'customization-own-new')
const initializing = ref(true), menuOpen = ref(false), submitAcknowledged = ref(false), form = ref<HTMLElement | null>(null)
const statusText = {DRAFT:'私人草稿',SUBMITTED:'平台待查看',INTAKE:'受理中'}
const title = computed(() => creating.value ? '写下本人的故事' : requestId.value ? detail.value?.template_snapshot.title || '我的故事详情' : '我的私人故事')
const editable = computed(() => creating.value || detail.value?.current_status === 'DRAFT' || isSupplement.value || preservedDraft.value)
let disposed = false
function allowDiscard() {
  if (busy.value || pending.value) { notice.value = '本次操作尚未确认，请先核对并恢复原请求后再离开。'; return false }
  return !dirty.value || window.confirm('本页有尚未保存的故事内容。离开会丢弃这些更改，确认离开？')
}
function leave() { if (!allowDiscard()) return false; ui.resetEditor(); submitAcknowledged.value = false; return true }
onBeforeRouteLeave(leave)
onBeforeRouteUpdate(leave)
function beforeUnload(e: BeforeUnloadEvent) { if (dirty.value || busy.value || pending.value) { e.preventDefault(); e.returnValue = '' } }
async function loadPage(force = false) {
  if (!session.token || !session.account?.id) return
  if (creating.value) await ui.loadCategories()
  else if (requestId.value) await ui.read(requestId.value)
  else if (force || !ui.listLoaded) await ui.load()
}
async function refresh() { if (locked.value) return; if (preservedDraft.value) { await ui.retryLatest(); return }; if (!allowDiscard()) return; if (creating.value) ui.resetEditor(); submitAcknowledged.value = false; await loadPage(true) }
function selectCategory(event: Event) {
  const element = event.target as HTMLSelectElement
  if (allowDiscard()) { ui.selectCategory(element.value); submitAcknowledged.value = false }
  element.value = categoryId.value
}
async function changeIdentity(event: Event) {
  const element = event.target as HTMLSelectElement, id = element.value
  if (allowDiscard()) { session.selectParty(id); await router.push(base) }
  element.value = session.selectedId
}
async function logout() { if (allowDiscard()) { ui.clear(); await session.logout(); await router.push('/login') } }
async function focusError() { await nextTick(); const key = Object.keys(fieldErrors.value)[0]; if (key) form.value?.querySelector<HTMLElement>(`#story-${key.replace('.', '-')}`)?.focus() }
async function save() { await ui.save(); await focusError(); if (creating.value && detail.value && !pending.value) await router.replace(`${base}/${detail.value.id}`) }
async function submit() { if (!submitAcknowledged.value) return; await ui.submit(); await focusError(); if (!pending.value) submitAcknowledged.value = false }
async function retry() { await ui.retryPending(); if (creating.value && detail.value && !pending.value) await router.replace(`${base}/${detail.value.id}`) }
function fieldLabel(key: string) { return template.value?.fields.find(f => f.key === key)?.label || key }
watch(() => [draftAnswers.value,draftResponses.value], () => { submitAcknowledged.value = false }, {deep:true})
watch(() => route.fullPath, () => { menuOpen.value = false; if (!initializing.value) void loadPage() })
watch(() => [session.token,session.account?.id,session.selectedId,session.revision], () => { submitAcknowledged.value = false; if (!initializing.value) void loadPage(true) })
onMounted(async () => {
  window.addEventListener('beforeunload',beforeUnload)
  const c = session.capture()
  try { await session.loadAccount(); if (disposed || !session.current(c)) return; await session.loadParties(); if (!disposed && session.current(c)) { initializing.value = false; await loadPage() } }
  catch(e) { if (!disposed && session.current(c)) error.value = asApiError(e) }
  finally { if (!disposed) initializing.value = false }
})
onUnmounted(() => { disposed = true; window.removeEventListener('beforeunload',beforeUnload); ui.clear() })
</script>

<template>
  <div class="supply-workspace operations-workspace own-story-workspace editorial-workspace" data-testid="own-story-page">
    <header class="supply-header"><RouterLink to="/workspace" class="supply-brand">晶晶日上</RouterLink><span>运营与合作方工作台</span><div class="account-actions"><span class="account-name">{{ session.account?.display_name || '当前账号' }}</span><button :disabled="busy || !!pending" @click="logout">退出</button></div></header>
    <div class="supply-layout">
      <aside class="supply-sidebar">
        <button class="outline story-menu-toggle" type="button" aria-controls="story-workspace-menu" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">工作区导航 · {{ menuOpen ? '收起' : '展开' }}</button>
        <div id="story-workspace-menu" class="story-menu" :class="{expanded:menuOpen}"><WorkspaceNav/><div class="supply-identity"><label for="story-party">当前故事身份</label><select id="story-party" :value="session.selectedId" :disabled="locked || initializing" @change="changeIdentity"><option v-for="p in session.parties" :key="p.party.id" :value="p.party.id">{{ p.party.display_name }}</option></select><button v-if="session.nextCursor" class="outline" :disabled="locked || session.loadingParties" @click="session.loadMoreParties">读取更多身份</button><p class="muted">只查看当前身份下由本账号创建的私人故事。</p></div></div>
      </aside>
      <main class="supply-main">
        <nav aria-label="故事模块" class="story-module-nav"><RouterLink :to="base" aria-current="page">我的故事</RouterLink><RouterLink to="/operations/customization">运营收件与受理</RouterLink></nav>
        <RouterLink v-if="requestId || creating" :to="base" class="story-back">← 返回我的故事</RouterLink>
        <div class="supply-heading"><div><p class="eyebrow">定制制作 · 本人故事</p><h1>{{ title }}</h1><p class="muted">先保存，再续写。正式提交后，平台可查看此次提交的故事版本。</p></div><button class="outline" :disabled="locked || initializing" @click="refresh">{{ creating ? '重新读取故事分类' : '刷新当前记录' }}</button></div>
        <ApiErrorAlert :error="error" testid="story-error"/>
        <p v-if="notice" class="supply-notice" role="status" data-testid="story-notice">{{ notice }}</p>
        <p v-if="initializing || loading || busy" role="status" class="muted">{{ busy ? '正在保存本次操作…' : '正在读取本人故事…' }}</p>
        <section v-if="pending" class="supply-card" data-testid="story-pending"><h2>本次操作结果待确认</h2><p>请先核对当前记录，再恢复同一次请求。此时不能另建故事、切换身份或修改原操作。</p><div class="supply-actions"><button class="outline" :disabled="loading || busy" @click="ui.checkPending">核对当前记录</button><button class="primary" :disabled="loading || busy || !pending.checked" @click="retry">恢复原操作请求</button></div></section>
        <section v-if="recoveryRequired" class="supply-card" data-testid="story-recovery"><h2>本次输入已保留，最新记录尚未读到</h2><p>下方显示本次未保存的文字。重新读取成功前暂停提交；重试不会替换你的输入。</p><button class="outline" :disabled="locked" @click="ui.retryLatest">保留本次输入并重新读取</button></section>
        <section v-if="!activeIdentity && !initializing" class="supply-card"><h2>先选择可用的故事身份</h2><p>需要当前账号在该主体下的有效成员身份，才能保存和查看自己的故事。</p><RouterLink to="/workspace" class="table-link">前往账号与机构核对身份</RouterLink></section>

        <section v-if="!creating && !requestId && activeIdentity" class="supply-card">
          <div class="ops-toolbar"><h2>我创建的故事</h2><RouterLink :to="`${base}/new`" class="story-create" data-testid="story-new">开始写故事</RouterLink><label>状态<select :value="status" :disabled="locked" @change="ui.setStatus(($event.target as HTMLSelectElement).value as StoryStatus | '')"><option value="">全部故事</option><option value="DRAFT">私人草稿</option><option value="SUBMITTED">平台待查看</option><option value="INTAKE">受理中</option></select></label></div>
          <div v-if="rows.length" class="table-wrap"><table data-testid="story-list"><thead><tr><th>故事分类</th><th>进度</th><th>最近正式提交</th><th>下一步</th></tr></thead><tbody><tr v-for="story in rows" :key="story.id"><td><strong>{{ story.category_title }}</strong><p class="identifier">{{ story.id }}</p></td><td><span class="supply-badge">{{ statusText[story.current_status] }}</span></td><td>{{ story.submitted_at ? new Date(story.submitted_at).toLocaleString('zh-CN') : '尚未正式提交' }}</td><td><RouterLink :to="`${base}/${story.id}`" class="table-link">{{ story.current_status === 'DRAFT' ? '继续填写' : '查看故事与补件进度' }}</RouterLink></td></tr></tbody></table></div>
          <div v-else-if="!loading && !error" class="supply-empty"><p>{{ status ? '当前状态下还没有本人故事。可以切换状态，或开始新故事。' : '这里还没有本人故事。选择平台已发布的分类，从文字草稿开始。' }}</p></div>
          <button v-if="nextCursor" class="outline" :disabled="locked" @click="ui.load(true)">继续读取故事</button>
        </section>

        <section v-if="creating" class="supply-card"><h2>选择故事分类</h2><p class="muted">问题来自平台当前已发布的模板。创建后保留该模板，后续续写沿用原来的问题。</p><label for="story-category">故事分类</label><select id="story-category" :value="categoryId" :disabled="locked || initializing" @change="selectCategory"><option value="" disabled>请选择故事分类</option><option v-for="category in categories" :key="category.template_version_id" :value="category.template_version_id">{{ category.template_snapshot.title }} · 模板 {{ category.template_version }}{{ category.submission_available ? '' : ' · 目前仅可存草稿' }}</option></select><p v-if="!categories.length && !loading && !initializing && !error" class="supply-empty">平台尚未发布可读取的故事模板。当前不能凭空创建分类；发布后可点击“重新读取故事分类”。</p></section>

        <section v-if="detail" class="supply-card" data-testid="story-progress"><div class="section-heading"><h2>故事进度</h2><span class="supply-badge">{{ isSupplement ? '等待本人补充' : statusText[detail.current_status] }}</span></div><p v-if="detail.current_status === 'DRAFT'">草稿已存到当前身份下，仅创建本故事的账号可继续填写。尚未发送给平台受理。</p><p v-else-if="detail.current_status === 'SUBMITTED'">平台尚未开始本次受理。正式内容已保存，受理与补件变化会在这里显示。</p><p v-else-if="isSupplement">平台已提出逐项补充要求。补件草稿不会替换上次正式内容，正式补交后会生成新版本并返回平台待查看。</p><p v-else>平台已开始受理。当前没有开放的补件要求，请等待下一步进度。</p><dl class="supply-facts"><div><dt>正式提交时间</dt><dd>{{ detail.submitted_at ? new Date(detail.submitted_at).toLocaleString('zh-CN') : '尚未提交' }}</dd></div><div><dt>受理时间</dt><dd>{{ detail.intake_at ? new Date(detail.intake_at).toLocaleString('zh-CN') : '尚未开始本次受理' }}</dd></div></dl><p class="muted">提交故事仅进入平台收件流程；报价、订单、授权与制作有各自的后续办理步骤。</p></section>

        <form v-if="editable && template" ref="form" class="supply-card story-editor" novalidate @submit.prevent="save">
          <div class="section-heading"><h2>{{ preservedDraft && !canEdit ? '本次未保存的输入' : isSupplement ? '补充这份故事' : detail ? '继续填写草稿' : template.title }}</h2><span role="status" class="muted">{{ dirty ? '有未保存更改' : detail ? '当前文字已保存' : '尚未创建' }}</span></div><p class="story-description">{{ template.description }}</p>
          <CustomizationStoryFields v-model="draftAnswers" :template="template" :errors="fieldErrors" :disabled="locked" :readonly="!canEdit"/>
          <section v-if="editingSupplement" class="story-supplement" data-testid="story-supplement-editor"><h3>逐项补充说明</h3><div v-for="item in editingSupplement.items" :key="item.field_key" class="story-response"><h4>{{ fieldLabel(item.field_key) }}</h4><p><strong>原因：</strong>{{ item.reason }}</p><p><strong>补充要求：</strong>{{ item.instruction }}</p><label :for="`story-responses-${item.field_key}`">本次如何补充或更正（正式补交必填）</label><textarea :id="`story-responses-${item.field_key}`" v-model="draftResponses[item.field_key]" rows="3" :disabled="locked" :readonly="!canEdit" :aria-invalid="!!fieldErrors[`responses.${item.field_key}`]" :aria-describedby="fieldErrors[`responses.${item.field_key}`] ? `story-response-error-${item.field_key}` : undefined"/><small class="muted">{{ Array.from(draftResponses[item.field_key] || '').length }} / 2000 字</small><p v-if="fieldErrors[`responses.${item.field_key}`]" :id="`story-response-error-${item.field_key}`" class="story-field-error" role="alert">{{ fieldErrors[`responses.${item.field_key}`] }}</p></div></section>
          <label v-if="conflicted" class="story-check"><input v-model="reconfirmed" type="checkbox" :disabled="locked">我已核对更新后的故事与补件要求，确认将本次输入保存到最新版本。</label>
          <div class="story-save"><p v-if="dirty" class="muted">未填完也可以保存。正式提交前，请先保存当前更改。</p><button type="submit" class="primary" :disabled="!canSave || (!!detail && !dirty)" data-testid="story-save">{{ creating ? '创建并保存草稿' : isSupplement ? '保存补件草稿' : '保存草稿' }}</button></div>
          <section v-if="detail" class="story-submit"><h3>{{ isSupplement ? '正式补交' : '正式提交' }}</h3><p v-if="hasRequiredAttachment(template)" class="story-attachment">此模板含必填附件，上传尚未开放。目前可保存文字草稿，暂不能正式提交。</p><template v-else><label class="story-check"><input v-model="submitAcknowledged" type="checkbox" :disabled="!canSubmit">我已核对保存的文字和{{ isSupplement ? '逐项补充说明' : '故事问题' }}，确认作为正式版本发送给平台。</label><button type="button" class="primary" :disabled="!canSubmit || !submitAcknowledged" data-testid="story-submit" @click="submit">{{ isSupplement ? '正式提交补充版本' : '正式提交故事' }}</button></template></section>
        </form>

        <template v-if="detail?.submission"><CustomizationSubmission :request="{submission:detail.submission,template_version_id:detail.template_version_id}"/><section v-if="supplement?.supplement?.current_status === 'RESPONDED'" class="supply-card" data-testid="story-supplement-responded"><h2>最近一次补件已正式提交</h2><p>{{ supplement.supplement.response?.submitted_at ? new Date(supplement.supplement.response.submitted_at).toLocaleString('zh-CN') : '' }}</p><div v-for="item in supplement.supplement.items" :key="item.field_key" class="story-response"><h3>{{ fieldLabel(item.field_key) }}</h3><p>补充要求：{{ item.instruction }}</p><p class="long-text">本次回复：{{ supplement.supplement.response?.responses[item.field_key] }}</p></div></section><section class="supply-card"><div class="section-heading"><h2>正式版本记录</h2><button class="outline" :disabled="locked" @click="ui.loadHistory()">读取版本记录</button></div><p class="muted">每次正式提交均保留当时的问题与答案。草稿不会冒充正式版本。</p><div v-for="version in history" :key="version.id" class="story-history"><span>第 {{ version.submission_number }} 版 · {{ new Date(version.submitted_at).toLocaleString('zh-CN') }}</span><button class="outline" :disabled="locked" @click="ui.readHistory(version.id)">查看此版本</button></div><button v-if="historyCursor" class="outline" :disabled="locked" @click="ui.loadHistory(true)">继续读取版本</button><template v-if="historyVersion"><h3>第 {{ historyVersion.submission_number }} 版</h3><CustomizationSubmission :request="{submission:historyVersion.submission,template_version_id:detail.template_version_id}"/><div v-if="historyVersion.supplement_response"><h3>此版本的补充说明</h3><p v-for="item in historyVersion.supplement_response.items" :key="item.field_key" class="long-text">{{ fieldLabel(item.field_key) }}：{{ historyVersion.supplement_response.responses[item.field_key] }}</p></div></template></section></template>
      </main>
    </div>
  </div>
</template>

<style scoped>
.story-module-nav{display:flex;flex-wrap:wrap;gap:24px;margin-bottom:24px;border-bottom:1px solid var(--ops-border)}.story-module-nav a{min-height:44px;display:inline-flex;align-items:center;color:var(--ops-text-2);text-decoration:none}.story-module-nav [aria-current=page]{color:var(--ops-ink);border-bottom:2px solid var(--ops-ink);font-weight:600}.story-back{display:inline-block;min-height:44px;margin-bottom:12px;line-height:44px;color:var(--ops-text-2)}.own-story-workspace .story-create{padding:12px 18px;background:var(--ops-ink);color:var(--ops-bg);text-decoration:none;border-radius:var(--ops-radius-sm)}.story-menu-toggle{display:none}.story-description,.story-response p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8}.story-editor{max-width:920px}.story-save,.story-submit,.story-supplement{border-top:1px solid var(--ops-border);margin-top:28px;padding-top:24px}.story-check{display:flex;align-items:flex-start;gap:10px;line-height:1.7;margin:20px 0}.supply-workspace .story-check input[type=checkbox]{width:18px;height:18px;min-height:18px;flex:none;margin-top:4px;padding:0}.story-response{padding:16px 0;border-bottom:1px solid var(--ops-border)}.story-response h4{font-size:16px;margin:0 0 12px}.story-response label{display:block;line-height:1.7}.story-response textarea{width:100%;min-height:100px;box-sizing:border-box}.story-field-error{color:#a0292e;line-height:1.6;font-size:13px}.story-history{display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px;align-items:center;padding:16px 0;border-bottom:1px solid var(--ops-border)}.story-attachment{padding:16px;background:var(--ops-accent-soft);line-height:1.8}.story-editor .section-heading{gap:16px;flex-wrap:wrap}#story-category{display:block;max-width:100%;width:440px;margin-top:10px}.supply-identity select{width:100%;margin:10px 0}
.own-story-workspace .story-create:hover,.own-story-workspace .story-create:focus-visible{background:var(--ops-ink);color:var(--ops-bg);text-decoration:underline;text-underline-offset:4px}
.own-story-workspace .story-create:focus-visible{outline:2px solid var(--ops-ink);outline-offset:3px}
@media(max-width:760px){.story-menu-toggle{display:flex;width:100%;justify-content:space-between;margin-bottom:12px}.story-menu{display:none}.story-menu.expanded{display:block}.story-module-nav{gap:16px}.story-module-nav a{font-size:14px}.story-editor .section-heading{align-items:flex-start}.story-editor .section-heading h2{font-size:20px}}
</style>
