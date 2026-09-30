<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { useSessionStore } from '@/stores/session'
import { ApiError, asApiError } from '@/api/client'
import { listInvitations, listMembers } from '@/api/modules/account'
import type { AccountCommand, CapabilityCode, Invitation, Member } from '@/api/types'
import ApiErrorAlert from '@/components/ApiErrorAlert.vue'
import WorkspaceNav from '@/components/WorkspaceNav.vue'
import '@/styles/supply.css'
import { resolveLabel } from '@/config/labels'

const session = useSessionStore(), router = useRouter()
const tab = ref<'identity' | 'invitations'>('identity')
const error = ref<ApiError | null>(null), message = ref('')
const loading = ref(false), creating = ref(false), orgName = ref(''), rename = ref('')
const invitee = ref(''), expiry = ref('')
const invitations = ref<Invitation[]>([]), invitationCursor = ref<string | null>(null), invitationsLoading = ref(false)
const members = ref<Member[]>([]), memberCursor = ref<string | null>(null), membersLoading = ref(false)
const memberError = ref<ApiError | null>(null), invitationError = ref<ApiError | null>(null)
let memberRequest = 0, invitationRequest = 0, disposed = false
const selected = computed(() => session.selected)
const owner = computed(() => selected.value?.membership.roles.includes('OWNER') && selected.value.membership.current_status === 'ACTIVE')
const allowed = (action: string) => !!selected.value?.party.allowed_actions.includes(action)
const canManage = computed(() => owner.value && selected.value?.party.kind === 'ORGANIZATION' && allowed('MANAGE_MEMBERS'))
const canRename = computed(() => owner.value && selected.value?.party.kind === 'ORGANIZATION' && allowed('READ_PARTY'))
const locked = computed(() => session.commandBusy || !!session.pending)
const capabilities: CapabilityCode[] = ['AUTHOR', 'SCRIPT_SUPPLIER', 'PRODUCER', 'MCN', 'BRAND_CLIENT']
const capStatus = (code: CapabilityCode) => selected.value?.party.capabilities.find(c => c.code === code)
const sent = computed(() => session.receipts.filter(i => i.party_id === session.selectedId))
const time = (v: string) => new Date(v).toLocaleString('zh-CN', { hour12: false })
const invitationLabels: Record<string, string> = { INVITED: '待对方确认', ACCEPTED: '已接受', DECLINED: '已拒绝', REVOKED: '已撤回', EXPIRED: '已过期' }
const memberLabels: Record<string, string> = { ACTIVE: '在职成员', SUSPENDED: '已停用', REVOKED: '已移除', INVITED: '待接受' }
const now = ref(Date.now())
const inviteReady = computed(() => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(invitee.value.trim()) && !!expiry.value && Number.isFinite(Date.parse(expiry.value)) && Date.parse(expiry.value) > now.value)
const clock = window.setInterval(() => { now.value = Date.now() }, 1000)
const expired = (row: Invitation) => row.current_status === 'EXPIRED' || (row.current_status === 'INVITED' && Date.parse(row.expires_at) <= now.value)
const canRespond = (row: Invitation) => row.current_status === 'INVITED' && !expired(row)
const statusText = (row: Invitation) => expired(row) ? '已过期' : invitationLabels[row.current_status] || row.current_status

