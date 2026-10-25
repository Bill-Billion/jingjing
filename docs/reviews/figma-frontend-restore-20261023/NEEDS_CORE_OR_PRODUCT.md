# 需求、后端与真实服务交接事项

2026-10-24续作，Experience / Bill-Billion。依据 [REPORT.md](REPORT.md) 的 R01 至 R24，核对 `1fd1743` 及本轮工作区中的 App、Web 和实际挂载的后端路由。以下列出待协作的最小增量，不代表 Core、产品或服务方已经认领。一个 R 编号出现在多个分组，表示同一问题包含不同条件。

已有接口可以继续完成的前端工作不应等待新接口。支付宝和 Apple 适配、规则榜单、认证补件沿费、隐私偏好均已存在；本表不把它们重新列成待开发服务。旧版未挂载页面和历史兼容路由不作为当前能力依据。原报告中有关这些能力的宽泛表述，以本次具体核对为准。

本轮新增的公共加载/过期/失权状态、中文日期控件、字体与目录差异均属于前端实施，不能作为新增后端任务；当前逐页检查结果见主图册与CHECKS.json。

## 本侧实施与验收状态

| 编号 | 本侧实施 | 当前边界 |
| --- | --- | --- |
| R03 | 出品人详情读取本城公开通告，按 `owner_party_id` 精确筛选，支持继续读取；名单撤回或重新核对失败后清除主体和通告。 | 仅表示当前城市已读取目录，不表示完整主体作品库或全站通告聚合。[实现](../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/discovery/discovery_pages.dart) |
| R05 | 显示现有公开名单规则分值、真实星探资格，增加已发布艺人榜单入口。 | 未配置排名规则时明确说明；不推断距离、实名状态或全目录评分。[实现](../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/discovery/discovery_pages.dart) |
| R19 | 帮助页增加个人信息投诉与保护申请分流，保留原业务协助入口。 | 一般反馈、陌生主体售前会话及其附件仍未开放。[实现](../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/support/support_pages.dart) |
| R20 | 账号页增加本人偏好与展示名更正申请入口；更正预选 `CORRECT / PROFILE`，投诉预选 `COMPLAINT`。 | 仅在本人明确提交后创建原契约申请，不自动改名；未开放缺少完整方案内容的执行确认。[账号入口](../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/account/account_page.dart)、[本人申请](../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/privacy/privacy_pages.dart) |
| R22 | Web 增加导航查找、窄屏菜单内部滚动、状态换行、已获准引用的简短编号区分，继续保留全部原入口。 | 菜单不授予业务权限，不把个人 MCN 合作与机构工作区合并。[导航](../../../晶晶日上工程交接包/01_源码/frontend_ops_workspace/src/components/WorkspaceNav.vue)、[引用选择](../../../晶晶日上工程交接包/01_源码/frontend_ops_workspace/src/business/references.ts) |
| R10、R15 | 补独立原订单收银台及平台制作服务介绍，主页入口接服务页，原填写需求和付款恢复流程不变。 | 固定渠道、未接通托管与真实SDK边界仍明确；装饰海报标视觉示意，公开价表/规格与专员接单不自行承诺。 |
| R23 | 本侧修正日期与本地时区选择、长标签及状态换行，区分读取重试和写入结果恢复文案。 | 继续保留原请求恢复、版本和权限校验，不把 403/404 猜成内容下架。[App 日期与错误](../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/stock/v5_support.dart)、[Web 错误](../../../晶晶日上工程交接包/01_源码/frontend_ops_workspace/src/api/errors.ts) |
| R06、R08 | 制作当前版本确认数、阶段待办及非强制材料分类提示已补。 | 阶段比例和材料强制分类不自行增加业务含义；补件沿原申请和原服务。 |
| R11、R12、R16 | 原合同来源、消费与经营账本互链、制作及试镜已购来源入口已补。 | 分域目录不宣称跨域数据完整、时点一致或统一汇总。 |
| R24 | 实际Noto Serif SC完整字库700/900、标题字重、本地中文回退与Vue WOFF2已补，构建与浏览器复拍通过。 | Flutter字体TTF约47.5MB，Vue WOFF2约18.9MB；真机首访、弱网和内存仍单独验收。 |

