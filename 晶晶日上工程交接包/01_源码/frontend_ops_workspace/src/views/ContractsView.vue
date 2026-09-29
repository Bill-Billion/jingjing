<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Document, OfficeBuilding } from '@element-plus/icons-vue'
import { useSessionStore } from '@/stores/session'
import { useContractReader } from '@/composables/useContractReader'
import { asApiError } from '@/api/client'
import { serviceActions, serviceReasons } from '@/api/modules/contracts'
import ApiErrorAlert from '@/components/ApiErrorAlert.vue'
import ContractText from '@/components/ContractText.vue'

const session = useSessionStore(), route = useRoute(), router = useRouter()
const reader = useContractReader(() => ({ token: session.token, partyId: session.selectedId, accountId: session.account?.id || '', revision: session.revision }))
const { snapshotId, ruleId, action, snapshot, rule, readiness, error, busy, retryAt, canRead } = reader
const initializing = ref(true), now = ref(Date.now()), copyNotice = ref('')
const retrySeconds = computed(() => Math.max(0, Math.ceil((retryAt.value - now.value) / 1000)))
let timer: number | undefined
let disposed = false
const routeId = () => typeof route.params.snapshotId === 'string' ? route.params.snapshotId : ''
snapshotId.value = routeId()
const time = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false })
watch(snapshot, () => { copyNotice.value = '' }, { flush: 'sync' })
async function copyValue(value: string, label: string) {
  const source = snapshot.value
  if (!source) return
  try {
    await navigator.clipboard.writeText(value)
    if (!disposed && snapshot.value === source) copyNotice.value = `${label}已复制。`
  } catch {
    if (!disposed && snapshot.value === source) copyNotice.value = '请选中对应内容复制。'
  }
}
watch(() => route.params.snapshotId, () => {
  if (routeId() === snapshotId.value) return
  snapshotId.value = routeId()
  if (!initializing.value && snapshotId.value) void reader.loadSnapshot()
}, { flush: 'sync' })
onMounted(async () => {
  timer = window.setInterval(() => { now.value = Date.now() }, 1000)
  const captured = session.capture()
  try {
    await Promise.all([session.loadAccount(), session.loadParties()])
    // Initial identity selection changes revision. This guard intentionally checks the
    // account session; the reader captures the selected identity for its own request.
    if (disposed || !session.current(captured)) return
    if (snapshotId.value) await reader.loadSnapshot()
  } catch (cause) {
    if (!disposed && session.current(captured)) { reader.clear(); error.value = asApiError(cause) }
  } finally { if (!disposed) initializing.value = false }
})
onUnmounted(() => { disposed = true; if (timer) window.clearInterval(timer) })
async function loadContract() {
  if (!canRead.value) { await reader.loadSnapshot(); return }
  await router.replace({ name: 'contracts', params: { snapshotId: snapshotId.value } })
  await reader.loadSnapshot()
}
async function logout() {
  reader.clear()
  const completion = session.logout()
  await router.replace('/login')
  await completion
}
function chooseIdentity(event: Event) { session.selectParty((event.target as HTMLSelectElement).value) }
async function moreParties() {
  const captured = session.capture()
  try { await session.loadMoreParties() }
  catch (cause) { if (session.current(captured) && !disposed) { reader.clear(); error.value = asApiError(cause) } }
}
</script>

