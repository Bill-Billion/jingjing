import { request, requestBytes, ApiError, type RequestOptions } from '@/api/client'
export type BusinessData=Record<string,unknown>
export function businessData(value:unknown):BusinessData {
  let count=0
  function inspect(v:unknown,depth=0):void {if(++count>100000||depth>24)throw new Error('limit');if(v===null||typeof v==='string'||typeof v==='boolean')return;if(typeof v==='number'&&Number.isFinite(v))return;if(Array.isArray(v)){v.forEach(x=>inspect(x,depth+1));return}if(v&&typeof v==='object'){for(const [k,x]of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))throw new Error('key');inspect(x,depth+1)}return}throw new Error('shape')}
  try {if(!value||typeof value!=='object')throw new Error('shape');inspect(value);return Array.isArray(value)?{items:value}:value as BusinessData} catch {throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'返回内容不符合业务记录格式，请保留原请求并核对。'})}
}
export interface BusinessOptions extends RequestOptions {accountId?:string}
function checked(r:Awaited<ReturnType<typeof request>>,o:BusinessOptions){if(o.accountId&&(!r.meta?.request_id||r.meta.actor?.account_id!==o.accountId||r.meta.acting_party!==(o.actingParty||null)))throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'返回记录与当前账号或办理身份不一致，已停止显示。'});return{...r,data:businessData(r.data)}}
export async function readBusiness(path:string,options:BusinessOptions){const r=await request<unknown>(path,{...options,cache:'no-store'});return checked(r,options)}
export async function writeBusiness(path:string,options:BusinessOptions){const r=await request<unknown>(path,options);return checked(r,options)}
export const businessBytes=(path:string,options:RequestOptions,type='application/octet-stream')=>requestBytes(path,options,type)
export const rowData=(r:BusinessData):BusinessData=>r.data&&typeof r.data==='object'&&!Array.isArray(r.data)?r.data as BusinessData:r
export const recordId=(r:BusinessData):string=>String(r.id||r.order_id||r.request_id||r.project_id||r.record_id||r.booking_id||r.agreement_id||r.grant_id||'')
export function versionOf(r:BusinessData|null):number|null {const n=r?.object_version;return typeof n==='number'&&Number.isSafeInteger(n)&&n>=0?n:null}
export function rowsOf(r:BusinessData|null):BusinessData[]{if(!r)return[];for(const k of ['items','records','grants','rooms','bookings','rewards','orders','candidates'])if(Array.isArray(r[k]))return(r[k] as unknown[]).filter((x):x is BusinessData=>!!x&&typeof x==='object'&&!Array.isArray(x));return[]}
