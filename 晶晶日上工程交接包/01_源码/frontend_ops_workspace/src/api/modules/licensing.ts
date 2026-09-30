import { ApiError, request, requestBytes, type ApiResult } from '../client'
import { snapshotContent, type SnapshotContent } from './contracts'
import { validSupplyId, type SupplyIdentity } from './supply'

export const licenseKinds = ['PRODUCT', 'RESERVATION', 'EVIDENCE', 'GRANT', 'PROJECT', 'BINDING', 'READING'] as const
export type LicenseKind = typeof licenseKinds[number]
export const rights = { ADAPT: '改稿', PRODUCE: '制作', DISTRIBUTE: '发行', PROMOTE: '宣传', SEQUEL: '续集', AI_PROCESS: 'AI 处理', AI_TRAIN: 'AI 训练' } as const
export const purposes = { PRIVATE: '私下使用', PUBLIC_SHARE: '公开分享', COMMERCIAL: '商业使用', RELEASE: '发行' } as const
export interface Terms { exclusive: boolean; rights: (keyof typeof rights)[]; purposes: (keyof typeof purposes)[]; territories: string[]; languages: string[]; valid_from: string; development_until: string; valid_until: string; project_limit: number; episode_limit: number; terms_text: string }
export interface Money { currency: string; amount_minor: number }
export interface Verification { signed_contract_sha256: string; identity_verified: true; seller_signature_verified: true; buyer_signature_verified: true; currency: string; received_minor: number; payee_party_id: string; receipt_ref: string | null }
export interface LicenseReview { decision: 'APPROVED' | 'REJECTED'; reason: string; reviewer_account_id: string; verification: Verification | null }
export interface ProductData { work_version_id: string; title: string; preview_text: string; terms: Terms; price: Money; payment_due_minor: number; reservation_minutes: number; rule_id: string; review: LicenseReview | null; close_reason?: string }
export interface ReservationData extends ProductData { contract: SnapshotContent; expires_at: string; grant_id?: string; late_reason?: string }
export interface EvidenceData { contract_sha256: string; seller_signature_asset_id: string; buyer_signature_asset_id: string; identity_asset_id: string; payment_asset_id: string | null; external_reference: string; verification_method: 'EXTERNAL_MANUAL_REVIEW'; payment_channel_result: 'NOT_REPORTED'; review: LicenseReview | null }
export interface GrantData { work_version_id: string; terms: Terms; price: Money; contract: SnapshotContent; evidence_id: string; activated_at: string; reason: string; suspension_reason?: string }
export interface ProjectData { title: string; purpose: keyof typeof purposes; territory: string; language: string; episodes: number }
export interface BindingData { project_id: string; work_version_id: string; terms_sha256: string }
export interface ReadingData { work_version_id: string; reader_account_id: string; valid_until: string; basis_type: 'NDA' | 'EVALUATION_PERMISSION'; basis_asset_id: string; review: LicenseReview | null; allows_generation: false; close_reason?: string }
interface RecordBase { id: string; owner_party_id: string; counterparty_id: string | null; work_id: string | null; parent_id: string | null; created_by: string; object_version: number; current_status: string }
export type LicenseRecord = RecordBase & ({ kind: 'PRODUCT'; data: ProductData } | { kind: 'RESERVATION'; data: ReservationData } | { kind: 'EVIDENCE'; data: EvidenceData } | { kind: 'GRANT'; data: GrantData } | { kind: 'PROJECT'; data: ProjectData } | { kind: 'BINDING'; data: BindingData } | { kind: 'READING'; data: ReadingData })
export interface LicensePage { items: LicenseRecord[]; next_cursor: string | null }
export interface LicenseWrite { path: string; body: unknown; version?: number; targetId?: string; resultKind: LicenseKind | 'ACTIVATION'; label: string }
export interface ReadingContent { record_id: string; watermarked_text: string; allows_generation: false }
export const statuses: Record<string, string> = { IN_REVIEW: '待独立核验', LISTED: '已上架', UNLISTED: '已下架', REJECTED: '已拒绝', HELD: '已预留，未取得许可', COMMITTED: '已发放许可', CANCELLED: '已取消', REVIEW_REQUIRED: '需要人工补救，未取得许可', APPROVED: '依据已批准', ACTIVE: '已生效，请核对期限', SUSPENDED: '已暂停', REVOKED: '已撤销' }
export function recordStatus(record: Pick<LicenseRecord,'kind'|'current_status'>): string {
  if(record.current_status==='ACTIVE' && record.kind==='PROJECT')return '已登记用途'
  if(record.current_status==='ACTIVE' && record.kind==='BINDING')return '已绑定项目'
  return statuses[record.current_status] || record.current_status
}
const territoryNames:Record<string,string>={WORLD:'全球',CN:'中国',US:'美国',GB:'英国',JP:'日本',KR:'韩国',FR:'法国',DE:'德国'}
const languageNames:Record<string,string>={ALL:'全部语言',zh:'中文',en:'英语',ja:'日语',ko:'韩语',fr:'法语',de:'德语',es:'西班牙语',ru:'俄语'}
/** Labels never change the scope code used in requests or eligibility checks. */
export const territoryText = (code:string):string => territoryNames[code] ? `${territoryNames[code]}（${code}）` : code
export const languageText = (code:string):string => languageNames[code] ? `${languageNames[code]}（${code}）` : code
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown, max = 2000): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max
const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const count = (v: unknown, min = 1, max = 100000) => Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max
export const instant = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v
const values = (v: unknown, allowed: (x: unknown) => boolean) => Array.isArray(v) && v.length > 0 && v.length <= 100 && new Set(v).size === v.length && v.every(allowed)
const optionalText = (v: unknown) => v === undefined || str(v)
export function isTerms(v: unknown): v is Terms {
  return obj(v) && typeof v.exclusive === 'boolean' && values(v.rights, x => typeof x === 'string' && Object.hasOwn(rights,x)) && values(v.purposes,x => typeof x === 'string' && Object.hasOwn(purposes,x)) && values(v.territories,x => typeof x === 'string' && /^(WORLD|[A-Z]{2})$/.test(x)) && values(v.languages,x => typeof x === 'string' && /^(ALL|[a-z]{2})$/.test(x)) && instant(v.valid_from) && instant(v.development_until) && instant(v.valid_until) && Date.parse(v.valid_from) < Date.parse(v.development_until) && Date.parse(v.development_until) <= Date.parse(v.valid_until) && count(v.project_limit) && count(v.episode_limit) && str(v.terms_text,8000)
}
const money = (v: unknown): v is Money => obj(v) && typeof v.currency === 'string' && /^[A-Z]{3}$/.test(v.currency) && count(v.amount_minor,0,Number.MAX_SAFE_INTEGER)
const verification = (v: unknown): v is Verification => obj(v) && hash(v.signed_contract_sha256) && v.identity_verified === true && v.seller_signature_verified === true && v.buyer_signature_verified === true && typeof v.currency === 'string' && /^[A-Z]{3}$/.test(v.currency) && count(v.received_minor,0,Number.MAX_SAFE_INTEGER) && validSupplyId(v.payee_party_id) && (v.receipt_ref === null || str(v.receipt_ref,128))
const review = (v: unknown): v is LicenseReview | null => v === null || obj(v) && ['APPROVED','REJECTED'].includes(String(v.decision)) && str(v.reason) && validSupplyId(v.reviewer_account_id) && (v.verification === null || verification(v.verification))
const product = (v: unknown): v is ProductData => obj(v) && validSupplyId(v.work_version_id) && str(v.title,200) && str(v.preview_text) && isTerms(v.terms) && money(v.price) && count(v.payment_due_minor,0,v.price.amount_minor) && count(v.reservation_minutes,1,10080) && validSupplyId(v.rule_id) && review(v.review) && optionalText(v.close_reason)
export function isLicenseRecord(v: unknown): v is LicenseRecord {
  if (!obj(v) || !validSupplyId(v.id) || !validSupplyId(v.owner_party_id) || !validSupplyId(v.created_by) || ![v.counterparty_id,v.work_id,v.parent_id].every(x => x === null || validSupplyId(x)) || !count(v.object_version,1,Number.MAX_SAFE_INTEGER) || !obj(v.data)) return false
  const d = v.data, state = String(v.current_status)
  switch (v.kind) {
    case 'PRODUCT': return ['IN_REVIEW','LISTED','REJECTED','UNLISTED'].includes(state) && product(d)
    case 'RESERVATION': return ['HELD','COMMITTED','CANCELLED','REVIEW_REQUIRED'].includes(state) && product(d) && snapshotContent(d.contract) && instant(d.expires_at) && (d.grant_id === undefined || validSupplyId(d.grant_id)) && optionalText(d.late_reason)
    case 'EVIDENCE': return ['IN_REVIEW','APPROVED','REJECTED'].includes(state) && hash(d.contract_sha256) && [d.seller_signature_asset_id,d.buyer_signature_asset_id,d.identity_asset_id].every(validSupplyId) && (d.payment_asset_id === null || validSupplyId(d.payment_asset_id)) && str(d.external_reference,128) && d.verification_method === 'EXTERNAL_MANUAL_REVIEW' && d.payment_channel_result === 'NOT_REPORTED' && review(d.review)
    case 'GRANT': return ['ACTIVE','SUSPENDED'].includes(state) && validSupplyId(d.work_version_id) && isTerms(d.terms) && money(d.price) && snapshotContent(d.contract) && validSupplyId(d.evidence_id) && instant(d.activated_at) && str(d.reason) && optionalText(d.suspension_reason)
    case 'PROJECT': return state === 'ACTIVE' && str(d.title,200) && typeof d.purpose === 'string' && Object.hasOwn(purposes,d.purpose) && typeof d.territory === 'string' && /^[A-Z]{2}$/.test(d.territory) && typeof d.language === 'string' && /^[a-z]{2}$/.test(d.language) && count(d.episodes)
    case 'BINDING': return state === 'ACTIVE' && validSupplyId(d.project_id) && validSupplyId(d.work_version_id) && hash(d.terms_sha256)
    case 'READING': return ['IN_REVIEW','APPROVED','REJECTED','REVOKED'].includes(state) && validSupplyId(d.work_version_id) && validSupplyId(d.reader_account_id) && instant(d.valid_until) && ['NDA','EVALUATION_PERMISSION'].includes(String(d.basis_type)) && validSupplyId(d.basis_asset_id) && review(d.review) && d.allows_generation === false && optionalText(d.close_reason)
    default: return false
  }
}
const options = (i: SupplyIdentity, signal?: AbortSignal) => ({ token: i.token, actingParty: i.partyId, signal, cache: 'no-store' as const })
function checked<T>(r: ApiResult<unknown>, i: SupplyIdentity, guard: (v: unknown) => v is T): T {
  if (!guard(r.data) || !r.meta?.request_id || r.meta.actor?.account_id !== i.accountId || r.meta.acting_party !== i.partyId) throw new ApiError({ status:200, code:'UNEXPECTED_RESPONSE_SHAPE', message:'无法确认许可记录，请重新读取。', requestId:r.requestId })
  return r.data
}
export async function listLicense(i: SupplyIdentity, kind: LicenseKind, catalog = false, cursor: string | null = null, signal?: AbortSignal) {
  const q = new URLSearchParams({ kind, limit:'20' }); if (catalog) q.set('catalog','true'); if (cursor) q.set('cursor',cursor)
  return checked(await request(`/licensing/records?${q}`,options(i,signal)),i,(v): v is LicensePage => obj(v) && Array.isArray(v.items) && v.items.length <= 100 && v.items.every(r => isLicenseRecord(r) && r.kind === kind && (catalog ? r.current_status === 'LISTED' : !i.partyId || [r.owner_party_id,r.counterparty_id].includes(i.partyId))) && (v.next_cursor === null || validSupplyId(v.next_cursor)))
}
export async function getLicense(i: SupplyIdentity, id: string, kind?: LicenseKind, signal?: AbortSignal) {
  return checked(await request(`/licensing/records/${encodeURIComponent(id)}`,options(i,signal)),i,(v): v is LicenseRecord => isLicenseRecord(v) && v.id === id && (!kind || v.kind === kind) && (!i.partyId || [v.owner_party_id,v.counterparty_id].includes(i.partyId) || v.kind === 'PRODUCT' && v.current_status === 'LISTED'))
}
export async function postLicense(i: SupplyIdentity, command: LicenseWrite, key: string, signal?: AbortSignal) {
  return checked(await request(command.path,{...options(i,signal),method:'POST',body:command.body,idempotencyKey:key,ifMatch:command.version}),i,(v): v is LicenseRecord => isLicenseRecord(v) && (!i.partyId || [v.owner_party_id,v.counterparty_id].includes(i.partyId)) && (command.resultKind === 'ACTIVATION' ? v.kind === 'GRANT' && v.parent_id === command.targetId || v.kind === 'RESERVATION' && v.id === command.targetId && v.current_status === 'REVIEW_REQUIRED' : v.kind === command.resultKind) && (!command.targetId || ['ACTIVATION','BINDING'].includes(command.resultKind) && v.parent_id === command.targetId || v.id === command.targetId))
}
export async function readLicenseContent(i: SupplyIdentity, id: string, signal?: AbortSignal) {
  return checked(await request(`/licensing/readings/${encodeURIComponent(id)}/content`,options(i,signal)),i,(v): v is ReadingContent => obj(v) && v.record_id === id && typeof v.watermarked_text === 'string' && v.watermarked_text.length > 0 && v.watermarked_text.length <= 16000000 && v.allows_generation === false)
}
export const readEvidenceBytes = (i: SupplyIdentity, recordId: string, assetId: string, signal?: AbortSignal) => requestBytes(`/licensing/evidence/${encodeURIComponent(recordId)}/assets/${encodeURIComponent(assetId)}/content`,options(i,signal))
export const licenseTitle = (r: LicenseRecord) => 'title' in r.data ? r.data.title : r.kind === 'READING' ? '指定人阅稿授权' : r.kind === 'GRANT' ? '剧本许可凭证' : r.kind === 'EVIDENCE' ? '外部签署及付款材料' : '项目绑定'
/** Inputs and displays stay in integer minor units. No currency exponent is guessed. */
export function minorInteger(value: string): number | null { if (!/^(0|[1-9]\d*)$/.test(value)) return null; const n = Number(value); return Number.isSafeInteger(n) ? n : null }
export const moneyText = (m: Money) => {
  if (m.currency === 'CNY') { const minor = BigInt(m.amount_minor); return `¥${(minor / 100n).toLocaleString('zh-CN')}.${String(minor % 100n).padStart(2,'0')} / CNY` }
  return `${m.currency} ${m.amount_minor.toLocaleString('zh-CN')} 最小币种单位`
}
export function grantUsable(r: LicenseRecord, now = Date.now()) { return r.kind === 'GRANT' && r.current_status === 'ACTIVE' && now >= Date.parse(r.data.terms.valid_from) && now < Date.parse(r.data.terms.valid_until) }
export function projectFits(terms: Terms, p: ProjectData, now = Date.now()) { return now >= Date.parse(terms.valid_from) && now < Date.parse(terms.development_until) && terms.purposes.includes(p.purpose) && (terms.territories.includes('WORLD') || terms.territories.includes(p.territory)) && (terms.languages.includes('ALL') || terms.languages.includes(p.language)) && p.episodes <= terms.episode_limit && terms.rights.some(r => ['ADAPT','PRODUCE'].includes(r)) }
export function canAdaptBinding(binding: LicenseRecord, grant: LicenseRecord, project: LicenseRecord, partyId: string, now = Date.now()): boolean {
  return binding.kind === 'BINDING' && binding.current_status === 'ACTIVE' && binding.owner_party_id === partyId && grant.kind === 'GRANT' && grant.owner_party_id === partyId && binding.parent_id === grant.id && grant.data.work_version_id === binding.data.work_version_id && project.kind === 'PROJECT' && project.id === binding.data.project_id && project.owner_party_id === partyId && project.current_status === 'ACTIVE' && grant.data.terms.rights.includes('ADAPT') && grantUsable(grant,now) && projectFits(grant.data.terms,project.data,now)
}
