import {ApiError} from '@/api/client'
import {uuid} from './model'
import type {BusinessData} from '@/api/modules/business'
export interface CopySource {key:string;scope:string;label:string;endpoint:string;selector:string;target:string}
export const copySources:CopySource[] = [
  {
    "key": "data:PROFILE",
    "scope": "PROFILE",
    "label": "账号展示",
    "endpoint": "data",
    "selector": "PROFILE",
    "target": ""
  },
  {
    "key": "data:ARTIST_MATERIALS",
    "scope": "ARTIST_MATERIALS",
    "label": "本人素材目录",
    "endpoint": "data",
    "selector": "ARTIST_MATERIALS",
    "target": ""
  },
  {
    "key": "data:PRIVATE_STORY",
    "scope": "PRIVATE_STORY",
    "label": "当前私人故事",
    "endpoint": "data",
    "selector": "PRIVATE_STORY",
    "target": ""
  },
  {
    "key": "data:TRANSACTIONS",
    "scope": "TRANSACTIONS",
    "label": "买方订单目录",
    "endpoint": "data",
    "selector": "TRANSACTIONS",
    "target": ""
  },
  {
    "key": "data:CONTENT",
    "scope": "CONTENT",
    "label": "本人作品目录",
    "endpoint": "data",
    "selector": "CONTENT",
    "target": ""
  },
  {
    "key": "data:CONTRACTS",
    "scope": "CONTRACTS",
    "label": "本人授权记录",
    "endpoint": "data",
    "selector": "CONTRACTS",
    "target": ""
  },
  {
    "key": "data:DIGITAL_MODELS",
    "scope": "DIGITAL_MODELS",
    "label": "本人登记模型",
    "endpoint": "data",
    "selector": "DIGITAL_MODELS",
    "target": ""
  },
  {
    "key": "account:ACCOUNT",
    "scope": "PROFILE",
    "label": "账号与个人身份",
    "endpoint": "account-data",
    "selector": "ACCOUNT",
    "target": ""
  },
  {
    "key": "account:PREFERENCES",
    "scope": "PROFILE",
    "label": "隐私与提醒设置",
    "endpoint": "account-data",
    "selector": "PREFERENCES",
    "target": ""
  },
  {
    "key": "account:ARTISTS",
    "scope": "PROFILE",
    "label": "本人艺人档案",
    "endpoint": "account-data",
    "selector": "ARTISTS",
    "target": ""
  },
  {
    "key": "account:WALLET",
    "scope": "TRANSACTIONS",
    "label": "钱包与星光记录",
    "endpoint": "account-data",
    "selector": "WALLET",
    "target": ""
  },
  {
    "key": "account:FINANCE",
    "scope": "TRANSACTIONS",
    "label": "本人收入清分",
    "endpoint": "account-data",
    "selector": "FINANCE",
    "target": ""
  },
  {
    "key": "account:FINANCE_AGREEMENTS",
    "scope": "CONTRACTS",
    "label": "本人清分约定",
    "endpoint": "account-data",
    "selector": "FINANCE_AGREEMENTS",
    "target": ""
  },
  {
    "key": "account:LICENSE_AGREEMENTS",
    "scope": "CONTRACTS",
    "label": "本人许可约定",
    "endpoint": "account-data",
    "selector": "LICENSE_AGREEMENTS",
    "target": ""
  },
  {
    "key": "account:PARTICIPATION_AGREEMENTS",
    "scope": "CONTRACTS",
    "label": "本人参加约定",
    "endpoint": "account-data",
    "selector": "PARTICIPATION_AGREEMENTS",
    "target": ""
  },
  {
    "key": "account:AGENCY_AGREEMENTS",
    "scope": "CONTRACTS",
    "label": "本人代理约定",
    "endpoint": "account-data",
    "selector": "AGENCY_AGREEMENTS",
    "target": ""
  },
  {
    "key": "account:IDENTITY_CHECKS",
    "scope": "PROFILE",
    "label": "实名核验状态",
    "endpoint": "account-data",
    "selector": "IDENTITY_CHECKS",
    "target": ""
  },
  {
    "key": "account:SUPPORT_TICKETS",
    "scope": "PROFILE",
    "label": "本人客服申请",
    "endpoint": "account-data",
    "selector": "SUPPORT_TICKETS",
    "target": ""
  },
  {
    "key": "account:SUPPORT_MESSAGES",
    "scope": "PROFILE",
    "label": "面向本人的客服回复",
    "endpoint": "account-data",
    "selector": "SUPPORT_MESSAGES",
    "target": ""
  },
  {
    "key": "account:INVOICE_REQUESTS",
    "scope": "TRANSACTIONS",
    "label": "开票申请",
    "endpoint": "account-data",
    "selector": "INVOICE_REQUESTS",
    "target": ""
  },
  {
    "key": "account:INVOICE_HISTORY",
    "scope": "TRANSACTIONS",
    "label": "开票办理记录",
    "endpoint": "account-data",
    "selector": "INVOICE_HISTORY",
    "target": ""
  },
  {
    "key": "account:INVOICE_DOCUMENTS",
    "scope": "TRANSACTIONS",
    "label": "发票文件目录",
    "endpoint": "account-data",
    "selector": "INVOICE_DOCUMENTS",
    "target": ""
  },
  {
    "key": "account:FAVORITES",
    "scope": "PROFILE",
    "label": "收藏",
    "endpoint": "account-data",
    "selector": "FAVORITES",
    "target": ""
  },
  {
    "key": "account:BROWSING_HISTORY",
    "scope": "PROFILE",
    "label": "仍保留的浏览记录",
    "endpoint": "account-data",
    "selector": "BROWSING_HISTORY",
    "target": ""
  },
  {
    "key": "account:COLLECTION_SETTINGS",
    "scope": "PROFILE",
    "label": "收藏与浏览设置",
    "endpoint": "account-data",
    "selector": "COLLECTION_SETTINGS",
    "target": ""
  },
  {
    "key": "account:NOTIFICATION_READS",
    "scope": "PROFILE",
    "label": "通知阅读记录",
    "endpoint": "account-data",
    "selector": "NOTIFICATION_READS",
    "target": ""
  },
  {
    "key": "account:GUARDIAN_CASES",
    "scope": "PROFILE",
    "label": "当前获准监护案件",
    "endpoint": "account-data",
    "selector": "GUARDIAN_CASES",
    "target": ""
  },
  {
    "key": "account:GUARDIAN_CONTROLS",
    "scope": "PROFILE",
    "label": "当前获准监护设置",
    "endpoint": "account-data",
    "selector": "GUARDIAN_CONTROLS",
    "target": ""
  },
  {
    "key": "account:GUARDIAN_USAGE",
    "scope": "PROFILE",
    "label": "本人按天预留记录",
    "endpoint": "account-data",
    "selector": "GUARDIAN_USAGE",
    "target": ""
  },
  {
    "key": "account:GUARDIAN_SESSIONS",
    "scope": "PROFILE",
    "label": "本人时段申请回执",
    "endpoint": "account-data",
    "selector": "GUARDIAN_SESSIONS",
    "target": ""
  },
  {
    "key": "account:PERSONAL_USAGE_STATE",
    "scope": "PROFILE",
    "label": "当前提醒状态",
    "endpoint": "account-data",
    "selector": "PERSONAL_USAGE_STATE",
    "target": ""
  },
  {
    "key": "account:GROWTH_RECORDS",
    "scope": "PROFILE",
    "label": "成长记录",
    "endpoint": "account-data",
    "selector": "GROWTH_RECORDS",
    "target": ""
  },
  {
    "key": "account:REFERRAL_COMMISSIONS",
    "scope": "TRANSACTIONS",
    "label": "推荐佣金",
    "endpoint": "account-data",
    "selector": "REFERRAL_COMMISSIONS",
    "target": ""
  },
  {
    "key": "account:REWARD_GRANTS",
    "scope": "TRANSACTIONS",
    "label": "奖励领取",
    "endpoint": "account-data",
    "selector": "REWARD_GRANTS",
    "target": ""
  },
  {
    "key": "account:LOTTERY_DRAWS",
    "scope": "TRANSACTIONS",
    "label": "抽奖记录",
    "endpoint": "account-data",
    "selector": "LOTTERY_DRAWS",
    "target": ""
  },
  {
    "key": "account:REWARD_FULFILLMENT",
    "scope": "TRANSACTIONS",
    "label": "奖励履约",
    "endpoint": "account-data",
    "selector": "REWARD_FULFILLMENT",
    "target": ""
  },
  {
    "key": "account:REWARD_DISCOUNTS",
    "scope": "TRANSACTIONS",
    "label": "奖励抵扣",
    "endpoint": "account-data",
    "selector": "REWARD_DISCOUNTS",
    "target": ""
  },
  {
    "key": "account:PRIVACY_REQUESTS",
    "scope": "PROFILE",
    "label": "资料权益申请",
    "endpoint": "account-data",
    "selector": "PRIVACY_REQUESTS",
    "target": ""
  },
  {
    "key": "account:PRIVACY_RESPONSES",
    "scope": "PROFILE",
    "label": "历史正式答复",
    "endpoint": "account-data",
    "selector": "PRIVACY_RESPONSES",
    "target": ""
  },
  {
    "key": "account:PRIVACY_EVENTS",
    "scope": "PROFILE",
    "label": "资料办理进展",
    "endpoint": "account-data",
    "selector": "PRIVACY_EVENTS",
    "target": ""
  },
  {
    "key": "account:PRIVACY_ACTIONS",
    "scope": "PROFILE",
    "label": "资料撤回与模型处理",
    "endpoint": "account-data",
    "selector": "PRIVACY_ACTIONS",
    "target": ""
  },
  {
    "key": "account:PRIVACY_EXECUTIONS",
    "scope": "PROFILE",
    "label": "资料实际执行记录",
    "endpoint": "account-data",
    "selector": "PRIVACY_EXECUTIONS",
    "target": ""
  },
  {
    "key": "account:NOTIFICATION_DELIVERIES",
    "scope": "PROFILE",
    "label": "通知发送状态",
    "endpoint": "account-data",
    "selector": "NOTIFICATION_DELIVERIES",
    "target": ""
  },
  {
    "key": "account:GUARDIAN_LINKS",
    "scope": "PROFILE",
    "label": "监护关系摘要",
    "endpoint": "account-data",
    "selector": "GUARDIAN_LINKS",
    "target": ""
  },
  {
    "key": "account:ENGAGEMENT_RECORDS",
    "scope": "PROFILE",
    "label": "本人活动参与",
    "endpoint": "account-data",
    "selector": "ENGAGEMENT_RECORDS",
    "target": ""
  },
  {
    "key": "account:SESSION_RECORDS",
    "scope": "PROFILE",
    "label": "仍保留的登录记录",
    "endpoint": "account-data",
    "selector": "SESSION_RECORDS",
    "target": ""
  },
  {
    "key": "account:PHONE_CHANGES",
    "scope": "PROFILE",
    "label": "本人换号申请",
    "endpoint": "account-data",
    "selector": "PHONE_CHANGES",
    "target": ""
  },
  {
    "key": "account:PHONE_CHANGE_EVENTS",
    "scope": "PROFILE",
    "label": "换号办理进展",
    "endpoint": "account-data",
    "selector": "PHONE_CHANGE_EVENTS",
    "target": ""
  },
  {
    "key": "account:PARTICIPATION_CONFIRMATIONS",
    "scope": "CONTRACTS",
    "label": "本人参加确认",
    "endpoint": "account-data",
    "selector": "PARTICIPATION_CONFIRMATIONS",
    "target": ""
  },
  {
    "key": "account:PARTICIPATION_MILESTONES",
    "scope": "CONTRACTS",
    "label": "本人参加节点",
    "endpoint": "account-data",
    "selector": "PARTICIPATION_MILESTONES",
    "target": ""
  },
  {
    "key": "trade:ORDERS",
    "scope": "TRANSACTIONS",
    "label": "本人买卖订单",
    "endpoint": "transaction-data",
    "selector": "ORDERS",
    "target": ""
  },
  {
    "key": "trade:SUMMARY",
    "scope": "TRANSACTIONS",
    "label": "原订单摘要与报价来源",
    "endpoint": "transaction-data",
    "selector": "SUMMARY",
    "target": "order"
  },
  {
    "key": "trade:PAYMENTS",
    "scope": "TRANSACTIONS",
    "label": "原订单付款",
    "endpoint": "transaction-data",
    "selector": "PAYMENTS",
    "target": "order"
  },
  {
    "key": "trade:REFUNDS",
    "scope": "TRANSACTIONS",
    "label": "原订单退款",
    "endpoint": "transaction-data",
    "selector": "REFUNDS",
    "target": "order"
  },
  {
    "key": "trade:JOURNAL",
    "scope": "TRANSACTIONS",
    "label": "原订单收退款流水",
    "endpoint": "transaction-data",
    "selector": "JOURNAL",
    "target": "order"
  },
  {
    "key": "trade:CONTRACT",
    "scope": "TRANSACTIONS",
    "label": "原订单冻结合同",
    "endpoint": "transaction-data",
    "selector": "CONTRACT",
    "target": "order"
  },
  {
    "key": "story:SUBMISSIONS",
    "scope": "PRIVATE_STORY",
    "label": "故事正式提交历史",
    "endpoint": "stories",
    "selector": "SUBMISSIONS",
    "target": "story"
  },
  {
    "key": "story:SUPPLEMENTS",
    "scope": "PRIVATE_STORY",
    "label": "故事补件与现存草稿",
    "endpoint": "stories",
    "selector": "SUPPLEMENTS",
    "target": "story"
  },
  {
    "key": "story:ATTACHMENTS",
    "scope": "PRIVATE_STORY",
    "label": "故事附件目录",
    "endpoint": "stories",
    "selector": "ATTACHMENTS",
    "target": "story"
  }
]
export function availableCopySources(scopes:unknown):CopySource[]{return Array.isArray(scopes)?copySources.filter(s=>scopes.includes('ALL')||scopes.includes(s.scope)):[]}
const bad=()=>new ApiError({status:503,code:'INVALID_COPY_RESPONSE',message:'资料返回内容与本次选择不符，请重新读取，不能按空记录处理。'})
export function copyPath(requestId:string,source:CopySource,target='',cursor:string|null=null,operations=false):string {
 if(!uuid(requestId)||!copySources.some(s=>s.key===source.key)||source.target&&!uuid(target))throw bad()
 const q=new URLSearchParams({[source.endpoint==='data'?'category':'section']:source.selector,limit:'20'})
 if(source.target==='order')q.set('order_id',target)
 if(cursor)q.set('cursor',cursor)
 return `/privacy/${operations?'operations/':''}requests/${requestId}/${source.target==='story'?'stories/'+target+'/data':source.endpoint}?${q}`
}
export function checkCopyPage(data:BusinessData,s:CopySource,target:string,cursor:string|null,seen:readonly string[]=[]):BusinessData {
 const n=data.next_cursor
 if(data[s.endpoint==='data'?'category':'section']!==s.selector||typeof data.coverage!=='string'||!Array.isArray(data.items)||data.items.some(x=>!x||typeof x!=='object'||Array.isArray(x))||!(n===null||typeof n==='string'&&n.length>0&&n.length<=128&&n!==cursor&&!seen.includes(n))||s.target==='order'&&data.order_id!==target||s.target==='story'&&data.story_id!==target||s.endpoint!=='data'&&data.request_completion!=='NOT_CONFIRMED')throw bad()
 return data
}
export function copyBundle(requestId:string,source:CopySource,target:string,pages:BusinessData[],remaining:string):BusinessData {
 if(!uuid(requestId)||!pages.length||!remaining.trim())throw bad()
 let cursor:string|null=null;const seen:string[]=[]
 for(const [index,p] of pages.entries()){if(index>0&&cursor===null)throw bad();checkCopyPage(p,source,target,cursor,seen);if(cursor)seen.push(cursor);cursor=p.next_cursor as string|null}
 return {request_id:requestId,source:source.key,source_label:source.label,target_id:target||null,request_completion:'NOT_CONFIRMED',selected_source_complete:cursor===null,remaining:remaining.trim(),pages}
}