<template>
  <div class="contract-workspace">
    <header class="workspace-header">
      <RouterLink to="/workspace" class="brand">晶晶日上</RouterLink>
      <span class="header-context">合作工作台</span>
      <div class="header-account"><span>{{ session.account?.display_name || '我的账号' }}</span><button @click="logout">退出登录</button></div>
    </header>
    <div class="workspace-layout">
      <aside class="sidebar">
        <p class="nav-caption">工作空间</p>
        <nav aria-label="工作台导航">
          <RouterLink to="/workspace"><OfficeBuilding aria-hidden="true" />账号与机构</RouterLink>
          <RouterLink to="/contracts" class="current" aria-current="page"><Document aria-hidden="true" />合同与规则</RouterLink>
        </nav>
        <div class="identity-control"><label for="contract-party">当前工作身份</label>
          <select id="contract-party" :value="session.selectedId" :disabled="initializing" data-testid="contract-party" @change="chooseIdentity"><option value="" disabled>请选择身份</option><option v-for="item in session.parties" :key="item.party.id" :value="item.party.id">{{ item.party.display_name }}</option></select>
          <p v-if="session.selected" class="identity-kind">{{ session.selected.party.kind === 'PERSON' ? '个人身份' : '机构身份' }}</p>
          <button v-if="session.nextCursor" :disabled="session.loadingParties" @click="moreParties">加载更多身份</button>
          <RouterLink v-if="!initializing && !session.parties.length" to="/workspace">前往账号与机构选择身份</RouterLink>
        </div>
      </aside>
      <main class="contract-main" :aria-busy="!!busy || initializing">
        <div class="page-heading"><div><p class="breadcrumb">合同与规则 / 内容阅读</p><h1>指定合同与引用规则</h1><p class="subtitle">核对这份合同封存时的承诺、规则和签署事实。</p></div><RouterLink class="back-link" to="/workspace">返回工作台</RouterLink></div>
        <section class="content-card query-card" aria-labelledby="query-heading">
          <h2 id="query-heading">打开指定合同</h2>
          <form class="query-form" @submit.prevent="loadContract"><div class="field grow"><label for="snapshot-id">合同编号</label><input id="snapshot-id" v-model.trim="snapshotId" autocomplete="off" spellcheck="false" placeholder="输入有权查看的完整合同编号" data-testid="snapshot-id"></div><button type="submit" class="primary" :disabled="initializing || !!busy || !canRead || retrySeconds > 0" data-testid="read-contract">{{ busy === 'snapshot' ? '读取中…' : '读取当前合同' }}</button></form>
          <p class="helper">请使用合同相关人员提供的编号，并选择相应的工作身份。</p>
        </section>
        <ApiErrorAlert :error="error" testid="contract-error" /><p v-if="retrySeconds > 0" class="retry-notice" role="status">请在 {{ retrySeconds }} 秒后重新读取。</p>
        <div v-if="initializing" class="empty-state" role="status">正在读取账号与身份…</div>
        <div v-else-if="busy === 'snapshot'" class="empty-state" role="status">正在读取合同内容…</div>
        <div v-else-if="!snapshot && !error" class="empty-state"><Document aria-hidden="true" /><h2>从一份合同开始核对</h2><p>输入合同编号后，将在这里显示获准查看的原文。</p></div>
        <p v-if="copyNotice" class="copy-notice" role="status">{{ copyNotice }}</p>
        <template v-if="snapshot">
          <section class="content-card" data-testid="contract-details"><div class="section-heading"><h2>合同编号、版本与主体</h2><div class="status-group"><span class="status success">已封存</span><span class="status neutral" data-testid="overview-signing-status">未签署</span></div></div>
            <dl class="facts three"><div><dt>合同编号</dt><dd class="copy-value"><span>{{ snapshot.id }}</span><button class="copy-button" aria-label="复制合同编号" data-testid="copy-contract-id" @click="copyValue(snapshot.id, '合同编号')">复制</button></dd></div><div><dt>合同来源版本</dt><dd class="copy-value"><span>{{ snapshot.contract_version_id }}</span><button class="copy-button" aria-label="复制合同来源版本" @click="copyValue(snapshot.contract_version_id, '合同来源版本')">复制</button></dd></div><div><dt>内容版本</dt><dd>{{ snapshot.object_version }}</dd></div><div><dt>封存时间</dt><dd>{{ time(snapshot.created_at) }}</dd></div><div class="span-two"><dt>当事方编号</dt><dd v-for="party in snapshot.party_ids" :key="party" class="copy-value"><span>{{ party }}</span><button class="copy-button" aria-label="复制当事方编号" @click="copyValue(party, '当事方编号')">复制</button></dd></div></dl>
          </section>
          <section class="content-card"><h2>合同承诺</h2><p class="helper before-content">以下保留合同中的原有名称与内容。</p><ContractText :value="snapshot.commitments" label="合同承诺原文" /></section>
          <section class="content-card"><div class="section-heading"><h2>封存与签署事实</h2><span class="status neutral" data-testid="signing-status">未签署</span></div><dl class="facts"><div><dt>内容状态</dt><dd>已封存</dd></div><div><dt>签署状态</dt><dd>未签署</dd></div></dl><p class="helper">封存保留这份内容，不表示合同已签署、已付款或许可已生效。</p></section>
          <section class="content-card"><h2>内容指纹</h2><p class="fingerprint copy-value"><span>{{ snapshot.content_sha256 }}</span><button class="copy-button" aria-label="复制合同内容指纹" @click="copyValue(snapshot.content_sha256, '内容指纹')">复制</button></p><p class="helper">用于核对内容的校验值。</p></section>
          <section class="content-card"><h2>这份合同采用的规则</h2><p class="helper before-content">显示封存时保留的版本，可展开查看原文。</p>
            <details v-for="item in snapshot.rule_contents" :key="item.id" class="rule-copy"><summary><strong>{{ item.rule_key }}</strong><span>版本 {{ item.version }}</span></summary><dl class="facts"><div><dt>规则编号</dt><dd>{{ item.id }}</dd></div><div><dt>内容指纹</dt><dd>{{ item.content_sha256 }}</dd></div></dl><ContractText :value="item.terms" :label="`${item.rule_key}的封存原文`" /></details>
          </section>
          <section class="content-card"><h2>规则原文核对</h2><div class="query-form"><div class="field grow"><label for="rule-id">合同引用的规则</label><select id="rule-id" v-model="ruleId" data-testid="rule-id"><option v-for="item in snapshot.rule_contents" :key="item.id" :value="item.id">{{ item.rule_key }} · {{ item.version }}</option></select></div><button class="outline" :disabled="!!busy || !ruleId || retrySeconds > 0" data-testid="read-rule" @click="reader.loadRule">{{ busy === 'rule' ? '读取中…' : '读取合同引用规则' }}</button></div>
            <div v-if="rule" class="result" data-testid="rule-result"><div class="section-heading"><h3>{{ rule.rule_key }}</h3><span class="status neutral">版本 {{ rule.version }}</span></div><dl class="facts"><div><dt>规则编号</dt><dd>{{ rule.id }}</dd></div><div><dt>内容指纹</dt><dd>{{ rule.content_sha256 }}</dd></div></dl><ContractText :value="rule.terms" label="核对后的规则原文" /></div>
          </section>
          <section class="content-card"><h2>当前业务所需服务</h2><p class="helper before-content">核对所选服务在当前环境中的可用条件。</p><div class="query-form"><div class="field grow"><label for="service-action">要核对的服务</label><select id="service-action" v-model="action" data-testid="service-action"><option v-for="(label, value) in serviceActions" :key="value" :value="value">{{ label }}</option></select></div><button class="outline" :disabled="!!busy || retrySeconds > 0" data-testid="check-readiness" @click="reader.checkReadiness">{{ busy === 'readiness' ? '核对中…' : '核对业务可用条件' }}</button></div>
            <div v-if="readiness" class="service-result" :class="{ ready: readiness.current_status === 'SERVICE_READY' }" data-testid="readiness-result" role="status"><div class="section-heading"><h3>{{ serviceActions[readiness.action] }}</h3><span class="status" :class="readiness.current_status === 'SERVICE_READY' ? 'success' : 'warning'">{{ readiness.current_status === 'SERVICE_READY' ? '服务条件已满足' : '服务尚未启用' }}</span></div><p>{{ readiness.current_status === 'SERVICE_READY' ? '当前所需服务条件已满足。' : serviceReasons[readiness.reason_code] }}</p><p class="helper">{{ readiness.environment === 'SANDBOX' ? '测试环境' : '正式环境' }} · 本次检查不执行付款、实名、签署或生成，也不代表业务已获授权。</p></div>
          </section>
        </template>
      </main>
    </div>
  </div>