async function refresh() {
  if (loading.value) return
  error.value = null; loading.value = true
  const s = session.capture()
  try { await Promise.all([session.loadAccount(), session.loadParties()]); if (session.current(s) && !disposed) { rename.value = selected.value?.party.display_name || ''; await Promise.all([loadReceived(), loadMembers()]) } }
  catch (e) { if (session.current(s) && !disposed) error.value = asApiError(e) }
  finally { if (!disposed) loading.value = false }
}
async function loadMembers(more = false) {
  const ticket = ++memberRequest, s = session.capture(), party = session.selectedId
  if (!s.token || !canManage.value) { members.value = []; memberCursor.value = null; return }
  memberError.value = null; membersLoading.value = true
  if (!more) { members.value = []; memberCursor.value = null }
  try {
    const res = await listMembers(s.token, party, more ? memberCursor.value : null)
    if (disposed || !session.current(s, true) || ticket !== memberRequest) return
    members.value = more ? [...members.value, ...res.data.items] : res.data.items; memberCursor.value = res.data.next_cursor
  } catch (e) { if (!disposed && session.current(s, true) && ticket === memberRequest) memberError.value = asApiError(e) }
  finally { if (!disposed && session.current(s, true) && ticket === memberRequest) membersLoading.value = false }
}
async function loadReceived(more = false) {
  const s = session.capture(), ticket = ++invitationRequest
  if (!s.token) return
  invitationError.value = null; invitationsLoading.value = true
  if (!more) { invitations.value = []; invitationCursor.value = null }
  try {
    const res = await listInvitations(s.token, more ? invitationCursor.value : null)
    if (disposed || !session.current(s) || ticket !== invitationRequest) return
    invitations.value = more ? [...invitations.value, ...res.data.items] : res.data.items; invitationCursor.value = res.data.next_cursor
  } catch (e) { if (!disposed && session.current(s) && ticket === invitationRequest) invitationError.value = asApiError(e) }
  finally { if (!disposed && session.current(s) && ticket === invitationRequest) invitationsLoading.value = false }
}
watch(() => session.selectedId, () => {
  memberRequest++; members.value = []; memberCursor.value = null; memberError.value = null
  rename.value = selected.value?.party.display_name || ''; invitee.value = ''; expiry.value = ''; message.value = ''; error.value = null
  void loadMembers()
}, { flush: 'sync' })
watch(() => selected.value?.party.display_name, name => { rename.value = name || '' })
onMounted(refresh)
onUnmounted(() => { disposed = true; memberRequest++; invitationRequest++; window.clearInterval(clock) })
async function act(command?: Omit<AccountCommand, 'key'>) {
  const s = session.capture()
  error.value = null; message.value = ''
  try {
    const res = await session.execute(command)
    if (!res || disposed || !session.current(s)) return
    if (!session.current(s, true)) { await session.loadParties(); return }
    message.value = `${res.command.label}已完成。`
    if (res.command.kind === 'create') {
      creating.value = false; orgName.value = ''
      await session.loadParties()
      while (session.nextCursor && !session.parties.some(p => p.party.id === res.data.party_id)) await session.loadMoreParties()
      if (res.data.party_id) session.selectParty(res.data.party_id)
      message.value = '机构已创建，当前为待审核。'
    } else if (res.command.kind === 'respond') {
      await Promise.all([loadReceived(), session.loadParties()])
      message.value = res.command.decision === 'ACCEPT' ? '已接受邀请，可在左侧选择该机构。' : '已拒绝邀请。'
    } else if (session.current(s, true)) {
      await session.refreshSelected()
      if (res.command.kind === 'remove') await loadMembers()
      if (res.command.kind === 'invite') { invitee.value = ''; expiry.value = ''; message.value = '邀请已发出，等待对方确认。' }
      if (res.command.kind === 'capability') message.value = '申请已提交，请查看审核状态。'
    }
  } catch (e) {
    if (disposed || !session.current(s, true)) return
    error.value = asApiError(e)
    if (error.value.status === 412 || error.value.status === 403) {
      // Invalidate authority immediately; refresh may itself fail, so do not retain writable stale data.
      if (selected.value) selected.value.party.allowed_actions = []
      await Promise.allSettled([session.loadParties(), loadReceived()])
      if (session.current(s, true)) await loadMembers()
    }
  }
}
function createOrganization() { const name = orgName.value.trim(); if (name && [...name].length <= 120) void act({ kind: 'create', label: '创建机构', name }) }
function changeName() { if (canRename.value && rename.value.trim()) void act({ kind: 'rename', label: '更新机构名称', party: session.selectedId, version: selected.value!.party.object_version, name: rename.value.trim() }) }
function apply(code: CapabilityCode) { if (owner.value && allowed('REQUEST_CAPABILITY') && !capStatus(code)) void act({ kind: 'capability', label: '申请业务能力', party: session.selectedId, code }) }
function sendInvite() {
  error.value = null
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(invitee.value.trim())) { error.value = new ApiError({ status: 400, code: 'CLIENT_ACCOUNT_ID', message: '请填写对方提供的完整账号编号。' }); return }
  if (!expiry.value || !Number.isFinite(Date.parse(expiry.value)) || Date.parse(expiry.value) <= Date.now()) { error.value = new ApiError({ status: 400, code: 'CLIENT_EXPIRY', message: '请选择将来的邀请截止时间。' }); return }
  if (canManage.value) void act({ kind: 'invite', label: '发送邀请', party: session.selectedId, account: invitee.value.trim(), expires: new Date(expiry.value).toISOString() })
}
async function confirmAction(title: string, command: Omit<AccountCommand, 'key'>) {
  const s = session.capture()
  try { await ElMessageBox.confirm(title, '请确认', { confirmButtonText: '确认', cancelButtonText: '取消', distinguishCancelAndClose: true }) }
  catch { return }
  if (!disposed && session.current(s, true) && !locked.value) await act(command)
}
async function logout() {
  try { await ElMessageBox.confirm('退出后需要重新登录。', '退出登录', { confirmButtonText: '退出', cancelButtonText: '取消' }) } catch { return }
  // Local private content is removed synchronously, before waiting for the server.
  const completion = session.logout(); await router.replace('/login'); await completion
}
async function copyAccount() {
  try { await navigator.clipboard.writeText(session.account?.id || ''); message.value = '账号编号已复制。' }
  catch { message.value = '请选中账号编号复制。' }
}
async function moreParties() { try { await session.loadMoreParties() } catch (e) { error.value = asApiError(e) } }
</script>

