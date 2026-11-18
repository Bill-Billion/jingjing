import {type Domain,text,long,id,hash,integer,money,select,bool,group,rows,reason,optional,operation as op} from './model'
import {ApiError} from '@/api/client'
import {type BusinessData,rowData} from '@/api/modules/business'
const base='/finance/daily-reconciliations'
const kind=()=>select('kind','本次额度类别',[['PAYMENT','本人现金消费'],['RECHARGE','本人充值']])
export const consumer:Domain={key:'consumer',title:'个人月度限额',journal:'PERSONAL LIMITS',intro:'分别设置本人充值和现金消费的月度上限，降低立即生效，提高须等待后本人确认。',note:'0表示停止新的相应付费；留空仅表示本人未另设上限，平台和年龄规则仍有效。占用包含待确认请求，退款不恢复本月额度；取消未发出的请求才释放占用。设置不开户、不充值、不创建会员。',sections:[{key:'settings',label:'当前限额与申请',path:'/wallet/consumer-controls',party:'required'},{key:'history',label:'本人变更记录',path:'/wallet/consumer-controls/history',party:'required',fixedQuery:{limit:'20'}}],operations:[
 op('change','修改本人的月度上限','/wallet/consumer-controls',[kind(),{...money('monthly_limit_minor','新的月度上限'),nullable:true,hint:'0停止新的相应付费；留空申请取消本人上限。提高或取消需等待冷静期。'}],'required',true,['settings']),
 op('confirm','本人确认已到期的提额申请','/wallet/consumer-controls/confirm',[kind()],'required',true,['settings']),
 op('cancel','取消待生效的提额申请','/wallet/consumer-controls/cancel',[kind()],'required',true,['settings'])]}
const mode=()=>select('mode','本次导入方式',[['REPLACE','替换本类账单'],['APPEND','追加到本类账单']])
const direction=()=>select('direction','资金方向',[['IN','流入'],['OUT','流出']])
const file={label:'读取本报告或历史快照的依据',path:base+'/:report_id/files/:asset_id',party:'none' as const,type:'private-evidence'}
export const dailyFinance:Domain={key:'daily-finance',title:'财务日对账工作台',journal:'DAILY RECONCILIATION',intro:'按同一商户、渠道、环境和北京时间已结束业务日，对照已记账事实与独立凭证。',note:'仅财务审核岗位可访问；机构管理员身份不授予审核权。此处只核对账目，不发起付款或银行操作。录入人、导入人及商家当前成员不能审核自己的报告。',sections:[
 {key:'reports',label:'报告与办理',path:base,detail:base+'/:report_id',party:'none',query:[optional({...id('merchant_party_id','商家主体'),manual:true}),optional(text('business_date','北京时间业务日期 YYYY-MM-DD',10))],files:[file]},
 {key:'facts',label:'平台已记账事实',path:base+'/:report_id/facts',party:'none',fixedQuery:{limit:'50'},query:[optional(integer('limit','每页事实条数（1—100）',1,100)),optional({...hash('source_fingerprint','本轮事实校验值'),readonly:true})],note:'整轮分页固定同一事实校验值。若后来有回执或退款，清空原分页并重新读取，不拼接旧新账目。'},
 {key:'history',label:'不可变审核历史',path:base+'/:report_id/history',party:'none',files:[file]}],operations:[
 op('create','建立本日渠道对账报告',base,[group('scope','准确对账范围',[text('business_date','北京时间已结束业务日期 YYYY-MM-DD',10),id('merchant_party_id','商家主体'),select('provider','渠道',['ALIPAY','APPLE']),select('environment','环境',[['SANDBOX','测试环境'],['PRODUCTION','正式环境']]),text('app_id','原渠道应用编号',200),text('merchant_id','原渠道商户编号',200)]),long('note','本次核对说明',2000)],'none',false,['reports']),
 op('statement','导入一类外部账单',base+'/:report_id/statements',[select('kind','账单类别',[['RECEIPT','收款'],['REFUND','退款'],['SPLIT','已执行分账'],['FEE','手续费'],['BANK','银行入账']]),mode(),rows('items','逐行外部账单',[id('record_id','对应实际付款、退款、分账凭证或人工凭证编号'),text('external_reference','账单原流水号',200),direction(),money('amount_minor','本行金额')],200,0),text('external_reference','本份原账单编号',200),id('evidence_asset_id','本份私有账单文件'),{...long('no_activity_reason','空账单无业务说明',2000),nullable:true}],'none',true,['reports']),
 op('manual','登记手续费或银行独立凭证',base+'/:report_id/manual-evidence',[mode(),rows('items','人工核对凭证',[id('id','本份人工凭证唯一编号'),select('kind','凭证类别',[['FEE','手续费'],['BANK','银行入账']]),{key:'source_ids',label:'实际付款、退款或分账来源编号（每行一项）',type:'ids',min:1,max:100},text('external_reference','实际凭证流水号',200),direction(),money('amount_minor','凭证金额'),id('evidence_asset_id','与账单内容不同的私有核验文件'),reason()],200,0)],'none',true,['reports']),
 op('compare','重新计算逐笔差异',base+'/:report_id/comparison',[],'none',true,['reports']),
 op('review','独立审核本版对账',base+'/:report_id/review',[select('decision','独立结论',[['APPROVE','核验通过'],['REJECT','退回核对']]),reason(),group('verification','逐项实际核验',[bool('scope_verified','已核对日期、商家、渠道和环境',true),bool('statements_complete','五类账单及空账单说明完整',true),bool('manual_evidence_verified','人工凭证已独立核实',true),bool('sources_verified','实际来源与当前事实一致',true)])],'none',true,['reports']),
 op('reopen','说明原因并重新核对',base+'/:report_id/reopen',[reason()],'none',true,['reports'])]}