本轮正式范围、定向交互和逐图检查的最终结果见[CHECKS.json](../../testing/evidence/figma-frontend-restore-20261023/CHECKS.json)及[主图册](../../testing/evidence/figma-frontend-restore-20261023/index.html)。上表均为本侧实施，不替代另一位同事实际交叉审阅，也不代表真实支付、生成或服务上线验收完成。

## 需要后端支持

以下仅列现有契约不能表达的部分。标有“若产品要求”的内容，应在产品确认后再增加接口。

| 编号 | 现有能力与具体来源 | 最小增量 |
| --- | --- | --- |
| R01 | `GET /artists/catalog` 已返回公开展示名、介绍、标签、认证等级和预览引用，预览下载逐次校验公开授权；没有独立 `GET /artists/catalog/:id`。见[艺人路由][b-artist-routes]、[目录与公开文件核权][b-artists]。 | 给可重载、可分享的单条公开详情及失效语义；媒体引用区分封面、肖像、声音和作品预览，并绑定用途、有效期与撤回。私有本人档案不可作为公开详情补充。 |
| R02 | 艺人目录支持 `city / tag / audition`，现货目录支持 `city / person_id`，通告支持 `type / city / at`。见[艺人路由][b-artist-routes]、[现货路由][b-stock-routes]、[通告路由][b-notice-routes]。 | 全文和描述匹配需要独立的查询、分页及排序契约；若返回匹配率，需说明评分来源和含义。已有筛选无需重做。 |
| R03 | `GET /engagement/buyers?city=…` 返回公开编号、类型、核实业务事实及资格；通告公开目录和详情返回 `owner_party_id`，可在已读取范围内精确筛选。见[同城出品事实][b-buyers]、[通告公开返回][b-notices]。 | 补本人同意公开的出品档案；完整按主体查询需服务端筛选与分页。若允许从公开档案投递，需提供该接收方、本次用途和合法授权引用的安全上下文。 |
| R04 | 业务通知支持 `unread_only` 和逐条已读；商业订单会话有自己的消息及已读操作。见[通知路由][b-operations-routes]、[通知读取][b-operations]、[商业会话][b-gig-routes]。 | 跨身份、跨频道的统一摘要和未读总数；全部已读需明确覆盖到哪个事件或时点、并发到达消息如何处理。客户端逐条循环不能承诺原子批量成功。 |
| R05 | 已发布艺人榜单有有效订单数、评价数量、贝叶斯评分和榜单分值，并重新检查公开资格；出品名单已有完成订单、星探资格和规则分值。见[榜单计算及读取][b-rankings]、[榜单规则][b-engagement-policy]、[同城出品事实][b-buyers]。 | 补距离排序所需位置与公开范围、目录可比较统计口径、可公开的实名事实、定角时间线。现有规则统计无需再开发；`valid_until` 不可代替定角日期。 |
| R06 | 已有四个制作阶段及当前版本、已确认版本；App 用 `line_id` 匹配原订单标题。见[制作阶段][b-production-policy]、[标题与阶段展示][a-production-widgets]。 | 若需要独立可编辑故事名，再补标题快照、改名权限和历史规则。只显示已确认阶段数无需新接口；百分比权重先由产品定义。 |
| R07 | 建档、数字人、造型、声音、同意和服务请求均有独立接口；长期模型供应商默认未实现。见[艺人路由][b-artist-routes]、[制作供应商][b-provider]。 | 若要合成一次创建，补可恢复的草稿和分步状态、授权绑定、收费去重、结果核对。生成失败与重试需真实任务契约，不能自造 `FAILED` 状态。 |
| R08 | `HALO` 申请、`NEEDS_MATERIAL` 补件及沿用原 `service_id` 已实现；补件恢复原申请，不购买第二次审核。见[艺人申请与补件][b-artists]、[服务约束][b-artist-service]。 | 若四类材料要成为服务端必填条件，再补证据分类字段及缺项原因。当前可先做分类提示和分组上传，继续提交既有证据数组。 |
| R09 | 现货商品只有创建、审核和状态操作；状态为下架、权利暂停、审核方重新审核，没有卖方修改文件后重提的接口。见[现货路由][b-stock-routes]、[现货状态处理][b-stock]。剧本许可另有 `previous_product_id`，属于另一对象，见[许可路由][b-license-routes]。 | 按产品确定的版本方式补视频商品修订、退回重提及前后版关系；保留原购买者许可和已购文件依据。不能覆盖旧版文件或借用剧本许可版本关系。 |
| R10 | 支付宝和 Apple 的创建、查单、验签及回调适配已存在；托管渠道明确未接通。当前支付凭据状态不含 `FAILED`。见[支付适配][b-pay-providers]、[支付路由][b-trade-routes]、[支付凭据校验][b-trade-policy]。 | 若设计需要独立失败原因，补可信关闭原因或状态映射，不把 `CLOSED` 推断成扣款失败。正式配置、原生渠道和回调验收另列真实服务事项。 |
| R11 | 订单、许可和项目已有各自记录列表，保存的合同快照可按编号核权读取。见[交易记录][b-trade-routes]、[许可记录][b-license-routes]、[项目记录][b-project-routes]、[合同读取][b-account-routes]。 | 如需统一合同库，补跨域摘要、来源定位、权限、状态和分页；签署完成需独立可信证据，版本确认不等于签署。 |
| R12 | 已有结算约定分页、单约定余额、分录、付款申请及实付证据；钱包也有余额和不同种类流水。见[结算路由][b-finance-routes]、[钱包路由][b-wallet-routes]、[钱包汇总][b-wallet]。 | 跨约定汇总需可比较时点、去重、币种与正式/测试环境口径。收款资料需独立核验结果；`destination_asset_id` 只引用附件，不能表示银行卡已验证。消费与经营的分域入口无需等待聚合接口。 |
| R13 | 钱包返回当前可用晶钻、待冲回和合格消费成长，另有 `EARNING` 分页明细；未返回终身累计晶钻。见[钱包汇总与明细][b-wallet]。 | 产品确定累计范围后，提供稳定累计值或明确可核算明细。前端只能把当前读取批次相加标成该读取范围，不能宣称终身累计。 |
| R15 | 模板需求已有创建、草稿保存、提交、补充、历史和报价查询；附件答案明确拒绝非空内容。见[需求路由][b-custom-routes]、[模板与答案校验][b-custom-policy]。 | 通用创作草稿需新对象或明确模板类型；媒体保存、私有附件、分享、协作和撤回均需对应契约。现有文字/选项草稿无需重做。 |
| R16 | 现货已购、制作项目与版本、试镜记录可分域读取；文件每次下载重新核权。见[现货路由][b-stock-routes]、[制作路由][b-production-routes]、[试镜路由][b-audition-routes]。 | 统一已购/交付库和最近下载历史需跨域契约、单域失败与撤权规则。服务端内容访问记录应表明其观察含义，不能表示设备已保存。水印和 AI 标记的文件元数据另需明确来源与适用版本。 |
| R17 | 当前正式路由没有开票申请及历史票据契约；App 保留关闭入口，不收抬头、税号或邮箱。见[当前路由挂载][b-account-routes]、[票据入口][a-support]。 | 提供可开订单/金额、申请、撤回、拒绝、开具、历史票据及私有原件权限；出票方和税务资料要求先由产品确定。 |
| R18 | 榜单有 `FAVORITE` 互动，按账号/设备及日期去重并计入人气；没有个人收藏查询、取消、管理和足迹清理。见[互动计算][b-rankings]。 | 增加账号隔离的收藏与足迹服务，含撤权、内容失效、保留期及清理语义。不能把人气互动当成可管理收藏，也不以本地敏感资料持久化代替服务。 |
| R19 | 个人信息 `COMPLAINT` 申请、原业务评论、现货售后、制作售后及商业订单会话均已存在。见[隐私请求类型][b-privacy-policy]、[隐私路由][b-privacy-routes]、[业务评论][b-operations-routes]、[现货售后][b-stock-routes]、[商业会话][b-gig-routes]。 | 一般反馈和历史工单、附件权限、作品售前准入与内容举报分流需明确接口。个人信息投诉继续使用既有渠道，不扩成通用客服或陌生人私聊。 |
| R20 | 偏好 `GET/PATCH` 已有版本控制和恢复；本人展示名更正也有提案、审核、执行链。执行列表只返回动作、目标、状态和指纹，**没有待改展示名或方案 payload**。见[偏好路由][b-privacy-routes]、[偏好保存][b-privacy]、[执行 DTO][b-privacy-execution]。 | 补本人可核对的具体更正内容及其与提案指纹的绑定，再开放执行确认。手机号变更须另有原号码/新号码核验及会话策略；公开档案和偏好分别保存，不承诺跨服务原子成功。 |
| R22 | 自有身份、成员、订单和授权记录已有可选列表；个人 MCN 关系、机构工作区和成长榜单分属不同对象。见[商业关系][b-gig-routes]、[机构工作区与榜单路由][b-engagement-routes]。 | 只有确实缺少安全上下文的首次代投、公开邀约等场景才补可用引用查询。不能为消除 UUID 输入而开放私有主体搜索或绕过本人同意。 |

