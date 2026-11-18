import {type Domain,id,text,long,integer,money,date,select,bool,group,rows,fixed,reason,review,operation as op,ids} from './model'
const evidence=()=>({...ids('evidence_asset_ids','本人的监护或审核依据文件'),min:1})
const decisions=(decision:string,label:string)=>op(decision.toLowerCase(),label,'/guardians/records/:record_id/decisions',[fixed('decision','本次决定',decision),reason()],'none',true,['records'])
export const guardians:Domain={key:'guardians',title:'监护管理与未成年退款',journal:'FAMILY PROTECTION',intro:'由监护人申请、孩子本人确认，再由独立人员核验；按原记录分别查看限制、信息处理和退款结果。',note:'只用获准的合成资料验证。实际儿童采集、建模、经营和收费关闭；消费同意不解锁付款。内容目录只提供独立审核的适龄预览。',sections:[
 {key:'records',label:'我的关系与申请',path:'/guardians/records',detail:'/guardians/records/:record_id',party:'none'},
 {key:'usage',label:'使用与休息提醒',path:'/guardians/links/:link_id/usage',party:'none'},
 {key:'content',label:'已审核适龄预览',path:'/guardians/links/:link_id/content',party:'none',files:[{label:'查看本项适龄预览',path:'/guardians/links/:link_id/content/:listing_id/preview',party:'none',type:'video/mp4'}]},
 {key:'information',label:'监护人查询必要资料',path:'/guardians/links/:link_id/information',party:'none',query:[select('category','查询类别',[['PROFILE','账号展示资料'],['ARTIST_MATERIALS','素材目录'],['CONTENT','内容目录'],['TRANSACTIONS','原订单索引']])]},
 {key:'operations',label:'运营独立审核',path:'/guardians/operations/records',detail:'/guardians/operations/records/:record_id',party:'none'}],operations:[
 op('invite','申请监护关联','/guardians/links',[id('child_account_id','孩子账号'),long('relationship','监护关系说明',1000),evidence(),id('rule_id','已审核监护保护规则'),date('valid_until','关系有效截止')],'none',false,['records']),
 decisions('ACCEPT','孩子本人确认关系'),{...decisions('REJECT','孩子本人拒绝关系'),key:'reject-child'},decisions('REVOKE','监护人撤销关系'),decisions('DISPUTE','孩子提出关系异议并暂停'),
 {...op('controls','监护人调整或一键关闭使用','/guardians/links/:link_id/controls',[group('controls','明确使用限制',[bool('enabled','允许在审核限制内使用（取消即关闭）'),integer('daily_minutes','每日使用分钟上限',1,240),money('single_minor','单笔消费同意上限（元）'),money('daily_minor','每日消费同意上限（元）')])],'none',true,['records']),method:'PUT'},
 op('session','孩子申请本次一分钟使用时段','/guardians/links/:link_id/sessions',[],'none',false,['usage','content']),
 op('spend','监护人记录单笔消费同意','/guardians/links/:link_id/spending-consents',[money('amount_minor','本次同意金额（元）',1),long('purpose','明确用途',1000)],'none',false,['records']),
 op('privacy','监护人提交信息处理申请','/guardians/links/:link_id/privacy-requests',[select('type','信息处理事项',[['QUERY','必要资料查询'],['DELETE','删除申请'],['CLOSE_ACCOUNT','注销申请']]),long('details','具体请求及范围',4000)],'none',false,['records']),
 op('refund-request','监护人提出未成年退款申请','/guardians/links/:link_id/refund-requests',[id('payment_id','孩子的原成功付款'),rows('allocations','本次原付款分项',[text('line_id','原付款分项编号',128),money('amount_minor','该项申请退回金额（元）',1)],100),reason(),evidence()],'none',false,['records']),
 op('refund','将已审核申请送入原支付退款流程','/guardians/records/:record_id/refund',[],'none',true,['records']),
 op('review','独立核验关系或退款申请','/guardians/operations/records/:record_id/decisions',[...review(),{...select('age_band','本次独立核验年龄范围',[['UNDER_14','未满14岁（实际处理关闭）'],['AGE_14_17','14—17岁']]),optional:true},bool('identity_checked','已实际核对身份',true),bool('relationship_checked','已实际核对监护关系及事实',true)],'none',true,['operations'])]}
