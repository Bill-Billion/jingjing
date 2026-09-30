import { ApiError, request, requestBytes, type ApiResult, type RequestOptions } from '../client'

export type SupplyKind = 'PROFILE' | 'WORK_VERSION'
export type Decision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED'
export type Channel = 'RIGHTS' | 'CONTENT'
export type AssetPurpose = 'WORK_CONTENT' | 'RIGHTS_EVIDENCE'
export const mediaTypes = { 'application/pdf': 'PDF 文档', 'text/plain': '纯文本', 'image/jpeg': 'JPEG 图片', 'image/png': 'PNG 图片', 'audio/wav': 'WAV 音频', 'audio/mpeg': 'MP3 音频', 'video/mp4': 'MP4 视频', 'application/octet-stream': '其他二进制文件' } as const
export type MediaType = keyof typeof mediaTypes
export const MAX_ASSET_BYTES = 8 * 1024 * 1024
export const supplyStatus: Record<string, string> = { PENDING_REVIEW: '待审核', APPROVED: '已通过', CHANGES_REQUESTED: '需要补正', REJECTED: '已拒绝', DRAFT: '草稿', AWAITING_REVIEW: '等待双审', REVIEWS_COMPLETE: '双审已完成', WITHDRAWN: '已撤回' }
export const creditRoles = { AUTHOR: '作者', RIGHTS_HOLDER: '权利人', AGENT: '代理' } as const
export interface SupplyIdentity { token: string; accountId: string; partyId: string | null }
export interface SupplyAsset { id: string; owner_party_id: string; purpose: string; media_type: MediaType; byte_size: number; content_sha256: string; current_status: 'READY' }
export interface Review { decision: Decision; reason: string; reviewer_account_id: string; recorded_at: string }
export interface WorkReview extends Review { channel: Channel; evidence_ref: string; version_id: string }
export interface Credit { party_id: string; role: keyof typeof creditRoles; evidence_asset_ids: string[] }
interface RecordBase { id: string; stream_ref: string; revision: number; owner_party_id: string; created_by: string; object_version: number }
export interface ProfileRecord extends RecordBase { kind: 'PROFILE'; current_status: 'PENDING_REVIEW' | Decision; data: { display_name: string; description: string; evidence_asset_ids: string[]; review: Review | null } }
export interface WorkContent { id: string; work_id: string; revision: number; kind: 'ORIGINAL' | 'PROJECT_ADAPTATION'; source_version_id: string | null; project_id: string | null; owner_party_id: string; title: string; content_asset_id: string; content_sha256: string; evidence_ids: string[] }
export interface WorkRecord extends RecordBase { kind: 'WORK_VERSION'; current_status: 'DRAFT' | 'AWAITING_REVIEW' | 'REVIEWS_COMPLETE' | 'CHANGES_REQUESTED' | 'REJECTED' | 'WITHDRAWN'; data: { version: { content: WorkContent; object_version: number; current_status: 'DRAFT' | 'SUBMITTED' | 'WITHDRAWN'; submitted_at: string | null; reviews: WorkReview[]; withdrawal: { reason: string; recorded_at: string } | null }; credits: Credit[] } }
export type SupplyRecord = ProfileRecord | WorkRecord
export interface ProfileInput { display_name: string; description: string; evidence_asset_ids: string[]; previous_profile_id: string | null }
export type WorkInput = { work_id: string | null; previous_version_id: string | null; title: string; content_asset_id: string; evidence_ids: string[]; credits: Credit[] } & ({ kind: 'ORIGINAL'; source_version_id: null; project_id: null } | { kind: 'PROJECT_ADAPTATION'; source_version_id: string; project_id: string })
export interface SupplyPage { items: SupplyRecord[]; next_cursor: string | null }
export interface SupplyWrite { path: string; body?: ProfileInput | WorkInput | { decision: Decision; reason: string; channel?: Channel } | { action: 'SUBMIT' | 'WITHDRAW'; reason: string | null }; blob?: Blob; purpose?: AssetPurpose; mediaType?: MediaType; version?: number; targetId?: string; kind: SupplyKind | 'ASSET'; label: string }
export const validSupplyId = (v: unknown): v is string => typeof v === 'string' && v.length === 36 && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
export const shortSupplyId = (id: string) => validSupplyId(id) ? `${id.slice(0, 8)}…${id.slice(-4)}` : id
const obj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max
const count = (v: unknown) => Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 4294967294
const instant = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v
const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const ids = (v: unknown, min = 1): v is string[] => Array.isArray(v) && v.length >= min && v.length <= 100 && v.every(validSupplyId) && new Set(v).size === v.length
const decision = (v: unknown): v is Decision => typeof v === 'string' && ['APPROVED', 'CHANGES_REQUESTED', 'REJECTED'].includes(v)
function review(v: unknown): v is Review { return obj(v) && decision(v.decision) && text(v.reason, 1000) && validSupplyId(v.reviewer_account_id) && instant(v.recorded_at) }
function credit(v: unknown): v is Credit { return obj(v) && validSupplyId(v.party_id) && typeof v.role === 'string' && Object.hasOwn(creditRoles, v.role) && ids(v.evidence_asset_ids) }
export function isSupplyRecord(v: unknown): v is SupplyRecord {
  if (!obj(v) || !validSupplyId(v.id) || !text(v.stream_ref, 128) || !count(v.revision) || !validSupplyId(v.owner_party_id) || !validSupplyId(v.created_by) || !count(v.object_version) || !obj(v.data)) return false
  if (v.kind === 'PROFILE') return ['PENDING_REVIEW', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED'].includes(String(v.current_status)) && text(v.data.display_name, 120) && text(v.data.description, 2000) && ids(v.data.evidence_asset_ids) && (v.current_status === 'PENDING_REVIEW' ? v.data.review === null : review(v.data.review) && v.data.review.decision === v.current_status)
  if (v.kind !== 'WORK_VERSION' || !obj(v.data.version) || !Array.isArray(v.data.credits) || v.data.credits.length < 1 || v.data.credits.length > 30 || !v.data.credits.every(credit) || !v.data.credits.some(c => c.role === 'RIGHTS_HOLDER')) return false
  const version = v.data.version, c = version.content
  if (!obj(c) || c.id !== v.id || c.work_id !== v.stream_ref || c.revision !== v.revision || c.owner_party_id !== v.owner_party_id || !text(c.title, 200) || !validSupplyId(c.content_asset_id) || !hash(c.content_sha256) || !ids(c.evidence_ids, 0) || !['ORIGINAL', 'PROJECT_ADAPTATION'].includes(String(c.kind))) return false
  if (c.kind === 'ORIGINAL' ? c.project_id !== null || c.source_version_id !== null : !validSupplyId(c.project_id) || !validSupplyId(c.source_version_id)) return false
  if (version.object_version !== v.object_version || !['DRAFT', 'SUBMITTED', 'WITHDRAWN'].includes(String(version.current_status)) || !Array.isArray(version.reviews) || version.reviews.length > 2 || !version.reviews.every(r => review(r) && obj(r) && ['RIGHTS', 'CONTENT'].includes(String(r.channel)) && r.version_id === v.id && text(r.evidence_ref, 128))) return false
  if (new Set(version.reviews.map(r => r.channel)).size !== version.reviews.length || new Set(v.data.credits.map(c => `${c.party_id}:${c.role}`)).size !== v.data.credits.length) return false
  if (version.submitted_at !== null && !instant(version.submitted_at)) return false
  if (version.current_status === 'DRAFT' && (version.submitted_at !== null || version.reviews.length)) return false
  if (version.current_status === 'SUBMITTED' && version.submitted_at === null) return false
  if (version.current_status === 'WITHDRAWN' ? !obj(version.withdrawal) || !text(version.withdrawal.reason, 1000) || !instant(version.withdrawal.recorded_at) : version.withdrawal !== null) return false
  const progress = version.current_status === 'WITHDRAWN' ? 'WITHDRAWN' : version.current_status === 'DRAFT' ? 'DRAFT' : version.reviews.some(r => r.decision === 'REJECTED') ? 'REJECTED' : version.reviews.some(r => r.decision === 'CHANGES_REQUESTED') ? 'CHANGES_REQUESTED' : version.reviews.length === 2 ? 'REVIEWS_COMPLETE' : 'AWAITING_REVIEW'
  return v.current_status === progress
}
export function isSupplyAsset(v: unknown): v is SupplyAsset { return obj(v) && validSupplyId(v.id) && validSupplyId(v.owner_party_id) && ['WORK_CONTENT','RIGHTS_EVIDENCE','CONSENT_EVIDENCE','REVIEW_EVIDENCE','AVATAR_MATERIAL'].includes(String(v.purpose)) && typeof v.media_type === 'string' && Object.hasOwn(mediaTypes, v.media_type) && Number.isInteger(v.byte_size) && Number(v.byte_size) > 0 && Number(v.byte_size) <= MAX_ASSET_BYTES && hash(v.content_sha256) && v.current_status === 'READY' }
const opts = (i: SupplyIdentity, signal?: AbortSignal): RequestOptions => ({ token: i.token, actingParty: i.partyId, signal, cache: 'no-store' })
function checked<T>(r: ApiResult<unknown>, i: SupplyIdentity, guard: (v: unknown) => v is T): T {
  if (!guard(r.data) || !r.meta?.request_id || r.meta.actor?.account_id !== i.accountId || r.meta.acting_party !== i.partyId) throw new ApiError({ status: 200, code: 'UNEXPECTED_RESPONSE_SHAPE', message: '无法确认返回的材料或记录，请重新核对。', requestId: r.requestId })
  return r.data
}
export async function listSupply(i: SupplyIdentity, kind: SupplyKind, cursor: string | null = null, signal?: AbortSignal): Promise<SupplyPage> {
  const query = new URLSearchParams({ kind, limit: '20' }); if (cursor) query.set('cursor', cursor)
  const r = await request<unknown>(`/supply/records?${query}`, opts(i, signal))
  return checked(r, i, (v): v is SupplyPage => obj(v) && Array.isArray(v.items) && v.items.length <= 100 && v.items.every(x => isSupplyRecord(x) && x.kind === kind && (!i.partyId || x.owner_party_id === i.partyId)) && (v.next_cursor === null || validSupplyId(v.next_cursor)))
}
export async function getSupply(i: SupplyIdentity, id: string, kind: SupplyKind, signal?: AbortSignal) {
  return checked(await request<unknown>(`/supply/records/${encodeURIComponent(id)}`, opts(i, signal)), i, (v): v is SupplyRecord => isSupplyRecord(v) && v.id === id && v.kind === kind && (!i.partyId || v.owner_party_id === i.partyId))
}
export async function getSupplyAsset(i: SupplyIdentity, id: string, signal?: AbortSignal) {
  return checked(await request<unknown>(`/supply/assets/${encodeURIComponent(id)}`, opts(i, signal)), i, (v): v is SupplyAsset => isSupplyAsset(v) && v.id === id && (!i.partyId || v.owner_party_id === i.partyId))
}
export async function postSupply(i: SupplyIdentity, command: SupplyWrite, key: string, signal?: AbortSignal): Promise<SupplyRecord | SupplyAsset> {
  if (command.path === '/supply/work-versions' && (!command.body || !('evidence_ids' in command.body) || !ids(command.body.evidence_ids))) throw new ApiError({ status: 400, code: 'CLIENT_RIGHTS_EVIDENCE_REQUIRED', message: '保存作品前请上传至少一份权利证明。' })
  if (command.blob && (command.blob.size < 1 || command.blob.size > MAX_ASSET_BYTES || !command.mediaType || !Object.hasOwn(mediaTypes, command.mediaType))) throw new ApiError({ status: 400, code: 'CLIENT_ASSET_INVALID', message: '请选择 1 字节至 8 MiB 的文件和支持的文件类型。' })
  const r = await request<unknown>(command.path, { ...opts(i, signal), method: 'POST', body: command.body, rawBody: command.blob, idempotencyKey: key, ifMatch: command.version })
  if (command.kind === 'ASSET') return checked(r, i, (v): v is SupplyAsset => isSupplyAsset(v) && v.owner_party_id === i.partyId && v.purpose === command.purpose && v.media_type === command.mediaType && v.byte_size === command.blob?.size)
  return checked(r, i, (v): v is SupplyRecord => isSupplyRecord(v) && v.kind === command.kind && (!command.targetId || v.id === command.targetId) && (!i.partyId || v.owner_party_id === i.partyId))
}
export async function downloadSupplyAsset(i: SupplyIdentity, asset: SupplyAsset, signal?: AbortSignal): Promise<Blob> {
  const bytes = await requestBytes(`/supply/assets/${encodeURIComponent(asset.id)}/content`, opts(i, signal))
  if (bytes.size !== asset.byte_size) throw new ApiError({ status: 200, code: 'UNEXPECTED_RESPONSE_SHAPE', message: '材料大小不一致，下载已停止。' })
  const digest = await crypto.subtle.digest('SHA-256', await bytes.arrayBuffer())
  const actual = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('')
  if (actual !== asset.content_sha256) throw new ApiError({ status: 200, code: 'UNEXPECTED_RESPONSE_SHAPE', message: '材料内容校验不一致，下载已停止。' })
  return bytes
}
export const recordTitle = (r: SupplyRecord) => r.kind === 'PROFILE' ? r.data.display_name : r.data.version.content.title
