import { ApiError } from '@/api/client'
import { rowData, type BusinessData } from '@/api/modules/business'

export const contract20261029='CONTRACT_20261029'
export function acceptanceSummary(record:BusinessData,kind:'stock'|'auditions') {
 const d=rowData(record),terms=(d.license||record.license||d.rules||record.rules||{}) as BusinessData
 const modern=terms.acceptance_policy===contract20261029
 return {modern,policy:modern?'2026-10-29合同48小时规则':'原订单规则（不重算）',
  start:modern?(kind==='stock'?'原下单时间':'交付材料独立审核通过时间'):'本人明确收讫后，按原约定',
  startedAt:d.acceptance_started_at??record.acceptance_started_at??null,deadline:d.deadline_at??record.deadline_at??null,
  hours:terms.acceptance_hours??null,
  warning:'时间届满不等于自动完成：付款、文件可用、有效授权及无争议仍由服务器逐项核验。刷新页面不会重置期限。'}
}
export function validateSixForm(domain:string,key:string,body:BusinessData,record:BusinessData|null) {
 const fail=(message:string):never=>{throw new ApiError({status:400,code:'CONTRACT_FORM_INVALID',message})}
 if(domain==='engagement'&&key==='rule'){
  const r=body.rule as BusinessData
  if(r.referral_contract_policy===contract20261029)for(const kind of ['STOCK','AUDITION','CUSTOMIZATION','COMMERCIAL']){
   const n=(r.referral_bps as BusinessData)?.[kind];if(!Number.isInteger(n)||Number(n)<1000||Number(n)>1500)fail('新直推规则的四类比例都须为10%—15%（1000—1500基点）。旧记录不改写。')
  }
 }
 if(domain==='privacy'&&key==='clock-propose'&&body.kind==='EXTEND'){
  const s=String(body.due_on||''),d=record?.due_on
  if(!/^20\d\d-\d\d-\d\d$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s||typeof d!=='string'||s<=d)fail('延期日须为有效日期，且晚于当前执行截止日。原截止仍保留。')
 }
 if(domain==='guardians'&&key==='controls'){
  const c=body.controls as BusinessData,r=(rowData(record||{}).rule as BusinessData)?.terms as BusinessData|undefined
  if(!r)fail('请从已审核的监护关系读取当前限制及规则，再修改。')
  if(Number(c.daily_minutes)>Number(r!.daily_minutes)||Number(c.single_minor)>Number(r!.single_minor)||Number(c.daily_minor)>Number(r!.daily_minor)||Number(c.daily_minor)<Number(c.single_minor))fail('监护限制不能高于已审核规则，日额度不能小于单笔额度。消费同意不会开放真实付款。')
 }
 if(domain==='infringement'&&['deliver-notice','deliver-counter'].includes(key)){
  const source=record?.[key==='deliver-notice'?'notice':'counter'] as BusinessData|undefined,allowed=source?.evidence_asset_ids
  if(!Array.isArray(allowed)||!Array.isArray(body.disclosed_asset_ids)||body.disclosed_asset_ids.some(id=>!allowed.includes(id)))fail('只能选择本次原通知中已有的必要材料送达；联系人和其他原件不自动转交。')
 }
}
export function sixActionReason(domain:string,key:string,r:BusinessData|null,accountId:string,partyId:string):string|null {
 if(!r)return null
 const d=rowData(r),status=String(r.current_status||r.status||'')
 if(domain==='guardians'){
  const guardian=r.guardian_account_id===accountId,child=r.child_account_id===accountId
  if(key==='invite')return null
  if(['accept','reject-child'].includes(key)&&!(child&&r.kind==='LINK'&&status==='INVITED'))return '仅被关联的孩子可确认或拒绝这份待确认关系。'
  if(key==='dispute'&&!(child&&r.kind==='LINK'&&status==='ACTIVE'))return '只有本关系中的孩子可提出关系异议；异议会暂停代办。'
  if(key==='session'&&!(child&&r.kind==='LINK'&&status==='ACTIVE'))return '本次使用时段须由孩子本人在有效关系中明确申请。'
  if(key==='revoke'&&!(guardian&&r.kind==='LINK'&&['INVITED','IN_REVIEW','ACTIVE'].includes(status)))return '仅该监护人可撤销这份关系。'
  if(['controls','privacy','spend','refund-request'].includes(key)&&!(guardian&&r.kind==='LINK'&&status==='ACTIVE'&&Date.parse(String(d.valid_until))>Date.now()))return '须由本关系的监护人，在独立审核通过且未到期的关系中办理。'
  if(key==='refund'&&!(guardian&&r.kind==='REFUND'&&status==='APPROVED'))return '先由独立人员核实未成年退款申请；审核通过后由监护人送入原支付退款流程。'
  if(key==='review'&&(!(r.kind==='LINK'||r.kind==='REFUND')||status!=='IN_REVIEW'||guardian||child))return '本项须由关系以外的获准人员独立审核。'
 }
 if(domain==='infringement'){
  const states:Record<string,string[]>={supplement:['SUBMITTED','NEEDS_INFO'],'request-info':['SUBMITTED'],freeze:['SUBMITTED'],'reject-notice':['SUBMITTED','NEEDS_INFO'],'deliver-notice':['FROZEN'],'deliver-counter':['COUNTER_SUBMITTED'],counter:['NOTICE_DELIVERED'],propose:['NOTICE_DELIVERED','COUNTER_DELIVERED','WITHDRAWAL_REVIEW'],review:['REVIEW_PENDING']}
  if(states[key]&&!states[key]!.includes(status))return '本案当前不能办理这一步，请先核对最新进展。'
  const applicant=typeof (r.notice as BusinessData|undefined)?.contact==='string'
  if(key==='counter'&&r.next_action!=='SUBMIT_COUNTER')return '仅收到本案已送达通知的对方可提交反通知。'
  if(key==='withdraw'&&(!applicant||['RESOLVED','REJECTED','WITHDRAWN'].includes(status)))return '仅通知发起方可申请撤回；已冻结的内容仍须独立复核。'
  if(key==='ack'){
   const delivery=(r.deliveries as BusinessData|undefined)?.[applicant?'counter':'notice'] as BusinessData|undefined
   if(!delivery||delivery.read_at)return '没有待确认已读的对方送达材料。读取页面不会自动标记已读。'
  }
  if(key==='review'&&(r.pending_review as BusinessData|undefined)?.by===accountId)return '处理提议人不能复核自己提出的结论。冻结人也须回避，服务器会再次核验。'
 }
 if(domain==='privacy'&&key.startsWith('clock-')){
  if(key==='clock-review'&&(!r.pending||(r.pending as BusinessData).proposed_by===accountId))return '先读取待审方案，由另一位获准人员复核。'
  if(key==='clock-propose'&&(r.pending_action||status==='COMPLETED'))return '当前已有待审方案或已实际结案，请先核对。'
 }
 if(domain==='handover'&&key==='ack'&&r.new_business_allowed!==false)return '请先读取本关系的实际交接清单。'
 return null
}
export const sixLabels:Record<string,string>={acceptance_policy:'本单验收规则版本',acceptance_started_at:'服务器验收起点',referral_contract_policy:'直推合同版本',handover:'解除关系后的旧单交接',relation_id:'原机构关系',period_status:'交接期状态',order_count:'捕获的旧单数量',new_business_allowed:'是否允许新业务',order_sha256:'交接时原订单校验值',acknowledgements:'双方确认记录',note:'交接说明',last_acknowledged_order_id:'最近确认的旧单',guardian_account_id:'监护人账号',child_account_id:'孩子账号',parent_id:'原监护关系',relationship:'监护关系说明',child_accepted:'孩子本人是否确认',age_band:'独立核验年龄范围',controls:'当前使用限制',daily_minutes:'每日使用分钟上限',daily_minor:'每日消费同意上限',single_minor:'单笔消费同意上限',seconds_reserved:'今日已预留使用秒数',spend_reserved_minor:'今日已记录消费同意',real_payment_allowed:'是否允许真实付款',real_minor_transactions_enabled:'是否开放真实未成年交易',real_purchases_enabled:'是否开放真实购买',preview_only:'仅提供适龄预览',local_date:'北京时间使用日期',slot_until:'本次预留时段截止',actual_privacy_status:'实际信息处理进度',actual_refund_status:'原支付退款实际状态',privacy_request_id:'信息处理申请',response_due_on:'收到申请后的回复期限',verified_at:'独立核验通过时间',original_due_on:'核验后的原执行截止',due_on:'当前执行截止',completed_at:'实际完成并复核的时间',calendar_version:'冻结工作日日历版本',deadline_basis:'期限依据',pending_action:'待独审事项',extensions:'已审延期记录',pending:'待独立复核方案',proposed_by:'提议人',from:'原执行日期',to:'延期后日期',review_reason:'独立复核依据',basis:'处理依据',initial_response_due_at:'本案运营响应目标',initial_response_target:'响应目标性质',initial_response_overdue:'运营响应目标是否逾期',restriction_active:'本案限制是否仍生效',information_request:'需补充的材料说明',counter:'反通知材料',deliveries:'站内送达记录',read_at:'接收方明确已读时间',pending_review:'待独立处理结论',resolution:'独立复核结论',disclosed_asset_ids:'明确准许送达的必要材料',statement:'本次权利说明',night_start:'夜间限制开始（北京时间）',night_end:'夜间限制结束（北京时间）'}
export const sixStates:Record<string,string>={PARTIALLY_REFUNDED:'部分退款',PENDING:'待双方完成确认',CONTRACT_20261029:'2026-10-29合同新规则',LEGACY_COMPATIBLE:'保留原规则',ACKNOWLEDGED:'双方已确认交接',NOT_VERIFIED:'尚未核验，无执行倒计时',VERIFICATION_PENDING:'核验方案待独立复核',TRACKING:'按核验后期限办理',OVERDUE:'执行期限已逾期',COMPLETED:'实际执行并复核后结案',VERIFY:'核验执行起点',EXTEND:'有依据延长期限',COMPLETE:'核对实际执行后结案',LINK:'监护关系',SPEND:'单笔消费同意（未开放付款）',INFORMATION:'信息处理申请',REFUND:'未成年退款申请',INVITED:'待孩子本人确认',SUSPENDED:'关系异议已暂停',SUBMITTED:'已提交待处理',REFUND_REQUESTED:'已申请原单退款，非已到账',CONSENT_RECORDED_SERVICE_DISABLED:'已记录消费同意，真实付款关闭',UNDER_14:'未满14岁（实际处理关闭）',AGE_14_17:'14—17岁',NEEDS_INFO:'等待发起方补件',NOTICE_DELIVERED:'必要通知材料已站内送达',COUNTER_SUBMITTED:'反通知已提交待核对',COUNTER_DELIVERED:'必要反通知材料已站内送达',WITHDRAWAL_REVIEW:'撤回已申请，限制待独立复核',REVIEW_PENDING:'处理结论待独立复核',RESTORE:'解除本案限制（其他限制仍独立有效）',MAINTAIN:'维持本案限制',READ_PROGRESS:'查看获准进度',SUBMIT_COUNTER:'可以提交本案反通知',OPERATIONAL_TARGET_NOT_LEGAL_DEADLINE:'运营响应目标，非法律自动裁决期限'}