<template>
  <div class="workspace supply-workspace">
    <header class="topbar supply-header"><RouterLink to="/workspace" class="brand supply-brand">晶晶日上</RouterLink><span>运营与合作方工作台</span><div class="head-actions"><button :disabled="loading" @click="refresh">{{ loading ? '刷新中…' : '刷新' }}</button><button @click="logout">退出登录</button></div></header>
    <div class="layout supply-layout">
      <aside class="supply-sidebar" data-testid="card-parties"><WorkspaceNav /><div class="identity-section"><h2>以谁的身份工作</h2><p class="muted">切换后，机构操作使用所选身份。</p>
        <div class="identities"><button v-for="item in session.parties" :key="item.party.id" class="identity" :class="{ chosen: session.selectedId === item.party.id }" :aria-pressed="session.selectedId === item.party.id" :data-party="item.party.id" @click="session.selectParty(item.party.id); tab = 'identity'"><span>{{ item.party.display_name }}</span><small>{{ item.party.kind === 'PERSON' ? '个人' : '机构' }} · {{ item.membership.roles.includes('OWNER') ? '负责人' : '成员' }} · {{ resolveLabel('party-status', item.party.current_status).text }}</small></button></div>
        <p v-if="!session.loadingParties && !session.parties.length" class="muted">暂无可用身份，请刷新后重试。</p>
        <button v-if="session.nextCursor" :disabled="session.loadingParties" @click="moreParties">加载更多身份</button>
        <button v-if="session.account?.allowed_actions.includes('CREATE_ORGANIZATION')" class="outline wide" :disabled="locked" @click="creating = !creating">{{ creating ? '收起创建' : '＋ 创建机构' }}</button>
        <form v-if="creating" class="create-form" @submit.prevent="createOrganization"><label for="org-name">机构名称</label><input id="org-name" v-model="orgName" maxlength="120" required :disabled="locked" placeholder="填写机构完整名称"><p class="muted">创建后为待审核，可继续申请业务能力。</p><button class="primary wide" :disabled="locked || !orgName.trim()">提交创建</button></form>
      </div></aside>
      <main class="supply-main"><div class="supply-heading"><div><h1>{{ tab === 'invitations' ? '收到的机构邀请' : '账号与机构' }}</h1><p>{{ tab === 'invitations' ? '核对机构与邀请人后，决定是否加入。' : '管理当前身份的资料、业务能力与机构成员。' }}</p></div></div>    <section class="account-strip" data-testid="card-account"><div><strong>{{ session.account?.display_name || '正在读取账号…' }}</strong><span v-if="session.account">{{ resolveLabel('account-status', session.account.current_status).text }}</span></div><div class="account-number"><span>我的账号编号</span><code>{{ session.account?.id || '—' }}</code><button v-if="session.account" @click="copyAccount">复制</button></div></section>
    <div v-if="session.pending" class="pending" role="status"><strong>“{{ session.pending.label }}”的结果尚未确认</strong><p>请重试原操作以核对结果，暂不能提交其他修改。</p><button class="primary" :disabled="session.commandBusy" data-testid="retry-original" @click="act()">{{ session.commandBusy ? '正在核对…' : '重试原操作' }}</button></div>
    <ApiErrorAlert :error="error" testid="workspace-error" />
    <p v-if="message" class="success" role="status">{{ message }}</p>
