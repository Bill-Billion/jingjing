import { ApiError } from '@/api/client'
import { readBusiness, type BusinessOptions } from './business'
import { uuid } from '@/business/model'

export interface StockEligibility {
  person_id:string; seller_party_id:string; identity_verified:boolean; l1_verified:boolean
  manual_review_approved:boolean; eligible:boolean; blocking_reasons:string[]; policy_version:'CONTRACT_20261029'
}
export function stockEligibility(value:Record<string,unknown>,person:string,party:string):StockEligibility {
  const checks=['identity_verified','l1_verified','manual_review_approved'] as const
  const reasons=['ARTIST_IDENTITY_REQUIRED','STOCK_L1_REQUIRED','STOCK_HALO_REVIEW_REQUIRED']
  const missing=reasons.filter((_,i)=>value[checks[i]!]===false)
  if(value.person_id!==person||value.seller_party_id!==party||!uuid(person)||!uuid(party)
    ||value.policy_version!=='CONTRACT_20261029'||checks.some(k=>typeof value[k]!=='boolean')
    ||value.eligible!==(missing.length===0)||!Array.isArray(value.blocking_reasons)
    ||value.blocking_reasons.length!==missing.length||!missing.every(r=>(value.blocking_reasons as unknown[]).includes(r))) {
    throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'无法确认当前身份与这位艺人的上架资格，请重新读取。',requestMethod:'GET'})
  }
  return value as unknown as StockEligibility
}
export async function getStockEligibility(person:string,options:BusinessOptions) {
  const r=await readBusiness('/stock/seller-eligibility?'+new URLSearchParams({person_id:person}),options)
  return stockEligibility(r.data,person,options.actingParty||'')
}
