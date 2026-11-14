import {type Domain,type Field,id,long,select,fixed,reason,operation as op,ids} from './model'
const evidence=()=>({...ids('evidence_asset_ids','本次权利依据文件'),min:1})
const notice=()=>[long('statement','完整权利说明',8000),long('contact','仅供运营联系，不自动转交对方',500),evidence()]
const action=(key:string,label:string,code:string,fields:Field[]=[],operations=false)=>op(key,label,`/infringement/${operations?'operations/':''}cases/:case_id/actions`,[fixed('action','本次办理',code),...fields,reason()],operations?'none':'required',true,[operations?'operations':'cases'])
export const infringement:Domain={key:'infringement',title:'侵权通知与反通知',journal:'RIGHTS NOTICES',intro:'提交明确权利通知，核对获准送达材料，按独立复核记录处理限制与恢复。',note:'运营响应目标不是法律自动裁决期限。联系人、内部意见和未准许送达的原件不会自动转交；撤回通知不直接解除冻结，解除本案也不解除其他限制。',sections:[
 {key:'cases',label:'本人作为当事人的案件',path:'/infringement/cases',detail:'/infringement/cases/:case_id',party:'required',files:[{label:'读取本案获准材料',path:'/infringement/cases/:case_id/files/:asset_id',party:'required'}]},
 {key:'operations',label:'运营处理与独立复核',path:'/infringement/operations/cases',detail:'/infringement/operations/cases/:case_id',party:'none',files:[{label:'读取本案审核依据',path:'/infringement/operations/cases/:case_id/files/:asset_id',party:'none'}]}],operations:[
 op('create','提出侵权通知','/infringement/cases',[select('target_kind','具体涉案对象',[['ASSET','本人可引用的文件'],['ARTIST_LISTING','人物展示'],['STOCK_LISTING','现货影片'],['NOTICE','公开通告'],['PRODUCTION_VERSION','获准制作版本']]),id('target_id','原对象编号'),...notice()],'required',false,['cases']),
 action('supplement','按要求补充通知','SUPPLEMENT',[long('statement','补充后的完整权利说明',8000),evidence()]),
 action('counter','提交本案反通知','COUNTER',notice()),action('ack','明确确认已读送达材料','ACK_DELIVERY'),action('withdraw','申请撤回本通知','WITHDRAW'),
 action('request-info','要求发起方补件','REQUEST_INFO',[],true),action('freeze','冻结涉案内容','FREEZE',[],true),action('reject-notice','退回本次通知','REJECT',[],true),
 action('deliver-notice','送达必要通知材料','DELIVER_NOTICE',[long('statement','已脱敏的必要通知正文',8000),ids('disclosed_asset_ids','逐项选择准许送达的原依据（可为空）')],true),
 action('deliver-counter','送达必要反通知材料','DELIVER_COUNTER',[long('statement','已脱敏的必要反通知正文',8000),ids('disclosed_asset_ids','逐项选择准许送达的原依据（可为空）')],true),
 action('propose','提出本案处理结论','PROPOSE',[select('decision','建议结论',[['RESTORE','仅解除本案限制'],['MAINTAIN','维持本案限制']])],true),
 action('review','另一岗位独立复核处理结论','REVIEW',[select('decision','独立审核结论',[['APPROVE','通过本提议'],['REJECT','退回本提议']])],true)]}
