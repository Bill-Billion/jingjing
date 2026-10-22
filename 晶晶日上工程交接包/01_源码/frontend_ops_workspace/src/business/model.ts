import { ApiError } from '@/api/client'
import { yuanInput } from '@/api/modules/trade'

export type PartyMode = 'required' | 'optional' | 'none'
export interface Field {
  key: string; label: string; type?: 'text'|'textarea'|'id'|'hash'|'integer'|'money'|'datetime'|'select'|'values'|'boolean'|'group'|'list'|'ids'|'numbers'|'lines'
  choices?: readonly (string | readonly [string,string])[]; fields?: Field[]; nullable?: boolean; optional?: boolean
  fixed?: unknown; min?: number; max?: number; length?: number; hint?: string; agree?: boolean
  visible?: (root: Record<string,unknown>) => boolean; inactive?:unknown
}
export interface Operation { key:string; label:string; path:string; fields:Field[]; party:PartyMode; match?:boolean; method?:'POST'|'PATCH'; note?:string; sections?:string[] }
export interface FileAction { label:string; path:string; party:PartyMode; type?:string; observe?:boolean }
export interface Section { key:string; label:string; path:string; detail?:string; party:PartyMode; query?:Field[]; fixedQuery?:Record<string,string>; files?:FileAction[]; note?:string }
export interface Domain { key:string; title:string; journal:string; intro:string; sections:Section[]; operations:Operation[]; note?:string }
export const text=(key:string,label:string,max=2000):Field=>({key,label,max})
export const long=(key:string,label:string,max=8000):Field=>({key,label,type:'textarea',max})
export const id=(key:string,label:string,nullable=false):Field=>({key,label,type:'id',nullable})
export const hash=(key='content_sha256',label='已读取约定的内容校验值'):Field=>({key,label,type:'hash'})
export const integer=(key:string,label:string,min=0,max=1000000000):Field=>({key,label,type:'integer',min,max})
export const money=(key:string,label:string,min=0):Field=>({key,label,type:'money',min})
export const date=(key:string,label:string):Field=>({key,label,type:'datetime'})
export const select=(key:string,label:string,choices:Field['choices']):Field=>({key,label,type:'select',choices})
export const values=(key:string,label:string,choices:Field['choices']):Field=>({key,label,type:'values',choices})
export const bool=(key:string,label:string,agree=false):Field=>({key,label,type:'boolean',agree})
export const ids=(key:string,label:string,max=20):Field=>({key,label,type:'ids',max})
export const numbers=(key:string,label:string,length?:number):Field=>({key,label,type:'numbers',length})
export const lines=(key:string,label:string,max=30):Field=>({key,label,type:'lines',max})
export const group=(key:string,label:string,fields:Field[],nullable=false):Field=>({key,label,type:'group',fields,nullable})
export const rows=(key:string,label:string,fields:Field[],max=20,min=1):Field=>({key,label,type:'list',fields,max,min})
export const fixed=(key:string,label:string,value:unknown):Field=>({key,label,fixed:value})
export const optional=(f:Field):Field=>({...f,optional:true})
export const reason=()=>long('reason','本次办理理由',2000)
export const review=()=>[select('decision','独立审核结论',[['APPROVE','通过'],['REJECT','退回']]),reason()]
export const checks=(names:readonly (readonly [string,string])[],key='verification')=>group(key,'逐项核验',names.map(([k,l])=>bool(k,l,true)))
export const operation=(key:string,label:string,path:string,fields:Field[],party:PartyMode='required',match=false,sections?:string[]):Operation=>({key,label,path,fields,party,match,sections})
export const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v)
export function initial(fields:Field[]):Record<string,unknown>{return Object.fromEntries(fields.map(f=>[f.key,f.fixed!==undefined?structuredClone(f.fixed):f.type==='group'?(f.nullable?null:initial(f.fields||[])):['list','values'].includes(f.type||'')?[]:f.type==='boolean'?false:'']))}
function invalid(f:Field):never{throw new ApiError({status:400,code:'BUSINESS_FORM_INVALID',message:`请核对“${f.label}”。${f.hint||''}`})}
export function encode(fields:Field[],value:Record<string,unknown>,root=value):Record<string,unknown>{const result:Record<string,unknown>={};for(const f of fields){if(f.visible&&!f.visible(root)){if('inactive'in f)result[f.key]=f.inactive;continue}const v=value[f.key];if(f.fixed!==undefined){result[f.key]=structuredClone(f.fixed);continue}if((v===undefined||v===null||v==='')&&f.optional)continue;if((v===undefined||v===null||v==='')&&f.nullable){result[f.key]=null;continue}
  switch(f.type){case 'group':if(!v||typeof v!=='object'||Array.isArray(v))invalid(f);result[f.key]=encode(f.fields||[],v as Record<string,unknown>,root);break;
  case 'list':if(!Array.isArray(v)||v.length<(f.min??1)||v.length>(f.max??20))invalid(f);result[f.key]=v.map(row=>{if(!row||typeof row!=='object'||Array.isArray(row))invalid(f);return encode(f.fields||[],row as Record<string,unknown>,root)});break;
  case 'boolean':if(typeof v!=='boolean'||f.agree&&!v&&!['REJECT','REJECTED'].includes(String(root.decision)))invalid(f);result[f.key]=v;break;
  case 'values':if(!Array.isArray(v)||!v.length||v.some(x=>!f.choices?.some(c=>(typeof c==='string'?c:c[0])===x)))invalid(f);result[f.key]=v;break;
  case 'money':{const n=yuanInput(String(v??''),f.min===0||f.min===undefined?0:1);if(n===null||n<(f.min??0))invalid(f);result[f.key]=n;break}
  case 'integer':{if(String(v??'').trim()==='')invalid(f);const n=Number(v);if(!Number.isSafeInteger(n)||n<(f.min??0)||n>(f.max??1000000000))invalid(f);result[f.key]=n;break}
  case 'ids':{const a=String(v??'').trim().split(/[\s,，]+/).filter(Boolean);if(a.length>(f.max??20)||a.some(x=>!uuid(x))||new Set(a).size!==a.length)invalid(f);result[f.key]=a;break}
  case 'lines':{const a=String(v??'').trim().split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(a.length>(f.max??30)||a.some(x=>x.length>2000))invalid(f);result[f.key]=a;break}
  case 'numbers':{const a=String(v??'').trim().split(/[\s,，]+/).filter(Boolean).map(Number);if(!a.length||f.length!==undefined&&a.length!==f.length||a.some(n=>!Number.isSafeInteger(n)||n<0))invalid(f);result[f.key]=a;break}
  case 'datetime':{if(typeof v!=='string'||!v.trim()||!Number.isFinite(Date.parse(v)))invalid(f);result[f.key]=new Date(v as string).toISOString();break}
  default:{if(typeof v!=='string'||!v.trim())invalid(f);const s=(v as string).trim();if(f.max&&s.length>f.max||f.type==='id'&&!uuid(s)||f.type==='hash'&&!/^[a-f0-9]{64}$/.test(s)||f.type==='select'&&!f.choices?.some(c=>(typeof c==='string'?c:c[0])===s))invalid(f);result[f.key]=s}}
}return result}
export function pathFor(path:string,values:Record<string,unknown>):string{return path.replace(/:([a-z_]+)/g,(_,key:string)=>{const v=values[key];if(!uuid(v))throw new ApiError({status:400,code:'BUSINESS_REFERENCE_REQUIRED',message:'请先读取或选择本次办理的原记录。'});return encodeURIComponent(v)})}
export function routeIds(path:string):string[]{return [...new Set([...path.matchAll(/:([a-z_]+)/g)].map(m=>m[1]!))]}
