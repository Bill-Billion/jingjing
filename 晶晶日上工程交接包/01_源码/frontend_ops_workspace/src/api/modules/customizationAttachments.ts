import { ApiError, request, requestBytes, requestUpload, type ApiResult } from '../client'
import { validSupplyId } from './supply'
import type { IntakeIdentity } from './customization'

export const STORY_FILE_LIMIT = 8 * 1024 * 1024
export const STORY_FILE_TYPES = ['image/jpeg','image/png','video/mp4','audio/mpeg','audio/wav','application/pdf','text/plain'] as const
export type StoryFileType = typeof STORY_FILE_TYPES[number]
export interface StoryAttachment {
  id:string; request_id:string; display_name:string; media_type:StoryFileType; byte_size:number
  content_sha256:string; current_status:'UPLOADING'|'READY'|'REVOKED'; object_version:number
}
export type AttachmentIdentity = IntakeIdentity & {partyId?:string}
export interface StoryFile { file:Blob; displayName:string; mediaType:StoryFileType }
export type AttachmentCommand = {kind:'upload';key:string;fieldKey:string;source:StoryFile;sha256:string} | {kind:'revoke';key:string;asset:StoryAttachment}
const obj = (v:unknown): v is Record<string,unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
export const validAttachmentName = (v:unknown): v is string => typeof v === 'string' && !!v.trim() && Array.from(v).length <= 120 && !/[\x00-\x1f\x7f]/.test(v)
export const attachmentSize = (bytes:number) => bytes >= 1024 * 1024 ? `${(bytes/1024/1024).toFixed(2)} MiB` : bytes >= 1024 ? `${(bytes/1024).toFixed(1)} KiB` : `${bytes} 字节`
export function isStoryAttachment(v:unknown): v is StoryAttachment {
  return obj(v) && Object.keys(v).every(k => ['id','request_id','display_name','media_type','byte_size','content_sha256','current_status','object_version'].includes(k)) && validSupplyId(v.id) && validSupplyId(v.request_id) && validAttachmentName(v.display_name) && STORY_FILE_TYPES.includes(v.media_type as StoryFileType) && Number.isInteger(v.byte_size) && Number(v.byte_size) >= 1 && Number(v.byte_size) <= STORY_FILE_LIMIT && typeof v.content_sha256 === 'string' && /^[a-f0-9]{64}$/.test(v.content_sha256) && ['UPLOADING','READY','REVOKED'].includes(String(v.current_status)) && Number.isInteger(v.object_version) && Number(v.object_version) >= 1 && Number(v.object_version) <= 4294967294
}
const options = (i:AttachmentIdentity,signal?:AbortSignal) => ({token:i.token,actingParty:i.partyId,signal,cache:'no-store' as const})
function checked<T>(r:ApiResult<unknown>,i:AttachmentIdentity,guard:(v:unknown)=>v is T):T {
  if (!guard(r.data) || !r.meta?.request_id || r.meta.actor?.account_id !== i.accountId || r.meta.acting_party !== (i.partyId ?? null)) throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'附件的身份、故事或版本未能核实，请重新读取。',requestId:r.requestId})
  return r.data
}
export async function storyFileHash(file:Blob) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(v=>v.toString(16).padStart(2,'0')).join('') }
export function selectStoryFile(file:File):StoryFile {
  if (!file.size || file.size > STORY_FILE_LIMIT) throw new ApiError({status:400,code:'INVALID_ASSET_SIZE',message:'请选择非空文件，单个文件最多 8 MiB。'})
  if (!validAttachmentName(file.name)) throw new ApiError({status:400,code:'INVALID_ATTACHMENT_NAME',message:'文件名最多 120 个字，不能包含控制字符；请重命名后选择。'})
  const extensions:Record<string,StoryFileType> = {jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',mp4:'video/mp4',mp3:'audio/mpeg',wav:'audio/wav',pdf:'application/pdf',txt:'text/plain'}
  const mediaType = STORY_FILE_TYPES.includes(file.type as StoryFileType) ? file.type as StoryFileType : extensions[file.name.split('.').pop()?.toLowerCase() || '']
  if (!mediaType) throw new ApiError({status:400,code:'INVALID_ASSET_TYPE',message:'当前支持 JPEG、PNG、MP4、MP3、WAV、PDF 和纯文本文件。'})
  return {file,displayName:file.name,mediaType}
}
export async function listStoryAttachments(i:AttachmentIdentity,id:string,cursor:string|null=null,signal?:AbortSignal) {
  if (!validSupplyId(id)) throw new ApiError({status:400,code:'INVALID_INPUT',message:'请先保存本故事草稿，再读取附件。'})
  const q = new URLSearchParams({limit:'20'}); if (cursor) q.set('cursor',cursor)
  return checked(await request<unknown>(`/customization-requests/${id}/attachments?${q}`,options(i,signal)),i,(v):v is {items:StoryAttachment[];next_cursor:string|null} => obj(v) && Object.keys(v).every(k => ['items','next_cursor'].includes(k)) && Array.isArray(v.items) && v.items.length <= 20 && v.items.every(a => isStoryAttachment(a) && a.request_id === id) && new Set(v.items.map(a=>a.id)).size === v.items.length && (v.next_cursor === null || typeof v.next_cursor === 'string' && !!v.next_cursor && v.next_cursor.length <= 512))
}
export async function uploadStoryAttachment(i:AttachmentIdentity,id:string,c:Extract<AttachmentCommand,{kind:'upload'}>,progress:(loaded:number,total:number)=>void,signal?:AbortSignal) {
  if (!i.partyId || !validSupplyId(id)) throw new ApiError({status:400,code:'INVALID_INPUT',message:'请先保存本人故事草稿，再上传附件。'})
  const q = new URLSearchParams({display_name:c.source.displayName,media_type:c.source.mediaType})
  const r = await requestUpload<unknown>(`/customization-requests/${id}/attachments?${q}`,c.source.file,{...options(i,signal),idempotencyKey:c.key},progress)
  return checked(r,i,(v):v is StoryAttachment => isStoryAttachment(v) && v.request_id === id && v.current_status === 'READY' && v.byte_size === c.source.file.size && v.display_name === c.source.displayName && v.media_type === c.source.mediaType && v.content_sha256 === c.sha256 && r.version === String(v.object_version))
}
export async function revokeStoryAttachment(i:AttachmentIdentity,id:string,c:Extract<AttachmentCommand,{kind:'revoke'}>,signal?:AbortSignal) {
  if (!i.partyId || c.asset.request_id !== id) throw new ApiError({status:400,code:'INVALID_INPUT',message:'只能撤回本故事的附件访问。'})
  const r = await request<unknown>(`/customization-requests/${id}/attachments/${c.asset.id}/revocations`,{...options(i,signal),method:'POST',body:{},idempotencyKey:c.key,ifMatch:c.asset.object_version})
  return checked(r,i,(v):v is StoryAttachment => isStoryAttachment(v) && v.id === c.asset.id && v.request_id === id && v.current_status === 'REVOKED' && v.object_version === c.asset.object_version + 1 && r.version === String(v.object_version) && v.content_sha256 === c.asset.content_sha256)
}
export async function downloadStoryAttachment(i:AttachmentIdentity,id:string,asset:StoryAttachment,signal?:AbortSignal) {
  if (asset.request_id !== id || asset.current_status !== 'READY') throw new ApiError({status:409,code:'CUSTOMIZATION_ATTACHMENT_NOT_READY',message:'此附件当前不可下载，请核对附件状态。'})
  const blob = await requestBytes(`/customization-requests/${id}/attachments/${asset.id}/content`,options(i,signal))
  if (blob.size !== asset.byte_size || await storyFileHash(blob) !== asset.content_sha256) throw new ApiError({status:200,code:'PRIVATE_CONTENT_MISMATCH',message:'附件大小或内容校验不一致，已停止下载。'})
  return blob
}
export function attachmentErrorMessage(e:ApiError) {
  const messages:Record<string,string> = {
    ASSET_UPLOAD_RECONCILIATION_REQUIRED:'上传结果待核对，原文件和原请求已保留。请先读取当前附件，再恢复原上传；不要换键重复上传。',
    CUSTOMIZATION_ATTACHMENT_NOT_READY:'附件尚不可用。请核对上传记录，恢复原上传或更换可用附件后再保存。',
    CUSTOMIZATION_ATTACHMENT_REVOKED:'该附件访问已撤回。请选择另一份可用附件，再保存草稿。',
    CUSTOMIZATION_ATTACHMENT_RETENTION_REQUIRED:'此附件已被正式版本引用，需要按资料保留流程处理；访问未被撤回，也未删除文件。',
    CUSTOMIZATION_ATTACHMENT_LIMIT:'本故事最多 40 条上传记录，包含待核对和已撤回记录。已达到上限，请联系平台处理。',
    INVALID_ASSET_SIZE:'文件必须非空，单个文件最多 8 MiB。请选择符合大小限制的文件。',
    HTTP_413:'单个文件最多 8 MiB，请缩小文件后重新选择。',
    CUSTOMIZATION_ATTACHMENT_NOT_EDITABLE:'当前故事不能新增附件。请读取最新进度，在可编辑草稿或开放补件中办理。',
  }
  return messages[e.code] || e.message
}