</template>

<style scoped>
.contract-workspace{min-height:100%;background:var(--ops-bg)}.workspace-header{min-height:72px;display:flex;align-items:center;gap:30px;padding:0 32px;border-bottom:1px solid var(--ops-border);background:var(--ops-surface)}.brand{font-size:24px;font-weight:650;letter-spacing:.08em;color:var(--ops-ink);text-decoration:none;white-space:nowrap}.header-context{font-size:14px;color:var(--ops-text-2)}.header-account{margin-left:auto;display:flex;gap:24px;align-items:center;font-size:14px;min-width:0;overflow-wrap:anywhere}.contract-workspace button{font:inherit;font-size:14px;min-height:44px;border:0;color:var(--ops-ink);background:transparent;cursor:pointer;padding:10px 14px;border-radius:10px}.contract-workspace button:disabled{opacity:.45;cursor:not-allowed}.workspace-layout{display:grid;grid-template-columns:220px minmax(0,1fr);min-height:calc(100vh - 72px)}.sidebar{padding:26px 16px;background:var(--ops-surface);border-right:1px solid var(--ops-border);min-width:0}.nav-caption{margin:0 12px 16px;color:var(--ops-text-2);font-size:12px}.sidebar nav{display:grid;gap:8px}.sidebar nav a{display:flex;align-items:center;gap:12px;color:var(--ops-text-2);text-decoration:none;min-height:46px;padding:10px 12px;border-radius:10px;font-size:14px}.sidebar svg{width:18px;height:18px;flex:none}.sidebar nav .current{background:var(--ops-accent-soft);color:var(--ops-ink);font-weight:600}.identity-control{margin-top:32px;padding-top:24px;border-top:1px solid var(--ops-border)}.identity-control label{font-size:12px;color:var(--ops-text-2)}.identity-kind{font-size:12px;color:var(--ops-text-2);margin:10px 0}.identity-control a{font-size:13px;color:var(--ops-ink)}.contract-main{min-width:0;max-width:1340px;width:100%;margin:0 auto;padding:30px 40px 64px}.page-heading{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:28px}.breadcrumb{font-size:12px;color:var(--ops-text-2);margin:0 0 14px}h1{font-size:28px;line-height:1.4;margin:0;letter-spacing:.02em}h2{font-size:18px;font-weight:600;margin:0 0 20px;line-height:1.5}h3{font-size:16px;margin:0;overflow-wrap:anywhere}.subtitle{font-size:14px;color:var(--ops-text-2);margin:12px 0 0;line-height:1.7}.back-link{color:var(--ops-ink);font-size:14px;white-space:nowrap}.content-card{padding:24px 28px;background:var(--ops-surface);border:1px solid var(--ops-border);border-radius:12px;margin:0 0 20px;min-width:0}.query-form{display:flex;align-items:flex-end;gap:16px}.grow{flex:1;min-width:0}.field label{display:block;font-size:14px;margin-bottom:10px}.contract-workspace input,.contract-workspace select{width:100%;min-width:0;min-height:46px;padding:11px 12px;color:var(--ops-text);background:var(--ops-surface);border:1px solid var(--ops-border-strong);border-radius:10px;font:14px var(--ops-sans)}.contract-workspace select{overflow:hidden;text-overflow:ellipsis}.identity-control select{margin-top:10px;font-size:13px}.contract-workspace .primary{background:var(--ops-ink);color:white;padding:12px 22px}.contract-workspace .outline{border:1px solid var(--ops-border-strong);padding:11px 18px}.helper{font-size:13px;line-height:1.8;color:var(--ops-text-2);margin:14px 0 0;overflow-wrap:anywhere}.before-content{margin:-8px 0 18px}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:20px}.section-heading h2{margin:0}.status-group{display:flex;gap:8px;flex-wrap:wrap}.copy-value{display:flex;align-items:center;gap:8px}.copy-value>span{flex:1;min-width:0;overflow-wrap:anywhere}.contract-workspace .copy-button{flex:none;font:13px var(--ops-sans);padding:8px 10px;border:1px solid var(--ops-border);background:var(--ops-surface)}.copy-notice{font-size:14px;line-height:1.8;color:var(--ops-success)}.status{display:inline-block;padding:5px 10px;border-radius:6px;font-size:12px;white-space:nowrap}.success{color:var(--ops-success);background:var(--ops-accent-soft)}.neutral{color:var(--ops-text-2);background:var(--ops-bg)}.warning{color:var(--ops-warning);background:#FAF3E6}.facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px 28px;margin:0}.facts.three{grid-template-columns:repeat(3,minmax(0,1fr))}.facts>div{min-width:0}.facts dt{font-size:13px;color:var(--ops-text-2);margin-bottom:9px}.facts dd{font-size:14px;line-height:1.8;margin:0;overflow-wrap:anywhere}.facts dd+dd{margin-top:6px}.span-two{grid-column:span 2}.fingerprint{font:14px/1.8 var(--ops-mono);overflow-wrap:anywhere;margin:0;padding:16px;background:var(--ops-bg);border-radius:8px}.rule-copy{border-top:1px solid var(--ops-border);padding:16px 0}.rule-copy:last-child{padding-bottom:0}.rule-copy summary{cursor:pointer;line-height:1.8;font-size:14px;overflow-wrap:anywhere}.rule-copy summary span{color:var(--ops-text-2);margin-left:14px}.rule-copy .facts{margin:20px 0}.result{padding-top:24px;margin-top:24px;border-top:1px solid var(--ops-border)}.result .facts{margin-bottom:18px}.service-result{margin-top:24px;padding:20px;background:#FBF8F1;border:1px solid var(--ops-border);border-radius:10px}.service-result.ready{background:var(--ops-accent-soft)}.service-result .section-heading{margin-bottom:12px}.service-result p{font-size:14px;line-height:1.8}.service-result .helper{font-size:13px}.retry-notice{font-size:14px;color:var(--ops-warning);line-height:1.8}.empty-state{padding:54px 24px;text-align:center;color:var(--ops-text-2);font-size:14px;line-height:1.8}.empty-state>svg{width:32px;height:32px;color:var(--ops-ink);margin-bottom:15px}.empty-state h2{color:var(--ops-text);margin-bottom:8px}
@media(max-width:1050px){.contract-main{padding:26px 24px 48px}.workspace-layout{grid-template-columns:200px minmax(0,1fr)}.content-card{padding:22px}.facts.three{grid-template-columns:repeat(2,minmax(0,1fr))}.span-two{grid-column:auto}.page-heading{align-items:flex-start}.back-link{margin-top:6px}}
@media(max-width:760px){.workspace-header{padding:14px 18px;gap:16px;flex-wrap:wrap;min-height:64px}.brand{font-size:21px}.header-context{display:none}.header-account{gap:10px}.header-account>span{display:none}.workspace-layout{grid-template-columns:1fr}.sidebar{border-right:0;border-bottom:1px solid var(--ops-border);padding:14px 18px}.nav-caption{display:none}.sidebar nav{display:flex;gap:10px}.sidebar nav a{flex:1}.identity-control{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:14px;padding-top:14px}.identity-control select{flex:1;width:auto;margin:0;max-width:calc(100% - 90px)}.identity-kind{display:none}.contract-main{padding:24px 16px 48px}.page-heading{display:block;margin-bottom:22px}.page-heading h1{font-size:24px}.back-link{display:inline-block;margin-top:12px}.content-card{padding:20px 18px}.query-form{flex-direction:column;align-items:stretch;gap:12px}.query-form button{width:100%}.facts,.facts.three{grid-template-columns:1fr;gap:18px}.section-heading{flex-wrap:wrap;gap:10px}.service-result{padding:16px}.header-account button{padding-right:0}}
</style>
