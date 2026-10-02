<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { useSupply } from '@/composables/useSupply'
import { ApiError, asApiError } from '@/api/client'
import { creditRoles, getSupplyAsset, mediaTypes, recordTitle, shortSupplyId, supplyStatus, validSupplyId, type Credit, type Decision, type MediaType, type ProfileRecord, type SupplyAsset, type SupplyRecord, type WorkRecord } from '@/api/modules/supply'
import { canAdaptBinding, getLicense, listLicense, type LicenseRecord } from '@/api/modules/licensing'
import ApiErrorAlert from '@/components/ApiErrorAlert.vue'
import SupplyUpload from '@/components/SupplyUpload.vue'
import SupplyRecordPanel from '@/components/SupplyRecordPanel.vue'
import WorkspaceNav from '@/components/WorkspaceNav.vue'
import '@/styles/supply.css'

const session = useSessionStore(), route = useRoute(), router = useRouter()
const reviewer = computed(() => route.name === 'supply-review')
const reviewChannel = computed(() => String(route.params.channel || 'profile'))
const profilePage = computed(() => route.name === 'supply-profile' || reviewer.value && reviewChannel.value === 'profile')
const adaptationPage = computed(() => route.name === 'supply-adaptation')
const formPage = computed(() => route.name === 'supply-new' || route.name === 'supply-revision' || adaptationPage.value)
const targetId = computed(() => typeof route.params.recordId === 'string' ? route.params.recordId : '')
const kind = computed(() => profilePage.value ? 'PROFILE' as const : 'WORK_VERSION' as const)
const canOwn = computed(() => !!session.selected && session.selected.membership.current_status === 'ACTIVE' && session.selected.membership.roles.includes('OWNER') && !['SUSPENDED','CLOSED'].includes(session.selected.party.current_status))
const ui = useSupply(() => ({ token: session.token, accountId: session.account?.id || '', partyId: reviewer.value ? null : session.selectedId, revision: session.revision, scope: route.fullPath }))
const { rows, history, detail, nextCursor, assets, error, notice, pending, writing, reading, busy, securityRevision, conflictRevision, retryAt } = ui
const initializing = ref(true), pageLoading = ref(false), latestProfile = ref<ProfileRecord | null>(null)
const showProfileForm = ref(false), profileName = ref(''), description = ref(''), profileEvidence = ref<string[]>([])
const workTitle = ref(''), contentId = ref(''), workEvidence = ref<string[]>([]), baseWork = ref<WorkRecord | null>(null)
const adaptationBinding = ref<LicenseRecord | null>(null), adaptationGrant = ref<LicenseRecord | null>(null), adaptationProject = ref<LicenseRecord | null>(null)
type CreditDraft = { party_id: string; role: keyof typeof creditRoles | ''; evidence_asset_ids: string[] }
const emptyCredit = (): CreditDraft => ({ party_id: '', role: '', evidence_asset_ids: [] })
const credits = ref<CreditDraft[]>([emptyCredit()]), decision = ref<Decision | ''>(''), reason = ref(''), withdrawalReason = ref(''), showWithdrawal = ref(false), conflictAcknowledged = ref(false)
const now = ref(Date.now()), retrySeconds = computed(() => Math.max(0, Math.ceil((retryAt.value - now.value) / 1000)))
const locked = computed(() => !!pending.value || writing.value || retrySeconds.value > 0)
const projectAdaptation = computed(() => adaptationPage.value || baseWork.value?.data.version.content.kind === 'PROJECT_ADAPTATION')
const adaptationAllowed = computed(() => !!adaptationBinding.value && !!adaptationGrant.value && !!adaptationProject.value && canAdaptBinding(adaptationBinding.value,adaptationGrant.value,adaptationProject.value,session.selectedId,now.value))
const eligible = computed(() => canOwn.value && latestProfile.value?.current_status === 'APPROVED' && (!projectAdaptation.value || adaptationAllowed.value))
const title = computed(() => reviewer.value ? reviewChannel.value === 'profile' ? targetId.value ? '核对供给申请' : '供给申请审核队列' : reviewChannel.value === 'rights' ? '权属审核' : '内容审核' : profilePage.value ? '供给申请' : formPage.value ? projectAdaptation.value ? baseWork.value ? '创建项目改稿新修订' : '按许可提交项目改稿' : baseWork.value ? '创建新修订' : '新投稿' : targetId.value ? '作品版本详情' : '我的作品与版本')
const subtitle = computed(() => reviewer.value ? '读取可审核记录，服务器核对权限。每条结论独立记录，不能审核自己或本人所属机构的材料。' : profilePage.value ? '提交作品供给资料，查看审核意见并补正。' : formPage.value ? projectAdaptation.value ? '按已绑定许可填写新稿和权利材料，先保存草稿，再提交独立双审。' : '填写原作与权利材料，先保存草稿，再提交审核。' : '管理自己的稿件、历史修订和审核意见。')
const channelCode = computed(() => reviewChannel.value === 'rights' ? 'RIGHTS' as const : 'CONTENT' as const)
const reviewable = computed(() => !!detail.value && (detail.value.kind === 'PROFILE' ? detail.value.current_status === 'PENDING_REVIEW' : detail.value.data.version.current_status === 'SUBMITTED' && !detail.value.data.version.reviews.some(r => r.channel === channelCode.value)))
const evidenceOptions = computed(() => Object.values(assets.value).filter(a => a.purpose === 'RIGHTS_EVIDENCE'))
const profileValid = computed(() => !!profileName.value.trim() && !!description.value.trim() && profileEvidence.value.length > 0 && profileEvidence.value.every(id => assets.value[id]?.current_status === 'READY'))
const workValid = computed(() => !!workTitle.value.trim() && !!contentId.value && assets.value[contentId.value]?.purpose === 'WORK_CONTENT' && workEvidence.value.length > 0 && workEvidence.value.every(id => assets.value[id]?.purpose === 'RIGHTS_EVIDENCE') && credits.value.length > 0 && credits.value.some(c => c.role === 'RIGHTS_HOLDER') && credits.value.every(c => validSupplyId(c.party_id) && !!c.role && c.evidence_asset_ids.length > 0 && c.evidence_asset_ids.every(id => assets.value[id]?.purpose === 'RIGHTS_EVIDENCE')) && new Set(credits.value.map(c => c.party_id + ':' + c.role)).size === credits.value.length)
const queueRows = computed(() => !reviewer.value || profilePage.value ? rows.value : rows.value.filter(r => r.kind === 'WORK_VERSION' && r.data.version.current_status === 'SUBMITTED' && !r.data.version.reviews.some(review => review.channel === channelCode.value)))
let disposed = false, pageTicket = 0, clock: number | undefined
function resetForms() { pageTicket++; history.value = []; latestProfile.value = null; showProfileForm.value = false; profileName.value = ''; description.value = ''; profileEvidence.value = []; workTitle.value = ''; contentId.value = ''; workEvidence.value = []; baseWork.value = null; adaptationBinding.value=adaptationGrant.value=adaptationProject.value=null; credits.value = [emptyCredit()]; decision.value = ''; reason.value = ''; withdrawalReason.value = ''; showWithdrawal.value = false; conflictAcknowledged.value = false }
watch(securityRevision, resetForms, { flush: 'sync' })
watch(conflictRevision, () => { decision.value = ''; withdrawalReason.value = ''; showWithdrawal.value = false; conflictAcknowledged.value = false }, { flush: 'sync' })
watch(() => [route.fullPath, session.selectedId, session.revision], () => { if (!initializing.value) void loadPage() })
onMounted(async () => {
  clock = window.setInterval(() => { now.value = Date.now() }, 1000)
  const captured = session.capture()
  try { await Promise.all([session.loadAccount(), session.loadParties()]); if (!disposed && session.current(captured)) { initializing.value = false; await loadPage() } }
  catch (cause) { if (!disposed && session.current(captured)) { ui.clear(); error.value = asApiError(cause) } }
  finally { if (!disposed) initializing.value = false }
})
onUnmounted(() => { disposed = true; if (clock) window.clearInterval(clock) })
function leavePending() {
  if (!pending.value) return true
  notice.value='原操作的结果还未核对，暂不能切换页面。请先重试原操作；明确冲突请先完成核对。'
  return false
}
onBeforeRouteLeave(leavePending)
onBeforeRouteUpdate(leavePending)
async function loadAdaptation(bindingId: string | null, previous: WorkRecord | null = null) {
  adaptationBinding.value=adaptationGrant.value=adaptationProject.value=null
  const result = await ui.read('adaptation-authorization',async(i,signal)=>{
    const candidates: LicenseRecord[]=[]
    if(bindingId){if(!validSupplyId(bindingId))throw new ApiError({status:400,code:'CLIENT_RECORD_INVALID',message:'请从真实项目绑定进入改稿。'});candidates.push(await getLicense(i,bindingId,'BINDING',signal))}
    else if(previous?.data.version.content.kind==='PROJECT_ADAPTATION'){
      let cursor:string|null=null;const seen=new Set<string>()
      do{const page=await listLicense(i,'BINDING',false,cursor,signal);candidates.push(...page.items.filter(r=>r.kind==='BINDING'&&r.data.work_version_id===previous.data.version.content.source_version_id&&r.data.project_id===previous.data.version.content.project_id));cursor=page.next_cursor;if(cursor&&seen.has(cursor))throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'绑定分页位置没有更新，请重新读取。'});if(cursor)seen.add(cursor)}while(cursor)
    }
    for(const binding of candidates){
      if(binding.kind!=='BINDING'||binding.current_status!=='ACTIVE'||binding.owner_party_id!==i.partyId||!binding.parent_id)continue
      const grant=await getLicense(i,binding.parent_id,'GRANT',signal),project=await getLicense(i,binding.data.project_id,'PROJECT',signal)
      if(i.partyId && canAdaptBinding(binding,grant,project,i.partyId))return{binding,grant,project}
    }
    throw new ApiError({status:409,code:'PROJECT_LICENSE_NOT_READY',message:'项目改稿需要当前身份有效的改稿权、项目绑定及开发期限。'})
  })
  if(result){adaptationBinding.value=result.binding;adaptationGrant.value=result.grant;adaptationProject.value=result.project}
  return result
}
async function loadPage() {
  const ticket = ++pageTicket, current = () => !disposed && ticket === pageTicket
  pageLoading.value = true; decision.value = ''; reason.value = ''; showWithdrawal.value = false
  try {
    if (!reviewer.value && !canOwn.value) { ui.clear(); error.value = new ApiError({ status: 403, code: 'SUPPLY_PARTY_FORBIDDEN', message: '请使用有效负责人身份。' }); return }
    if (targetId.value && !validSupplyId(targetId.value)) { error.value = new ApiError({ status: 400, code: 'CLIENT_RECORD_INVALID', message: '记录编号不完整，请从列表重新进入。' }); return }
    if (!reviewer.value) {
      const profiles = await ui.loadAll('PROFILE'); if (!current() || !profiles) return
      latestProfile.value = profiles.filter((r): r is ProfileRecord => r.kind === 'PROFILE').sort((a,b) => b.revision - a.revision)[0] || null
      if (profilePage.value) {
        history.value = profiles.sort((a,b) => b.revision - a.revision); rows.value = history.value
        if (!profiles.length) showProfileForm.value = true
      }
    }
    if (adaptationPage.value) { await loadAdaptation(String(route.params.bindingId || '')); return }
    if (targetId.value) {
      const row = await ui.loadRecord(targetId.value, kind.value); if (!current() || !row) return
      if (formPage.value && row.kind === 'WORK_VERSION') {
        const all = await ui.loadAll('WORK_VERSION'); if (!current() || !all) return
        const latest = all.filter((r): r is WorkRecord => r.kind === 'WORK_VERSION' && r.stream_ref === row.stream_ref).sort((a,b) => b.revision - a.revision)[0]
        if (!latest) { error.value = new ApiError({ status: 409, code: 'PROJECT_LICENSE_NOT_READY', message: '当前不能创建项目改稿。' }); return }
        baseWork.value = latest; workTitle.value = latest.data.version.content.title
        if (latest.data.version.content.kind === 'PROJECT_ADAPTATION') { await loadAdaptation(null,latest); if (!current() || !adaptationAllowed.value) return }
        const ready = await ui.read('revision-materials', (i, signal) => Promise.all([...new Set([latest.data.version.content.content_asset_id, ...latest.data.version.content.evidence_ids, ...latest.data.credits.flatMap(c => c.evidence_asset_ids)])].map(id => getSupplyAsset(i,id,signal))))
        if (!current() || !ready) return
        for (const asset of ready) assets.value[asset.id] = asset
        contentId.value = latest.data.version.content.content_asset_id; workEvidence.value = [...latest.data.version.content.evidence_ids]; credits.value = latest.data.credits.map(c => ({ ...c, evidence_asset_ids: [...c.evidence_asset_ids] }))
        history.value = all.filter(r => r.stream_ref === row.stream_ref).sort((a,b) => b.revision - a.revision)
      } else {
        const all = await ui.loadAll(kind.value); if (current() && all) history.value = all.filter(r => r.stream_ref === row.stream_ref).sort((a,b) => b.revision - a.revision)
      }
    } else if (!formPage.value && (reviewer.value || !profilePage.value)) await ui.loadList(kind.value)
  } finally { if (current()) pageLoading.value = false; else if (!disposed && !busy.value) pageLoading.value = false }
}
async function startProfile() {
  if (locked.value) return
  showProfileForm.value = true; profileName.value = latestProfile.value?.data.display_name || ''; description.value = latestProfile.value?.data.description || ''; profileEvidence.value = []
  if (latestProfile.value) {
    const previous = latestProfile.value
    const ready = await ui.read('profile-materials', (i, signal) => Promise.all(previous.data.evidence_asset_ids.map(id => getSupplyAsset(i,id,signal))))
    if (ready) { for (const asset of ready) assets.value[asset.id] = asset; profileEvidence.value = ready.map(a => a.id) }
  }
}
async function upload(file: File, mediaType: MediaType, destination: 'profile' | 'content' | 'work' | CreditDraft) {
  const purpose = destination === 'content' ? 'WORK_CONTENT' : 'RIGHTS_EVIDENCE'
  await ui.write({ kind: 'ASSET', label: '上传材料', path: `/supply/assets?${new URLSearchParams({ purpose, media_type: mediaType })}`, blob: file, purpose, mediaType }, result => {
    const asset = result as SupplyAsset
    if (destination === 'profile') profileEvidence.value = [...new Set([...profileEvidence.value, asset.id])]
    else if (destination === 'content') contentId.value = asset.id
    else { workEvidence.value = [...new Set([...workEvidence.value, asset.id])]; if (typeof destination === 'object') destination.evidence_asset_ids = [...new Set([...destination.evidence_asset_ids, asset.id])] }
  })
}
async function saveProfile() {
  if (!profileValid.value || !canOwn.value) return
  await ui.write({ kind: 'PROFILE', label: '提交供给申请', path: '/supply/profiles', body: { display_name: profileName.value.trim(), description: description.value.trim(), evidence_asset_ids: [...profileEvidence.value], previous_profile_id: latestProfile.value?.id || null } }, result => { showProfileForm.value = false; void router.push(`/supply/profiles/${result.id}`) })
}
async function saveWork() {
  if (!workValid.value || !eligible.value) return
  if (projectAdaptation.value) { await loadAdaptation(adaptationBinding.value?.id || null, baseWork.value); if (!workValid.value || !eligible.value) return }
  const association = projectAdaptation.value && adaptationBinding.value?.kind === 'BINDING' ? {kind:'PROJECT_ADAPTATION' as const,source_version_id:adaptationBinding.value.data.work_version_id,project_id:adaptationBinding.value.data.project_id} : {kind:'ORIGINAL' as const,source_version_id:null,project_id:null}
  await ui.write({ kind: 'WORK_VERSION', label: '保存草稿', path: '/supply/work-versions', body: { work_id: baseWork.value?.stream_ref || null, previous_version_id: baseWork.value?.id || null, title: workTitle.value.trim(), ...association, content_asset_id: contentId.value, evidence_ids: [...workEvidence.value], credits: credits.value.map(c => ({ party_id: c.party_id.trim(), role: c.role, evidence_asset_ids: [...c.evidence_asset_ids] })) as Credit[] } }, result => { void router.push(`/supply/works/${result.id}`) })
}
async function workAction(action: 'SUBMIT' | 'WITHDRAW') {
  const row = detail.value
  if (row?.kind !== 'WORK_VERSION' || action === 'SUBMIT' && !eligible.value || action === 'WITHDRAW' && !withdrawalReason.value.trim()) return
  await ui.write({ kind: 'WORK_VERSION', label: action === 'SUBMIT' ? '提交审核' : '撤回版本', path: `/supply/work-versions/${row.id}/actions`, targetId: row.id, version: row.object_version, body: { action, reason: action === 'WITHDRAW' ? withdrawalReason.value.trim() : null } }, () => { showWithdrawal.value = false; withdrawalReason.value = '' })
}
async function submitReview() {
  const row = detail.value
  if (!reviewer.value || !row || !decision.value || !reason.value.trim() || !reviewable.value) return
  await ui.write({ kind: row.kind, label: row.kind === 'PROFILE' ? '记录供给审核' : channelCode.value === 'RIGHTS' ? '记录权属审核' : '记录内容审核', path: `/supply/${row.kind === 'PROFILE' ? 'profiles' : 'work-versions'}/${row.id}/reviews`, targetId: row.id, version: row.object_version, body: { decision: decision.value, reason: reason.value.trim(), ...(row.kind === 'WORK_VERSION' ? { channel: channelCode.value } : {}) } }, () => { decision.value = ''; reason.value = '' })
}
function recordPath(row: SupplyRecord) { return reviewer.value ? `/supply/reviews/${reviewChannel.value}/${row.id}` : row.kind === 'PROFILE' ? `/supply/profiles/${row.id}` : `/supply/works/${row.id}` }
async function logout() { ui.clear(); const completion = session.logout(); await router.replace('/login'); await completion }
function selectParty(event: Event) { session.selectParty((event.target as HTMLSelectElement).value) }
async function moreIdentities() { try { await session.loadMoreParties() } catch (e) { ui.clear(); error.value = asApiError(e) } }
</script>

