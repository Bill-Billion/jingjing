import { ApiError } from '@/api/client'
import { readBusiness, type BusinessOptions, type BusinessData } from './business'
import { sha256 } from './artists'

const specs: Record<string, [string, string, string]> = {
  '/notices/submissions': ['notices', 'SUBMIT', 'SUBMISSION'],
  '/engagement/candidates': ['engagement', 'NOMINATE', 'CANDIDATE'],
  '/engagement/votes': ['engagement', 'VOTE', 'VOTE'],
  '/engagement/appeals': ['engagement', 'APPEAL', 'APPEAL'],
}
export const hasOriginalReceipt = (path: string, method: string) => method === 'POST' && !!specs[path]
export async function originalDigest(input: unknown): Promise<string> {
  function sorted(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sorted)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, sorted(v)]))
    return value
  }
  return sha256(new Blob([JSON.stringify(sorted(input))]))
}
export async function originalResult(command: { path: string; method: string; key: string; body?: unknown }, options: BusinessOptions): Promise<BusinessData | null> {
  if (!hasOriginalReceipt(command.path, command.method)) return null
  const [domain, operation, kind] = specs[command.path]!
  const bad = () => { throw new ApiError({ status: 200, code: 'UNEXPECTED_RESPONSE_SHAPE', message: '原请求回执不匹配，原内容和编号已保留，请继续核对。' }) }
  const { data: receipt } = await readBusiness(`/${domain}/operations/${encodeURIComponent(command.key)}?operation=${operation}`, options)
  if (receipt.operation !== operation || receipt.operation_key !== command.key) bad()
  if (receipt.outcome === 'NOT_OBSERVED') {
    if (['request_sha256', 'record_id', 'record_kind', 'original_object_version', 'original_status'].some(k => receipt[k] !== null)) bad()
    return null // A concurrent transaction can still commit; never erase this command.
  }
  if (receipt.outcome !== 'COMMITTED' || receipt.record_kind !== kind ||
      !/^[0-9a-f-]{36}$/.test(String(receipt.record_id)) || !Number.isSafeInteger(receipt.original_object_version) || Number(receipt.original_object_version) < 1 ||
      typeof receipt.original_status !== 'string' || receipt.request_sha256 !== await originalDigest({ ...(command.body as object), party_id: options.actingParty, operation_key: command.key })) bad()
  // Current detail must not be run through validators for the original write snapshot.
  const { data } = await readBusiness(`/${domain}/records/${receipt.record_id}`, options)
  if (data.id !== receipt.record_id || data.kind !== kind || !Number.isSafeInteger(data.object_version) ||
      data.content_sha256 !== await originalDigest(data.data)) bad()
  return data
}
