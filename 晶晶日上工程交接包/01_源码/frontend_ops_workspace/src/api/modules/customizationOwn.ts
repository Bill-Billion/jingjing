import { ApiError, request, type ApiResult } from '../client'
import { validSupplyId } from './supply'
import { answers, isCustomizationTemplate, isSubmission, isSupplement, type CustomizationTemplate, type CustomizationSubmission, type Supplement, type IntakeIdentity } from './customization'

export type StoryStatus = 'DRAFT' | 'SUBMITTED' | 'INTAKE'
export interface StoryIdentity extends IntakeIdentity { partyId: string }
export interface StoryCategory {
  template_version_id: string; category_code: string; template_version: number
  template_snapshot: CustomizationTemplate; submission_available: boolean
  unavailable_reason: 'ATTACHMENT_SUBMISSION_NOT_READY' | null
}
export interface StorySummary {
  id: string; party_id: string; template_version_id: string; category_title: string
  current_status: StoryStatus; object_version: number; submitted_at: string | null; intake_at: string | null
  allowed_actions: ('READ' | 'SAVE' | 'SUBMIT')[]
}
export interface OwnStory extends Omit<StorySummary, 'category_title'> {
  created_by: string; template_snapshot: CustomizationTemplate; answers: Record<string, string>
  submission: CustomizationSubmission | null; intake_by: string | null
}
export interface StorySupplement {
  request_id: string; object_version: number; supplement: Supplement | null
  draft: { answers: Record<string, string>; responses: Record<string, string> } | null
  allowed_actions: ('READ' | 'SAVE_SUPPLEMENT' | 'SUBMIT_SUPPLEMENT')[]
}
export type StoryCommand = { key: string } & (
  { kind: 'create'; template_version_id: string; answers: Record<string, string> }
  | { kind: 'save'; id: string; version: number; answers: Record<string, string> }
  | { kind: 'submit' | 'submit-supplement'; id: string; version: number }
  | { kind: 'save-supplement'; id: string; version: number; answers: Record<string, string>; responses: Record<string, string> }
)
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const only = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every(k => keys.includes(k))
const text = (v: unknown, max: number, empty = false): v is string => typeof v === 'string' && (empty || v.trim().length > 0) && Array.from(v).length <= max
const version = (v: unknown): v is number => Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 4294967294
const instant = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v
const same = (a: Record<string, string>, b: Record<string, string>) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => a[k] === b[k])
const canonical = (v: unknown): string => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : obj(v) ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}' : JSON.stringify(v)
export function isStoryCategory(v: unknown): v is StoryCategory {
  if (!obj(v) || !only(v, ['template_version_id','category_code','template_version','template_snapshot','submission_available','unavailable_reason']) || !validSupplyId(v.template_version_id) || typeof v.category_code !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(v.category_code) || !version(v.template_version) || !isCustomizationTemplate(v.template_snapshot)) return false
  return typeof v.submission_available === 'boolean' && (v.submission_available ? v.unavailable_reason === null : v.unavailable_reason === 'ATTACHMENT_SUBMISSION_NOT_READY')
}
function summary(v: Record<string, unknown>): boolean {
  if (!validSupplyId(v.id) || !validSupplyId(v.party_id) || !validSupplyId(v.template_version_id) || !version(v.object_version) || !['DRAFT','SUBMITTED','INTAKE'].includes(String(v.current_status))) return false
  if (!Array.isArray(v.allowed_actions) || !v.allowed_actions.includes('READ') || !v.allowed_actions.every(a => a === 'READ' || v.current_status === 'DRAFT' && ['SAVE','SUBMIT'].includes(String(a))) || new Set(v.allowed_actions).size !== v.allowed_actions.length) return false
  return (v.current_status === 'DRAFT' ? v.submitted_at === null : instant(v.submitted_at)) && (v.current_status === 'INTAKE' ? instant(v.intake_at) : v.intake_at === null)
}
export function isStorySummary(v: unknown): v is StorySummary {
  return obj(v) && only(v, ['id','party_id','template_version_id','category_title','current_status','object_version','submitted_at','intake_at','allowed_actions']) && summary(v) && text(v.category_title,160)
}
export function isOwnStory(v: unknown): v is OwnStory {
  if (!obj(v) || !only(v, ['id','created_by','party_id','template_version_id','template_snapshot','answers','current_status','object_version','submission','submitted_at','intake_at','intake_by','allowed_actions']) || !summary(v) || !validSupplyId(v.created_by) || !isCustomizationTemplate(v.template_snapshot) || !answers(v.answers,v.template_snapshot,false)) return false
  if (v.current_status === 'DRAFT') return v.submission === null && v.intake_by === null
  return isSubmission(v.submission) && v.submission.submitted_by === v.created_by && v.submitted_at === v.submission.submitted_at && same(v.answers,v.submission.answers) && canonical(v.template_snapshot) === canonical(v.submission.template_snapshot) && (v.current_status === 'INTAKE' ? validSupplyId(v.intake_by) : v.intake_by === null)
}
export function validStoryResponses(v: unknown, s: Supplement, submitted = false): v is Record<string, string> {
  return obj(v) && new TextEncoder().encode(JSON.stringify(v)).length <= 16 * 1024 && Object.entries(v).every(([k,x]) => s.items.some(i => i.field_key === k) && text(x,2000,true)) && (!submitted || s.items.every(i => text(v[i.field_key],2000)))
}
export function isStorySupplement(v: unknown, t: CustomizationTemplate): v is StorySupplement {
  if (!obj(v) || !only(v, ['request_id','object_version','supplement','draft','allowed_actions']) || !validSupplyId(v.request_id) || !version(v.object_version) || !(v.supplement === null || isSupplement(v.supplement))) return false
  const s = v.supplement as Supplement | null, open = s?.current_status === 'OPEN'
  if (s && !s.items.every(i => t.fields.some(f => f.key === i.field_key))) return false
  if (open ? !obj(v.draft) || !only(v.draft,['answers','responses']) || !answers(v.draft.answers,t,false) || !validStoryResponses(v.draft.responses,s!) : v.draft !== null) return false
  return Array.isArray(v.allowed_actions) && v.allowed_actions.includes('READ') && new Set(v.allowed_actions).size === v.allowed_actions.length && v.allowed_actions.every(a => a === 'READ' || open && ['SAVE_SUPPLEMENT','SUBMIT_SUPPLEMENT'].includes(String(a)))
}
function checked<T>(r: ApiResult<unknown>, i: IntakeIdentity & { partyId?: string }, guard: (v: unknown) => v is T): T {
  if (!guard(r.data) || !r.meta?.request_id || r.meta.actor?.account_id !== i.accountId || r.meta.acting_party !== (i.partyId ?? null)) throw new ApiError({ status:200, code:'UNEXPECTED_RESPONSE_SHAPE', message:'无法核实本人的故事、身份或版本，请重新读取。', requestId:r.requestId })
  return r.data
}
const options = (i: IntakeIdentity & { partyId?: string }, signal?: AbortSignal) => ({ token:i.token, actingParty:i.partyId, signal, cache:'no-store' as const })
export async function listStoryCategories(i: IntakeIdentity, signal?: AbortSignal) {
  const account = {token:i.token,accountId:i.accountId}
  return checked(await request<unknown>('/customization-categories',options(account,signal)),account,(v): v is {items:StoryCategory[]} => obj(v) && only(v,['items']) && Array.isArray(v.items) && v.items.every(isStoryCategory) && new Set(v.items.map(c => c.template_version_id)).size === v.items.length && new Set(v.items.map(c => c.category_code)).size === v.items.length)
}
export async function listOwnStories(i: StoryIdentity, status: StoryStatus | '', cursor: string | null = null, signal?: AbortSignal) {
  const q = new URLSearchParams({limit:'20'}); if (status) q.set('current_status',status); if (cursor) q.set('cursor',cursor)
  return checked(await request<unknown>(`/customization-requests?${q}`,options(i,signal)),i,(v): v is {items:StorySummary[];next_cursor:string|null} => obj(v) && only(v,['items','next_cursor']) && Array.isArray(v.items) && v.items.length <= 20 && v.items.every(r => isStorySummary(r) && r.party_id === i.partyId && (!status || r.current_status === status)) && new Set(v.items.map(r => r.id)).size === v.items.length && (v.next_cursor === null || text(v.next_cursor,512)))
}
const own = (v: unknown, i: StoryIdentity): v is OwnStory => isOwnStory(v) && v.party_id === i.partyId && v.created_by === i.accountId
export async function getOwnStory(i: StoryIdentity, id: string, signal?: AbortSignal) {
  if (!validSupplyId(id)) throw new ApiError({status:404,code:'CUSTOMIZATION_NOT_FOUND',message:'这份故事不存在，或当前身份无权查看。'})
  const r = await request<unknown>(`/customization-requests/${id}`,options(i,signal))
  return checked(r,i,(v): v is OwnStory => own(v,i) && v.id === id && r.version === String(v.object_version))
}
export async function getOwnSupplement(i: StoryIdentity, story: OwnStory, signal?: AbortSignal) {
  const r = await request<unknown>(`/customization-requests/${story.id}/supplement`,options(i,signal))
  const result = checked(r,i,(v): v is StorySupplement => isStorySupplement(v,story.template_snapshot) && v.request_id === story.id && r.version === String(v.object_version))
  if (result.object_version !== story.object_version) throw new ApiError({status:412,code:'VERSION_CONFLICT',message:'故事与补件要求在读取期间发生变化，请刷新核对。'})
  if (result.supplement?.current_status === 'OPEN' && (story.current_status !== 'INTAKE' || result.supplement.base_submission_id !== story.submission?.id)) throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'补件要求与当前正式故事不一致，请重新读取。'})
  return result
}
export async function sendStoryCommand(i: StoryIdentity, c: StoryCommand, template: CustomizationTemplate): Promise<OwnStory | StorySupplement> {
  const base = '/customization-requests', id = c.kind === 'create' ? '' : c.id
  const path = c.kind === 'create' ? base : `${base}/${id}${c.kind === 'submit' ? '/submissions' : c.kind === 'save-supplement' ? '/supplement' : c.kind === 'submit-supplement' ? '/supplement-submissions' : ''}`
  const body = c.kind === 'create' ? {template_version_id:c.template_version_id,answers:c.answers} : c.kind === 'save' ? {answers:c.answers} : c.kind === 'save-supplement' ? {answers:c.answers,responses:c.responses} : {}
  const r = await request<unknown>(path,{...options(i),method:c.kind === 'save' || c.kind === 'save-supplement' ? 'PATCH' : 'POST',body,ifMatch:c.kind === 'create' ? undefined : c.version,idempotencyKey:c.key})
  if (c.kind === 'save-supplement') return checked(r,i,(v): v is StorySupplement => isStorySupplement(v,template) && v.request_id === c.id && v.object_version === c.version + 1 && r.version === String(v.object_version) && v.supplement?.current_status === 'OPEN' && !!v.draft && same(v.draft.answers,c.answers) && same(v.draft.responses,c.responses))
  return checked(r,i,(v): v is OwnStory => own(v,i) && r.version === String(v.object_version) && canonical(v.template_snapshot) === canonical(template) && (c.kind === 'create' ? v.template_version_id === c.template_version_id && v.object_version === 1 : v.id === c.id && v.object_version === c.version + 1) && (c.kind === 'create' || c.kind === 'save' ? v.current_status === 'DRAFT' && same(v.answers,c.answers) : v.current_status === 'SUBMITTED'))
}
