import {type Domain,type Field,text,long,id,hash,integer,money,date,select,bool,group,rows,fixed,reason,review,operation as op,ids,optional} from './model'
import {castFields} from './cocreation'
const kinds=[['PRODUCTION_CREDIT','制作抵扣券'],['PRODUCTION_FREE','指定制作全额权益'],['SERVICE_CREDIT','原共创服务额度'],['INTERVIEW','面试权益'],['EXPOSURE','曝光权益']] as const
const kind=(r:Record<string,unknown>)=>String((r.template as Record<string,unknown>)?.kind)
const template=group('template','实际可兑现的权益',[text('version','约定版本',100),text('source_ref','实际来源',500),text('title','权益名称',160),select('kind','权益类别',kinds),integer('valid_days','有效天数（抵扣/全额30，面试90）',1,730),{...integer('exchange_points','固定兑换所需晶钻',1),nullable:true},integer('capacity','实际可兑现库存',1,1000000),date('available_until','可领取截止'),long('terms','兑现范围与约定'),{...group('production','指定制作权益',[money('face_minor','明确权益面额',1),money('minimum_minor','适用订单门槛',1),ids('spec_ids','实际适用的已审制作规格',100)]),visible:r=>['PRODUCTION_CREDIT','PRODUCTION_FREE','SERVICE_CREDIT'].includes(kind(r)),inactive:null},{...group('interview','实际面试通道',[select('channel','面试通道',[['OPEN','公开面试'],['PRIORITY','优先面试']]),text('project_ref','真实项目来源',200),text('batch_ref','真实批次',200),integer('min_halo','光环条件（公开1、优先2）',1,2),text('purpose','授权用途',200),text('territory','适用地区',200),integer('extension_days','允许延期天数',1,90),integer('fallback_points','预审不能兑现补偿晶钻',1)]),visible:r=>kind(r)==='INTERVIEW',inactive:null},{...group('exposure','实际曝光权益',[text('placement','实际展示位置',100),fixed('duration_days','展示天数',7),integer('fallback_points','预审不能兑现补偿晶钻',1)]),visible:r=>kind(r)==='EXPOSURE',inactive:null},{...text('service_code','原共创明确服务类型',100),visible:r=>kind(r)==='SERVICE_CREDIT'}])
const drawFields=()=>[id('pool_id','已阅读且开放的奖池'),hash('rules_sha256','本版奖池概率及兑现约定校验值')]
export const redemption:Domain={key:'redemption',title:'权益与礼遇',journal:'BENEFITS & DRAW / 11',intro:'用实际可用晶钻兑换，按冻结约定选券与抽取，取得的权益再按真实排期兑现。',note:'抵扣券、全额权益、面试和曝光各有用途与有效期，不可提现。抽取结果、扣点及库存均由服务器确定；断线恢复原请求不会重新开奖。钱包旧摘要的入口标志不代表本模块资格，办理以本模块实际结果为准。',sections:[
{key:'catalog',label:'可兑换权益',path:'/redemption/catalog',party:'none'},
{key:'grants',label:'本人的券与权益',path:'/redemption/grants',detail:'/redemption/grants/:record_id',party:'required'},
{key:'pools',label:'已审奖池与概率',path:'/redemption/pools',detail:'/redemption/pools/:record_id',party:'none'},
{key:'draws',label:'本人的原开奖结果',path:'/redemption/draws',detail:'/redemption/draws/:record_id',party:'required'},
{key:'exposures',label:'实际有效曝光',path:'/redemption/exposures',party:'none',query:[text('city','城市',100)]},
{key:'stock',label:'登记实际权益库存',path:'/redemption/catalog',party:'none'},
{key:'reviews',label:'独立权益与奖池核验',path:'/redemption/queue',party:'none',query:[select('kind','核验类别',['STOCK','POOL','GRANT','SCHEDULE','REMEDY','COUPON_HOLD'])],files:[{label:'读取本项实际履约依据',path:'/redemption/records/:record_id/evidence/:asset_id',party:'none'}]}],operations:[
op('exchange','按已读约定兑换本权益','/redemption/exchanges',[id('stock_id','实际已审权益库存'),hash('template_sha256','已阅读权益约定校验值')],'required',false,['catalog']),
op('credit','从原共创领取指定服务额度','/redemption/service-credits',[id('benefit_id','本人的原共创额度'),id('stock_id','对应服务的已审库存')],'required',false,['grants']),
op('hold','为原报价选择本券并锁定','/redemption/grants/:record_id/checkout',[id('quote_id','本人准确的已审制作报价')],'required',true,['grants']),
op('release','取消本次未确认报价的锁定','/redemption/holds/:record_id/release',[],'required',true,['grants']),
op('bind','本人绑定实际人物与用途','/redemption/grants/:record_id/bind',[id('person_id','本人真人档案'),id('avatar_id','本人数字人'),group('cast','面试所需逐项出演授权',castFields(),true),id('profile_id','曝光所需本人已公开榜单档案',true)],'required',true,['grants']),
op('confirmation','本人明确接受或拒绝本次排期','/redemption/grants/:record_id/confirmation',[bool('accepted','接受当前已独审的真实排期（不勾选表示拒绝）')],'required',true,['grants']),
op('remedy','就不能兑现提出原权益补救','/redemption/grants/:record_id/remedies',[reason()],'required',true,['grants']),
op('draw-one','明确单抽一次','/redemption/draws',[...drawFields(),fixed('count','本次抽取次数',1)],'required',false,['pools']),
op('draw-ten','明确十连抽取','/redemption/draws',[...drawFields(),fixed('count','本次抽取次数',10)],'required',false,['pools']),
op('stock','登记实际可兑现库存','/redemption/stock',[template,ids('evidence_asset_ids','实际权益与履约依据')],'required',false,['stock']),
op('pool','登记奖池待业务财务分别核验','/redemption/pools',[group('config','本版开奖规则',[text('version','版本',100),fixed('single_points','单抽晶钻',300),fixed('ten_points','十连晶钻',2700),fixed('algorithm','第十次保底规则','NINE_THEN_CONDITIONAL_TENTH_V1'),rows('prizes','实际奖项',[text('key','本奖项识别名称',100),select('kind','实际奖项类别',['INTERVIEW_OPEN','INTERVIEW_PRIORITY','PRODUCTION_CREDIT','PRODUCTION_FREE','EXPOSURE','POINT_BACK','NONE']),integer('weight','概率权重（各项合计10000）',1,10000),money('estimated_cost_minor','本项实际预计成本')],50)]),rows('bindings','逐奖项实际兑现来源',[text('key','与奖项一致的识别名称',100),id('stock_id','实际库存（无奖或返晶钻留空）',true),integer('point_back','本项返还晶钻（非返还项填0）')],50),date('starts_at','实际开放开始'),date('ends_at','实际开放结束'),long('terms','真实概率、费用、库存与兑奖约定'),money('cost_limit_single_minor','财务核定单抽成本上限',1),money('cost_limit_ten_minor','财务核定十连成本上限',1),ids('evidence_asset_ids','真实活动与成本依据')],'required',false,['stock']),
op('stock-review','独立核验可兑现库存','/redemption/stock/:record_id/review',review(),'none',true,['reviews']),
op('pool-review','分别核验奖池业务和财务','/redemption/pools/:record_id/review',[select('channel','独立核验通道',[['RULES','活动规则与兑现'],['FINANCE','实际成本与资金']]),...review(),id('evidence_asset_id','实际核验依据')],'none',true,['reviews']),
op('retire','独立停止本奖池新增抽取','/redemption/pools/:record_id/retirement',[reason()],'none',true,['reviews']),
op('delivery','提出真实面试或曝光排期','/redemption/grants/:record_id/deliveries',[date('starts_at','实际开始'),date('ends_at','实际结束'),text('reference','真实排期与联络来源',1000),id('evidence_asset_id','实际排期依据')],'none',true,['reviews']),
op('delivery-review','另一岗位独立核验排期','/redemption/deliveries/:record_id/review',review(),'none',true,['reviews']),
op('finish','记录本权益实际兑现结果','/redemption/grants/:record_id/finish',[select('outcome','实际结果',[['INTERVIEWED','已实际面试'],['NOT_SELECTED','已实际面试但未入选'],['EXPOSURE_COMPLETED','曝光已按期实际完成']]),id('evidence_asset_id','实际结果依据'),reason()],'none',true,['reviews']),
op('remedy-review','独立决定原权益补救','/redemption/remedies/:record_id/review',[select('decision','按预审规则补救',[['EXTEND_ONCE','仅一次延期'],['RETURN_POINTS','按原约定返还晶钻'],['REJECT','不予本项补救']]),reason(),id('evidence_asset_id','本次补救依据')],'none',true,['reviews'])]}