<nav class="tabs" aria-label="账号管理"><button :class="{ active: tab === 'identity' }" @click="tab = 'identity'">当前身份</button><button :class="{ active: tab === 'invitations' }" @click="tab = 'invitations'">收到的邀请</button></nav>
        <template v-if="tab === 'identity' && selected">
          <section class="section"><div class="section-head"><div><p class="eyebrow">{{ selected.party.kind === 'PERSON' ? '个人身份' : '机构身份' }}</p><h2>{{ selected.party.display_name }}</h2></div><span class="status">{{ resolveLabel('party-status', selected.party.current_status).text }}</span></div><p class="muted break">身份编号 {{ selected.party.id }}</p><p v-if="selected.party.current_status === 'PENDING_REVIEW'" class="muted">{{ selected.party.kind === 'PERSON' ? '个人身份资料' : '机构资料' }}待审核，业务能力的审核状态请在下方分别查看。</p>
            <form v-if="canRename" class="inline-form" @submit.prevent="changeName"><div class="grow"><label for="rename">机构名称</label><input id="rename" v-model="rename" maxlength="120" required :disabled="locked"></div><button class="outline" :disabled="locked || !rename.trim() || rename === selected.party.display_name">保存名称</button></form>
          </section>
          <section class="section"><h2>业务能力</h2><p class="muted">按实际业务选择申请。提交后等待审核，成员身份本身不代表业务授权。</p><div class="table-wrap capabilities"><table><thead><tr><th>业务能力</th><th>当前状态</th><th>操作</th></tr></thead><tbody><tr v-for="code in capabilities" :key="code" class="capability"><td>{{ resolveLabel('capability-code', code).text }}</td><td><span class="status">{{ capStatus(code) ? resolveLabel('capability-status', capStatus(code)!.current_status).text : '未申请' }}</span></td><td><button v-if="!capStatus(code) && owner && allowed('REQUEST_CAPABILITY')" class="outline" :disabled="locked" @click="apply(code)">申请</button><span v-else class="muted">{{ capStatus(code) ? '以当前审核状态为准' : '当前身份不可申请' }}</span></td></tr></tbody></table></div></section>
          <div v-if="canManage" class="org-management">
            <section class="section invite-card"><h2>邀请成员</h2><p class="muted">请对方登录后提供账号编号。对方接受后才会加入；此邀请不建立经纪或商业授权。</p><form @submit.prevent="sendInvite"><div class="form-grid"><div><label for="invitee">对方的账号编号</label><input id="invitee" v-model.trim="invitee" :disabled="locked" required placeholder="由对方提供的完整账号编号" autocomplete="off"></div><div><label for="expiry">邀请截止时间（本地时间）</label><input id="expiry" v-model="expiry" type="datetime-local" :disabled="locked" required></div></div><button class="primary" :disabled="locked || !inviteReady">发送邀请</button><p v-if="!inviteReady" class="muted">请填写完整账号编号，并选择将来的截止时间。</p></form>
              <div v-if="sent.length" class="sent"><h3>本标签页发出的邀请回执</h3><p class="muted">这里只保留本标签页收到的发送结果，退出后清除；对方可能已处理，以撤回时的核对结果为准。</p><article v-for="row in sent" :key="row.invitation_id" class="list-row"><div class="grow"><p class="break">{{ row.invitee_account_id }}</p><p class="muted">{{ row.needsRefresh ? '状态可能已改变，请与对方核对' : statusText(row) }} · 截止 {{ time(row.expires_at) }}</p></div><button v-if="canRespond(row) && !row.needsRefresh" class="outline" :disabled="locked" @click="confirmAction('撤回这条成员邀请？', { kind: 'revoke', label: '撤回邀请', party: row.party_id, invitation: row.invitation_id, version: row.object_version })">撤回</button></article></div>
            </section>
            <section class="section members-card"><div class="section-head"><h2>机构成员</h2><button :disabled="membersLoading" @click="loadMembers()">刷新成员</button></div><ApiErrorAlert :error="memberError" /><p v-if="membersLoading">正在读取成员…</p><p v-else-if="!members.length && !memberError" class="muted">暂无成员。</p><div v-if="members.length" class="table-wrap"><table class="member-table"><thead><tr><th>账号编号</th><th>角色</th><th>关系状态</th><th>操作</th></tr></thead><tbody><tr v-for="row in members" :key="row.id" :data-member="row.account_id"><td class="member-id">{{ row.account_id }}</td><td>{{ row.role_code === 'OWNER' ? '负责人' : '普通成员' }}</td><td><span class="status">{{ memberLabels[row.current_status] || row.current_status }}</span></td><td><span v-if="row.role_code === 'OWNER'" class="muted">不可移除</span><button v-else-if="row.current_status === 'ACTIVE'" class="outline danger" :disabled="locked" @click="confirmAction('移除该成员的本机构访问权限？不会删除其个人账号。', { kind: 'remove', label: '移除成员', party: row.party_id, account: row.account_id, version: row.object_version })">移除</button></td></tr></tbody></table></div><button v-if="memberCursor" :disabled="membersLoading" @click="loadMembers(true)">加载更多成员</button></section>
          </div>
          <p v-else-if="selected.party.kind === 'ORGANIZATION'" class="muted">当前身份没有管理机构成员的权限。</p>
        </template>
        <section v-else-if="tab === 'invitations'" class="section"><div class="section-head"><h2>收到的成员邀请</h2><button :disabled="invitationsLoading" @click="loadReceived()">刷新邀请</button></div><p class="muted">接受前请向邀请人核对机构编号。加入机构只建立成员关系，不授予商业代理权。</p><ApiErrorAlert :error="invitationError" /><p v-if="invitationsLoading">正在读取邀请…</p><p v-else-if="!invitations.length && !invitationError" class="empty">目前没有收到邀请。</p><div v-if="invitations.length" class="table-wrap"><table class="invitation-table"><thead><tr><th>机构主体编号</th><th>邀请人账号编号</th><th>到期时间</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="row in invitations" :key="row.invitation_id" class="invitation" :data-invitation="row.invitation_id"><td class="member-id">{{ row.party_id }}</td><td class="member-id">{{ row.inviter_account_id }}</td><td class="invite-deadline">{{ time(row.expires_at) }}</td><td><span class="status">{{ row.current_status === 'INVITED' && !expired(row) ? '待你确认' : statusText(row) }}</span></td><td><div v-if="canRespond(row)" class="row-actions"><button class="primary" :disabled="locked" @click="confirmAction('确认加入该机构，成为普通成员？', { kind: 'respond', label: '接受邀请', party: row.party_id, invitation: row.invitation_id, version: row.object_version, decision: 'ACCEPT' })">接受</button><button class="outline" :disabled="locked" @click="confirmAction('拒绝这条成员邀请？', { kind: 'respond', label: '拒绝邀请', party: row.party_id, invitation: row.invitation_id, version: row.object_version, decision: 'DECLINE' })">拒绝</button></div></td></tr></tbody></table></div><button v-if="invitationCursor" :disabled="invitationsLoading" @click="loadReceived(true)">加载更多邀请</button></section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.workspace{min-height:100%;background:var(--ops-bg)}