R14 当前固定扣用规则、R21 已有状态事实、R23 字段与文案、R24 字体资源均不作为后端新增功能的前置任务。

## 需要产品确认

| 编号 | 已知条件 | 需要确定的最小口径 |
| --- | --- | --- |
| R01、R03 | 已有公开艺人预览和仅含核实事实的出品名单。[公开目录][b-artists]、[出品名单][b-buyers] | 各类封面、肖像、作品允许公开的用途和撤回方式；出品档案公开哪些字段；哪些对象可接收哪类投稿。示例素材须与真实业务事实分开。 |
| R02 | 城市、标签、试镜公开、通告类型/有效时间等筛选已可用。[现有筛选][b-artist-routes]、[通告筛选][b-notice-routes] | 全文范围、描述匹配含义、匹配率展示与排序目标。没有评分来源前不展示 96% 一类结果。 |
| R04 | 逐条通知和原订单会话可用。[通知][b-operations-routes]、[会话][b-gig-routes] | 顶层频道包含哪些业务、活动是否独立频道、跨身份未读如何归属、全部已读覆盖到哪个时点。 |
| R05 | 各榜种和同城出品名单已有自己的统计及公开规则。[榜种规则][b-engagement-policy]、[出品事实][b-buyers] | 目录是否采用某一具体榜种，统计窗口及更新提示如何显示；距离、公开实名、星探和定角节点分别表达。不同榜种分值不能通用。 |
| R06 | 四阶段当前/已确认版本可读，订单标题已精确匹配。[阶段][b-production-policy]、[前端阶段][a-production-widgets] | 选角百分比的分母/权重；制作阶段是否只显示已确认阶段数；故事专名与服务名如何区分、改名是否影响历史。 |
| R07 | 档案、素材、同意和收费请求独立保存。[艺人接口][b-artist-routes] | 是否需要合并创建；中途退出的草稿范围、每一步失败的恢复点、授权与收费确认时机。儿童实际处理和新生成状态须另有明确服务条件。 |
| R08 | 补件沿原申请与原审核服务已经实现。[补件与沿费][b-artists] | 四类材料是上传提示还是强制分类，审核缺项如何指明；补件页显示原费用与本次无需重复付费的方式。 |
| R09 | 现货商品无法原地修改后重提。[现货状态][b-stock] | 编辑生成新版本还是替换未售草稿；哪些变更重审、旧购买者保留什么权益、正式文件与预览如何绑定。 |
| R10 | 支付有真实凭据状态和恢复流程，`CLOSED` 无法直接推出扣款失败。[支付状态][b-trade-policy] | 失败稿如何对应未发起、待核对、已关闭、人工复核等事实；哪些原因允许原请求核对或重新支付。不得把样式当到账证明。 |
| R11 | 分域合同和保存快照可读取。[合同读取][b-account-routes] | 统一列表范围、状态词、摘要可见字段、快照与原件关系；签署证据和版本确认分别显示。 |
| R12 | 消费账本、推荐/经营收益与单约定结算分开。[钱包][b-wallet]、[结算][b-finance-routes] | 我的收入覆盖哪些账户和约定，如何去重、区分应计/已付/已到账及环境；本人份额与整单金额的权限表达。 |
| R13 | 当前可用晶钻与消费成长字段含义不同。[钱包返回][b-wallet] | 累计晶钻是否包含注册奖励、消费发放、已用、过期、退款冲回，以及统计时点。 |
| R14 | **单次 300、十次 2700 已是服务端强制规则**，创建校验及实际扣用一致；无须再确认它们是否只是设计示例。[规则校验][b-lottery-policy]、[实际扣用][b-lottery] | 当前空活动继续显示未开放，已发布活动显示其原规则。只有另提可变价格需求时，才需确认版本、旧活动权益及价格变更方式，再改后端。 |
| R15 | 已补独立公开服务介绍；当前办理仍是模板绑定的私人需求草稿。[模板约束][b-custom-policy] | 63所示规格、价表、专员/客服接单与海报素材的正式来源；70是通用创作对象还是一类模板，是否支持视频/附件、谁可协作或分享、如何撤回，能否脱离原需求存在。 |
| R16 | 各业务已购和交付记录可分别读取。[现货][b-stock-routes]、[制作][b-production-routes] | 统一作品库覆盖哪些业务，按什么时间排序；单域失败或内容撤权怎么显示；播放、正式收讫、验收与设备保存分别使用什么状态词。 |
| R17 | 开票流程尚未定义。[票据关闭入口][a-support] | 出票方、可开金额与项目、个人/企业资料、撤回和拒绝条件、已开具原件的查看权限。 |
| R18 | 人气收藏互动和个人收藏不是同一对象。[互动约束][b-rankings] | 收藏/足迹对象范围、保留期限、撤权或失效内容显示、单项删除与批量清理规则。 |
| R19 | 个人信息投诉与各原业务售后有明确范围。[隐私类型][b-privacy-policy]、[会话边界][b-gig-routes] | 一般反馈由谁受理、工单如何关联业务、允许哪些附件；内容举报和售前咨询是否独立入口，陌生主体的准入条件是什么。 |
| R20 | 偏好可独立保存；展示名更正须本人核对方案；营销偏好不控制必要业务通知。[偏好契约][b-privacy]、[更正执行][b-privacy-execution] | 设置页分别保存哪些服务、部分失败如何继续、必要通知的控制范围；手机号修改与公开展示名的核验方式。 |
| R21 | 制作状态、当前版本、验收、付款、正式收讫和下载门槛已有独立事实；共创人数与首款另行核对。[制作交付][b-production-workflow]、[共创接口][b-cocreation-routes] | 补组合状态与对应待办稿，尤其是换版后旧确认失效、退款处理中、成团但未开工。无需把这些事实压成一个确认按钮或新增猜测状态。 |
| R22 | 个人 MCN 合作与机构经营工作区不同，已有入口和状态字典可继续改善。[关系][b-gig-routes]、[工作区][b-engagement-routes] | 补 PC/窄屏导航及个人 MCN 合作逐屏稿，确认未知状态的中文词；不要用机构工作区截图替代个人合作页面。 |
| R23 | 前端可处理日期、时区、长文、字段错误和读取/写入恢复。[App 控件][a-v5-support]、[Web 错误][w-errors] | 补长合同、长编号、放大文字和错误/空/等待/失效的组合布局。403/404 保持接口实际含义，不以页面稿猜测下架原因。 |
| R24 | 本地字库和标题字重已修正，PC 没有完整逐屏稿。[App 字体引用][a-pubspec]、[Web 字体与公共样式][w-editorial] | 确认罕见字覆盖、标题字重、缓存和首访成本的取舍；补 PC 业务页面与真实素材验收标准。 |