<template>
  <div class="supply-workspace">
    <header class="supply-header"><RouterLink class="supply-brand" to="/workspace">晶晶日上</RouterLink><span>合作工作台</span><div class="account-actions"><span class="account-name">{{ session.account?.display_name || '我的账号' }}</span><button @click="logout">退出登录</button></div></header>
    <div class="supply-layout"><aside class="supply-sidebar"><WorkspaceNav />
      <div class="supply-identity" v-if="!reviewer"><label for="supply-party">当前工作身份</label><select id="supply-party" :value="session.selectedId" :disabled="initializing" @change="selectParty"><option value="" disabled>请选择身份</option><option v-for="item in session.parties" :key="item.party.id" :value="item.party.id">{{ item.party.display_name }}</option></select><p class="muted">{{ session.selected?.party.kind === 'PERSON' ? '个人身份' : '机构身份' }} · 当前供给资料由负责人办理</p><button v-if="session.nextCursor" @click="moreIdentities">加载更多身份</button></div><div v-else class="supply-identity"><p>审核工作区</p><p class="muted">按当前账号核对独立审核权限，不使用机构身份代为审批。</p></div>
    </aside><main class="supply-main" :aria-busy="initializing || busy || pageLoading"><div class="supply-heading"><div><h1>{{ title }}</h1><p>{{ subtitle }}</p></div><div><button class="outline" :disabled="initializing || busy" @click="loadPage">刷新记录</button><RouterLink v-if="!reviewer && !profilePage && !formPage" to="/supply/works/new" class="button-link primary">新投稿</RouterLink></div></div>
      <nav v-if="reviewer && !profilePage" class="loaded-tabs" aria-label="独立审核轨道"><RouterLink to="/supply/reviews/rights" :class="{ active: reviewChannel === 'rights' }">权属审核</RouterLink><RouterLink to="/supply/reviews/content" :class="{ active: reviewChannel === 'content' }">内容审核</RouterLink></nav>
      <p v-if="notice" class="supply-notice" role="status">{{ notice }}</p><ApiErrorAlert :error="error" testid="supply-error" /><p v-if="retrySeconds > 0" class="muted">请在 {{ retrySeconds }} 秒后重新读取或核对。</p>
      <section v-if="pending" class="supply-warning" role="status"><strong>{{ pending.command.label }}{{ writing ? '处理中' : pending.state === 'blocked' ? '需要核对' : '结果尚待核对' }}</strong><p>{{ pending.state === 'blocked' ? '请先刷新查看记录或联系维护人员核对，不要重复提交。上传需核对时，请先确认私有材料的实际状态。' : '本次内容和操作编号已保留。核对完成前暂不能提交其他操作。' }}</p><button v-if="!writing && pending.state !== 'blocked'" class="outline" :disabled="retrySeconds > 0" @click="ui.retry">{{ pending.state === 'refresh' ? '重新读取当前状态' : '重试原操作' }}</button><template v-if="pending.state === 'blocked'"><label><input v-model="conflictAcknowledged" type="checkbox">我已查看当前记录，并完成必要核对</label><button :disabled="!conflictAcknowledged" @click="ui.acknowledgeConflict(); loadPage()">完成核对，重新填写</button></template></section>
      <div v-if="initializing || pageLoading" class="supply-empty" role="status">正在读取当前资料…</div>
      <div v-else :key="route.fullPath + securityRevision">
        <p v-if="!reviewer && !profilePage && !eligible" class="supply-warning">{{ projectAdaptation && latestProfile?.current_status === 'APPROVED' ? '项目绑定许可当前尚未核验可用，请核对改稿权、项目范围与开发截止。' : latestProfile ? `当前供给申请${supplyStatus[latestProfile.current_status]}，通过后才能创建或提交作品。` : '请先提交供给申请，获批后才能创建或提交作品。' }} <RouterLink to="/supply/profiles">查看供给申请</RouterLink></p>
        <template v-if="!targetId && !formPage && !showProfileForm">
          <section class="supply-card"><div class="section-heading"><h2>{{ profilePage ? '申请记录' : '作品版本记录' }}</h2><button v-if="profilePage && !reviewer && canOwn" class="primary" :disabled="locked" @click="startProfile">{{ latestProfile ? '更新或补正申请' : '填写供给申请' }}</button><span class="muted">{{ reviewer && !profilePage ? '仅显示已加载记录中尚无本轨结论的版本' : '显示当前已加载记录' }}</span></div><div v-if="queueRows.length" class="table-wrap"><table><thead><tr><th>{{ profilePage ? '申请名称' : '作品标题' }}</th><th>{{ reviewer ? '主体编号' : profilePage ? '记录编号' : '作品编号' }}</th><th style="width:80px">修订</th><th style="width:120px">状态</th><th style="width:100px">查看</th></tr></thead><tbody><tr v-for="row in queueRows" :key="row.id"><td>{{ recordTitle(row) }}</td><td class="identifier" :title="reviewer ? row.owner_party_id : profilePage ? row.id : row.stream_ref" :aria-label="reviewer ? row.owner_party_id : profilePage ? row.id : row.stream_ref">{{ shortSupplyId(reviewer ? row.owner_party_id : profilePage ? row.id : row.stream_ref) }}</td><td>{{ row.revision }}</td><td><span class="supply-badge">{{ supplyStatus[row.current_status] }}</span></td><td><RouterLink :to="recordPath(row)" class="button-link table-link">{{ reviewer ? '进入核对' : '查看详情' }}</RouterLink></td></tr></tbody></table></div><p v-else class="supply-empty">{{ error ? '记录暂未读取成功。' : '当前没有可展示的记录。' }}</p><div v-if="nextCursor" class="supply-actions"><button class="outline" :disabled="busy || locked" @click="ui.loadList(kind, true)">加载更多</button></div></section>
        </template>
        <template v-if="profilePage && !reviewer && canOwn && (showProfileForm || !targetId && !latestProfile && !error)">
          <section class="supply-card"><h2>{{ latestProfile ? '补正或更新申请' : '填写供给申请' }}</h2><p class="muted">当前以 {{ session.selected?.party.display_name }} 的{{ session.selected?.party.kind === 'PERSON' ? '个人' : '机构' }}身份提交。</p><p v-if="latestProfile?.current_status === 'APPROVED'" class="supply-warning">更新后会产生待审核的新申请，新的投稿需等待最新申请再次通过。</p><form @submit.prevent="saveProfile"><fieldset :disabled="locked"><div class="supply-field"><label class="field-label" for="profile-name">供给展示名称 <span class="required">*</span></label><input id="profile-name" v-model="profileName" maxlength="120" required></div><div class="supply-field"><label class="field-label" for="profile-description">简介 <span class="required">*</span></label><textarea id="profile-description" v-model="description" maxlength="2000" required placeholder="说明作品来源和供给范围" /></div><SupplyUpload label="申请权利材料" :ids="profileEvidence" :disabled="locked" @upload="(file, type) => upload(file, type, 'profile')" @remove="id => profileEvidence = profileEvidence.filter(x => x !== id)" /><dl class="supply-facts" style="margin-top:24px"><div><dt>上一修订</dt><dd><span v-if="latestProfile" :title="latestProfile.id" :aria-label="latestProfile.id">{{ shortSupplyId(latestProfile.id) }}</span><template v-else>首次申请，无上一修订</template></dd></div></dl><div class="supply-actions"><button class="primary" :disabled="!profileValid || locked">提交申请</button><button type="button" :disabled="locked" @click="showProfileForm = false">收起填写</button><span class="muted">名称、简介和已上传权利材料均必填。</span></div></fieldset></form></section>
        </template>
        <template v-if="formPage && canOwn">
          <form @submit.prevent="saveWork"><fieldset :disabled="locked || !eligible"><section class="supply-card"><h2>作品信息</h2><div class="supply-fields"><div class="supply-field"><label class="field-label" for="work-title">作品标题 <span class="required">*</span></label><input id="work-title" v-model="workTitle" maxlength="200" required></div><div class="supply-field"><label class="field-label" for="work-kind">作品类型</label><input id="work-kind" :value="projectAdaptation ? '项目改稿（从已绑定许可进入）' : '原作'" readonly></div></div><dl class="supply-facts"><div><dt>作品编号</dt><dd><span v-if="baseWork" :title="baseWork.stream_ref" :aria-label="baseWork.stream_ref">{{ shortSupplyId(baseWork.stream_ref) }}</span><template v-else>首次保存后生成</template></dd></div><div><dt>上一作品版本</dt><dd><template v-if="baseWork">第 {{ baseWork.revision }} 版 · <span :title="baseWork.id" :aria-label="baseWork.id">{{ shortSupplyId(baseWork.id) }}</span></template><template v-else>首次投稿，无上一版本</template></dd></div></dl><p v-if="!projectAdaptation" class="muted">项目改稿请从已绑定且具有改稿权的许可进入。</p><template v-else><p v-if="!adaptationAllowed" class="supply-warning">绑定许可尚未核验有效、缺少改稿权或已过开发期，当前不能保存项目改稿。</p><dl v-if="adaptationBinding?.kind === 'BINDING'" class="supply-facts"><div><dt>许可绑定（只读）</dt><dd :title="adaptationBinding.id">{{ shortSupplyId(adaptationBinding.id) }}</dd></div><div><dt>原作来源版本（只读）</dt><dd :title="adaptationBinding.data.work_version_id">{{ shortSupplyId(adaptationBinding.data.work_version_id) }}</dd></div><div><dt>项目编号（只读）</dt><dd :title="adaptationBinding.data.project_id">{{ shortSupplyId(adaptationBinding.data.project_id) }}</dd></div><div v-if="adaptationProject?.kind === 'PROJECT'"><dt>项目名称</dt><dd>{{ adaptationProject.data.title }}</dd></div></dl><p class="muted">许可只确认改稿资格，不替你认定作者、权利人或代理。请上传本次新稿与真实权利证明；不会读取或复制卖方私有全文。</p></template></section>
          <section class="supply-card"><h2>私有正文与证明</h2><div class="uploads-grid"><SupplyUpload compact label="作品正文" :ids="contentId ? [contentId] : []" :disabled="locked || !eligible" single @upload="(file, type) => upload(file, type, 'content')" @remove="contentId = ''" /><SupplyUpload compact label="作品证明材料" :ids="workEvidence" :disabled="locked || !eligible" @upload="(file, type) => upload(file, type, 'work')" @remove="id => workEvidence = workEvidence.filter(x => x !== id)" /></div><p class="muted">每份材料不超过 8 MiB；上传确认成功后才可引用。材料仅供本人负责人及获准审核人员读取。</p></section>
          <section class="supply-card"><div class="section-heading"><h2>作者、权利人、代理权利链</h2><button type="button" class="outline" :disabled="locked || !eligible || credits.length >= 30" @click="credits.push({ party_id: '', role: '', evidence_asset_ids: [] })">添加权利关系</button></div><p class="muted">每行分别填写主体、角色和证明；至少明确一位权利人。作者、投稿人和权利人不自动视为同一人。</p><div v-for="(credit, index) in credits" :key="index" class="credit-row"><div class="section-heading"><h3>权利关系 {{ index + 1 }}</h3><button type="button" :disabled="locked" @click="credits.splice(index,1)">删除本行</button></div><div class="credit-fields"><label><span class="field-label">主体编号 <span class="required">*</span></span><div class="inline-field"><input v-model.trim="credit.party_id" :aria-label="`权利关系${index + 1}主体编号`" placeholder="准确的主体编号" required><button type="button" :disabled="locked || !session.selectedId" @click="credit.party_id = session.selectedId">使用当前身份</button></div></label><label><span class="field-label">权利角色 <span class="required">*</span></span><select v-model="credit.role" :aria-label="`权利关系${index + 1}角色`" required><option value="">请主动选择</option><option v-for="(label, value) in creditRoles" :key="value" :value="value">{{ label }}</option></select></label></div><div v-if="evidenceOptions.length" class="evidence-options"><p class="muted">选择已上传的权利证明</p><label v-for="asset in evidenceOptions" :key="asset.id"><input v-model="credit.evidence_asset_ids" type="checkbox" :value="asset.id"><span :title="asset.id" :aria-label="asset.id">{{ shortSupplyId(asset.id) }}</span></label></div><SupplyUpload compact :label="`权利关系 ${index + 1} 证明`" :ids="credit.evidence_asset_ids" :disabled="locked || !eligible" @upload="(file, type) => upload(file, type, credit)" @remove="id => credit.evidence_asset_ids = credit.evidence_asset_ids.filter(x => x !== id)" /></div><p v-if="credits.length && !credits.some(c => c.role === 'RIGHTS_HOLDER')" class="form-error">请明确至少一位权利人及其证明。</p></section><section class="supply-card"><div class="supply-actions"><button class="primary" :disabled="!workValid || !eligible || locked">保存草稿</button><RouterLink class="button-link outline" to="/supply/works">返回作品</RouterLink><p class="muted">保存后仍是草稿，需另行提交审核。</p></div></section></fieldset></form>
        </template>
        <div v-if="targetId && !formPage && detail" :class="{ 'review-layout': reviewer && profilePage }"><div><SupplyRecordPanel :record="detail" :assets="assets" :content-first="reviewer && channelCode === 'CONTENT'" :busy="busy || locked" @info="ui.assetInfo" @download="ui.download" />
          <section v-if="!reviewer && detail.kind === 'WORK_VERSION'" class="supply-card"><h2>当前版本操作</h2><div class="supply-actions"><button v-if="detail.current_status === 'DRAFT'" class="primary" :disabled="locked || !eligible" @click="workAction('SUBMIT')">提交审核</button><RouterLink :to="`/supply/works/${detail.id}/revision`" class="button-link outline">创建新修订</RouterLink><button v-if="detail.current_status !== 'WITHDRAWN'" class="danger" :disabled="locked" @click="showWithdrawal = !showWithdrawal">撤回版本</button></div><form v-if="showWithdrawal" class="supply-field" style="margin-top:22px" @submit.prevent="workAction('WITHDRAW')"><label class="field-label" for="withdrawal-reason">撤回理由 <span class="required">*</span></label><textarea id="withdrawal-reason" v-model="withdrawalReason" maxlength="1000" required :disabled="locked" /><button class="outline danger" :disabled="locked || !withdrawalReason.trim()">确认撤回当前版本</button></form><p class="muted">修改稿件或补材料请创建新修订；旧稿与旧结论会保留。</p></section>
          <section v-if="!reviewer && detail.kind === 'PROFILE'" class="supply-card"><button class="primary" :disabled="locked" @click="startProfile">从最新申请补正或更新</button></section>
        </div><section v-if="reviewer" class="supply-card review-form" :class="{ 'work-review-form': !profilePage }"><h2>{{ profilePage ? '申请审核结论' : channelCode === 'RIGHTS' ? '本轨权属结论' : '本轨内容结论' }}</h2><p class="muted">{{ profilePage ? '核对申请资料与权利材料。' : channelCode === 'RIGHTS' ? '核对权属来源及每项权利证明。' : '读取当前正文，核对内容要求。' }}</p><p v-if="!reviewable" class="supply-warning">当前版本已记录该结论或尚不能审核，请查看已有意见。</p><form @submit.prevent="submitReview"><fieldset :disabled="locked || !reviewable"><div class="supply-field"><label class="field-label" for="review-decision">审核结论 <span class="required">*</span></label><select id="review-decision" v-model="decision" required><option value="">请选择结论</option><option value="APPROVED">通过</option><option value="CHANGES_REQUESTED">要求补正</option><option value="REJECTED">拒绝</option></select></div><div class="supply-field"><label class="field-label" for="review-reason">审核理由 <span class="required">*</span></label><textarea id="review-reason" v-model="reason" maxlength="1000" required placeholder="写明已核对事实及结论依据" /></div><button class="primary" :disabled="locked || !reviewable || !decision || !reason.trim()">{{ profilePage ? '提交申请审核结论' : channelCode === 'RIGHTS' ? '提交权属结论' : '提交内容结论' }}</button></fieldset></form><p class="muted">提交时再次核对独立审核权限。其他审核轨道的结论仅供查看。</p></section></div>
        <section v-if="history.length && (targetId || showProfileForm)" class="supply-card"><h2>可查看的历史修订</h2><div v-for="row in history" :key="row.id" class="history-item"><RouterLink :to="recordPath(row)" class="button-link table-link">第 {{ row.revision }} 版 · {{ recordTitle(row) }}</RouterLink><span class="supply-badge">{{ supplyStatus[row.current_status] }}</span><template v-if="row.kind === 'PROFILE'"><p v-if="row.data.review" class="long-text">{{ row.data.review.reason }}</p></template><template v-else><p v-for="review in row.data.version.reviews" :key="review.channel" class="long-text">{{ review.channel === 'RIGHTS' ? '权属' : '内容' }} · {{ supplyStatus[review.decision] }}：{{ review.reason }}</p></template></div><p class="muted">每条意见属于对应修订，不覆盖旧版本结论。</p></section>
      </div>
    </main></div>
  </div>
</template>