export function lotteryReason(record:BusinessData|null,now=Date.now()):string|null {
 if(!record)return '请先读取本版奖池。'
 const d=rowData(record),n=d.publication_notice as BusinessData|undefined
 if(n&&(!Number.isFinite(Date.parse(String(n.opens_at)))||n.days!==7||Date.parse(String(n.opens_at))>now))return '奖池规则正在公示，尚未开放抽奖。'
 if(d.starts_at&&Date.parse(String(d.starts_at))>now)return '活动尚未开始。'
 if(d.ends_at&&Date.parse(String(d.ends_at))<=now)return '活动已结束。'
 return record.current_status==='PUBLISHED'?null:'奖池尚未开放或已停止。'
}
export function validateFourForm(domain:string,key:string,body:BusinessData,record:BusinessData|null){
 const fail=(message:string)=>{throw new ApiError({status:400,code:'CLIENT_FORM_INVALID',message})}
 if(domain==='privacy'&&key==='preferences'){const q=body.quiet_hours as BusinessData|undefined;if(q&&q.start_minute===q.end_minute)fail('夜间起止时刻不能相同。');const n=body.rest_reminder_minutes;if(n!==0&&!(typeof n==='number'&&n>=15&&n<=240))fail('休息提醒只能关闭，或选择15—240分钟。')}
 if(domain==='daily-finance'&&key==='statement'){if(body.no_activity_reason===null)body.no_activity_reason='';if(!(body.items as unknown[]).length&&!String(body.no_activity_reason||'').trim())fail('空账单须说明已经核对本日无该类业务。')}
 if(domain==='daily-finance'&&key==='create'){const d=String((body.scope as BusinessData).business_date);if(!/^20\d\d-\d\d-\d\d$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d)fail('请填写有效的北京时间业务日期。')}
 if(domain==='consumer'&&key!=='change'){const k=String(body.kind),p=(record?.pending as BusinessData|undefined)?.[k] as BusinessData|undefined;if(!p)fail('没有该类别的待生效申请，请刷新。');if(key==='confirm'&&Date.parse(String(p?.confirm_after))>Date.parse(String(record?.as_of)))fail('提高额度还需要等待；刷新后核对服务器可确认时间。')}
}
export const fourLabels:Record<string,string>={source_fingerprint:'本轮平台事实校验值',sources_current:'平台事实仍为当前版本',evidence_current:'私有凭证仍可核验',evidence_reason:'凭证待核原因',effective_status:'当前有效结论',business_date:'北京时间业务日期',books:'五类外部账单',manual_items:'手续费与银行独立凭证',comparison:'本次逐笔比对',editors:'本报告参与录入人员',expected_count:'平台事实行数',statement_count:'账单行数',expected_net_minor:'平台净额',statement_net_minor:'账单净额',differences:'逐笔差异',source_ids:'实际付款或凭证来源',source_key:'平台原记账定位',no_activity_reason:'无业务说明',limits:'本人当前月度上限',usage:'本月现金额度占用',pending_minor:'其中待确认金额',used_minor:'本月已占用金额',remaining_minor:'剩余额度',over_limit:'占用是否超过当前上限',monthly_limit_minor:'申请的月度上限',confirm_after:'本人最早可确认时间',cooling_hours:'本次冷静期小时',publication_notice:'奖池规则公示',published_at:'本版实际公示时间',opens_at:'公示结束后最早开放',days:'公示天数'}
export const fourStates:Record<string,string>={REVIEWED:'本版已独立审核',DIFFERENCES:'仍有账目差异',RECHECK_REQUIRED:'当前事实变化，须重新核对',PAYMENT:'本人现金消费',RECHARGE:'本人充值'}
export function validateFourRead(domain:string,section:string,r:BusinessData,party:string){
 if(domain!=='consumer'||section!=='settings')return
 const int=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=900000000000
 const object=(v:unknown):v is BusinessData=>!!v&&typeof v==='object'&&!Array.isArray(v)
 let valid=Number.isSafeInteger(r.object_version)&&Number(r.object_version)>0&&r.party_id===party&&r.scope==='PERSONAL_CASH_ONLY'&&r.accounting_basis==='GROSS_MONTH_REQUESTS_RECEIPTS_AND_OPEN_ATTEMPTS'&&Number.isFinite(Date.parse(String(r.as_of)))&&object(r.limits)&&object(r.usage)&&object(r.pending)&&object(r.period)&&r.period.timezone==='Asia/Shanghai'
 if(valid)for(const k of ['PAYMENT','RECHARGE']){const l=(r.limits as BusinessData)[k],u=(r.usage as BusinessData)[k],p=(r.pending as BusinessData)[k];valid&&=(l===null||int(l))&&object(u)&&int(u.used_minor)&&int(u.pending_minor)&&Number(u.pending_minor)<=Number(u.used_minor)&&(u.remaining_minor===null||int(u.remaining_minor))&&typeof u.over_limit==='boolean'&&(p===null||object(p)&&(p.monthly_limit_minor===null||int(p.monthly_limit_minor))&&Number.isFinite(Date.parse(String(p.confirm_after))))}
 if(!valid)throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'本人限额返回无法核对，未显示可用额度。'})
}