.topbar{height:64px;min-height:64px}.head-actions{display:flex;gap:12px;margin-left:auto;align-items:center}
.workspace h1{font-size:28px;margin:0;font-weight:600}.workspace h2{font-size:20px;margin:0 0 16px;font-weight:600}.workspace h3{font-size:16px;font-weight:600}
.workspace p{line-height:1.8}.workspace button,.workspace input{font:14px var(--ops-sans)}
.workspace button{min-height:44px;padding:10px 14px;border:0;border-radius:10px;background:transparent;color:var(--ops-ink);cursor:pointer}
.workspace button:disabled{opacity:.45;cursor:not-allowed}.workspace .primary{background:var(--ops-ink);color:white;padding:11px 20px}.workspace .outline{border:1px solid var(--ops-border-strong);background:var(--ops-surface)}.workspace .danger{color:var(--ops-danger)}
.workspace .wide{width:100%;margin-top:12px}.workspace .muted{font-size:14px;color:var(--ops-text-2)}.break{overflow-wrap:anywhere}
.account-strip{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:20px 24px;font-size:14px;background:var(--ops-surface);border:1px solid var(--ops-border);border-radius:12px;margin-bottom:24px}
.account-strip strong{font-size:16px}.account-strip span{color:var(--ops-text-2);margin-left:12px}.account-number{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0}.account-number code{overflow-wrap:anywhere;font:13px var(--ops-mono)}.account-number span{margin:0}
.identity-section{margin-top:24px;padding-top:20px;border-top:1px solid var(--ops-border)}.identity-section h2{font-size:14px;margin-bottom:8px;color:var(--ops-text-2)}.identity-section>.muted{font-size:12px}
.identities{display:grid;gap:8px}.workspace .identity{text-align:left;padding:12px;border:1px solid transparent;display:grid;gap:6px;width:100%;overflow-wrap:anywhere}.identity small{font-size:12px;color:var(--ops-text-2)}.workspace .identity.chosen{background:var(--ops-accent-soft);border-color:var(--ops-border);color:var(--ops-ink)}
.tabs{display:flex;border-bottom:1px solid var(--ops-border);gap:28px;margin-bottom:20px}.tabs button{padding:8px 0 14px;color:var(--ops-text-2);border-radius:0}.tabs .active{color:var(--ops-ink);border-bottom:2px solid var(--ops-ink);font-weight:600}
.section{min-width:0;padding:24px;background:var(--ops-surface);border:1px solid var(--ops-border);border-radius:12px;margin-bottom:16px}.section>h2{border-bottom:1px solid var(--ops-border);padding-bottom:14px}.section-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}.section-head h2{margin:0}.eyebrow{font-size:14px;color:var(--ops-text-2);margin:0 0 4px}.status{font-size:12px;border-radius:6px;padding:6px 10px;color:var(--ops-ink);background:var(--ops-accent-soft);white-space:nowrap;display:inline-block}
.workspace label{font-size:14px;line-height:1.6;display:block;margin-bottom:8px}.workspace input{font-size:16px;display:block;width:100%;min-width:0;min-height:44px;padding:10px 12px;border:1px solid var(--ops-border-strong);border-radius:10px;color:var(--ops-text);background:var(--ops-surface)}
.inline-form{display:flex;align-items:flex-end;gap:12px;margin-top:20px}.grow{flex:1;min-width:0}.create-form{padding-top:16px}.form-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:20px;margin:20px 0}
.capabilities{margin-top:20px}.capabilities th:last-child{width:200px}.capabilities th:nth-child(2){width:180px}.capabilities td{vertical-align:middle}.capabilities button{min-height:36px;padding:8px 18px}
.list-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0;border-bottom:1px solid var(--ops-border)}.list-row p{margin:4px 0;font-size:16px}.list-row p.muted{font-size:14px}.sent{margin-top:24px}.invitation{padding:20px 0;border-top:1px solid var(--ops-border)}.row-actions{display:flex;gap:12px;flex-wrap:wrap}.empty{padding:30px 0;color:var(--ops-text-2)}.pending{padding:20px;background:var(--ops-gold-soft);border-radius:10px;margin-bottom:20px}.pending p{font-size:14px}.success{color:var(--ops-success);font-size:14px}
.org-management{min-width:0;display:grid;grid-template-columns:minmax(0,1.5fr) minmax(320px,1fr);gap:20px;align-items:start}.members-card{order:1}.invite-card{order:2}.invite-card .form-grid{grid-template-columns:1fr}.member-table th:nth-child(1){width:44%}.member-table th:nth-child(2){width:18%}.member-table th:nth-child(3){width:20%}.member-id{font-size:14px;overflow-wrap:anywhere}.invitation-table th:last-child{width:160px}.invite-deadline{font-variant-numeric:tabular-nums;font-size:14px}.invitation-table .row-actions{gap:8px}.invitation-table button{padding:8px 12px}.invite-card form>.primary{width:100%}
@media(max-width:1200px){.org-management{grid-template-columns:minmax(0,1fr)}.member-table{min-width:620px}}
@media(max-width:760px){.topbar{height:64px;padding:0 16px;gap:12px}.head-actions{gap:4px}.head-actions button{padding:8px}.topbar>span{display:none}.workspace h1{font-size:24px}.account-strip{padding:18px;align-items:flex-start}.account-number{gap:8px}.account-number code{font-size:12px}.section{padding:20px 18px}.section-head{flex-wrap:wrap}.identities{grid-template-columns:repeat(2,minmax(0,1fr))}.form-grid{grid-template-columns:1fr}.inline-form{align-items:stretch;flex-direction:column}.capabilities table{min-width:540px}.list-row{flex-wrap:wrap}.status{white-space:normal}.workspace .supply-sidebar{padding:12px 16px}}
@media(max-width:380px){.identities{grid-template-columns:1fr}.workspace .supply-brand{font-size:20px}.head-actions button{font-size:13px}}
</style>