## 需要真实服务/素材验收

这里的“真实”指正式服务或获准的实际素材。隔离账号、色条视频、受控 401/503 和合成付款只证明对应流程或状态 UI，不能替代这些验收。

| 编号 | 已有能力与来源 | 仍需的验收条件 |
| --- | --- | --- |
| R01、R03 | 已有逐次核权的公开媒体和出品事实入口。[艺人媒体][b-artists]、[出品事实][b-buyers] | 提供获准用于各槽位的实际肖像、封面、声音和作品素材，核对撤回/过期后的清除与重新下载行为。设计装饰图不能冒充具体人物或项目事实。 |
| R05 | 榜单统计按已发布规则、订单事实和公开资格计算。[榜单][b-rankings] | 用有真实核实依据的数据确认窗口、退款/风险排除、评价数量和规则版本。合成统计只作接口及布局验收，不作为实际业绩。 |
| R07 | 长期模型供应商默认未实现，接口返回未启用。[供应商状态][b-provider] | 供应商接入、授权用途、结果核对、重试/退款和实际生成质量；儿童处理另行满足明确准入条件。前端本轮不启用生成。 |
| R08 | L2 服务、实际付款核对与补件链存在。[认证服务][b-artist-service]、[认证申请][b-artists] | 准备真实 L2 已付、需补件、再次提交和独立审核的资料，核对同一审核服务不重复收费。L1 通过截图不能替代 L2 补件验收。 |
| R10 | 支付宝/Apple 适配与回调已实现，托管明确未接。[支付适配][b-pay-providers] | 正式配置与服务就绪验证、原生设备渠道、签名/回调、超时核对、退款和实际资金结果。PAYMENT 失败稿继续按现有状态区分，不伪造失败枚举或到账。 |
| R11 | 许可已有外部签署/付款材料提交及独立核验接口。[许可证据][b-license-routes] | 有效签署原件、身份和签章核验、合同指纹及实际付款凭据一致性；保存快照或本人版本确认不能替代外部签署。 |
| R12 | 付款申请、收款附件和实付证据分别保存。[财务路由][b-finance-routes] | 收款资料核验、实际付款与银行/渠道凭据，确认受益主体、金额和时间；上传附件或审核一条申请不表示银行卡已经验证或资金已经到账。 |
| R14 | 奖池须规则和财务分别审核，绑定真实可兑现库存；扣分固定为 300/2700。[奖池发布与库存][b-lottery] | 活动有效期、资格、库存不足暂停、概率公示、奖品履约和补救链。没有已发布有效活动时保持关闭，不显示可抽取承诺。 |
| R16、R21 | 现货和制作审核已有水印/AI 标记核验项，绑定相应源文件或阶段；各交付门槛独立。[现货内容审核][b-stock]、[制作审核][b-production-records]、[制作交付][b-production-workflow] | 使用正式影像核对可播放性、时长、画音、标记、实际授权和交付质量；审核勾选是审核证据，客户端解码不证明每帧水印或成片质量。正式收讫、验收、付款与实际保存分别验收。 |
| R24 | 本地字体、构建和隔离浏览器可检查资源加载与页面排版。[字体引用][a-pubspec]、[最终证据入口](../../testing/evidence/figma-frontend-restore-20261023/index.html) | 真机、弱网和冷启动性能；罕见字、放大字号、不同设备字形与实际素材质量。PC 商业资料和审计页需使用拥有对应真实权限的验收身份，不能给通用 reviewer 放宽权限。 |

