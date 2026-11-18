import { ApiError } from '@/api/client'
import type { BusinessData } from '@/api/modules/business'
import { uuid } from './model'

const object = (v:unknown):v is BusinessData => !!v && typeof v==='object' && !Array.isArray(v)
const text = (v:unknown,max:number):v is string => typeof v==='string' && !!v.trim() && Array.from(v).length<=max
const hash = (v:unknown):v is string => typeof v==='string' && /^[a-f0-9]{64}$/.test(v)
const integer = (v:unknown,min:number,max:number) => Number.isSafeInteger(v) && Number(v)>=min && Number(v)<=max
const reference = (v:unknown) => typeof v==='string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(v)
export type CreationKind = 'RULE'|'PRODUCER'
export interface CreationPage {items:BusinessData[];next_cursor:string|null;unavailable_reason:string|null}

export function isCreationRule(v:unknown):v is BusinessData {
  if(!object(v)||!reference(v.version)||!reference(v.source_ref)||!integer(v.max_people,21,100)||!integer(v.extension_days,1,90)||!text(v.participation_terms,8000)||!object(v.benefit))return false
  const b=v.benefit
  return reference(b.service_code)&&text(b.description,2000)&&integer(b.credit_minor,1,900000000000)&&integer(b.valid_days,1,730)
}
function invalid(method:'GET'|'POST'='GET'):never {
  throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:method==='GET'?'无法核对本故事的建房选项，请重新读取当前承制方和规则。':'建房回执与原请求不一致，请保留原请求并核对恢复。',requestMethod:method})
}
export function creationPage(value:BusinessData,kind:CreationKind,cursor?:string):CreationPage {
  if(!Array.isArray(value.items)||value.items.length>100||!(value.next_cursor===null||uuid(value.next_cursor)&&value.next_cursor!==cursor))invalid()
  if(value.unavailable_reason!==null && !(kind==='PRODUCER'&&value.unavailable_reason==='CUSTOMIZATION_MERCHANT_NOT_CONFIGURED'&&!value.items.length&&value.next_cursor===null))invalid()
  for(const item of value.items){
    if(!object(item)||!uuid(item.id))invalid()
    if(kind==='PRODUCER'?!text(item.display_name,160)||item.role!=='PLATFORM_CONTRACTING_PARTY':!hash(item.content_sha256)||!isCreationRule(item.rule))invalid()
  }
  if(new Set(value.items.map(item=>item.id)).size!==value.items.length)invalid()
  // content_sha256 covers the reviewed record, including its review. The
  // discovery payload contains only rule, so recomputing digest({rule}) is wrong.
  return value as unknown as CreationPage
}
export function validateCreatedRoom(room:BusinessData,body:unknown):void {
  if(!object(body)||!uuid(room.id)||!integer(room.object_version,1,4294967294)||room.current_status!=='OPEN'||!hash(room.participation_sha256)||!isCreationRule(room.rule_snapshot)||!Array.isArray(room.allowed_actions)||!room.allowed_actions.includes('READ'))invalid('POST')
  for(const key of ['title','producer_party_id','purpose','territory'])if(room[key]!==body[key])invalid('POST')
  if(typeof room.deadline!=='string'||typeof body.deadline!=='string'||!Number.isFinite(Date.parse(room.deadline))||Date.parse(room.deadline)!==Date.parse(body.deadline))invalid('POST')
}
export interface CreationIssue {message:string;links:{to:string;label:string}[]}
export function creationIssue(code:string,requestId:unknown):CreationIssue {
  const story=uuid(requestId)?`/operations/customization/mine/${requestId}`:'/operations/customization/mine'
  const original={to:story,label:'返回本人的原故事与补件'}
  const messages:Record<string,string>={
    COCREATION_SUBMITTED_STORY_REQUIRED:'先正式提交本人的故事；保存草稿还不能发起共创。',
    COCREATION_STORY_SUPPLEMENT_PENDING:'这份故事还有待完成的补件。先正式补交，再回来读取建房选项。',
    COCREATION_BEFORE_QUOTE_REQUIRED:'这份故事已进入报价，请沿原报价办理，不能把已有报价自动改成共创。',
    CUSTOMIZATION_ORDER_EXISTS:'这份故事已有订单，请沿原报价和订单继续办理。',
    COCREATION_ROOM_EXISTS:'这份故事已有共创房间，请到本人房间列表核对，不能再创建第二间。',
    MANUAL_SAMPLE_COCREATION_NOT_ALLOWED:'这份故事属于人工样片委托，请沿原样片流程办理。',
    CUSTOMIZATION_MERCHANT_NOT_CONFIGURED:'平台尚未配置可承接主体。故事和本页输入仍保留，配置完成后可重新读取。',
    CUSTOMIZATION_MERCHANT_FORBIDDEN:'刚选的承制方已不适用于这份故事，请重新读取当前平台承制方与规则。',
    COCREATION_RULE_NOT_EFFECTIVE:'刚选的参加规则已失效，请重新读取生效规则并明确选择。',
    COCREATION_PERSONAL_ACCOUNT_REQUIRED:'请切换到本人个人身份，读取本人已提交的故事后发起共创。',
    COCREATION_DEADLINE_PASSED:'报名截止时间已经过去。请保留当前输入，改为未来时间后重新核对选项。',
    CLIENT_COCREATION_STORY_REQUIRED:'先选择本人的已提交或受理中故事。',
    CLIENT_COCREATION_RULE_UNAVAILABLE:'当前没有生效参加规则。可保留故事，待平台发布规则后重新读取。',
    CLIENT_COCREATION_PRODUCER_UNAVAILABLE:'当前没有本故事可选择的承制方，请等待平台核对承接配置。',
    CLIENT_COCREATION_CONTEXT_REQUIRED:'请读取本故事当前承制方和规则，并明确选择后再创建。',
    CUSTOMIZATION_NOT_FOUND:'这份故事不存在或当前身份无权读取，请返回本人故事列表核对。',
  }
  const links=[original]
  if(['COCREATION_BEFORE_QUOTE_REQUIRED','CUSTOMIZATION_ORDER_EXISTS'].includes(code))links.push({to:'/trade/quotes',label:'查看本人的原报价与订单'})
  if(code==='COCREATION_ROOM_EXISTS')links.push({to:'/cocreation/rooms',label:'查看本人已有共创房间'})
  if(code==='MANUAL_SAMPLE_COCREATION_NOT_ALLOWED'&&uuid(requestId))links.push({to:`/participation/manual-confirmation/${requestId}`,label:'查看原人工样片委托'})
  return{message:messages[code]||'本次建房资格未能核对，请保留输入，重新读取当前承制方与规则。',links}
}
