import { ApiError, request, type ApiResult } from '../client'
import { validSupplyId } from './supply'

export type IntakeStatus = 'SUBMITTED' | 'INTAKE'
export interface CustomizationField {
  key: string; label: string; type: 'TEXT' | 'CHOICE' | 'PRIVATE_ATTACHMENT'; required: boolean
  max_length?: number; options?: string[]
}
export interface CustomizationTemplate { title: string; description: string; fields: CustomizationField[] }
export interface CustomizationSubmission {
  id: string; answers: Record<string, string>; template_snapshot: CustomizationTemplate
  content_sha256: string; submitted_by: string; submitted_at: string
}
export interface IntakeSummary {
  id: string; party_id: string; template_version_id: string; category_title: string
  current_status: IntakeStatus; object_version: number; submitted_at: string; intake_at: string | null
  allowed_actions: ('READ' | 'INTAKE')[]
}
export interface IntakeRequest extends Omit<IntakeSummary, 'category_title'> {
  created_by: string; template_snapshot: CustomizationTemplate; answers: Record<string, string>
  submission: CustomizationSubmission; intake_by: string | null
}
export interface IntakePage { items: IntakeSummary[]; next_cursor: string | null }
export interface IntakeIdentity { token: string; accountId: string }
export interface IntakeCommand { id: string; version: number; key: string }

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const only = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every(k => keys.includes(k))
const text = (v: unknown, max: number, empty = false): v is string => typeof v === 'string' && (empty || v.trim().length > 0) && Array.from(v).length <= max
const version = (v: unknown): v is number => Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 4294967294
const instant = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v
const fieldKey = (v: unknown): v is string => typeof v === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(v) && !['constructor', 'prototype', '__proto__'].includes(v)
function isField(v: unknown): v is CustomizationField {
  if (!obj(v) || !only(v, ['key','label','type','required','max_length','options']) || !fieldKey(v.key) || !text(v.label, 120) || typeof v.required !== 'boolean') return false
  if (!['TEXT','CHOICE','PRIVATE_ATTACHMENT'].includes(String(v.type))) return false
  if (v.max_length !== undefined && (!Number.isInteger(v.max_length) || Number(v.max_length) < 1 || Number(v.max_length) > 12000)) return false
  if (v.options !== undefined && (!Array.isArray(v.options) || !v.options.length || v.options.length > 50 || !v.options.every(x => text(x, 120)) || new Set(v.options).size !== v.options.length)) return false
  if (v.type === 'TEXT') return v.options === undefined
  if (v.type === 'CHOICE') return Array.isArray(v.options) && v.max_length === undefined
  return v.options === undefined && v.max_length === undefined
}
export function isCustomizationTemplate(v: unknown): v is CustomizationTemplate {
  return obj(v) && only(v, ['title','description','fields']) && text(v.title,160) && text(v.description,2000,true) && Array.isArray(v.fields) && v.fields.length > 0 && v.fields.length <= 40 && v.fields.every(isField) && new Set(v.fields.map(f => f.key)).size === v.fields.length
}
export function answers(v: unknown, t: CustomizationTemplate, submitted = true): v is Record<string,string> {
  if (!obj(v) || Object.keys(v).length > 40 || new TextEncoder().encode(JSON.stringify(v)).length > 48 * 1024) return false
  for (const [key,value] of Object.entries(v)) {
    const f = t.fields.find(f => f.key === key)
    if (!fieldKey(key) || !f || !text(value,f.max_length ?? 12000,true) || f.type === 'PRIVATE_ATTACHMENT' && value !== '' || f.type === 'CHOICE' && value !== '' && !f.options?.includes(value)) return false
  }
  return !submitted || t.fields.every(f => !f.required || f.type !== 'PRIVATE_ATTACHMENT' && typeof v[f.key] === 'string' && String(v[f.key]).trim().length > 0)
}
const sameAnswers = (a: Record<string,string>, b: Record<string,string>) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => a[k] === b[k])
const canonical = (v: unknown): string => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : obj(v) ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}' : JSON.stringify(v)
export function isSubmission(v: unknown): v is CustomizationSubmission {
  return obj(v) && only(v,['id','answers','template_snapshot','content_sha256','submitted_by','submitted_at']) && validSupplyId(v.id) && isCustomizationTemplate(v.template_snapshot) && answers(v.answers,v.template_snapshot) && typeof v.content_sha256 === 'string' && /^[a-f0-9]{64}$/.test(v.content_sha256) && validSupplyId(v.submitted_by) && instant(v.submitted_at)
}
function summary(v: Record<string,unknown>): boolean {
  if (!validSupplyId(v.id) || !validSupplyId(v.party_id) || !validSupplyId(v.template_version_id) || !version(v.object_version) || !instant(v.submitted_at) || !['SUBMITTED','INTAKE'].includes(String(v.current_status))) return false
  if (!Array.isArray(v.allowed_actions) || !v.allowed_actions.includes('READ') || !v.allowed_actions.every(a => a === 'READ' || a === 'INTAKE' && v.current_status === 'SUBMITTED') || new Set(v.allowed_actions).size !== v.allowed_actions.length) return false
  return v.current_status === 'INTAKE' ? instant(v.intake_at) : v.intake_at === null
}
export function isIntakeSummary(v: unknown): v is IntakeSummary {
  return obj(v) && only(v,['id','party_id','template_version_id','category_title','current_status','object_version','submitted_at','intake_at','allowed_actions']) && summary(v) && text(v.category_title,160)
}
export function isIntakeRequest(v: unknown): v is IntakeRequest {
  if (!obj(v) || !only(v,['id','created_by','party_id','template_version_id','template_snapshot','answers','current_status','object_version','submission','submitted_at','intake_at','intake_by','allowed_actions']) || !summary(v) || !validSupplyId(v.created_by) || !isCustomizationTemplate(v.template_snapshot) || !answers(v.answers,v.template_snapshot) || !isSubmission(v.submission)) return false
  return (v.current_status === 'INTAKE' ? validSupplyId(v.intake_by) : v.intake_by === null) && v.submitted_at === v.submission.submitted_at && sameAnswers(v.answers,v.submission.answers) && canonical(v.template_snapshot) === canonical(v.submission.template_snapshot)
}
type ReadIdentity = IntakeIdentity & { partyId?: string }
function checked<T>(r: ApiResult<unknown>, i: ReadIdentity, guard: (v: unknown) => v is T): T {
  if (!guard(r.data) || !r.meta?.request_id || r.meta.actor?.account_id !== i.accountId || r.meta.acting_party !== (i.partyId ?? null)) throw new ApiError({ status: 200, code: 'UNEXPECTED_RESPONSE_SHAPE', message: '无法核实当前账号的正式提交记录，请重新读取。', requestId: r.requestId })
  return r.data
}
const options = (i: ReadIdentity, signal?: AbortSignal) => ({ token: i.token, actingParty: i.partyId, signal, cache: 'no-store' as const })
export async function listIntake(i: IntakeIdentity, status: IntakeStatus | '', cursor: string | null = null, signal?: AbortSignal): Promise<IntakePage> {
  const q = new URLSearchParams({ limit:'20' }); if (status) q.set('current_status',status); if (cursor) q.set('cursor',cursor)
  return checked(await request<unknown>(`/operations/customization-requests?${q}`, options(i,signal)),i,(v): v is IntakePage => obj(v) && only(v,['items','next_cursor']) && Array.isArray(v.items) && v.items.length <= 20 && v.items.every(r => isIntakeSummary(r) && (!status || r.current_status === status)) && new Set(v.items.map(r => r.id)).size === v.items.length && (v.next_cursor === null || text(v.next_cursor,512)))
}
function detail(r: ApiResult<unknown>, i: IntakeIdentity, id: string): IntakeRequest {
  return checked(r,i,(v): v is IntakeRequest => isIntakeRequest(v) && v.id === id && r.version === String(v.object_version))
}
export async function getIntake(i: IntakeIdentity, id: string, signal?: AbortSignal): Promise<IntakeRequest> {
  if (!validSupplyId(id)) throw new ApiError({status:404,code:'CUSTOMIZATION_NOT_FOUND',message:'这份提交不存在，或当前账号无权查看。'})
  return detail(await request<unknown>(`/customization-requests/${encodeURIComponent(id)}`, options(i,signal)),i,id)
}
export async function startIntake(i: IntakeIdentity, c: IntakeCommand): Promise<IntakeRequest> {
  const r = await request<unknown>(`/operations/customization-requests/${encodeURIComponent(c.id)}/intake`,{...options(i),method:'POST',body:{},ifMatch:c.version,idempotencyKey:c.key})
  return checked(r,i,(v): v is IntakeRequest => isIntakeRequest(v) && v.id === c.id && r.version === String(v.object_version) && v.object_version === c.version + 1 && v.current_status === 'INTAKE' && v.intake_by === i.accountId)
}

