import { recordId, rowData, versionOf, type BusinessData } from '@/api/modules/business'
import type { Operation } from './model'

export interface ActionContext { accountId: string; partyId: string; membershipActive: boolean; owner: boolean }
export interface ActionAvailability { blocked: boolean; reason: string; explicit: boolean }
const blocked = (reason: string): ActionAvailability => ({ blocked: true, reason, explicit: false })

/** These are presentation guards from existing domain policies; the server rechecks every write. */
export function actionAvailability(domain: string, operation: Operation, record: BusinessData | null, context: ActionContext): ActionAvailability {
  const data = rowData(record||{}), key = operation.key, status = String(record?.current_status || '')
  const targetsRecord = /:(record_id|request_id|order_id|execution_id)/.test(operation.path)
  if (operation.party === 'required' && (!context.partyId || !context.membershipActive)) return blocked('先选择仍有效的办理身份。')
  if (operation.match && (!record || versionOf(record) === null)) return blocked('先读取本次原记录，核对最新状态与版本。')
  let explicit = false
  if (targetsRecord && record && Array.isArray(record.allowed_actions)) {
    const roomActions: Record<string, string[]> = { invite: ['INVITE'], close: ['CLOSE'], case: ['REQUEST_EXTENSION', 'REQUEST_RESUME', 'REQUEST_CANCEL'] }
    // Only names confirmed by the existing room contract can be used as a permission gate.
    // SUBMIT_OWN does not specify whether it means initial joining or later material updates.
    const names = domain === 'cocreation' ? roomActions[key] : undefined
    if (names) {
      if (!names.some(name => (record.allowed_actions as unknown[]).includes(name))) return blocked('当前身份的可办清单未开放此项。')
      explicit = true
    }
  }
  if (operation.party === 'none' && /review|rights|content/.test(key) && record?.created_by === context.accountId) return blocked('本项需要另一位获准人员独立核验，提交人不能自审。')
  const allowedStates: Record<string, Record<string, string[]>> = {
    stock: { rights: ['IN_REVIEW'], content: ['IN_REVIEW'] },
    auditions: { visibility: ['PUBLISHED'], checkout: ['READY_TO_PAY'], decision: ['AWAITING_ACCEPTANCE'], travel: ['ACCEPTED', 'DEPARTED'], delivery: ['ARRIVED', 'DELIVERED', 'ACCEPTED'], receipt: ['DELIVERED'], confirm: ['DELIVERED'], reschedule: ['ACCEPTED'], supplement: ['ACCEPTED'], 'supplement-checkout': ['APPROVED'], 'review-offer': ['IN_REVIEW'], 'review-booking': ['SAFETY_REVIEW'], 'review-delivery': ['DELIVERY_REVIEW'], 'review-supplement': ['IN_REVIEW'] },
    notices: { decision: ['SENT'], quote: ['WAITING_SUPPORT'], 'review-content': ['IN_REVIEW'], 'review-rule': ['IN_REVIEW'], 'review-qualification': ['IN_REVIEW'], 'review-fact': ['IN_REVIEW'] },
    cocreation: { invite: ['OPEN'], join: ['OPEN'], 'rule-review': ['IN_REVIEW'], 'snippet-review': ['IN_REVIEW'], 'case-review': ['OPEN'] },
  }
  const states = allowedStates[domain]?.[key]
  if (states && record && recordId(record) && !states.includes(status)) return blocked('当前记录尚未到这一步，或已完成办理；请先核对处理进度。')
  if (domain === 'stock') {
    if (key === 'checkout' && (!record?.id || !record.offer_sha256)) return blocked('先读取当前公开销售的作品及本版许可。')
    if (key === 'unlist' && data.rights_hold === true) return blocked('本影片处于权利暂停，须先独立核对权利处理。')
    if (key === 'unlist' && record?.seller_party_id && record.seller_party_id !== context.partyId) return blocked('请使用本影片的卖方身份。')
    if (['receipt', 'accept', 'case'].includes(key) && record?.buyer_party_id && record.buyer_party_id !== context.partyId) return blocked('仅本订单买方可办理此项。')
    if (['rights', 'content'].includes(key) && (data.reviews as BusinessData | undefined)?.[key === 'rights' ? 'RIGHTS' : 'CONTENT']) return blocked('本版本此项已有审核结论，请查看记录。')
    if (['receipt', 'accept'].includes(key) && record && (record.order_status !== 'PAID' || data.status !== 'ACTIVE' || data.current_case_id)) return blocked('正式付款、有效许可及售后状态核对后，才能确认交付。')
    if (key === 'resolve' && !data.current_case_id) return blocked('当前没有待处理的原订单售后。')
  }
  if (domain === 'auditions' && record?.kind === 'BOOKING') {
    if (['decision', 'travel', 'delivery', 'supplement', 'baseplate'].includes(key) && record.owner_party_id === context.partyId) return blocked('此项由艺人本人或当前获准经营方办理。')
    if (['checkout', 'receipt', 'confirm'].includes(key) && record.owner_party_id && record.owner_party_id !== context.partyId) return blocked('此项由本次预约的买方办理。')
    if (['travel', 'delivery', 'receipt', 'confirm', 'reschedule', 'supplement'].includes(key) && (data.dispute || data.reschedule)) return blocked('原预约正在处理争议或改期，请先完成该项处理。')
    if (key === 'delivery' && status === 'ACCEPTED' && (data.appointment as BusinessData | undefined)?.mode !== 'ONLINE_MATERIALS') return blocked('线下试镜须记录实际到场后，才能提交取样。')
    if (['reschedule', 'supplement'].includes(key) && data.departed_at) return blocked('已记录实际出发，不能再按出发前流程改期或追加。')
    if (key === 'reschedule-response' && (!(data.reschedule as BusinessData | undefined) || (data.reschedule as BusinessData).proposed_by === context.partyId)) return blocked('只有另一方可回复本次待确认改期。')
  }
  if (domain === 'notices') {
    if (key === 'decision' && record?.counterparty_id && record.counterparty_id !== context.partyId) return blocked('本次意向由接收方回复。')
    if (key === 'close' && (['WITHDRAWN', 'REJECTED'].includes(status) || record?.owner_party_id && record.owner_party_id !== context.partyId)) return blocked('仅可撤回当前身份尚未结束的原发布或投稿。')
  }
  if (domain === 'engagement' && ['staff', 'revoke', 'assign'].includes(key) && !context.owner) return blocked('当前机构负责人可委托或派单。')
  if (explicit) return { blocked: false, explicit: true, reason: '已按当前记录的可办清单开放；提交时仍会核对最新状态。' }
  return { blocked: false, explicit: false, reason: operation.party === 'none' && !['request', 'preferences', 'reopen', 'withdraw', 'delete-model', 'propose', 'execute'].includes(key) ? '此为独立岗位办理入口；当前记录未提供写权限清单，提交时核验岗位与回避关系。' : '可先填写办理内容；当前记录未提供完整可办清单，提交时核验当前资格与授权。' }
}
