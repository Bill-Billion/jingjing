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
import '@/styles/supply.css'
import '@/styles/operations.css'

const session = useSessionStore(), ui = useCustomizationStore(), route = useRoute(), router = useRouter()
const { rows,nextCursor,detail,status,error,notice,loading,busy,pending,locked,conflicted,reconfirmed,canIntake } = storeToRefs(ui)
const requestId = computed(() => String(route.params.requestId || ''))
const statusText = {SUBMITTED:'平台待查看',INTAKE:'受理中'}
const initializing = ref(true), menuOpen = ref(false)
let disposed = false
async function loadPage() {
  if (!session.token || !session.account?.id) return
  if (requestId.value) await ui.read(requestId.value)
  else await ui.load()
}
function leave() {
  if (busy.value || pending.value) { notice.value = '本次受理结果尚未确认，请先在当前页核对并恢复原请求。'; return false }
  ui.clear(); return true
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
onUnmounted(() => { disposed = true; window.removeEventListener('beforeunload',beforeUnload); ui.clear() })
</script>

<template>
  <div class="supply-workspace operations-workspace customization-workspace" data-design="V5-R01-story-intake">
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
        <RouterLink v-if="requestId" to="/operations/customization" class="customization-back">← 返回故事收件</RouterLink>
        <div class="supply-heading">
          <div><p class="eyebrow">定制制作 · 故事收件</p><h1>{{ requestId ? detail?.submission.template_snapshot.title || '故事提交详情' : '故事收件与受理' }}</h1><p class="muted">查看用户正式提交的故事，记录开始受理的人员和时间。</p></div>
          <button class="outline" data-testid="customization-refresh" :disabled="locked || initializing" @click="loadPage">刷新当前记录</button>
        </div>
        <ApiErrorAlert :error="error" testid="customization-error"/>
        <p v-if="notice" class="supply-notice" role="status">{{ notice }}</p>
        <p v-if="initializing || loading || busy" role="status" class="muted">{{ busy ? '正在提交受理操作…' : '正在读取故事收件…' }}</p>

        <section v-if="pending && !busy" class="supply-card" data-testid="customization-pending">
          <h2>受理结果待确认</h2><p>请先核对当前状态，再恢复同一次受理。</p>
          <div class="supply-actions">
            <button class="outline" data-testid="customization-check-pending" :disabled="loading" @click="ui.checkPending">核对当前记录</button>
            <button class="primary" data-testid="customization-retry-pending" :disabled="loading || !pending.checked" @click="ui.retryPending">恢复原受理请求</button>
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

        <template v-else-if="detail">
          <div class="ops-columns">
            <CustomizationSubmission :request="detail"/>
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
                <button class="primary" data-testid="customization-intake" :disabled="!canIntake" @click="ui.intake">开始受理</button>
              </template>
              <p v-else-if="detail.current_status === 'SUBMITTED'" class="muted">当前账号可查看此提交，暂无受理操作权限。</p>
              <p v-else class="muted">受理已经开始；补件和报价将由后续流程办理。</p>
              <p class="muted">开始受理不收取费用，也不表示内容、授权或制作开工已经批准。</p>
            </section>
          </div>
        </template>
      </main>
    </div>
  </div>
</template>

<style scoped>
.customization-back{display:inline-flex;min-height:44px;align-items:center;margin-bottom:16px;color:var(--ops-ink);font-size:14px;text-decoration:none}
.customization-workspace .customization-menu-toggle{display:none}
.customization-filter{display:flex;align-items:center;gap:12px}.customization-filter select{width:180px;margin:0}.intake-facts{grid-template-columns:1fr;margin-bottom:24px}
.customization-confirm{display:flex;align-items:flex-start;gap:10px;margin:20px 0}.customization-confirm input{margin-top:5px;flex:none}.customization-workspace table th:last-child{width:100px}
@media(max-width:760px){.customization-filter{width:100%;justify-content:space-between}.customization-filter select{width:180px}.customization-workspace .customization-menu-toggle{display:flex;width:100%;justify-content:space-between}.customization-menu:not(.expanded){display:none}.customization-menu.expanded{margin-top:12px}}
</style>