export interface SupplementItem { field_key: string; reason: string; instruction: string }
export interface Supplement {
  id: string; base_submission_id: string; items: SupplementItem[]; current_status: 'OPEN'|'RESPONDED'
  requested_by: string; requested_at: string
  response: { submission_id: string; responses: Record<string,string>; submitted_at: string } | null
}
export interface SupplementContext { request_id: string; object_version: number; supplement: Supplement|null; draft: null; allowed_actions: ('READ'|'REQUEST_SUPPLEMENT')[] }
export interface SubmissionSummary { id: string; submission_number: number; submitted_by: string; submitted_at: string; content_sha256: string }
export interface SubmissionVersion {
  request_id: string; submission_number: number; submission: CustomizationSubmission
  supplement_response: { supplement_id:string; base_submission_id:string; items:SupplementItem[]; responses:Record<string,string>; requested_by:string; requested_at:string } | null
}
export interface CustomizationQuoteSummary { id:string; submission_id:string; source_content_sha256:string; source_is_current:boolean; current_status:'IN_REVIEW'|'APPROVED'|'REJECTED'|'ACCEPTED'; object_version:number; content_sha256:string; order_id:string|null }
export interface CustomizationQuoteSource { request_id:string; submission_id:string; content_sha256:string }
export interface SupplementCommand extends IntakeCommand { items: SupplementItem[] }
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const byteLength = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length
export function validSupplementItems(v: unknown, template?: CustomizationTemplate): v is SupplementItem[] {
  return Array.isArray(v) && v.length >= 1 && v.length <= 40 && v.every(x => obj(x) && only(x,['field_key','reason','instruction']) && fieldKey(x.field_key) && (!template || template.fields.some(f => f.key === x.field_key)) && text(x.reason,500) && text(x.instruction,1000)) && new Set(v.map(x => x.field_key)).size === v.length && byteLength(v) <= 16 * 1024
}
function responses(v: unknown, items: SupplementItem[]): v is Record<string,string> {
  return obj(v) && Object.keys(v).length === items.length && items.every(x => text(v[x.field_key],2000)) && byteLength(v) <= 16 * 1024
}
export function isSupplement(v: unknown): v is Supplement {
  if (!obj(v) || !only(v,['id','base_submission_id','items','current_status','requested_by','requested_at','response']) || !validSupplyId(v.id) || !validSupplyId(v.base_submission_id) || !validSupplementItems(v.items) || !validSupplyId(v.requested_by) || !instant(v.requested_at)) return false
  return v.current_status === 'OPEN' ? v.response === null : v.current_status === 'RESPONDED' && obj(v.response) && only(v.response,['submission_id','responses','submitted_at']) && validSupplyId(v.response.submission_id) && responses(v.response.responses,v.items) && instant(v.response.submitted_at)
}
export function isSupplementContext(v: unknown): v is SupplementContext {
  return obj(v) && only(v,['request_id','object_version','supplement','draft','allowed_actions']) && validSupplyId(v.request_id) && version(v.object_version) && (v.supplement === null || isSupplement(v.supplement)) && v.draft === null && Array.isArray(v.allowed_actions) && v.allowed_actions.includes('READ') && v.allowed_actions.every(x => x === 'READ' || x === 'REQUEST_SUPPLEMENT' && (v.supplement === null || (v.supplement as Supplement).current_status === 'RESPONDED')) && new Set(v.allowed_actions).size === v.allowed_actions.length
}
export async function getSupplement(i: IntakeIdentity, id: string, signal?: AbortSignal) {
  const r = await request<unknown>(`/customization-requests/${encodeURIComponent(id)}/supplement`,options(i,signal))
  return checked(r,i,(v): v is SupplementContext => isSupplementContext(v) && v.request_id === id && r.version === String(v.object_version))
}
export async function requestSupplement(i: IntakeIdentity, c: SupplementCommand) {
  if (!validSupplyId(c.id) || !validSupplementItems(c.items)) throw new ApiError({status:400,code:'CLIENT_SUPPLEMENT_INVALID',message:'请逐项选择原故事字段，并填写原因和补充要求。'})
  const r = await request<unknown>(`/operations/customization-requests/${encodeURIComponent(c.id)}/supplements`,{...options(i),method:'POST',body:{items:c.items},ifMatch:c.version,idempotencyKey:c.key})
  return checked(r,i,(v): v is SupplementContext => isSupplementContext(v) && v.request_id === c.id && r.version === String(v.object_version) && v.object_version === c.version + 1 && v.supplement?.current_status === 'OPEN' && v.supplement.requested_by === i.accountId && canonical(v.supplement.items) === canonical(c.items))
}
function isSubmissionSummary(v: unknown): v is SubmissionSummary {
  return obj(v) && only(v,['id','submission_number','submitted_by','submitted_at','content_sha256']) && validSupplyId(v.id) && version(v.submission_number) && validSupplyId(v.submitted_by) && instant(v.submitted_at) && hash(v.content_sha256)
}
export async function listSubmissions(i: ReadIdentity, id: string, cursor: string|null = null, signal?: AbortSignal) {
  const q = new URLSearchParams({limit:'20'}); if (cursor) q.set('cursor',cursor)
  return checked(await request<unknown>(`/customization-requests/${encodeURIComponent(id)}/submissions?${q}`,options(i,signal)),i,(v): v is {items:SubmissionSummary[];next_cursor:string|null} => obj(v) && only(v,['items','next_cursor']) && Array.isArray(v.items) && v.items.length <= 20 && v.items.every(isSubmissionSummary) && new Set(v.items.map(x => x.id)).size === v.items.length && v.items.every((x,n) => n === 0 || x.submission_number > (v.items as SubmissionSummary[])[n-1]!.submission_number) && (v.next_cursor === null || text(v.next_cursor,512)))
}
export function isSubmissionVersion(v: unknown): v is SubmissionVersion {
  if (!obj(v) || !only(v,['request_id','submission_number','submission','supplement_response']) || !validSupplyId(v.request_id) || !version(v.submission_number) || !isSubmission(v.submission)) return false
  const s = v.supplement_response
  return s === null || obj(s) && only(s,['supplement_id','base_submission_id','items','responses','requested_by','requested_at']) && validSupplyId(s.supplement_id) && validSupplyId(s.base_submission_id) && validSupplementItems(s.items,v.submission.template_snapshot) && responses(s.responses,s.items) && validSupplyId(s.requested_by) && instant(s.requested_at)
}
export async function getSubmission(i: ReadIdentity, id: string, submissionId: string, signal?: AbortSignal) {
  return checked(await request<unknown>(`/customization-requests/${encodeURIComponent(id)}/submissions/${encodeURIComponent(submissionId)}`,options(i,signal)),i,(v): v is SubmissionVersion => isSubmissionVersion(v) && v.request_id === id && v.submission.id === submissionId)
}
export async function listCustomizationQuotes(i: IntakeIdentity, id: string, cursor: string|null = null, signal?: AbortSignal) {
  const q = new URLSearchParams({limit:'20'}); if (cursor) q.set('cursor',cursor)
  return checked(await request<unknown>(`/customization-requests/${encodeURIComponent(id)}/quotes?${q}`,options(i,signal)),i,(v): v is {items:CustomizationQuoteSummary[];next_cursor:string|null} => obj(v) && only(v,['items','next_cursor']) && Array.isArray(v.items) && v.items.length <= 20 && v.items.every(x => obj(x) && only(x,['id','submission_id','source_content_sha256','source_is_current','current_status','object_version','content_sha256','order_id']) && validSupplyId(x.id) && validSupplyId(x.submission_id) && hash(x.source_content_sha256) && typeof x.source_is_current === 'boolean' && ['IN_REVIEW','APPROVED','REJECTED','ACCEPTED'].includes(String(x.current_status)) && version(x.object_version) && hash(x.content_sha256) && (x.order_id === null || validSupplyId(x.order_id))) && new Set(v.items.map(x => x.id)).size === v.items.length && (v.next_cursor === null || text(v.next_cursor,512)))
}