## 截图资料与状态缺口（不等于后端未开发）

本轮最后只读探查与复拍见[补验记录](../../testing/evidence/figma-frontend-restore-20261023/followup/extra-final-readonly/index.html)。当前沙箱缺少本人合法原INVITATION、双审退回商品、L2已付补件/通过、拒单全额退款处理中与已核实资料；相关接口或状态实现已存在的部分不重复列为Core新功能，须准备合法隔离资料后复拍。付款结果暂未确定、星探冻结/恢复等也保留映射中的未独立验证标记。

旧内联付款截图保留在补验留档，主图册改用最后独立收银台及原订单新入口实拍。旧兼容商单虽合同NOT_SIGNED但订单已PAID，只证明原合同快照；归档会话真实ARCHIVED但消息为空。不能拿这些资料替代完整设计状态，也不通过改库、制造渠道成功或扩大权限补齐截图。

[b-account-routes]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/http/account-api.js#L123
[b-artist-routes]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/http/artist-routes.js#L27
[b-artists]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/artists/repository.js#L37
[b-artist-service]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/artists/services.js#L17
[b-buyers]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/engagement/buyers.js#L3
[b-engagement-routes]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/http/engagement-routes.js#L7
[b-rankings]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/engagement/rankings.js#L5
[b-engagement-policy]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/engagement/policy.js#L7
[b-notice-routes]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/http/notices-routes.js#L24
[b-notices]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/notices/repository.js#L29
[b-stock-routes]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/http/stock-routes.js#L14
[b-stock]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/stock/repository.js#L19
[b-production-routes]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/http/production-routes.js#L27
[b-production-records]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/production/repository.js#L62
[b-production-policy]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/production/policy.js#L4
[b-production-workflow]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/production/customization-workflow.js#L20
[b-provider]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/production/provider.js#L6
[b-audition-routes]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/http/auditions-routes.js#L3
[b-operations-routes]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/http/business-operations-routes.js#L13
[b-operations]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/operations/repository.js#L22
[b-gig-routes]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/http/gigs-routes.js#L16
[b-trade-routes]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/http/trade-routes.js#L22
[b-trade-policy]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/trade/policy.js#L14
[b-pay-providers]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/trade/providers.js#L23
[b-license-routes]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/http/licensing-routes.js#L16
[b-project-routes]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/http/projects-routes.js#L3
[b-finance-routes]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/http/settlement-routes.js#L21
[b-wallet-routes]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/http/wallet-routes.js#L20
[b-wallet]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/wallet/repository.js#L14
[b-custom-routes]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/http/customization-routes.js#L74
[b-custom-policy]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/customization/policy.js#L18
[b-cocreation-routes]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/http/cocreation-routes.js#L3
[b-privacy-routes]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/http/privacy-routes.js#L14
[b-privacy-policy]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/privacy/policy.js#L3
[b-privacy]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/privacy/repository.js#L26
[b-privacy-execution]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/privacy/execution.js#L52
[b-lottery-policy]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/redemption/lottery-policy.js#L7
[b-lottery]: ../../../晶晶日上工程交接包/01_源码/backend_server/src/modules/redemption/lottery.js#L24
[a-production-widgets]: ../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/production/production_widgets.dart#L84
[a-v5-support]: ../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/stock/v5_support.dart#L83
[a-support]: ../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/support/support_pages.dart#L13
[a-pubspec]: ../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/pubspec.yaml
[w-errors]: ../../../晶晶日上工程交接包/01_源码/frontend_ops_workspace/src/api/errors.ts
[w-editorial]: ../../../晶晶日上工程交接包/01_源码/frontend_ops_workspace/src/styles/editorial.css
