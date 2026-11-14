import {type Domain,text,long,id,hash,integer,money,date,select,bool,group,rows,fixed,reason,review,operation as op,ids,checks} from './model'
export const castFields=()=>[id('person_id','具体真人'),id('avatar_id','具体数字人'),id('supply_consent_id','原素材同意'),ids('artist_consent_ids','已审本次用途授权'),id('look_version_id','已审造型版本'),id('voice_version_id','已审声音版本',true),select('usage','本次使用方式',[['EXISTING_MATERIAL','使用现有已授权材料'],['NEW_GENERATION','按已授权范围生成新内容']])]
const memberFields=()=>[rows('cast','本人出演形象与授权',castFields(),4),long('private_story','本人私有故事'),ids('material_asset_ids','本次本人材料'),bool('sharing_allowed','本人同意约定范围内公开分享'),hash('participation_sha256','已阅读本房间参加约定校验值'),bool('agreed','本人明确同意当前参加约定',true)]
export const cocreation:Domain={key:'cocreation',title:'共同成片',journal:'COLLECTIVE FILM / 10',intro:'先创建原故事的共创房间，再逐位邀请、本人确认与核定有效人数。',note:'同一真人只计一人。10名有效参与者可成团；满20名按已审规则取得一份不可提现服务额度。发起人承担同一主订单；退出或授权撤回会暂停使用与下载。截止后由发起人或运营明确核定，当前没有自动关房任务。',sections:[
{key:'rooms',label:'本人共创房间',path:'/cocreation/rooms',detail:'/cocreation/rooms/:record_id',party:'required'},
{key:'invitations',label:'本人邀请',path:'/cocreation/invitations',party:'required'},
{key:'members',label:'本人参加与材料',path:'/cocreation/members',detail:'/cocreation/members/:record_id',party:'required',files:[{label:'读取本人参加材料',path:'/cocreation/members/:record_id/assets/:asset_id',party:'required'}]},
{key:'cases',label:'原房间问题与退款',path:'/cocreation/rooms/:record_id/cases',party:'required'},
{key:'materials',label:'获派制作材料',path:'/cocreation/rooms/:record_id/materials',party:'required'},
{key:'snippets',label:'本人独立片段',path:'/cocreation/snippets',party:'required',files:[{label:'明确取得本人已审片段',path:'/cocreation/snippets/:record_id/file',party:'required'}]},
{key:'benefits',label:'本人的服务额度',path:'/cocreation/benefits',party:'required'},
{key:'rules',label:'共创参加规则',path:'/cocreation/rules',party:'none'},
{key:'reviews',label:'独立共创核验',path:'/cocreation/queue',party:'none',query:[select('kind','核验类别',['RULE','ROOM','CASE','SNIPPET'])],files:[{label:'查看待审实际片段',path:'/cocreation/snippets/:record_id/review-file',party:'none'}]}],operations:[
op('room','为原故事建立共创房间','/cocreation/rooms',[id('request_id','本人已提交的原故事'),id('producer_party_id','本故事的平台承制方'),id('rule_id','本故事的生效参加规则'),text('title','本次共同作品名称',200),date('deadline','报名截止时间'),text('purpose','具体制作与分享用途',100),text('territory','使用地区',100)],'required',false,['rooms']),
op('invite','邀请明确真人本人参加','/cocreation/rooms/:record_id/invitations',[id('person_id','明确被邀请真人')],'required',true,['rooms']),
op('join','本人填写授权并确认参加','/cocreation/rooms/:record_id/members',[id('person_id','本人真人档案'),...memberFields()],'required',false,['rooms','invitations']),
op('member','本人更新本次参加材料','/cocreation/members/:record_id',memberFields(),'required',true,['members']),
op('withdraw','本人撤回本次参加','/cocreation/members/:record_id/withdraw',[reason()],'required',true,['members']),
op('close','截止后核定实际有效人数','/cocreation/rooms/:record_id/close',[],'required',true,['rooms']),
op('case','申请延期、恢复或取消','/cocreation/rooms/:record_id/cases',[select('kind','本次申请',[['EXTEND','人数不足申请延期'],['RESUME','退出或授权处理后申请恢复'],['CANCEL','申请取消与退款']]),reason(),{...date('new_deadline','申请新截止时间（仅延期）'),nullable:true}],'required',true,['rooms']),
op('sync','核对原主订单与实际退款','/cocreation/rooms/:record_id/sync',[],'required',true,['rooms']),
op('snippet','制作方提交本人成片片段','/cocreation/rooms/:record_id/snippets',[id('member_id','片段明确对应的参与人'),id('file_id','实际已上传片段'),id('final_version_id','对应已审正式成片版本'),long('note','片段范围说明',2000)],'required',false,['rooms','materials']),
op('rule','登记共创参加规则','/cocreation/rules',[group('rule','共创规则',[text('version','规则版本',100),text('source_ref','规则实际来源',200),integer('max_people','技术人数容量',21,100),integer('extension_days','最多延期天数',1,90),long('participation_terms','每位本人参加约定'),group('benefit','满额服务额度',[text('service_code','明确服务类型',100),long('description','实际可用服务说明',2000),money('credit_minor','服务额度',1),integer('valid_days','服务额度有效天数',1,730)])])],'none',false,['reviews']),
op('rule-review','独立审核共创规则','/cocreation/rules/:record_id/review',review(),'none',true,['reviews']),
op('case-review','独立处理本次延期恢复或取消','/cocreation/cases/:record_id/review',review(),'none',true,['reviews']),
op('snippet-review','独立审核本人片段','/cocreation/snippets/:record_id/review',[...review(),{...checks([['only_target_person','仅包含明确对应的本人人物'],['authorization_marked','已核对本人授权标记'],['ai_label_verified','已核对适用AI标识'],['content_reviewed','已实际查看全部片段内容']]),visible:r=>r.decision==='APPROVE',inactive:null}],'none',true,['reviews']),
op('operator-close','运营明确核定截止人数','/cocreation/rooms/:record_id/close',[],'none',true,['reviews'])]}
