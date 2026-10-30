import { serviceRequest, query, object } from './clientServices'
import { validSupplyId, type SupplyIdentity } from './supply'
import type { RequestOptions } from '@/api/client'

export const personalCategories = { contracts: '合同和约定', works: '作品与已购视频', income: '收入核算' } as const
export type PersonalCategory = keyof typeof personalCategories
export const personalSources = {
 CONTRACT_SNAPSHOTS: { category: 'contracts', label: '封存合同内容', domain: 'CONTRACT_SNAPSHOTS', path: '/contracts/' },
 TRADE_ORDERS: { category: 'contracts', label: '订单约定', domain: 'TRADE', path: '/trade/orders/' },
 PARTICIPATION_CONTRACTS: { category: 'contracts', label: '参演约定', domain: 'PROJECTS', path: '/participation/agreements/' },
 INCOME_AGREEMENTS: { category: 'contracts', label: '发行收入约定', domain: 'PROJECTS', path: '/participation/income/' },
 LICENSE_RESERVATIONS: { category: 'contracts', label: '剧本许可预留', domain: 'LICENSE', path: '/licensing/reservations/' },
 LICENSE_GRANTS: { category: 'contracts', label: '已取得剧本许可', domain: 'LICENSE', path: '/licensing/grants/' },
 COMMERCIAL_OFFERS: { category: 'contracts', label: '商单接单约定', domain: 'GIGS', path: '/gigs/offers/' },
 MCN_RELATIONS: { category: 'contracts', label: 'MCN 合作约定', domain: 'GIGS', path: '/gigs/relations/' },
 SUPPLY_WORKS: { category: 'works', label: '提交的剧本与作品版本', domain: 'SUPPLY', path: '/supply/works/' },
 PRODUCTION_PROJECTS: { category: 'works', label: '定制制作项目', domain: 'PRODUCTION', path: '/production/projects/' },
 PROJECT_EDITIONS: { category: 'works', label: '发行成片版本', domain: 'PROJECTS', path: '/projects/records/' },
 STOCK_LISTINGS: { category: 'works', label: '我销售的现成视频', domain: 'STOCK', path: '/stock/listings/' },
 STOCK_PURCHASES: { category: 'works', label: '我购买的现成视频', domain: 'STOCK_PURCHASE', path: '/stock/purchases/' },
 FINANCE: { category: 'income', label: '已登记的收入核算', domain: 'FINANCE', path: '/finance/agreements/' },
 COMMISSIONS: { category: 'income', label: '商单佣金来源记录', domain: 'GIGS', path: '/gigs/commissions/' },
} as const
export type PersonalSource = keyof typeof personalSources
export type PersonalDomain = typeof personalSources[PersonalSource]['domain']
export const sourcesFor = (category: PersonalCategory) => (Object.keys(personalSources) as PersonalSource[]).filter(source => personalSources[source].category === category)
export interface PersonalIncome {
 accrued_minor: number; adjustment_minor: number; verified_paid_minor: number; pending_minor: number; retained_minor: number; recovery_due_minor: number
 currency: 'CNY'; environment: 'SANDBOX' | 'PRODUCTION'; meaning: 'MERCHANT_RETAINED_NOT_TRANSFER' | 'PAYABLE_NOT_BANK_BALANCE'; basis: 'POSTED_LEDGER_ONLY'; bank_arrival_verified: false
}
export interface PersonalItem {
 key: string; source_domain: PersonalDomain; record_id: string; title: string; current_status: string; object_version: number; created_at: string
 target: { domain: PersonalDomain; record_id: string }; income: PersonalIncome | null; notice: string
}
export interface PersonalSection { source: PersonalSource; label: string; status: 'AVAILABLE' | 'UNAVAILABLE'; items: PersonalItem[]; next_cursor: string | null; error_code: 'PERSONAL_CENTER_SOURCE_UNAVAILABLE' | null; retryable: boolean }
export interface PersonalCenter { party_id: string; category: PersonalCategory; pagination: 'PER_SOURCE_CREATED_AT_DESC'; sections: PersonalSection[]; partial: boolean; notice: string }
const text = (v: unknown, max: number): v is string => typeof v === 'string' && !!v.trim() && v.length <= max
const exact = (v: unknown, fields: string[]): v is Record<string, unknown> => object(v) && Object.keys(v).length === fields.length && fields.every(key => Object.hasOwn(v, key))
const amount = (v: unknown): v is number => Number.isSafeInteger(v)
const nonnegative = (v: unknown): v is number => amount(v) && v >= 0
export function isPersonalIncome(v: unknown): v is PersonalIncome {
 return exact(v, ['accrued_minor','adjustment_minor','verified_paid_minor','pending_minor','retained_minor','recovery_due_minor','currency','environment','meaning','basis','bank_arrival_verified']) && ['accrued_minor','adjustment_minor','verified_paid_minor'].every(key => amount(v[key])) && ['pending_minor','retained_minor','recovery_due_minor'].every(key => nonnegative(v[key])) && v.currency === 'CNY' && ['SANDBOX','PRODUCTION'].includes(String(v.environment)) && v.basis === 'POSTED_LEDGER_ONLY' && v.bank_arrival_verified === false && (v.meaning === 'MERCHANT_RETAINED_NOT_TRANSFER' && v.pending_minor === 0 || v.meaning === 'PAYABLE_NOT_BANK_BALANCE' && v.retained_minor === 0)
}
export function isPersonalItem(v: unknown, source: PersonalSource): v is PersonalItem {
 return exact(v, ['key','source_domain','record_id','title','current_status','object_version','created_at','target','income','notice']) && v.source_domain === personalSources[source].domain && validSupplyId(v.record_id) && v.key === v.source_domain + ':' + v.record_id && text(v.title, 240) && text(v.current_status, 64) && amount(v.object_version) && v.object_version > 0 && typeof v.created_at === 'string' && /^\d{4}-\d\d-\d\dT/.test(v.created_at) && Number.isFinite(Date.parse(v.created_at)) && exact(v.target, ['domain','record_id']) && v.target.domain === v.source_domain && v.target.record_id === v.record_id && (source === 'FINANCE' ? isPersonalIncome(v.income) : v.income === null) && text(v.notice, 300)
}
export function personalGuard(category: PersonalCategory, party: string, source?: PersonalSource) {
 const expected = source ? [source] : sourcesFor(category)
 return (v: unknown): v is PersonalCenter => {
  if (!exact(v, ['party_id','category','pagination','sections','partial','notice']) || v.party_id !== party || v.category !== category || v.pagination !== 'PER_SOURCE_CREATED_AT_DESC' || !text(v.notice, 300) || !Array.isArray(v.sections) || v.sections.length !== expected.length || typeof v.partial !== 'boolean') return false
  const seen = new Set<string>()
  for (const section of v.sections) {
   if (!exact(section, ['source','label','status','items','next_cursor','error_code','retryable']) || !expected.includes(section.source as PersonalSource) || seen.has(String(section.source)) || !text(section.label,100) || !Array.isArray(section.items) || section.items.length > 50) return false
   seen.add(String(section.source))
   if (section.status === 'UNAVAILABLE') { if (section.items.length || section.next_cursor !== null || section.error_code !== 'PERSONAL_CENTER_SOURCE_UNAVAILABLE' || section.retryable !== true) return false }
   else if (section.status !== 'AVAILABLE' || section.error_code !== null || section.retryable !== false || !(section.next_cursor === null || text(section.next_cursor,700)) || !section.items.every(item => isPersonalItem(item,section.source as PersonalSource))) return false
  }
  return v.partial === v.sections.some(section => section.status === 'UNAVAILABLE')
 }
}
export function readPersonalCenter(identity: SupplyIdentity, category: PersonalCategory, source?: PersonalSource, cursor?: string | null, options: RequestOptions = {}) {
 return serviceRequest(identity, '/me/business/' + category + query({source,cursor,limit:20}), personalGuard(category,identity.partyId || '',source), options)
}
export const personalTarget = (source: PersonalSource, item: PersonalItem) => personalSources[source].path + item.target.record_id
// Integer cents are formatted without floating-point arithmetic, including the largest safe signed amounts.
export function personalMoney(cents: number, signed = false) { const value = BigInt(cents), absolute = value < 0n ? -value : value; return (value < 0n ? '−' : signed && value > 0n ? '+' : '') + '¥' + (absolute / 100n).toString() + '.' + (absolute % 100n).toString().padStart(2,'0') }
