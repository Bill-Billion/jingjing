import {type Domain,type Field,text,long,id,hash,money,date,select,bool,group,rows,ids,fixed,reason,review,checks,operation as op} from './model'
const mode=()=>select('mode','试镜方式',[['OFFLINE','线下到场'],['ONLINE_MATERIALS','线上材料']])
const appointment=()=>group('appointment','本次试镜安排',[mode(),text('city','城市',300),text('venue','实际场地',300),text('address','详细地址',300),date('starts_at','开始时间'),date('ends_at','结束时间'),long('purpose','安全用途与工作内容',2000)])
const approved=(keys:[string,string][])=>({...checks(keys,'checks'),visible:(r:Record<string,unknown>)=>r.decision==='APPROVE',inactive:null})
const safety:[string,string][]=[['purpose_verified','已核对工作用途'],['venue_verified','已核对安全场地'],['adult_parties_verified','已核对成年当事人']]
const message:Field[]=[select('kind','消息类别',[['TEXT','订单文字'],['DELIVERY_MEDIA','本单交付材料'],['ORDER_CARD','原订单卡片']]),{...long('body','本单消息',4000),visible:r=>r.kind==='TEXT',inactive:null},{...id('asset_id','本单交付的文件'),visible:r=>r.kind==='DELIVERY_MEDIA',inactive:null}]
export const auditions:Domain={key:'auditions',title:'试镜与取样',journal:'AUDITION NOTEBOOK / 07',intro:'明确方案和时段，经独立安全核验后付款；接拒、到场和取样各有记录。',note:'试镜取样不授予后续商业出演权。联系卡和订单会话仅在已核实付款且已接受后按服务器状态开放；争议与改期期间冻结。',sections:[
{key:'catalog',label:'可约方案',path:'/auditions/catalog',party:'none',query:[{...text('city','城市',100),optional:true}]},
{key:'offers',label:'我的试镜方案',path:'/auditions/records',detail:'/auditions/records/:record_id',party:'required',fixedQuery:{kind:'OFFER'}},
{key:'bookings',label:'本人的预约',path:'/auditions/records',detail:'/auditions/records/:record_id',party:'required',fixedQuery:{kind:'BOOKING'},files:[{label:'读取原预约取样文件',path:'/auditions/bookings/:record_id/materials/:asset_id',party:'required'}]},
{key:'invitations',label:'受邀可约方案',path:'/auditions/invitation-offers',party:'required',query:[id('invitation_id','已送达且有效的邀约')]},
{key:'messages',label:'预约订单会话',path:'/auditions/bookings/:record_id/messages',party:'required'},
{key:'contacts',label:'双方联系卡',path:'/auditions/bookings/:record_id/contacts',party:'required'},
{key:'itinerary',label:'本单行程',path:'/auditions/bookings/:record_id/itinerary',party:'required'},
{key:'supplements',label:'已付款追加范围',path:'/auditions/bookings/:record_id/supplements',party:'required'},
{key:'reviews',label:'独立试镜核验',path:'/auditions/records',detail:'/auditions/records/:record_id',party:'none',query:[select('kind','待核验类别',[['OFFER','试镜方案'],['BOOKING','预约及取样'],['SUPPLEMENT','追加范围']])],files:[{label:'核对实际取样材料',path:'/auditions/bookings/:record_id/materials/:asset_id',party:'none'}]}],operations:[
op('offer','填写试镜方案','/auditions/offers',[group('offer','具体人物与服务',[id('person_id','真人'),id('avatar_id','数字人'),id('public_consent_id','公开预约展示授权'),id('rule_id','已审试镜商品规则'),text('title','方案标题',300),text('city','城市',300),text('service_area','服务区域',300),mode(),bool('public_booking','公开接受预约'),bool('public_price','公开价格'),money('unit_minor','试镜费用',1),rows('slots','可约时段',[date('starts_at','时段开始'),date('ends_at','时段结束')],60),long('terms','试镜范围、样片数量与不包含权利')])],'required',false,['offers']),
op('visibility','调整方案公开范围','/auditions/offers/:record_id/visibility',[bool('public_booking','公开接受预约'),bool('public_price','公开价格')],'required',true,['offers']),
op('booking','提出具体试镜预约','/auditions/bookings',[id('offer_id','已阅读的试镜方案'),hash('offer_sha256','方案本版校验值'),id('invitation_id','对应有效邀约',true),appointment()],'required',false,['catalog','invitations','bookings']),
op('checkout','按已审预约确认原订单','/auditions/checkout',[id('booking_id','已过安全核验的预约'),hash('booking_sha256','本版预约校验值'),select('channel','支付渠道',[['ALIPAY','支付宝']])],'required',false,['bookings']),
op('decision','接受或拒绝已付款预约','/auditions/bookings/:record_id/decision',[select('decision','本人接拒',[['ACCEPT','接受本预约'],['DECLINE','拒绝并办理原款退款']]),reason()],'required',true,['bookings']),
op('travel','记录真实行程','/auditions/bookings/:record_id/travel',[select('action','行程节点',[['DEPART','实际出发'],['ARRIVE','实际到场']]),ids('evidence_asset_ids','实际行程依据')],'required',true,['bookings']),
op('delivery','提交本单实际取样','/auditions/bookings/:record_id/delivery',[group('delivery','本人授权的取样',[ids('photos','本约定全部照片',30),ids('videos','本约定全部视频',5),id('consent_id','本次取样材料授权')])],'required',true,['bookings']),
op('receipt','确认取得本单全部材料','/auditions/bookings/:record_id/receipt',[],'required',true,['bookings']),
op('confirm','明确确认本次取样履约','/auditions/bookings/:record_id/confirm',[],'required',true,['bookings']),
op('cancel','申请取消或安全争议','/auditions/bookings/:record_id/cancel',[reason(),bool('safety','涉及安全问题'),ids('evidence_asset_ids','问题依据')],'required',true,['bookings']),
op('reschedule','申请本单改期','/auditions/bookings/:record_id/reschedule',[appointment(),reason()],'required',true,['bookings']),
op('reschedule-response','对方明确回复改期','/auditions/bookings/:record_id/reschedule-response',[select('decision','本人决定',[['ACCEPT','接受'],['DECLINE','不同意']])],'required',true,['bookings']),
op('contact','明确开放或撤回本人联系卡','/auditions/bookings/:record_id/contact',[text('name','本单联系人',100),{...text('phone','本人同意提供的手机',11),nullable:true},bool('consent','同意本单按当前权限查看联系卡')],'required',true,['bookings']),
op('support','请求本单客服介入','/auditions/bookings/:record_id/support',[fixed('action','办理事项','REQUEST')],'required',true,['bookings']),
op('message','发送本单消息','/auditions/bookings/:record_id/messages',message,'required',false,['messages']),
op('read','明确读取消息','/auditions/bookings/:record_id/messages/read',[ids('message_ids','已实际阅读的本单消息',100)],'required',false,['messages']),
op('baseplate','本人将样片登记为造型底片','/auditions/bookings/:record_id/baseplate',[id('consent_id','本人底片登记授权'),id('previous_version_id','原造型版本',true),text('display_name','本版造型名称',200)],'required',true,['bookings']),
op('supplement','提出已付款预约的独立补差','/auditions/bookings/:record_id/supplements',[text('title','新增范围标题',160),long('terms','新增范围与原合同边界',4000),money('amount_minor','独立追加费用',1),date('expires_at','追加报价截止')],'required',true,['bookings']),
op('supplement-checkout','确认已审追加范围并独立下单','/auditions/supplements/checkout',[id('supplement_id','已审追加范围'),hash('supplement_sha256','已阅读追加范围校验值'),select('channel','原支付渠道',[['ALIPAY','支付宝']])],'required',false,['supplements']),
op('review-offer','独立核验试镜方案','/auditions/offers/:record_id/reviews',review(),'none',true,['reviews']),
op('review-booking','独立核验预约安全','/auditions/bookings/:record_id/reviews',[...review(),approved(safety)],'none',true,['reviews']),
op('review-delivery','独立核验实际取样','/auditions/bookings/:record_id/delivery-review',[...review(),approved([['content_reviewed','已实际查看全部内容'],['files_viewable','全部文件可查看'],['consent_verified','已核对本次取样授权']])],'none',true,['reviews']),
op('review-reschedule','独立核验双方已确认改期','/auditions/bookings/:record_id/reschedule-review',[...review(),approved(safety)],'none',true,['reviews']),
op('resolve','独立处理取消与争议','/auditions/bookings/:record_id/resolution',[select('decision','处理结果',[['RESUME','恢复原履约'],['REFUND','核定实际退款']]),money('refund_minor','核定退款金额（恢复时为0）'),reason(),ids('evidence_asset_ids','实际处理依据')],'none',true,['reviews']),
op('support-join','客服明确加入或退出本单','/auditions/bookings/:record_id/support',[select('action','客服操作',[['JOIN','加入已申请介入的本单'],['LEAVE','退出本单']])],'none',true,['reviews']),
op('review-supplement','独立核验追加范围','/auditions/supplements/:record_id/reviews',review(),'none',true,['reviews']),
op('supplement-refund','独立核定追加单退款','/auditions/supplements/:record_id/refund-decision',[money('refund_minor','本追加单应退金额'),reason()],'none',true,['reviews'])]}
export const conversations:Domain={key:'conversations',title:'商单订单会话',journal:'ORDER CORRESPONDENCE / 07',intro:'围绕已接受且已核实付款的原商单，沟通交付与本单联系事项。',note:'冻结、归档和隐藏均按服务器实际状态执行；联系卡需要本人的明确同意。',sections:[{key:'messages',label:'原商单会话',path:'/gigs/orders/:order_id/conversation/messages',party:'required',files:[{label:'读取本单消息文件',path:'/gigs/orders/:order_id/conversation/messages/:message_id/file',party:'required'}]},{key:'contacts',label:'本单联系卡',path:'/gigs/orders/:order_id/conversation/contacts',party:'required'},{key:'support',label:'独立客服介入',path:'/gigs/orders/:order_id/conversation/messages',party:'none'}],operations:[
op('message','发送本商单消息','/gigs/orders/:order_id/conversation/messages',[select('kind','消息类别',[['TEXT','本单文字'],['MEDIA','本人本单材料'],['ORDER_CARD','原订单卡片']]),{...long('body','本单消息',4000),visible:r=>r.kind==='TEXT',inactive:null},{...id('asset_id','本单实际材料'),visible:r=>r.kind==='MEDIA',inactive:null}],'required',false,['messages']),
op('contact','开放或撤回本人的联系卡','/gigs/orders/:order_id/conversation/contact',[text('name','本单联系人',100),{...text('phone','本人手机',11),nullable:true},bool('consent','本人同意按本单权限查看')],'required',true,['contacts']),
op('control','管理本单会话状态','/gigs/orders/:order_id/conversation/control',[select('action','办理事项',[['REQUEST_SUPPORT','请求客服介入']]),reason()],'required',true,['messages']),
op('read','明确已读本单消息','/gigs/orders/:order_id/conversation/read',[id('message_id','已实际阅读的消息')],'required',false,['messages']),
op('moderation','客服独立处理具体消息','/gigs/orders/:order_id/conversation/moderation',[id('message_id','需处理的本单消息'),reason()],'none',false,['support']),
op('support-control','客服处理本单会话','/gigs/orders/:order_id/conversation/control',[select('action','处理事项',[['JOIN','加入本单'],['LEAVE','退出本单'],['FREEZE','冻结本单'],['RESUME','恢复本单'],['ARCHIVE','归档本单']]),reason()],'none',true,['support'])]}
